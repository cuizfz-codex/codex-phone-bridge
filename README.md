# phone-codex

当前仓库只保留“简化版”主线：

- [Start-Phone-Codex.command](./Start-Phone-Codex.command)
- [Stop-Phone-Codex.command](./Stop-Phone-Codex.command)
- [server.js](./server.js)
- [src/bridge/bridge-app.js](./src/bridge/bridge-app.js)

旧的 Electron 桌面 App 版已经淘汰，不再作为本项目的运行方式，也不再维护。当前方向和标准是网页版：

- 旧桌面 App 源码归档于 [archive/legacy-desktop-app/desktop](./archive/legacy-desktop-app/desktop)
- 旧桌面 App 的 macOS 发布工作流归档于 [archive/legacy-desktop-app/.github/workflows/release.yml](./archive/legacy-desktop-app/.github/workflows/release.yml)

当前默认目标很明确：

- 手机网页可以正常收发消息
- 手机网页发送后的结果，以手机网页端显示为准
- 不再追求“手机发消息后，Codex 桌面客户端必须实时同步刷新”

## 快速启动

1. 在仓库根目录双击运行 [Start-Phone-Codex.command](./Start-Phone-Codex.command)。
2. 用手机打开脚本输出的 `Setup URL`，或者直接扫描脚本弹出的二维码。
3. 停止服务时，运行 [Stop-Phone-Codex.command](./Stop-Phone-Codex.command)。

## 默认手机访问地址

脚本现在会优先把手机入口设为以下顺序：

1. `Tailscale IPv4`
2. `MagicDNS`
3. `LAN IPv4`
4. `127.0.0.1`

也就是说，如果当前机器的 Tailscale IPv4 是 `<TAILSCALE-IP>`，那么扫码后的默认基址就是：

`https://<TAILSCALE-IP>:8787`

网页“设置 -> 快速选择地址”里，也会优先显示这个 Tailscale 地址。

## 当前运行方式

推荐使用：

```bash
./Start-Phone-Codex.command
```

如需手工启动 bridge：

```bash
npm install
npm start
```

## 当前行为说明

- 默认启用 HTTPS。
- 默认远程模式为 `tailscale`。
- 默认启用温和桌面刷新：`DESKTOP_NUDGE_MODE=frontmost`，仅在 Codex 桌面端已处于前台时轻触刷新，不主动抢焦点；如需完全关闭可设为 `off`。
- 当前这条主线不依赖旧桌面 App，不需要 `Sync ON/OFF`、菜单栏控制页，也不需要 Electron 打包产物。

## 当前网页版本记录（v1.1.0，2026-04-24）

这一版网页端定位为“临时、轻量、手机可用”的 Codex 控制台，不再追求把 Codex 桌面端完整搬到手机上。

当前入口：

- 本机预览：`http://127.0.0.1:8786/`
- 本机 HTTPS：`https://127.0.0.1:8787/`
- 局域网手机入口：启动脚本输出的 `https://<LAN-IP>:8787/`

本轮主要改动：

- 侧边栏只保留高频入口：`新建 Thread`、`刷新`、额度圆环、单线程锁定按钮、项目和线程列表。
- `语言`、`主题`、线程关键词搜索已移除。语言跟随浏览器/系统语言；主题跟随系统主题。
- `来源 / 包含归档 / 桌面一致视图` 收入“高级筛选”，默认不打扰常用界面。
- 额度显示改为 5H / 7D 两个圆环；“剩余额度”文字已移除。
- `解除单线程锁定` 按钮和额度圆环并排放在同一块区域，减少纵向空间占用。
- 线程列表不再显示线程 id / source / provider 等元数据，避免占空间。
- 线程下方的 `改名 / 归档 / 分叉 / 复制ID` 操作入口已移除。网页端保持简单，不做复杂线程管理。
- 正在运行的线程不显示“运行中”标签，只通过浮起卡片样式区分。
- 审批请求改为更收敛的提示/面板，不再长期挤占主界面。
- 大项目展开后默认只显示 5 个线程，可用“展开全部 / 收起到 5 个”切换，减少侧边栏拥挤。

当前验证状态：

- `npm test` 通过，当前测试数为 43。
- `node --check public/app.js`、`node --check src/thread-service.js`、`node --check src/bridge/bridge-app.js` 通过。
- `http://127.0.0.1:8786/api/health` 返回 `ok: true`。
- 已在网页 DOM 验证：正在运行线程会获得 `.thread-item.is-running`；不会出现 `.thread-running-badge`。

## 新版 Codex 适配与踩坑记录

### 1. `thread/list` / `thread/read` 不是实时运行态

新版 Codex 下，`thread/list` 和 `thread/read` 经常返回：

```text
status.type = notLoaded
```

即使线程正在桌面端运行，也可能没有 `turn.status = inProgress`。原因是当前正在执行的 turn 不一定已经写入落盘历史；`thread/read` 读到的是已持久化历史，不是桌面主界面的实时内存状态。

所以这版网页端不能只靠 `thread.turns[].status === "inProgress"` 判断运行中。

### 2. `thread/loaded/list` 不能代表桌面主界面

曾经尝试用 Codex App Server 的 `thread/loaded/list` 判断已加载线程，但 phone-codex 自己启动的是独立 app-server 进程。它返回的是“本 bridge 进程自己加载的线程”，不是 Codex 桌面主界面里的线程。

结论：不要把 phone-codex 的独立 app-server 当成桌面端运行态来源。

### 3. 当前运行态检测方案是 best-effort

当前实现位于 [src/thread-service.js](./src/thread-service.js)：

- 保留原来的网页端 watch / `inProgress` 判断。
- 额外扫描 Codex 桌面主进程打开的 `.codex/sessions/.../rollout-*.jsonl`。
- 只把仍有活跃尾部事件、且没有 `final_answer` / `task_complete` 收尾的会话视为运行中。
- 该状态会被合并进 `/api/v2/threads` 和 `/api/v2/threads/:id`，让普通列表和单线程锁定视图都能显示浮起卡片。

这个方案能覆盖当前桌面侧边栏转圈但 API 返回 `notLoaded` 的情况，但它仍是本地运行态推断，不是 OpenAI 明确承诺的稳定协议字段。

### 4. 桌面端实时同屏仍不是完整支持

手机网页端可以发送消息、执行命令、显示结果。Codex 桌面端同一个 thread 不一定实时同屏刷新手机端发出的命令和输出。

当前只保留温和桌面刷新：

```text
DESKTOP_NUDGE_MODE=frontmost
```

也就是 Codex 桌面端已经在前台时，轻触刷新；不主动抢焦点。

### 5. Codex Desktop IPC 只读观察模式

2026-04-24 起，phone-codex 增加了第一阶段 Codex Desktop IPC 观察模式：

- 新增 [src/desktop-ipc-client.js](./src/desktop-ipc-client.js)：只负责连接官方 Codex 桌面端 IPC socket、握手和接收 frame。
- 新增 [src/desktop-ipc-monitor.js](./src/desktop-ipc-monitor.js)：监听 `thread-stream-state-changed`，维护 `threadId -> ownerClientId / running`。
- 当前阶段只读，不发送 `thread-follower-start-turn`，所以不会改变网页端原有发消息链路。
- `/api/health` 会显示 `desktopIpc` 状态，包括 socket、连接、初始化、clientId、线程数、running 线程数。
- 线程列表会把 IPC 观察到的 running 状态合并进去；如果 IPC 不可用，仍保留原来的 app-server / lsof rollout 兜底逻辑。

默认配置：

```text
CODEX_DESKTOP_IPC_ENABLED=1
CODEX_DESKTOP_IPC_SOCKET_PATH=<自动使用 os.tmpdir()/codex-ipc/ipc-<uid>.sock>
CODEX_DESKTOP_IPC_RECONNECT_MS=2000
```

### 6. Codex Desktop IPC 优先发送模式

2026-04-24 第二阶段起，网页端发送 turn 的链路改为：

1. 如果 `CODEX_DESKTOP_IPC_SEND_MODE=prefer`，且 IPC 已经观察到当前 thread 的 `ownerClientId`，优先发送 IPC 请求：

```text
thread-follower-start-turn
```

2. 该请求会带上：

```text
targetClientId = ownerClientId
conversationId = threadId
turnStartParams = 当前输入 + 最新桌面 thread 参数模板
```

3. 如果 IPC 不可用、没有 owner、桌面端返回错误或请求超时，自动回退原来的 app-server `turn/start`。
4. 回退时 HTTP 响应会包含 `desktopIpcFallbackReason`，方便排障。

当前默认：

```text
CODEX_DESKTOP_IPC_SEND_MODE=prefer
CODEX_DESKTOP_IPC_REQUEST_TIMEOUT_MS=20000
```

如果 IPC 协议因 Codex 升级失效，可在 `launcher.env` 中临时关闭发送模式：

```text
CODEX_DESKTOP_IPC_SEND_MODE=off
```

只读 IPC 观察仍可继续用于 running 状态；如需彻底关闭 IPC：

```text
CODEX_DESKTOP_IPC_ENABLED=0
```

## 回滚与备份

重要备份目录：

- UI 简化前备份：`data/runtime/backups/phone-codex-ui-simplify-20260423-233637`
- 运行态检测改造前备份：`data/runtime/backups/phone-codex-running-detect-20260424-002033`
- IPC 只读观察模式改造前备份：`data/runtime/backups/phone-codex-ipc-phase1-20260424-013129`
- IPC 优先发送模式改造前备份：`data/runtime/backups/phone-codex-ipc-phase2-send-20260424-013954`

如果运行态检测或 UI 改动出问题，优先从上述备份目录恢复以下文件：

- [public/app.js](./public/app.js)
- [public/styles.css](./public/styles.css)
- [src/thread-service.js](./src/thread-service.js)

## 外部 Codex 手机端生态观察（2026-04-24）

当前没有看到 OpenAI 官方发布“用于远程操控本地 Codex Desktop / App Server”的独立 iOS/Android 手机客户端。官方移动端相关信息主要是 ChatGPT iOS 里的 Codex Cloud 入口：可以在手机上启动任务、看 diff、推 PR，但它不是本项目这种连接本机 Codex 桌面/本机 app-server 的控制台。

有价值的外部线索：

- OpenAI 官方说明：Codex App Server 是 Codex 各客户端的核心协议层，适合自建客户端；不同客户端通过 JSON-RPC / stdio 等方式接入同一个 harness。
  - <https://openai.com/index/unlocking-the-codex-harness/>
- OpenAI 官方 Codex App 发布页写明：Codex app 首发为 macOS；ChatGPT 订阅用户可在 CLI、Web、IDE extension、app 中使用 Codex。
  - <https://openai.com/index/introducing-the-codex-app/>
- OpenAI Codex Changelog 记录了 Windows 版 Codex app，也记录过 “Codex in the ChatGPT iOS app”。后者定位是手机上启动云端任务、查看 diff、推 PR。
  - <https://developers.openai.com/codex/changelog>
- GitHub 上有人提 feature request：希望有移动 app 可以从手机控制本地电脑上的 Codex。
  - <https://github.com/openai/codex/issues/10816>
- GitHub 上还有更明确的 remote-control request：希望从手机上的 ChatGPT/Codex tab 控制桌面 PC 上运行的 Codex。
  - <https://github.com/openai/codex/issues/9224>
- Reddit 上已经出现第三方/个人方案，方向大致分三类：手机 Web UI 控制本地 app-server、手机 App 桥接桌面 Codex、Android/Termux/APK 内运行 Codex CLI。
  - <https://www.reddit.com/r/codex/comments/1rgkwji/built_a_mobile_app_to_use_codex_app_from_my_phone/>
  - <https://www.reddit.com/r/OpenAI/comments/1s7t3kg/how_codex_works_under_the_hood_app_server_remote/>
  - <https://www.reddit.com/r/codex/comments/1rlixy2/codex_app_on_android/>
- GitHub 上已有第三方开源 Web/手机控制项目，例如 codexUI 和 RemCodex；它们也都是“本地 Codex + 浏览器/手机轻客户端”的方向。
  - <https://github.com/friuns2/codexui>
  - <https://github.com/lupishan/remcodex>
- App Store 上已有第三方“Mobile IDE for Codex AI GPT”，描述为连接 Mac 上运行的 Codex，但这不是 OpenAI 官方 App。
  - <https://apps.apple.com/us/app/mobile-ide-for-codex-ai-gpt/id6761128531>

对本项目的判断：

- phone-codex 当前路线是合理的：用网页端做轻量控制台，比维护完整原生手机 App 更稳。
- 官方移动端 Codex 更偏云端任务；第三方生态更偏“本地/桌面 App Server + 手机轻客户端”。本项目属于后者。
- 真正的难点不是手机 UI，而是运行态、审批、权限、历史同步和桌面端同屏一致性。

## 已知问题

如果仓库路径包含中文等非 ASCII 字符，Codex 上游可能报：

- `x-codex-turn-metadata`
- `UTF-8 encoding error`

例如当前路径：

`/Users/mac/Documents/OpenClaw信息`

这类问题是 Codex 上游实现限制，不是手机网页本身的问题。若要彻底规避，请把仓库移动到纯英文路径，例如：

`/Users/mac/Documents/phone-codex`

## 开发说明

- 当前主入口是 [server.js](./server.js)
- 主要 HTTP / SSE / 线程逻辑在 [src/bridge/bridge-app.js](./src/bridge/bridge-app.js)
- 手机网页前端在 [public/app.js](./public/app.js)

## 归档说明

如果以后需要回看旧桌面 App 实现，只读归档，不要把它当成当前主线：

- [archive/legacy-desktop-app/README.md](./archive/legacy-desktop-app/README.md)
