const el = (id) => document.getElementById(id);

const syncToggle = el("syncToggle");
const syncLabel = el("syncLabel");
const syncHint = el("syncHint");
const uiLanguageToggle = el("uiLanguageToggle");
const tabControl = el("tabControl");
const tabLogs = el("tabLogs");
const panelControl = el("panelControl");
const panelLogs = el("panelLogs");
const proxyStatus = el("proxyStatus");
const socksStatus = el("socksStatus");
const codexStatus = el("codexStatus");
const bridgeStatus = el("bridgeStatus");
const launchctlStatus = el("launchctlStatus");

const emergencyDisableBtn = el("emergencyDisable");

const phoneUrlSelect = el("phoneUrlSelect");
const copyPhoneUrlBtn = el("copyPhoneUrl");
const remoteModeStatus = el("remoteModeStatus");
const tailscaleStatus = el("tailscaleStatus");
const tailscaleIpv4 = el("tailscaleIpv4");
const tailscaleMagicDns = el("tailscaleMagicDns");
const remoteUrlSelect = el("remoteUrlSelect");
const copyRemoteUrlBtn = el("copyRemoteUrl");
const remoteHint = el("remoteHint");
const pairingAuthMode = el("pairingAuthMode");
const boundDeviceStatus = el("boundDeviceStatus");
const pairingSessionStatus = el("pairingSessionStatus");
const pairingExpiresAt = el("pairingExpiresAt");
const pairingUrlSelect = el("pairingUrlSelect");
const copyPairingUrlBtn = el("copyPairingUrl");
const pairingQr = el("pairingQr");
const pairingCode = el("pairingCode");
const startPairingBtn = el("startPairing");
const resetPairingBtn = el("resetPairing");

const bindHost = el("bindHost");
const bridgePort = el("bridgePort");
const proxyPort = el("proxyPort");
const proxyDebug = el("proxyDebug");
const desktopOverlayMode = el("desktopOverlayMode");
const remoteMode = el("remoteMode");
const allowLanClients = el("allowLanClients");
const showRemoteUrlInUi = el("showRemoteUrlInUi");
const tailscaleCliPath = el("tailscaleCliPath");
const allowedClientCidrs = el("allowedClientCidrs");
const saveConfigBtn = el("saveConfig");
const saveRemoteSettingsBtn = el("saveRemoteSettings");
const regenTokenBtn = el("regenToken");
const openWebUiDebugBtn = el("openWebUiDebug");

const logsEl = el("logs");

let latestStatus = null;
let logLines = [];
let pairingStartCache = null;
let currentLanguage = "en";

const I18N = {
  en: {
    subtitle: "Codex mobile web sync controller",
    tab_control: "Control",
    tab_logs: "Logs",
    language_label: "Language",
    section_status: "Status",
    label_proxy: "Proxy",
    label_socks: "SOCKS",
    label_codex_desktop: "Codex Desktop",
    label_bridge: "Bridge",
    label_launchctl: "launchctl",
    btn_open_web_ui: "Open Web UI",
    btn_open_web_debug: "Open Local Debug Web",
    btn_emergency_disable: "Emergency Disable",
    note_sync_reopen_codex:
      "When Sync is ON, you must quit Codex (Cmd+Q) and reopen it from Dock to enable realtime Web to Desktop sync.",
    section_phone_url: "Phone URL",
    btn_copy: "Copy",
    summary_advanced: "Advanced",
    label_bind_host: "Bind Host",
    opt_bind_lan: "0.0.0.0 (LAN)",
    opt_bind_local: "127.0.0.1 (Local)",
    label_bridge_port: "Bridge Port",
    label_proxy_port: "Proxy Port",
    label_proxy_debug: "Proxy Debug Logs",
    label_proxy_debug_enable: "Enable (no message content)",
    label_desktop_overlay: "Desktop Overlay",
    opt_overlay_authoritative: "Authoritative (Recommended)",
    opt_off: "Off",
    btn_save: "Save",
    btn_regen_token: "Regenerate Token",
    section_remote_access: "Remote Access",
    label_mode: "Mode",
    label_tailscale: "Tailscale",
    label_tailscale_ipv4: "Tailscale IPv4",
    label_magicdns: "MagicDNS",
    summary_remote_advanced: "Remote Advanced",
    label_remote_mode: "Remote Mode",
    opt_tailscale_recommended: "tailscale (Recommended)",
    label_allow_lan_clients: "Allow LAN Clients",
    label_allow_lan_clients_detail: "Allow RFC1918 LAN ranges",
    label_show_remote_urls: "Show Remote URLs",
    label_show_remote_urls_detail: "Show tailscale URLs in UI",
    label_tailscale_cli_path: "tailscale CLI Path",
    label_allowed_cidrs: "Allowed CIDRs",
    btn_save_remote_settings: "Save Remote Settings",
    section_device_binding: "Device Binding",
    label_auth_mode: "Auth Mode",
    label_bound_device: "Bound Device",
    label_pairing_session: "Pairing Session",
    label_expires_at: "Expires At",
    label_verification_code: "Verification Code",
    btn_start_pairing: "Start Pairing",
    btn_reset_binding: "Reset Binding",
    note_pairing:
      "Start Pairing generates a one-time QR link. Scan it to auto-complete pairing (no manual code input). Reset Binding revokes all previously paired phones immediately.",
    section_logs: "Logs",
    sync_on: "Sync ON",
    sync_off: "Sync OFF",
    sync_applying: "Applying changes...",
    sync_hint_connected: "Codex Desktop connected. Realtime Web->Desktop sync should work.",
    sync_hint_bridge_only:
      "Bridge is connected, but Codex Desktop is not on shared WS stream yet. Fully quit Codex (Cmd+Q) and reopen it from Dock.",
    sync_hint_not_connected:
      "Sync is ON, but Codex Desktop is not connected. Quit Codex (Cmd+Q) and reopen it from Dock.",
    status_proxy_ready: "ready (clients={clients}, upstreamPid={pid})",
    status_running_not_ready: "running (not ready)",
    status_stopped: "stopped",
    status_socks_running: "{mode} ({listen})",
    status_connected_clientid: "connected (clientId={id})",
    status_bridge_only: "not connected (bridge only)",
    status_not_connected: "not connected",
    status_running_pid_port: "running (pid={pid}, port={port})",
    status_launchctl_not_set: "(not set)",
    mode_off: "off",
    mode_tailscale: "tailscale",
    remote_disabled: "disabled",
    remote_not_installed: "not installed",
    remote_not_connected: "not connected ({code})",
    remote_connected: "connected",
    remote_hint_off: "Remote mode is OFF. Enable tailscale mode to access from outside.",
    remote_hint_bind_local: "Bind Host is 127.0.0.1. Switch to 0.0.0.0 to allow LAN/Tailscale clients.",
    remote_hint_cli_missing: "tailscale CLI is missing. Install Tailscale on this Mac to enable remote mobile access.",
    remote_hint_not_connected: "Tailscale is not connected. Connect this Mac and your phone to the same tailnet.",
    remote_hint_no_url: "No remote URL available. Check Show Remote URLs and verify Tailscale status.",
    remote_hint_ready: "Remote URL is ready. Your phone must be connected to the same Tailscale network.",
    pairing_auth_mode_value: "mode={mode} / legacy={legacy}",
    pairing_none: "none",
    pairing_open: "open",
    pairing_closed: "closed",
    pairing_hidden: "(hidden)",
    confirm_restart_remote:
      "Remote access settings were saved. Restart Sync now to apply bridge access policy changes?",
    confirm_reset_binding:
      "Reset binding will revoke all currently paired phones. Continue?",
    error_failed_load_status: "Failed to load status: {error}",
  },
  "zh-CN": {
    subtitle: "Codex 手机网页同步控制器",
    tab_control: "界面",
    tab_logs: "日志",
    language_label: "语言",
    section_status: "状态",
    label_proxy: "代理",
    label_socks: "SOCKS",
    label_codex_desktop: "Codex 桌面端",
    label_bridge: "Bridge",
    label_launchctl: "launchctl",
    btn_open_web_ui: "打开网页端",
    btn_open_web_debug: "打开本机调试网页",
    btn_emergency_disable: "紧急解除绑定",
    note_sync_reopen_codex:
      "Sync 开启后，需要先退出 Codex（Cmd+Q）再从 Dock 打开，才能启用 Web->Desktop 实时同步。",
    section_phone_url: "手机访问地址",
    btn_copy: "复制",
    summary_advanced: "高级设置",
    label_bind_host: "监听地址",
    opt_bind_lan: "0.0.0.0（局域网）",
    opt_bind_local: "127.0.0.1（仅本机）",
    label_bridge_port: "网页端口",
    label_proxy_port: "代理端口",
    label_proxy_debug: "代理调试日志",
    label_proxy_debug_enable: "启用（不记录消息内容）",
    label_desktop_overlay: "桌面 Overlay",
    opt_overlay_authoritative: "权威模式（推荐）",
    opt_off: "关闭",
    btn_save: "保存",
    btn_regen_token: "重置管理 Token",
    section_remote_access: "外网访问",
    label_mode: "模式",
    label_tailscale: "Tailscale",
    label_tailscale_ipv4: "Tailscale IPv4",
    label_magicdns: "MagicDNS",
    summary_remote_advanced: "外网高级设置",
    label_remote_mode: "外网模式",
    opt_tailscale_recommended: "tailscale（推荐）",
    label_allow_lan_clients: "允许局域网客户端",
    label_allow_lan_clients_detail: "允许 RFC1918 局域网网段访问",
    label_show_remote_urls: "显示外网地址",
    label_show_remote_urls_detail: "在界面显示 tailscale 地址",
    label_tailscale_cli_path: "tailscale CLI 路径",
    label_allowed_cidrs: "允许访问 CIDR",
    btn_save_remote_settings: "保存外网设置",
    section_device_binding: "设备绑定",
    label_auth_mode: "认证模式",
    label_bound_device: "已绑定设备",
    label_pairing_session: "配对会话",
    label_expires_at: "过期时间",
    label_verification_code: "验证码",
    btn_start_pairing: "开始配对",
    btn_reset_binding: "重置绑定",
    note_pairing:
      "开始配对会生成一次性二维码链接，扫码后会自动完成绑定（无需手输验证码）。重置绑定会立即使所有旧手机失效。",
    section_logs: "日志",
    sync_on: "同步已开启",
    sync_off: "同步已关闭",
    sync_applying: "正在应用设置...",
    sync_hint_connected: "Codex 桌面端已连接，Web->Desktop 实时同步可用。",
    sync_hint_bridge_only:
      "Bridge 已连接，但 Codex 桌面端尚未接入共享 WS 流。请先完整退出 Codex（Cmd+Q）后再从 Dock 打开。",
    sync_hint_not_connected:
      "Sync 已开启，但 Codex 桌面端未连接。请先退出 Codex（Cmd+Q）再从 Dock 打开。",
    status_proxy_ready: "就绪（clients={clients}, upstreamPid={pid}）",
    status_running_not_ready: "运行中（未就绪）",
    status_stopped: "未运行",
    status_socks_running: "{mode}（{listen}）",
    status_connected_clientid: "已连接（clientId={id}）",
    status_bridge_only: "未连接（仅 bridge）",
    status_not_connected: "未连接",
    status_running_pid_port: "运行中（pid={pid}, 端口={port}）",
    status_launchctl_not_set: "（未设置）",
    mode_off: "关闭",
    mode_tailscale: "tailscale",
    remote_disabled: "已关闭",
    remote_not_installed: "未安装",
    remote_not_connected: "未连接（{code}）",
    remote_connected: "已连接",
    remote_hint_off: "外网模式已关闭。启用 tailscale 模式后可外网访问。",
    remote_hint_bind_local: "监听地址为 127.0.0.1，请改为 0.0.0.0 才能允许局域网/Tailscale 访问。",
    remote_hint_cli_missing: "未找到 tailscale CLI，请先在本机安装 Tailscale。",
    remote_hint_not_connected: "Tailscale 未连接，请让本机和手机连接到同一 tailnet。",
    remote_hint_no_url: "暂无外网地址，请检查“显示外网地址”和 Tailscale 状态。",
    remote_hint_ready: "外网地址已就绪。手机需连接同一 Tailscale 网络。",
    pairing_auth_mode_value: "模式={mode} / 兼容token={legacy}",
    pairing_none: "无",
    pairing_open: "已开启",
    pairing_closed: "已关闭",
    pairing_hidden: "（已隐藏）",
    confirm_restart_remote: "外网设置已保存。是否立即重启 Sync 以应用新的访问策略？",
    confirm_reset_binding: "重置绑定会使当前已配对手机全部失效，是否继续？",
    error_failed_load_status: "状态加载失败：{error}",
  },
};

function normalizeLanguage(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "zh" || raw === "zh-cn" || raw === "zh_hans" || raw === "zh-hans") return "zh-CN";
  return "en";
}

function t(key, vars = {}) {
  const langPack = I18N[currentLanguage] || I18N.en;
  let template = langPack[key] || I18N.en[key] || key;
  for (const [name, value] of Object.entries(vars || {})) {
    template = template.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
  }
  return template;
}

function applyLanguage(language) {
  currentLanguage = normalizeLanguage(language);
  document.documentElement.lang = currentLanguage;
  if (uiLanguageToggle) uiLanguageToggle.checked = currentLanguage === "en";
  const nodes = document.querySelectorAll("[data-i18n]");
  for (const node of nodes) {
    const key = node.getAttribute("data-i18n");
    if (!key) continue;
    node.textContent = t(key);
  }
}

function fmt(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    return String(obj);
  }
}

function classifyProxyClient(client) {
  const c = client && typeof client === "object" ? client : {};
  const role = String(c.role || "").trim().toLowerCase();
  if (role) return role;
  const name = String(c.name || "").trim();
  if (!name) return "other";
  if (name === "codex-phone-bridge") return "bridge";
  if (name === "phone-codex-preflight") return "preflight";
  if (name.toLowerCase().includes("codex")) return "desktop";
  return "other";
}

function findDesktopClient(clients) {
  const list = Array.isArray(clients) ? clients : [];
  return list.find((c) => classifyProxyClient(c) === "desktop" && Boolean(c && c.open)) || null;
}

function hasBridgeClient(clients) {
  const list = Array.isArray(clients) ? clients : [];
  return list.some((c) => classifyProxyClient(c) === "bridge" && Boolean(c && c.open));
}

function setActivePanel(panel) {
  const showLogs = panel === "logs";
  if (tabControl) {
    tabControl.classList.toggle("is-active", !showLogs);
    tabControl.setAttribute("aria-selected", showLogs ? "false" : "true");
  }
  if (tabLogs) {
    tabLogs.classList.toggle("is-active", showLogs);
    tabLogs.setAttribute("aria-selected", showLogs ? "true" : "false");
  }
  if (panelControl) {
    panelControl.classList.toggle("is-active", !showLogs);
    panelControl.setAttribute("aria-hidden", showLogs ? "true" : "false");
  }
  if (panelLogs) {
    panelLogs.classList.toggle("is-active", showLogs);
    panelLogs.setAttribute("aria-hidden", showLogs ? "false" : "true");
  }
}

function renderSync(st) {
  const enabled = Boolean(st.sync && st.sync.enabled);
  const transitioning = Boolean(st.sync && st.sync.transitioning);
  const p = st.proxy || {};
  const clients = Array.isArray(p.clients) ? p.clients : [];
  const codexConnected = Boolean(findDesktopClient(clients));
  const bridgeConnected = hasBridgeClient(clients);
  syncToggle.checked = enabled;
  syncToggle.disabled = transitioning;
  syncLabel.textContent = enabled ? t("sync_on") : t("sync_off");

  if (transitioning) {
    syncHint.textContent = t("sync_applying");
  } else if (enabled) {
    if (codexConnected) {
      syncHint.textContent = t("sync_hint_connected");
    } else if (bridgeConnected) {
      syncHint.textContent = t("sync_hint_bridge_only");
    } else {
      syncHint.textContent = t("sync_hint_not_connected");
    }
  } else {
    syncHint.textContent = "";
  }
}

function renderStatus(st) {
  const p = st.proxy || {};
  const s = st.socks || {};
  const b = st.bridge || {};
  const launchctlWsUrl = (st.sync && st.sync.launchctlWsUrl) || "";
  const clients = Array.isArray(p.clients) ? p.clients : [];
  const codexClient = findDesktopClient(clients);
  const bridgeConnected = hasBridgeClient(clients);

  proxyStatus.textContent = p.upstreamReady
    ? t("status_proxy_ready", {
        clients: p.clientCount || 0,
        pid: p.upstreamPid || "?",
      })
    : p.running
    ? t("status_running_not_ready")
    : t("status_stopped");

  socksStatus.textContent = s.running
    ? t("status_socks_running", {
        mode: s.mode || "on",
        listen: s.listen || "127.0.0.1:1080",
      })
    : t("status_stopped");

  codexStatus.textContent = codexClient && codexClient.open
    ? t("status_connected_clientid", { id: codexClient.id })
    : bridgeConnected
    ? t("status_bridge_only")
    : t("status_not_connected");

  bridgeStatus.textContent = b.running
    ? t("status_running_pid_port", {
        pid: b.pid || "?",
        port: b.port || "?",
      })
    : t("status_stopped");

  launchctlStatus.textContent = launchctlWsUrl
    ? `CODEX_APP_SERVER_WS_URL=${launchctlWsUrl}`
    : t("status_launchctl_not_set");
}

function renderPhoneUrls(st) {
  const urls = Array.isArray(st.phoneUrls) ? st.phoneUrls : [];
  const previous = phoneUrlSelect.value;

  phoneUrlSelect.innerHTML = "";
  for (const item of urls) {
    const opt = document.createElement("option");
    opt.value = item.url;
    const kind = item.kind ? String(item.kind).toUpperCase() : "URL";
    opt.textContent = `[${kind}] ${item.ip}  (${item.base})`;
    phoneUrlSelect.appendChild(opt);
  }

  if (previous && [...phoneUrlSelect.options].some((o) => o.value === previous)) {
    phoneUrlSelect.value = previous;
  } else if (phoneUrlSelect.options.length > 0) {
    phoneUrlSelect.selectedIndex = 0;
  }
}

async function renderPairingQr() {
  const url = pairingUrlSelect && pairingUrlSelect.value ? pairingUrlSelect.value : "";
  if (!url) {
    pairingQr.removeAttribute("src");
    return;
  }
  const dataUrl = await window.phoneCodex.generateQr(url);
  pairingQr.src = dataUrl;
}

function renderRemote(st) {
  const cfg = st.config || {};
  const remote = st.remote || {};
  const ts = remote.tailscale || {};
  const allUrls = Array.isArray(st.phoneUrls) ? st.phoneUrls : [];
  const remoteUrls = allUrls.filter((item) => item && item.kind === "tailscale");

  remoteModeStatus.textContent = remote.mode === "off" ? t("mode_off") : t("mode_tailscale");
  if (remote.mode === "off") {
    tailscaleStatus.textContent = t("remote_disabled");
  } else if (!ts.installed) {
    tailscaleStatus.textContent = t("remote_not_installed");
  } else if (!ts.connected) {
    tailscaleStatus.textContent = t("remote_not_connected", {
      code: ts.errorCode || "unknown",
    });
  } else {
    tailscaleStatus.textContent = t("remote_connected");
  }
  tailscaleIpv4.textContent = ts.ipv4 || "--";
  tailscaleMagicDns.textContent = ts.magicDns || "--";

  const previous = remoteUrlSelect.value;
  remoteUrlSelect.innerHTML = "";
  for (const item of remoteUrls) {
    const opt = document.createElement("option");
    opt.value = item.url;
    opt.textContent = `${item.ip}  (${item.base})`;
    remoteUrlSelect.appendChild(opt);
  }
  if (previous && [...remoteUrlSelect.options].some((o) => o.value === previous)) {
    remoteUrlSelect.value = previous;
  } else if (remoteUrlSelect.options.length > 0) {
    remoteUrlSelect.selectedIndex = 0;
  }

  if (remote.mode === "off") {
    remoteHint.textContent = t("remote_hint_off");
  } else if (cfg.bindHost === "127.0.0.1") {
    remoteHint.textContent = t("remote_hint_bind_local");
  } else if (!ts.installed) {
    remoteHint.textContent = t("remote_hint_cli_missing");
  } else if (!ts.connected) {
    remoteHint.textContent = t("remote_hint_not_connected");
  } else if (remoteUrls.length === 0) {
    remoteHint.textContent = t("remote_hint_no_url");
  } else {
    remoteHint.textContent = t("remote_hint_ready");
  }
}

function renderAdvanced(st) {
  const cfg = st.config || {};
  if (uiLanguageToggle) uiLanguageToggle.checked = normalizeLanguage(cfg.uiLanguage || currentLanguage) === "en";
  bindHost.value = cfg.bindHost || "0.0.0.0";
  bridgePort.value = String(cfg.bridgePort || 8787);
  proxyPort.value = String(cfg.proxyPort || 18791);
  if (proxyDebug) proxyDebug.checked = Boolean(cfg.proxyDebug);
  if (desktopOverlayMode)
    desktopOverlayMode.value = cfg.desktopOverlayMode === "off" ? "off" : "authoritative";
  if (remoteMode) remoteMode.value = cfg.remoteMode === "off" ? "off" : "tailscale";
  if (allowLanClients) allowLanClients.checked = cfg.allowLanClients !== false;
  if (showRemoteUrlInUi) showRemoteUrlInUi.checked = cfg.showRemoteUrlInUi !== false;
  if (tailscaleCliPath) tailscaleCliPath.value = cfg.tailscaleCliPath || "tailscale";
  if (allowedClientCidrs) {
    const list = Array.isArray(cfg.allowedClientCidrs) ? cfg.allowedClientCidrs : [];
    allowedClientCidrs.value = list.join("\n");
  }
}

function renderPairing(st) {
  const pairing = st.pairing || {};
  const cfg = st.config || {};
  const active = pairing.activeDevice || null;
  const session = pairing.pairingSession || null;
  pairingAuthMode.textContent = t("pairing_auth_mode_value", {
    mode: pairing.mode || cfg.deviceAuthMode || "strict",
    legacy: pairing.legacyTokenMode || cfg.legacyTokenMode || "off",
  });
  if (active && active.deviceId) {
    const id = String(active.deviceId);
    const shortId = id.length > 8 ? `${id.slice(0, 8)}...` : id;
    boundDeviceStatus.textContent = `${active.name || "Phone"} (${shortId})`;
  } else {
    boundDeviceStatus.textContent = t("pairing_none");
  }
  pairingSessionStatus.textContent = session && session.open ? t("pairing_open") : t("pairing_closed");
  pairingExpiresAt.textContent = session && session.expiresAt ? session.expiresAt : "--";

  const previous = pairingUrlSelect.value;
  pairingUrlSelect.innerHTML = "";
  const urls = [];
  const canAutoPair =
    Boolean(session && session.open && session.pairingId) &&
    Boolean(
      pairingStartCache &&
        pairingStartCache.pairingId === session.pairingId &&
        pairingStartCache.code
    );
  if (session && session.open && session.pairingId) {
    const allUrls = Array.isArray(st.phoneUrls) ? st.phoneUrls : [];
    for (const item of allUrls) {
      const base = item && item.base ? String(item.base) : "";
      if (!base) continue;
      const qs = new URLSearchParams();
      qs.set("pairing", "1");
      qs.set("pairingId", String(session.pairingId));
      qs.set("base", base);
      if (canAutoPair) {
        qs.set("pairingCode", String(pairingStartCache.code));
        qs.set("autoPair", "1");
      }
      const url = `${base}/?${qs.toString()}`;
      if (!urls.includes(url)) urls.push(url);
    }
    if (urls.length === 0 && pairingStartCache && Array.isArray(pairingStartCache.pairingUrls)) {
      for (const item of pairingStartCache.pairingUrls) {
        const clean = String(item || "").trim();
        if (!clean) continue;
        if (!urls.includes(clean)) urls.push(clean);
      }
    }
  }
  for (const url of urls) {
    const opt = document.createElement("option");
    opt.value = url;
    opt.textContent = url;
    pairingUrlSelect.appendChild(opt);
  }
  if (previous && [...pairingUrlSelect.options].some((o) => o.value === previous)) {
    pairingUrlSelect.value = previous;
  } else if (pairingUrlSelect.options.length > 0) {
    pairingUrlSelect.selectedIndex = 0;
  }

  if (
    pairingStartCache &&
    session &&
    session.open &&
    pairingStartCache.pairingId === session.pairingId
  ) {
    pairingCode.textContent = pairingStartCache.code || "--";
  } else {
    pairingCode.textContent = "--";
  }
}

function renderLogs(st) {
  const incoming = Array.isArray(st.logs) ? st.logs : [];
  logLines = incoming.slice(-300);
  logsEl.textContent = logLines
    .map((l) => `${l.at || ""} [${l.source || ""}] ${l.line || ""}`)
    .join("\n");
  logsEl.scrollTop = logsEl.scrollHeight;
}

async function refresh() {
  const st = await window.phoneCodex.getStatus();
  latestStatus = st;
  applyLanguage((st.config && st.config.uiLanguage) || currentLanguage);
  renderSync(st);
  renderStatus(st);
  renderPhoneUrls(st);
  renderRemote(st);
  renderPairing(st);
  await renderPairingQr();
  renderAdvanced(st);
  renderLogs(st);
}

syncToggle.addEventListener("change", async () => {
  const enabled = syncToggle.checked;
  syncToggle.disabled = true;
  await window.phoneCodex.setSync(enabled);
});

if (tabControl) {
  tabControl.addEventListener("click", () => setActivePanel("control"));
}
if (tabLogs) {
  tabLogs.addEventListener("click", () => setActivePanel("logs"));
}

if (uiLanguageToggle) {
  uiLanguageToggle.addEventListener("change", async () => {
    const language = uiLanguageToggle.checked ? "en" : "zh-CN";
    await window.phoneCodex.setConfig({ uiLanguage: language });
    applyLanguage(language);
    await refresh();
  });
}

if (openWebUiDebugBtn) {
  openWebUiDebugBtn.addEventListener("click", async () => {
    await window.phoneCodex.openWebUi();
  });
}

emergencyDisableBtn.addEventListener("click", async () => {
  await window.phoneCodex.emergencyDisable("manual");
});

copyPhoneUrlBtn.addEventListener("click", async () => {
  const url = phoneUrlSelect.value;
  if (!url) return;
  await window.phoneCodex.copyText(url);
});
copyRemoteUrlBtn.addEventListener("click", async () => {
  const url = remoteUrlSelect.value;
  if (!url) return;
  await window.phoneCodex.copyText(url);
});
copyPairingUrlBtn.addEventListener("click", async () => {
  const url = pairingUrlSelect.value;
  if (!url) return;
  await window.phoneCodex.copyText(url);
});

pairingUrlSelect.addEventListener("change", async () => {
  await renderPairingQr();
});

saveConfigBtn.addEventListener("click", async () => {
  const patch = {
    bindHost: bindHost.value === "127.0.0.1" ? "127.0.0.1" : "0.0.0.0",
    bridgePort: Number(bridgePort.value),
    proxyPort: Number(proxyPort.value),
    proxyDebug: Boolean(proxyDebug && proxyDebug.checked),
    desktopOverlayMode:
      desktopOverlayMode && desktopOverlayMode.value === "off" ? "off" : "authoritative",
  };
  await window.phoneCodex.setConfig(patch);
  await refresh();
});
saveRemoteSettingsBtn.addEventListener("click", async () => {
  const cidrs = String(allowedClientCidrs.value || "")
    .split(/\r?\n|,/g)
    .map((item) => item.trim())
    .filter(Boolean);
  const patch = {
    remoteMode: remoteMode.value === "off" ? "off" : "tailscale",
    allowLanClients: Boolean(allowLanClients.checked),
    showRemoteUrlInUi: Boolean(showRemoteUrlInUi.checked),
    tailscaleCliPath: tailscaleCliPath.value || "tailscale",
    allowedClientCidrs: cidrs,
  };
  await window.phoneCodex.saveRemoteSettings(patch);
  if (latestStatus && latestStatus.sync && latestStatus.sync.enabled) {
    const shouldRestart = window.confirm(t("confirm_restart_remote"));
    if (shouldRestart) {
      await window.phoneCodex.setSync(false);
      await window.phoneCodex.setSync(true);
    }
  }
  await refresh();
});

startPairingBtn.addEventListener("click", async () => {
  const started = await window.phoneCodex.startPairing();
  pairingStartCache = started && typeof started === "object" ? started : null;
  await refresh();
});

resetPairingBtn.addEventListener("click", async () => {
  const ok = window.confirm(t("confirm_reset_binding"));
  if (!ok) return;
  await window.phoneCodex.resetPairing();
  pairingStartCache = null;
  await refresh();
});

regenTokenBtn.addEventListener("click", async () => {
  await window.phoneCodex.regenToken();
  await refresh();
});

window.phoneCodex.onStatus(async (st) => {
  latestStatus = st;
  applyLanguage((st.config && st.config.uiLanguage) || currentLanguage);
  renderSync(st);
  renderStatus(st);
  renderPhoneUrls(st);
  renderRemote(st);
  renderPairing(st);
  await renderPairingQr();
  renderAdvanced(st);
});

window.phoneCodex.onLogLine((line) => {
  logLines.push(line);
  while (logLines.length > 300) logLines.shift();
  logsEl.textContent = logLines
    .map((l) => `${l.at || ""} [${l.source || ""}] ${l.line || ""}`)
    .join("\n");
  logsEl.scrollTop = logsEl.scrollHeight;
});

setActivePanel("control");

refresh().catch((err) => {
  logsEl.textContent = t("error_failed_load_status", {
    error: String(err && err.message ? err.message : err),
  });
});
