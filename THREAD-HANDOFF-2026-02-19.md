# Phone-Codex 线程交接记录（2026-02-19）

## 0) 交接快照
- 分支：`main`
- 基线提交：`d23f05e`（交接时工作区未提交）
- 工作区状态：存在较多已修改与未跟踪文件，属于“进行中”状态，不是干净工作区。

## 1) 本线程目标
- 对比 `claudecodeui` 与 `phone-codex` 的差异。
- 处理“网页端问答 vs Codex 桌面端问答显示不一致”的同步问题。
- 简化手机访问方式，减少/去掉配对与 token 复杂度。
- 参考 `claudecodeui` 的视觉风格优化网页 UI（不改总体布局）。
- 提供无需命令行的启动方式（双击即可启动/停止服务）。

## 2) 已完成工作（核心）

### A. 同步机制与显示一致性修复
- 在 WS 代理层强化了“权威输入（authoritative overlay）”策略，降低桌面端出现 N-1 用户消息或旧提示词显示的概率。
- 引入/增强了 turn correction 逻辑，覆盖 `turn/started`、`codex/event` 等形态。
- 增加了对应测试文件，覆盖 overlay 注入、纠偏、authoritative gate 等场景。

主要文件：
- `src/codex-ws-proxy.js`
- `src/proxy/overlay-manager.js`
- `test/overlay-manager.test.js`
- `test/proxy-turn-correction.test.js`

### B. 认证/接入简化（向“直接网址访问”靠拢）
- 后端新增简化登录接口：
- `GET /api/auth/status`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `REQUIRE_LOGIN=0` 时默认开放访问（open mode）；`REQUIRE_LOGIN=1` 时启用密码+session cookie。
- `/api/v2/*` 改为基于 open/session 鉴权。
- `/api/v3/*` 统一返回 `410`（提示配对 API 已移除）。

主要文件：
- `src/bridge/bridge-app.js`

### C. Web UI 风格调整（参考 claude code ui）
- 在不重排整体布局的前提下，调整了比例、视觉层级和样式细节（含登录弹窗与页面风格相关改动）。

主要文件：
- `public/index.html`
- `public/app.js`
- `public/styles.css`

### D. 桌面控制页联动项
- 增加/完善了 Desktop Overlay 模式（`authoritative/off`）在桌面端配置与同步服务中的透传。

主要文件：
- `desktop/renderer/renderer.js`
- `desktop/main/sync-service.js`

### E. 双击启动/停止脚本（免命令行）
- 新增启动脚本：
- `Start-Phone-Codex.command`
- 新增停止脚本：
- `Stop-Phone-Codex.command`
- 脚本已设置可执行权限（`chmod +x` 已完成）。
- 新增配置模板：
- `launcher.env.example`
- 新增忽略项：
- `.gitignore`（忽略 `launcher.env`、runtime pid/log）。

## 3) 可直接使用方式（当前）
- 双击 `Start-Phone-Codex.command` 启动。
- 双击 `Stop-Phone-Codex.command` 停止。
- 默认端口 `8787`，默认 `BIND_HOST=0.0.0.0`（局域网手机可访问）。
- 如需密码登录：复制 `launcher.env.example` 为 `launcher.env`，设置：
- `REQUIRE_LOGIN=1`
- `SIMPLE_LOGIN_PASSWORD=<你的密码>`

## 4) 验证结果
- 单元测试通过（2026-02-19）：`npm test` -> `26 passed, 0 failed`。
- 启停脚本语法检查通过：`bash -n`。
- 启动脚本在本机可完成健康检查并打印本机/LAN URL。

## 5) 当前未完成/遗留项（建议新线程优先）
- README 仍包含大量旧的 v3 pairing 说明，和当前“简化登录/open mode”实现不一致。
- Web/desktop 代码里仍保留 pairing 相关 UI 与逻辑（尤其 `public/app.js`、`desktop/renderer/renderer.js` 中仍有配对文本和流程代码），尚未彻底清理。
- 工作区存在较多未跟踪文件（例如顶层 `app.js`、`codex-ws-proxy.js`、`device-auth.js`、`desktop/app.js` 等），需确认哪些是新结构需要保留，哪些是历史/临时产物。

## 6) 建议新线程直接接手的任务顺序
1. 先做“文档与实现对齐”：更新 README 与 `.env.example`（明确 open/password 模式，移除或降级 pairing 描述）。
2. 再做“配对功能彻底收口”：决定保留兼容壳还是完全删除 v3/pairing 前端流程。
3. 最后做“仓库清理与发布准备”：确认未跟踪文件归属，删除无用副本，整理发布清单。

## 7) 新线程可直接复制的上下文提示词
"请基于 `THREAD-HANDOFF-2026-02-19.md` 继续。优先完成 README 与当前 open/password 登录机制对齐，然后评估并清理残留 pairing UI/逻辑。"

## 8) 本轮补充（2026-02-19，继续修复 Web->Desktop 显示错位）
- 现象复核：
- Web 端 turn 能执行并返回正确答案，但 Desktop 偶发显示为上一条问题文本（答案却对应新问题）。
- 关键观测：
- 上游经常发出 `turn/started` 且 `items` 为空（缺 userMessage）。
- 这会导致 Desktop 在渲染提问气泡时容易沿用上一条已知 userMessage。
- 已实施修复（核心）：
- 文件：`src/codex-ws-proxy.js`
- 策略从“广泛事件改写”收敛为“最小修正”。
- 在 `turn/started` 且缺 `userMessage` 时，基于 authoritative overlay 对 Desktop 触发最小纠偏。
- 纠偏路径中避免再次发送合成 `turn/started`（`sendTurnStarted:false`），减少事件形态干扰。
- 增加每 turn 去重缓存 `userMessageEventSeenByTurn`，防止重复 `user_message` 修正广播。
- 验证与打包：
- `npm test` 通过（`26 passed, 0 failed`）。
- 重新打包：`desktop/dist/mac-arm64/phone-codex.app`
- 当前状态：
- 代码与包均已更新；最终以用户实机在目标线程完成 1+1 到 10+10 序列验收为准。
