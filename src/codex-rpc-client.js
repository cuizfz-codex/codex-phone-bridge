const { spawn } = require("child_process");
const readline = require("readline");
const { EventEmitter } = require("events");
const WebSocket = require("ws");

const { safeToUtf8 } = require("./shared/encoding");

function normalizeWebSocketUrl(value) {
  const raw = String(value || "").trim();
  return raw ? raw : null;
}

function coerceBoolean(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const raw = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(raw)) return true;
  if (["0", "false", "no", "n", "off"].includes(raw)) return false;
  return fallback;
}

class CodexAppServerClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.configuredBin =
      options.bin || "/Applications/Codex.app/Contents/Resources/codex";
    this.requestTimeoutMs = Number(options.requestTimeoutMs || 30000);
    this.initializeParams =
      options.initializeParams ||
      {
        clientInfo: {
          name: "codex-phone-bridge",
          title: "Codex Phone Bridge",
          version: "0.2.0",
        },
        capabilities: {
          experimentalApi: true,
        },
      };
    this.logger = options.logger || console;

    this.websocketUrl = normalizeWebSocketUrl(options.websocketUrl);
    this.spawnWebsocketServer = coerceBoolean(options.spawnWebsocketServer, true);
    this.transport = this.websocketUrl ? "ws" : "stdio";

    // stdio transport state
    this.child = null;
    this.stdoutReader = null;

    // ws transport state
    this.ws = null;
    this.spawnedChild = null;

    this.isConnected = false;
    this.isReady = false;
    this.manualStop = false;

    this.requestSeq = 1;
    this.pendingRequests = new Map();
    this.pendingServerRequests = new Map();

    this.reconnectDelays = [1000, 2000, 5000, 10000];
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
  }

  async start() {
    this.manualStop = false;
    if (this.transport === "ws") {
      if (this._isWsActive()) return;
      await this._startWsTransport();
      return;
    }

    if (this.child) return;
    this._spawnStdioProcess();
  }

  async stop() {
    this.manualStop = true;
    this._clearReconnectTimer();
    this._rejectAllPending(new Error("RPC client stopped"));
    this.pendingServerRequests.clear();
    await this._terminateTransport();
    this.isConnected = false;
    this.isReady = false;
  }

  status() {
    const pid =
      this.transport === "stdio"
        ? this.child
          ? this.child.pid
          : null
        : this.spawnedChild
        ? this.spawnedChild.pid
        : null;

    return {
      transport: this.transport,
      websocketUrl: this.websocketUrl,
      spawned: this.transport === "ws" ? Boolean(this.spawnedChild) : false,
      connected: this.isConnected,
      ready: this.isReady,
      reconnectAttempt: this.reconnectAttempt,
      pendingRequestCount: this.pendingRequests.size,
      pendingServerRequestCount: this.pendingServerRequests.size,
      pid,
    };
  }

  getPendingServerRequests() {
    return [...this.pendingServerRequests.values()].map((item) => ({
      id: item.id,
      method: item.method,
      params: item.params,
      receivedAt: item.receivedAt,
    }));
  }

  async request(method, params = {}, options = {}) {
    const timeoutMs = Number(options.timeoutMs || this.requestTimeoutMs);
    if (!this.isConnected || !this._canSend()) {
      throw new Error("codex app-server is not connected");
    }

    const id = this.requestSeq++;
    const payload = {
      method,
      id,
      params,
    };

    const key = this._idKey(id);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(key);
        reject(new Error(`RPC request timeout: ${method}`));
      }, timeoutMs);

      this.pendingRequests.set(key, {
        method,
        resolve,
        reject,
        timer,
      });

      try {
        this._send(payload);
      } catch (error) {
        clearTimeout(timer);
        this.pendingRequests.delete(key);
        reject(error);
      }
    });
  }

  notify(method, params = {}) {
    if (!this.isConnected || !this._canSend()) {
      throw new Error("codex app-server is not connected");
    }
    this._send({ method, params });
  }

  respondToServerRequest(requestId, responsePayload, asError = null) {
    const key = this._idKey(requestId);
    const pending = this.pendingServerRequests.get(key);
    if (!pending) {
      throw new Error(`Unknown pending server request id: ${requestId}`);
    }
    this.pendingServerRequests.delete(key);

    if (asError) {
      const err =
        typeof asError === "object" && asError
          ? asError
          : { code: -32000, message: String(asError) };
      this._send({
        id: pending.id,
        error: {
          code: Number(err.code || -32000),
          message: String(err.message || "Unknown error"),
          data: err.data,
        },
      });
      return;
    }

    this._send({
      id: pending.id,
      result: responsePayload,
    });
  }

  _spawnStdioProcess() {
    const candidates = this._candidateBins();
    this._trySpawnStdioCandidate(candidates, 0);
  }

  _candidateBins() {
    const list = [];
    if (this.configuredBin) list.push(this.configuredBin);
    if (!list.includes("codex")) list.push("codex");
    return list;
  }

  _trySpawnStdioCandidate(candidates, index) {
    if (index >= candidates.length) {
      this._scheduleReconnect(
        new Error("Failed to spawn codex app-server from any known binary")
      );
      return;
    }

    const bin = candidates[index];
    const child = spawn(bin, ["app-server"], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      env: process.env,
    });

    let spawnFailed = false;

    const onSpawnError = (error) => {
      spawnFailed = true;
      if (error && error.code === "ENOENT" && index + 1 < candidates.length) {
        this.logger.warn(
          `[codex-rpc] binary not found: ${bin}, trying fallback`
        );
        this._trySpawnStdioCandidate(candidates, index + 1);
        return;
      }
      this.emit("error", error);
      this._scheduleReconnect(error);
    };

    child.once("error", onSpawnError);

    child.once("spawn", async () => {
      if (spawnFailed) return;
      child.removeListener("error", onSpawnError);

      this.child = child;
      this.isConnected = true;
      this.isReady = false;
      this.reconnectAttempt = 0;
      this.emit("connected", {
        transport: "stdio",
        bin,
        pid: child.pid,
      });

      this.stdoutReader = readline.createInterface({
        input: child.stdout,
        crlfDelay: Infinity,
      });
      this.stdoutReader.on("line", (line) => {
        this._handleMessageText(line);
      });

      child.stderr.on("data", (chunk) => {
        const text = chunk.toString("utf8");
        for (const rawLine of text.split(/\r?\n/)) {
          const line = rawLine.trim();
          if (!line) continue;
          this.emit("stderr", { line, pid: child.pid });
        }
      });

      child.on("exit", (code, signal) => {
        this._handleStdioExit(child, code, signal);
      });

      try {
        const initResult = await this._performInitializeHandshake();
        this.emit("ready", initResult);
      } catch (error) {
        this.emit("error", error);
        // If initialize fails, restart transport; the current process may still be alive.
        await this._terminateStdioChild();
      }
    });
  }

  async _performInitializeHandshake() {
    const initResult = await this.request(
      "initialize",
      this.initializeParams,
      { timeoutMs: 15000 }
    );
    this.notify("initialized");
    this.isReady = true;
    return initResult;
  }

  _handleMessageText(text) {
    const chunk = safeToUtf8(text);
    if (!chunk) return;
    const lines = chunk.split(/\r?\n/);
    for (const rawLine of lines) {
      this._handleMessageLine(rawLine);
    }
  }

  _handleMessageLine(line) {
    const text = String(line || "").trim();
    if (!text) return;
    let message = null;
    try {
      message = JSON.parse(text);
    } catch (_error) {
      this.emit("protocol-warning", {
        kind: "non-json-line",
        line: text,
      });
      return;
    }
    this._handleMessageObject(message);
  }

  _handleMessageObject(message) {
    this.emit("raw-message", message);

    if (
      Object.prototype.hasOwnProperty.call(message, "id") &&
      !Object.prototype.hasOwnProperty.call(message, "method")
    ) {
      const key = this._idKey(message.id);
      const pending = this.pendingRequests.get(key);
      if (!pending) return;
      this.pendingRequests.delete(key);
      clearTimeout(pending.timer);
      if (Object.prototype.hasOwnProperty.call(message, "error")) {
        const err = message.error || {};
        pending.reject(
          new Error(
            `RPC error (${err.code || "unknown"}): ${
              err.message || "Unknown error"
            }`
          )
        );
        return;
      }
      pending.resolve(message.result);
      return;
    }

    if (
      Object.prototype.hasOwnProperty.call(message, "method") &&
      Object.prototype.hasOwnProperty.call(message, "id")
    ) {
      const key = this._idKey(message.id);
      const request = {
        id: message.id,
        method: message.method,
        params: message.params || {},
        receivedAt: new Date().toISOString(),
      };
      this.pendingServerRequests.set(key, request);
      this.emit("server-request", request);
      return;
    }

    if (Object.prototype.hasOwnProperty.call(message, "method")) {
      const notification = {
        method: message.method,
        params: message.params || {},
      };
      this.emit("notification", notification);
    }
  }

  _canSend() {
    if (this.transport === "ws") {
      return Boolean(this.ws && this.ws.readyState === 1);
    }
    return Boolean(this.child && this.child.stdin && this.child.stdin.writable);
  }

  _send(payload) {
    const line = `${JSON.stringify(payload)}\n`;
    if (this.transport === "ws") {
      if (!this.ws || this.ws.readyState !== 1) {
        throw new Error("codex app-server websocket is not open");
      }
      this.ws.send(line);
      return;
    }
    if (!this.child || !this.child.stdin.writable) {
      throw new Error("codex app-server stdin is not writable");
    }
    this.child.stdin.write(line);
  }

  _handleStdioExit(child, code, signal) {
    if (this.child !== child) return;
    this.isConnected = false;
    this.isReady = false;
    this._rejectAllPending(
      new Error(`codex app-server exited (code=${code}, signal=${signal})`)
    );
    this.emit("disconnected", { code, signal });
    this.child = null;
    if (this.stdoutReader) {
      try {
        this.stdoutReader.close();
      } catch (_error) {
        // noop
      }
      this.stdoutReader = null;
    }
    if (!this.manualStop) {
      this._scheduleReconnect(
        new Error(
          `codex app-server disconnected (code=${code}, signal=${signal})`
        )
      );
    }
  }

  _rejectAllPending(error) {
    for (const [key, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pendingRequests.delete(key);
    }
  }

  _scheduleReconnect(error) {
    if (this.manualStop) return;
    this._clearReconnectTimer();

    const index = Math.min(
      this.reconnectAttempt,
      this.reconnectDelays.length - 1
    );
    const delay = this.reconnectDelays[index];
    this.reconnectAttempt += 1;
    this.emit("reconnecting", {
      attempt: this.reconnectAttempt,
      delay,
      error: error ? String(error.message || error) : null,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.manualStop) return;
      if (this.transport === "stdio") {
        if (this.child) return;
      } else {
        if (this._isWsActive()) return;
      }
      void this.start();
    }, delay);
  }

  _clearReconnectTimer() {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  _idKey(id) {
    return JSON.stringify(id);
  }

  _isWsActive() {
    if (!this.ws) return false;
    // CONNECTING=0, OPEN=1
    return this.ws.readyState === 0 || this.ws.readyState === 1;
  }

  async _startWsTransport() {
    if (!this.websocketUrl) {
      throw new Error("websocketUrl is required for ws transport");
    }

    if (this.spawnWebsocketServer && !this.spawnedChild) {
      await this._spawnWebsocketServerBestEffort();
    }
    this._connectWebSocket();
  }

  async _spawnWebsocketServerBestEffort() {
    if (this.spawnedChild) return;
    const candidates = this._candidateBins();

    const spawnCandidate = (index) =>
      new Promise((resolve) => {
        if (index >= candidates.length) {
          resolve(false);
          return;
        }

        const bin = candidates[index];
        const child = spawn(
          bin,
          ["app-server", "--listen", this.websocketUrl],
          {
            stdio: ["ignore", "ignore", "pipe"],
            shell: false,
            env: process.env,
          }
        );

        let spawnFailed = false;

        const onSpawnError = (error) => {
          spawnFailed = true;
          if (
            error &&
            error.code === "ENOENT" &&
            index + 1 < candidates.length
          ) {
            this.logger.warn(
              `[codex-rpc] binary not found: ${bin}, trying fallback`
            );
            resolve(spawnCandidate(index + 1));
            return;
          }
          this.emit("error", error);
          resolve(false);
        };

        child.once("error", onSpawnError);
        child.once("spawn", () => {
          if (spawnFailed) return;
          child.removeListener("error", onSpawnError);

          this.spawnedChild = child;
          child.stderr.on("data", (chunk) => {
            const text = chunk.toString("utf8");
            for (const rawLine of text.split(/\r?\n/)) {
              const line = rawLine.trim();
              if (!line) continue;
              this.emit("stderr", { line, pid: child.pid });
            }
          });
          child.on("exit", (code, signal) => {
            if (this.spawnedChild !== child) return;
            this.spawnedChild = null;
            if (!this.manualStop) {
              this._scheduleReconnect(
                new Error(
                  `codex app-server ws server exited (code=${code}, signal=${signal})`
                )
              );
            }
          });

          resolve(true);
        });
      });

    await spawnCandidate(0);
  }

  _connectWebSocket() {
    if (!this.websocketUrl) return;
    const ws = new WebSocket(this.websocketUrl, {
      perMessageDeflate: false,
      handshakeTimeout: 5000,
    });
    this.ws = ws;

    ws.on("open", () => {
      if (this.ws !== ws) return;
      this.isConnected = true;
      this.isReady = false;
      this.reconnectAttempt = 0;
      this.emit("connected", {
        transport: "ws",
        websocketUrl: this.websocketUrl,
        spawned: Boolean(this.spawnedChild),
        pid: this.spawnedChild ? this.spawnedChild.pid : null,
      });

      void (async () => {
        try {
          const initResult = await this._performInitializeHandshake();
          if (this.ws !== ws) return;
          this.emit("ready", initResult);
        } catch (error) {
          if (this.ws !== ws) return;
          this.emit("error", error);
          try {
            ws.close();
          } catch {
            // noop
          }
        }
      })();
    });

    ws.on("message", (data) => {
      if (this.ws !== ws) return;
      const text = safeToUtf8(data);
      if (!text) return;
      this._handleMessageText(text);
    });

    ws.on("error", (error) => {
      if (this.ws !== ws) return;
      this.emit("error", error);
      // Ensure we eventually get a close event to trigger reconnect scheduling.
      try {
        ws.terminate();
      } catch {
        // noop
      }
    });

    ws.on("close", (code, reason) => {
      if (this.ws !== ws) return;
      const codeNum = typeof code === "number" ? code : null;
      const reasonText = reason ? safeToUtf8(reason) : "";
      this.isConnected = false;
      this.isReady = false;
      this._rejectAllPending(
        new Error(
          `codex app-server websocket closed (code=${codeNum}, reason=${reasonText})`
        )
      );
      this.emit("disconnected", { code: codeNum, reason: reasonText });
      this.ws = null;
      if (!this.manualStop) {
        this._scheduleReconnect(
          new Error(
            `codex app-server websocket disconnected (code=${codeNum}, reason=${reasonText})`
          )
        );
      }
    });
  }

  async _terminateTransport() {
    if (this.transport === "ws") {
      await this._terminateWebSocket();
      await this._terminateSpawnedWebSocketServer();
      return;
    }
    await this._terminateStdioChild();
  }

  async _terminateWebSocket() {
    if (!this.ws) return;
    const ws = this.ws;
    this.ws = null;
    await new Promise((resolve) => {
      try {
        if (ws.readyState === WebSocket.CLOSED) {
          resolve();
          return;
        }
        const timer = setTimeout(() => {
          try {
            ws.terminate();
          } catch {
            // noop
          }
          resolve();
        }, 500);
        ws.once("close", () => {
          clearTimeout(timer);
          resolve();
        });
        ws.close();
      } catch (_error) {
        resolve();
      }
    });
  }

  async _terminateSpawnedWebSocketServer() {
    if (!this.spawnedChild) return;
    const child = this.spawnedChild;
    this.spawnedChild = null;
    if (!child.killed) {
      child.kill("SIGTERM");
    }
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
        resolve();
      }, 1500);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  async _terminateStdioChild() {
    if (!this.child) return;
    const child = this.child;
    this.child = null;
    this.isConnected = false;
    this.isReady = false;
    if (!child.killed) {
      child.kill("SIGTERM");
    }
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
        resolve();
      }, 1500);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

module.exports = {
  CodexAppServerClient,
};
