const path = require("path");

const { safeString, normalizePort } = require("./lib/util");
const { buildPhoneUrls } = require("./lib/phone-urls");
const { DEFAULT_ALLOWED_CLIENT_CIDRS } = require("./lib/config-store");

const LAN_PRIVATE_CIDRS = new Set(["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]);
const REQUIRED_SAFE_CIDRS = ["127.0.0.1/8", "::1/128", "100.64.0.0/10", "fc00::/7"];

class SyncService {
  constructor(options) {
    const opt = options || {};
    this.appName = safeString(opt.appName) || "phone-codex";
    this.getCfg = typeof opt.getCfg === "function" ? opt.getCfg : () => opt.cfg || {};
    this.getUserDataDir =
      typeof opt.getUserDataDir === "function" ? opt.getUserDataDir : () => process.cwd();

    this.appendLog = typeof opt.appendLog === "function" ? opt.appendLog : () => {};
    this.createLogger =
      typeof opt.createLogger === "function" ? opt.createLogger : () => console;

    this.isPortFree = opt.isPortFree;
    this.preflightProxyHandshake = opt.preflightProxyHandshake;
    this.preflightSocksConnect = opt.preflightSocksConnect;
    this.getTailscaleStatus = opt.getTailscaleStatus;
    this.getLaunchctlEnv = opt.getLaunchctlEnv;
    this.setCodexWsEnv = opt.setCodexWsEnv;
    this.unsetCodexWsEnv = opt.unsetCodexWsEnv;

    this.startBridge = opt.startBridge;
    this.CodexWsProxy = opt.CodexWsProxy;
    this.CodexSocksProxy = opt.CodexSocksProxy;

    this.dialog = opt.dialog || null;
    this.coreRoot = typeof opt.coreRoot === "function" ? opt.coreRoot : () => process.cwd();

    this.onBridgeExit =
      typeof opt.onBridgeExit === "function" ? opt.onBridgeExit : () => {};
    this.onStatusChange =
      typeof opt.onStatusChange === "function" ? opt.onStatusChange : () => {};

    this.proxy = null;
    this.socksProxy = null;
    this.socksExternal = false;
    this.bridge = null;

    this.syncEnabled = false;
    this.isTransitioning = false;
    this.monitorTimer = null;
    this.bridgeStopping = false;
    this.desktopMissingSince = 0;
    this.desktopMissingWarned = false;
    this.desktopConnectedLogged = false;
  }

  _normalizeRemoteMode(cfg) {
    return safeString(cfg && cfg.remoteMode).trim().toLowerCase() === "off"
      ? "off"
      : "tailscale";
  }

  _dedupeCidrs(list) {
    const out = [];
    for (const raw of Array.isArray(list) ? list : []) {
      const item = safeString(raw).trim();
      if (!item) continue;
      if (!out.includes(item)) out.push(item);
    }
    return out;
  }

  _computeAllowedClientCidrs(cfg) {
    const fromConfig = this._dedupeCidrs(cfg && cfg.allowedClientCidrs);
    let cidrs =
      fromConfig.length > 0 ? fromConfig : this._dedupeCidrs(DEFAULT_ALLOWED_CLIENT_CIDRS);

    const allowLanClients = !(cfg && cfg.allowLanClients === false);
    if (!allowLanClients) {
      cidrs = cidrs.filter((item) => !LAN_PRIVATE_CIDRS.has(item));
    }

    for (const item of REQUIRED_SAFE_CIDRS) {
      if (!cidrs.includes(item)) cidrs.push(item);
    }
    return cidrs;
  }

  async _resolveRemoteRuntime(cfg) {
    const remoteMode = this._normalizeRemoteMode(cfg);
    let tailscaleStatus = {
      cliPath: safeString(cfg && cfg.tailscaleCliPath).trim() || "tailscale",
      installed: false,
      connected: false,
      ipv4: null,
      magicDns: null,
      backendState: null,
      errorCode: null,
      errorMessage: "",
    };

    if (remoteMode === "tailscale" && this.getTailscaleStatus) {
      try {
        tailscaleStatus = await this.getTailscaleStatus({
          cliPath: tailscaleStatus.cliPath,
          timeoutMs: 2000,
        });
      } catch (error) {
        tailscaleStatus = {
          ...tailscaleStatus,
          errorCode: "probe_failed",
          errorMessage: safeString(error && error.message ? error.message : error),
        };
      }

      if (!tailscaleStatus.installed) {
        this.appendLog(
          "app",
          "Tailscale CLI is not installed. External mobile access is unavailable; local/LAN access still works."
        );
      } else if (!tailscaleStatus.connected) {
        this.appendLog(
          "app",
          `Tailscale is not connected (${tailscaleStatus.errorCode || "unknown"}). External mobile access is unavailable until Tailscale is connected.`
        );
      } else {
        const tags = [tailscaleStatus.ipv4, tailscaleStatus.magicDns].filter(Boolean);
        this.appendLog("app", `Tailscale ready (${tags.join(" | ")})`);
      }
    }

    const allUrls = buildPhoneUrls(cfg, { tailscale: tailscaleStatus });
    const remoteUrls = allUrls
      .filter((item) => item && item.kind === "tailscale" && item.base)
      .map((item) => item.base);

    return {
      mode: remoteMode,
      tailscale: tailscaleStatus,
      allowedClientCidrs: this._computeAllowedClientCidrs(cfg),
      urls: remoteUrls,
    };
  }

  runtimeStatus() {
    return {
      enabled: this.syncEnabled,
      transitioning: this.isTransitioning,
      socks: this.socksProxy
        ? { running: true, mode: "builtin", ...this.socksProxy.status() }
        : this.socksExternal
        ? { running: true, mode: "external", listen: "127.0.0.1:1080" }
        : { running: false, mode: "off", listen: "127.0.0.1:1080" },
      proxy: this.proxy ? { running: true, ...this.proxy.status() } : { running: false },
      bridge: this.bridge ? this.bridge.status() : { running: false },
    };
  }

  _getMediaPaths() {
    const base = path.join(this.getUserDataDir(), "media");
    try {
      require("fs").mkdirSync(base, { recursive: true });
    } catch {
      // noop
    }
    return {
      mediaRoot: base,
      mediaIndex: path.join(base, "index.json"),
    };
  }

  async startupCleanup() {
    if (!this.getLaunchctlEnv || !this.unsetCodexWsEnv) return;
    const cfg = this.getCfg();
    const envWs = await this.getLaunchctlEnv("CODEX_APP_SERVER_WS_URL");
    if (envWs && envWs.includes(`127.0.0.1:${normalizePort(cfg.proxyPort, 18791)}`)) {
      this.appendLog("app", `Found launchctl CODEX_APP_SERVER_WS_URL=${envWs}, unsetting for safety`);
      await this.unsetCodexWsEnv({ appendLog: this.appendLog }).catch(() => null);
    }
  }

  async start() {
    if (this.syncEnabled || this.isTransitioning) return;
    const cfg = this.getCfg();
    this.isTransitioning = true;
    this.onStatusChange();
    this.appendLog("app", "Starting sync...");

    const wsUrl = `ws://127.0.0.1:${normalizePort(cfg.proxyPort, 18791)}`;
    const socksUrl = "socks5://127.0.0.1:1080";

    try {
      const remoteRuntime = await this._resolveRemoteRuntime(cfg);
      const bridgeHost = cfg.bindHost === "127.0.0.1" ? "127.0.0.1" : "0.0.0.0";
      if (this.isPortFree && !(await this.isPortFree("127.0.0.1", cfg.proxyPort))) {
        throw new Error(
          `Proxy port ${cfg.proxyPort} is already in use. Stop the existing service or change Proxy Port in Advanced settings.`
        );
      }
      if (this.isPortFree && !(await this.isPortFree(bridgeHost, cfg.bridgePort))) {
        throw new Error(
          `Web port ${cfg.bridgePort} is already in use. Stop the existing service or change Web Port in Advanced settings.`
        );
      }

      // Codex Desktop's websocket transport connects through a local SOCKS5 proxy:
      // socks5h://127.0.0.1:1080. Without something listening there, Codex shows 1006 and can't sign-in.
      this.socksExternal = false;
      if (this.isPortFree && (await this.isPortFree("127.0.0.1", 1080))) {
        this.socksProxy = new this.CodexSocksProxy({
          listenHost: "127.0.0.1",
          listenPort: 1080,
          allowedHost: "127.0.0.1",
          allowedPort: normalizePort(cfg.proxyPort, 18791),
          logger: this.createLogger("socks"),
        });
        await this.socksProxy.start();
        this.appendLog("app", `SOCKS proxy started at ${socksUrl}`);
      } else {
        this.socksExternal = true;
        this.appendLog(
          "app",
          "SOCKS port 1080 is already in use. Assuming an existing SOCKS5 proxy is running there."
        );
      }

      this.proxy = new this.CodexWsProxy({
        listenHost: "127.0.0.1",
        listenPort: normalizePort(cfg.proxyPort, 18791),
        spawnUpstream: true,
        bin: cfg.codexCliPath,
        approvalClientName: "codex-phone-bridge",
        debug: Boolean(cfg.proxyDebug),
        desktopOverlayMode: cfg.desktopOverlayMode,
        logger: this.createLogger("proxy"),
      });
      await this.proxy.start();

      const { mediaRoot, mediaIndex } = this._getMediaPaths();
      this.bridge = await this.startBridge({
        serverJsPath: path.join(this.coreRoot(), "server.js"),
        cwd: this.getUserDataDir(),
        port: normalizePort(cfg.bridgePort, 8787),
        bindHost: cfg.bindHost,
        authToken: cfg.authToken,
        corsOrigin: "",
        codexCliPath: cfg.codexCliPath,
        codexWsUrl: wsUrl,
        codexWsSpawn: false,
        mediaRoot,
        mediaIndex,
        desktopNudgeMode: "off",
        allowedClientCidrs: remoteRuntime.allowedClientCidrs,
        remoteMode: remoteRuntime.mode,
        remoteUrls: remoteRuntime.urls,
        remoteTailscale: remoteRuntime.tailscale,
        deviceAuthMode: cfg.deviceAuthMode,
        legacyTokenMode: cfg.legacyTokenMode,
        pairingCodeLength: cfg.pairingCodeLength,
        pairingTtlSec: cfg.pairingTtlSec,
        pairingNetworkCidrs: cfg.pairingNetworkCidrs,
        maxBoundDevices: cfg.maxBoundDevices,
        deviceAuthStatePath: path.join(this.getUserDataDir(), "device-binding.json"),
        readyTimeoutMs: 12000,
      });

      this.bridge.on("log", (msg) => {
        this.appendLog("bridge", `[${msg.stream}] ${msg.line}`);
      });
      this.bridge.on("exit", (info) => {
        this.appendLog("bridge", `exited (code=${info.code}, signal=${info.signal})`);
        if (this.bridgeStopping) return;
        this.onBridgeExit(info);
      });

      if (this.preflightProxyHandshake) {
        const ok = await this.preflightProxyHandshake(wsUrl, 2000);
        if (!ok) throw new Error("Proxy preflight handshake failed");
      }
      if (this.preflightSocksConnect) {
        const socksOk = await this.preflightSocksConnect({
          socksHost: "127.0.0.1",
          socksPort: 1080,
          dstHost: "127.0.0.1",
          dstPort: normalizePort(cfg.proxyPort, 18791),
          timeoutMs: 2000,
        });
        if (!socksOk) {
          throw new Error(
            "SOCKS preflight failed (Codex requires a working SOCKS5 proxy on 127.0.0.1:1080 to use websocket transport)."
          );
        }
      }

      if (this.setCodexWsEnv) {
        await this.setCodexWsEnv(wsUrl, { appendLog: this.appendLog });
      }
      this.syncEnabled = true;
      this.desktopMissingSince = 0;
      this.desktopMissingWarned = false;
      this.desktopConnectedLogged = false;
      this.onStatusChange();
      this.appendLog(
        "app",
        "Sync is ON. To enable realtime Web->Desktop sync, quit Codex (Cmd+Q) then re-open it from Dock."
      );

      this._startMonitor();
    } catch (error) {
      const msg = safeString(error && error.message ? error.message : error);
      this.appendLog("app", `Failed to start sync: ${msg}`);
      try {
        this.dialog && this.dialog.showErrorBox("phone-codex: Sync ON failed", msg);
      } catch {
        // noop
      }
      await this.emergencyDisable("startSync failed");
    } finally {
      this.isTransitioning = false;
      this.onStatusChange();
    }
  }

  async stop() {
    if ((!this.syncEnabled && !this.proxy && !this.bridge) || this.isTransitioning) return;
    this.isTransitioning = true;
    this.onStatusChange();
    this.appendLog("app", "Stopping sync...");

    if (this.unsetCodexWsEnv) {
      await this.unsetCodexWsEnv({ appendLog: this.appendLog }).catch(() => null);
    }
    this.syncEnabled = false;
    this.desktopMissingSince = 0;
    this.desktopMissingWarned = false;
    this.desktopConnectedLogged = false;
    this._stopMonitor();

    if (this.bridge) {
      this.bridgeStopping = true;
      try {
        await this.bridge.stop();
      } catch {
        // noop
      }
      this.bridge = null;
      this.bridgeStopping = false;
    }
    if (this.proxy) {
      try {
        await this.proxy.stop();
      } catch {
        // noop
      }
      this.proxy = null;
    }
    if (this.socksProxy) {
      try {
        await this.socksProxy.stop();
      } catch {
        // noop
      }
      this.socksProxy = null;
    }
    this.socksExternal = false;

    this.appendLog(
      "app",
      "Sync is OFF. If Codex was running in ws mode, restart Codex to return to normal mode."
    );
    this.isTransitioning = false;
    this.onStatusChange();
  }

  async emergencyDisable(reason) {
    this.appendLog("app", `Emergency disable${reason ? `: ${reason}` : ""}`);
    this._stopMonitor();
    this.syncEnabled = false;
    this.desktopMissingSince = 0;
    this.desktopMissingWarned = false;
    this.desktopConnectedLogged = false;
    this.isTransitioning = true;
    this.onStatusChange();

    if (this.unsetCodexWsEnv) {
      await this.unsetCodexWsEnv({ appendLog: this.appendLog }).catch(() => null);
    }

    if (this.bridge) {
      this.bridgeStopping = true;
      try {
        await this.bridge.stop();
      } catch {
        // noop
      }
      this.bridge = null;
      this.bridgeStopping = false;
    }
    if (this.proxy) {
      try {
        await this.proxy.stop();
      } catch {
        // noop
      }
      this.proxy = null;
    }
    if (this.socksProxy) {
      try {
        await this.socksProxy.stop();
      } catch {
        // noop
      }
      this.socksProxy = null;
    }
    this.socksExternal = false;

    this.isTransitioning = false;
    this.onStatusChange();
  }

  _startMonitor() {
    this._stopMonitor();
    this.monitorTimer = setInterval(async () => {
      if (!this.syncEnabled) return;
      if (!this.proxy) {
        void this.emergencyDisable("proxy missing");
        return;
      }
      if (!this.socksProxy && !this.socksExternal) {
        void this.emergencyDisable("socks missing");
        return;
      }
      const st = this.proxy.status();
      if (!st.upstreamReady) {
        void this.emergencyDisable("proxy upstream not ready");
        return;
      }
      const clients = Array.isArray(st.clients) ? st.clients : [];
      const desktopConnected = clients.some(
        (c) => this._proxyClientRole(c) === "desktop" && Boolean(c && c.open)
      );
      const bridgeConnected = clients.some(
        (c) => this._proxyClientRole(c) === "bridge" && Boolean(c && c.open)
      );

      if (desktopConnected) {
        this.desktopMissingSince = 0;
        this.desktopMissingWarned = false;
        if (!this.desktopConnectedLogged) {
          this.desktopConnectedLogged = true;
          this.appendLog(
            "app",
            "Codex Desktop is connected to the shared WS stream. Realtime Web->Desktop sync is active."
          );
        }
      } else if (bridgeConnected) {
        if (!this.desktopMissingSince) {
          this.desktopMissingSince = Date.now();
        }
        const missingMs = Date.now() - this.desktopMissingSince;
        if (!this.desktopMissingWarned && missingMs >= 15000) {
          this.desktopMissingWarned = true;
          this.desktopConnectedLogged = false;
          this.appendLog(
            "app",
            "Bridge is connected but Codex Desktop is not on the shared WS stream. Fully quit Codex (Cmd+Q) and reopen it from Dock."
          );
        }
      }
    }, 3000);
  }

  _proxyClientRole(client) {
    const c = client && typeof client === "object" ? client : {};
    const role = safeString(c.role).trim().toLowerCase();
    if (role) return role;
    const name = safeString(c.name).trim();
    if (!name) return "other";
    if (name === "codex-phone-bridge") return "bridge";
    if (name === "phone-codex-preflight") return "preflight";
    if (name.toLowerCase().includes("codex")) return "desktop";
    return "other";
  }

  _stopMonitor() {
    if (!this.monitorTimer) return;
    clearInterval(this.monitorTimer);
    this.monitorTimer = null;
  }
}

module.exports = {
  SyncService,
};
