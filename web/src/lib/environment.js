export function environmentIsStale(environment, now = Date.now(), failed = false) {
  if (!environment || failed) return true;
  const checked = Date.parse(environment.checkedAt);
  return !Number.isFinite(checked) || !Number.isFinite(environment.staleAfterMs) || now - checked > environment.staleAfterMs;
}


export function describeEnvironmentError(value) {
  const text = String(value || '');
  if (/ENOENT|找不到.*codex/i.test(text)) return '找不到 Codex 程序或工作目录。请检查执行路径和默认工作目录。';
  if (/active writer/i.test(text)) return '该任务已被另一个执行后端占用，请停止重复运行的 Codex App Server。';
  return text;
}
