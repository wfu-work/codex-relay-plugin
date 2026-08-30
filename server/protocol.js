import { RelayError } from "./errors.js";
import { nowIso, randomId } from "./utils.js";
import { relaySpaceId } from "./config-store.js";

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
    from: config.relay.deviceId,
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
  if (message.targetDeviceId !== config.relay.deviceId) throw new RelayError("DEVICE_NOT_TARGETED", "命令未发送给本机设备");
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
  if (config.readOnly && !["host.get_status", "thread.list", "thread.read", "sync.request", "ping"].includes(commandType)) {
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
    "turn/started": "turn.started",
    "turn/completed": "turn.completed",
    "turn/failed": "turn.failed",
    "turn/aborted": "turn.interrupted",
    "item/agentMessage/delta": "message.assistant.delta",
    "item/reasoning/summaryTextDelta": "reasoning.delta",
    "item/commandExecution/outputDelta": "tool.output",
    "item/fileChange/outputDelta": "diff.updated",
    "item/started": "item.started",
    "item/completed": "item.completed",
    error: "error",
  };
  const type = map[method];
  if (!type) return null;
  return {
    type,
    sourceMethod: method,
    data: params,
  };
}

export function extractContext(params = {}) {
  return {
    threadId: params.threadId || params.thread?.id,
    turnId: params.turnId || params.turn?.id,
  };
}
