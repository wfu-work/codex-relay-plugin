import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { PLUGIN_ROOT } from "./utils.js";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};
const DASHBOARD_PORT = 3210;

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
  #port = null;
  #listenPort;

  constructor(service, logger, options = {}) {
    this.service = service;
    this.logger = logger;
    this.uiRoot = path.join(PLUGIN_ROOT, "ui");
    this.#listenPort = options.port ?? configuredDashboardPort();
  }

  async start() {
    if (this.#server) return this.url();
    this.#server = http.createServer((request, response) => {
      this.#handle(request, response).catch((error) => {
        this.logger.error("dashboard", "控制台请求失败", { message: error.message });
        this.#json(response, 500, { error: { code: "INTERNAL_ERROR", message: error.message } });
      });
    });
    await new Promise((resolve, reject) => {
      this.#server.once("error", reject);
      this.#server.listen(this.#listenPort, "127.0.0.1", resolve);
    });
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

  status() {
    return { state: this.#server ? "running" : "stopped" };
  }

  async #handle(request, response) {
    const url = new URL(request.url, "http://127.0.0.1");
    this.#securityHeaders(response);
    if (url.pathname.startsWith("/api/")) {
      if (!this.#authorized(request)) return this.#json(response, 401, { error: { code: "UNAUTHORIZED", message: "控制台访问密钥无效" } });
      return this.#api(request, response, url);
    }
    if (!['GET', 'HEAD'].includes(request.method)) return this.#json(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "方法不允许" } });
    const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const file = path.resolve(this.uiRoot, relative);
    const contained = file === this.uiRoot || file.startsWith(`${this.uiRoot}${path.sep}`);
    if (!contained) return this.#json(response, 404, { error: { code: "NOT_FOUND", message: "资源不存在" } });
    try {
      const body = await fs.readFile(file);
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
    if (request.method === "POST" && url.pathname === "/api/app-server/start") {
      return this.#json(response, 200, await this.service.appServer.start());
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
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
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
