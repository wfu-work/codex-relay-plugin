import { RelayError } from "./errors.js";

// Only expose composer state, never collaboration-mode developer instructions
// or arbitrary config from a resume response.
export function composerSettings(value) {
  const source = value?.threadSettings && typeof value.threadSettings === "object"
    ? value.threadSettings
    : value;
  if (!source || typeof source.model !== "string") return null;
  const settings = { model: source.model, effort: source.effort ?? source.reasoningEffort ?? null };
  for (const key of ["approvalPolicy", "approvalsReviewer", "activePermissionProfile"]) {
    if (source[key] !== undefined) settings[key] = source[key];
  }
  if (source.sandboxPolicy || source.sandbox) settings.sandboxPolicy = source.sandboxPolicy || source.sandbox;
  return settings;
}

export function composerSettingsPatch(command, config) {
  const patch = {};
  for (const key of ["model", "effort"]) {
    if (!Object.hasOwn(command, key)) continue;
    if (typeof command[key] !== "string" || !command[key].trim() || command[key].length > 256) {
      throw new RelayError("INVALID_MESSAGE", `${key} 必须为非空字符串`);
    }
    patch[key] = command[key].trim();
  }
  if (Object.hasOwn(command, "permissionMode")) {
    if (!config.permissions.respondToApprovals) {
      throw new RelayError("COMMAND_NOT_ALLOWED", "远程权限 respondToApprovals 未启用，不能修改任务权限");
    }
    const modes = {
      "默认权限": { permissions: ":workspace", approvalPolicy: "on-request", approvalsReviewer: "user" },
      "自动审查": { permissions: ":workspace", approvalPolicy: "on-request", approvalsReviewer: "auto_review" },
      "完全访问权限": { permissions: ":danger-full-access", approvalPolicy: "never", approvalsReviewer: "user" },
      "只读权限": { permissions: ":read-only", approvalPolicy: "on-request", approvalsReviewer: "user" },
    };
    if (!Object.hasOwn(modes, command.permissionMode)) throw new RelayError("INVALID_MESSAGE", "不支持的权限模式");
    Object.assign(patch, modes[command.permissionMode]);
  }
  if (!Object.keys(patch).length) throw new RelayError("INVALID_MESSAGE", "没有可更新的任务设置");
  return patch;
}
