# 共享执行后端：第三阶段

日期：2026-09-10。范围：macOS 常驻服务、桌面启动入口、保留原数据的切换和回滚。正式运行实例尚未切换。

## 实现

```text
桌面图标 → 官方桌面 → 本地 stdio 启动代理 ─┐
                                            ├→ Unix Socket → 唯一 Codex App Server
Flutter → Relay → 插件 shared 连接 ─────────┘                     ↑
                                                         macOS LaunchAgent
```

- `shared-backend-manager.js`：生成 LaunchAgent 定义、启动并持有 Codex 子进程、状态探测、PID 身份验证、冲突检查、备份、切换和回滚。
- `desktop-proxy.js`：JSONL/Unix WebSocket 传输；先缓存桌面立即发送的 initialize，保持请求 ID、审批响应和通知。连接失败不新建 writer、不重放未确认命令。
- `shared-backend-cli.js`：`service`、`proxy`、`activate`、`status`、`desktop`、`rollback` 入口；与其他插件入口一起打成无需 node_modules 的生产文件。
- `prepare-shared-backend.mjs`：生成独立可审阅的启动包、三个 `.command` 文件与本地 `.app` 启动器；默认只准备文件。`--original-icon` 在显式启用时设置 GUI 启动环境，服务在登录后恢复这些变量。

共享服务读取当前用户登录 Shell 环境，仅在内存中使用；不会把 provider 或 MCP 密钥写入启动包、诊断或日志。Unix Socket 和启动包位于当前用户私有目录。停止代理只关闭其连接；后端异常退出由 launchd 重启，PID 改变后 Relay 使用第二阶段的重连机制。

## 这次发现并修复的问题

1. 桌面直接使用 WebSocket 入口会跳过 `getConfigOverrides()`，丢失 `codex_app` 注入；部分宿主逻辑还以 stdio 为判断条件。因此改为保留桌面原有 stdio 启动路径，通过 `CODEX_CLI_PATH` 指向仅负责连接的代理。
2. 桌面会在 WebSocket 握手前立即写入 initialize。代理必须先建立输入缓冲，否则可能永远等不到初始化响应。
3. 对已加载任务再次 `thread/resume` 不保证替换原 MCP 配置。桌面重启后沿用旧 Socket 会使工具失效。共享服务预置官方 `codex_app` 定义，代理把本次桌面 Socket 原子绑定到稳定私有路径；官方 MCP 客户端断线后会重新连接这个稳定地址。另一个仍存活的桌面实例不得抢占该路径。
4. 桌面关闭时新建的任务可能已经经历 MCP 启动失败。桌面回来后，代理会通过独立短连接请求 `config/mcpServer/reload`，再开放桌面连接；真实测试已确认这类任务无需重建就能恢复工具调用。

## 启用和回滚

启用顺序：检查兼容版本和旧进程 → 备份 → 替换本次插件构建 → 把 Relay 配置改为 shared → 安装服务 → 确认服务就绪。启动包生成时不执行这些操作。

备份包括 sessions、archived_sessions、历史索引、认证、配置、SQLite（含 WAL/SHM 和 sqlite 子目录）、记忆/技能/自动化；另备份 Relay 配置和原插件。可显式包含原 Electron 配置目录，跳过可重新生成的浏览器缓存。备份目录权限为 0700，在停止旧 writer 后复制；支持文件克隆以减少 APFS 上的复制成本。

回滚要求桌面和 Relay 已停止。先停止共享服务，确认其 PID 已退出，再恢复连接字段和原 GUI 环境。历史数据库和 sessions 不覆盖回旧快照，所以切换后新增的数据保留。Relay 的其他设置修改保留；如插件后来再次升级，不覆盖该升级。备份保留供人工恢复。

安装器不会自动杀掉未知进程，也不会在当前正在运行的任务中直接切换。部分目录替换发生中断时保留 `.recodex-new` / `.recodex-previous`，拒绝覆盖并提示检查。

## 验证与边界

最终验证：`npm run check` 的 137 项测试及 Vue 构建通过；生产包 14 个关键文件校验、7 个 MCP 工具冒烟测试通过；`npm run smoke:desktop` 的所有断言通过。生成的本机启动包还通过代理 `--version`、只读状态查询、Apple plist 和 shell 语法检查。测试 LaunchAgent 与临时进程已清理，正式桌面 PID 49189 / 后端 PID 49675 仍运行。

自动验证覆盖真实 macOS LaunchAgent、真实 Codex CLI 0.153.4，以及安装包中的官方 codex-app-tools MCP 程序。桌面 native pipe 的另一端是受控测试夹具，仅提供一个返回标记的只读工具。验证工具配置传递、桌面关闭后后端存活、重开时连接新工具会话、后端崩溃后新 PID 恢复、持久任务读取，以及回滚保留新历史和其他配置。

这不等同于官方桌面 GUI、浏览器、Git、产物视图及全部 MCP 功能完成端到端验收。第一阶段已由用户验证真实桌面共享任务收发；本阶段的新 stdio 启动入口仍需切换时在真实桌面验收。审批/用户提问归属、运行时草稿/队列、取消启动竞争和完整断线补齐属于后续阶段。

兼容性固定于当前桌面版本及 CLI 二进制哈希。macOS `launchctl setenv` 在当前 GUI 登录会话中生效，登录后的启动先后仍可能需要显式启动器协助；不承诺官方应用未来版本继续支持内部启动变量。原图标环境的生成有检查，未在正式登录会话中启用。

参考：[官方 App Server 文档](https://learn.chatgpt.com/docs/app-server)。官方仍将 WebSocket/App Server 相关传输标为实验性。

## 本机已准备产物

启动包：`/Users/wfu/Library/Application Support/Recodex Shared Backend`。
其 manifest 指向原 `CODEX_HOME=/Users/wfu/.codex`、原 Relay 配置和已安装插件目录，并把 `/Users/wfu/Library/Application Support/Codex` 纳入启用前备份。包内状态查询为 `ready=false, pid=null`；尚未注册正式 LaunchAgent、替换正式插件或修改 GUI 环境。

当前还存在其他使用原 home 的 CLI/VS Code/Relay 后端，切换前需核对并结束相应任务；安装器会列出冲突 PID。不能只关闭本次窗口就假设其他 writer 都已退出。
