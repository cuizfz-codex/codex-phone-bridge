# Changelog

All notable changes to `phone-codex` will be documented in this file.

## v0.3.5 - 2026-02-19

### Added / Changed
- Investigated the remaining Desktop mismatch symptom: web-originated turns executed correctly but Desktop sometimes rendered the previous user prompt.
- Confirmed runtime package mismatch risk and re-packed desktop app to ensure latest proxy logic is shipped in:
  - `desktop/dist/mac-arm64/phone-codex.app`
- Refined WS proxy correction strategy in `src/codex-ws-proxy.js`:
  - Keep notification alignment minimal (prefer content correction, avoid broad event-shape rewriting).
  - Trigger Desktop correction after `turn/started` when upstream omits `userMessage`.
  - Use minimal Desktop-side correction payloads and avoid re-sending synthetic `turn/started` in this path.
  - Add idempotency guard map for user-message correction events per turn (`userMessageEventSeenByTurn`) to prevent duplicate correction emissions.

### Test
- Local test suite passed after the above changes:
  - `npm test` => `26 passed, 0 failed`.

### Verification Status
- Runtime/log verification performed for proxy paths and correction triggers.
- End-to-end UI correctness for the full web->desktop arithmetic sequence remains pending final user acceptance test in real session.

---

## v0.3.5 - 2026-02-19（中文）

### 新增 / 变更
- 针对“Web 发起问题执行正确，但 Codex Desktop 偶发显示上一条问题”的残留问题继续排查与收敛。
- 确认并处理“运行包版本与源码不一致”的风险，已重新打包桌面应用：
  - `desktop/dist/mac-arm64/phone-codex.app`
- 在 `src/codex-ws-proxy.js` 中调整修正策略：
  - 通知修正改为“最小改动优先”（优先校正文案，避免大范围改写事件结构）。
  - 当上游 `turn/started` 缺失 `userMessage` 时，再触发 Desktop 侧修正。
  - 该路径不再重复发送合成的 `turn/started`，仅保留最小必要修正。
  - 新增每 turn 的去重保护 `userMessageEventSeenByTurn`，避免重复发送 user_message 修正事件。

### 测试
- 以上改动后，本地测试通过：
  - `npm test` => `26 passed, 0 failed`。

### 验收状态
- 代理路径与日志行为已验证。
- 完整 Web->Desktop 算术序列的最终 UI 一致性，仍待用户实机最终验收确认。

---

## v0.3.4 - 2026-02-17

### Added / Changed
- Moved web `Language` and `Theme` switches from top tools into the `MENU` sidebar card.
- Top-left web button label is now always `MENU`.
- Language switch now displays target language:
  - Chinese UI shows `English`
  - English UI shows `中文`
- Updated composer attachment layout so image/voice pending cards are rendered inside composer.

### Fixed
- Fixed mobile web issue where text input appeared unavailable after attaching an image.
- Auto-focus textarea after image selection to keep message typing flow continuous.

### Safety
- Kept existing `Sync OFF / Emergency Disable` rollback behavior for WS unbind and 1006 protection.

---

## v0.3.4 - 2026-02-17（中文）

### 新增 / 变更
- 网页“语言/主题”开关从顶部工具区迁移到 `MENU` 侧栏卡片。
- 网页左上按钮固定显示 `MENU`。
- 语言切换改为显示“目标语言”：
  - 中文界面显示 `English`
  - 英文界面显示 `中文`
- 调整发送区附件布局：图片/语音待发送卡片并入 composer 内部。

### 修复
- 修复手机网页中“添加图片后文本输入体验异常”的问题。
- 选择图片后自动聚焦输入框，保证可继续输入文字并发送。

### 安全
- 保留 `Sync OFF / Emergency Disable` 的 WS 回滚机制，持续规避 1006 锁死问题。
