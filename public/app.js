const elements = {
  sidebar: document.querySelector("#sidebar"),
  backdrop: document.querySelector("#sidebar-backdrop"),
  menuToggle: document.querySelector("#menu-toggle"),
  openSettings: document.querySelector("#open-settings"),
  settingsDialog: document.querySelector("#settings-dialog"),
  settingsForm: document.querySelector("#settings-form"),
  cancelSettings: document.querySelector("#cancel-settings"),
  mainTop: document.querySelector(".main-top"),
  loginDialog: document.querySelector("#login-dialog"),
  loginForm: document.querySelector("#login-form"),
  loginPassword: document.querySelector("#login-password"),
  loginStatus: document.querySelector("#login-status"),
  serverBase: document.querySelector("#server-base"),
  serverBasePreset: document.querySelector("#server-base-preset"),
  authToken: document.querySelector("#auth-token"),
  openPairing: document.querySelector("#open-pairing"),
  pairingBanner: document.querySelector("#pairing-banner"),
  pairingBannerBtn: document.querySelector("#pairing-banner-btn"),
  pairingDialog: document.querySelector("#pairing-dialog"),
  pairingForm: document.querySelector("#pairing-form"),
  cancelPairing: document.querySelector("#cancel-pairing"),
  pairingId: document.querySelector("#pairing-id"),
  pairingDeviceName: document.querySelector("#pairing-device-name"),
  pairingCode: document.querySelector("#pairing-code"),
  scanPairingBtn: document.querySelector("#scan-pairing-btn"),
  scanPairingPhotoBtn: document.querySelector("#scan-pairing-photo-btn"),
  stopPairingScanBtn: document.querySelector("#stop-pairing-scan-btn"),
  pairingQrFile: document.querySelector("#pairing-qr-file"),
  pairingScanner: document.querySelector("#pairing-scanner"),
  pairingScannerVideo: document.querySelector("#pairing-scanner-video"),
  pairingScannerHint: document.querySelector("#pairing-scanner-hint"),
  pairingStatus: document.querySelector("#pairing-status"),
  statusBar: document.querySelector("#status-bar"),
  threadList: document.querySelector("#thread-list"),
  threadSearch: document.querySelector("#thread-search"),
  sourceFilter: document.querySelector("#source-filter"),
  archivedToggle: document.querySelector("#archived-toggle"),
  desktopCompatibleToggle: document.querySelector("#desktop-compatible-toggle"),
  lockBanner: document.querySelector("#lock-banner"),
  lockBannerText: document.querySelector("#lock-banner-text"),
  unlockThreadBtn: document.querySelector("#unlock-thread-btn"),
  refreshThreadsBtn: document.querySelector("#refresh-threads-btn"),
  newThreadBtn: document.querySelector("#new-thread-btn"),
  threadTitle: document.querySelector("#thread-title"),
  threadMeta: document.querySelector("#thread-meta"),
  sidebarStatus: document.querySelector("#sidebar-status"),
  contextWidget: document.querySelector("#context-widget"),
  contextRing: document.querySelector("#context-ring"),
  contextUsageText: document.querySelector("#context-usage-text"),
  contextPctText: document.querySelector("#context-pct-text"),
  sidebarContextRing: document.querySelector("#sidebar-context-ring"),
  sidebarContextUsageText: document.querySelector("#sidebar-context-usage"),
  sidebarContextPctText: document.querySelector("#sidebar-context-pct"),
  quotaWidget: document.querySelector("#quota-widget"),
  quota5hText: document.querySelector("#quota-5h-text"),
  quota7dText: document.querySelector("#quota-7d-text"),
  sidebarQuota5hRing: document.querySelector("#sidebar-quota-5h-ring"),
  sidebarQuota7dRing: document.querySelector("#sidebar-quota-7d-ring"),
  sidebarQuota5hText: document.querySelector("#sidebar-quota-5h"),
  sidebarQuota7dText: document.querySelector("#sidebar-quota-7d"),
  langToggle: document.querySelector("#lang-toggle"),
  langToggleTarget: document.querySelector("#lang-toggle-target"),
  themeToggle: document.querySelector("#theme-toggle"),
  themeToggleCurrent: document.querySelector("#theme-toggle-current"),
  chat: document.querySelector("#chat"),
  approvalsPanel: document.querySelector("#approval-panel"),
  approvalList: document.querySelector("#approval-list"),
  composer: document.querySelector("#composer"),
  composerToggle: document.querySelector("#composer-toggle"),
  attachments: document.querySelector("#attachments"),
  input: document.querySelector("#message-input"),
  sendBtn: document.querySelector("#send-btn"),
  imagePicker: document.querySelector("#image-picker"),
  pickImageBtn: document.querySelector("#pick-image-btn"),
  voiceBtn: document.querySelector("#voice-btn"),
  pendingImages: document.querySelector("#pending-images"),
  pendingVoice: document.querySelector("#pending-voice"),
};

const storageKeys = {
  baseUrl: "codex_v2_base_url",
  token: "codex_v2_auth_token",
  deviceId: "codex_v3_device_id",
  deviceSecret: "codex_v3_device_secret",
  pairingId: "codex_v3_pairing_id",
  pairingCode: "codex_v3_pairing_code",
  pairingAuto: "codex_v3_pairing_auto",
  pairingMode: "codex_v3_pairing_mode",
  deviceName: "codex_v3_device_name",
  lockedThreadId: "codex_v2_locked_thread_id",
  initialThreadId: "codex_v2_initial_thread_id",
  desktopCompatibleMode: "codex_v2_desktop_compatible_mode",
  theme: "codex_v2_theme",
  language: "codex_v2_language",
};

const legacyStorageKeys = {
  baseUrl: "codex_bridge_base_url",
  token: "codex_bridge_auth_token",
};

// Codex Desktop does not always surface every source kind in its sidebar.
// In "desktop compatible mode", default to a subset to better match the desktop UI.
const DESKTOP_COMPAT_SOURCE_KINDS = ["vscode", "cli", "appServer", "unknown"];
const RATE_LIMIT_POLL_MS = 60000;
const INPUT_ACTIVITY_HOLD_MS = 1200;
const LIVE_DELTA_RENDER_INTERVAL_MS = 120;
const DEFAULT_LANGUAGE = "zh";

const I18N = {
  zh: {
    "page.title": "Codex 手机 Threads",
    "sidebar.subtitle": "手机端控制台",
    "btn.settings": "设置",
    "btn.newThread": "新建 Thread",
    "btn.refresh": "刷新",
    "btn.mobilePair": "手机配对",
    "btn.unlockThread": "解除单线程锁定",
    "btn.menu": "菜单",
    "btn.openComposer": "展开输入",
    "btn.hideComposer": "收起输入",
    "btn.goPairing": "去配对",
    "btn.image": "图片",
    "btn.voice": "语音",
    "btn.voiceStop": "停止",
    "btn.send": "发送",
    "btn.cancel": "取消",
    "btn.save": "保存",
    "btn.login": "登录",
    "btn.completePairing": "完成配对",
    "btn.scanPairing": "扫码配对",
    "btn.scanFromPhoto": "从照片识别",
    "btn.stopScan": "停止扫码",
    "input.searchThreads": "搜索 thread 关键词...",
    "input.message": "输入消息，支持文本 + 图片 + 语音转写",
    "label.source": "来源",
    "label.includeArchived": "包含归档",
    "label.desktopCompatible": "桌面一致视图（隐藏过程更新）",
    "label.context": "上下文",
    "label.quotaRemaining": "额度剩余",
    "label.language": "语言",
    "label.langLeft": "中",
    "label.langRight": "英",
    "label.theme": "主题",
    "label.themeLeft": "亮",
    "label.themeRight": "暗",
    "menu.language": "语言",
    "menu.theme": "主题",
    "menu.themeLight": "亮色",
    "menu.themeDark": "暗色",
    "option.all": "全部",
    "thread.selectPrompt": "请选择一个线程",
    "status.initializing": "初始化中...",
    "pairing.banner":
      "当前设备未绑定。请在桌面 phone-codex 控制页点击 Start Pairing 后扫码，通常会自动完成首次配对。",
    "approval.title": "审批请求",
    "settings.title": "连接设置",
    "settings.server": "服务器地址",
    "settings.serverPlaceholder": "自动检测（默认使用当前访问地址）",
    "settings.quickPick": "快速选择地址",
    "settings.quickPickPlaceholder": "请选择地址...",
    "settings.addr.current": "当前访问",
    "settings.addr.saved": "已保存",
    "settings.addr.local": "本机地址",
    "settings.addr.lan": "局域网地址",
    "settings.addr.tailscaleIp": "Tailscale IP",
    "settings.addr.magicDns": "MagicDNS",
    "settings.addr.detected": "自动发现",
    "settings.token": "管理 Token（仅本机管理接口）",
    "settings.tokenPlaceholder": "可留空",
    "settings.note":
      "无需 token 或配对；若服务器开启密码模式，会自动弹出登录框。",
    "login.title": "访问登录",
    "login.hint": "输入访问密码后继续；若服务器处于开放模式，将自动进入。",
    "login.password": "访问密码",
    "login.passwordPlaceholder": "留空表示无密码",
    "login.submitting": "登录中...",
    "login.failed": "登录失败: {error}",
    "pairing.title": "首次配对",
    "pairing.hint":
      "扫描桌面端配对二维码后会自动绑定。若自动失败，可手动填写 Pairing ID + 验证码。",
    "pairing.deviceName": "设备名称",
    "pairing.code": "验证码",
    "pairing.idPlaceholder": "从配对链接自动填充",
    "pairing.deviceNamePlaceholder": "iPhone / Android",
    "pairing.codePlaceholder": "6位验证码",
    "pairing.sessionDetected": "检测到配对会话。若二维码包含验证码将自动完成；失败时可手动输入。",
    "pairing.unauthorized":
      "当前未授权访问。请在桌面端控制页点击 Start Pairing，并扫码后自动绑定；若自动失败请手动输入验证码。",
    "pairing.idRequired": "配对 ID 不能为空",
    "pairing.codeRequired": "验证码不能为空",
    "pairing.inProgress": "配对中...",
    "pairing.successReconnecting": "配对成功，正在重连...",
    "pairing.autoBinding": "检测到配对二维码，自动绑定中...",
    "pairing.failed": "配对失败: {error}",
    "pairing.autoFailed": "自动配对失败: {error}",
    "pairing.scanStarting": "正在打开相机...",
    "pairing.scanCameraHint": "将二维码放入取景框，识别后会自动配对。",
    "pairing.scanNotSupported": "当前浏览器不支持相机扫码，请使用“从照片识别”。",
    "pairing.scanNoQr": "未识别到二维码，请重试。",
    "pairing.scanFound": "已识别二维码，正在处理...",
    "pairing.scanNeedCode": "已识别 Pairing ID，请补充验证码后完成配对。",
    "pairing.scanNoPairingData": "二维码中未找到配对信息。",
    "pairing.scanFailed": "扫码失败: {error}",
    "pairing.scanFallbackPhoto": "当前环境不支持实时扫码，已切换到拍照识别。",
    "status.readQuotaFailed": "读取限额失败: {error}",
    "status.onlineLocked": "在线（锁定线程 {id}...）",
    "status.online": "在线",
    "status.initFailed": "初始化失败: {error}",
    "status.authRequired": "需要登录后才能继续",
    "status.loginSuccess": "登录成功，正在连接...",
    "status.settingsSavedReconnect": "设置已保存，正在重连...",
    "status.refreshFailed": "刷新失败: {error}",
    "status.newThreadLocked": "已锁定单线程，不允许新建线程",
    "status.newThreadFailed": "新建失败: {error}",
    "status.searchFailed": "搜索失败: {error}",
    "status.filterFailed": "筛选失败: {error}",
    "status.unlockLoadFailed": "解除锁定后加载失败: {error}",
    "status.unlocked": "已解除单线程锁定",
    "status.openThreadFailed": "打开 thread 失败: {error}",
    "status.renameFailed": "重命名失败: {error}",
    "status.archiveFailed": "归档失败: {error}",
    "status.unarchiveFailed": "取消归档失败: {error}",
    "status.forkFailed": "Fork 失败: {error}",
    "status.imageUploadFailed": "图片上传失败: {error}",
    "status.voiceFailed": "语音失败: {error}",
    "status.approvalSubmitFailed": "审批提交失败: {error}",
    "status.sendFailed": "发送失败: {error}",
    "status.sseConnected": "已连接（SSE）",
    "status.sseFlaky": "SSE 连接波动，自动重连中...",
    "status.reconnecting": "重连中 (attempt={attempt})",
    "status.syncState": "同步状态: {status}",
    "status.approvalPending": "审批待处理: {method}",
    "status.error": "错误: {message}",
    "status.threadsCount": "线程数: {count}",
    "status.threadLocked": "已锁定线程 {id}...",
    "status.threadLoaded": "已加载线程 {id}... · 回合 {turns}",
    "status.approvalSubmitted": "审批已提交: {decision}",
    "status.sending": "发送中...",
    "status.sentTurn": "已发送到线程 {id}... · 回合 {turnId}",
    "status.sentThread": "已发送到线程 {id}...",
    "status.voiceUploadFailed": "语音上传失败: {error}",
    "status.recordingProgress": "录音中... {text}",
    "status.recording": "录音中...",
    "status.voiceSaved": "语音已保存并待发送",
    "thread.lockBanner":
      "当前仅显示锁定线程 {id}...；点击下方可恢复全部 project。",
    "thread.emptyList": "没有可显示的线程。",
    "thread.emptyPreview": "(空白线程)",
    "thread.archived": "已归档",
    "thread.action.rename": "改名",
    "thread.action.archive": "归档",
    "thread.action.unarchive": "取消归档",
    "thread.action.fork": "分叉",
    "thread.projectCount": "{count} 线程",
    "thread.turnsCount": "回合 {count}",
    "thread.turnHeader": "轮次 {id} · {status}",
    "thread.noContent": "该线程还没有对话内容。",
    "thread.execHint": " · (桌面端可能不显示 exec 来源线程)",
    "thread.archivedHint": " · 已归档",
    "thread.hiddenAgent": "已隐藏过程更新 {count} 条（桌面一致视图）",
    "thread.titleWithId": "线程 {id}",
    "item.commandSummary": "命令 · {status}",
    "item.fileChangeSummary": "文件变更 · {status}",
    "item.noImage": "无法显示图片: {alt}",
    "item.liveTitle": "助手（实时输出）",
    "item.reasoning": "推理",
    "item.plan": "计划",
    "item.noOutput": "(无输出)",
    "approval.accept": "接受",
    "approval.acceptSession": "会话放行",
    "approval.decline": "拒绝",
    "approval.cancel": "取消",
    "prompt.renameThread": "输入新线程名",
    "voice.remove": "移除",
    "voice.notSupported": "当前浏览器不支持录音",
    "voice.title": "语音: {id}...",
    "voice.transcriptPlaceholder": "可编辑转写文本",
    "voice.removeVoice": "移除语音",
    "context.title": "上下文窗口使用率",
    "context.noWindow": "上下文窗口大小不可用",
    "context.tooltip":
      "上下文（last.inputTokens）：已用 {used} / {window}，剩余 {remain} tokens",
    "quota.tooltip": "Codex 限额剩余：5h {p} · 7d {s}",
    "tooltip.contextUsage": "上下文窗口使用率",
    "tooltip.quotaUsage": "Codex 限额剩余（来自 account/rateLimits/read）",
    "tooltip.languageToggle": "切换中英文显示",
    "tooltip.themeToggle": "切换浅色/深色主题",
    "status.prefix": "状态: {text}",
    "error.cannotDetermineThread": "无法确定 thread id",
    "error.deviceNotPaired": "当前设备未配对",
    "error.fileReader": "读取文件失败",
    "error.blobReader": "读取音频失败",
  },
  en: {
    "page.title": "Codex Mobile Threads",
    "sidebar.subtitle": "Mobile Console",
    "btn.settings": "Settings",
    "btn.newThread": "New Thread",
    "btn.refresh": "Refresh",
    "btn.mobilePair": "Pair Device",
    "btn.unlockThread": "Unlock Thread Lock",
    "btn.menu": "Menu",
    "btn.openComposer": "Open composer",
    "btn.hideComposer": "Collapse composer",
    "btn.goPairing": "Pair Now",
    "btn.image": "Image",
    "btn.voice": "Voice",
    "btn.voiceStop": "Stop",
    "btn.send": "Send",
    "btn.cancel": "Cancel",
    "btn.save": "Save",
    "btn.login": "Log in",
    "btn.completePairing": "Complete Pairing",
    "btn.scanPairing": "Scan QR",
    "btn.scanFromPhoto": "Scan from Photo",
    "btn.stopScan": "Stop Scan",
    "input.searchThreads": "Search thread keywords...",
    "input.message": "Type a message, supports text + image + voice transcript",
    "label.source": "Source",
    "label.includeArchived": "Include archived",
    "label.desktopCompatible": "Desktop-compatible view (hide intermediate updates)",
    "label.context": "Context",
    "label.quotaRemaining": "Quota Left",
    "label.language": "Language",
    "label.langLeft": "ZH",
    "label.langRight": "EN",
    "label.theme": "Theme",
    "label.themeLeft": "L",
    "label.themeRight": "D",
    "menu.language": "Language",
    "menu.theme": "Theme",
    "menu.themeLight": "Light",
    "menu.themeDark": "Dark",
    "option.all": "All",
    "thread.selectPrompt": "Select a Thread",
    "status.initializing": "Initializing...",
    "pairing.banner":
      "This device is not paired. Click Start Pairing in desktop phone-codex and scan the QR code. Pairing usually completes automatically.",
    "approval.title": "Approvals",
    "settings.title": "Connection Settings",
    "settings.server": "Server URL",
    "settings.serverPlaceholder": "Auto-detected (defaults to current page origin)",
    "settings.quickPick": "Quick address picker",
    "settings.quickPickPlaceholder": "Select an address...",
    "settings.addr.current": "Current entry",
    "settings.addr.saved": "Saved",
    "settings.addr.local": "Localhost",
    "settings.addr.lan": "LAN",
    "settings.addr.tailscaleIp": "Tailscale IP",
    "settings.addr.magicDns": "MagicDNS",
    "settings.addr.detected": "Discovered",
    "settings.token": "Admin token (local management endpoints only)",
    "settings.tokenPlaceholder": "Optional",
    "settings.note":
      "No token or pairing required. If password mode is enabled, a login dialog appears automatically.",
    "login.title": "Access Login",
    "login.hint":
      "Enter the access password to continue. If server runs in open mode, you'll be connected automatically.",
    "login.password": "Password",
    "login.passwordPlaceholder": "Leave empty if no password",
    "login.submitting": "Logging in...",
    "login.failed": "Login failed: {error}",
    "pairing.title": "First-time Pairing",
    "pairing.hint":
      "Scan the desktop pairing QR code to auto-bind. If auto-pair fails, enter Pairing ID + code manually.",
    "pairing.deviceName": "Device Name",
    "pairing.code": "Code",
    "pairing.idPlaceholder": "Auto-filled from pairing URL",
    "pairing.deviceNamePlaceholder": "iPhone / Android",
    "pairing.codePlaceholder": "6-digit code",
    "pairing.sessionDetected":
      "Pairing session detected. If the QR includes a code, pairing will auto-complete. If it fails, enter it manually.",
    "pairing.unauthorized":
      "Unauthorized. Click Start Pairing on desktop, then scan for auto-bind. If auto-bind fails, enter the code manually.",
    "pairing.idRequired": "Pairing ID is required",
    "pairing.codeRequired": "Pairing code is required",
    "pairing.inProgress": "Pairing...",
    "pairing.successReconnecting": "Paired. Reconnecting...",
    "pairing.autoBinding": "Pairing QR detected. Auto-binding...",
    "pairing.failed": "Pairing failed: {error}",
    "pairing.autoFailed": "Auto-pair failed: {error}",
    "pairing.scanStarting": "Opening camera...",
    "pairing.scanCameraHint": "Place the QR code inside the frame. Pairing will run automatically.",
    "pairing.scanNotSupported": "Camera QR scanning is not supported here. Use Scan from Photo.",
    "pairing.scanNoQr": "No QR code detected. Please try again.",
    "pairing.scanFound": "QR detected. Processing...",
    "pairing.scanNeedCode": "Pairing ID detected. Enter the code to finish pairing.",
    "pairing.scanNoPairingData": "No pairing data found in QR code.",
    "pairing.scanFailed": "Scan failed: {error}",
    "pairing.scanFallbackPhoto": "Live camera scan is unavailable here. Switched to photo scan.",
    "status.readQuotaFailed": "Failed to read quotas: {error}",
    "status.onlineLocked": "Online (locked to thread {id}...)",
    "status.online": "Online",
    "status.initFailed": "Initialization failed: {error}",
    "status.authRequired": "Login is required before continuing",
    "status.loginSuccess": "Login successful, connecting...",
    "status.settingsSavedReconnect": "Settings saved. Reconnecting...",
    "status.refreshFailed": "Refresh failed: {error}",
    "status.newThreadLocked": "Thread is locked. Creating a new thread is disabled.",
    "status.newThreadFailed": "Create failed: {error}",
    "status.searchFailed": "Search failed: {error}",
    "status.filterFailed": "Filter failed: {error}",
    "status.unlockLoadFailed": "Reload after unlock failed: {error}",
    "status.unlocked": "Thread lock removed",
    "status.openThreadFailed": "Open thread failed: {error}",
    "status.renameFailed": "Rename failed: {error}",
    "status.archiveFailed": "Archive failed: {error}",
    "status.unarchiveFailed": "Unarchive failed: {error}",
    "status.forkFailed": "Fork failed: {error}",
    "status.imageUploadFailed": "Image upload failed: {error}",
    "status.voiceFailed": "Voice failed: {error}",
    "status.approvalSubmitFailed": "Approval submit failed: {error}",
    "status.sendFailed": "Send failed: {error}",
    "status.sseConnected": "Connected (SSE)",
    "status.sseFlaky": "SSE unstable, auto-reconnecting...",
    "status.reconnecting": "Reconnecting (attempt={attempt})",
    "status.syncState": "Sync status: {status}",
    "status.approvalPending": "Approval pending: {method}",
    "status.error": "Error: {message}",
    "status.threadsCount": "Threads: {count}",
    "status.threadLocked": "Thread locked: {id}...",
    "status.threadLoaded": "Thread {id} loaded · turns {turns}",
    "status.approvalSubmitted": "Approval submitted: {decision}",
    "status.sending": "Sending...",
    "status.sentTurn": "Sent to thread {id}... · turn {turnId}",
    "status.sentThread": "Sent to thread {id}...",
    "status.voiceUploadFailed": "Voice upload failed: {error}",
    "status.recordingProgress": "Recording... {text}",
    "status.recording": "Recording...",
    "status.voiceSaved": "Voice saved and queued",
    "thread.lockBanner":
      "Only locked thread {id}... is shown. Use the button below to restore all projects.",
    "thread.emptyList": "No threads to display.",
    "thread.emptyPreview": "(empty thread)",
    "thread.archived": "archived",
    "thread.action.rename": "Rename",
    "thread.action.archive": "Archive",
    "thread.action.unarchive": "Unarchive",
    "thread.action.fork": "Fork",
    "thread.projectCount": "{count} threads",
    "thread.turnsCount": "turns {count}",
    "thread.turnHeader": "Turn {id} · {status}",
    "thread.titleWithId": "Thread {id}",
    "thread.noContent": "This thread has no messages yet.",
    "thread.execHint": " · (exec-source threads may be hidden on desktop)",
    "thread.archivedHint": " · archived",
    "thread.hiddenAgent": "{count} intermediate updates hidden (desktop-compatible view)",
    "item.commandSummary": "Command · {status}",
    "item.fileChangeSummary": "File Change · {status}",
    "item.noImage": "Cannot display image: {alt}",
    "item.liveTitle": "Assistant (live output)",
    "item.reasoning": "Reasoning",
    "item.plan": "Plan",
    "item.noOutput": "(no output)",
    "approval.accept": "Approve",
    "approval.acceptSession": "Approve Session",
    "approval.decline": "Decline",
    "approval.cancel": "Cancel",
    "prompt.renameThread": "Enter new thread name",
    "voice.remove": "Remove",
    "voice.notSupported": "This browser does not support audio recording",
    "voice.title": "Voice: {id}...",
    "voice.transcriptPlaceholder": "Editable transcript",
    "voice.removeVoice": "Remove voice",
    "context.title": "Context window usage",
    "context.noWindow": "Context window size unavailable",
    "context.tooltip":
      "Context (last.inputTokens): used {used} / {window}, remaining {remain} tokens",
    "quota.tooltip": "Codex quota left: 5h {p} · 7d {s}",
    "tooltip.contextUsage": "Context window usage",
    "tooltip.quotaUsage": "Codex quota left (from account/rateLimits/read)",
    "tooltip.languageToggle": "Switch Chinese / English",
    "tooltip.themeToggle": "Switch Light / Dark theme",
    "status.prefix": "Status: {text}",
    "error.cannotDetermineThread": "Cannot determine thread id",
    "error.deviceNotPaired": "Device not paired",
    "error.fileReader": "FileReader failed",
    "error.blobReader": "Blob reader failed",
  },
};

const state = {
  loadingThreads: false,
  loadingThread: false,
  threadLoadSeq: 0,
  sending: false,
  threads: [],
  projects: [],
  expandedProjectKey: null,
  projectCollapsedByUser: false,
  selectedThreadId: null,
  selectedThread: null,
  selectedThreadUsage: null,
  initialThreadId: null,
  lockedThreadId: null,
  desktopCompatibleMode: true,
  forceScrollToBottom: false,
  chatScrollLocked: false,
  threadUsageById: new Map(),
  pendingApprovals: [],
  pendingImages: [],
  pendingVoice: null,
  eventSource: null,
  listPollTimer: null,
  threadPollTimer: null,
  listRefreshTimer: null,
  threadRefreshTimer: null,
  liveRenderTimer: null,
  liveDeltas: new Map(),
  inputPerf: {
    lastAt: 0,
    composing: false,
    idleTimer: null,
    deferredThreadRefresh: false,
    deferredThreadDelay: 350,
    deferredListRefresh: false,
    deferredListOptions: null,
    deferredLiveRender: false,
    deferredContextRender: false,
  },
  pairing: {
    active: false,
    pairingId: "",
    pairingCode: "",
    auto: false,
    autoTried: false,
  },
  pairingScanner: {
    running: false,
    stream: null,
    detector: null,
    canvas: null,
    ctx: null,
    frameTimer: null,
    scanBusy: false,
    lastPayload: "",
  },
  theme: "light",
  language: DEFAULT_LANGUAGE,
  lastStatusKey: null,
  lastStatusVars: null,
  quota: {
    rateLimits: null,
    pollTimer: null,
    lastError: "",
  },
  voice: {
    recording: false,
    mediaRecorder: null,
    recognition: null,
    stream: null,
    chunks: [],
    finalTranscript: "",
    interimTranscript: "",
  },
  auth: {
    checked: false,
    authenticated: false,
    mode: "open",
  },
  mobileUi: {
    composerExpanded: false,
    collapseTimer: null,
    reserveRaf: null,
    viewportListenersBound: false,
  },
};

init();

function init() {
  applyQueryBootstrap();
  migrateLegacySettings();
  initializeLanguage();
  initializeTheme();
  initializeRateLimitPolling();
  applyI18nToDom();
  updateLanguageToggleTarget();
  updateThemeToggleCurrent();
  renderQuotaUsage();
  syncAttachmentsVisibility();
  if (elements.pairingDeviceName && !elements.pairingDeviceName.value) {
    elements.pairingDeviceName.value = getStoredDeviceName();
  }
  state.pairing.pairingId = getPendingPairingId();
  state.pairing.pairingCode = getPendingPairingCode();
  state.pairing.auto = getPairingAutoFlag();
  state.pairing.autoTried = false;
  state.pairing.active = getPairingModeFlag();
  state.initialThreadId = getInitialThreadId();
  state.lockedThreadId = getLockedThreadId();
  state.desktopCompatibleMode = getDesktopCompatibleMode();
  const initialBase = resolveInitialBaseUrl();
  const initialToken = localStorage.getItem(storageKeys.token) || "";
  elements.serverBase.value = normalizeBaseUrl(initialBase);
  elements.authToken.value = initialToken;
  void refreshServerBasePresets();
  initializeMobileUiState();
  if (elements.desktopCompatibleToggle) {
    elements.desktopCompatibleToggle.checked = state.desktopCompatibleMode;
  }
  bindEvents();
  applyLockedThreadUi();
  renderPairingBanner();
  setStatusKey("status.initializing");
  bootstrap();
}

function resolveInitialBaseUrl() {
  const originBase = normalizeBaseUrl(window.location.origin);
  const storedBase = normalizeBaseUrl(localStorage.getItem(storageKeys.baseUrl) || "");
  if (!storedBase) {
    localStorage.setItem(storageKeys.baseUrl, originBase);
    return originBase;
  }
  try {
    const originUrl = new URL(originBase);
    const storedUrl = new URL(storedBase, originBase);
    // If user opens the page from a different host (LAN <-> Tailscale),
    // prefer the current origin so API calls always follow the reachable URL.
    if (originUrl.origin !== storedUrl.origin) {
      localStorage.setItem(storageKeys.baseUrl, originBase);
      return originBase;
    }
  } catch (_error) {
    localStorage.setItem(storageKeys.baseUrl, originBase);
    return originBase;
  }
  return storedBase;
}

async function refreshServerBasePresets() {
  if (!elements.serverBasePreset || !elements.serverBase) return;
  const optionMap = new Map();
  const currentOrigin = normalizeBaseUrl(window.location.origin);
  const storedBase = normalizeBaseUrl(localStorage.getItem(storageKeys.baseUrl) || "");
  const inputBase = normalizeBaseUrl(elements.serverBase.value || "");

  const addOption = (baseUrl, labelKey) => {
    const normalized = normalizePresetUrl(baseUrl);
    if (!normalized) return;
    const existing = optionMap.get(normalized);
    if (existing) {
      if (existing.labelKey === "settings.addr.detected" && labelKey !== "settings.addr.detected") {
        existing.labelKey = labelKey;
      }
      return;
    }
    optionMap.set(normalized, {
      value: normalized,
      labelKey: labelKey || inferPresetLabelKey(normalized),
    });
  };

  addOption(currentOrigin, "settings.addr.current");
  if (storedBase) addOption(storedBase, "settings.addr.saved");
  if (inputBase) addOption(inputBase, "settings.addr.saved");

  try {
    const health = await readHealthForPresets();
    const remote = health && health.remote ? health.remote : null;
    if (remote && Array.isArray(remote.urls)) {
      for (const item of remote.urls) {
        addOption(item, inferPresetLabelKey(item));
      }
    }
    const tailscale = remote && remote.tailscale ? remote.tailscale : null;
    if (tailscale && tailscale.ipv4) {
      addOption(buildHostUrl(tailscale.ipv4), "settings.addr.tailscaleIp");
    }
    if (tailscale && tailscale.magicDns) {
      addOption(
        buildHostUrl(String(tailscale.magicDns).replace(/\.$/, "")),
        "settings.addr.magicDns"
      );
    }
  } catch (_error) {
    // Fallback to local candidates only.
  }

  const selected = normalizePresetUrl(elements.serverBase.value || "");
  elements.serverBasePreset.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = t("settings.quickPickPlaceholder");
  elements.serverBasePreset.appendChild(placeholder);

  for (const item of optionMap.values()) {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = `${t(item.labelKey)}: ${item.value}`;
    elements.serverBasePreset.appendChild(option);
  }

  if (selected && optionMap.has(selected)) {
    elements.serverBasePreset.value = selected;
  } else {
    elements.serverBasePreset.value = "";
  }
}

async function readHealthForPresets() {
  const healthUrl = new URL("/api/health", window.location.origin);
  const response = await fetch(healthUrl.toString(), {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Health request failed: ${response.status}`);
  }
  const payload = await response.json().catch(() => null);
  if (!payload || payload.ok !== true) {
    throw new Error("Health payload is invalid");
  }
  return payload;
}

function normalizePresetUrl(value) {
  const clean = normalizeBaseUrl(value);
  if (!clean) return "";
  try {
    const parsed = new URL(clean, window.location.origin);
    return `${parsed.protocol}//${parsed.host}`;
  } catch (_error) {
    return "";
  }
}

function buildHostUrl(host) {
  const cleanHost = String(host || "").trim();
  if (!cleanHost) return "";
  const origin = new URL(window.location.origin);
  const bracketedHost =
    cleanHost.includes(":") && !cleanHost.startsWith("[")
      ? `[${cleanHost}]`
      : cleanHost;
  const portPart = origin.port ? `:${origin.port}` : "";
  return `${origin.protocol}//${bracketedHost}${portPart}`;
}

function inferPresetLabelKey(baseUrl) {
  try {
    const parsed = new URL(normalizePresetUrl(baseUrl));
    const host = String(parsed.hostname || "").toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return "settings.addr.local";
    }
    if (/\.ts\.net$/.test(host)) {
      return "settings.addr.magicDns";
    }
    if (isTailscaleIpv4(host)) {
      return "settings.addr.tailscaleIp";
    }
    if (isLanIpv4(host)) {
      return "settings.addr.lan";
    }
  } catch (_error) {
    // noop
  }
  return "settings.addr.detected";
}

function isTailscaleIpv4(host) {
  const parts = String(host || "").split(".");
  return parts.length === 4 && parts[0] === "100" && parts.every((n) => isByte(n));
}

function isLanIpv4(host) {
  const parts = String(host || "").split(".");
  if (parts.length !== 4 || !parts.every((n) => isByte(n))) return false;
  const a = Number(parts[0]);
  const b = Number(parts[1]);
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isByte(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 255;
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 700px)").matches;
}

function isSidebarOverlayViewport() {
  return window.matchMedia("(max-width: 1024px)").matches;
}

function setSidebarOpen(open) {
  const shouldOpen = Boolean(open) && isSidebarOverlayViewport();
  if (elements.sidebar) {
    elements.sidebar.classList.toggle("open", shouldOpen);
  }
  if (elements.backdrop) {
    elements.backdrop.classList.toggle("show", shouldOpen);
  }
  document.body.classList.toggle("sidebar-open", shouldOpen);
  if (elements.menuToggle) {
    elements.menuToggle.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
    elements.menuToggle.setAttribute("aria-label", t("btn.menu"));
  }
}

function closeSidebar(options = {}) {
  const force = Boolean(options.force);
  if (!force && !isSidebarOverlayViewport()) return;
  setSidebarOpen(false);
}

function toggleSidebar() {
  if (!isSidebarOverlayViewport()) return;
  const open = Boolean(elements.sidebar && elements.sidebar.classList.contains("open"));
  setSidebarOpen(!open);
}

function initializeMobileUiState() {
  state.mobileUi.composerExpanded = false;
  if (!state.mobileUi.viewportListenersBound && window.visualViewport) {
    const onViewportChange = () => {
      updateMobileKeyboardInset();
      scheduleMobileComposerReserveUpdate();
    };
    window.visualViewport.addEventListener("resize", onViewportChange, { passive: true });
    window.visualViewport.addEventListener("scroll", onViewportChange, { passive: true });
    state.mobileUi.viewportListenersBound = true;
  }
  applyMobileUiState();
  window.addEventListener(
    "resize",
    () => {
      applyMobileUiState();
    },
    { passive: true }
  );
}

function hasComposerWorkingContent() {
  const hasText = Boolean(elements.input && String(elements.input.value || "").trim());
  return (
    hasText ||
    state.pendingImages.length > 0 ||
    Boolean(state.pendingVoice) ||
    Boolean(state.voice && state.voice.recording) ||
    Boolean(state.sending)
  );
}

function shouldComposerStayExpanded() {
  if (document.activeElement === elements.input) return true;
  return hasComposerWorkingContent();
}

function updateComposerToggleButton(mobile, expanded) {
  if (!elements.composerToggle) return;
  const isMobile = Boolean(mobile);
  if (!isMobile) {
    elements.composerToggle.setAttribute("aria-hidden", "true");
    elements.composerToggle.setAttribute("aria-expanded", "true");
    elements.composerToggle.textContent = "⌃";
    return;
  }
  elements.composerToggle.removeAttribute("aria-hidden");
  elements.composerToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
  elements.composerToggle.setAttribute(
    "aria-label",
    expanded ? t("btn.hideComposer") : t("btn.openComposer")
  );
  elements.composerToggle.textContent = expanded ? "⌄" : "⌃";
}

function updateMobileComposerReserve() {
  if (!isMobileViewport() || !elements.composer) {
    document.documentElement.style.removeProperty("--mobile-composer-reserve");
    return;
  }
  const rect = elements.composer.getBoundingClientRect();
  const reserve = Math.max(56, Math.ceil(rect.height) + 4);
  document.documentElement.style.setProperty("--mobile-composer-reserve", `${reserve}px`);
}

function getMobileKeyboardInset() {
  if (!isMobileViewport() || !window.visualViewport) return 0;
  const viewport = window.visualViewport;
  const layoutHeight = Number(window.innerHeight) || 0;
  const visualBottom =
    (Number(viewport.height) || 0) + (Number(viewport.offsetTop) || 0);
  if (layoutHeight <= 0 || visualBottom <= 0) return 0;
  const inset = Math.max(0, Math.round(layoutHeight - visualBottom));
  return inset > 6 ? inset : 0;
}

function updateMobileKeyboardInset() {
  const inset = getMobileKeyboardInset();
  document.documentElement.style.setProperty("--mobile-keyboard-inset", `${inset}px`);
  document.body.classList.toggle("mobile-keyboard-open", inset > 0);
}

function scheduleMobileComposerReserveUpdate() {
  if (state.mobileUi.reserveRaf) {
    cancelAnimationFrame(state.mobileUi.reserveRaf);
  }
  state.mobileUi.reserveRaf = requestAnimationFrame(() => {
    state.mobileUi.reserveRaf = null;
    updateMobileComposerReserve();
  });
}

function toggleComposerMobile() {
  if (!isMobileViewport()) return;
  const expanded = Boolean(state.mobileUi.composerExpanded) || shouldComposerStayExpanded();
  if (expanded) {
    if (elements.input && document.activeElement === elements.input) {
      elements.input.blur();
    }
    state.mobileUi.composerExpanded = false;
    applyMobileUiState();
    return;
  }
  state.mobileUi.composerExpanded = true;
  applyMobileUiState();
  if (elements.input && typeof elements.input.focus === "function") {
    try {
      elements.input.focus({ preventScroll: true });
    } catch (_error) {
      elements.input.focus();
    }
  }
}

function applyMobileUiState() {
  const mobile = isMobileViewport();
  let composerExpanded = true;
  document.body.classList.toggle("mobile-compact-mode", mobile);
  if (!mobile) {
    if (elements.mainTop) {
      elements.mainTop.classList.remove("compact-collapsed");
    }
    if (elements.statusBar) {
      elements.statusBar.classList.remove("compact-hidden");
    }
    if (elements.composer) {
      elements.composer.classList.remove("compact-collapsed");
    }
  } else {
    composerExpanded =
      Boolean(state.mobileUi.composerExpanded) || shouldComposerStayExpanded();
    if (elements.mainTop) {
      elements.mainTop.classList.add("compact-collapsed");
    }
    if (elements.statusBar) {
      elements.statusBar.classList.add("compact-hidden");
    }
    if (elements.composer) {
      elements.composer.classList.toggle("compact-collapsed", !composerExpanded);
    }
  }
  document.body.classList.toggle("composer-open", mobile && composerExpanded);
  updateMobileKeyboardInset();
  updateComposerToggleButton(mobile, composerExpanded);
  scheduleMobileComposerReserveUpdate();

  if (!isSidebarOverlayViewport()) {
    closeSidebar({ force: true });
    return;
  }
  const open = Boolean(elements.sidebar && elements.sidebar.classList.contains("open"));
  setSidebarOpen(open);
}

function expandComposerMobile() {
  if (!isMobileViewport()) return;
  state.mobileUi.composerExpanded = true;
  applyMobileUiState();
}

function collapseComposerMobile() {
  if (!isMobileViewport()) return;
  state.mobileUi.composerExpanded = false;
  applyMobileUiState();
}

function scheduleComposerCollapse(delayMs = 220) {
  if (!isMobileViewport()) return;
  if (state.mobileUi.collapseTimer) {
    clearTimeout(state.mobileUi.collapseTimer);
  }
  state.mobileUi.collapseTimer = setTimeout(() => {
    state.mobileUi.collapseTimer = null;
    if (shouldComposerStayExpanded()) {
      applyMobileUiState();
      return;
    }
    collapseComposerMobile();
  }, Math.max(80, Number(delayMs) || 220));
}

function collapseReadingChromeMobile() {
  if (!isMobileViewport()) return;
  if (state.mobileUi.composerExpanded && !shouldComposerStayExpanded()) {
    state.mobileUi.composerExpanded = false;
  }
  closeSidebar();
  applyMobileUiState();
}

function normalizeLanguage(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw.startsWith("en")) return "en";
  return "zh";
}

function getLanguagePreference() {
  const stored = String(localStorage.getItem(storageKeys.language) || "").trim();
  if (stored) {
    return normalizeLanguage(stored);
  }
  const nav =
    typeof navigator !== "undefined"
      ? navigator.language || (Array.isArray(navigator.languages) ? navigator.languages[0] : "")
      : "";
  return normalizeLanguage(nav || DEFAULT_LANGUAGE);
}

function initializeLanguage() {
  applyLanguage(getLanguagePreference(), { persist: false, rerender: false });
}

function applyLanguage(language, options = {}) {
  const next = normalizeLanguage(language);
  state.language = next;
  document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
  if (options.persist) {
    localStorage.setItem(storageKeys.language, next);
  }
  if (elements.langToggle) {
    elements.langToggle.checked = next === "en";
  }
  updateLanguageToggleTarget();
  applyI18nToDom();
  updateThemeToggleCurrent();
  if (options.rerender === false) return;
  renderPairingBanner();
  applyLockedThreadUi();
  renderThreadList();
  renderCurrentThread();
  renderApprovals();
  renderPendingImages();
  renderPendingVoice();
  if (elements.voiceBtn) {
    elements.voiceBtn.textContent = state.voice.recording
      ? t("btn.voiceStop")
      : t("btn.voice");
  }
  renderContextUsage();
  renderQuotaUsage();
  if (state.lastStatusKey) {
    setStatusKey(state.lastStatusKey, state.lastStatusVars || {});
  }
  applyMobileUiState();
  void refreshServerBasePresets();
}

function t(key, vars = {}) {
  const langPack = I18N[state.language] || I18N[DEFAULT_LANGUAGE];
  const fallbackPack = I18N[DEFAULT_LANGUAGE] || {};
  const template = langPack[key] || fallbackPack[key] || key;
  return String(template).replace(/\{(\w+)\}/g, (_all, varKey) => {
    const value = vars[varKey];
    return value === undefined || value === null ? "" : String(value);
  });
}

function applyI18nToDom() {
  const textNodes = document.querySelectorAll("[data-i18n]");
  for (const node of textNodes) {
    const key = node.getAttribute("data-i18n");
    if (!key) continue;
    const value = t(key);
    if (node.tagName === "TITLE") {
      document.title = value;
    } else {
      node.textContent = value;
    }
  }

  const titleNodes = document.querySelectorAll("[data-i18n-title]");
  for (const node of titleNodes) {
    const key = node.getAttribute("data-i18n-title");
    if (!key) continue;
    node.setAttribute("title", t(key));
  }

  const placeholderNodes = document.querySelectorAll("[data-i18n-placeholder]");
  for (const node of placeholderNodes) {
    const key = node.getAttribute("data-i18n-placeholder");
    if (!key) continue;
    node.setAttribute("placeholder", t(key));
  }
}

function updateLanguageToggleTarget() {
  if (!elements.langToggleTarget) return;
  elements.langToggleTarget.textContent =
    state.language === "zh" ? "English" : "中文";
}

function updateThemeToggleCurrent() {
  if (!elements.themeToggleCurrent) return;
  elements.themeToggleCurrent.textContent =
    state.theme === "dark" ? t("menu.themeDark") : t("menu.themeLight");
}

function initializeTheme() {
  const theme = getThemePreference();
  applyTheme(theme, { persist: false });
}

function getThemePreference() {
  const stored = String(localStorage.getItem(storageKeys.theme) || "")
    .trim()
    .toLowerCase();
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  if (
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

function applyTheme(theme, options = {}) {
  const next = String(theme || "").toLowerCase() === "dark" ? "dark" : "light";
  state.theme = next;
  document.documentElement.setAttribute("data-theme", next);
  if (elements.themeToggle) {
    elements.themeToggle.checked = next === "dark";
  }
  updateThemeToggleCurrent();
  if (options.persist) {
    localStorage.setItem(storageKeys.theme, next);
  }
}

function initializeRateLimitPolling() {
  if (state.quota.pollTimer) {
    clearInterval(state.quota.pollTimer);
  }
  state.quota.pollTimer = setInterval(() => {
    loadRateLimits({ silent: true }).catch(() => {
      // noop
    });
  }, RATE_LIMIT_POLL_MS);
}

async function loadRateLimits(options = {}) {
  const silent = Boolean(options.silent);
  try {
    const data = await apiFetchJson("/api/v2/rate-limits");
    state.quota.rateLimits = normalizeRateLimitsPayload(data || {});
    state.quota.lastError = "";
    renderQuotaUsage();
  } catch (error) {
    state.quota.lastError = asMessage(error);
    state.quota.rateLimits = null;
    renderQuotaUsage();
    if (!silent) {
      setStatusKey("status.readQuotaFailed", { error: state.quota.lastError });
    }
  }
}

function normalizeRateLimitsPayload(input) {
  const src = input && typeof input === "object" ? input : {};
  return {
    rateLimits: normalizeRateLimitSet(src.rateLimits),
    rateLimitsByLimitId: src.rateLimitsByLimitId && typeof src.rateLimitsByLimitId === "object"
      ? src.rateLimitsByLimitId
      : {},
  };
}

function normalizeRateLimitSet(input) {
  if (!input || typeof input !== "object") return null;
  return {
    limitId: input.limitId ? String(input.limitId) : null,
    limitName: input.limitName ? String(input.limitName) : null,
    primary: normalizeRateLimitWindow(input.primary),
    secondary: normalizeRateLimitWindow(input.secondary),
    planType: input.planType ? String(input.planType) : null,
  };
}

function normalizeRateLimitWindow(input) {
  if (!input || typeof input !== "object") return null;
  const usedPercent = Number(input.usedPercent);
  const used = Number.isFinite(usedPercent)
    ? Math.max(0, Math.min(100, usedPercent))
    : null;
  const remaining = used === null ? null : Math.max(0, Math.min(100, 100 - used));
  return {
    usedPercent: used,
    remainingPercent: remaining,
    windowDurationMins:
      Number.isFinite(Number(input.windowDurationMins)) &&
      Number(input.windowDurationMins) > 0
        ? Math.floor(Number(input.windowDurationMins))
        : null,
    resetsAt:
      Number.isFinite(Number(input.resetsAt)) && Number(input.resetsAt) > 0
        ? Math.floor(Number(input.resetsAt))
        : null,
  };
}

function renderQuotaUsage() {
  let set = state.quota.rateLimits ? state.quota.rateLimits.rateLimits : null;
  if (!set && state.quota.rateLimits && state.quota.rateLimits.rateLimitsByLimitId) {
    const values = Object.values(state.quota.rateLimits.rateLimitsByLimitId);
    if (values.length > 0) {
      const codexLike = values.find((item) => item && String(item.limitId || "").startsWith("codex"));
      set = codexLike || values[0] || null;
    }
  }
  const primary = set && set.primary ? set.primary : null;
  const secondary = set && set.secondary ? set.secondary : null;
  renderQuotaRow(elements.quota5hText, primary ? primary.remainingPercent : null);
  renderQuotaRow(elements.quota7dText, secondary ? secondary.remainingPercent : null);
  renderQuotaRow(elements.sidebarQuota5hText, primary ? primary.remainingPercent : null);
  renderQuotaRow(elements.sidebarQuota7dText, secondary ? secondary.remainingPercent : null);
  setRingPercent(elements.sidebarQuota5hRing, primary ? primary.remainingPercent : null);
  setRingPercent(elements.sidebarQuota7dRing, secondary ? secondary.remainingPercent : null);

  if (elements.quotaWidget) {
    const pText = primary && primary.remainingPercent !== null ? `${Math.round(primary.remainingPercent)}%` : "--%";
    const sText = secondary && secondary.remainingPercent !== null ? `${Math.round(secondary.remainingPercent)}%` : "--%";
    elements.quotaWidget.title = t("quota.tooltip", { p: pText, s: sText });
  }
}

function renderQuotaRow(textEl, remainPercent) {
  if (!textEl) return;
  if (remainPercent === null || remainPercent === undefined || !Number.isFinite(Number(remainPercent))) {
    textEl.textContent = "--%";
    return;
  }
  const pct = Math.max(0, Math.min(100, Number(remainPercent)));
  textEl.textContent = `${Math.round(pct)}%`;
}

function setRingPercent(ringElement, percent) {
  if (!ringElement) return;
  const n = Number(percent);
  const safe = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
  ringElement.style.setProperty("--pct", String(safe));
}

function setLoginStatus(text, isError = false) {
  if (!elements.loginStatus) return;
  elements.loginStatus.textContent = String(text || "");
  elements.loginStatus.style.color = isError ? "#ad3412" : "";
}

function showLoginDialog() {
  if (!elements.loginDialog) return;
  setLoginStatus("");
  if (!elements.loginDialog.open) {
    elements.loginDialog.showModal();
  }
  if (elements.loginPassword) {
    elements.loginPassword.focus();
    elements.loginPassword.select();
  }
}

function hideLoginDialog() {
  if (!elements.loginDialog || !elements.loginDialog.open) return;
  elements.loginDialog.close();
}

async function ensureAuthenticated() {
  const result = await apiFetchJson("/api/auth/status", { authMode: "none" });
  const authenticated = Boolean(result && result.authenticated);
  state.auth.checked = true;
  state.auth.authenticated = authenticated;
  state.auth.mode = String((result && result.mode) || "open");
  if (authenticated) {
    hideLoginDialog();
    return true;
  }
  showLoginDialog();
  setStatusKey("status.authRequired");
  return false;
}

async function submitLoginForm() {
  const password = String(elements.loginPassword ? elements.loginPassword.value : "");
  setLoginStatus(t("login.submitting"));
  await apiFetchJson("/api/auth/login", {
    method: "POST",
    body: { password },
    authMode: "none",
  });
  if (elements.loginPassword) {
    elements.loginPassword.value = "";
  }
  setLoginStatus("");
  hideLoginDialog();
  setStatusKey("status.loginSuccess");
  await bootstrap();
}

async function bootstrap() {
  renderPairingBanner();
  try {
    const authenticated = await ensureAuthenticated();
    if (!authenticated) return;
    await Promise.all([
      loadThreads({ preserveSelection: false }),
      loadPendingApprovals(),
      loadRateLimits({ silent: true }),
    ]);
    if (state.lockedThreadId) {
      const lockedExists = state.threads.some(
        (item) => item.id === state.lockedThreadId
      );
      if (lockedExists) {
        await selectThread(state.lockedThreadId);
      } else {
        state.selectedThreadId = state.lockedThreadId;
        await loadCurrentThread(state.lockedThreadId, { silent: true });
      }
    } else if (state.initialThreadId) {
      const initialThreadId = state.initialThreadId;
      clearInitialThreadId();
      const initialExists = state.threads.some((item) => item.id === initialThreadId);
      if (initialExists) {
        await selectThread(initialThreadId);
      } else {
        state.selectedThreadId = initialThreadId;
        await loadCurrentThread(initialThreadId, { silent: true });
      }
    } else if (!state.selectedThreadId && state.threads.length > 0) {
      await selectThread(state.threads[0].id);
    } else if (state.selectedThreadId) {
      await loadCurrentThread(state.selectedThreadId, { silent: true });
    }
    await connectEventSource();
    startPolling();
    if (state.lockedThreadId) {
      setStatusKey("status.onlineLocked", {
        id: state.lockedThreadId.slice(0, 8),
      });
    } else {
      setStatusKey("status.online");
    }
  } catch (error) {
    const message = asMessage(error);
    setStatusKey("status.initFailed", { error: message });
    if (/unauthorized/i.test(message)) {
      const authenticated = await ensureAuthenticated().catch(() => false);
      if (!authenticated) return;
    }
  }
}

function bindEvents() {
  elements.menuToggle.addEventListener("click", () => {
    toggleSidebar();
  });
  elements.backdrop.addEventListener("click", () => {
    closeSidebar();
  });

  elements.openSettings.addEventListener("click", () => {
    void refreshServerBasePresets();
    elements.settingsDialog.showModal();
  });
  elements.cancelSettings.addEventListener("click", () => {
    elements.settingsDialog.close();
  });
  if (elements.serverBasePreset) {
    elements.serverBasePreset.addEventListener("change", () => {
      const selected = normalizePresetUrl(elements.serverBasePreset.value);
      if (!selected) return;
      elements.serverBase.value = selected;
    });
  }
  elements.settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    localStorage.setItem(storageKeys.baseUrl, normalizeBaseUrl(elements.serverBase.value));
    if (elements.authToken) {
      localStorage.setItem(storageKeys.token, elements.authToken.value.trim());
    }
    elements.settingsDialog.close();
    setStatusKey("status.settingsSavedReconnect");
    disconnectEventSource();
    await bootstrap();
  });
  if (elements.loginForm) {
    elements.loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await submitLoginForm().catch((error) => {
        setLoginStatus(t("login.failed", { error: asMessage(error) }), true);
      });
    });
  }
  if (elements.langToggle) {
    elements.langToggle.addEventListener("change", () => {
      applyLanguage(elements.langToggle.checked ? "en" : "zh", {
        persist: true,
        rerender: true,
      });
    });
  }
  if (elements.themeToggle) {
    elements.themeToggle.addEventListener("change", () => {
      applyTheme(elements.themeToggle.checked ? "dark" : "light", {
        persist: true,
      });
    });
  }
  if (elements.openPairing) {
    elements.openPairing.addEventListener("click", () => {
      showPairingDialog({ pairingId: getPendingPairingId() });
    });
  }
  if (elements.pairingBannerBtn) {
    elements.pairingBannerBtn.addEventListener("click", () => {
      showPairingDialog({ pairingId: getPendingPairingId() });
    });
  }
  if (elements.cancelPairing) {
    elements.cancelPairing.addEventListener("click", () => {
      stopPairingScanner();
      if (elements.pairingDialog && elements.pairingDialog.open) {
        elements.pairingDialog.close();
      }
    });
  }
  if (elements.scanPairingBtn) {
    elements.scanPairingBtn.addEventListener("click", () => {
      startPairingScanner().catch((error) => {
        setPairingStatus(t("pairing.scanFailed", { error: asMessage(error) }), true);
        stopPairingScanner();
      });
    });
  }
  if (elements.stopPairingScanBtn) {
    elements.stopPairingScanBtn.addEventListener("click", () => {
      stopPairingScanner();
      setPairingStatus("");
    });
  }
  if (elements.scanPairingPhotoBtn) {
    elements.scanPairingPhotoBtn.addEventListener("click", () => {
      scanPairingFromPhoto().catch((error) => {
        setPairingStatus(t("pairing.scanFailed", { error: asMessage(error) }), true);
      });
    });
  }
  if (elements.pairingQrFile) {
    elements.pairingQrFile.addEventListener("change", (event) => {
      handlePairingQrFileChange(event).catch((error) => {
        setPairingStatus(t("pairing.scanFailed", { error: asMessage(error) }), true);
      });
    });
  }
  if (elements.pairingDialog) {
    elements.pairingDialog.addEventListener("close", () => {
      stopPairingScanner();
    });
    elements.pairingDialog.addEventListener("cancel", () => {
      stopPairingScanner();
    });
  }
  if (elements.pairingForm) {
    elements.pairingForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await submitPairingForm().catch((error) => {
        setPairingStatus(t("pairing.failed", { error: asMessage(error) }), true);
      });
    });
  }

  elements.refreshThreadsBtn.addEventListener("click", () => {
    loadThreads({ preserveSelection: true }).catch((error) => {
      setStatusKey("status.refreshFailed", { error: asMessage(error) });
    });
  });
  elements.newThreadBtn.addEventListener("click", () => {
    if (state.lockedThreadId) {
      setStatusKey("status.newThreadLocked");
      return;
    }
    createThread().catch((error) => {
      setStatusKey("status.newThreadFailed", { error: asMessage(error) });
    });
  });

  elements.threadSearch.addEventListener("input", debounce(() => {
    loadThreads({ preserveSelection: true }).catch((error) => {
      setStatusKey("status.searchFailed", { error: asMessage(error) });
    });
  }, 250));
  elements.sourceFilter.addEventListener("change", () => {
    loadThreads({ preserveSelection: true }).catch((error) => {
      setStatusKey("status.filterFailed", { error: asMessage(error) });
    });
  });
  elements.archivedToggle.addEventListener("change", () => {
    loadThreads({ preserveSelection: true }).catch((error) => {
      setStatusKey("status.filterFailed", { error: asMessage(error) });
    });
  });
  elements.desktopCompatibleToggle.addEventListener("change", () => {
    state.desktopCompatibleMode = Boolean(elements.desktopCompatibleToggle.checked);
    localStorage.setItem(
      storageKeys.desktopCompatibleMode,
      state.desktopCompatibleMode ? "1" : "0"
    );
    renderCurrentThread();
    loadThreads({ preserveSelection: true, silent: true }).catch(() => {
      // noop
    });
  });
  if (elements.unlockThreadBtn) {
    elements.unlockThreadBtn.addEventListener("click", () => {
      if (!state.lockedThreadId) return;
      state.lockedThreadId = null;
      localStorage.removeItem(storageKeys.lockedThreadId);
      applyLockedThreadUi();
      void connectEventSource();
      loadThreads({ preserveSelection: true }).catch((error) => {
        setStatusKey("status.unlockLoadFailed", { error: asMessage(error) });
      });
      setStatusKey("status.unlocked");
    });
  }
  if (elements.chat) {
    elements.chat.addEventListener("scroll", () => {
      state.chatScrollLocked = !isChatNearBottom(80);
    });
    elements.chat.addEventListener("pointerdown", () => {
      collapseReadingChromeMobile();
    });
  }
  if (elements.input) {
    const markTyping = () => {
      recordInputActivity();
      expandComposerMobile();
    };
    elements.input.addEventListener("focus", () => {
      markTyping();
      setTimeout(() => {
        updateMobileKeyboardInset();
        scheduleMobileComposerReserveUpdate();
      }, 60);
    });
    elements.input.addEventListener("keydown", markTyping);
    elements.input.addEventListener("input", markTyping);
    elements.input.addEventListener("blur", () => {
      scheduleDeferredWorkFlush(80);
      scheduleComposerCollapse(180);
      setTimeout(() => {
        updateMobileKeyboardInset();
        scheduleMobileComposerReserveUpdate();
      }, 120);
    });
    elements.input.addEventListener("compositionstart", () => {
      state.inputPerf.composing = true;
      recordInputActivity();
    });
    elements.input.addEventListener("compositionend", () => {
      state.inputPerf.composing = false;
      recordInputActivity();
    });
  }

  elements.threadList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const actionElement = target.closest("[data-action]");
    const threadElement = target.closest("[data-thread-id]");
    const action = (actionElement && actionElement.dataset.action) || "open";
    if (action === "toggle-project") {
      const encoded =
        (actionElement && actionElement.dataset.projectKey) || "";
      const key = decodeURIComponent(encoded);
      if (!key) return;
      if (state.expandedProjectKey === key) {
        state.expandedProjectKey = null;
        state.projectCollapsedByUser = true;
      } else {
        state.expandedProjectKey = key;
        state.projectCollapsedByUser = false;
      }
      renderThreadList();
      return;
    }

    const threadId =
      (actionElement && actionElement.dataset.threadId) ||
      (threadElement && threadElement.dataset.threadId) ||
      "";
    if (!threadId) return;
    if (action === "open") {
      selectThread(threadId).catch((error) => {
        setStatusKey("status.openThreadFailed", { error: asMessage(error) });
      });
      return;
    }
    if (action === "rename") {
      renameThread(threadId).catch((error) => {
        setStatusKey("status.renameFailed", { error: asMessage(error) });
      });
      return;
    }
    if (action === "archive") {
      archiveThread(threadId).catch((error) => {
        setStatusKey("status.archiveFailed", { error: asMessage(error) });
      });
      return;
    }
    if (action === "unarchive") {
      unarchiveThread(threadId).catch((error) => {
        setStatusKey("status.unarchiveFailed", { error: asMessage(error) });
      });
      return;
    }
    if (action === "fork") {
      forkThread(threadId).catch((error) => {
        setStatusKey("status.forkFailed", { error: asMessage(error) });
      });
    }
  });

  elements.pickImageBtn.addEventListener("click", () => {
    elements.imagePicker.click();
  });
  elements.imagePicker.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.files) return;
    uploadImages(Array.from(input.files)).catch((error) => {
      setStatusKey("status.imageUploadFailed", { error: asMessage(error) });
    });
  });

  elements.voiceBtn.addEventListener("click", () => {
    toggleVoiceRecording().catch((error) => {
      setStatusKey("status.voiceFailed", { error: asMessage(error) });
    });
  });

  elements.pendingImages.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const mediaId = target.dataset.removeMediaId;
    if (!mediaId) return;
    state.pendingImages = state.pendingImages.filter((item) => item.mediaId !== mediaId);
    renderPendingImages();
  });

  elements.pendingVoice.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.action === "clear-voice") {
      state.pendingVoice = null;
      renderPendingVoice();
    }
  });
  elements.pendingVoice.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement)) return;
    if (!state.pendingVoice) return;
    state.pendingVoice.transcript = target.value;
  });

  elements.approvalList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const requestId = target.dataset.requestId;
    const decision = target.dataset.decision;
    if (!requestId || !decision) return;
    submitApproval(requestId, decision).catch((error) => {
      setStatusKey("status.approvalSubmitFailed", { error: asMessage(error) });
    });
  });

  elements.composer.addEventListener("submit", (event) => {
    event.preventDefault();
    sendCurrentMessage().catch((error) => {
      setStatusKey("status.sendFailed", { error: asMessage(error) });
    });
  });
  if (elements.composerToggle) {
    elements.composerToggle.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    elements.composerToggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleComposerMobile();
    });
  }
  elements.composer.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest("#composer-toggle")) return;
    expandComposerMobile();
  });
}

function applyQueryBootstrap() {
  const params = new URLSearchParams(window.location.search);
  const base = params.get("base");
  const token = params.get("token");
  const pairingMode = params.get("pairing") === "1";
  const pairingId = (params.get("pairingId") || "").trim();
  const pairingCode = (params.get("pairingCode") || params.get("code") || "").trim();
  const pairingAuto =
    params.get("autoPair") === "1" || params.get("autopair") === "1";
  const threadId = params.get("threadId") || params.get("thread") || "";
  const lockThreadId = params.get("lockThreadId") || "";
  const lockMode = params.get("lock") === "1";
  const unlockThread = params.get("unlockThread");
  let changed = false;

  if (base && base.trim()) {
    localStorage.setItem(storageKeys.baseUrl, normalizeBaseUrl(base));
    changed = true;
  }
  if (token && token.trim()) {
    localStorage.setItem(storageKeys.token, token.trim());
    changed = true;
  }
  if (pairingMode || pairingId || pairingCode) {
    if (pairingMode || pairingId || pairingCode) {
      sessionStorage.setItem(storageKeys.pairingMode, "1");
      changed = true;
    }
    if (pairingId) {
      sessionStorage.setItem(storageKeys.pairingId, pairingId);
      changed = true;
    }
    if (pairingCode) {
      sessionStorage.setItem(storageKeys.pairingCode, pairingCode);
      changed = true;
    } else {
      sessionStorage.removeItem(storageKeys.pairingCode);
      changed = true;
    }
    if (pairingAuto) {
      sessionStorage.setItem(storageKeys.pairingAuto, "1");
      changed = true;
    } else {
      sessionStorage.removeItem(storageKeys.pairingAuto);
      changed = true;
    }
  }
  const currentLocked = String(localStorage.getItem(storageKeys.lockedThreadId) || "").trim();
  const resolvedLockThreadId = lockThreadId.trim() || (lockMode ? threadId.trim() : "");
  if (unlockThread === "1" || !resolvedLockThreadId) {
    if (currentLocked) {
      localStorage.removeItem(storageKeys.lockedThreadId);
      changed = true;
    }
  } else if (currentLocked !== resolvedLockThreadId) {
    localStorage.setItem(storageKeys.lockedThreadId, resolvedLockThreadId);
    changed = true;
  }

  if (threadId && threadId.trim() && !resolvedLockThreadId) {
    sessionStorage.setItem(storageKeys.initialThreadId, threadId.trim());
    changed = true;
  }
  if (changed) {
    const clean = `${window.location.origin}${window.location.pathname}`;
    window.history.replaceState(null, "", clean);
  }
}

function getPairingModeFlag() {
  return String(sessionStorage.getItem(storageKeys.pairingMode) || "").trim() === "1";
}

function clearPairingModeFlag() {
  sessionStorage.removeItem(storageKeys.pairingMode);
  state.pairing.active = false;
}

function getPairingAutoFlag() {
  return String(sessionStorage.getItem(storageKeys.pairingAuto) || "").trim() === "1";
}

function clearPairingAutoFlag() {
  sessionStorage.removeItem(storageKeys.pairingAuto);
  state.pairing.auto = false;
}

function getPendingPairingId() {
  return String(sessionStorage.getItem(storageKeys.pairingId) || "").trim();
}

function setPendingPairingId(pairingId) {
  const clean = String(pairingId || "").trim();
  if (!clean) {
    sessionStorage.removeItem(storageKeys.pairingId);
  } else {
    sessionStorage.setItem(storageKeys.pairingId, clean);
  }
  state.pairing.pairingId = clean;
}

function getPendingPairingCode() {
  return String(sessionStorage.getItem(storageKeys.pairingCode) || "").trim();
}

function setPendingPairingCode(code) {
  const clean = String(code || "").trim();
  if (!clean) {
    sessionStorage.removeItem(storageKeys.pairingCode);
  } else {
    sessionStorage.setItem(storageKeys.pairingCode, clean);
  }
  state.pairing.pairingCode = clean;
}

function getInitialThreadId() {
  return String(sessionStorage.getItem(storageKeys.initialThreadId) || "").trim();
}

function clearInitialThreadId() {
  sessionStorage.removeItem(storageKeys.initialThreadId);
  state.initialThreadId = null;
}

function getLockedThreadId() {
  return String(localStorage.getItem(storageKeys.lockedThreadId) || "").trim();
}

function getDesktopCompatibleMode() {
  const raw = String(localStorage.getItem(storageKeys.desktopCompatibleMode) || "").trim();
  if (!raw) return true;
  return raw !== "0" && raw.toLowerCase() !== "false";
}

function applyLockedThreadUi() {
  const locked = Boolean(state.lockedThreadId);
  elements.newThreadBtn.disabled = locked;
  elements.threadSearch.disabled = locked;
  elements.sourceFilter.disabled = locked;
  elements.archivedToggle.disabled = locked;
  if (elements.lockBanner) {
    elements.lockBanner.hidden = !locked;
  }
  if (elements.lockBannerText) {
    elements.lockBannerText.textContent = locked
      ? t("thread.lockBanner", { id: state.lockedThreadId.slice(0, 8) })
      : "";
  }
}

function renderPairingBanner(forceShow = false) {
  if (!elements.pairingBanner) return;
  const needsPairing = forceShow || !hasBoundDevice();
  elements.pairingBanner.classList.toggle("hidden", !needsPairing);
}

function setPairingStatus(text, isError = false) {
  if (!elements.pairingStatus) return;
  elements.pairingStatus.textContent = String(text || "");
  elements.pairingStatus.style.color = isError ? "#ad3412" : "";
}

function setPairingScanUi(running) {
  const active = Boolean(running);
  if (elements.pairingScanner) {
    elements.pairingScanner.classList.toggle("hidden", !active);
  }
  if (elements.stopPairingScanBtn) {
    elements.stopPairingScanBtn.classList.toggle("hidden", !active);
  }
  if (elements.scanPairingBtn) {
    elements.scanPairingBtn.disabled = active;
  }
  if (elements.scanPairingPhotoBtn) {
    elements.scanPairingPhotoBtn.disabled = active;
  }
}

function stopPairingScanner() {
  const scanner = state.pairingScanner;
  scanner.running = false;
  scanner.scanBusy = false;
  if (scanner.frameTimer) {
    clearTimeout(scanner.frameTimer);
    scanner.frameTimer = null;
  }
  if (scanner.stream) {
    for (const track of scanner.stream.getTracks()) {
      try {
        track.stop();
      } catch {
        // noop
      }
    }
    scanner.stream = null;
  }
  if (elements.pairingScannerVideo && elements.pairingScannerVideo.srcObject) {
    try {
      elements.pairingScannerVideo.pause();
    } catch {
      // noop
    }
    elements.pairingScannerVideo.srcObject = null;
  }
  setPairingScanUi(false);
}

function getPairingBarcodeDetector() {
  if (state.pairingScanner.detector) {
    return state.pairingScanner.detector;
  }
  if (typeof window.BarcodeDetector !== "function") {
    return null;
  }
  try {
    state.pairingScanner.detector = new window.BarcodeDetector({ formats: ["qr_code"] });
  } catch {
    try {
      state.pairingScanner.detector = new window.BarcodeDetector();
    } catch {
      state.pairingScanner.detector = null;
    }
  }
  return state.pairingScanner.detector;
}

function getJsQrDecoder() {
  return typeof window.jsQR === "function" ? window.jsQR : null;
}

function getPairingScanCanvas(width, height) {
  const scanner = state.pairingScanner;
  if (!scanner.canvas) {
    scanner.canvas = document.createElement("canvas");
  }
  const safeWidth = Math.max(1, Math.floor(Number(width) || 1));
  const safeHeight = Math.max(1, Math.floor(Number(height) || 1));
  if (scanner.canvas.width !== safeWidth) scanner.canvas.width = safeWidth;
  if (scanner.canvas.height !== safeHeight) scanner.canvas.height = safeHeight;
  if (!scanner.ctx) {
    scanner.ctx =
      scanner.canvas.getContext("2d", { willReadFrequently: true }) ||
      scanner.canvas.getContext("2d");
  }
  return { canvas: scanner.canvas, ctx: scanner.ctx };
}

function getPairingSourceSize(source) {
  if (!source) return { width: 0, height: 0 };
  const width =
    Number(source.videoWidth || source.naturalWidth || source.width || source.clientWidth || 0) || 0;
  const height =
    Number(source.videoHeight || source.naturalHeight || source.height || source.clientHeight || 0) || 0;
  return { width, height };
}

async function decodePairingPayloadWithBarcodeDetector(source) {
  const detector = getPairingBarcodeDetector();
  if (!detector) return null;
  let matches = null;
  try {
    matches = await detector.detect(source);
  } catch {
    return null;
  }
  if (!Array.isArray(matches) || matches.length === 0) {
    return null;
  }
  for (const code of matches) {
    const text = String(code && code.rawValue ? code.rawValue : "").trim();
    if (!text) continue;
    const payload = parsePairingPayloadFromText(text);
    if (payload) return payload;
  }
  return null;
}

function decodePairingPayloadWithJsQr(source) {
  const jsQr = getJsQrDecoder();
  if (!jsQr) return null;
  const size = getPairingSourceSize(source);
  if (!size.width || !size.height) return null;
  const surface = getPairingScanCanvas(size.width, size.height);
  const ctx = surface && surface.ctx ? surface.ctx : null;
  if (!ctx) return null;
  try {
    ctx.drawImage(source, 0, 0, size.width, size.height);
    const imageData = ctx.getImageData(0, 0, size.width, size.height);
    const decoded = jsQr(imageData.data, size.width, size.height, {
      inversionAttempts: "attemptBoth",
    });
    if (!decoded || !decoded.data) return null;
    return parsePairingPayloadFromText(decoded.data);
  } catch {
    return null;
  }
}

function extractFirstUrlCandidate(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const matched = raw.match(/https?:\/\/[^\s"'<>()]+/i);
  if (matched && matched[0]) return matched[0];
  return raw;
}

function parsePairingPayloadFromText(text) {
  const candidate = extractFirstUrlCandidate(text);
  if (!candidate) return null;

  const parseFromUrl = (value) => {
    const parsed = new URL(value, window.location.origin);
    const query = parsed.searchParams;
    const pairingId = String(query.get("pairingId") || "").trim();
    const pairingCode = String(query.get("pairingCode") || query.get("code") || "").trim();
    const pairingMode = query.get("pairing") === "1" || Boolean(pairingId) || Boolean(pairingCode);
    if (!pairingMode) return null;
    const baseUrl = normalizeBaseUrl(parsed.origin);
    return {
      baseUrl,
      pairingId,
      pairingCode,
      auto:
        query.get("autoPair") === "1" ||
        query.get("autopair") === "1" ||
        Boolean(pairingCode),
    };
  };

  try {
    const direct = parseFromUrl(candidate);
    if (direct) return direct;
  } catch {
    // ignore
  }

  try {
    const normalized = candidate.includes("?")
      ? candidate.slice(candidate.indexOf("?") + 1)
      : candidate.replace(/^[?#]/, "");
    const params = new URLSearchParams(normalized);
    const pairingId = String(params.get("pairingId") || "").trim();
    const pairingCode = String(params.get("pairingCode") || params.get("code") || "").trim();
    if (!pairingId && !pairingCode && params.get("pairing") !== "1") {
      return null;
    }
    return {
      baseUrl: normalizeBaseUrl(window.location.origin),
      pairingId,
      pairingCode,
      auto:
        params.get("autoPair") === "1" ||
        params.get("autopair") === "1" ||
        Boolean(pairingCode),
    };
  } catch {
    return null;
  }
}

async function applyScannedPairingPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error(t("pairing.scanNoPairingData"));
  }
  const pairingId = String(payload.pairingId || "").trim();
  const pairingCode = String(payload.pairingCode || "").trim();
  const baseUrl = String(payload.baseUrl || "").trim();

  if (!pairingId) {
    throw new Error(t("pairing.scanNoPairingData"));
  }
  if (baseUrl) {
    localStorage.setItem(storageKeys.baseUrl, normalizeBaseUrl(baseUrl));
    if (elements.serverBase) {
      elements.serverBase.value = normalizeBaseUrl(baseUrl);
    }
  }
  if (pairingId) {
    setPendingPairingId(pairingId);
    if (elements.pairingId) elements.pairingId.value = pairingId;
  }
  if (pairingCode) {
    setPendingPairingCode(pairingCode);
    if (elements.pairingCode) elements.pairingCode.value = pairingCode;
  }

  if (!pairingCode) {
    setPairingStatus(t("pairing.scanNeedCode"));
    return;
  }

  setPairingStatus(t("pairing.scanFound"));
  await completePairing({
    pairingId,
    code: pairingCode,
    deviceName:
      String(elements.pairingDeviceName && elements.pairingDeviceName.value).trim() ||
      getStoredDeviceName() ||
      inferDefaultDeviceName(),
    closeDialog: true,
    showStatus: true,
  });
}

async function detectPairingPayloadFromSource(source) {
  const fromDetector = await decodePairingPayloadWithBarcodeDetector(source);
  if (fromDetector) return fromDetector;
  const fromJsQr = decodePairingPayloadWithJsQr(source);
  if (fromJsQr) return fromJsQr;
  if (!getPairingBarcodeDetector() && !getJsQrDecoder()) {
    throw new Error(t("pairing.scanNotSupported"));
  }
  return null;
}

async function scanPairingFromPhoto() {
  if (!elements.pairingQrFile) {
    throw new Error(t("pairing.scanNotSupported"));
  }
  if (!getPairingBarcodeDetector() && !getJsQrDecoder()) {
    throw new Error(t("pairing.scanNotSupported"));
  }
  elements.pairingQrFile.value = "";
  elements.pairingQrFile.click();
}

async function handlePairingQrFileChange(event) {
  const target = event && event.target ? event.target : null;
  const file = target && target.files && target.files[0] ? target.files[0] : null;
  if (!file) return;
  try {
    let source = null;
    if (typeof createImageBitmap === "function") {
      source = await createImageBitmap(file);
    } else {
      source = await new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
          URL.revokeObjectURL(objectUrl);
          resolve(image);
        };
        image.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error(t("pairing.scanNoQr")));
        };
        image.src = objectUrl;
      });
    }
    const payload = await detectPairingPayloadFromSource(source);
    if (!payload) {
      throw new Error(t("pairing.scanNoQr"));
    }
    await applyScannedPairingPayload(payload);
  } finally {
    if (target) {
      target.value = "";
    }
  }
}

async function startPairingScanner() {
  stopPairingScanner();
  setPairingStatus(t("pairing.scanStarting"));
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    setPairingStatus(t("pairing.scanFallbackPhoto"));
    await scanPairingFromPhoto();
    return;
  }
  if (!getPairingBarcodeDetector() && !getJsQrDecoder()) {
    setPairingStatus(t("pairing.scanFallbackPhoto"));
    await scanPairingFromPhoto();
    return;
  }

  const scanner = state.pairingScanner;
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
  } catch {
    setPairingStatus(t("pairing.scanFallbackPhoto"));
    await scanPairingFromPhoto();
    return;
  }

  scanner.stream = stream;
  scanner.running = true;
  scanner.scanBusy = false;
  if (elements.pairingScannerVideo) {
    elements.pairingScannerVideo.srcObject = stream;
    try {
      await elements.pairingScannerVideo.play();
    } catch {
      // noop
    }
  }
  setPairingScanUi(true);
  setPairingStatus(t("pairing.scanCameraHint"));

  const tick = async () => {
    if (!scanner.running) return;
    if (!elements.pairingScannerVideo) return;
    if (scanner.scanBusy || elements.pairingScannerVideo.readyState < 2) {
      scanner.frameTimer = setTimeout(tick, 180);
      return;
    }
    scanner.scanBusy = true;
    try {
      const payload = await detectPairingPayloadFromSource(elements.pairingScannerVideo);
      if (payload) {
        let payloadKey = "";
        try {
          payloadKey = JSON.stringify(payload);
        } catch {
          payloadKey = "";
        }
        if (payloadKey && payloadKey === scanner.lastPayload) {
          scanner.frameTimer = setTimeout(tick, 200);
          return;
        }
        scanner.lastPayload = payloadKey;
        stopPairingScanner();
        await applyScannedPairingPayload(payload);
        return;
      }
    } catch (error) {
      const message = asMessage(error);
      if (message) {
        setPairingStatus(t("pairing.scanFailed", { error: message }), true);
      }
      stopPairingScanner();
      return;
    } finally {
      scanner.scanBusy = false;
    }
    scanner.frameTimer = setTimeout(tick, 180);
  };

  scanner.frameTimer = setTimeout(tick, 180);
}

function showPairingDialog(options = {}) {
  if (!elements.pairingDialog) return;
  stopPairingScanner();
  state.pairingScanner.lastPayload = "";
  const pairingId =
    String(options.pairingId || "").trim() || getPendingPairingId() || "";
  const pairingCode =
    String(options.pairingCode || "").trim() || getPendingPairingCode() || "";
  if (elements.pairingId) {
    elements.pairingId.value = pairingId;
  }
  if (elements.pairingCode) {
    elements.pairingCode.value = pairingCode;
  }
  if (pairingId) {
    setPendingPairingId(pairingId);
  }
  if (pairingCode) {
    setPendingPairingCode(pairingCode);
  }
  if (options.message) {
    setPairingStatus(options.message, false);
  } else {
    setPairingStatus("");
  }
  if (!elements.pairingDialog.open) {
    elements.pairingDialog.showModal();
  }
}

async function submitPairingForm() {
  const pairingId = String(elements.pairingId ? elements.pairingId.value : "")
    .trim();
  const code = String(elements.pairingCode ? elements.pairingCode.value : "")
    .trim();
  const deviceName = String(
    elements.pairingDeviceName ? elements.pairingDeviceName.value : ""
  ).trim();
  if (!pairingId) {
    throw new Error(t("pairing.idRequired"));
  }
  if (!code) {
    throw new Error(t("pairing.codeRequired"));
  }
  if (elements.pairingDeviceName) {
    const finalName = deviceName || inferDefaultDeviceName();
    elements.pairingDeviceName.value = finalName;
  }
  await completePairing({
    pairingId,
    code,
    deviceName: deviceName || inferDefaultDeviceName(),
    closeDialog: true,
    showStatus: true,
  });
}

async function completePairing(options = {}) {
  const pairingId = String(options.pairingId || "").trim();
  const code = String(options.code || "").trim();
  const deviceName = String(options.deviceName || inferDefaultDeviceName()).trim() || inferDefaultDeviceName();
  const closeDialog = options.closeDialog !== false;
  const showStatus = options.showStatus !== false;

  if (!pairingId) throw new Error(t("pairing.idRequired"));
  if (!code) throw new Error(t("pairing.codeRequired"));
  if (showStatus) {
    setPairingStatus(t("pairing.inProgress"));
  }
  const result = await apiFetchJson("/api/v3/pairing/complete", {
    method: "POST",
    body: {
      pairingId,
      code,
      deviceName,
    },
    authMode: "none",
  });
  setDeviceCredentials({
    deviceId: result.deviceId,
    deviceSecret: result.deviceSecret,
    deviceName,
  });
  setPendingPairingId("");
  setPendingPairingCode("");
  clearPairingModeFlag();
  clearPairingAutoFlag();
  state.pairing.autoTried = true;
  if (elements.pairingCode) {
    elements.pairingCode.value = "";
  }
  if (showStatus) {
    setPairingStatus(t("pairing.successReconnecting"));
  }
  if (closeDialog && elements.pairingDialog && elements.pairingDialog.open) {
    elements.pairingDialog.close();
  }
  renderPairingBanner(false);
  disconnectEventSource();
  await bootstrap();
}

async function maybeAutoCompletePairing() {
  if (hasBoundDevice()) return false;
  if (state.pairing.autoTried) return false;
  const pairingId = getPendingPairingId();
  const pairingCode = getPendingPairingCode();
  const autoFlag = getPairingAutoFlag();
  if (!pairingId || !pairingCode || !autoFlag) return false;

  state.pairing.autoTried = true;
  try {
    setStatusKey("pairing.autoBinding");
    await completePairing({
      pairingId,
      code: pairingCode,
      deviceName: getStoredDeviceName() || inferDefaultDeviceName(),
      closeDialog: true,
      showStatus: false,
    });
    return true;
  } catch (error) {
    setStatusKey("pairing.autoFailed", { error: asMessage(error) });
    return false;
  }
}

function migrateLegacySettings() {
  const hasNewToken = Boolean(localStorage.getItem(storageKeys.token));
  const hasNewBase = Boolean(localStorage.getItem(storageKeys.baseUrl));
  const oldToken = localStorage.getItem(legacyStorageKeys.token) || "";
  const oldBase = localStorage.getItem(legacyStorageKeys.baseUrl) || "";

  if (!hasNewToken && oldToken) {
    localStorage.setItem(storageKeys.token, oldToken);
  }
  if (!hasNewBase && oldBase) {
    localStorage.setItem(storageKeys.baseUrl, normalizeBaseUrl(oldBase));
  }
}

function isTypingInputBusy() {
  const activeElement = document.activeElement;
  const focused = activeElement === elements.input;
  if (state.inputPerf.composing) return true;
  if (!focused) return false;
  return Date.now() - state.inputPerf.lastAt < INPUT_ACTIVITY_HOLD_MS;
}

function recordInputActivity() {
  state.inputPerf.lastAt = Date.now();
  scheduleDeferredWorkFlush();
}

function scheduleDeferredWorkFlush(delayMs) {
  if (state.inputPerf.idleTimer) {
    clearTimeout(state.inputPerf.idleTimer);
  }
  const elapsed = Date.now() - state.inputPerf.lastAt;
  const idleWait =
    delayMs === undefined
      ? Math.max(80, INPUT_ACTIVITY_HOLD_MS - elapsed + 40)
      : Math.max(40, Number(delayMs) || 0);
  state.inputPerf.idleTimer = setTimeout(() => {
    flushDeferredWork();
  }, idleWait);
}

function markDeferredThreadRefresh(delay = 350) {
  state.inputPerf.deferredThreadRefresh = true;
  state.inputPerf.deferredThreadDelay = Math.max(
    100,
    Math.min(
      Number(state.inputPerf.deferredThreadDelay || delay),
      Number(delay || 350)
    )
  );
  scheduleDeferredWorkFlush();
}

function markDeferredListRefresh(options = {}) {
  state.inputPerf.deferredListRefresh = true;
  state.inputPerf.deferredListOptions = {
    preserveSelection: options.preserveSelection !== false,
    silent: Boolean(options.silent),
  };
  scheduleDeferredWorkFlush();
}

function markDeferredLiveRender() {
  state.inputPerf.deferredLiveRender = true;
  scheduleDeferredWorkFlush();
}

function markDeferredContextRender() {
  state.inputPerf.deferredContextRender = true;
  scheduleDeferredWorkFlush();
}

function flushDeferredWork() {
  if (isTypingInputBusy()) {
    scheduleDeferredWorkFlush();
    return;
  }
  if (state.inputPerf.idleTimer) {
    clearTimeout(state.inputPerf.idleTimer);
    state.inputPerf.idleTimer = null;
  }
  if (state.inputPerf.deferredListRefresh) {
    const options = state.inputPerf.deferredListOptions || {
      preserveSelection: true,
      silent: true,
    };
    state.inputPerf.deferredListRefresh = false;
    state.inputPerf.deferredListOptions = null;
    queueListRefresh(80, options, { allowDuringTyping: true });
  }
  if (state.inputPerf.deferredThreadRefresh) {
    const delay = Number(state.inputPerf.deferredThreadDelay || 220);
    state.inputPerf.deferredThreadRefresh = false;
    state.inputPerf.deferredThreadDelay = 350;
    queueThreadRefresh(delay, { allowDuringTyping: true });
  }
  if (state.inputPerf.deferredLiveRender) {
    state.inputPerf.deferredLiveRender = false;
    scheduleLiveDeltaRender({ allowDuringTyping: true });
  }
  if (state.inputPerf.deferredContextRender) {
    state.inputPerf.deferredContextRender = false;
    renderContextUsage();
  }
}

function queueListRefresh(
  delay = 180,
  options = { preserveSelection: true, silent: true },
  control = {}
) {
  if (!control.allowDuringTyping && isTypingInputBusy()) {
    markDeferredListRefresh(options);
    return;
  }
  if (state.listRefreshTimer) {
    clearTimeout(state.listRefreshTimer);
  }
  state.listRefreshTimer = setTimeout(() => {
    if (!control.allowDuringTyping && isTypingInputBusy()) {
      markDeferredListRefresh(options);
      return;
    }
    if (state.loadingThreads) {
      markDeferredListRefresh(options);
      return;
    }
    loadThreads(options).catch(() => {
      // noop
    });
  }, Math.max(40, Number(delay) || 0));
}

function scheduleLiveDeltaRender(control = {}) {
  if (!control.allowDuringTyping && isTypingInputBusy()) {
    markDeferredLiveRender();
    return;
  }
  if (state.liveRenderTimer) return;
  state.liveRenderTimer = setTimeout(() => {
    state.liveRenderTimer = null;
    renderLiveDeltas();
  }, LIVE_DELTA_RENDER_INTERVAL_MS);
}

function startPolling() {
  if (state.listPollTimer) clearInterval(state.listPollTimer);
  state.listPollTimer = setInterval(() => {
    queueListRefresh(140, { preserveSelection: true, silent: true });
  }, 8000);
  scheduleThreadPoll();
}

function scheduleThreadPoll() {
  if (state.threadPollTimer) clearTimeout(state.threadPollTimer);
  if (!state.selectedThreadId || !state.selectedThread) return;

  const hasInProgress = threadHasInProgress(state.selectedThread);
  const delay = hasInProgress ? 2000 : 10000;
  state.threadPollTimer = setTimeout(async () => {
    if (!state.selectedThreadId) return;
    if (isTypingInputBusy()) {
      markDeferredThreadRefresh(hasInProgress ? 320 : 450);
      scheduleThreadPoll();
      return;
    }
    try {
      if (!state.loadingThread) {
        await loadCurrentThread(state.selectedThreadId, { silent: true });
      } else {
        markDeferredThreadRefresh(hasInProgress ? 320 : 450);
      }
    } catch (_error) {
      // noop
    } finally {
      scheduleThreadPoll();
    }
  }, delay);
}

function queueThreadRefresh(delay = 350, control = {}) {
  if (!control.allowDuringTyping && isTypingInputBusy()) {
    markDeferredThreadRefresh(delay);
    return;
  }
  if (state.threadRefreshTimer) clearTimeout(state.threadRefreshTimer);
  state.threadRefreshTimer = setTimeout(() => {
    if (!state.selectedThreadId) return;
    if (!control.allowDuringTyping && isTypingInputBusy()) {
      markDeferredThreadRefresh(delay);
      return;
    }
    if (state.loadingThread) {
      markDeferredThreadRefresh(Math.max(220, Number(delay) || 220));
      return;
    }
    loadCurrentThread(state.selectedThreadId, { silent: true }).catch(() => {
      // noop
    });
  }, delay);
}

async function connectEventSource() {
  disconnectEventSource();
  const base = getBaseUrl();
  const qs = new URLSearchParams();
  const watchThreadId = state.selectedThreadId || state.lockedThreadId;
  if (watchThreadId) {
    qs.set("threadId", watchThreadId);
  }
  let eventUrl = `${base}/api/v2/events`;
  if (qs.toString()) {
    eventUrl += `?${qs.toString()}`;
  }
  const es = new EventSource(eventUrl, { withCredentials: true });
  state.eventSource = es;

  es.addEventListener("open", () => {
    setStatusKey("status.sseConnected");
  });
  es.addEventListener("error", () => {
    setStatusKey("status.sseFlaky");
  });
  es.addEventListener("sync", (event) => {
    const payload = parseSse(event);
    if (!payload) return;
    if (payload.status === "reconnecting") {
      setStatusKey("status.reconnecting", {
        attempt:
          payload.info && payload.info.attempt ? payload.info.attempt : "?",
      });
      return;
    }
    if (payload.status === "ready") {
      setStatusKey("status.online");
      return;
    }
    if (payload.status) {
      setStatusKey("status.syncState", { status: payload.status });
    }
  });
  es.addEventListener("approvals", (event) => {
    const payload = parseSse(event);
    if (!payload || !Array.isArray(payload.items)) return;
    state.pendingApprovals = payload.items;
    renderApprovals();
  });
  es.addEventListener("approval-required", (event) => {
    const payload = parseSse(event);
    if (!payload) return;
    upsertPendingApproval(payload);
    renderApprovals();
  });
  es.addEventListener("approval-resolved", (event) => {
    const payload = parseSse(event);
    if (!payload) return;
    state.pendingApprovals = state.pendingApprovals.filter(
      (item) => String(item.id) !== String(payload.id)
    );
    renderApprovals();
  });
  es.addEventListener("approval-pending-reminder", (event) => {
    const payload = parseSse(event);
    if (!payload) return;
    setStatusKey("status.approvalPending", { method: payload.method });
  });
  es.addEventListener("thread-list-updated", () => {
    queueListRefresh(120, { preserveSelection: true, silent: true });
  });
  es.addEventListener("thread-updated", () => {
    if (!state.selectedThreadId) return;
    if (isTypingInputBusy()) {
      markDeferredThreadRefresh(260);
    } else {
      queueThreadRefresh(120);
    }
    scheduleThreadPoll();
  });
  es.addEventListener("rpc-notification", (event) => {
    const payload = parseSse(event);
    if (!payload) return;
    handleRpcNotification(payload);
  });
  es.addEventListener("error", (event) => {
    const payload = parseSse(event);
    if (!payload || !payload.message) return;
    setStatusKey("status.error", { message: payload.message });
  });
}

function disconnectEventSource() {
  if (!state.eventSource) return;
  try {
    state.eventSource.close();
  } catch (_error) {
    // noop
  }
  state.eventSource = null;
}

function handleRpcNotification(payload) {
  const method = payload.method;
  const params = payload.params || {};
  if (method === "thread/tokenUsage/updated") {
    const threadId = String(params.threadId || "");
    if (!threadId) return;
    const usage = normalizeTokenUsage(params.tokenUsage || params);
    state.threadUsageById.set(threadId, usage);
    if (threadId === state.selectedThreadId) {
      state.selectedThreadUsage = usage;
      if (isTypingInputBusy()) {
        markDeferredContextRender();
      } else {
        renderContextUsage();
      }
    }
    return;
  }

  if (method === "item/agentMessage/delta") {
    if (params.threadId !== state.selectedThreadId) return;
    const itemId = params.itemId || "live";
    const prev = state.liveDeltas.get(itemId) || "";
    state.liveDeltas.set(itemId, prev + String(params.delta || ""));
    scheduleLiveDeltaRender();
    return;
  }

  if (
    method === "turn/started" ||
    method === "turn/completed" ||
    method === "turn/interrupted" ||
    method === "item/started" ||
    method === "item/completed" ||
    method === "item/commandExecution/outputDelta" ||
    method === "item/fileChange/outputDelta"
  ) {
    if (params.threadId === state.selectedThreadId) {
      queueThreadRefresh(300);
    }
    return;
  }

  if (method === "thread/started" || method === "thread/name/updated") {
    queueListRefresh(120, { preserveSelection: true, silent: true });
  }
}

async function loadThreads(options = {}) {
  if (state.loadingThreads) return;
  state.loadingThreads = true;
  const preserveSelection = options.preserveSelection !== false;
  const silent = Boolean(options.silent);
  try {
    const includeArchived = Boolean(elements.archivedToggle.checked);
    const commonParams = new URLSearchParams();
    commonParams.set("limit", "100");
    if (!state.lockedThreadId) {
      const query = elements.threadSearch.value.trim();
      if (query) commonParams.set("query", query);
      const source = elements.sourceFilter.value.trim();
      if (source) {
        commonParams.set("sourceKinds", source);
      } else if (state.desktopCompatibleMode) {
        commonParams.set("sourceKinds", DESKTOP_COMPAT_SOURCE_KINDS.join(","));
      }
    }

    const fetchThreads = async (archivedFlag) => {
      const params = new URLSearchParams(commonParams);
      params.set("archived", String(Boolean(archivedFlag)));
      const data = await apiFetchJson(`/api/v2/threads?${params.toString()}`);
      const threads = Array.isArray(data.data) ? data.data : [];
      for (const item of threads) {
        if (item && typeof item === "object") {
          item.archived = Boolean(archivedFlag);
        }
      }
      return threads;
    };

    let threads = await fetchThreads(false);
    if (includeArchived) {
      const archivedThreads = await fetchThreads(true);
      const seen = new Set(threads.map((t) => String(t && t.id ? t.id : "")));
      for (const item of archivedThreads) {
        const key = String(item && item.id ? item.id : "");
        if (!key || seen.has(key)) continue;
        seen.add(key);
        threads.push(item);
      }
      threads.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    }

    state.threads = threads;
    if (state.lockedThreadId) {
      let lockedThread =
        state.threads.find((item) => item.id === state.lockedThreadId) || null;
      if (!lockedThread) {
        try {
          const lockedData = await apiFetchJson(
            `/api/v2/threads/${encodeURIComponent(
              state.lockedThreadId
            )}?includeTurns=false`
          );
          lockedThread = lockedData.thread || null;
        } catch (_error) {
          lockedThread = null;
        }
      }
      state.threads = lockedThread ? [lockedThread] : [];
    }
    state.projects = groupThreadsByProject(state.threads);

    if (
      state.expandedProjectKey &&
      !state.projects.some((item) => item.key === state.expandedProjectKey)
    ) {
      state.expandedProjectKey = null;
      state.projectCollapsedByUser = false;
    }
    if (!state.expandedProjectKey && state.selectedThreadId && !state.projectCollapsedByUser) {
      const selected = state.threads.find((item) => item.id === state.selectedThreadId);
      if (selected) {
        state.expandedProjectKey = getProjectKey(selected);
      }
    }

    if (preserveSelection && state.selectedThreadId) {
      const exists = state.threads.some((item) => item.id === state.selectedThreadId);
      if (!exists && state.threads.length > 0) {
        await selectThread(state.threads[0].id);
      } else if (!exists && state.threads.length === 0) {
        state.selectedThreadId = null;
        state.selectedThread = null;
        state.selectedThreadUsage = null;
        renderCurrentThread();
      }
    } else if (!state.selectedThreadId && state.threads.length > 0) {
      await selectThread(state.threads[0].id);
    }

    if (!silent) {
      setStatusKey("status.threadsCount", { count: state.threads.length });
    }
    if (silent && isTypingInputBusy()) {
      markDeferredListRefresh({ preserveSelection, silent });
      return;
    }
    renderThreadList();
  } finally {
    state.loadingThreads = false;
    if (!isTypingInputBusy()) {
      scheduleDeferredWorkFlush(80);
    }
  }
}

async function selectThread(threadId) {
  if (state.lockedThreadId && String(threadId) !== state.lockedThreadId) {
    setStatusKey("status.threadLocked", {
      id: state.lockedThreadId.slice(0, 8),
    });
    return;
  }
  state.selectedThreadId = String(threadId);
  const thread = state.threads.find((item) => item.id === state.selectedThreadId);
  if (thread && !state.projectCollapsedByUser) {
    state.expandedProjectKey = getProjectKey(thread);
  }
  state.selectedThreadUsage = state.threadUsageById.get(state.selectedThreadId) || null;
  state.liveDeltas.clear();
  state.forceScrollToBottom = true;
  state.chatScrollLocked = false;
  renderThreadList();
  renderContextUsage();
  await loadCurrentThread(state.selectedThreadId, { silent: false });
  await connectEventSource();
  closeSidebar();
}

async function loadCurrentThread(threadId, options = {}) {
  if (!threadId) return;
  const loadSeq = ++state.threadLoadSeq;
  state.loadingThread = true;
  const silent = Boolean(options.silent);
  try {
    const data = await apiFetchJson(
      `/api/v2/threads/${encodeURIComponent(threadId)}?includeTurns=true`
    );
    if (loadSeq !== state.threadLoadSeq) {
      return;
    }
    if (silent && isTypingInputBusy()) {
      markDeferredThreadRefresh(220);
      return;
    }
    state.selectedThread = data.thread;
    // thread/read may omit archived state; keep it consistent with the list view.
    const cached = state.threads.find((item) => item && item.id === String(threadId));
    if (cached && typeof cached.archived === "boolean" && state.selectedThread) {
      state.selectedThread.archived = cached.archived;
    }
    if (data.usage) {
      const normalizedUsage = normalizeTokenUsage(data.usage);
      state.threadUsageById.set(String(threadId), normalizedUsage);
      state.selectedThreadUsage = normalizedUsage;
    } else {
      state.selectedThreadUsage = state.threadUsageById.get(String(threadId)) || null;
    }
    state.liveDeltas.clear();
    renderCurrentThread();
    renderContextUsage();
    if (!silent) {
      const turnCount = Array.isArray(data.thread && data.thread.turns)
        ? data.thread.turns.length
        : 0;
      setStatusKey("status.threadLoaded", {
        id: threadId.slice(0, 8),
        turns: turnCount,
      });
    }
    scheduleThreadPoll();
  } finally {
    if (loadSeq === state.threadLoadSeq) {
      state.loadingThread = false;
    }
    if (!isTypingInputBusy()) {
      scheduleDeferredWorkFlush(80);
    }
  }
}

function renderThreadList() {
  elements.threadList.innerHTML = "";
  const projects = state.projects && state.projects.length > 0 ? state.projects : groupThreadsByProject(state.threads);
  if (projects.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = t("thread.emptyList");
    elements.threadList.append(empty);
    return;
  }
  if (
    state.expandedProjectKey &&
    !projects.some((p) => p.key === state.expandedProjectKey)
  ) {
    state.expandedProjectKey = null;
    state.projectCollapsedByUser = false;
  }
  if (!state.expandedProjectKey && state.selectedThreadId && !state.projectCollapsedByUser) {
    const selected = state.threads.find((item) => item.id === state.selectedThreadId);
    if (selected) {
      state.expandedProjectKey = getProjectKey(selected);
    }
  }

  for (const project of projects) {
    const group = document.createElement("section");
    group.className = "project-group";
    const expanded = project.key === state.expandedProjectKey;
    if (expanded) {
      group.classList.add("expanded");
    }

    const header = document.createElement("button");
    header.type = "button";
    header.className = "project-header";
    header.dataset.action = "toggle-project";
    header.dataset.projectKey = encodeURIComponent(project.key);
    header.setAttribute("aria-expanded", expanded ? "true" : "false");
    header.innerHTML = [
      `<span class="project-main"><span class="project-title">${escapeHtml(project.name)}</span><span class="project-count">${escapeHtml(
        t("thread.projectCount", { count: project.threads.length })
      )}</span></span>`,
      `<span class="project-caret">${expanded ? "▾" : "▸"}</span>`,
    ].join("");
    group.append(header);

    const pathMeta = document.createElement("div");
    pathMeta.className = "project-path";
    pathMeta.textContent = project.key;
    group.append(pathMeta);

    if (expanded) {
      const list = document.createElement("div");
      list.className = "project-thread-list";
      for (const thread of project.threads) {
        const row = document.createElement("article");
        row.className = "thread-item";
        row.dataset.threadId = thread.id;
        row.dataset.action = "open";
        if (thread.id === state.selectedThreadId) {
          row.classList.add("active");
        }

        const open = document.createElement("button");
        open.className = "thread-open";
        open.dataset.threadId = thread.id;
        open.dataset.action = "open";

        const title = document.createElement("div");
        title.className = "thread-preview";
        title.textContent = thread.preview || t("thread.emptyPreview");

        const meta = document.createElement("div");
        meta.className = "thread-meta";
        const metaParts = [
          thread.id.slice(0, 8),
          thread.source || "unknown",
          thread.modelProvider || "openai",
          formatThreadTime(thread.updatedAt),
        ];
        if (thread.archived) {
          metaParts.push(t("thread.archived"));
        }
        meta.textContent = metaParts.join(" · ");
        open.append(title, meta);

        if (!state.lockedThreadId) {
          const actions = document.createElement("div");
          actions.className = "thread-actions";
          actions.append(
            actionButton(t("thread.action.rename"), "rename", thread.id),
            actionButton(
              thread.archived ? t("thread.action.unarchive") : t("thread.action.archive"),
              thread.archived ? "unarchive" : "archive",
              thread.id
            ),
            actionButton(t("thread.action.fork"), "fork", thread.id)
          );
          row.append(open, actions);
        } else {
          row.append(open);
        }
        list.append(row);
      }
      group.append(list);
    }

    elements.threadList.append(group);
  }
}

function actionButton(label, action, threadId) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn mini ghost";
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.threadId = threadId;
  return button;
}

function renderCurrentThread() {
  const thread = state.selectedThread;
  const viewport = captureChatViewport();
  const forceBottom = Boolean(state.forceScrollToBottom);
  const shouldStickBottom = forceBottom || !state.chatScrollLocked;
  elements.chat.innerHTML = "";
  if (!thread) {
    const emptyTitle = t("thread.selectPrompt");
    elements.threadTitle.textContent = emptyTitle;
    elements.threadMeta.textContent = "";
    state.selectedThreadUsage = null;
    renderContextUsage();
    state.forceScrollToBottom = false;
    return;
  }

  const titleText = thread.preview
    ? thread.preview.slice(0, 56)
    : t("thread.titleWithId", { id: thread.id.slice(0, 8) });
  elements.threadTitle.textContent = titleText;
  const turnCount = Array.isArray(thread.turns) ? thread.turns.length : 0;
  const source = thread.source || "unknown";
  const sourceHint =
    state.desktopCompatibleMode && source === "exec"
      ? t("thread.execHint")
      : "";
  const archivedHint = thread.archived ? t("thread.archivedHint") : "";
  const metaText = `${source} · ${thread.cwd || "-"} · ${
    thread.id
  } · ${t("thread.turnsCount", { count: turnCount })}${sourceHint}${archivedHint}`;
  elements.threadMeta.textContent = metaText;
  renderContextUsage();

  const turns = Array.isArray(thread.turns) ? thread.turns : [];
  if (turns.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = t("thread.noContent");
    elements.chat.append(empty);
    restoreChatViewport(viewport, shouldStickBottom);
    if (shouldStickBottom) {
      state.chatScrollLocked = false;
    }
    state.forceScrollToBottom = false;
    return;
  }

  for (const turn of turns) {
    const turnWrap = document.createElement("section");
    turnWrap.className = "turn";
    const turnHeader = document.createElement("header");
    turnHeader.className = "turn-header";
    turnHeader.textContent = t("thread.turnHeader", {
      id: turn.id,
      status: turn.status,
    });
    turnWrap.append(turnHeader);

    const normalized = normalizeTurnItemsForDisplay(turn.items);
    for (const item of normalized.items) {
      turnWrap.append(renderThreadItem(item));
    }
    if (normalized.hiddenAgentCount > 0) {
      const hint = document.createElement("div");
      hint.className = "turn-hint";
      hint.textContent = t("thread.hiddenAgent", {
        count: normalized.hiddenAgentCount,
      });
      turnWrap.append(hint);
    }

    if (turn.error) {
      const error = document.createElement("pre");
      error.className = "item error";
      error.textContent = JSON.stringify(turn.error, null, 2);
      turnWrap.append(error);
    }

    elements.chat.append(turnWrap);
  }

  renderLiveDeltas({ shouldAutoScroll: shouldStickBottom });
  restoreChatViewport(viewport, shouldStickBottom);
  if (shouldStickBottom) {
    state.chatScrollLocked = false;
  }
  state.forceScrollToBottom = false;
}

function renderThreadItem(item) {
  if (item.type === "userMessage") {
    const box = document.createElement("article");
    box.className = "item msg user";
    const contentList = Array.isArray(item.content) ? item.content : [];
    for (const c of contentList) {
      if (c.type === "text") {
        const p = document.createElement("p");
        p.className = "text";
        p.textContent = c.text || "";
        box.append(p);
      } else if (c.type === "image") {
        box.append(renderImage(c.url, "image"));
      } else if (c.type === "localImage") {
        box.append(renderImage(c.mediaUrl || "", c.path || "local image"));
      }
    }
    return box;
  }

  if (item.type === "agentMessage") {
    const box = document.createElement("article");
    box.className = "item msg assistant";
    const p = document.createElement("p");
    p.className = "text";
    p.textContent = item.text || "";
    box.append(p);
    return box;
  }

  if (item.type === "reasoning" || item.type === "plan") {
    const details = document.createElement("details");
    details.className = "item details";
    const summary = document.createElement("summary");
    summary.textContent =
      item.type === "reasoning" ? t("item.reasoning") : t("item.plan");
    const pre = document.createElement("pre");
    if (item.type === "reasoning") {
      pre.textContent = [
        ...(Array.isArray(item.summary) ? item.summary : []),
        "",
        ...(Array.isArray(item.content) ? item.content : []),
      ].join("\n");
    } else {
      pre.textContent = item.text || "";
    }
    details.append(summary, pre);
    return details;
  }

  if (item.type === "commandExecution") {
    const details = document.createElement("details");
    details.className = "item details";
    const summary = document.createElement("summary");
    summary.textContent = t("item.commandSummary", { status: item.status });
    const pre = document.createElement("pre");
    pre.textContent = [
      `cwd: ${item.cwd || "-"}`,
      `command: ${item.command || "-"}`,
      "",
      item.aggregatedOutput || t("item.noOutput"),
    ].join("\n");
    details.append(summary, pre);
    return details;
  }

  if (item.type === "fileChange") {
    const details = document.createElement("details");
    details.className = "item details";
    const summary = document.createElement("summary");
    summary.textContent = t("item.fileChangeSummary", { status: item.status });
    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(item.changes || [], null, 2);
    details.append(summary, pre);
    return details;
  }

  if (item.type === "imageView") {
    const box = document.createElement("article");
    box.className = "item msg assistant";
    box.append(renderImage(item.mediaUrl || "", item.path || "image view"));
    return box;
  }

  const fallback = document.createElement("details");
  fallback.className = "item details";
  const summary = document.createElement("summary");
  summary.textContent = item.type || "item";
  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify(item, null, 2);
  fallback.append(summary, pre);
  return fallback;
}

function renderImage(src, alt) {
  const wrap = document.createElement("div");
  wrap.className = "image-wrap";
  if (!src) {
    const p = document.createElement("p");
    p.className = "dim";
    p.textContent = t("item.noImage", { alt });
    wrap.append(p);
    return wrap;
  }
  const img = document.createElement("img");
  img.loading = "eager";
  img.decoding = "async";
  img.src = src;
  img.alt = alt || "image";
  wrap.append(img);
  return wrap;
}

function renderLiveDeltas(options = {}) {
  const existing = elements.chat.querySelector(".live-delta");
  if (existing) existing.remove();
  if (state.liveDeltas.size === 0) return;
  const shouldAutoScroll = Boolean(
    options.shouldAutoScroll !== undefined
      ? options.shouldAutoScroll
      : !state.chatScrollLocked
  );
  const section = document.createElement("section");
  section.className = "live-delta";
  const text = [...state.liveDeltas.values()].join("");
  if (!text.trim()) return;
  const title = document.createElement("header");
  title.textContent = t("item.liveTitle");
  const pre = document.createElement("pre");
  pre.textContent = text;
  section.append(title, pre);
  elements.chat.append(section);
  if (shouldAutoScroll) {
    elements.chat.scrollTop = elements.chat.scrollHeight;
  }
}

function isChatNearBottom(threshold = 36) {
  const maxScrollTop = elements.chat.scrollHeight - elements.chat.clientHeight;
  if (maxScrollTop <= 0) return true;
  return maxScrollTop - elements.chat.scrollTop <= threshold;
}

function captureChatViewport() {
  return {
    scrollTop: elements.chat.scrollTop,
    nearBottom: isChatNearBottom(),
  };
}

function restoreChatViewport(viewport, forceBottom = false) {
  if (!viewport) return;
  if (forceBottom) {
    elements.chat.scrollTop = elements.chat.scrollHeight;
    return;
  }
  const maxScrollTop = Math.max(0, elements.chat.scrollHeight - elements.chat.clientHeight);
  elements.chat.scrollTop = Math.min(viewport.scrollTop, maxScrollTop);
}

async function loadPendingApprovals() {
  const data = await apiFetchJson("/api/v2/approvals");
  state.pendingApprovals = Array.isArray(data.items) ? data.items : [];
  renderApprovals();
}

function upsertPendingApproval(payload) {
  const idx = state.pendingApprovals.findIndex(
    (item) => String(item.id) === String(payload.id)
  );
  if (idx >= 0) {
    state.pendingApprovals[idx] = payload;
  } else {
    state.pendingApprovals.push(payload);
  }
}

function renderApprovals() {
  elements.approvalList.innerHTML = "";
  if (state.pendingApprovals.length === 0) {
    elements.approvalsPanel.classList.add("hidden");
    return;
  }
  elements.approvalsPanel.classList.remove("hidden");

  for (const item of state.pendingApprovals) {
    const card = document.createElement("article");
    card.className = "approval-card";
    const title = document.createElement("h4");
    title.textContent = item.method;
    const meta = document.createElement("pre");
    meta.textContent = JSON.stringify(item.params || {}, null, 2);

    const actions = document.createElement("div");
    actions.className = "approval-actions";

    if (item.method === "item/commandExecution/requestApproval") {
      actions.append(
        approvalButton(t("approval.accept"), "accept", item.id),
        approvalButton(t("approval.acceptSession"), "acceptForSession", item.id),
        approvalButton(t("approval.decline"), "decline", item.id),
        approvalButton(t("approval.cancel"), "cancel", item.id)
      );
    } else if (item.method === "item/fileChange/requestApproval") {
      actions.append(
        approvalButton(t("approval.accept"), "accept", item.id),
        approvalButton(t("approval.acceptSession"), "acceptForSession", item.id),
        approvalButton(t("approval.decline"), "decline", item.id),
        approvalButton(t("approval.cancel"), "cancel", item.id)
      );
    } else if (item.method === "item/tool/requestUserInput") {
      actions.append(approvalButton(t("approval.cancel"), "cancel", item.id));
    } else {
      actions.append(approvalButton(t("approval.cancel"), "cancel", item.id));
    }

    card.append(title, meta, actions);
    elements.approvalList.append(card);
  }
}

function approvalButton(label, decision, requestId) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn mini";
  btn.textContent = label;
  btn.dataset.requestId = requestId;
  btn.dataset.decision = decision;
  return btn;
}

async function submitApproval(requestId, decision) {
  await apiFetchJson(`/api/v2/approvals/${encodeURIComponent(requestId)}`, {
    method: "POST",
    body: {
      decision,
    },
  });
  state.pendingApprovals = state.pendingApprovals.filter(
    (item) => String(item.id) !== String(requestId)
  );
  renderApprovals();
  setStatusKey("status.approvalSubmitted", { decision });
}

async function createThread() {
  if (state.lockedThreadId) {
    setStatusKey("status.newThreadLocked");
    return;
  }
  // Prefer creating the thread within the currently expanded/selected project.
  // Otherwise Codex may default to "/" and the new thread becomes hard to find.
  const preferredCwd = resolvePreferredCwdForNewThread();
  const data = await apiFetchJson("/api/v2/threads", {
    method: "POST",
    body: preferredCwd ? { cwd: preferredCwd } : {},
  });
  const thread = data.thread;
  if (thread && thread.id) {
    await loadThreads({ preserveSelection: false });
    await selectThread(thread.id);
  } else {
    await loadThreads({ preserveSelection: true });
  }
}

async function renameThread(threadId) {
  const item = state.threads.find((t) => t.id === threadId);
  const initial = item && item.preview ? item.preview.slice(0, 64) : "";
  const name = window.prompt(t("prompt.renameThread"), initial);
  if (!name || !name.trim()) return;
  await apiFetchJson(`/api/v2/threads/${encodeURIComponent(threadId)}/name`, {
    method: "POST",
    body: { name: name.trim() },
  });
  await loadThreads({ preserveSelection: true });
  if (state.selectedThreadId === threadId) {
    await loadCurrentThread(threadId, { silent: true });
  }
}

async function archiveThread(threadId) {
  await apiFetchJson(`/api/v2/threads/${encodeURIComponent(threadId)}/archive`, {
    method: "POST",
    body: {},
  });
  await loadThreads({ preserveSelection: true });
  if (state.selectedThreadId === threadId) {
    await loadCurrentThread(threadId, { silent: true });
  }
}

async function unarchiveThread(threadId) {
  await apiFetchJson(`/api/v2/threads/${encodeURIComponent(threadId)}/unarchive`, {
    method: "POST",
    body: {},
  });
  await loadThreads({ preserveSelection: true });
  if (state.selectedThreadId === threadId) {
    await loadCurrentThread(threadId, { silent: true });
  }
}

async function forkThread(threadId) {
  const data = await apiFetchJson(`/api/v2/threads/${encodeURIComponent(threadId)}/fork`, {
    method: "POST",
    body: {},
  });
  await loadThreads({ preserveSelection: true });
  if (data.thread && data.thread.id) {
    await selectThread(data.thread.id);
  }
}

async function sendCurrentMessage() {
  if (state.sending) return;
  let threadId = state.lockedThreadId || state.selectedThreadId;
  if (!threadId) {
    await createThread();
    threadId = state.lockedThreadId || state.selectedThreadId;
  }
  if (!threadId) {
    throw new Error(t("error.cannotDetermineThread"));
  }

  const text = elements.input.value.trim();
  const hasText = Boolean(text);
  const hasImages = state.pendingImages.length > 0;
  const hasVoice = Boolean(state.pendingVoice);
  if (!hasText && !hasImages && !hasVoice) {
    return;
  }

  const payload = {
    text,
    imageMediaIds: state.pendingImages.map((item) => item.mediaId),
    voiceMediaId: state.pendingVoice ? state.pendingVoice.mediaId : null,
    voiceTranscript: state.pendingVoice ? state.pendingVoice.transcript : "",
  };

  state.sending = true;
  elements.sendBtn.disabled = true;
  setStatusKey("status.sending");
  try {
    const sent = await apiFetchJson(`/api/v2/threads/${encodeURIComponent(threadId)}/turns`, {
      method: "POST",
      body: payload,
    });
    elements.input.value = "";
    clearPendingAttachments();
    const turnId =
      sent && sent.turn && sent.turn.id ? String(sent.turn.id) : "";
    if (turnId) {
      setStatusKey("status.sentTurn", {
        id: threadId.slice(0, 8),
        turnId,
      });
    } else {
      setStatusKey("status.sentThread", { id: threadId.slice(0, 8) });
    }
    state.forceScrollToBottom = true;
    state.chatScrollLocked = false;
    queueThreadRefresh(300);
    loadThreads({ preserveSelection: true, silent: true }).catch(() => {
      // noop
    });
  } finally {
    state.sending = false;
    elements.sendBtn.disabled = false;
    if (isMobileViewport()) {
      if (elements.input && document.activeElement === elements.input) {
        elements.input.blur();
      }
      state.mobileUi.composerExpanded = false;
      applyMobileUiState();
    } else {
      elements.input.focus();
    }
  }
}

function clearPendingAttachments() {
  state.pendingImages = [];
  state.pendingVoice = null;
  renderPendingImages();
  renderPendingVoice();
}

function syncAttachmentsVisibility() {
  if (!elements.attachments) return;
  const hasAttachments =
    state.pendingImages.length > 0 || Boolean(state.pendingVoice);
  elements.attachments.classList.toggle("hidden", !hasAttachments);
  if (hasAttachments) {
    expandComposerMobile();
  } else {
    scheduleComposerCollapse(120);
  }
  applyMobileUiState();
}

async function uploadImages(files) {
  for (const file of files) {
    const dataUrl = await readFileAsDataUrl(file);
    const resp = await apiFetchJson("/api/v2/media/image", {
      method: "POST",
      body: {
        dataUrl,
        fileName: file.name,
        mimeType: file.type || "image/jpeg",
      },
    });
    state.pendingImages.push({
      mediaId: resp.mediaId,
      localPath: resp.localPath,
      previewUrl: dataUrl,
      fileName: file.name,
    });
  }
  elements.imagePicker.value = "";
  renderPendingImages();
  if (elements.input && typeof elements.input.focus === "function") {
    try {
      elements.input.focus({ preventScroll: true });
    } catch (_error) {
      elements.input.focus();
    }
  }
}

function renderPendingImages() {
  elements.pendingImages.innerHTML = "";
  if (state.pendingImages.length === 0) {
    syncAttachmentsVisibility();
    return;
  }
  for (const item of state.pendingImages) {
    const card = document.createElement("article");
    card.className = "pending-card";
    const img = document.createElement("img");
    img.src = item.previewUrl;
    img.alt = item.fileName || "image";
    const meta = document.createElement("span");
    meta.textContent = item.fileName || item.mediaId;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn mini ghost";
    remove.textContent = t("voice.remove");
    remove.dataset.removeMediaId = item.mediaId;
    card.append(img, meta, remove);
    elements.pendingImages.append(card);
  }
  syncAttachmentsVisibility();
}

async function toggleVoiceRecording() {
  if (state.voice.recording) {
    await stopVoiceRecording();
  } else {
    await startVoiceRecording();
  }
}

async function startVoiceRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error(t("voice.notSupported"));
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  state.voice.stream = stream;
  state.voice.mediaRecorder = recorder;
  state.voice.chunks = [];
  state.voice.finalTranscript = "";
  state.voice.interimTranscript = "";

  recorder.addEventListener("dataavailable", (event) => {
    if (event.data && event.data.size > 0) {
      state.voice.chunks.push(event.data);
    }
  });
  recorder.addEventListener("stop", async () => {
    const blob = new Blob(state.voice.chunks, {
      type: recorder.mimeType || "audio/webm",
    });
    if (blob.size > 0) {
      try {
        await uploadVoiceBlob(blob, state.voice.finalTranscript.trim());
      } catch (error) {
        setStatusKey("status.voiceUploadFailed", { error: asMessage(error) });
      }
    }
    cleanupVoiceState();
  });

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.lang = state.language === "en" ? "en-US" : "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.addEventListener("result", (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0] ? result[0].transcript : "";
        if (result.isFinal) finalText += transcript;
        else interimText += transcript;
      }
      if (finalText) state.voice.finalTranscript += finalText;
      state.voice.interimTranscript = interimText;
      setStatusKey("status.recordingProgress", {
        text: `${state.voice.finalTranscript}${state.voice.interimTranscript}`,
      });
    });
    recognition.addEventListener("error", () => {
      // 语音识别失败不阻断录音。
    });
    state.voice.recognition = recognition;
    recognition.start();
  }

  recorder.start(250);
  state.voice.recording = true;
  elements.voiceBtn.textContent = t("btn.voiceStop");
  setStatusKey("status.recording");
  expandComposerMobile();
}

async function stopVoiceRecording() {
  if (!state.voice.recording) return;
  state.voice.recording = false;
  elements.voiceBtn.textContent = t("btn.voice");
  if (state.voice.recognition) {
    try {
      state.voice.recognition.stop();
    } catch (_error) {
      // noop
    }
  }
  if (state.voice.mediaRecorder && state.voice.mediaRecorder.state !== "inactive") {
    state.voice.mediaRecorder.stop();
  } else {
    cleanupVoiceState();
  }
  scheduleComposerCollapse(180);
}

function cleanupVoiceState() {
  if (state.voice.stream) {
    for (const track of state.voice.stream.getTracks()) {
      track.stop();
    }
  }
  state.voice.mediaRecorder = null;
  state.voice.recognition = null;
  state.voice.stream = null;
  state.voice.chunks = [];
  state.voice.interimTranscript = "";
  state.voice.recording = false;
  elements.voiceBtn.textContent = t("btn.voice");
  scheduleComposerCollapse(180);
}

async function uploadVoiceBlob(blob, transcript) {
  const dataUrl = await readBlobAsDataUrl(blob);
  const resp = await apiFetchJson("/api/v2/media/voice", {
    method: "POST",
    body: {
      dataUrl,
      fileName: `voice-${Date.now()}.webm`,
      mimeType: blob.type || "audio/webm",
      metadata: {
        transcriptPreview: transcript.slice(0, 256),
      },
    },
  });
  state.pendingVoice = {
    mediaId: resp.mediaId,
    filePath: resp.filePath,
    mimeType: resp.mimeType,
    transcript,
  };
  renderPendingVoice();
  setStatusKey("status.voiceSaved");
}

function renderPendingVoice() {
  elements.pendingVoice.innerHTML = "";
  if (!state.pendingVoice) {
    syncAttachmentsVisibility();
    return;
  }
  const card = document.createElement("article");
  card.className = "pending-card voice";
  const title = document.createElement("strong");
  title.textContent = t("voice.title", {
    id: state.pendingVoice.mediaId.slice(0, 8),
  });
  const transcript = document.createElement("textarea");
  transcript.rows = 2;
  transcript.placeholder = t("voice.transcriptPlaceholder");
  transcript.value = state.pendingVoice.transcript || "";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "btn mini ghost";
  remove.textContent = t("voice.removeVoice");
  remove.dataset.action = "clear-voice";
  card.append(title, transcript, remove);
  elements.pendingVoice.append(card);
  syncAttachmentsVisibility();
}

function threadHasInProgress(thread) {
  const turns = Array.isArray(thread && thread.turns) ? thread.turns : [];
  return turns.some((turn) => turn && turn.status === "inProgress");
}

function normalizeTurnItemsForDisplay(rawItems) {
  const items = Array.isArray(rawItems) ? rawItems : [];
  if (!state.desktopCompatibleMode) {
    return {
      items,
      hiddenAgentCount: 0,
    };
  }

  let lastAgentMessageIndex = -1;
  for (let i = 0; i < items.length; i += 1) {
    if (items[i] && items[i].type === "agentMessage") {
      lastAgentMessageIndex = i;
    }
  }
  if (lastAgentMessageIndex < 0) {
    return {
      items,
      hiddenAgentCount: 0,
    };
  }

  const visible = [];
  let hiddenAgentCount = 0;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item && item.type === "agentMessage" && i !== lastAgentMessageIndex) {
      hiddenAgentCount += 1;
      continue;
    }
    visible.push(item);
  }
  return {
    items: visible,
    hiddenAgentCount,
  };
}

function renderContextUsage() {
  const usage = state.selectedThreadUsage;
  if (!usage) {
    elements.contextRing.style.setProperty("--pct", "0");
    setRingPercent(elements.sidebarContextRing, 0);
    if (elements.contextUsageText) elements.contextUsageText.textContent = "-- / --";
    if (elements.contextPctText) elements.contextPctText.textContent = "--%";
    if (elements.sidebarContextUsageText) {
      elements.sidebarContextUsageText.textContent = "-- / --";
    }
    if (elements.sidebarContextPctText) {
      elements.sidebarContextPctText.textContent = "--%";
    }
    if (elements.contextWidget) {
      elements.contextWidget.title = t("context.title");
    }
    return;
  }
  const windowSize = Number(usage.modelContextWindow || 0);
  if (!windowSize || windowSize <= 0) {
    elements.contextRing.style.setProperty("--pct", "0");
    setRingPercent(elements.sidebarContextRing, 0);
    if (elements.contextUsageText) elements.contextUsageText.textContent = "-- / --";
    if (elements.contextPctText) elements.contextPctText.textContent = "--%";
    if (elements.sidebarContextUsageText) {
      elements.sidebarContextUsageText.textContent = "-- / --";
    }
    if (elements.sidebarContextPctText) {
      elements.sidebarContextPctText.textContent = "--%";
    }
    if (elements.contextWidget) {
      elements.contextWidget.title = t("context.noWindow");
    }
    return;
  }
  let usedTokens = toInt(usage.last && usage.last.inputTokens);
  if (!usedTokens) {
    usedTokens = toInt(usage.total && usage.total.inputTokens);
  }
  if (!usedTokens) {
    usedTokens = toInt(usage.last && usage.last.totalTokens);
  }
  if (!usedTokens) {
    usedTokens = toInt(usage.total && usage.total.totalTokens);
  }
  const pct = Math.max(0, Math.min(100, (usedTokens / windowSize) * 100));
  const remain = Math.max(0, windowSize - usedTokens);
  const usedCompact = formatTokenCompact(usedTokens);
  const windowCompact = formatTokenCompact(windowSize);
  elements.contextRing.style.setProperty("--pct", String(pct));
  setRingPercent(elements.sidebarContextRing, pct);
  if (elements.contextUsageText) {
    elements.contextUsageText.textContent = `${usedCompact} / ${windowCompact}`;
  }
  if (elements.contextPctText) {
    elements.contextPctText.textContent = `${Math.round(pct)}%`;
  }
  if (elements.sidebarContextUsageText) {
    elements.sidebarContextUsageText.textContent = `${usedCompact} / ${windowCompact}`;
  }
  if (elements.sidebarContextPctText) {
    elements.sidebarContextPctText.textContent = `${Math.round(pct)}%`;
  }
  if (elements.contextWidget) {
    elements.contextWidget.title = t("context.tooltip", {
      used: formatToken(usedTokens),
      window: formatToken(windowSize),
      remain: formatToken(remain),
    });
  }
}

function normalizeTokenUsage(input) {
  if (!input || typeof input !== "object") return null;
  const total = normalizeTokenBreakdown(input.total || input.total_token_usage || {});
  const last = normalizeTokenBreakdown(input.last || input.last_token_usage || {});
  const windowSize =
    input.modelContextWindow ?? input.model_context_window ?? null;
  const nWindow = Number(windowSize);
  return {
    total,
    last,
    modelContextWindow:
      Number.isFinite(nWindow) && nWindow > 0 ? Math.floor(nWindow) : null,
  };
}

function normalizeTokenBreakdown(input) {
  const src = input && typeof input === "object" ? input : {};
  return {
    inputTokens: toInt(src.inputTokens ?? src.input_tokens),
    outputTokens: toInt(src.outputTokens ?? src.output_tokens),
    cachedInputTokens: toInt(src.cachedInputTokens ?? src.cached_input_tokens),
    reasoningOutputTokens: toInt(
      src.reasoningOutputTokens ?? src.reasoning_output_tokens
    ),
    totalTokens: toInt(src.totalTokens ?? src.total_tokens),
  };
}

function groupThreadsByProject(threads) {
  const map = new Map();
  for (const thread of threads || []) {
    const key = getProjectKey(thread);
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        name: getProjectName(key),
        threads: [],
        lastUpdated: 0,
      };
      map.set(key, group);
    }
    group.threads.push(thread);
    group.lastUpdated = Math.max(group.lastUpdated, Number(thread.updatedAt || 0));
  }

  const groups = [...map.values()];
  for (const g of groups) {
    g.threads.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  }
  groups.sort((a, b) => b.lastUpdated - a.lastUpdated || a.name.localeCompare(b.name));
  return groups;
}

function getProjectKey(thread) {
  if (!thread || !thread.cwd) return "(unknown)";
  return String(thread.cwd);
}

function resolvePreferredCwdForNewThread() {
  if (state.expandedProjectKey && state.expandedProjectKey !== "(unknown)") {
    return String(state.expandedProjectKey);
  }
  const selected = state.threads.find((item) => item.id === state.selectedThreadId);
  if (selected && selected.cwd) {
    const cwd = String(selected.cwd);
    if (cwd && cwd !== "(unknown)") return cwd;
  }
  if (Array.isArray(state.projects) && state.projects.length > 0) {
    const top = state.projects[0];
    if (top && top.key && top.key !== "(unknown)") return String(top.key);
  }
  return "";
}

function getProjectName(projectKey) {
  const clean = String(projectKey || "").replace(/[\\/]+$/, "");
  if (!clean || clean === "(unknown)") return "(unknown)";
  const parts = clean.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : clean;
}

function formatToken(n) {
  return Number(n || 0).toLocaleString("en-US");
}

function formatTokenCompact(value) {
  const n = Math.max(0, Number(value || 0));
  if (!Number.isFinite(n)) return "--";
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  }
  if (n >= 1_000) {
    return `${Math.round(n / 1_000)}k`;
  }
  return String(Math.round(n));
}

function toInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeBaseUrl(value) {
  const v = String(value || "").trim();
  if (!v) return window.location.origin;
  return v.replace(/\/$/, "");
}

function getBaseUrl() {
  return normalizeBaseUrl(localStorage.getItem(storageKeys.baseUrl) || window.location.origin);
}

function getToken() {
  return String(localStorage.getItem(storageKeys.token) || "");
}

function getDeviceCredentials() {
  return {
    deviceId: String(localStorage.getItem(storageKeys.deviceId) || "").trim(),
    deviceSecret: String(localStorage.getItem(storageKeys.deviceSecret) || "").trim(),
  };
}

function getStoredDeviceName() {
  return String(localStorage.getItem(storageKeys.deviceName) || "").trim();
}

function inferDefaultDeviceName() {
  const ua = String(navigator.userAgent || "").toLowerCase();
  if (ua.includes("iphone")) return "iPhone";
  if (ua.includes("ipad")) return "iPad";
  if (ua.includes("android")) return "Android Phone";
  return "Phone Browser";
}

function hasBoundDevice() {
  const creds = getDeviceCredentials();
  return Boolean(creds.deviceId && creds.deviceSecret);
}

function setDeviceCredentials(input) {
  const data = input && typeof input === "object" ? input : {};
  const deviceId = String(data.deviceId || "").trim();
  const deviceSecret = String(data.deviceSecret || "").trim();
  const deviceName = String(data.deviceName || "").trim() || inferDefaultDeviceName();
  if (!deviceId || !deviceSecret) return;
  localStorage.setItem(storageKeys.deviceId, deviceId);
  localStorage.setItem(storageKeys.deviceSecret, deviceSecret);
  localStorage.setItem(storageKeys.deviceName, deviceName);
  if (elements.pairingDeviceName) {
    elements.pairingDeviceName.value = deviceName;
  }
}

function clearDeviceCredentials() {
  localStorage.removeItem(storageKeys.deviceId);
  localStorage.removeItem(storageKeys.deviceSecret);
}

function randomNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function buildCanonicalPath(pathname, searchParams, excludedKeys = []) {
  const entries = [];
  for (const [key, value] of searchParams.entries()) {
    if (excludedKeys.includes(key)) continue;
    entries.push([key, value]);
  }
  entries.sort((a, b) => {
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    if (a[1] < b[1]) return -1;
    if (a[1] > b[1]) return 1;
    return 0;
  });
  const qs = new URLSearchParams();
  for (const [key, value] of entries) {
    qs.append(key, value);
  }
  const query = qs.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function buildSigningString({
  method,
  canonicalPath,
  bodySha256,
  timestampMs,
  nonce,
  deviceId,
}) {
  return [
    "v1",
    String(method || "GET").toUpperCase(),
    String(canonicalPath || "/"),
    String(bodySha256 || ""),
    String(timestampMs || ""),
    String(nonce || ""),
    String(deviceId || ""),
  ].join("\n");
}

async function buildSignedQueryAuth({ method, pathname, query, body }) {
  const creds = getDeviceCredentials();
  if (!creds.deviceId || !creds.deviceSecret) {
    throw new Error(t("error.deviceNotPaired"));
  }
  const params = query instanceof URLSearchParams ? new URLSearchParams(query.toString()) : new URLSearchParams();
  const timestamp = String(Date.now());
  const nonce = randomNonce();
  params.set("deviceId", creds.deviceId);
  params.set("ts", timestamp);
  params.set("nonce", nonce);

  const canonicalPath = buildCanonicalPath(pathname, params, ["sig"]);
  const bodySha256 = await sha256HexUtf8(body || "");
  const keyHex = await sha256HexUtf8(creds.deviceSecret);
  const signingString = buildSigningString({
    method,
    canonicalPath,
    bodySha256,
    timestampMs: timestamp,
    nonce,
    deviceId: creds.deviceId,
  });
  const signature = await hmacSha256Base64UrlFromHexKey(keyHex, signingString);
  return {
    deviceId: creds.deviceId,
    timestamp,
    nonce,
    signature,
  };
}

async function buildSignedHeaderAuth({ method, pathname, query, body }) {
  const creds = getDeviceCredentials();
  if (!creds.deviceId || !creds.deviceSecret) {
    throw new Error(t("error.deviceNotPaired"));
  }
  const params =
    query instanceof URLSearchParams
      ? new URLSearchParams(query.toString())
      : new URLSearchParams();
  const timestamp = String(Date.now());
  const nonce = randomNonce();
  // Header auth carries device credentials in headers, so canonical path
  // must be built from the original request query only.
  const canonicalPath = buildCanonicalPath(pathname, params, ["sig"]);
  const bodySha256 = await sha256HexUtf8(body || "");
  const keyHex = await sha256HexUtf8(creds.deviceSecret);
  const signingString = buildSigningString({
    method,
    canonicalPath,
    bodySha256,
    timestampMs: timestamp,
    nonce,
    deviceId: creds.deviceId,
  });
  const signature = await hmacSha256Base64UrlFromHexKey(keyHex, signingString);
  return {
    deviceId: creds.deviceId,
    timestamp,
    nonce,
    signature,
  };
}

async function apiFetchJson(pathname, options = {}) {
  const base = getBaseUrl();
  const method = String(options.method || "GET").toUpperCase();
  const headers = {};
  let body = undefined;
  if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers["Content-Type"] = "application/json";
  }

  const urlObj = new URL(pathname, base);
  const response = await fetch(urlObj.toString(), {
    method,
    headers,
    body,
    credentials: "include",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    if (
      (response.status === 401 || response.status === 403) &&
      !String(urlObj.pathname || "").startsWith("/api/auth/")
    ) {
      state.auth.authenticated = false;
      showLoginDialog();
    }
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

function setStatus(text, options = {}) {
  if (!options.preserveKey) {
    state.lastStatusKey = null;
    state.lastStatusVars = null;
  }
  const statusText = t("status.prefix", {
    text: String(text || ""),
  });
  elements.statusBar.textContent = statusText;
  if (elements.sidebarStatus) {
    elements.sidebarStatus.textContent = statusText;
  }
}

function setStatusKey(key, vars = {}) {
  state.lastStatusKey = key;
  state.lastStatusVars = { ...vars };
  setStatus(t(key, vars), { preserveKey: true });
}

function parseSse(event) {
  try {
    return JSON.parse(event.data);
  } catch (_error) {
    return null;
  }
}

function formatThreadTime(ts) {
  if (!ts) return "-";
  const n = Number(ts);
  if (Number.isFinite(n) && n > 1000000000) {
    return new Date(n * 1000).toLocaleString();
  }
  return String(ts);
}

function asMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(t("error.fileReader")));
    reader.readAsDataURL(file);
  });
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(t("error.blobReader")));
    reader.readAsDataURL(blob);
  });
}

function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

const textEncoder = new TextEncoder();

function utf8Bytes(input) {
  return textEncoder.encode(String(input || ""));
}

function bytesToHex(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

function hexToBytes(hex) {
  const clean = String(hex || "").trim().toLowerCase();
  if (!clean || clean.length % 2 !== 0) {
    throw new Error("Invalid hex key");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    const byte = Number.parseInt(clean.slice(i, i + 2), 16);
    if (!Number.isFinite(byte)) {
      throw new Error("Invalid hex key");
    }
    out[i / 2] = byte;
  }
  return out;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function rotr(x, n) {
  return (x >>> n) | (x << (32 - n));
}

function sha256BytesSync(bytes) {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const H = [
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ];

  const bitLen = bytes.length * 8;
  const totalLen = ((bytes.length + 9 + 63) >> 6) << 6;
  const msg = new Uint8Array(totalLen);
  msg.set(bytes, 0);
  msg[bytes.length] = 0x80;
  const view = new DataView(msg.buffer);
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  view.setUint32(totalLen - 8, hi, false);
  view.setUint32(totalLen - 4, lo, false);

  const w = new Uint32Array(64);
  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let t = 0; t < 16; t += 1) {
      w[t] = view.getUint32(offset + t * 4, false);
    }
    for (let t = 16; t < 64; t += 1) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }

    let a = H[0];
    let b = H[1];
    let c = H[2];
    let d = H[3];
    let e = H[4];
    let f = H[5];
    let g = H[6];
    let h = H[7];

    for (let t = 0; t < 64; t += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < H.length; i += 1) {
    outView.setUint32(i * 4, H[i], false);
  }
  return out;
}

function hmacSha256BytesSync(keyBytes, messageBytes) {
  const blockSize = 64;
  let key = keyBytes;
  if (key.length > blockSize) {
    key = sha256BytesSync(key);
  }
  const normalized = new Uint8Array(blockSize);
  normalized.set(key.subarray(0, blockSize));

  const oKeyPad = new Uint8Array(blockSize);
  const iKeyPad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i += 1) {
    oKeyPad[i] = normalized[i] ^ 0x5c;
    iKeyPad[i] = normalized[i] ^ 0x36;
  }

  const inner = new Uint8Array(blockSize + messageBytes.length);
  inner.set(iKeyPad, 0);
  inner.set(messageBytes, blockSize);
  const innerHash = sha256BytesSync(inner);

  const outer = new Uint8Array(blockSize + innerHash.length);
  outer.set(oKeyPad, 0);
  outer.set(innerHash, blockSize);
  return sha256BytesSync(outer);
}

async function sha256HexUtf8(input) {
  const bytes = utf8Bytes(input);
  if (crypto && crypto.subtle) {
    try {
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return bytesToHex(new Uint8Array(digest));
    } catch {
      // fall through to sync implementation
    }
  }
  return bytesToHex(sha256BytesSync(bytes));
}

async function hmacSha256Base64UrlFromHexKey(hexKey, message) {
  const keyBytes = hexToBytes(hexKey);
  const msgBytes = utf8Bytes(message);
  if (crypto && crypto.subtle) {
    try {
      const key = await crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const sig = await crypto.subtle.sign("HMAC", key, msgBytes);
      return bytesToBase64Url(new Uint8Array(sig));
    } catch {
      // fall through to sync implementation
    }
  }
  return bytesToBase64Url(hmacSha256BytesSync(keyBytes, msgBytes));
}
