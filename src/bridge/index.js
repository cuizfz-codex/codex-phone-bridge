const { spawn } = require("child_process");
const { EventEmitter } = require("events");
const http = require("http");
const path = require("path");
const readline = require("readline");

const { sleep } = require("../shared/time");
const { normalizePort } = require("../shared/normalize");

function isElectron() {
  return Boolean(process.versions && process.versions.electron);
}

async function waitForHealth({ baseUrl, token, timeoutMs }) {
  const deadline = Date.now() + Math.max(0, Number(timeoutMs || 0));
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const url = new URL("/api/health", baseUrl);
      const req = http.request(
        url,
        {
          method: "GET",
          timeout: 1200,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
        (res) => {
          let data = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            if (res.statusCode !== 200) {
              resolve(false);
              return;
            }
            try {
              const parsed = JSON.parse(data);
              resolve(Boolean(parsed && parsed.ok));
            } catch {
              resolve(false);
            }
          });
        }
      );
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        try {
          req.destroy();
        } catch {
          // noop
        }
        resolve(false);
      });
      req.end();
    });

    if (ok) return true;
    await sleep(200);
  }
  return false;
}

class BridgeHandle extends EventEmitter {
  constructor(config) {
    super();
    this.config = config || {};
    this.child = null;
    this.stdoutReader = null;
    this.stderrReader = null;
    this.startedAt = null;
  }

  status() {
    const port = normalizePort(this.config.port, 8787);
    return {
      running: Boolean(this.child && this.child.exitCode === null),
      pid: this.child ? this.child.pid : null,
      startedAt: this.startedAt,
      port,
      baseUrl: `http://127.0.0.1:${port}`,
    };
  }

  async start() {
    if (this.child) return;

    const cwd = this.config.cwd ? String(this.config.cwd) : process.cwd();
    const port = normalizePort(this.config.port, 8787);

    const serverJs = this.config.serverJsPath
      ? String(this.config.serverJsPath)
      : path.join(cwd, "server.js");

    const env = { ...process.env };
    if (isElectron() && !env.ELECTRON_RUN_AS_NODE) {
      env.ELECTRON_RUN_AS_NODE = "1";
    }

    if (this.config.authToken) env.AUTH_TOKEN = String(this.config.authToken);
    env.PORT = String(port);
    if (this.config.bindHost) env.BIND_HOST = String(this.config.bindHost);

    if (this.config.corsOrigin !== undefined) {
      env.CORS_ORIGIN = String(this.config.corsOrigin || "");
    }

    if (this.config.requestTimeoutMs)
      env.REQUEST_TIMEOUT_MS = String(this.config.requestTimeoutMs);
    if (this.config.maxBodyBytes) env.MAX_BODY_BYTES = String(this.config.maxBodyBytes);

    if (this.config.codexCliPath) {
      env.CODEX_APP_SERVER_BIN = String(this.config.codexCliPath);
    }
    if (this.config.codexWsUrl !== undefined) {
      env.CODEX_APP_SERVER_WS_URL = String(this.config.codexWsUrl || "");
    }
    if (this.config.codexWsSpawn !== undefined) {
      env.CODEX_APP_SERVER_WS_SPAWN = String(this.config.codexWsSpawn ? "1" : "0");
    }

    if (Array.isArray(this.config.allowedClientCidrs)) {
      env.ALLOWED_CLIENT_CIDRS = this.config.allowedClientCidrs.join(",");
    } else if (this.config.allowedClientCidrs !== undefined) {
      env.ALLOWED_CLIENT_CIDRS = String(this.config.allowedClientCidrs || "");
    }
    if (this.config.remoteMode !== undefined) {
      env.REMOTE_MODE = String(this.config.remoteMode || "off");
    }
    if (Array.isArray(this.config.remoteUrls)) {
      env.REMOTE_URLS_JSON = JSON.stringify(this.config.remoteUrls);
    } else if (this.config.remoteUrls !== undefined) {
      env.REMOTE_URLS_JSON = JSON.stringify([]);
    }
    if (this.config.remoteTailscale && typeof this.config.remoteTailscale === "object") {
      env.REMOTE_TAILSCALE_JSON = JSON.stringify(this.config.remoteTailscale);
    }
    if (this.config.deviceAuthMode !== undefined) {
      env.DEVICE_AUTH_MODE = String(this.config.deviceAuthMode || "strict");
    }
    if (this.config.legacyTokenMode !== undefined) {
      env.LEGACY_TOKEN_MODE = String(this.config.legacyTokenMode || "off");
    }
    if (this.config.pairingCodeLength !== undefined) {
      env.PAIRING_CODE_LENGTH = String(this.config.pairingCodeLength);
    }
    if (this.config.pairingTtlSec !== undefined) {
      env.PAIRING_TTL_SEC = String(this.config.pairingTtlSec);
    }
    if (Array.isArray(this.config.pairingNetworkCidrs)) {
      env.PAIRING_NETWORK_CIDRS = this.config.pairingNetworkCidrs.join(",");
    } else if (this.config.pairingNetworkCidrs !== undefined) {
      env.PAIRING_NETWORK_CIDRS = String(this.config.pairingNetworkCidrs || "");
    }
    if (this.config.maxBoundDevices !== undefined) {
      env.MAX_BOUND_DEVICES = String(this.config.maxBoundDevices);
    }
    if (this.config.deviceAuthStatePath) {
      env.DEVICE_AUTH_STATE_PATH = String(this.config.deviceAuthStatePath);
    }

    if (this.config.mediaRoot) env.MEDIA_ROOT = String(this.config.mediaRoot);
    if (this.config.mediaIndex) env.MEDIA_INDEX = String(this.config.mediaIndex);

    if (this.config.threadListPollMs)
      env.THREAD_LIST_POLL_MS = String(this.config.threadListPollMs);
    if (this.config.threadReadPollActiveMs)
      env.THREAD_READ_POLL_ACTIVE_MS = String(this.config.threadReadPollActiveMs);
    if (this.config.threadReadPollIdleMs)
      env.THREAD_READ_POLL_IDLE_MS = String(this.config.threadReadPollIdleMs);

    if (this.config.defaultApprovalPolicy)
      env.DEFAULT_APPROVAL_POLICY = String(this.config.defaultApprovalPolicy);
    if (this.config.defaultSandboxPolicy)
      env.DEFAULT_SANDBOX_POLICY = String(this.config.defaultSandboxPolicy);
    if (this.config.autoApprovalMode)
      env.AUTO_APPROVAL_MODE = String(this.config.autoApprovalMode);

    if (this.config.maxImageMb) env.MAX_IMAGE_MB = String(this.config.maxImageMb);

    // In ws mode, nudge is irrelevant and can cause unnecessary prompts.
    if (this.config.desktopNudgeMode !== undefined) {
      env.DESKTOP_NUDGE_MODE = String(this.config.desktopNudgeMode);
    }

    const child = spawn(process.execPath, [serverJs], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    this.child = child;
    this.startedAt = new Date().toISOString();

    this.stdoutReader = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    });
    this.stdoutReader.on("line", (line) => {
      this.emit("log", { stream: "stdout", line });
    });

    this.stderrReader = readline.createInterface({
      input: child.stderr,
      crlfDelay: Infinity,
    });
    this.stderrReader.on("line", (line) => {
      this.emit("log", { stream: "stderr", line });
    });

    child.on("exit", (code, signal) => {
      this.emit("exit", { code, signal });
      this.child = null;
      if (this.stdoutReader) {
        try {
          this.stdoutReader.close();
        } catch {
          // noop
        }
        this.stdoutReader = null;
      }
      if (this.stderrReader) {
        try {
          this.stderrReader.close();
        } catch {
          // noop
        }
        this.stderrReader = null;
      }
    });

    const baseUrl = `http://127.0.0.1:${port}`;
    const ok = await waitForHealth({
      baseUrl,
      token: this.config.authToken,
      timeoutMs: Number(this.config.readyTimeoutMs || 12000),
    });
    if (!ok) {
      await this.stop();
      throw new Error("Bridge failed to become healthy");
    }
  }

  async stop() {
    const child = this.child;
    this.child = null;
    if (!child) return;

    await new Promise((resolve) => {
      try {
        if (child.exitCode !== null) {
          resolve();
          return;
        }
        const timer = setTimeout(() => {
          try {
            if (child.exitCode === null) child.kill("SIGKILL");
          } catch {
            // noop
          }
          resolve();
        }, 1500);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
        child.kill("SIGTERM");
      } catch {
        resolve();
      }
    });
  }
}

async function startBridge(config) {
  const handle = new BridgeHandle(config);
  await handle.start();
  return handle;
}

module.exports = {
  startBridge,
  BridgeHandle,
};
