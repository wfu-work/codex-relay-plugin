// The rollout journal stores TurnItem variants, not raw model responses.
// Only project public transcript fields; never forward session instructions,
// encrypted reasoning, or arbitrary response/tool payloads from the journal.
export function rolloutItem(item) {
  if (!item || typeof item.id !== "string") return null;
  const common = { id: item.id };
  switch (item.type) {
    case "UserMessage":
      return { ...common, type: "userMessage", content: (item.content || []).flatMap((part) => {
        if (part.type === "text") return [{ type: "text", text: text(part.text) }];
        if (part.type === "local_image") return [{ type: "localImage", path: part.path }];
        if (part.type === "image") return [{ type: "image", url: part.image_url }];
        return [];
      }) };
    case "AgentMessage":
      return { ...common, type: "agentMessage", phase: item.phase,
        text: text((item.content || []).filter((part) => part.type === "Text").map((part) => part.text).join("")) };
    case "Reasoning":
      return { ...common, type: "reasoning", summary: (item.summary_text || []).map(text), content: [] };
    case "CommandExecution":
      return { ...common, type: "commandExecution", command: text(Array.isArray(item.command) ? item.command.join(" ") : item.command),
        cwd: item.cwd, status: item.status, aggregatedOutput: text(item.aggregated_output),
        exitCode: item.exit_code, durationMs: duration(item.duration) };
    case "McpToolCall":
      return { ...common, type: "mcpToolCall", server: item.server, tool: item.tool, status: item.status,
        result: { content: (item.result?.content || []).filter((part) => part.type === "text")
          .map((part) => ({ type: "text", text: text(part.text) })) }, durationMs: duration(item.duration) };
    case "FileChange":
      return { ...common, type: "fileChange", status: item.status,
        changes: Object.entries(item.changes || {}).slice(0, 128).map(([path, change]) => ({
          path, kind: { type: change.type, move_path: change.move_path }, diff: text(change.unified_diff),
        })) };
    default:
      return null;
  }
}

function text(value) {
  if (typeof value !== "string") return "";
  return value.length > 32_768 ? `${value.slice(0, 32_768)}\n…（历史输出已截断）` : value;
}

function duration(value) {
  return value && Number.isFinite(value.secs)
    ? Math.round(value.secs * 1000 + (value.nanos || 0) / 1e6) : null;
}
