const http = require("http");
const { spawn } = require("child_process");
const readline = require("readline");
const WebSocket = require("ws");

const { safeToUtf8 } = require("./shared/encoding");
const {
  normalizeHost,
  normalizePort,
  normalizeBooleanFlag,
} = require("./shared/normalize");
const { jsonIdKey, safeJsonStringify } = require("./shared/json");
const { deepCloneJson } = require("./shared/clone");
const { extractThreadTurnIds, classifyTurnLifecycle } = require("./shared/codex-events");

const { OverlayManager } = require("./proxy/overlay-manager");

function serverReqKey(clientId, downId) {
  return `${String(clientId)}:${jsonIdKey(downId)}`;
}

function normalizeDesktopOverlayMode(value, fallback = "authoritative") {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "off") return "off";
  if (raw === "authoritative") return "authoritative";
  return fallback;
}

class CodexWsProxy {
  constructor(options = {}) {
    this.listenHost = normalizeHost(options.listenHost, "127.0.0.1");
    this.listenPort = normalizePort(options.listenPort, 18791);
    this.spawnUpstream = normalizeBooleanFlag(options.spawnUpstream, true);
    this.configuredBin =
      options.bin || "/Applications/Codex.app/Contents/Resources/codex";
    this.logger = options.logger || console;
    this.debug = normalizeBooleanFlag(
      options.debug,
      normalizeBooleanFlag(process.env.CODEX_WS_PROXY_DEBUG, false)
    );
    this.approvalClientName =
      String(options.approvalClientName || "codex-phone-bridge").trim() ||
      "codex-phone-bridge";
    this.desktopOverlayMode = normalizeDesktopOverlayMode(
      options.desktopOverlayMode,
      normalizeDesktopOverlayMode(process.env.PHONE_CODEX_DESKTOP_OVERLAY_MODE, "authoritative")
    );

    this.initializeParams =
      options.initializeParams ||
      {
        clientInfo: {
          name: "phone-codex-proxy",
          title: "phone-codex-proxy",
          version: "0.1.0",
        },
        capabilities: {
          experimentalApi: true,
        },
      };

    // Downstream WS server state
    this.server = null;
    this.wss = null;
    this.clients = new Map();
    this.nextClientId = 1;

    // Upstream stdio state
    this.upstreamChild = null;
    this.upstreamReader = null;
    this.upstreamReady = false;
    this.upstreamInitializeResult = null;
    this.nextUpstreamId = 1;
    this.pendingUpstream = new Map(); // upstreamId -> { clientId, downId, method, params, sourceName }
    this.pendingInternal = new Map(); // upstreamId -> { resolve, reject, timer, method }
    this.pendingServerRequests = new Map(); // clientId:downSrvId -> upstreamId

    // Bridge overlay state: allows the web UI to show "turn/start" input immediately even if the
    // upstream thread/read hasn't persisted it yet.
    this.overlay = new OverlayManager({
      approvalClientName: this.approvalClientName,
      debugLog: this._debugLog.bind(this),
    });

    // Track active desktop-visible turns for correction broadcasts.
    this.turnStartedBroadcastState = new Map(); // turnKey -> { threadId, turnId, hadUserMessage, inputSig, startedAt }

    // Track whether upstream already emitted a userMessage item for a given turn. We only
    // synthesize userMessage item notifications for web-originated turns when they are missing.
    this.userMessageItemSeenByTurn = new Map(); // turnKey -> seenAtMs
    this.userMessageEventSeenByTurn = new Map(); // turnKey -> seenAtMs

    this.manualStop = false;
    this.upstreamRestartTimer = null;

    // Periodic cleanup to avoid unbounded memory growth if upstream never emits started/completed.
    this.cleanupTimer = null;

    // Upstream stderr noise suppression + diagnostics.
    this.stderrRolloutWindowStart = 0;
    this.stderrRolloutSuppressed = 0;
    this.stderrUtf8WindowStart = 0;
    this.stderrUtf8Suppressed = 0;
    this.upstreamNonAsciiTurnMetadataErrorAt = null;
  }

  status() {
    const clientSummaries = [];
    let desktopClientCount = 0;
    let bridgeClientCount = 0;
    for (const client of this.clients.values()) {
      const role = this._clientRole(client);
      if (role === "desktop") desktopClientCount += 1;
      if (role === "bridge") bridgeClientCount += 1;
      clientSummaries.push({
        id: client.id,
        open: client.ws.readyState === WebSocket.OPEN,
        name: client.clientInfoName || null,
        role,
        initialized: client.initialized,
        lastActiveAt: client.lastActiveAt
          ? new Date(client.lastActiveAt).toISOString()
          : null,
      });
    }
    return {
      listen: `${this.listenHost}:${this.listenPort}`,
      spawnUpstream: this.spawnUpstream,
      debug: this.debug,
      desktopOverlayMode: this.desktopOverlayMode,
      upstreamPid: this.upstreamChild ? this.upstreamChild.pid : null,
      upstreamReady: this.upstreamReady,
      clientCount: this.clients.size,
      desktopClientCount,
      bridgeClientCount,
      clients: clientSummaries,
      pendingUpstream: this.pendingUpstream.size,
      pendingInternal: this.pendingInternal.size,
      pendingServerRequests: this.pendingServerRequests.size,
      overlay: this.overlay.status(),
      turnStartedBroadcasts: this.turnStartedBroadcastState.size,
      userMessageItemSeen: this.userMessageItemSeenByTurn.size,
      userMessageEventSeen: this.userMessageEventSeenByTurn.size,
      upstreamNonAsciiTurnMetadataErrorAt: this.upstreamNonAsciiTurnMetadataErrorAt,
    };
  }

  _debugLog(line) {
    if (!this.debug) return;
    try {
      this.logger.log(line);
    } catch {
      // noop
    }
  }

  _handleUpstreamStderrLine(rawLine) {
    const line = String(rawLine || "").trim();
    if (!line) return;

    const now = Date.now();

    // Suppress noisy rollout path errors (they are not actionable for phone-codex).
    if (line.includes("state db missing rollout path")) {
      const windowMs = 10_000;
      if (!this.stderrRolloutWindowStart || now - this.stderrRolloutWindowStart > windowMs) {
        if (this.stderrRolloutSuppressed > 0) {
          this.logger.warn(
            `[phone-codex-upstream] suppressed ${this.stderrRolloutSuppressed} similar rollout errors`
          );
        }
        this.stderrRolloutWindowStart = now;
        this.stderrRolloutSuppressed = 0;
        this.logger.warn(`[phone-codex-upstream] ${line}`);
      } else {
        this.stderrRolloutSuppressed += 1;
      }
      return;
    }

    // Highlight a known Codex upstream bug: non-ASCII workspace path in x-codex-turn-metadata.
    if (
      line.includes("x-codex-turn-metadata") &&
      line.toLowerCase().includes("utf-8 encoding error")
    ) {
      const windowMs = 10_000;
      if (!this.stderrUtf8WindowStart || now - this.stderrUtf8WindowStart > windowMs) {
        if (this.stderrUtf8Suppressed > 0) {
          this.logger.warn(
            `[phone-codex-upstream] suppressed ${this.stderrUtf8Suppressed} similar UTF-8 header errors`
          );
        }
        this.stderrUtf8WindowStart = now;
        this.stderrUtf8Suppressed = 0;
        this.upstreamNonAsciiTurnMetadataErrorAt = new Date(now).toISOString();
        this.logger.error(
          "[phone-codex-upstream] Failed to connect to ChatGPT (non-ASCII in x-codex-turn-metadata workspace path). " +
            "Workaround: move this repo to an ASCII-only path, then restart phone-codex sync."
        );
      } else {
        this.stderrUtf8Suppressed += 1;
      }
      return;
    }

    this.logger.warn(`[phone-codex-upstream] ${line}`);
  }

  async start() {
    this.manualStop = false;
    if (this.wss || this.server) return;

    if (this.spawnUpstream) {
      await this._ensureUpstreamReadyOrThrow();
    }

    await this._startDownstreamServer();
    this._ensureCleanupTimer();
  }

  async stop() {
    this.manualStop = true;
    if (this.upstreamRestartTimer) {
      clearTimeout(this.upstreamRestartTimer);
      this.upstreamRestartTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    await this._stopDownstreamServer();
    await this._terminateUpstream();
  }

  _candidateBins() {
    const list = [];
    if (this.configuredBin) list.push(this.configuredBin);
    if (!list.includes("codex")) list.push("codex");
    return list;
  }

  async _ensureUpstreamReadyOrThrow() {
    const ok = await this._spawnUpstreamBestEffort();
    if (!ok) {
      throw new Error("Failed to spawn upstream codex app-server");
    }

    // Perform initialize handshake for the single upstream connection.
    await this._performUpstreamHandshake();
  }

  async _spawnUpstreamBestEffort() {
    if (this.upstreamChild) return true;
    const candidates = this._candidateBins();

    const trySpawn = async (index) => {
      if (index >= candidates.length) return false;

      const bin = candidates[index];
      const child = spawn(bin, ["app-server"], {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        env: process.env,
      });

      const spawned = await new Promise((resolve) => {
        let done = false;
        const finish = (result) => {
          if (done) return;
          done = true;
          resolve(result);
        };

        child.once("error", (error) => {
          if (error && error.code === "ENOENT") {
            finish(false);
            return;
          }
          this.logger.error(
            `[phone-codex-proxy] upstream spawn error: ${String(
              error && error.message ? error.message : error
            )}`
          );
          finish(false);
        });

        child.once("spawn", () => finish(true));
      });

      if (!spawned) {
        try {
          child.kill("SIGKILL");
        } catch {
          // noop
        }
        if (index + 1 < candidates.length) {
          this.logger.warn(
            `[phone-codex-proxy] codex binary not found: ${bin}, trying fallback`
          );
          return trySpawn(index + 1);
        }
        return false;
      }

      this.upstreamChild = child;
      this.upstreamReady = false;
      this.upstreamInitializeResult = null;

      this.upstreamReader = readline.createInterface({
        input: child.stdout,
        crlfDelay: Infinity,
      });
      this.upstreamReader.on("line", (line) => {
        this._handleUpstreamLine(line);
      });

      child.stderr.on("data", (chunk) => {
        const text = chunk.toString("utf8");
        for (const rawLine of text.split(/\r?\n/)) {
          this._handleUpstreamStderrLine(rawLine);
        }
      });

      child.on("exit", (code, signal) => {
        if (this.upstreamChild !== child) return;
        this.logger.warn(
          `[phone-codex-proxy] upstream exited (code=${code}, signal=${signal})`
        );
        this.upstreamChild = null;
        this.upstreamReady = false;
        this.upstreamInitializeResult = null;
        if (this.upstreamReader) {
          try {
            this.upstreamReader.close();
          } catch {
            // noop
          }
          this.upstreamReader = null;
        }

        this._rejectAllPendingUpstream(
          new Error(
            `Upstream codex app-server exited (code=${code}, signal=${signal})`
          )
        );

        // Force downstream reconnect to avoid divergent state.
        this._closeAllDownstream(1011, "upstream restarted");

        if (!this.manualStop) {
          this._scheduleUpstreamRestart();
        }
      });

      return true;
    };

    return trySpawn(0);
  }

  _scheduleUpstreamRestart() {
    if (this.manualStop) return;
    if (this.upstreamRestartTimer) return;
    this.upstreamRestartTimer = setTimeout(() => {
      this.upstreamRestartTimer = null;
      if (this.manualStop) return;
      void this._restartUpstream().catch((error) => {
        this.logger.error(
          `[phone-codex-proxy] upstream restart failed: ${String(
            error && error.message ? error.message : error
          )}`
        );
        this._scheduleUpstreamRestart();
      });
    }, 1000);
  }

  async _restartUpstream() {
    await this._terminateUpstream();
    if (!this.spawnUpstream) return;
    await this._ensureUpstreamReadyOrThrow();
  }

  _rejectAllPendingUpstream(error) {
    for (const [key, pending] of this.pendingUpstream.entries()) {
      this.pendingUpstream.delete(key);
    }
    for (const [key, pending] of this.pendingInternal.entries()) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pendingInternal.delete(key);
    }
    this.pendingServerRequests.clear();
  }

  async _terminateUpstream() {
    if (!this.upstreamChild) return;
    const child = this.upstreamChild;
    this.upstreamChild = null;
    this.upstreamReady = false;
    this.upstreamInitializeResult = null;

    if (this.upstreamReader) {
      try {
        this.upstreamReader.close();
      } catch {
        // noop
      }
      this.upstreamReader = null;
    }

    if (!child.killed) {
      try {
        child.kill("SIGTERM");
      } catch {
        // noop
      }
    }

    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        try {
          if (!child.killed) child.kill("SIGKILL");
        } catch {
          // noop
        }
        resolve();
      }, 1500);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  async _performUpstreamHandshake() {
    const result = await this._upstreamRequest("initialize", this.initializeParams, {
      timeoutMs: 15000,
    });
    this._upstreamNotify("initialized", {});
    this.upstreamReady = true;
    this.upstreamInitializeResult = result;
    this.logger.log("[phone-codex-proxy] upstream ready");
  }

  _nextUpstreamRequestId() {
    const id = this.nextUpstreamId++;
    return id;
  }

  _upstreamCanSend() {
    return Boolean(
      this.upstreamChild &&
        this.upstreamChild.stdin &&
        this.upstreamChild.stdin.writable
    );
  }

  _upstreamSend(obj) {
    if (!this._upstreamCanSend()) {
      throw new Error("Upstream codex app-server is not writable");
    }
    this.upstreamChild.stdin.write(`${JSON.stringify(obj)}\n`);
  }

  _upstreamNotify(method, params) {
    this._upstreamSend({ method, params });
  }

  _upstreamRequest(method, params, options = {}) {
    const timeoutMs = Number(options.timeoutMs || 30000);
    const id = this._nextUpstreamRequestId();
    const key = jsonIdKey(id);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingInternal.delete(key);
        reject(new Error(`Upstream request timeout: ${method}`));
      }, timeoutMs);
      this.pendingInternal.set(key, { resolve, reject, timer, method });
      try {
        this._upstreamSend({ id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pendingInternal.delete(key);
        reject(error);
      }
    });
  }

  _handleUpstreamLine(line) {
    const text = String(line || "").trim();
    if (!text) return;
    let msg = null;
    try {
      msg = JSON.parse(text);
    } catch (error) {
      this.logger.warn(
        `[phone-codex-proxy] upstream non-json line: ${text.slice(0, 200)}`
      );
      return;
    }

    // Response (id + result/error)
    if (
      Object.prototype.hasOwnProperty.call(msg, "id") &&
      !Object.prototype.hasOwnProperty.call(msg, "method")
    ) {
      const key = jsonIdKey(msg.id);
      const internal = this.pendingInternal.get(key);
      if (internal) {
        this.pendingInternal.delete(key);
        clearTimeout(internal.timer);
        if (Object.prototype.hasOwnProperty.call(msg, "error")) {
          internal.reject(
            new Error(
              `Upstream RPC error (${msg.error && msg.error.code ? msg.error.code : "unknown"}): ${
                msg.error && msg.error.message ? msg.error.message : "Unknown error"
              }`
            )
          );
          return;
        }
        internal.resolve(msg.result);
        return;
      }

      const pending = this.pendingUpstream.get(key);
      if (!pending) return;
      this.pendingUpstream.delete(key);

      const client = this.clients.get(String(pending.clientId));
      if (!client || client.ws.readyState !== WebSocket.OPEN) return;
      const payload = { id: pending.downId };
      if (Object.prototype.hasOwnProperty.call(msg, "error")) {
        const method = String(pending.method || "");
        if (method === "turn/start") {
          this.overlay.dropPendingTurnStart(key);
        }
        payload.error = msg.error;
      } else {
        const result = msg.result;
        const method = String(pending.method || "");
        if (method === "turn/start") {
          let startMaterialization = null;
          try {
            startMaterialization = this.overlay.materializeFromTurnStartResponse(key, result);
            if (startMaterialization && startMaterialization.matched) {
              this._debugLog(
                `[phone-codex-proxy] overlay response materialized thread=${String(
                  startMaterialization.threadId
                )} turn=${String(startMaterialization.turnId)} upKey=${String(
                  startMaterialization.upKey || ""
                )} changed=${Boolean(startMaterialization.changed)} overwritten=${Boolean(
                  startMaterialization.overwritten
                )}`
              );
            }
          } catch (error) {
            this.logger.warn(
              `[phone-codex-proxy] overlay materialize failed for turn/start response: ${String(
                error && error.message ? error.message : error
              )}`
            );
          }
        } else if (method === "thread/read") {
          const sourceName = String(pending.sourceName || "");
          const isBridge = sourceName === this.approvalClientName;
          const allowOverlay = isBridge || this.desktopOverlayMode !== "off";
          const requireAuthoritative = !isBridge && this.desktopOverlayMode === "authoritative";

          if (allowOverlay) {
            const params = pending.params || {};
            const threadId =
              String(params.threadId || params.thread_id || "") ||
              String(params.thread && params.thread.id ? params.thread.id : "");
            try {
              this.overlay.injectIntoThreadRead(threadId, result, { requireAuthoritative });
              this._debugLog(
                `[phone-codex-proxy] overlay inject thread/read client=${JSON.stringify(
                  sourceName
                )} requireAuthoritative=${String(requireAuthoritative)} thread=${JSON.stringify(
                  threadId
                )}`
              );
            } catch (error) {
              this.logger.warn(
                `[phone-codex-proxy] failed to inject ephemeral turns for thread/read: ${String(
                  error && error.message ? error.message : error
                )}`
              );
            }
          }
        } else if (method === "thread/resume") {
          const sourceName = String(pending.sourceName || "");
          const isBridge = sourceName === this.approvalClientName;
          const allowOverlay = isBridge || this.desktopOverlayMode !== "off";
          const requireAuthoritative = !isBridge && this.desktopOverlayMode === "authoritative";

          if (allowOverlay) {
            const params = pending.params || {};
            const threadId =
              String(params.threadId || params.thread_id || params.id || "") ||
              String(params.thread && params.thread.id ? params.thread.id : "") ||
              String(result && result.thread && result.thread.id ? result.thread.id : "");
            try {
              this.overlay.injectIntoThreadRead(threadId, result, { requireAuthoritative });
              this._debugLog(
                `[phone-codex-proxy] overlay inject thread/resume client=${JSON.stringify(
                  sourceName
                )} requireAuthoritative=${String(requireAuthoritative)} thread=${JSON.stringify(
                  threadId
                )}`
              );
            } catch (error) {
              this.logger.warn(
                `[phone-codex-proxy] failed to inject ephemeral turns for thread/resume: ${String(
                  error && error.message ? error.message : error
                )}`
              );
            }
          }
        } else if (method === "thread/list") {
          const sourceName = String(pending.sourceName || "");
          const isBridge = sourceName === this.approvalClientName;
          const allowOverlay = isBridge || this.desktopOverlayMode !== "off";
          const requireAuthoritative = !isBridge && this.desktopOverlayMode === "authoritative";

          if (allowOverlay) {
            try {
              this.overlay.injectIntoThreadList(result, { requireAuthoritative });
              this._debugLog(
                `[phone-codex-proxy] overlay inject thread/list client=${JSON.stringify(
                  sourceName
                )} requireAuthoritative=${String(requireAuthoritative)}`
              );
            } catch (error) {
              this.logger.warn(
                `[phone-codex-proxy] failed to inject ephemeral preview for thread/list: ${String(
                  error && error.message ? error.message : error
                )}`
              );
            }
          }
        } else if (method === "turn/read") {
          const sourceName = String(pending.sourceName || "");
          const isBridge = sourceName === this.approvalClientName;
          const allowOverlay = isBridge || this.desktopOverlayMode !== "off";
          const requireAuthoritative = !isBridge && this.desktopOverlayMode === "authoritative";

          if (allowOverlay) {
            try {
              this.overlay.injectIntoTurnRead(result, { requireAuthoritative });
              this._debugLog(
                `[phone-codex-proxy] overlay inject turn/read client=${JSON.stringify(
                  sourceName
                )} requireAuthoritative=${String(requireAuthoritative)}`
              );
            } catch (error) {
              this.logger.warn(
                `[phone-codex-proxy] failed to inject ephemeral userMessage for turn/read: ${String(
                  error && error.message ? error.message : error
                )}`
              );
            }
          }
        }
        payload.result = result;
      }
      this._sendDownstreamMessage(client, payload);
      return;
    }

    // Server request (method + id): route to one downstream client.
    if (
      Object.prototype.hasOwnProperty.call(msg, "method") &&
      Object.prototype.hasOwnProperty.call(msg, "id")
    ) {
      const target = this._chooseServerRequestClient(String(msg.method || ""));
      if (!target) {
        // Avoid hanging upstream: reject.
        try {
          this._upstreamSend({
            id: msg.id,
            error: { code: -32000, message: "No downstream client available" },
          });
        } catch {
          // noop
        }
        return;
      }

      this.logger.log(
        `[phone-codex-proxy] upstream server-request ${String(
          msg.method
        )} -> downstream id=${target.id} name=${JSON.stringify(
          target.clientInfoName || ""
        )} ua=${JSON.stringify(target.userAgent || "")}`
      );

      const downSrvId = `srv:${target.id}:${target.nextServerReqSeq++}`;
      this.pendingServerRequests.set(serverReqKey(target.id, downSrvId), msg.id);
      this._sendDownstreamMessage(target, {
        id: downSrvId,
        method: msg.method,
        params: msg.params || {},
      });
      return;
    }

    // Notification (method only): broadcast to all downstream clients.
    if (Object.prototype.hasOwnProperty.call(msg, "method")) {
      const method = String(msg.method || "");
      const params = msg.params || {};
      this._maybeAlignUserMessageItemNotification(msg);
      this._maybeAlignUserMessageTextNotification(msg);
      this._maybeMarkUserMessageItemSeen(method, params);
      let pendingDesktopTurnCorrection = null;

      const lifecycle = classifyTurnLifecycle(method, params);
      if (lifecycle) {
        const ids = extractThreadTurnIds(method, params);
        const threadId = String(ids.threadId || "");
        const turnId = String(ids.turnId || "");

        if (threadId && turnId) {
          if (lifecycle === "turnStarted") {
            try {
              const nextTurnObj = (() => {
                const rootParams =
                  msg && msg.params && typeof msg.params === "object" ? msg.params : params;
                if (rootParams.turn && typeof rootParams.turn === "object") return rootParams.turn;
                if (
                  rootParams.msg &&
                  typeof rootParams.msg === "object" &&
                  rootParams.msg.turn &&
                  typeof rootParams.msg.turn === "object"
                ) {
                  return rootParams.msg.turn;
                }
                if (params.turn && typeof params.turn === "object") return params.turn;
                if (
                  params.msg &&
                  typeof params.msg === "object" &&
                  params.msg.turn &&
                  typeof params.msg.turn === "object"
                ) {
                  return params.msg.turn;
                }
                return null;
              })();

              const hadUserMessage = this._turnStartedHasUserMessage(nextTurnObj);
              const userInput = this._extractTurnUserMessageInputFromTurn(nextTurnObj);
              if (!hadUserMessage) {
                const rec = this.overlay.getTurnRecord(threadId, turnId);
                if (
                  rec &&
                  rec.authoritative &&
                  Array.isArray(rec.input) &&
                  rec.input.length > 0
                ) {
                  pendingDesktopTurnCorrection = {
                    method,
                    threadId,
                    turnId,
                    input: deepCloneJson(rec.input),
                    status:
                      (nextTurnObj && nextTurnObj.status) ||
                      (rec && rec.status ? rec.status : "inProgress"),
                  };
                }
              }

              this._trackTurnStartedState({
                method,
                threadId,
                turnId,
                hadUserMessage,
                userInput,
                corrected: false,
                correctedByQueue: false,
              });
            } catch (error) {
              this.logger.warn(
                `[phone-codex-proxy] overlay tracking/augment failed for turn started: ${String(
                  error && error.message ? error.message : error
                )}`
              );
            }
          } else {
            const status = lifecycle === "turnCompleted" ? "completed" : "interrupted";
            this.overlay.markTurnStatus(threadId, turnId, status);
            const turnKey = this._turnStateKey(threadId, turnId);
            this.turnStartedBroadcastState.delete(turnKey);
            this.userMessageItemSeenByTurn.delete(turnKey);
            this.userMessageEventSeenByTurn.delete(turnKey);
          }
        }
      }

      this._broadcastDownstream(msg);
      if (
        pendingDesktopTurnCorrection &&
        pendingDesktopTurnCorrection.threadId &&
        pendingDesktopTurnCorrection.turnId
      ) {
        try {
          const corrected = this._emitDesktopAuthoritativeCorrection(
            pendingDesktopTurnCorrection.threadId,
            pendingDesktopTurnCorrection.turnId,
            pendingDesktopTurnCorrection.input,
            pendingDesktopTurnCorrection.status,
            { sendTurnStarted: false }
          );
          if (corrected) {
            this._trackTurnStartedState({
              method: pendingDesktopTurnCorrection.method,
              threadId: pendingDesktopTurnCorrection.threadId,
              turnId: pendingDesktopTurnCorrection.turnId,
              hadUserMessage: true,
              userInput: pendingDesktopTurnCorrection.input,
              corrected: true,
              correctedByQueue: false,
            });
          }
        } catch (error) {
          this.logger.warn(
            `[phone-codex-proxy] desktop correction failed: ${String(
              error && error.message ? error.message : error
            )}`
          );
        }
      }
    }
  }

  _ensureCleanupTimer() {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      try {
        this.overlay.cleanup();
        this._cleanupTurnStartedBroadcastState();
      } catch (error) {
        this.logger.warn(
          `[phone-codex-proxy] cleanup failed: ${String(
            error && error.message ? error.message : error
          )}`
        );
      }
    }, 30_000);
  }

  _chooseServerRequestClient(method) {
    const normalizedMethod = String(method || "");
    const isApprovalRequest =
      normalizedMethod === "item/commandExecution/requestApproval" ||
      normalizedMethod === "item/fileChange/requestApproval" ||
      normalizedMethod.endsWith("/requestApproval");

    let bridge = null;
    let bestAny = null;
    let bestNonBridge = null;
    let codexUi = null;
    for (const client of this.clients.values()) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;
      if (client.clientInfoName === this.approvalClientName) {
        if (!bridge) bridge = client;
        continue;
      }
      // Prefer a Codex UI-like client (Electron UA) for non-approval server requests.
      const ua = String(client.userAgent || "");
      if (!codexUi && /Codex/i.test(ua)) {
        codexUi = client;
      }
      if (
        !bestNonBridge ||
        (client.lastActiveAt || 0) > (bestNonBridge.lastActiveAt || 0)
      ) {
        bestNonBridge = client;
      }
    }
    for (const client of this.clients.values()) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;
      if (!bestAny || (client.lastActiveAt || 0) > (bestAny.lastActiveAt || 0)) {
        bestAny = client;
      }
    }

    if (isApprovalRequest) return bridge || codexUi || bestNonBridge || bestAny;
    return codexUi || bestNonBridge || bridge || bestAny;
  }

  async _startDownstreamServer() {
    if (this.wss || this.server) return;
    this.server = http.createServer();
    this.server.on("connection", (socket) => {
      try {
        const peer = socket
          ? `${socket.remoteAddress}:${socket.remotePort}`
          : "unknown";
        this.logger.log(`[phone-codex-proxy] tcp connection peer=${peer}`);
      } catch {
        // noop
      }
    });
    this.server.on("clientError", (err, socket) => {
      try {
        const peer = socket
          ? `${socket.remoteAddress}:${socket.remotePort}`
          : "unknown";
        this.logger.warn(
          `[phone-codex-proxy] http clientError peer=${peer} error=${String(
            err && err.message ? err.message : err
          )}`
        );
      } catch {
        // noop
      }
    });
    // Log upgrade attempts to diagnose Codex WS handshake failures (e.g. 1006).
    // This runs even if the websocket handshake does not complete.
    this.server.on("upgrade", (req) => {
      try {
        const peer =
          req && req.socket
            ? `${req.socket.remoteAddress}:${req.socket.remotePort}`
            : "unknown";
        const ua = String(req.headers["user-agent"] || "");
        const proto = String(req.headers["sec-websocket-protocol"] || "");
        const ext = String(req.headers["sec-websocket-extensions"] || "");
        this.logger.log(
          `[phone-codex-proxy] upgrade peer=${peer} url=${String(
            req.url || ""
          )} ua=${JSON.stringify(ua)} proto=${JSON.stringify(
            proto
          )} ext=${JSON.stringify(ext)}`
        );
      } catch {
        // noop
      }
    });
    this.wss = new WebSocket.WebSocketServer({
      server: this.server,
      perMessageDeflate: true,
    });
    this.wss.on("headers", (headers, req) => {
      try {
        const headerLine = headers.find((h) =>
          String(h).toLowerCase().startsWith("sec-websocket-protocol:")
        );
        const selectedProtocol = headerLine
          ? String(headerLine).split(":").slice(1).join(":").trim()
          : "";
        this.logger.log(
          `[phone-codex-proxy] handshake selectedProtocol=${JSON.stringify(
            selectedProtocol
          )} url=${String(req && req.url ? req.url : "")}`
        );
      } catch {
        // noop
      }
    });

    this.wss.on("connection", (ws, req) => {
      const clientId = String(this.nextClientId++);
      const peer =
        (req && req.socket
          ? `${req.socket.remoteAddress}:${req.socket.remotePort}`
          : "") || "unknown";
      const ua = req ? String(req.headers["user-agent"] || "") : "";
      const reqProto = req ? String(req.headers["sec-websocket-protocol"] || "") : "";
      const reqExt = req ? String(req.headers["sec-websocket-extensions"] || "") : "";
      const url = req ? String(req.url || "") : "";
      const client = {
        id: clientId,
        ws,
        peer,
        userAgent: ua,
        reqProtocol: reqProto,
        reqExtensions: reqExt,
        url,
        initialized: false,
        clientInfoName: "",
        lastActiveAt: Date.now(),
        nextServerReqSeq: 1,
      };
      this.clients.set(clientId, client);
      this.logger.log(
        `[phone-codex-proxy] downstream connected (${peer}) ua=${JSON.stringify(
          ua
        )} reqProto=${JSON.stringify(reqProto)} reqExt=${JSON.stringify(
          reqExt
        )} selectedProto=${JSON.stringify(ws.protocol || "")} url=${JSON.stringify(
          url
        )}`
      );

      ws.on("message", (data) => {
        client.lastActiveAt = Date.now();
        const text = safeToUtf8(data);
        if (!text) return;
        this._handleDownstreamText(client, text);
      });

      ws.on("error", (error) => {
        this.logger.warn(
          `[phone-codex-proxy] downstream error: ${String(
            error && error.message ? error.message : error
          )}`
        );
      });

      ws.on("close", (code, reason) => {
        this.logger.log(
          `[phone-codex-proxy] downstream closed (id=${clientId}, code=${code}, reason=${safeToUtf8(
            reason
          )})`
        );
        this.clients.delete(clientId);
        // Clean pending server requests for this client.
        for (const key of this.pendingServerRequests.keys()) {
          if (key.startsWith(`${clientId}:`)) {
            this.pendingServerRequests.delete(key);
          }
        }
      });
    });

    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.listenPort, this.listenHost, () => {
        this.server.removeListener("error", reject);
        this.logger.log(
          `[phone-codex-proxy] listening on ws://${this.listenHost}:${this.listenPort}`
        );
        resolve();
      });
    });
  }

  async _stopDownstreamServer() {
    const wss = this.wss;
    const server = this.server;
    this.wss = null;
    this.server = null;

    this._closeAllDownstream(1001, "proxy stopped");

    if (wss) {
      await new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        const timer = setTimeout(finish, 800);
        try {
          wss.close(() => {
            clearTimeout(timer);
            finish();
          });
        } catch {
          clearTimeout(timer);
          finish();
        }
      });
    }

    if (server) {
      await new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        const timer = setTimeout(finish, 800);
        try {
          server.close(() => {
            clearTimeout(timer);
            finish();
          });
        } catch {
          clearTimeout(timer);
          finish();
        }
      });
    }
  }

  _closeAllDownstream(code, reason) {
    for (const client of this.clients.values()) {
      try {
        client.ws.close(code, reason);
      } catch {
        // noop
      }
    }
    this.clients.clear();
    this.pendingUpstream.clear();
    this.pendingServerRequests.clear();
  }

  _sendDownstreamMessage(client, obj) {
    if (!client || client.ws.readyState !== WebSocket.OPEN) return;
    try {
      client.ws.send(`${JSON.stringify(obj)}\n`);
    } catch {
      // noop
    }
  }

  _broadcastDownstream(obj) {
    for (const client of this.clients.values()) {
      this._sendDownstreamMessage(client, obj);
    }
  }

  _clientRole(client) {
    if (!client || typeof client !== "object") return "other";
    const name = String(client.clientInfoName || "").trim();
    if (name === this.approvalClientName) return "bridge";
    if (name === "phone-codex-preflight") return "preflight";
    if (this._isCodexDesktopClient(client)) return "desktop";
    return "other";
  }

  _isCodexDesktopClient(client) {
    if (!client || typeof client !== "object") return false;
    const name = String(client.clientInfoName || "").toLowerCase();
    const ua = String(client.userAgent || "").toLowerCase();
    if (!name && !ua) return false;
    // Avoid treating the web bridge as a "desktop" target.
    if (String(client.clientInfoName || "") === this.approvalClientName) return false;
    return name.includes("codex") || ua.includes("codex");
  }

  _sendToDesktopClients(obj) {
    if (this.desktopOverlayMode === "off") return;
    for (const client of this.clients.values()) {
      if (!this._isCodexDesktopClient(client)) continue;
      this._sendDownstreamMessage(client, obj);
    }
  }

  _isTurnStartedMethod(method) {
    const m = String(method || "");
    return m === "turn/started" || m === "task/started" || m === "task_started";
  }

  _turnStateKey(threadId, turnId) {
    return `${String(threadId)}::${String(turnId)}`;
  }

  _isTurnCompletedMethod(method) {
    const m = String(method || "");
    return (
      m === "turn/completed" ||
      m === "task/completed" ||
      m === "task_complete" ||
      m === "taskCompleted"
    );
  }

  _isTurnInterruptedMethod(method) {
    const m = String(method || "");
    return (
      m === "turn/interrupted" ||
      m === "task/interrupted" ||
      m === "task_interrupted" ||
      m === "taskInterrupted"
    );
  }

  _turnStartedHasUserMessage(turnObj) {
    const content = this._extractTurnUserMessageInputFromTurn(turnObj);
    return Array.isArray(content) && content.length > 0;
  }

  _extractTurnUserMessageInputFromTurn(turnObj) {
    const turn = turnObj && typeof turnObj === "object" ? turnObj : null;
    const items = turn && Array.isArray(turn.items) ? turn.items : null;
    if (!items) return null;
    const userItem = items.find(
      (item) =>
        item &&
        typeof item === "object" &&
        (String(item.type || "") === "userMessage" || String(item.type || "") === "user_message")
    );
    if (!userItem) return null;
    const content = userItem.content;
    return Array.isArray(content) ? content : null;
  }

  _extractPlainTextFromUserInputBlocks(userInput) {
    const blocks = Array.isArray(userInput) ? userInput : [];
    const parts = [];
    for (const block of blocks) {
      if (!block || typeof block !== "object") continue;
      const type = String(block.type || "").toLowerCase();
      if (type !== "text" && type !== "input_text") continue;
      const text =
        typeof block.text === "string" ? block.text : String(block.text || "");
      if (!text.trim()) continue;
      parts.push(text);
    }
    return parts.join("\n").trim();
  }

  _turnInputSignature(input) {
    return safeJsonStringify(Array.isArray(input) ? input : []);
  }

  _maybeMarkUserMessageItemSeen(method, params) {
    const m = String(method || "");
    if (!m) return;
    // Fast path: only item lifecycle events can carry a userMessage item we care about.
    if (m !== "item/started" && m !== "item/completed" && !m.startsWith("codex/event/")) {
      return;
    }
    const p = params && typeof params === "object" ? params : {};
    const item =
      (p.item && typeof p.item === "object" ? p.item : null) ||
      (p.msg && typeof p.msg === "object" && p.msg.item && typeof p.msg.item === "object"
        ? p.msg.item
        : null);
    if (!item || typeof item !== "object") return;
    const type = String(item.type || "");
    if (type !== "userMessage" && type !== "user_message") return;

    const ids = extractThreadTurnIds(m, p);
    const threadId = String(ids.threadId || "");
    const turnId = String(ids.turnId || "");
    if (!threadId || !turnId) return;

    const turnKey = this._turnStateKey(threadId, turnId);
    if (!this.userMessageItemSeenByTurn.has(turnKey)) {
      this.userMessageItemSeenByTurn.set(turnKey, Date.now());
    }
  }

  _resolveNotificationThreadTurn(method, params) {
    const ids = extractThreadTurnIds(method, params);
    const p = params && typeof params === "object" ? params : {};
    const msg = p.msg && typeof p.msg === "object" ? p.msg : null;
    const threadId = String(
      ids.threadId || p.threadId || p.thread_id || p.conversationId || (msg && msg.thread_id) || ""
    );
    const turnId = String(
      ids.turnId ||
        p.turnId ||
        p.turn_id ||
        p.id ||
        (p.turn && p.turn.id ? p.turn.id : "") ||
        (msg && (msg.turn_id || msg.turnId)) ||
        ""
    );
    return { threadId, turnId };
  }

  _maybeAlignUserMessageItemNotification(msg) {
    if (!msg || typeof msg !== "object") return false;
    const method = String(msg.method || "");
    if (
      method !== "item/started" &&
      method !== "item/completed" &&
      method !== "codex/event/item_started" &&
      method !== "codex/event/item_completed"
    ) {
      return false;
    }
    const params = msg.params && typeof msg.params === "object" ? msg.params : null;
    if (!params) return false;

    const { threadId, turnId } = this._resolveNotificationThreadTurn(method, params);
    if (!threadId || !turnId) return false;
    const rec = this.overlay.getTurnRecord(threadId, turnId);
    if (!rec || !rec.authoritative) return false;
    const expectedContent = Array.isArray(rec.input) ? deepCloneJson(rec.input) : [];
    if (expectedContent.length === 0) return false;

    const item =
      (params.item && typeof params.item === "object" ? params.item : null) ||
      (params.msg &&
      typeof params.msg === "object" &&
      params.msg.item &&
      typeof params.msg.item === "object"
        ? params.msg.item
        : null);
    if (!item) return false;
    const itemType = String(item.type || "").toLowerCase();
    if (itemType !== "usermessage" && itemType !== "user_message") return false;

    const currentSig = this._turnInputSignature(item.content);
    const expectedSig = this._turnInputSignature(expectedContent);
    const changed = currentSig !== expectedSig;
    if (changed) {
      const next = deepCloneJson(expectedContent);
      item.content = next;
      if (params.item && typeof params.item === "object") {
        params.item.content = deepCloneJson(expectedContent);
      }
      if (params.msg && typeof params.msg === "object" && params.msg.item) {
        params.msg.item.content = deepCloneJson(expectedContent);
      }
    }

    if (changed) {
      this._debugLog(
        `[phone-codex-proxy] aligned userMessage item notification method=${method} thread=${threadId} turn=${turnId}`
      );
    }
    return changed;
  }

  _maybeAlignUserMessageTextNotification(msg) {
    if (!msg || typeof msg !== "object") return false;
    const method = String(msg.method || "");
    if (method !== "codex/event/user_message") return false;
    const params = msg.params && typeof msg.params === "object" ? msg.params : null;
    if (!params) return false;

    const { threadId, turnId } = this._resolveNotificationThreadTurn(method, params);
    if (!threadId || !turnId) return false;
    const rec = this.overlay.getTurnRecord(threadId, turnId);
    if (!rec || !rec.authoritative) return false;
    const nextMessage = this._extractPlainTextFromUserInputBlocks(rec.input);
    if (!nextMessage) return false;

    const msgObj = params.msg && typeof params.msg === "object" ? params.msg : null;
    if (!msgObj) return false;
    const prevMessage =
      typeof msgObj.message === "string" ? msgObj.message : String(msgObj.message || "");
    if (prevMessage === nextMessage) return false;
    msgObj.message = nextMessage;
    this._debugLog(
      `[phone-codex-proxy] aligned user_message notification thread=${threadId} turn=${turnId}`
    );
    return true;
  }

  _augmentTurnStartedNotification(msg, threadId, turnId, record) {
    if (!msg || !msg.params || typeof msg.params !== "object") return false;
    const params = msg.params;
    const isCodexEvent = String(msg.method || "").startsWith("codex/event/");
    const turn = (() => {
      if (isCodexEvent) {
        const legacyMsg =
          (params.msg && typeof params.msg === "object" && params.msg) || {};
        params.msg = legacyMsg;
        legacyMsg.thread_id = legacyMsg.thread_id || threadId;
        legacyMsg.turn_id = legacyMsg.turn_id || turnId;
        const nextTurn =
          (legacyMsg.turn && typeof legacyMsg.turn === "object" && legacyMsg.turn) || {};
        legacyMsg.turn = nextTurn;
        if (!legacyMsg.item_id) {
          legacyMsg.item_id = `overlay-user-${String(turnId)}`;
        }
        return nextTurn;
      }
      const normalizedTurn = (params.turn && typeof params.turn === "object" && params.turn) || {};
      params.turn = normalizedTurn;
      params.threadId = params.threadId || threadId;
      params.turnId = params.turnId || turnId;
      return normalizedTurn;
    })();

    if (!Array.isArray(turn.items)) {
      turn.items = [];
    }

    const replacement = Array.isArray(record && record.input)
      ? deepCloneJson(record.input)
      : null;
    if (!Array.isArray(replacement) || replacement.length === 0) return false;
    const existing = turn.items.findIndex(
      (item) =>
        item &&
        typeof item === "object" &&
        (String(item.type || "") === "userMessage" || String(item.type || "") === "user_message")
    );
    const nextContent = deepCloneJson(replacement);
    const nextItem = {
      type: "userMessage",
      id: `overlay-user-${String(turnId)}`,
      content: nextContent,
    };

    if (isCodexEvent && params.msg && typeof params.msg === "object") {
      params.msg.item = deepCloneJson(nextItem);
      params.msg.item_id = nextItem.id;
    }

    if (existing >= 0) {
      const current = turn.items[existing];
      const currentContent = this._extractTurnUserMessageInputFromTurn(turn);
      if (this._turnInputSignature(currentContent) === this._turnInputSignature(nextContent)) {
        return false;
      }
      turn.items[existing] = {
        type: "userMessage",
        id: current && current.id ? current.id : `overlay-user-${String(turnId)}`,
        content: nextContent,
      };
      return true;
    }
    turn.items.unshift(nextItem);
    return true;
  }

  _trackTurnStartedState({
    method,
    threadId,
    turnId,
    hadUserMessage,
    userInput,
    corrected,
    correctedByQueue,
  }) {
    const payloadSig = this._turnInputSignature(userInput);
    const stateKey = this._turnStateKey(threadId, turnId);
    const current = this.turnStartedBroadcastState.get(stateKey) || {};
    if (method) {
      const next = String(method);
      const prev = current && current.method ? String(current.method) : "";
      const nextIsCodexEvent = next.startsWith("codex/event/");
      const prevIsCodexEvent = prev.startsWith("codex/event/");
      // Prefer keeping a normalized method once observed; codex/event variants can arrive after
      // the normalized "turn/started" and would otherwise suppress correction logic.
      if (!prev) current.method = next;
      else if (prevIsCodexEvent && !nextIsCodexEvent) current.method = next;
    }
    current.threadId = threadId;
    current.turnId = turnId;
    current.startedAt = Date.now();
    const nextHadUser = Boolean(hadUserMessage);
    current.hadUserMessage = Boolean(current.hadUserMessage) || nextHadUser;
    if (payloadSig) {
      current.inputSig = payloadSig;
    } else if (!current.inputSig) {
      current.inputSig = null;
    }
    current.corrected = Boolean(current.corrected) || Boolean(corrected);
    current.correctedByQueue = Boolean(current.correctedByQueue) || Boolean(correctedByQueue);
    this.turnStartedBroadcastState.set(stateKey, current);
    if (!current.hadUserMessage) {
      this._debugLog(
        `[phone-codex-proxy] turn/started missing userMessage pending correction thread=${threadId} turn=${turnId} hasQueue=${Boolean(
          correctedByQueue
        )}`
      );
    } else if (corrected) {
      this._debugLog(
        `[phone-codex-proxy] turn/started corrected from overlay thread=${threadId} turn=${turnId}`
      );
    }
  }

  _broadcastTurnStartedCorrection(threadId, turnId, userInput, status, options = {}) {
    const normalized = Array.isArray(userInput) ? deepCloneJson(userInput) : [];
    const keyThread = String(threadId);
    const keyTurn = String(turnId);
    const state = status || "inProgress";
    const variant = String(options.variant || "normalized").trim().toLowerCase();
    let payload = null;
    if (variant === "codex_event") {
      payload = {
        method: "codex/event/turn_started",
        params: {
          id: keyTurn,
          conversationId: keyThread,
          msg: {
            type: "turn_started",
            thread_id: keyThread,
            turn_id: keyTurn,
            item_id: `overlay-user-${keyTurn}`,
            item: {
              type: "userMessage",
              id: `overlay-user-${keyTurn}`,
              content: normalized,
            },
            turn: {
              id: keyTurn,
              status: state,
              items: [
                {
                  type: "userMessage",
                  id: `overlay-user-${keyTurn}`,
                  content: normalized,
                },
              ],
            },
          },
        },
      };
    } else {
      payload = {
        method: "turn/started",
        params: {
          threadId: keyThread,
          turnId: keyTurn,
          turn: {
            id: keyTurn,
            status: state,
            items: [
              {
                type: "userMessage",
                id: `overlay-user-${keyTurn}`,
                content: normalized,
              },
            ],
          },
        },
      };
    }
    this._sendToDesktopClients(payload);
    this._debugLog(
      `[phone-codex-proxy] broadcasting corrected turn/started variant=${variant} thread=${String(
        threadId
      )} turn=${String(turnId)}`
    );
  }

  _broadcastUserMessageItemForDesktop(threadId, turnId, userInput) {
    if (this.desktopOverlayMode === "off") return;
    const keyThread = String(threadId || "");
    const keyTurn = String(turnId || "");
    if (!keyThread || !keyTurn) return;
    if (!Array.isArray(userInput) || userInput.length === 0) return;

    const turnKey = this._turnStateKey(keyThread, keyTurn);
    if (this.userMessageItemSeenByTurn.has(turnKey)) return;

    const itemId = `overlay-user-${keyTurn}`;
    const item = {
      type: "userMessage",
      id: itemId,
      content: deepCloneJson(userInput),
    };
    const legacyItem = {
      type: "UserMessage",
      id: itemId,
      content: deepCloneJson(userInput),
    };

    // Codex Desktop appears to render the conversation primarily from item lifecycle events, not
    // from turn/read. For web-originated turns, upstream often omits the userMessage item, which
    // makes Desktop show the previous prompt while executing the new one. Synthesizing a
    // userMessage item/started+completed for Desktop fixes the anchor for subsequent items.
    const started = {
      method: "item/started",
      params: {
        threadId: keyThread,
        turnId: keyTurn,
        itemId,
        item,
      },
    };
    const completed = {
      method: "item/completed",
      params: {
        threadId: keyThread,
        turnId: keyTurn,
        itemId,
        item,
      },
    };
    const legacyStarted = {
      method: "codex/event/item_started",
      params: {
        id: keyTurn,
        conversationId: keyThread,
        msg: {
          type: "item_started",
          thread_id: keyThread,
          turn_id: keyTurn,
          item_id: itemId,
          item: deepCloneJson(legacyItem),
        },
      },
    };
    const legacyCompleted = {
      method: "codex/event/item_completed",
      params: {
        id: keyTurn,
        conversationId: keyThread,
        msg: {
          type: "item_completed",
          thread_id: keyThread,
          turn_id: keyTurn,
          item_id: itemId,
          item: deepCloneJson(legacyItem),
        },
      },
    };
    this._sendToDesktopClients(started);
    this._sendToDesktopClients(completed);
    this._sendToDesktopClients(legacyStarted);
    this._sendToDesktopClients(legacyCompleted);
    this.userMessageItemSeenByTurn.set(turnKey, Date.now());
    this._debugLog(
      `[phone-codex-proxy] broadcast desktop userMessage item thread=${keyThread} turn=${keyTurn}`
    );
  }

  _broadcastDesktopUserMessageEvent(threadId, turnId, userInput) {
    if (this.desktopOverlayMode === "off") return;
    const keyThread = String(threadId || "");
    const keyTurn = String(turnId || "");
    if (!keyThread || !keyTurn) return;
    const turnKey = this._turnStateKey(keyThread, keyTurn);
    if (this.userMessageEventSeenByTurn.has(turnKey)) return;
    const message = this._extractPlainTextFromUserInputBlocks(userInput);
    if (!message) return;

    const payload = {
      method: "codex/event/user_message",
      params: {
        id: keyTurn,
        conversationId: keyThread,
        msg: {
          type: "user_message",
          thread_id: keyThread,
          turn_id: keyTurn,
          message,
          images: [],
          local_images: [],
          text_elements: [],
        },
      },
    };
    this._sendToDesktopClients(payload);
    this.userMessageEventSeenByTurn.set(turnKey, Date.now());
    this._debugLog(
      `[phone-codex-proxy] broadcast desktop user_message event thread=${keyThread} turn=${keyTurn}`
    );
  }

  _emitDesktopAuthoritativeCorrection(threadId, turnId, userInput, status, options = {}) {
    const keyThread = String(threadId || "");
    const keyTurn = String(turnId || "");
    if (!keyThread || !keyTurn) return false;
    const normalizedInput = Array.isArray(userInput) ? deepCloneJson(userInput) : [];
    if (normalizedInput.length === 0) return false;

    const nextSig = this._turnInputSignature(normalizedInput);
    const stateKey = this._turnStateKey(keyThread, keyTurn);
    const state = this.turnStartedBroadcastState.get(stateKey) || null;
    if (
      state &&
      state.hadUserMessage &&
      state.corrected &&
      String(state.inputSig || "") === String(nextSig || "")
    ) {
      state.startedAt = Date.now();
      return false;
    }

    this._broadcastUserMessageItemForDesktop(keyThread, keyTurn, normalizedInput);
    this._broadcastDesktopUserMessageEvent(keyThread, keyTurn, normalizedInput);
    if (options.sendTurnStarted !== false) {
      // Desktop variants are inconsistent across releases; emit both normalized and codex/event.
      this._broadcastTurnStartedCorrection(keyThread, keyTurn, normalizedInput, status, {
        variant: "normalized",
      });
      this._broadcastTurnStartedCorrection(keyThread, keyTurn, normalizedInput, status, {
        variant: "codex_event",
      });
    }

    const nextState = state || {};
    nextState.threadId = keyThread;
    nextState.turnId = keyTurn;
    nextState.hadUserMessage = true;
    nextState.inputSig = nextSig || null;
    nextState.startedAt = Date.now();
    nextState.corrected = true;
    nextState.correctedByQueue = false;
    this.turnStartedBroadcastState.set(stateKey, nextState);
    return true;
  }

  _handleTurnStartResponseCorrection(materialization, result) {
    if (!materialization || !materialization.matched) return;
    if (this.desktopOverlayMode === "off") return;
    const turnId = String(materialization.turnId || "");
    const threadId = String(materialization.threadId || "");
    if (!turnId || !threadId) return;

    const resultTurn = result && result.turn && typeof result.turn === "object" ? result.turn : null;
    let correctedInput = this._extractTurnUserMessageInputFromTurn(resultTurn);
    if (!Array.isArray(correctedInput) || correctedInput.length === 0) {
      const rec = materialization.record || null;
      if (rec && Array.isArray(rec.input) && rec.input.length > 0) {
        correctedInput = deepCloneJson(rec.input);
      }
    }
    if (!Array.isArray(correctedInput) || correctedInput.length === 0) return;

    const stateKey = this._turnStateKey(threadId, turnId);
    const state = this.turnStartedBroadcastState.get(stateKey) || null;
    const nextSig = this._turnInputSignature(correctedInput);
    const pendingHadUser = state ? Boolean(state.hadUserMessage) : false;
    const stateSig = state ? String(state.inputSig || "") : "";

    const shouldCorrect =
      !pendingHadUser ||
      nextSig !== stateSig ||
      materialization.overwritten === true ||
      materialization.changed === true;

    if (!shouldCorrect && state) {
      if (state) {
        state.startedAt = Date.now();
      }
      return;
    }

    this._emitDesktopAuthoritativeCorrection(
      threadId,
      turnId,
      correctedInput,
      resultTurn && resultTurn.status
        ? resultTurn.status
        : materialization.record && materialization.record.status
    );
  }

  _cleanupTurnStartedBroadcastState() {
    const now = Date.now();
    const ttlMs = 10 * 60 * 1000;
    for (const [stateKey, state] of this.turnStartedBroadcastState.entries()) {
      if (!state || typeof state !== "object") {
        this.turnStartedBroadcastState.delete(stateKey);
        continue;
      }
      const startedAt = Number(state.startedAt || 0);
      if (!startedAt || now - startedAt > ttlMs) {
        this.turnStartedBroadcastState.delete(stateKey);
      }
    }

    for (const [turnKey, seenAt] of this.userMessageItemSeenByTurn.entries()) {
      const t = Number(seenAt || 0);
      if (!t || now - t > ttlMs) {
        this.userMessageItemSeenByTurn.delete(turnKey);
      }
    }

    for (const [turnKey, seenAt] of this.userMessageEventSeenByTurn.entries()) {
      const t = Number(seenAt || 0);
      if (!t || now - t > ttlMs) {
        this.userMessageEventSeenByTurn.delete(turnKey);
      }
    }
  }

  _handleDownstreamText(client, text) {
    const chunk = safeToUtf8(text);
    if (!chunk) return;
    for (const rawLine of chunk.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      let msg = null;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      this._handleDownstreamObject(client, msg);
    }
  }

  _handleDownstreamObject(client, msg) {
    if (!msg || typeof msg !== "object") return;

    // Downstream request
    if (
      Object.prototype.hasOwnProperty.call(msg, "method") &&
      Object.prototype.hasOwnProperty.call(msg, "id")
    ) {
      const method = String(msg.method || "");

      if (method === "initialize") {
        const params = msg.params || {};
        const clientInfo = params.clientInfo || {};
        const name = String(clientInfo.name || "").trim();
        if (name) client.clientInfoName = name;
        client.initialized = true;
        this.logger.log(
          `[phone-codex-proxy] downstream initialize (id=${client.id}, name=${JSON.stringify(
            client.clientInfoName || ""
          )}, ua=${JSON.stringify(client.userAgent || "")})`
        );

        // Respond locally; upstream is single-connection and already initialized.
        const result =
          this.upstreamInitializeResult || {
            userAgent: "phone-codex-proxy",
          };
        this._sendDownstreamMessage(client, {
          id: msg.id,
          result,
        });
        return;
      }

      if (!this.upstreamReady) {
        // If upstream is not ready, fail fast to avoid clients hanging forever.
        this._sendDownstreamMessage(client, {
          id: msg.id,
          error: { code: -32000, message: "Upstream not ready" },
        });
        return;
      }

      const upId = this._nextUpstreamRequestId();
      const upKey = jsonIdKey(upId);
      const params = msg.params || {};
      const sourceName = String(client.clientInfoName || "").trim();
      this.pendingUpstream.set(upKey, {
        clientId: client.id,
        downId: msg.id,
        method,
        params,
        sourceName,
      });
      this._debugLog(
        `[phone-codex-proxy] downstream request client=${JSON.stringify(
          sourceName
        )} method=${JSON.stringify(method)} downId=${JSON.stringify(
          msg.id
        )} upId=${JSON.stringify(upId)}`
      );

      if (method === "turn/start") {
        const threadId = String(params.threadId || params.thread_id || "").trim();
        if (threadId) {
          this.overlay.enqueueTurnStart({
            upKey,
            threadId,
            input: Array.isArray(params.input) ? params.input : [],
            createdAt: Date.now(),
            sourceName,
          });
        }
      }

      try {
        this._upstreamSend({
          id: upId,
          method,
          params: msg.params || {},
        });
      } catch (error) {
        this.pendingUpstream.delete(upKey);
        if (method === "turn/start") {
          this.overlay.dropPendingTurnStart(upKey);
        }
        this._sendDownstreamMessage(client, {
          id: msg.id,
          error: { code: -32000, message: String(error.message || error) },
        });
      }
      return;
    }

    // Downstream notification
    if (Object.prototype.hasOwnProperty.call(msg, "method")) {
      const method = String(msg.method || "");
      if (method === "initialized") {
        // Local no-op; upstream is initialized once by the proxy.
        return;
      }
      if (!this.upstreamReady) return;
      try {
        this._upstreamNotify(method, msg.params || {});
      } catch {
        // noop
      }
      return;
    }

    // Downstream response (likely for server-request forwarded from upstream)
    if (Object.prototype.hasOwnProperty.call(msg, "id")) {
      const key = serverReqKey(client.id, msg.id);
      const upstreamId = this.pendingServerRequests.get(key);
      if (!upstreamId) return;
      this.pendingServerRequests.delete(key);
      if (!this.upstreamReady) return;
      try {
        if (Object.prototype.hasOwnProperty.call(msg, "error")) {
          this._upstreamSend({ id: upstreamId, error: msg.error });
        } else {
          this._upstreamSend({ id: upstreamId, result: msg.result });
        }
      } catch {
        // noop
      }
    }
  }
}

module.exports = {
  CodexWsProxy,
};
