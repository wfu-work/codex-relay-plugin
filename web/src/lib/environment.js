export function environmentIsStale(environment, now = Date.now(), failed = false) {
  if (!environment || failed) return true;
  const checked = Date.parse(environment.checkedAt);
  return !Number.isFinite(checked) || !Number.isFinite(environment.staleAfterMs) || now - checked > environment.staleAfterMs;
}

export const migrationPhaseLabels = {
  preparing: '准备迁移', waiting_for_saved_reply: '等待当前任务结束', stopping_old_processes: '停止旧进程',
  backing_up_and_activating: '备份与启用共享服务', starting_shared_clients: '启动桌面与插件',
  verifying_shared_runtime: '验证两端连接与桌面工具', recovering: '恢复原模式', failed: '迁移未完成', complete: '迁移完成',
};

export function describeEnvironmentError(value) {
  const text = String(value || '');
  if (/ENOENT|找不到.*codex/i.test(text)) return '找不到 Codex 程序或工作目录。请检查执行路径和默认工作目录。';
  if (/active writer/i.test(text)) return '该任务已被另一个执行后端占用。需要验证桌面和插件是否共用后端。';
  if (/untrusted-code-signing-identity|签名/i.test(text)) return '桌面拒绝了工具进程的签名；共享模式兼容性验证未通过。';
  return text;
}
