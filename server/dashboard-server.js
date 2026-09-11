import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { PLUGIN_ROOT } from "./utils.js";
import { EnvironmentService } from "./environment-service.js";
import { MigrationPreparation } from "./migration-preparation.js";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};
const DASHBOARD_PORT = 3210;
const DASHBOARD_COOKIE = "codex_relay_session";
const DASHBOARD_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function configuredDashboardPort() {
  const raw = process.env.CODEX_RELAY_DASHBOARD_PORT?.trim();
  if (!raw) return DASHBOARD_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("CODEX_RELAY_DASHBOARD_PORT 必须是 0 到 65535 之间的整数");
  }
  return port;
}

export class DashboardServer {
  #server = null;
  #accessKey = crypto.randomBytes(24).toString("base64url");
  #sessionTokenHashes = [];
  #port = null;
  #listenPort;
  #sessionFile;

  constructor(service, logger, options = {}) {
    this.service = service;
    this.logger = logger;
    this.uiRoot = path.join(PLUGIN_ROOT, "ui");
    this.#listenPort = options.port ?? configuredDashboardPort();
    this.#sessionFile = path.join(service.configStore.configDir, "dashboard-session.json");
    this.environment = options.environment || new EnvironmentService(service);
    this.preparation = options.preparation || new MigrationPreparation(this.environment.service ? this.environment : { service });
  }

  async start() {
    if (this.#server) return this.url();
    await this.#loadOrCreateSession();
    this.#server = http.createServer((request, response) => {
      this.#handle(request, response).catch((error) => {
        this.logger.error("dashboard", "控制台请求失败", { message: error.message });
        this.#json(response, 500, { error: { code: "INTERNAL_ERROR", message: error.message } });
      });
    });
    try {
      await new Promise((resolve, reject) => {
        this.#server.once("error", reject);
        this.#server.listen(this.#listenPort, "127.0.0.1", resolve);
      });
    } catch (error) {
      // A previous plugin process may still own the legacy fixed port while
      // its MCP transport is draining. Use an ephemeral local port so the new
      // owner can start immediately; runtime.json publishes the actual port.
      if (error.code !== "EADDRINUSE" || this.#listenPort === 0) {
        this.#server = null;
        throw error;
      }
      await new Promise((resolve) => this.#server.close(resolve));
      this.#server = null;
      this.#listenPort = 0;
      return this.start();
    }
    this.#port = this.#server.address().port;
    this.logger.info("dashboard", "本地配置控制台已启动", { port: this.#port });
    return this.url();
  }

  async stop() {
    if (!this.#server) return;
    const server = this.#server;
    this.#server = null;
    await new Promise((resolve) => server.close(resolve));
    this.#port = null;
  }

  url() {
    return this.#port ? `http://127.0.0.1:${this.#port}/#key=${this.#accessKey}` : null;
  }

  connectionInfo() {
    return this.#port
      ? { port: this.#port, accessKey: this.#accessKey, url: this.url() }
      : null;
  }

  status() {
    return { state: this.#server ? "running" : "stopped" };
  }

  async #handle(request, response) {
    const url = new URL(request.url, "http://127.0.0.1");
    this.#securityHeaders(response);
    if (url.pathname.startsWith("/api/")) {
      const auth = this.#authorized(request);
      if (!auth.ok) return this.#json(response, 401, { error: { code: "UNAUTHORIZED", message: "控制台访问密钥无效" } });
      if (auth.viaBootstrap) this.#setSessionCookie(response);
      return this.#api(request, response, url);
    }
    if (!['GET', 'HEAD'].includes(request.method)) return this.#json(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "方法不允许" } });
    const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const file = path.resolve(this.uiRoot, relative);
    const contained = file === this.uiRoot || file.startsWith(`${this.uiRoot}${path.sep}`);
    if (!contained) return this.#json(response, 404, { error: { code: "NOT_FOUND", message: "资源不存在" } });
    try {
      const body = await fs.readFile(file);
      // The dashboard is bound to loopback and is commonly opened directly
      // as http://127.0.0.1:3210. In that flow there is no bootstrap key in
      // the URL fragment, so establish a fresh HttpOnly local session while
      // serving the app shell. This also recovers tabs that retain a stale
      // sessionStorage key after the plugin restarts; API authorization will
      // fall back to the newly issued cookie.
      if (!this.#authorized(request).ok) this.#setSessionCookie(response);
      response.writeHead(200, {
        "Content-Type": CONTENT_TYPES[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      if (request.method === "HEAD") return response.end();
      response.end(body);
    } catch (error) {
      if (error.code === "ENOENT") return this.#json(response, 404, { error: { code: "NOT_FOUND", message: "资源不存在" } });
      throw error;
    }
  }

  async #api(request, response, url) {
    if (url.pathname.startsWith("/api/environment/migration/")) {
      try {
        if (request.method === "GET" && url.pathname === "/api/environment/migration/status") return this.#json(response, 200, await this.preparation.status());
        if (request.method === "POST" && ["/api/environment/migration/check", "/api/environment/migration/prepare", "/api/environment/migration/verify-desktop", "/api/environment/migration/repair-runtime"].includes(url.pathname)) {
          const body = await this.#body(request);
          return this.#json(response, 202, await this.preparation.start(url.pathname.split("/").at(-1), body.requestId));
        }
        if (request.method === "POST" && url.pathname === "/api/environment/migration/cancel") {
          const body = await this.#body(request);
          return this.#json(response, 200, await this.preparation.cancel(body.id));
        }
        if (request.method === "POST" && url.pathname === "/api/environment/migration/activate") return this.#json(response, 409, { error: { code: "MIGRATION_NOT_READY", message: "请先完成桌面工具兼容性验收，当前准备包不能正式切换" } });
      } catch (error) {
        const known = ["INVALID_JOB", "MIGRATION_BUSY"].includes(error.code);
        return this.#json(response, known ? error.code === "INVALID_JOB" ? 400 : 409 : 500, { error: { code: known ? error.code : "PREPARATION_FAILED", message: known ? error.message : "无法读取或提交迁移准备，请刷新后重试" } });
      }
    }
    if (request.method === "GET" && url.pathname === "/api/environment") {
      return this.#json(response, 200, await this.environment.inspect());
    }
    if (request.method === "GET" && url.pathname === "/api/remote-control") {
      return this.#json(response, 200, await this.service.remoteControlStatus());
    }
    if (request.method === "POST" && url.pathname === "/api/remote-control/install") {
      try { return this.#json(response, 200, await this.service.remoteControlInstall()); }
      catch (error) {
        const known = ["REMOTE_CONTROL_INSTALL_BUSY", "REMOTE_CONTROL_INSTALL_URL_INVALID", "REMOTE_CONTROL_INSTALL_DOWNLOAD_FAILED", "REMOTE_CONTROL_INSTALL_SCRIPT_INVALID", "REMOTE_CONTROL_INSTALL_FAILED", "REMOTE_CONTROL_INSTALL_TIMEOUT", "REMOTE_CONTROL_INSTALL_INCOMPLETE"].includes(error.code);
        return this.#json(response, known ? 409 : 500, { error: { code: known ? error.code : "REMOTE_CONTROL_INSTALL_FAILED", message: known ? error.message : "官方 standalone 安装失败，请稍后重试" } });
      }
    }
    if (request.method === "POST" && url.pathname === "/api/remote-control/start") {
      try { return this.#json(response, 200, await this.service.remoteControlStart()); }
      catch (error) { return this.#json(response, 409, { error: { code: error.code || "REMOTE_CONTROL_FAILED", message: error.message } }); }
    }
    if (request.method === "POST" && url.pathname === "/api/remote-control/stop") {
      try { return this.#json(response, 200, await this.service.remoteControlStop()); }
      catch (error) { return this.#json(response, 409, { error: { code: error.code || "REMOTE_CONTROL_FAILED", message: error.message } }); }
    }
    if (request.method === "POST" && url.pathname === "/api/remote-control/pair") {
      try { return this.#json(response, 200, await this.service.remoteControlPair()); }
      catch (error) { return this.#json(response, 409, { error: { code: error.code || "REMOTE_CONTROL_FAILED", message: error.message } }); }
    }
    if (request.method === "POST" && url.pathname === "/api/environment/check") {
      return this.#json(response, 200, await this.environment.inspect(true));
    }
    if (request.method === "POST" && url.pathname === "/api/environment/repair-executable") {
      try {
        const body = await this.#body(request);
        const result = await this.environment.repairExecutable({ configured: body.configured, candidate: body.candidate });
        return this.#json(response, 200, result);
      } catch (error) {
        const known = ["ENVIRONMENT_BUSY", "ENVIRONMENT_CHANGED", "REPAIR_NOT_AVAILABLE"].includes(error.code);
        return this.#json(response, known ? 409 : 500, { error: { code: known ? error.code : "ENVIRONMENT_REPAIR_FAILED", message: known ? error.message : "执行路径修复失败，请重新检查环境" } });
      }
    }
    if (request.method === "GET" && url.pathname === "/api/config") {
      return this.#json(response, 200, await this.service.configStore.publicConfig({ includeToken: true }));
    }
    if (request.method === "GET" && url.pathname === "/api/status") {
      return this.#json(response, 200, await this.service.status());
    }
    if (request.method === "GET" && url.pathname === "/api/logs") {
      return this.#json(response, 200, { logs: this.service.logger.list(Number(url.searchParams.get("limit") || 100)) });
    }
    if (request.method === "GET" && url.pathname === "/api/diagnostics") {
      return this.#json(response, 200, await this.service.diagnostics());
    }
    if (request.method === "PUT" && url.pathname === "/api/config") {
      const body = await this.#body(request);
      const credential = body.credential || (
        body.token !== undefined || body.endpointGrant !== undefined || body.grantExpiresAt !== undefined || body.tokenEndpoint !== undefined
          ? {
              ...(body.token !== undefined ? { connectToken: body.token } : {}),
              ...(body.endpointGrant !== undefined ? { endpointGrant: body.endpointGrant } : {}),
              ...(body.grantExpiresAt !== undefined ? { grantExpiresAt: body.grantExpiresAt } : {}),
              ...(body.tokenEndpoint !== undefined ? { tokenEndpoint: body.tokenEndpoint } : {}),
            }
          : undefined
      );
      await this.service.updateConfig(body.config || {}, credential);
      const config = await this.service.configStore.publicConfig({ includeToken: true });
      return this.#json(response, 200, config);
    }
    if (request.method === "POST" && url.pathname === "/api/connection/test") {
      return this.#json(response, 200, await this.service.testConnection());
    }
    if (request.method === "POST" && url.pathname === "/api/connection/connect") {
      return this.#json(response, 200, await this.service.connect());
    }
    if (request.method === "POST" && url.pathname === "/api/connection/disconnect") {
      return this.#json(response, 200, await this.service.disconnect());
    }
    if (request.method === "POST" && url.pathname === "/api/connection/reconnect") {
      try { return this.#json(response, 200, await this.service.reconnectRelay()); }
      catch (error) { return this.#json(response, 409, { error: { code: error.code || "RELAY_RECONNECT_FAILED", message: error.message } }); }
    }
    if (request.method === "POST" && url.pathname === "/api/app-server/start") {
      return this.#json(response, 200, await this.service.appServer.start());
    }
    if (request.method === "POST" && url.pathname === "/api/app-server/restart") {
      try { return this.#json(response, 200, await this.service.restartAppServerConnection()); }
      catch (error) { return this.#json(response, 409, { error: { code: error.code || "APP_SERVER_RESTART_FAILED", message: error.message } }); }
    }
    if (request.method === "POST" && url.pathname === "/api/app-server/stop") {
      await this.service.appServer.stop();
      return this.#json(response, 200, this.service.appServer.status());
    }
    if (request.method === "DELETE" && url.pathname === "/api/logs") {
      this.service.logger.clear();
      return this.#json(response, 200, { ok: true });
    }
    return this.#json(response, 404, { error: { code: "NOT_FOUND", message: "API 不存在" } });
  }

  #authorized(request) {
    const authorization = request.headers.authorization || "";
    const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    const expected = Buffer.from(this.#accessKey);
    const actual = Buffer.from(supplied);
    const viaBootstrap = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
    if (viaBootstrap) return { ok: true, viaBootstrap };

    const cookies = request.headers.cookie || "";
    const session = cookies.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${DASHBOARD_COOKIE}=`));
    const cookieValue = session ? decodeURIComponent(session.slice(DASHBOARD_COOKIE.length + 1)) : "";
    const suppliedHash = crypto.createHash("sha256").update(cookieValue).digest("hex");
    const actualHash = Buffer.from(suppliedHash, "hex");
    const viaCookie = this.#sessionTokenHashes.some((expected) => {
      const expectedHash = Buffer.from(expected, "hex");
      return expectedHash.length === actualHash.length && crypto.timingSafeEqual(expectedHash, actualHash);
    });
    return { ok: viaCookie, viaBootstrap: false };
  }

  #setSessionCookie(response) {
    response.setHeader("Set-Cookie", `${DASHBOARD_COOKIE}=${this.#sessionToken}; Max-Age=${DASHBOARD_COOKIE_MAX_AGE}; Path=/; HttpOnly; SameSite=Strict`);
  }

  #sessionToken;

  async #loadOrCreateSession() {
    let hashes = [];
    try {
      const saved = JSON.parse(await fs.readFile(this.#sessionFile, "utf8"));
      hashes = Array.isArray(saved?.tokenHashes) ? saved.tokenHashes : [];
      if (typeof saved?.token === "string" && saved.token.length >= 32) hashes.push(crypto.createHash("sha256").update(saved.token).digest("hex"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    this.#sessionToken = crypto.randomBytes(32).toString("base64url");
    this.#sessionTokenHashes = [...new Set([...hashes.filter((value) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value)), crypto.createHash("sha256").update(this.#sessionToken).digest("hex")])].slice(-8);
    await fs.mkdir(path.dirname(this.#sessionFile), { recursive: true, mode: 0o700 });
    await fs.writeFile(this.#sessionFile, `${JSON.stringify({ version: 1, tokenHashes: this.#sessionTokenHashes })}\n`, { mode: 0o600 });
  }

  async #body(request) {
    let size = 0;
    const chunks = [];
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 256 * 1024) throw new Error("请求内容超过 256 KiB 限制");
      chunks.push(chunk);
    }
    if (!chunks.length) return {};
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }

  #json(response, status, payload) {
    if (response.headersSent) return;
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify(payload));
  }

  #securityHeaders(response) {
    response.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  }
}
