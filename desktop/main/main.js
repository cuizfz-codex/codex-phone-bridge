const { app, Tray, Menu, BrowserWindow, ipcMain, shell, clipboard, dialog, screen } = require("electron");
const http = require("http");
const path = require("path");

const QRCode = require("qrcode");

const { CodexWsProxy, CodexSocksProxy, startBridge } = require("phone-codex-core");

const {
  loadConfig,
  saveConfig,
  generateAuthToken,
  getUserDataDir,
  DEFAULT_ALLOWED_CLIENT_CIDRS,
} = require("./lib/config-store");
const { buildPhoneUrls } = require("./lib/phone-urls");
const { createLogStore } = require("./lib/log-store");
const { safeString, normalizePort, nowIso } = require("./lib/util");
const { getLaunchctlEnv, setCodexWsEnv, unsetCodexWsEnv } = require("./lib/launchctl-env");
const { isPortFree } = require("./lib/net");
const { preflightProxyHandshake, preflightSocksConnect } = require("./lib/preflight");
const { getTailscaleStatus, normalizeCliPath } = require("./lib/tailscale");

const { SyncService } = require("./sync-service");

const APP_NAME = "phone-codex";
const LAN_PRIVATE_CIDRS = new Set(["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]);
const REQUIRED_SAFE_CIDRS = ["127.0.0.1/8", "::1/128", "100.64.0.0/10", "fc00::/7"];

function coreRoot() {
  const pkgPath = require.resolve("phone-codex-core/package.json");
  return path.dirname(pkgPath);
}

let tray = null;
let mainWindow = null;
let cfg = null;
let cleanupOnQuitStarted = false;

let logStore = null;
let syncService = null;

function bridgeBaseUrl() {
  const port = normalizePort(cfg && cfg.bridgePort ? cfg.bridgePort : 8787, 8787);
  return `http://127.0.0.1:${port}`;
}

async function bridgeRequest(pathname, options = {}) {
  const runtime = syncService ? syncService.runtimeStatus() : null;
  if (!runtime || !runtime.bridge || !runtime.bridge.running) {
    throw new Error("Bridge is not running");
  }
  const method = safeString(options.method || "GET").toUpperCase();
  const headers = {
    Authorization: `Bearer ${safeString(cfg && cfg.authToken ? cfg.authToken : "")}`,
  };
  let body = undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  const url = new URL(pathname, bridgeBaseUrl());
  const payload = await new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method,
        headers,
        timeout: 4000,
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          let parsed = {};
          try {
            parsed = data ? JSON.parse(data) : {};
          } catch {
            parsed = {};
          }
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            if (parsed && parsed.ok === false) {
              reject(new Error(parsed.error || "Bridge request failed"));
              return;
            }
            resolve(parsed || {});
            return;
          }
          reject(new Error(parsed.error || `HTTP ${res.statusCode || 500}`));
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      try {
        req.destroy();
      } catch {
        // noop
      }
      reject(new Error("Bridge request timeout"));
    });
    if (body !== undefined) req.write(body);
    req.end();
  });
  return payload;
}

function dedupeCidrs(list) {
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const item = safeString(raw).trim();
    if (!item) continue;
    if (!out.includes(item)) out.push(item);
  }
  return out;
}

function computeAllowedClientCidrs(localCfg) {
  const base =
    dedupeCidrs(localCfg && localCfg.allowedClientCidrs).length > 0
      ? dedupeCidrs(localCfg.allowedClientCidrs)
      : dedupeCidrs(DEFAULT_ALLOWED_CLIENT_CIDRS);
  const allowLanClients = !(localCfg && localCfg.allowLanClients === false);
  const filtered = allowLanClients ? base : base.filter((item) => !LAN_PRIVATE_CIDRS.has(item));
  for (const cidr of REQUIRED_SAFE_CIDRS) {
    if (!filtered.includes(cidr)) filtered.push(cidr);
  }
  return filtered;
}

function normalizeRemoteMode(value) {
  return safeString(value).trim().toLowerCase() === "off" ? "off" : "tailscale";
}

async function resolveRemoteInfo(localCfg) {
  const remoteMode = normalizeRemoteMode(localCfg && localCfg.remoteMode);
  const cliPath = normalizeCliPath(localCfg && localCfg.tailscaleCliPath);
  let tailscale = {
    cliPath,
    installed: false,
    connected: false,
    ipv4: null,
    magicDns: null,
    backendState: null,
    errorCode: null,
    errorMessage: "",
  };
  if (remoteMode === "tailscale") {
    try {
      tailscale = await getTailscaleStatus({ cliPath, timeoutMs: 1800 });
    } catch (error) {
      tailscale = {
        ...tailscale,
        errorCode: "probe_failed",
        errorMessage: safeString(error && error.message ? error.message : error),
      };
    }
  }

  const urls = buildPhoneUrls(localCfg || {}, { tailscale });
  const remoteUrls = urls
    .filter((item) => item && item.kind === "tailscale" && item.base)
    .map((item) => item.base);
  return {
    mode: remoteMode,
    tailscale,
    urls: remoteUrls,
    accessPolicy: {
      allowedCidrs: computeAllowedClientCidrs(localCfg || {}),
    },
  };
}

async function getStatus() {
  const envWs = await getLaunchctlEnv("CODEX_APP_SERVER_WS_URL");
  const remote = await resolveRemoteInfo(cfg || {});
  const urls = buildPhoneUrls(cfg || {}, { tailscale: remote.tailscale });
  const runtime = syncService ? syncService.runtimeStatus() : null;
  const userDataDir = getUserDataDir(app, APP_NAME);
  let pairing = null;
  if (runtime && runtime.bridge && runtime.bridge.running) {
    try {
      pairing = await bridgeRequest("/api/v3/pairing/state");
    } catch {
      pairing = null;
    }
  }

  return {
    now: nowIso(),
    config: {
      bridgePort: cfg.bridgePort,
      bindHost: cfg.bindHost,
      proxyPort: cfg.proxyPort,
      codexCliPath: cfg.codexCliPath,
      proxyDebug: Boolean(cfg.proxyDebug),
      desktopOverlayMode: cfg.desktopOverlayMode,
      remoteMode: normalizeRemoteMode(cfg.remoteMode),
      allowLanClients: !(cfg && cfg.allowLanClients === false),
      tailscaleCliPath: normalizeCliPath(cfg && cfg.tailscaleCliPath),
      allowedClientCidrs: computeAllowedClientCidrs(cfg || {}),
      showRemoteUrlInUi: cfg.showRemoteUrlInUi !== false,
      deviceAuthMode: safeString(cfg.deviceAuthMode || "strict") || "strict",
      pairingCodeLength: Number(cfg.pairingCodeLength || 6),
      pairingTtlSec: Number(cfg.pairingTtlSec || 300),
      pairingNetworkCidrs: Array.isArray(cfg.pairingNetworkCidrs)
        ? cfg.pairingNetworkCidrs
        : [],
      legacyTokenMode: safeString(cfg.legacyTokenMode || "off") || "off",
      maxBoundDevices: Number(cfg.maxBoundDevices || 1) || 1,
      uiLanguage: safeString(cfg.uiLanguage || "en") || "en",
      // authToken intentionally returned (UI needs it for phone URL); do not log it.
      authToken: cfg.authToken,
      userDataDir,
    },
    sync: {
      enabled: Boolean(runtime && runtime.enabled),
      transitioning: Boolean(runtime && runtime.transitioning),
      launchctlWsUrl: envWs || "",
    },
    socks: runtime ? runtime.socks : { running: false, mode: "off", listen: "127.0.0.1:1080" },
    proxy: runtime ? runtime.proxy : { running: false },
    bridge: runtime ? runtime.bridge : { running: false },
    remote,
    pairing,
    phoneUrls: urls,
    logs: logStore ? logStore.recent(300) : [],
  };
}

function pushStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    void getStatus().then((st) => {
      mainWindow.webContents.send("status", st);
    });
  }
  updateTray();
}

function updateTray() {
  if (!tray) return;
  const runtime = syncService ? syncService.runtimeStatus() : { enabled: false, transitioning: false };
  const label = runtime.enabled ? "Sync: ON" : "Sync: OFF";
  tray.setToolTip(`phone-codex (${label})`);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open Control Panel",
      click: () => showMainWindow(),
    },
    { type: "separator" },
    {
      label: "Sync ON",
      type: "checkbox",
      checked: Boolean(runtime.enabled),
      enabled: !Boolean(runtime.transitioning),
      click: () => (runtime.enabled ? void stopSync() : void startSync()),
    },
    {
      label: "Emergency Disable",
      enabled: !Boolean(runtime.transitioning),
      click: () => void emergencyDisable("manual"),
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => app.quit(),
    },
  ]);
  tray.setContextMenu(contextMenu);
}

function createTray() {
  const iconPath = path.join(__dirname, "..", "assets", "trayTemplate.png");
  tray = new Tray(iconPath);
  updateTray();
  tray.on("click", () => showMainWindow());
}

function createMainWindow() {
  const workArea = screen.getPrimaryDisplay().workAreaSize || { width: 1280, height: 800 };
  const initialWidth = Math.max(980, Math.min(1320, workArea.width - 60));
  const initialHeight = Math.max(760, Math.min(940, workArea.height - 60));
  mainWindow = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    minWidth: 900,
    minHeight: 680,
    show: false,
    resizable: true,
    title: "phone-codex",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  mainWindow.on("close", (e) => {
    // Keep it running in the menu bar.
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function showMainWindow() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
  pushStatus();
}

async function startSync() {
  if (!syncService) return;
  await syncService.start();
  pushStatus();
}

async function stopSync() {
  if (!syncService) return;
  await syncService.stop();
  pushStatus();
}

async function emergencyDisable(reason) {
  if (!syncService) return;
  await syncService.emergencyDisable(reason || "manual");
  pushStatus();
}

ipcMain.handle("get-status", async () => await getStatus());
ipcMain.handle("get-remote-status", async () => {
  const st = await getStatus();
  return st.remote;
});
ipcMain.handle("get-remote-urls", async () => {
  const st = await getStatus();
  return st.remote && Array.isArray(st.remote.urls) ? st.remote.urls : [];
});
ipcMain.handle("set-sync", async (_evt, enabled) => {
  if (enabled) await startSync();
  else await stopSync();
  return await getStatus();
});
ipcMain.handle("emergency-disable", async (_evt, reason) => {
  await emergencyDisable(reason || "manual");
  return await getStatus();
});
ipcMain.handle("open-web-ui", async () => {
  const port = normalizePort(cfg.bridgePort, 8787);
  const base = `http://127.0.0.1:${port}`;
  const url = `${base}/?base=${encodeURIComponent(base)}`;
  await shell.openExternal(url);
  return true;
});
ipcMain.handle("copy-text", async (_evt, text) => {
  clipboard.writeText(safeString(text));
  return true;
});
ipcMain.handle("generate-qr", async (_evt, url) => {
  const dataUrl = await QRCode.toDataURL(safeString(url), { margin: 1, width: 256 });
  return dataUrl;
});
ipcMain.handle("set-config", async (_evt, patch) => {
  saveConfig(app, APP_NAME, patch || {});
  cfg = loadConfig(app, APP_NAME); // re-validate + normalize
  pushStatus();
  return cfg;
});
ipcMain.handle("save-remote-settings", async (_evt, patch) => {
  const src = patch && typeof patch === "object" ? patch : {};
  const nextPatch = {};
  if (Object.prototype.hasOwnProperty.call(src, "remoteMode")) {
    nextPatch.remoteMode = normalizeRemoteMode(src.remoteMode);
  }
  if (Object.prototype.hasOwnProperty.call(src, "allowLanClients")) {
    nextPatch.allowLanClients = Boolean(src.allowLanClients);
  }
  if (Object.prototype.hasOwnProperty.call(src, "tailscaleCliPath")) {
    nextPatch.tailscaleCliPath = normalizeCliPath(src.tailscaleCliPath);
  }
  if (Object.prototype.hasOwnProperty.call(src, "allowedClientCidrs")) {
    if (Array.isArray(src.allowedClientCidrs)) {
      nextPatch.allowedClientCidrs = src.allowedClientCidrs
        .map((item) => safeString(item).trim())
        .filter(Boolean);
    } else {
      nextPatch.allowedClientCidrs = safeString(src.allowedClientCidrs)
        .split(/[,\n]/g)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  if (Object.prototype.hasOwnProperty.call(src, "showRemoteUrlInUi")) {
    nextPatch.showRemoteUrlInUi = Boolean(src.showRemoteUrlInUi);
  }
  saveConfig(app, APP_NAME, nextPatch);
  cfg = loadConfig(app, APP_NAME);
  pushStatus();
  return cfg;
});
ipcMain.handle("start-pairing", async () => {
  const st = await getStatus();
  const urls = Array.isArray(st.phoneUrls) ? st.phoneUrls : [];
  const baseUrls = [];
  for (const item of urls) {
    const base = safeString(item && item.base ? item.base : "").trim();
    if (!base) continue;
    if (!baseUrls.includes(base)) baseUrls.push(base);
  }
  const started = await bridgeRequest("/api/v3/pairing/start", {
    method: "POST",
    body: { baseUrls },
  });
  return started;
});
ipcMain.handle("get-pairing-state", async () => {
  return await bridgeRequest("/api/v3/pairing/state");
});
ipcMain.handle("reset-pairing", async () => {
  return await bridgeRequest("/api/v3/pairing/reset", { method: "POST", body: {} });
});
ipcMain.handle("regen-token", async () => {
  const token = generateAuthToken();
  saveConfig(app, APP_NAME, { authToken: token });
  cfg = loadConfig(app, APP_NAME);
  pushStatus();
  return token;
});

app.on("before-quit", () => {
  app.isQuiting = true;
});

app.on("will-quit", (e) => {
  // Best-effort cleanup (avoid leaving launchctl env behind).
  if (cleanupOnQuitStarted) return;
  cleanupOnQuitStarted = true;
  e.preventDefault();
  void (async () => {
    try {
      if (syncService) await syncService.stop();
    } catch {
      // noop
    } finally {
      try {
        logStore && logStore.close();
      } catch {
        // noop
      }
      app.exit(0);
    }
  })();
});

app.whenReady().then(async () => {
  cfg = loadConfig(app, APP_NAME);

  logStore = createLogStore({
    app,
    appName: APP_NAME,
    getMainWindow: () => mainWindow,
  });

  const userDataDir = getUserDataDir(app, APP_NAME);

  syncService = new SyncService({
    appName: APP_NAME,
    getCfg: () => cfg,
    getUserDataDir: () => userDataDir,
    appendLog: logStore.appendLog,
    createLogger: logStore.createLogger,
    isPortFree,
    preflightProxyHandshake,
    preflightSocksConnect,
    getTailscaleStatus,
    getLaunchctlEnv,
    setCodexWsEnv,
    unsetCodexWsEnv,
    startBridge,
    CodexWsProxy,
    CodexSocksProxy,
    dialog,
    coreRoot,
    onBridgeExit: () => void emergencyDisable("bridge exited"),
    onStatusChange: () => pushStatus(),
  });

  // If a previous run left ws env behind, clean it up to avoid 1006 lockouts.
  await syncService.startupCleanup();

  createTray();
  createMainWindow();
  showMainWindow();

  logStore.appendLog("app", "phone-codex started");
  pushStatus();
});
