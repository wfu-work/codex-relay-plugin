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
- Codex App Server 客户端：插件管理的 stdio 进程，或连接已有的本机 WebSocket / Unix Socket 共享后端
- App Server 通知实时转换为 Relay 事件，并提供 1000 条内存重放缓冲
- 图片事件采用“缩略图 + 短期受控资源 URL”：原图通过认证数据通道上传到 Relay，移动端点击预览时再按过期时间读取
- 图片输入：客户端通过 `image.upload.begin/append/finish/remove` 分块上传，`turn.start.attachmentIds` 引用已完成附件，转为 App Server 原生 `localImage` 输入；支持纯图片提问，最多 4 张、每张 6 MB
- 远程命令权限、只读总开关、项目路径白名单、请求幂等、时间戳和目标设备校验
- 公网 Relay 强制 `wss://`；`ws://` 仅允许 `localhost` / 回环地址
- 本地控制台固定监听 `127.0.0.1:3210`，首次配对使用只放在 URL fragment 中的随机 Bearer key，随后换成本机 `HttpOnly` 会话 Cookie
- 状态、诊断和脱敏日志 MCP 工具
- 运行环境页与迁移向导：独立显示网络、后端、桌面共用和工具验证；支持执行路径修复、迁移预检、生成未激活准备包、取消和失败重试。准备任务独立运行，页面刷新后可恢复进度。
- 独立常驻 Relay Agent：MCP 重载、Dashboard 重开或插件更新不会重复创建 Connector；更新时按构建代际优雅回收旧进程
- 官方 Remote Control 探测与受控操作：支持检测 standalone 安装、启动/停止 daemon、生成短时配对码；未获得官方端点时提供安全的桌面桥接探测

## 架构

图片输入能力由 `capabilities.imageAttachments` 发布。分块最多 96 KiB，上传具备 SHA-256 校验、接入端归属和项目/任务绑定，不接受客户端指定的电脑路径或任意下载 URL。此能力复用 `sendMessages` 权限并遵循只读限制。图片保存在插件数据目录的 `image-uploads` 下，未发送的上传在下次上传时清理超过 24 小时的记录，待发送总量最多 32 张 / 96 MiB。已提交给 Codex 的图片保留供桌面和历史记录读取，不随临时上传清理。插件更新不会搬迁用户配置或会话数据。

```text
Flutter App  ⇄  Relay (WSS)  ⇄  Codex Relay Connector  ⇄  codex app-server (stdio)
                                     │
                                     ├── Relay Agent（runtime.lock 单例）
                                     │      ├── codex app-server (stdio)
                                     │      └── 127.0.0.1:3210 配置台
                                     └── MCP Server / Dashboard CLI（短生命周期代理）
```

Connector 不向公网开放 App Server 或控制台。Relay 只需要接受出站 WSS、认证 Space Endpoint 并转发协议消息；图片资源由 Relay 内存短期托管，不落盘。MCP Server 通过本机受 Bearer key 保护的 Dashboard API 调用 Agent，stdin 关闭只会结束 MCP 代理，不会误杀 Agent 或 App Server。

### 官方 Remote Control 与桌面桥接

运行环境页和 MCP 工具会优先探测官方 `codex remote-control`。该命令要求官方安装器维护的
`~/.codex/packages/standalone/current/codex`；桌面内置或 Homebrew CLI 不能冒充这个 daemon。
在 standalone 可用时，可从控制台启动、停止并生成一次性配对码。配对码只返回给当前本机调用者，
不会写入日志或 Relay 状态。

官方 Remote Control 的控制 Socket 是官方客户端控制面，不是第三方可直接连接的 App Server。
因此插件提供桌面桥接探测：只允许当前用户拥有的本机 Unix Socket 或回环 WebSocket，并在
`initialize` 阶段继续执行官方授权。找不到官方授权端点时，桥接状态明确显示为阻断，不会修改
代码签名、注入桌面进程或启动第二个执行后端。

### 共享执行后端

控制台 **运行环境 → 迁移向导** 可检查本机版本、执行路径、数据目录、准备空间、进程占用及桌面工具验收状态，并生成独立准备包。准备任务记录和产物保存在当前 Relay 配置目录的 `migration/` 下；不复制任务历史、不修改当前连接或停止进程。包发布前会再次核对配置和插件构建，中途变化会终止准备。关闭页面后任务继续运行；取消会清理未发布文件；准备进程异常退出会显示可重试状态。

**准备完成不代表已切换。** 控制台生成的包暂时禁止激活，API 和启用脚本均会说明桌面工具兼容性阻塞。当前正式桌面的工具签名验收尚未通过，不能仅凭 CLI 版本、Socket 连通或历史测试成功就开启自动切换。原命令行启动包工具仍用于隔离验证。

迁移向导中的 **验证桌面兼容性** 会核对官方运行时签名，并在临时 `CODEX_HOME` 中启动共享后端、创建临时任务、读取真实桌面工具目录。不会发送模型请求或执行桌面工具动作；检查结束后关闭测试进程并移除临时数据。结果独立记录签名与工具握手，桌面重启、安装文件变化或超过 10 分钟后失效。工具目录通过也不等于正式切换或工具调用已经通过。

2026-09-10 在桌面 26.901.51231 / CLI 0.153.4 上的实际证据：官方签名 Node 在外部启动链中仍被桌面的 peer authorization 拒绝；CLI 不允许重复 `--listen`，也拒绝 `--stdio` 与 `--listen` 同时使用。当前无法用双监听保留桌面原启动链并共享后端。本插件不会修改官方签名校验、重签应用或通过开发模式绕开该限制，自动激活保持关闭。

控制台“高级设置 → 执行后端”提供两种模式：

- **由插件管理进程（默认）**：保持旧版行为，按需启动 `codex app-server`；插件退出时结束自己的子进程。
- **连接共享后端**：仅连接已经运行的 App Server。插件退出、升级或断开连接不会结束共享服务；服务不可用时自动退避重连，绝不退回启动另一个执行进程。

共享配置示例（通过控制台保存，或使用 `relay_update_config` 的 `connectionMode` / `appServerEndpoint`）：

```json
{
  "codex": {
    "connectionMode": "shared",
    "appServerEndpoint": "ws://127.0.0.1:4500"
  }
}
```

也支持 `unix:///绝对路径/app-server.sock`；`unix://` 表示当前 `CODEX_HOME` 下的默认 control socket。WebSocket 只允许 `localhost`、`127.0.0.1` 或 `[::1]`，地址不可包含凭据、query 或 hash。当前连接层没有 bearer token 配置；需要认证的后端应先采用本机 Unix Socket 路线。

共享模式会在用户读取/选择已授权任务后订阅实时事件；底层只读快照方法本身不取得订阅。断线恢复先初始化、恢复原订阅，再报告就绪；事件重放出现缺口时要求快照补齐。连接中断或超时的写命令不会自动重发，调用方需要核对任务实际状态。重连去重仍是进程内保证，跨插件进程的持久化命令回执属于后续工作。

总览显示真实连接方式、地址和独立的后端连接状态。共享模式下 PID 为 `null`，避免把客户端进程误报成执行后端。保存后端地址/模式会断开旧连接并应用新配置；修改共享模式的访问范围会清除原订阅，后续读取重新校验白名单。

**桌面也必须连接同一个后端。** macOS 已提供共享服务、桌面启动代理和切换/回滚工具。代理保留桌面 stdio 启动时的工具配置，连接本机 Unix Socket；无需修改官方应用包。直接设置 `CODEX_APP_SERVER_WS_URL` 会跳过当前桌面的 `codex_app` 启动配置，不建议作为日常启动方式。

先构建，再生成一个尚未启用的启动包：

```bash
npm run build
npm run shared:prepare -- \
  --relay-agent /已安装插件目录/server/agent-cli.js \
  --original-icon
```

默认目录为 `~/Library/Application Support/Recodex Shared Backend`，包含“启用共享后端.command”“恢复独立后端.command”“查看共享状态.command”及 `Codex Shared.app`。`--original-icon` 让启用后的 macOS GUI 启动环境指向代理，保留原图标的使用习惯；回滚会恢复原环境。显式启动器仍可用于诊断登录时的启动先后问题。

启用前完成运行中的任务、退出桌面并停止旧 Relay；安装器检查冲突进程，备份历史/配置/插件，再替换为本次构建并安装 LaunchAgent。使用原 `CODEX_HOME`，不会把历史移到新账户或空目录。`--desktop-profile /原桌面配置目录` 可把 Electron 配置也纳入备份。回滚只恢复连接字段、启动环境和本次替换的插件，保留切换后的任务记录及其他设置修改。准备启动包不会改变运行配置。

当前兼容版本为桌面 **26.901.51231 / CLI 0.153.4**；启动包记录 CLI 哈希，升级后会拒绝启动，需重新验证。共享传输及相关桌面内部入口仍具有实验性。第四阶段已增加审批和用户提问的共享处理、恢复与关闭同步、持久命令去重、事件流代际和停止确认。Flutter 可在执行时编辑独立草稿，并明确补充到当前轮次；桌面仍不展示同一套队列 UI。正式桌面启动入口与全部宿主功能仍需切换后验收。

开发验证：`npm run smoke:desktop` 使用临时 home、Relay 配置、插件副本和独立 LaunchAgent，验证真实 Codex 后端、官方桌面 MCP 程序、模拟桌面工具 Socket、桌面代理退出/重开、后端崩溃恢复与回滚。不读取正式认证、不发送模型请求。

交互验证可运行 `npm run smoke:interactions`：真实 Codex 与 MCP 夹具验证桌面延迟接受不会被旁观 Relay 拒绝、两端关闭同步，以及断线重新订阅时的待处理请求恢复。Flutter 侧新增交互卡片、停止确认和真实 WebSocket 断线恢复回归。默认远程审批权限保持关闭；只有启用 `respondToApprovals` 后才能从 Flutter 回答。详细证据见 `docs/shared-backend-stage4.md`。

开发验证可运行 `npm run smoke:shared -- /绝对路径/codex`：启动隔离的真实 App Server，验证两客户端订阅、停止客户端后服务存活和重新连接；测试不发送模型请求，不读取正式会话或认证文件。

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
Connect Token，再按需开启自动连接及远程权限。首次由 Codex 打开的控制台链接会完成浏览器配对；之后在同一浏览器中直接访问 `http://127.0.0.1:3210` 即可，配对会话会跨 Connector 重启保留。

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

Dashboard 启动链接中的 `#key=...` 会在首次 API 请求时兑换成本机 `HttpOnly` 会话 Cookie，并从地址栏清除；前端仍短暂保留 Bearer key 以兼容首次配对，之后直接打开根地址也能恢复配置。Cookie 会话有效期为 30 天，刷新或重启 Connector 不会丢失；更换浏览器或清除 Cookie 后，再从 Codex 重新打开一次控制台即可。

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

连接配置中的两个 ID 仍有不同职责：`relay.endpointId` 是 Relay 控制台登记的接入端 ID，必须与
Connect Token 签发时绑定的 Endpoint 完全一致，同时也是 Relay 定向转发使用的目标 ID。`relay.deviceId`
是插件保留的内部主机身份，用于事件元数据和兼容旧数据，不需要在配置台填写，也不能作为手机端的
`targetDeviceId`。旧版本没有 `endpointId` 字段时，插件会保留原有的本机身份并尝试迁移为 Endpoint ID
提示值；升级后仍应在连接控制台核对 Endpoint ID。

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
`relay.error`。业务命令和事件都放在 `stream.message.payload` 中，Relay 保持业务 payload
不透明；唯一例外是 `codex.resource.v1` 上传帧，Relay 会校验图片 MIME/大小并返回短期资源 URL。
Relay 收到 `ping` 后返回 `pong`，单条消息上限由
`connect.welcome.maxFrameSize` 宣布。

Relay URL 只能包含协议、主机和 `/v1/connect` 路径，不能带 query 或 hash；Token 只放在
首帧。插件会读取 `connect.welcome.features`，当服务端未公布 `directed-routing` 时，
插件会阻止需要定向路由的命令发送并提示当前套餐不支持该能力，避免把敏感命令广播到整个 Space。
“测试连接”使用一次性握手，不会创建在线 Session 或占用 Connect Token 的连接名额；
正式连接、测试、断开和自动重连在插件内互斥，手动断开会等待 WebSocket 关闭后再报告已断开。

通用字段和校验规则位于同级的 [`relay-protocol`](../relay-protocol/README.md) 工程；
本目录下的 [`schemas/relay-protocol.schema.json`](./schemas/relay-protocol.schema.json)
只描述 Relay transport frame，Codex 业务 payload 保持不透明并由产品适配层定义。

## 图片资源协议

插件发现 Codex 事件中的 `data:image/...;base64,...` 或允许目录下的本地图片路径后，会先发送一条
`protocol: "codex.resource.v1"` 的 `stream.message`：

```json
{
  "type": "codex.resource.put",
  "requestId": "resource-42",
  "mime": "image/png",
  "data": "<base64>",
  "ttlSeconds": 600
}
```

Relay 只接受 `image/*`，单张默认不超过 6 MiB、内存总量不超过 64 MiB，并在内存中保存最多 10 分钟。上传成功后
向同一连接返回 `codex.resource.ready`，其中包含 `resourceUrl` 和 `expiresAt`。事件只携带
`thumbnailDataUrl`、`resourceUrl`、`expiresAt`，不再把主机文件路径或长期文件 URL 发给手机端。
部署在反向代理后时，建议配置 `relay.resource-base-url: https://relay.example.com`，否则 Relay
会根据 WebSocket 的 `Host` 与 `X-Forwarded-Proto` 自动生成地址。

## 手机端发送命令

手机端应通过 `stream.message` 发送命令；业务 payload 仍必须带唯一 `requestId`、发送端
`deviceId`、目标主机 Endpoint ID（`targetDeviceId`）、Space 和 5 分钟内的时间戳。`targetDeviceId`
必须填写插件的 `relay.endpointId`，而不是插件内部生成的 `relay.deviceId`：

```json
{
  "version": 1,
  "type": "stream.message",
  "messageId": "message-42",
  "streamId": "codex",
  "sequence": 1,
  "from": "phone_a1",
  "to": "cli_host_b2",
  "protocol": "codex.v1",
  "payload": {
    "type": "codex.command",
    "requestId": "phone-request-42",
    "spaceId": "studio-mac",
    "deviceId": "phone_a1",
    "targetDeviceId": "cli_host_b2",
    "threadId": "thread-id",
    "timestamp": "2026-08-20T08:00:00.000Z",
    "command": {
      "type": "turn.start",
      "text": "继续实现并运行测试",
      "model": "gpt-5.5"
    }
  }
}
```

插件返回同一 `requestId` 的 `codex.command.result`。来源、目标和命令内容完全相同的请求重试会复用正在执行的任务或返回缓存结果，不会重复执行；用同一个 `requestId` 发送不同命令会被拒绝。

支持的命令：

| 命令 | 关键字段 | 权限 |
|---|---|---|
| `host.get_status` | — | `readThreads` |
| `model.list` | `cursor?`, `limit?`, `includeHidden?` | `readThreads` |
| `project.list` | `cursor?`, `limit?` | `readThreads` |
| `sync.request` | `lastSequence?` | `readThreads` |
| `thread.list` | `cursor?`, `limit?`, `sortKey?`, `sortDirection?` | `readThreads` |
| `thread.read` | `threadId`, `snapshotHash?` | `readThreads` |
| `thread.status` | `threadId` | `readThreads` |
| `thread.settings.update` | `threadId`, `model?`, `effort?`, `permissionMode?` | `sendMessages`；权限模式还需 `respondToApprovals` |
| `thread.create` | `cwd?` | `createThreads` |
| `thread.resume` / `thread.select` | `threadId` | `readThreads` |
| `turn.start` | `threadId`, `text`, `cwd?`, `model?`, `effort?` | `sendMessages` |
| `turn.steer` | `threadId`, `turnId`, `text` | `steerTurns` |
| `turn.interrupt` | `threadId`, `turnId` | `interruptTurns` |
| `approval.respond` | `approvalId`, `decision` | `respondToApprovals` |

`thread.list` 默认按官方侧栏使用的 `recency_at` 降序返回；不支持该字段的旧版
App Server 会自动回退到 `updated_at`。`project.list` 返回官方项目的稳定 ID、根目录
和 `position`，Relay 会按项目白名单过滤后再转发。Relay 还会只读同一 `CODEX_HOME`
下 `.codex-global-state.json` 的 `pinned-project-ids`，为项目补充 `isPinned` 和
`pinnedPosition`（未置顶为 `null`），供客户端按桌面置顶顺序分组。每次请求项目列表
都会重新读取；桌面置顶或取消置顶后，客户端刷新即可同步。首次读取不到桌面状态时
按未置顶展示，临时读取失败时保留上次有效状态，不会修改桌面偏好。

审批 `decision` 仅允许 `accept`、`acceptForSession`、`decline`、`cancel`。远程审批默认关闭。

## 输入框设置双向同步

Flutter 和 Codex 桌面端连接同一个 shared App Server 时，同一任务的模型、推理等级和权限
通过 `thread/settings/update` 更新。Relay 将 `thread/settings/updated` 转为
`thread.settings.updated`，并在 `thread.read` / `thread.status` 中附带 `threadSettings`
快照和递增的 `revision`，用于首次打开任务、切换任务和断线恢复。

`permissionMode` 支持 `默认权限`、`自动审查`、`完全访问权限` 和 `只读权限`；分别映射到
Codex 的官方权限 profile 及 approval reviewer。修改权限需要现有 `respondToApprovals`
授权，插件不会自动开启该授权。自定义 profile 会原样回传，Flutter 显示其名称。

新任务先确认输入框设置再发送第一条消息；现有任务发送消息时沿用后端当前设置。
Flutter 的默认设置只作用于新任务，模型列表刷新和桌面端通知不会反向覆盖任务设置。
此功能需要更新 Flutter 客户端和 Relay 插件，并使用支持上述设置接口的 Codex 版本。

## 实时事件与断线恢复

插件发出 `codex.event`，包含递增 `sequence`、`eventId`、可选的 `threadId` / `turnId` 和 `event`。Relay v1 只转发当前 Codex App Server schema 对应的 canonical 事件：`thread.created`、`thread.updated`、`thread.settings.updated`、`thread.queue.changed`、`turn.started`、`turn.completed`、`message.assistant.delta`、`reasoning.delta`、`tool.output`、`diff.updated`、`item.started`、`item.updated`、`item.completed`、`usage.updated` 和 `approval.requested`。失败或中断由 `turn.completed` 的 `event.data.turn.status`（分别为 `failed` 或 `interrupted`）表达，不再接受旧版别名或独立终态事件。

历史任务在本机 App Server 中通过持久化快照读取，不会为了轮询而自动执行 `thread/resume`。这样官方桌面端正在运行的任务仍由桌面 App Server 持有 writer，Relay 以最终一致的方式读取其已持久化状态，不会因争抢 writer 而制造假完成或重复重试。Relay 自己创建的任务仍可通过 `turn.start` 正常恢复未加载的历史线程并接收本进程事件；项目白名单的事件访问探测只读元数据，不会在权限校验前恢复未授权任务。

旧客户端的 `thread.resume` 命令也按只读订阅处理：返回任务元数据和 `syncMode: "snapshot"`，不会获取 writer。`thread.read` 返回 `snapshotHash`；后续读取携带该值且内容未变时，仅返回 `{ threadId, snapshotHash, unchanged: true }`。客户端应保留现有对话和实时事件，首次加载、手动刷新和每分钟一次的资源链接刷新不携带该值。

历史响应、事件与图片上传共用有界发送队列，默认按 512 KiB/s 和每秒最多约 29 帧发送（单个大帧完整发送后等待其占用的字节时间）。队列最多 16 MiB / 512 帧，等待超过 25 秒会报告需要重新同步。同一图片在同一 Relay / Space / Endpoint 内合并并发上传，并在资源 URL 到期前复用。收到 `rate.limited` 后暂停 60 秒并降低发送速率；随后发生的 WebSocket 错误保留限流原因。连接更换时丢弃旧连接的排队响应，由客户端恢复同步，不重放过期请求。

两端共享的前提是使用同一个 macOS 用户和同一个 Codex 数据目录（`CODEX_HOME`）。如果官方桌面端配置了自定义 `CODEX_HOME`，启动 Relay Connector 时也必须传入同一个值；不同数据目录不会共享任务历史。官方桌面端的任务列表是否立即刷新仍由桌面端 UI 决定，必要时手动刷新任务列表或重新打开项目即可看到 Relay 创建的任务。

手机端保存最后确认的 `sequence`，重连后发送 `sync.request`。缓冲仍覆盖该序号时返回增量事件；序号缺口或首次同步时返回 thread 快照。事件缓冲只在内存中，插件重启后序号重置。

## Relay 服务必须负责

1. 使用恒时比较或等价安全方式验证 Connect Token 和 Endpoint proof，认证后把连接绑定到 `spaceId + endpointId`。
2. 只把命令路由给 Endpoint ID 对应的 `targetDeviceId`；不要把手机命令广播到 Space 内所有 Endpoint。
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
