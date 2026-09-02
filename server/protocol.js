import { RelayError } from "./errors.js";
import { nowIso, randomId } from "./utils.js";
import { relayEndpointId, relaySpaceId } from "./config-store.js";

export const PROTOCOL_VERSION = 1;

export function validateRelayWelcome(message) {
  if (!message || typeof message !== "object" || message.type !== "connect.welcome") {
    throw new RelayError("INVALID_MESSAGE", "Relay welcome 消息无效");
  }
  if (message.version !== PROTOCOL_VERSION) {
    throw new RelayError("PROTOCOL_VERSION_UNSUPPORTED", "Relay 返回了不兼容的协议版本");
  }
  if (!message.connectionId || typeof message.connectionId !== "string") {
    throw new RelayError("INVALID_MESSAGE", "Relay welcome 缺少 connectionId");
  }
  if (!message.sessionId || !message.spaceId || !message.endpointId) {
    throw new RelayError("INVALID_MESSAGE", "Protocol v1 welcome 缺少 sessionId、spaceId 或 endpointId");
  }
  if (!Number.isSafeInteger(message.maxFrameSize) || message.maxFrameSize <= 0) {
    throw new RelayError("INVALID_MESSAGE", "Protocol v1 welcome 缺少有效 maxFrameSize");
  }
  return message;
}

const PRODUCT_FRAME_TYPES = new Set(["codex.command", "codex.command.result", "codex.event", "host.snapshot"]);

// Relay v1 routes a small, stable envelope and leaves product payloads opaque.
// The helper keeps the Codex command/event model independent from the transport.
export function wrapRelayFrame(message, config) {
  if (!message || typeof message !== "object" || message.type === "stream.message") return message;
  if (!PRODUCT_FRAME_TYPES.has(message.type)) return message;
  return {
    version: PROTOCOL_VERSION,
    type: "stream.message",
    messageId: message.messageId || randomId("msg"),
    streamId: message.streamId || "codex",
    sequence: Number.isInteger(message.sequence) ? message.sequence : undefined,
    // Relay's directed-routing key is the authenticated Endpoint ID. The
    // legacy host deviceId remains product metadata, but must not be used as
    // the transport-level source/target identity.
    from: relayEndpointId(config.relay),
    ...(message.targetDeviceId ? { to: message.targetDeviceId } : {}),
    protocol: "codex.v1",
    encrypted: false,
    payload: message,
  };
}

export function unwrapRelayFrame(message) {
  if (!message || message.type !== "stream.message" || !message.payload || typeof message.payload !== "object") return message;
  const payload = { ...message.payload };
  if (message.from) payload.deviceId = message.from;
  if (message.to) payload.targetDeviceId = message.to;
  return payload;
}

export const COMMAND_PERMISSIONS = Object.freeze({
  "host.get_status": "readThreads",
  "model.list": "readThreads",
  "thread.list": "readThreads",
  "thread.read": "readThreads",
  "thread.create": "createThreads",
  "thread.resume": "readThreads",
  "thread.select": "readThreads",
  "turn.start": "sendMessages",
  "turn.steer": "steerTurns",
  "turn.interrupt": "interruptTurns",
  "approval.respond": "respondToApprovals",
  "sync.request": "readThreads",
  ping: null,
});

export function validateRelayCommand(message, config) {
  if (!message || typeof message !== "object") throw new RelayError("INVALID_MESSAGE", "命令必须是 JSON 对象");
  if (message.version !== PROTOCOL_VERSION) throw new RelayError("PROTOCOL_VERSION_UNSUPPORTED", "不支持的协议版本");
  if (message.type !== "codex.command") throw new RelayError("INVALID_MESSAGE", "消息类型必须是 codex.command");
  if (!message.requestId || typeof message.requestId !== "string") throw new RelayError("INVALID_MESSAGE", "缺少 requestId");
  if (!message.deviceId || typeof message.deviceId !== "string") throw new RelayError("INVALID_MESSAGE", "缺少发送端 deviceId");
  if (message.targetDeviceId !== relayEndpointId(config.relay)) throw new RelayError("DEVICE_NOT_TARGETED", "命令未发送给本机接入端");
  if (message.spaceId !== relaySpaceId(config.relay)) throw new RelayError("SPACE_NOT_JOINED", "命令 Space 与本机配置不一致");
  const commandType = message.command?.type;
  if (!Object.hasOwn(COMMAND_PERMISSIONS, commandType)) {
    throw new RelayError("COMMAND_NOT_ALLOWED", `不支持的命令：${commandType || "unknown"}`);
  }
  const timestamp = Date.parse(message.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) {
    throw new RelayError("MESSAGE_EXPIRED", "命令时间戳无效或已过期");
  }
  const permission = COMMAND_PERMISSIONS[commandType];
  if (config.readOnly && !["host.get_status", "model.list", "thread.list", "thread.read", "sync.request", "ping"].includes(commandType)) {
    throw new RelayError("COMMAND_NOT_ALLOWED", "插件当前处于只读模式");
  }
  if (permission && !config.permissions[permission]) {
    throw new RelayError("COMMAND_NOT_ALLOWED", `远程权限 ${permission} 未启用`);
  }
  return message;
}

export function eventEnvelope(config, buffer, event, context = {}) {
  return buffer.push({
    version: PROTOCOL_VERSION,
    type: "codex.event",
    eventId: randomId("evt"),
    deviceId: config.relay.deviceId,
    spaceId: relaySpaceId(config.relay),
    sequence: buffer.nextSequence(),
    timestamp: nowIso(),
    ...(context.threadId ? { threadId: context.threadId } : {}),
    ...(context.turnId ? { turnId: context.turnId } : {}),
    event,
  });
}

export function commandResult(config, requestId, result, targetDeviceId) {
  return {
    version: PROTOCOL_VERSION,
    type: "codex.command.result",
    requestId,
    deviceId: config.relay.deviceId,
    spaceId: relaySpaceId(config.relay),
    ...(targetDeviceId ? { targetDeviceId } : {}),
    timestamp: nowIso(),
    success: true,
    result,
  };
}

export function commandError(config, requestId, error, targetDeviceId) {
  return {
    version: PROTOCOL_VERSION,
    type: "codex.command.result",
    requestId: requestId || randomId("invalid"),
    deviceId: config.relay.deviceId,
    spaceId: relaySpaceId(config.relay),
    ...(targetDeviceId ? { targetDeviceId } : {}),
    timestamp: nowIso(),
    success: false,
    error: {
      code: error.code || "INTERNAL_ERROR",
      message: error.message || "未知错误",
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
}

export function normalizeCodexNotification(method, params = {}) {
  const map = {
    "thread/started": "thread.created",
    "thread/status/changed": "thread.updated",
    "thread/statusChanged": "thread.updated",
    "thread/status_changed": "thread.updated",
    "turn/started": "turn.started",
    "turn/completed": "turn.completed",
    "turn/failed": "turn.failed",
    "turn/aborted": "turn.interrupted",
    "turn/interrupted": "turn.interrupted",
    "turn/status/changed": "thread.updated",
    "processing/heartbeat": "turn.heartbeat",
    "item/agentMessage/delta": "message.assistant.delta",
    "item/agentMessage/textDelta": "message.assistant.delta",
    "item/agentMessage/text/delta": "message.assistant.delta",
    "item/agent_message/delta": "message.assistant.delta",
    "item/agent_message/text/delta": "message.assistant.delta",
    "item/agent_message/text_delta": "message.assistant.delta",
    "item/reasoning/summaryTextDelta": "reasoning.delta",
    "item/reasoning/textDelta": "reasoning.delta",
    "item/reasoning/summaryText/delta": "reasoning.delta",
    "item/reasoning/summary_text_delta": "reasoning.delta",
    "item/commandExecution/outputDelta": "tool.output",
    "item/commandExecution/output/delta": "tool.output",
    "item/command_execution/output_delta": "tool.output",
    "item/fileChange/outputDelta": "diff.updated",
    "item/fileChange/output/delta": "diff.updated",
    "item/file_change/output_delta": "diff.updated",
    "item/started": "item.started",
    "item/updated": "item.updated",
    "item/completed": "item.completed",
    error: "error",
  };
  // App Server method spelling changed slightly across releases (camelCase,
  // snake_case, dotted names). Compare a separator-insensitive key so all of
  // those forms continue to produce the same streaming event type.
  const methodKey = normalizeNotificationMethod(method);
  const type =
    map[method] ||
    Object.entries(map).find(([name]) => normalizeNotificationMethod(name) === methodKey)?.[1] ||
    inferStreamingNotificationType(methodKey);
  if (!type) return null;
  return {
    type,
    sourceMethod: method,
    data: params,
  };
}

function normalizeNotificationMethod(method) {
  return String(method)
    .trim()
    .toLowerCase()
    // Dots and hyphens are alternate path separators; underscores are merely
    // casing separators (`agent_message` == `agentMessage`).
    .replace(/[.-]+/g, "/")
    .replace(/\/+/g, "/")
    .replaceAll("_", "");
}

// Codex App Server occasionally adds a more specific suffix to an item
// notification before the plugin is updated. Keep the allow-list narrow, but
// infer the four streaming families from their stable path segments so a new
// `.../contentDelta` spelling cannot stop the answer stream altogether.
function inferStreamingNotificationType(methodKey) {
  if (!methodKey.endsWith("delta")) return null;
  if (methodKey.includes("item/agentmessage/") || methodKey.includes("item/assistant/")) {
    return "message.assistant.delta";
  }
  if (methodKey.includes("item/reasoning/")) return "reasoning.delta";
  if (methodKey.includes("item/commandexecution/") || methodKey.includes("item/tool/")) {
    return "tool.output";
  }
  if (methodKey.includes("item/filechange/") || methodKey.includes("item/diff/")) {
    return "diff.updated";
  }
  return null;
}

export function extractContext(params = {}) {
  const thread = params.thread || {};
  const turn = params.turn || {};
  const item = params.item || {};
  return {
    threadId: params.threadId || params.thread_id || params.thread?.id || params.thread?.threadId || params.thread?.thread_id || thread.id || thread.threadId || thread.thread_id || item.threadId || item.thread_id,
    turnId: params.turnId || params.turn_id || params.turn?.id || params.turn?.turnId || params.turn?.turn_id || turn.id || turn.turnId || turn.turn_id || item.turnId || item.turn_id,
  };
}
