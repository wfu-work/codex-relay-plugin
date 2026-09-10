# 共享执行后端：第五阶段进度

日期：2026-09-10。

本阶段完成了 Flutter macOS Release 构建、插件生产包重建和本机未激活启动包刷新。验证结果：Flutter 完整测试 128 项通过，`flutter analyze` 无问题；插件 Node 测试 151 项通过，生产构建、14 文件校验和 MCP 冒烟通过，真实 Codex 交互冒烟通过。

正式激活已执行安全预检但被拒绝。当前仍有多个进程使用目标 `/Users/wfu/.codex` 或旧 Relay 配置：官方桌面 PID 49189、官方后端 PID 49675、旧 Relay/后端 PID 27135/27141，以及 VS Code、插件和其他 CLI 实例。激活器的 `assertStopped` 会拒绝这些冲突，避免两个 App Server 同时写同一历史数据库、重复消费同一命令或破坏当前任务。

当前交付物：

- macOS Release：`build/macos/Build/Products/Release/recodex.app`
- 启动包：`/Users/wfu/Library/Application Support/Recodex Shared Backend`
- 启动包状态：`ready=false, pid=null`，没有 `activation.json`
- 生产插件已同步到启动包，尚未替换正式安装实例

下一次切换需要在所有使用该 `CODEX_HOME` 的桌面、Relay、CLI 和 VS Code Codex 任务都结束后运行“启用共享后端.command”。切换会备份历史和配置、安装共享服务、等待后端就绪，再启动桌面；当前正式进程不会被本阶段强制终止。
