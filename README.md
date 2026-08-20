<p align="center">
  <img src="./assets/codex-relay-logo.svg" width="112" height="112" alt="Codex Relay Logo" />
</p>

<h1 align="center">Codex Relay Plugin</h1>

一个本机 Codex 插件：通过用户配置的 Relay 建立出站 WebSocket，把 Codex App Server 的会话事件实时转发到远端，并把手机端命令转换为受权限控制的 Codex 操作。

本仓库只包含 Codex 插件。Relay 服务和 Flutter 手机端需要按本文的协议 v1 单独实现。

## 已实现

- Codex 插件清单、MCP Server 和 Relay 管理 skill
- Vue 3 + Ant Design Vue 本机配置台：Relay 地址、房间、Token、设备名、自动连接、重连参数
- 与 Codex 视觉语言一致的浅色 / 深色主题和响应式布局
- Token 存入 macOS Keychain；不可用时回退到权限 `0600` 的本地文件
- Codex App Server stdio 客户端：会话列表/读取/创建/恢复、发送/调整/中断 turn、审批响应
- App Server 通知实时转换为 Relay 事件，并提供 1000 条内存重放缓冲
- 远程命令权限、只读总开关、项目路径白名单、请求幂等、时间戳和目标设备校验
- 公网 Relay 强制 `wss://`；`ws://` 仅允许 `localhost` / 回环地址
- 本地控制台只监听 `127.0.0.1`，API 使用随机 Bearer key，key 只放在 URL fragment 中
- 状态、诊断和脱敏日志 MCP 工具

## 架构

```text
Flutter App  ⇄  Relay (WSS)  ⇄  Codex Relay Connector  ⇄  codex app-server (stdio)
                                     │
                                     └── 127.0.0.1 随机端口配置台
```

Connector 不向公网开放 App Server 或控制台。Relay 只需要接受出站 WSS、认证房间成员并转发协议消息。

## 开发、构建与发布

要求：Node.js 22+、可用的 `codex` 命令，以及支持 `codex app-server` 的 Codex 版本。

本地开发（配置和密钥写入项目内被忽略的 `.codex-relay-data/`）：

```bash
cd /Users/wfu/Documents/GPT/codex-relay-plugin
make dev
```

`make dev` 会安装依赖，先构建一次 Vue 3 控制台，然后同时启动 Vite 构建监听和本机 Dashboard。修改 `web/src/` 后 Vite 会自动更新 `ui/` 产物，刷新浏览器即可看到变化；修改 `server/` 后服务会自动重启，请改用终端中新打印的地址（本地端口和访问 key 会随进程更新）。正式安装后，MCP 工具 `relay_open_dashboard` 也会返回同类地址。

UI 源码位于 `web/`，生产静态文件位于 `ui/`。请修改 `web/src/`，不要直接编辑生成的 `ui/assets/`。Ant Design Vue 仅按组件注册，以控制生产包体积；主题由 Ant Design token 和项目语义色共同驱动，固定提供浅色与深色两种模式。

配置台采用 Vue Router 的 Hash 路由，统一保留侧栏、顶部连接状态和主题切换。页面地址如下：

- `#/overview`：连接状态、房间、设备、事件序号和快速连接操作
- `#/connection`：Relay 地址、房间 ID、设备名称和 Token
- `#/permissions`：只读模式、远程操作权限和项目白名单
- `#/advanced`：Codex App Server、工作目录、心跳、重连和自动启动
- `#/diagnostics`：环境诊断、本地日志、刷新和清空操作

Dashboard 启动链接中的 `#key=...` 会在首次加载时转存到 `sessionStorage` 并从地址栏清除，随后由 `#/页面` 路由接管 hash；刷新任意页面都不会回到长页面或丢失连接状态。

常用目标：

```bash
make check       # 语法检查与测试
make build       # 生成并验证生产插件
make preview     # 从生产构建启动配置台
make clean       # 清理生产构建
make help        # 查看全部命令
```

`make build` 会生成 `plugins/codex-relay-plugin/`。其中 MCP Server 已包含运行时依赖，在线安装后不需要执行 `npm install`。这个目录是发布产物，应随源码一同提交；请修改根目录源码，不要直接修改生成文件。

### 推送为在线 marketplace

先在 GitHub、GitLab 或其他 Git 服务创建一个空仓库。当前插件目录嵌套在其他 Git 仓库中，因此首次发布必须把它初始化为独立仓库：

```bash
make git-init REPO_URL=git@github.com:OWNER/codex-relay-plugin.git
make push
```

HTTPS 远程也可以使用：

```bash
make git-init REPO_URL=https://github.com/OWNER/codex-relay-plugin.git
```

之后每次发布只需：

```bash
make push MESSAGE="release: describe the change"
```

`make push` 会先运行测试和生产构建，提交当前独立插件仓库的全部变更，再推送当前分支。可通过 `REMOTE=upstream` 或 `BRANCH=main` 覆盖目标；如果检测到当前目录不是独立 Git 仓库，它会拒绝推送，避免误操作父仓库。

远程仓库包含标准 marketplace 文件 `.agents/plugins/marketplace.json`。推送后，其他 Codex 用户可执行：

```bash
codex plugin marketplace add OWNER/codex-relay-plugin --ref main
codex plugin add codex-relay-plugin@codex-relay
```

也可以把第一条命令中的 GitHub shorthand 换成 HTTPS Git URL 或 SSH Git URL。更新发布后，使用方执行：

```bash
codex plugin marketplace upgrade codex-relay
codex plugin add codex-relay-plugin@codex-relay
```

本地安装生产构建时，可直接把仓库作为 marketplace：

```bash
make build
codex plugin marketplace add /absolute/path/to/codex-relay-plugin
codex plugin add codex-relay-plugin@codex-relay
```

安装或更新后请新建 Codex 任务，使 skill 和 MCP 工具重新加载。

## 配置位置

默认目录为 `~/.codex-relay-plugin/`：

- `config.json`：非敏感配置，权限 `0600`
- `secrets.json`：没有系统 Keychain 时的回退存储，权限 `0600`

环境变量：

- `CODEX_RELAY_CONFIG_DIR`：覆盖配置目录，适合测试
- `CODEX_RELAY_TOKEN`：覆盖持久化 Token，适合受控运行环境

## Relay 握手

连接后，插件首先发送 `host.hello`，其中包含 `version`、`roomId`、`deviceId`、`deviceName`、Token、时间戳和 capabilities。Relay 验证 Token，并返回 `host.welcome`；认证失败返回 `relay.error`。Relay 收到 `ping` 后应返回 `pong`。单条消息上限为 1 MiB。

完整字段和 JSON Schema 位于 [`schemas/relay-protocol.schema.json`](./schemas/relay-protocol.schema.json)。

## 手机端发送命令

所有命令必须带唯一 `requestId`、发送端 `deviceId`、目标主机 `targetDeviceId`、房间和 5 分钟内的时间戳：

```json
{
  "version": 1,
  "type": "codex.command",
  "requestId": "phone-request-42",
  "roomId": "studio-mac",
  "deviceId": "phone_a1",
  "targetDeviceId": "host_b2",
  "threadId": "thread-id",
  "timestamp": "2026-08-20T08:00:00.000Z",
  "command": { "type": "turn.start", "text": "继续实现并运行测试" }
}
```

插件返回同一 `requestId` 的 `codex.command.result`。来源、目标和命令内容完全相同的请求重试会复用正在执行的任务或返回缓存结果，不会重复执行；用同一个 `requestId` 发送不同命令会被拒绝。

支持的命令：

| 命令 | 关键字段 | 权限 |
|---|---|---|
| `host.get_status` | — | `readThreads` |
| `sync.request` | `lastSequence?` | `readThreads` |
| `thread.list` | `cursor?`, `limit?` | `readThreads` |
| `thread.read` | `threadId` | `readThreads` |
| `thread.create` | `cwd?` | `createThreads` |
| `thread.resume` / `thread.select` | `threadId` | `readThreads` |
| `turn.start` | `threadId`, `text`, `cwd?` | `sendMessages` |
| `turn.steer` | `threadId`, `turnId`, `text` | `steerTurns` |
| `turn.interrupt` | `threadId`, `turnId` | `interruptTurns` |
| `approval.respond` | `approvalId`, `decision` | `respondToApprovals` |

审批 `decision` 仅允许 `accept`、`acceptForSession`、`decline`、`cancel`。远程审批默认关闭。

## 实时事件与断线恢复

插件发出 `codex.event`，包含递增 `sequence`、`eventId`、可选的 `threadId` / `turnId` 和 `event`。常用事件包括：`thread.created`、`thread.updated`、`turn.started`、`turn.completed`、`turn.failed`、`turn.interrupted`、`message.assistant.delta`、`reasoning.delta`、`tool.output`、`diff.updated`、`approval.requested`。

手机端保存最后确认的 `sequence`，重连后发送 `sync.request`。缓冲仍覆盖该序号时返回增量事件；序号缺口或首次同步时返回 thread 快照。事件缓冲只在内存中，插件重启后序号重置。

## Relay 服务必须负责

1. 使用恒时比较或等价安全方式验证房间 Token，认证后把连接绑定到 `roomId + deviceId`。
2. 只把命令路由给 `targetDeviceId`；不要把手机命令广播到房间内所有主机。
3. 限制消息大小、连接数、认证尝试和每设备命令速率。
4. 使用 WSS，禁止在日志、错误消息或监控标签中记录 Token 和完整会话内容。
5. 为手机连接提供等价鉴权；不要因为已知 roomId 就允许加入房间。
6. 保持消息内容不变并支持背压。协议 v1 不要求 Relay 持久化事件。

## 安全边界与当前限制

- Relay 和手机端仍是信任边界；插件侧会再次验证房间、目标设备、时间戳、权限和项目范围。
- 项目白名单为空表示允许访问全部本机会话；首次配置建议开启只读并填写白名单。
- 远程审批风险较高，只有命令执行和文件变更审批会被转发；其他 App Server 客户端请求会被拒绝。
- 当前远端输入仅支持文本，不包含图片、音频和附件。
- Codex App Server 仍在演进；本实现已按 Codex CLI `0.147.0` schema 联调，升级 Codex 后应重新运行测试。

## MCP 工具

`relay_open_dashboard`、`relay_get_status`、`relay_connect`、`relay_disconnect`、`relay_test_connection`、`relay_update_config`（不接受 Token）和 `relay_diagnostics`。

## License

MIT
