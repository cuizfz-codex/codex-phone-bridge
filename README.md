# phone-codex

macOS 菜单栏控制器 + 本地网页：把 Codex 线程同步到手机网页端，并实现 Web -> Desktop 实时同步（无需手动刷新 thread）。

## 新线程一句话（必备）

开新线程时，直接发这句：

`先看本目录 CHANGELOG.md 和 THREAD-HANDOFF-2026-02-19.md，再继续。`

这样新线程会先读取修改历史和交接重点，避免重复排查。

## 更新说明 / Release Notes (v0.3.6)

### 中文

- 本版本已正式替代旧版 HTTP 方案，发布与推荐路径统一为 HTTPS。
- `Start-Phone-Codex.command` 强制 HTTPS，并自动准备 TLS 证书（优先 Tailscale 证书，失败回退自签）。
- 网页端语音按钮新增“不可用即灰色禁用”逻辑：浏览器不支持录音或页面非安全上下文时，按钮不可点击并显示原因。

### English

- This release replaces the old HTTP approach and standardizes the recommended path on HTTPS.
- `Start-Phone-Codex.command` now enforces HTTPS and auto-provisions TLS material (prefers Tailscale cert, then self-signed fallback).
- The web voice button is now disabled (grayed out) when recording is unavailable (unsupported browser or non-secure context).

## 历史版本 / Previous (v0.3.5)

### 中文

- 桌面控制页重构为双页面签：`界面` / `日志`，默认打开“界面”，首屏不再被日志挤占。
- 顶部语言选择改为滑块：`中文 <-> English`，切换更直观。
- 卡片顺序优化：`设备绑定`（含二维码）前置，更符合实际高频操作路径。
- `手机访问地址` 区域改为高级项默认展开，减少额外点击。
- 首次打开窗口尺寸优化：按屏幕工作区自适应更大初始尺寸，默认显示更完整。

### English

- Desktop control panel redesigned into two tabs: `Control` / `Logs`; default opens `Control` so logs no longer squeeze the main view.
- Language selector changed to a direct toggle: `中文 <-> English`.
- Card order optimized: `Device Binding` (with QR) is moved earlier for the primary workflow.
- `Phone URL` advanced settings are now expanded by default to reduce extra clicks.
- Initial window size is now adaptive to screen work area, so first open shows a more complete layout.

### 历史版本 / Previous (v0.3.4)

#### 中文

- 布局优化：把“语言切换 + 主题切换”从顶部工具区移入 `MENU` 侧栏，移动端顶栏更简洁，不再拥挤。
- 交互优化：顶部按钮文案固定显示 `MENU`（不随语言变化），中英用户都能直接识别入口。
- 语言逻辑优化：语言切换项采用“目标语言显示”：
  - 当前页面中文时，显示 `English`
  - 当前页面英文时，显示 `中文`
- 修复：发送区在添加图片后，输入框仍可持续输入文字（附件区并入 composer，且选图后自动聚焦输入框）。
- 保留既有安全策略：`Sync OFF / Emergency Disable` 仍可一键解除 WS 绑定，避免 Codex 1006 锁死。

#### English

- Layout update: moved `Language + Theme` switches from the top tools area into the `MENU` sidebar, so mobile top bar is no longer crowded.
- Interaction update: top-left button label is now always `MENU` (not translated), improving discoverability for both Chinese and English users.
- Language switch logic: now shows the target language:
  - Chinese UI shows `English`
  - English UI shows `中文`
- Fix: after attaching images, the text input remains usable (attachments are rendered inside composer, and image-pick auto-focuses the textarea).
- Safety unchanged: `Sync OFF / Emergency Disable` still guarantees WS unbind to prevent Codex 1006 lock.

### 历史版本 / Previous (v0.3.3)

- 上下文圆环与额度展示口径修正（含旧线程兜底读取 `rollout-*.jsonl`）。

## 快速使用 / Quick Start

### 中文

1. 下载并打开 `phone-codex.app`。  
2. 在控制页打开 `Sync ON`。  
3. 完全退出 Codex（`Cmd+Q`）并从 Dock 重新打开。  
4. 用手机扫码控制页二维码访问网页端。  
5. 若遇到 1006，点击 `Emergency Disable`，再重开 Codex。

### English

1. Open `phone-codex.app`.  
2. Turn `Sync ON` in the control panel.  
3. Fully quit Codex (`Cmd+Q`) and reopen it from Dock.  
4. Scan the QR code from your phone to open the web UI.  
5. If 1006 appears, click `Emergency Disable`, then reopen Codex.

## 你会得到什么

- `phone-codex.app`：菜单栏有图标，点开控制页
- 控制页支持 `中文 / English` 一键切换（语言选择会持久化）
- `Sync ON/OFF` 一键开关同步：
  - ON：启动本地网页（手机可访问）+ 启动 WS 代理，并把 Codex 桌面端“下一次启动”引导到同一条事件流
  - OFF：停止服务 + 清掉环境变量，彻底解除“WS 绑定”
- `Emergency Disable`：一键解除任何可能导致 `1006` 的 WS 绑定（并停止服务）

重要约束（按你的要求）：
- phone-codex **不会**代替你打开 Codex；Codex 必须由你自己从 Dock/Finder 打开/重启。

## 为什么需要 WS 代理（核心原理）

我们已在本机验证：`codex app-server` 在 WebSocket 模式下，对“多连接”并不稳定广播所有事件（可能看到 `turn/started` 但收不到 `turn/completed`）。

因此 phone-codex 采用 **Multiplex WS 代理**：
- 下游（多个客户端）：Codex 桌面端 + 本地网页 bridge 都连到同一个代理 `ws://127.0.0.1:<proxyPort>`
- 上游（单连接）：代理只维护一条到 `codex app-server` 的连接（stdio）
- 上游通知由代理广播给所有下游，从而实现真正实时一致

## 修复“Desktop 显示旧指令但执行新指令”

如果你遇到：手机网页发的指令可以被 Codex 正确执行/回答，但 Codex 桌面端对话里显示的 user prompt 仍是上一条旧指令。

phone-codex 的修复方式是：对 Codex Desktop 也注入 overlay，但只注入 **`turn/start` 响应已确认 turnId 的权威 overlay**（避免 N-1/错配）。

对应设置在控制页 `Advanced -> Desktop Overlay`：
- `Authoritative`（默认，推荐）：仅注入权威 overlay（最稳定）
- `Off`：关闭 Desktop overlay 注入（仅用于排障）

## 安全性：不再“绑死”Codex

导致 `Sign-in failed ... websocket closed (1006)` 的典型原因是：把 `CODEX_APP_SERVER_WS_URL` **全局注入**到 launchd，且当时 ws 端口不可用或握手失败。

另外我们已在本机验证：Codex 桌面端在 websocket transport 下，会**强制通过本机 SOCKS5**（`127.0.0.1:1080`）去连接 app-server；若该端口没有可用 SOCKS 服务，会直接在 Codex 里看到 `1006`。

phone-codex 的策略：
- 不安装任何“常驻注入 env”的 LaunchAgent
- 仅在 `Sync ON` 且预检通过时才 `launchctl setenv CODEX_APP_SERVER_WS_URL ...`
- `Sync OFF`、`Emergency Disable`、以及 phone-codex 退出时都会 `launchctl unsetenv ...`
- 运行中若代理异常，自动回滚并清 env，避免你下次从 Dock 打开 Codex 直接 1006
- `Sync ON` 时会启动一个**受限的本机 SOCKS5**（只允许连到 `127.0.0.1:<proxyPort>`），`Sync OFF` 时停止

## 已知问题：非 ASCII 路径可能导致 Codex upstream 连接失败

如果日志里出现 `x-codex-turn-metadata` / `UTF-8 encoding error`，这通常是 Codex 上游实现的限制：HTTP header 需要 ASCII，但 workspace 路径里包含中文等非 ASCII 字符。

Workaround：把本仓库移动/重命名到纯 ASCII 路径（例如 `/Users/<you>/Documents/phone-codex`），然后重启 `Sync ON`。

## 使用方式（推荐：App）

1. 从 GitHub Releases 下载并安装 `phone-codex`（.dmg/.zip）
2. 打开 `phone-codex.app`（菜单栏会出现图标）
3. 在控制页里把 `Sync` 打开（ON）
   - 如果提示端口被占用（如 `18791`/`8787`），请在控制页 `Advanced` 里修改端口，或先停止旧的服务再开启。
4. 按提示：在 Codex 里 `Cmd+Q` 彻底退出，然后从 Dock 重新打开 Codex
5. 扫描控制页的二维码，用手机打开网页端，开始发消息

如果 Codex 打开时出现 `1006`：
1. 打开 phone-codex 控制页
2. 点 `Emergency Disable`
3. 重新打开 Codex（应恢复正常）

## 外网访问（Tailscale）

phone-codex 支持“局域网 + Tailscale 外网访问”并行使用，默认远程模式为 `tailscale`。

1. 在 Mac 与手机上安装并登录 Tailscale（同一 tailnet）
2. 在 phone-codex 控制页确认：
   - `Bind Host = 0.0.0.0`
   - `Remote Mode = tailscale`
3. 点击 `Sync ON`
4. 控制页 `Remote Access` 卡片会显示：
   - Tailscale 连接状态
   - Tailscale IPv4 / MagicDNS
   - 可复制的远程 URL
5. 手机切到 4G/5G 时，确保手机端 Tailscale 已连接，然后访问远程 URL

说明：
- bridge 会按 `ALLOWED_CLIENT_CIDRS` 做来源 IP 白名单校验；默认只允许本机、私网和 tailnet 网段。
- 即使误配了路由器端口映射，非白名单来源也会被 `403` 拒绝。

## 首次配对与单手机绑定（默认 strict）

从当前版本开始，手机网页默认使用“设备签名认证”，不再依赖共享 token URL：

- 首次使用：
  1. 在桌面 `phone-codex` 控制页点 `Start Pairing`
  2. 手机打开配对链接（二维码）并输入桌面显示的 6 位验证码
  3. 配对成功后，手机会保存 `deviceId + deviceSecret`，后续 API 都用签名鉴权
- 绑定策略：
  - 同时只允许 1 台手机（再次配对会顶掉旧设备）
- 配对网络限制：
  - 仅允许同 LAN 或同 Tailnet 来源完成配对
- 丢手机恢复：
  - 在桌面控制页点 `Reset Binding`，旧手机立即失效，再重新配对

鉴权协议（v3）：
- Header（普通 API）：
  - `X-Device-Id`
  - `X-Device-Timestamp`
  - `X-Device-Nonce`
  - `X-Device-Signature`
- SSE（`/api/v2/events`）：
  - 使用 query 参数：`deviceId` / `ts` / `nonce` / `sig`
- 校验：
  - 时间窗 ±90 秒
  - nonce 10 分钟内不可复用
  - 签名算法：`HMAC-SHA256`

## 外网排障

- `Remote Access` 显示 `tailscale not installed`：
  - 安装 Tailscale 或在设置中改 `tailscale CLI Path`
- `tailscale not connected`：
  - 打开 Tailscale 客户端并确保 `status` 为 Running
- 控制页有 URL 但手机打不开：
  - 检查手机是否连上同一 tailnet
  - 检查 `Bind Host` 是否误设为 `127.0.0.1`
  - 检查控制页 `Allowed CIDRs` 是否把 tailnet 网段（`100.64.0.0/10`）去掉了

## 紧急回滚

1. 在控制页点击 `Emergency Disable`
2. 确认 `Sync OFF`
3. 如 Codex 仍异常，`Cmd+Q` 退出后重新打开 Codex

这样会清除 `CODEX_APP_SERVER_WS_URL` 绑定并停止代理，恢复普通启动路径。

## 开发与 CLI（Advanced）

### 运行 bridge（网页）CLI

```bash
cp .env.example .env
npm install
npm start
```

常用环境变量：
- `PORT=8787`
- `BIND_HOST=0.0.0.0`（手机访问）或 `127.0.0.1`（仅本机）
- `HTTPS_ENABLED=1`（旧 HTTP 方案已废弃；语音输入需要安全上下文）
- `HTTPS_CERT_FILE=/path/to/cert.pem`
- `HTTPS_KEY_FILE=/path/to/key.pem`
- `HTTPS_REDIRECT_PORT=0`（可选，>0 时额外启用 http->https 跳转端口）
- `ALLOWED_CLIENT_CIDRS=127.0.0.1/8,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,100.64.0.0/10,fc00::/7`
- `REMOTE_MODE=tailscale|off`
- `DEVICE_AUTH_MODE=strict|hybrid|off`（默认 strict）
- `LEGACY_TOKEN_MODE=off|on`（默认 off）
- `PAIRING_CODE_LENGTH=6`
- `PAIRING_TTL_SEC=300`
- `PAIRING_NETWORK_CIDRS=10.0.0.0/8,...`
- `DEVICE_AUTH_STATE_PATH=./data/device-binding.json`

### 运行桌面 App（Electron）

```bash
npm install
cd desktop
npm install
npm run dev
```

## GitHub Actions（Release）

本仓库包含 macOS 打包工作流：构建 `phone-codex.app` 并产出 `.dmg/.zip`。
