import { randomUUID } from "node:crypto";
import { RelayError } from "./errors.js";

const APPROVALS = new Set(["item/commandExecution/requestApproval", "item/fileChange/requestApproval"]);
const INPUTS = new Set(["tool/requestUserInput", "item/tool/requestUserInput"]);
export class PendingInteractions {
  entries = new Map();
  add(message) {
    const existing = [...this.entries.values()].find(entry => entry.backendId === message.id && entry.method === message.method);
    if (existing) return existing;
    const entry = { approvalId: randomUUID(), backendId: message.id, method: message.method, kind: APPROVALS.has(message.method) ? "approval" : INPUTS.has(message.method) ? "userInput" : "desktop", params: message.params || {}, createdAt: new Date().toISOString(), responding: false };
    // Unknown requests belong to the desktop; never relay their arbitrary
    // payload (which can include authentication or MCP-private data).
    if (entry.kind === "desktop") entry.params = { threadId: entry.params.threadId, turnId: entry.params.turnId, itemId: entry.params.itemId };
    if (this.entries.size >= 512) this.entries.delete(this.entries.keys().next().value);
    this.entries.set(entry.approvalId, entry);
    return entry;
  }
  get(id) {
    const entry = this.entries.get(id);
    if (!entry) throw new RelayError("APPROVAL_EXPIRED", "请求已经处理或连接已更新，请刷新任务");
    return entry;
  }
  resolve(requestId, threadId) {
    const resolved = [];
    for (const [id, entry] of this.entries) {
      if (entry.backendId === requestId && (!threadId || entry.params.threadId === threadId)) { this.entries.delete(id); resolved.push(entry); }
    }
    return resolved;
  }
  clearThread(threadId, turnId) {
    const removed = [];
    for (const [id, entry] of this.entries) if (entry.params.threadId === threadId && (!turnId || entry.params.turnId === turnId)) { this.entries.delete(id); removed.push(entry); }
    return removed;
  }
  clear() { const removed = [...this.entries.values()]; this.entries.clear(); return removed; }
  public(entry, config) {
    return { approvalId: entry.approvalId, method: entry.method, kind: entry.kind, params: entry.params, createdAt: entry.createdAt, responding: entry.responding, canRespond: entry.kind !== "desktop" && !config.readOnly && config.permissions?.respondToApprovals === true };
  }
  validateResponse(entry, payload, kind) {
    if (entry.responding) throw new RelayError("APPROVAL_PENDING", "回答已提交，正在等待后端确认");
    if (entry.kind !== kind) throw new RelayError("INVALID_MESSAGE", "响应类型与请求不匹配");
    if (kind === "approval") {
      const allowed = entry.params.availableDecisions?.filter(value => typeof value === "string") || ["accept", "acceptForSession", "decline", "cancel"];
      if (!allowed.includes(payload.decision)) throw new RelayError("INVALID_MESSAGE", "当前请求不支持此审批决定");
      return { decision: payload.decision };
    }
    const questions = entry.params.questions || [];
    const answers = payload.answers;
    if (!answers || typeof answers !== "object" || Array.isArray(answers) || Object.keys(answers).some(id => !questions.some(question => question.id === id))) throw new RelayError("INVALID_MESSAGE", "问题回答格式无效");
    for (const question of questions) {
      const answer = answers[question.id]?.answers;
      if (!Array.isArray(answer) || answer.length === 0 || answer.length > 20 || answer.some(text => typeof text !== "string" || !text.trim() || text.length > 20000)) throw new RelayError("INVALID_MESSAGE", "请完整填写每个问题的回答");
    }
    return { answers };
  }
}
