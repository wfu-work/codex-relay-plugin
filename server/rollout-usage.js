const FIELDS = {
  inputTokens: "input_tokens",
  outputTokens: "output_tokens",
  totalTokens: "total_tokens",
  cachedInputTokens: "cached_input_tokens",
  reasoningOutputTokens: "reasoning_output_tokens",
};
const REQUIRED = ["inputTokens", "outputTokens", "totalTokens"];

function usage(value) {
  if (!value || typeof value !== "object") return null;
  const result = {};
  for (const [key, snake] of Object.entries(FIELDS)) {
    const count = value[snake] ?? value[key];
    if (count === undefined && !REQUIRED.includes(key)) continue;
    // Some Codex/model combinations publish only a total counter. Preserve
    // that information for diagnostics and UI display; exact per-turn deltas
    // still require all three required counters below.
    if (count === undefined && REQUIRED.includes(key)) continue;
    if (!Number.isSafeInteger(count) || count < 0) return null;
    result[key] = count;
  }
  if (!REQUIRED.some((key) => result[key] !== undefined)) return null;
  return result;
}

/** The journal repeats cumulative snapshots for rate-limit updates. Derive a
 * turn total from its starting counter, never by summing last-call snapshots.
 * Keep accounting state outside the wire projection of each turn.
 */
export class RolloutUsage {
  #total = null;
  #turns = new Map();

  start(turn, modelContextWindow) {
    this.#turns.set(turn.id, { baseline: this.#total, invalid: false,
      modelContextWindow: contextWindow(modelContextWindow) });
    while (this.#turns.size > 12) this.#turns.delete(this.#turns.keys().next().value);
  }

  update(turn, info, updatedAt) {
    // Journal token_count rows wrap counters in total_token_usage, while
    // some terminal responses expose the counters directly (or under total).
    const total = usage(info?.total_token_usage ?? info?.total ?? info);
    if (!total) return false;
    const last = usage(info?.last_token_usage ?? info?.last);
    if (!turn) { this.#total = total; return false; }
    const state = this.#turns.get(turn.id);
    if (!state) return false;
    const previous = JSON.stringify([turn.turnUsage, turn.tokenUsage]);
    // A fresh journal can inherit context/counters. Zero is a valid starting
    // counter only when the first total equals the first model call.
    if (!state.baseline && !state.invalid && last &&
        REQUIRED.every((key) => total[key] === last[key])) {
      state.baseline = Object.fromEntries(Object.keys(total).map((key) => [key, 0]));
    }
    if (this.#total && REQUIRED.some((key) => total[key] < this.#total[key])) {
      state.invalid = true;
    }
    this.#total = total;
    const limit = info?.model_context_window ?? info?.modelContextWindow;
    if (limit !== undefined && limit !== null) state.modelContextWindow = contextWindow(limit);
    turn.tokenUsage = { total, ...(last ? { last } : {}),
      ...(state.modelContextWindow ? { modelContextWindow: state.modelContextWindow } : {}),
      ...(turn.tokenUsage?.updatedAt ? { updatedAt: turn.tokenUsage.updatedAt } : {}),
    };
    if (state.baseline && !state.invalid) {
      const delta = {};
      for (const [key, value] of Object.entries(total)) {
        const baseline = state.baseline[key];
        if (baseline !== undefined && value >= baseline) delta[key] = value - baseline;
      }
      if (REQUIRED.every((key) => delta[key] !== undefined)) turn.turnUsage = delta;
      else state.invalid = true;
    }
    // A reset or incomplete baseline cannot support an exact per-turn figure.
    if (state.invalid) delete turn.turnUsage;
    const changed = previous !== JSON.stringify([turn.turnUsage, turn.tokenUsage]);
    // Preserve sample time across history/live reads. Repeated rate-limit
    // snapshots do not advance it or generate redundant notifications.
    if (changed && typeof updatedAt === "string" && Number.isFinite(Date.parse(updatedAt))) {
      turn.tokenUsage.updatedAt = updatedAt;
    }
    return changed;
  }
}

function contextWindow(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
