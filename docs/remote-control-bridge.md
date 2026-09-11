# Remote Control 与桌面桥接

日期：2026-09-11。

插件现在会先探测官方 Remote Control。官方命令可用条件是安装器维护的
`~/.codex/packages/standalone/current/codex`；桌面内置 CLI 或 Homebrew CLI 不满足这个条件。
控制台“运行环境”页和 MCP 工具 `relay_remote_control_status` 会报告安装、daemon 和桥接状态。

当 standalone 已安装时，可调用 `relay_remote_control_start`、`relay_remote_control_pair` 和
`relay_remote_control_stop`，或在控制台执行相同操作。配对码只在调用结果中返回，不写入配置、日志
或 Relay 事件。Remote Control 的 `app-server-control.sock` 被视为官方控制面，插件不会把它误当成
可直接连接的 App Server。

桌面桥接组件 `server/remote-control.js` 中的 `DesktopBridge` 只接受回环 WebSocket 或当前用户拥有的
Unix Socket，并在连接前执行所有权检查；App Server 初始化仍由官方端点完成。当前桌面实例只暴露
`stdio://`，因此状态会显示“等待授权端点”，不会自动注入桌面进程、修改代码签名或创建第二个后端。

本阶段验证：185 项 Node 测试、Vue 生产构建、生产包校验和 11 工具 MCP 冒烟测试通过。当前机器
未安装 standalone，因此官方 Remote Control 状态为“未安装”；Relay 继续使用原有 managed 后端，
历史、配置和桌面进程均未被迁移或停止。
