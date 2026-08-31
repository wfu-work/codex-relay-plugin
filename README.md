<p align="center">
  <img src="./assets/codex-relay-logo.svg" width="112" height="112" alt="Codex Relay Logo" />
</p>

<h1 align="center">Codex Relay Plugin</h1>

一个本机 Codex 插件：通过用户配置的 Relay 建立出站 WebSocket，把 Codex App Server 的会话事件实时转发到远端，并把手机端命令转换为受权限控制的 Codex 操作。

本仓库只包含 Codex 插件。Relay 服务和 Flutter 手机端需要按本文的协议 v1 单独实现。

## 已实现

- Codex 插件清单、MCP Server 和 Relay 管理 skill
- Vue 3 + Ant Design Vue 本机配置台：Relay 地址、Space、Connect Token、设备名、自动连接、重连参数
- 与 Codex 视觉语言一致的浅色 / 深色主题和响应式布局
- Token 存入用户目录下的本地 `secrets.json`（Unix 使用 `0600` 权限），并在本机配置台回显
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

Connector 不向公网开放 App Server 或控制台。Relay 只需要接受出站 WSS、认证 Space Endpoint 并转发协议消息。

## 安装（GitHub，推荐）

本仓库已经包含可发布的生产插件和标准 marketplace 清单，普通用户不需要
clone、安装依赖或自己构建。安装命令会从 GitHub 获取仓库，再从
`.agents/plugins/marketplace.json` 找到 `plugins/codex-relay-plugin/`。

### 前置条件

- [Codex CLI](https://developers.openai.com/codex/cli) 0.146 或更高版本，并且支持
  `codex plugin` 与 `codex app-server`。
- Node.js 22 或更高版本（MCP Server 由本机 `node` 启动）。
- Git，以及访问 GitHub 仓库的网络权限。

先确认命令版本：

```bash
codex --version
node --version
```

插件可在 Codex CLI 或 ChatGPT desktop app 中使用；Codex IDE extension 当前不支持插件。

### 安装 Codex Relay

在终端依次执行：

```bash
# 添加 GitHub marketplace（仓库的 main 分支）
codex plugin marketplace add wfu-work/codex-relay-plugin --ref main

# 可选：确认 marketplace 已登记
codex plugin marketplace list

# 安装插件（marketplace 名称来自 .agents/plugins/marketplace.json）
codex plugin add codex-relay-plugin@codex-relay

# 可选：确认插件已安装
codex plugin list --marketplace codex-relay
```

也可以把第一条命令替换为完整 Git URL：

```bash
codex plugin marketplace add https://github.com/wfu-work/codex-relay-plugin.git --ref main
```

这里不要使用 `--sparse .agents/plugins`：插件产物位于仓库的
`plugins/codex-relay-plugin/`，需要同时下载 marketplace 清单和该目录。

安装完成后退出当前 Codex 进程并新建一个任务（例如重新运行 `codex`，或在会话中执行
`/new`）。插件的 skill 和 MCP Server 会在新任务启动时加载。进入 `/plugins` 可以查看
`Codex Relay` 的启用状态；首次使用时打开配置台，填写 Relay 地址、Space ID、设备名称和
Connect Token，再按需开启自动连接及远程权限。

### 更新或卸载

发布新版本后，在已安装插件的机器上执行：

```bash
# 刷新 GitHub marketplace 快照
codex plugin marketplace upgrade codex-relay

# 重新安装当前 marketplace 中的最新插件版本
codex plugin add codex-relay-plugin@codex-relay
```

更新后同样需要新建 Codex 任务。如果要卸载插件或移除 marketplace：

```bash
codex plugin remove codex-relay-plugin@codex-relay
codex plugin marketplace remove codex-relay
```

## 开发、构建与发布

维护者或需要修改源码时，先获取仓库并在仓库根目录操作：

```bash
git clone https://github.com/wfu-work/codex-relay-plugin.git
cd codex-relay-plugin
```

要求：Node.js 22+、可用的 `codex` 命令，以及支持 `codex app-server` 的 Codex 版本。

本地开发（配置和密钥写入项目内被忽略的 `.codex-relay-data/`）：

```bash
make dev
```

`make dev` 会安装依赖，先构建一次 Vue 3 控制台，然后同时启动 Vite 构建监听和本机 Dashboard。修改 `web/src/` 后 Vite 会自动更新 `ui/` 产物，刷新浏览器即可看到变化；修改 `server/` 后服务会自动重启，请改用终端中新打印的地址（本地端口和访问 key 会随进程更新）。正式安装后，MCP 工具 `relay_open_dashboard` 也会返回同类地址。

UI 源码位于 `web/`，生产静态文件位于 `ui/`。请修改 `web/src/`，不要直接编辑生成的 `ui/assets/`。Ant Design Vue 仅按组件注册，以控制生产包体积；主题由 Ant Design token 和项目语义色共同驱动，固定提供浅色与深色两种模式。

配置台采用 Vue Router 的 Hash 路由，统一保留侧栏、顶部连接状态和主题切换。页面地址如下：

- `#/overview`：连接状态、Space、设备、事件序号和快速连接操作
- `#/connection`：Relay 地址、Space ID、设备名称和 Connect Token
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

如果需要测试本地构建，可把当前仓库目录临时作为 marketplace：

```bash
make build
codex plugin marketplace add "$(pwd)"
codex plugin add codex-relay-plugin@codex-relay
```

本地 marketplace 与 GitHub marketplace 使用同一个名称；如果机器上已经登记了 GitHub
版本，请先执行 `codex plugin marketplace remove codex-relay`，再添加本地目录。

仓库已经配置好 `origin`：

```bash
make push MESSAGE="release: describe the change"
```

`make push` 会先运行测试和生产构建，提交当前独立 Git 仓库的全部变更，再推送当前分支。可通过 `REMOTE=upstream` 或 `BRANCH=main` 覆盖目标；如果是在其他父仓库中使用本目录，请先用 `make git-init REPO_URL=<url>` 初始化独立仓库。

正式发布使用 `make publish`：它会先把 `.codex-plugin/plugin.json` 的版本更新为
`<基础版本>+codex.<UTC 时间戳>`，再执行同样的构建、提交和推送流程。基础版本（例如
`1.0.0`）会保留，因此每次发布不必手动递增 `1.0.1`；但完整版本字符串会变化，Codex
才能识别为新的插件缓存。`make push` 不会自动改版本，适合只推送开发中的提交。

```bash
make publish MESSAGE="release: describe the change"
```

如需在测试或自动化中固定时间戳，可传入 `VERSION_TIMESTAMP=YYYYMMDDHHMMSS`；省略时使用
当前 UTC 时间。发布后，在已安装插件的机器上仍需刷新 marketplace 并重新安装插件：

```bash
codex plugin marketplace upgrade codex-relay
codex plugin add codex-relay-plugin@codex-relay
```

## 配置位置

默认目录为 `~/.codex-relay-plugin/`：

- `config.json`：非敏感配置；Unix 权限 `0600`
- `secrets.json`：按 Space 保存 Connect Token、Endpoint Grant、过期时间和刷新地址；Unix 权限 `0600`

环境变量：

- `CODEX_RELAY_CONFIG_DIR`：覆盖配置目录，适合测试
- `CODEX_RELAY_TOKEN`：覆盖持久化 Token，适合受控运行环境

当配置了 `endpointGrant` 和 `grantExpiresAt`（未填写 `tokenEndpoint` 时，插件会按 Relay
地址推导 `/api/connect-tokens/refresh`）时，插件会在 Connect Token 剩余约 60 秒时自动用本机 Endpoint 私钥签名刷新请求，并把 Relay 返回的新 Token 原子写回
`secrets.json`。刷新请求不携带用户 JWT，Grant 不会写入日志；公网刷新地址必须使用 HTTPS，
仅回环地址允许 HTTP 调试。若 Token 已过期且 Grant 无效、撤销或过期，插件会停止重连并等待
重新签发凭证。Relay 在已建立连接达到 Token 生命周期后会主动要求重连，插件会先续期再重新认证。

## Relay 握手

Protocol v1 的连接地址为 `wss://<relay-host>/v1/connect`。连接后，插件首先发送
`connect.hello`，其中包含 `version`、`spaceId`、`endpointId`、`endpointType`、短期
Token、完整的 Ed25519 `endpointProof` 和 capabilities。Endpoint proof 绑定本机公钥、
时间戳、随机 nonce 与 Connect Token；Relay 验证 proof 后返回 `connect.welcome`；认证失败返回
`relay.error`。业务命令和事件都放在 `stream.message.payload` 中，Relay 不解析
payload。Relay 收到 `ping` 后返回 `pong`，单条消息上限由
`connect.welcome.maxFrameSize` 宣布。

Relay URL 只能包含协议、主机和 `/v1/connect` 路径，不能带 query 或 hash；Token 只放在
首帧。插件会读取 `connect.welcome.features`，当服务端未公布 `directed-routing` 时，
插件会阻止需要定向路由的命令发送并提示当前套餐不支持该能力，避免把敏感命令广播到整个 Space。

通用字段和校验规则位于同级的 [`relay-protocol`](../relay-protocol/README.md) 工程；
本目录下的 [`schemas/relay-protocol.schema.json`](./schemas/relay-protocol.schema.json)
只描述 Relay transport frame，Codex 业务 payload 保持不透明并由产品适配层定义。

## 手机端发送命令

手机端应通过 `stream.message` 发送命令；业务 payload 仍必须带唯一 `requestId`、发送端
`deviceId`、目标主机 `targetDeviceId`、Space 和 5 分钟内的时间戳：

```json
{
  "version": 1,
  "type": "stream.message",
  "messageId": "message-42",
  "streamId": "codex",
  "sequence": 1,
  "from": "phone_a1",
  "to": "host_b2",
  "protocol": "codex.v1",
  "payload": {
    "type": "codex.command",
    "requestId": "phone-request-42",
    "spaceId": "studio-mac",
    "deviceId": "phone_a1",
    "targetDeviceId": "host_b2",
    "threadId": "thread-id",
    "timestamp": "2026-08-20T08:00:00.000Z",
    "command": { "type": "turn.start", "text": "继续实现并运行测试" }
  }
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

1. 使用恒时比较或等价安全方式验证 Connect Token 和 Endpoint proof，认证后把连接绑定到 `spaceId + endpointId`。
2. 只把命令路由给 `targetDeviceId`；不要把手机命令广播到 Space 内所有 Endpoint。
3. 限制消息大小、连接数、认证尝试和每设备命令速率。
4. 使用 WSS，禁止在日志、错误消息或监控标签中记录 Token 和完整会话内容。
5. 为手机连接提供等价鉴权；不要因为已知 Space ID 就允许加入 Space。
6. 保持消息内容不变并支持背压。协议 v1 不要求 Relay 持久化事件。

## 安全边界与当前限制

- Relay 和手机端仍是信任边界；插件侧会再次验证 Space、目标 Endpoint、时间戳、权限和项目范围。
- 项目白名单为空表示允许访问全部本机会话；首次配置建议开启只读并填写白名单。
- 远程审批风险较高，只有命令执行和文件变更审批会被转发；其他 App Server 客户端请求会被拒绝。
- 当前远端输入仅支持文本，不包含图片、音频和附件。
- Codex App Server 仍在演进；本实现已按 Codex CLI `0.147.0` schema 联调，升级 Codex 后应重新运行测试。

## MCP 工具

`relay_open_dashboard`、`relay_get_status`、`relay_connect`、`relay_disconnect`、`relay_test_connection`、`relay_update_config`（不接受 Token）和 `relay_diagnostics`。

## License

MIT
