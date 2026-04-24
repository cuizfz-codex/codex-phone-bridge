const { EventEmitter } = require("events");

const { DesktopIpcClient, defaultDesktopIpcSocketPath } = require("./desktop-ipc-client");
const { normalizeBooleanFlag } = require("./shared/normalize");

const RUNNING_STATUSES = new Set([
  "inprogress",
  "in_progress",
  "running",
  "pending",
]);
const SEND_MODES = new Set(["off", "prefer"]);
const REASONING_EFFORTS = new Set([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);

class DesktopIpcMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.enabled =
      options.enabled === undefined
        ? process.platform === "darwin"
        : Boolean(options.enabled);
    this.socketPath = options.socketPath || defaultDesktopIpcSocketPath();
    this.clientType = String(options.clientType || "phone-codex-observer").trim();
    this.reconnectDelayMs = Number(options.reconnectDelayMs || 2000);
    this.requestTimeoutMs = Number(options.requestTimeoutMs || 20000);
    this.sendMode = normalizeDesktopIpcSendMode(options.sendMode || "prefer");
    this.maxThreads = Number(options.maxThreads || 1000);

    this.client = null;
    this.started = false;
    this.reconnectTimer = null;
    this.lastError = null;
    this.threadStateById = new Map();
  }

  start() {
    if (!this.enabled || this.started) return;
    this.started = true;
    this.connect();
  }

  stop() {
    this.started = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.client) {
      this.client.close();
      this.client = null;
    }
  }

  status() {
    const clientStatus = this.client ? this.client.status() : null;
    return {
      enabled: this.enabled,
      socketPath: this.socketPath,
      connected: Boolean(clientStatus && clientStatus.connected),
      initialized: Boolean(clientStatus && clientStatus.initialized),
      clientId: clientStatus ? clientStatus.clientId : null,
      sendMode: this.sendMode,
      threadCount: this.threadStateById.size,
      runningThreadCount: this.getRunningThreadIds().size,
      lastError: this.lastError,
    };
  }

  getRunningThreadIds() {
    const out = new Set();
    for (const [threadId, entry] of this.threadStateById.entries()) {
      if (entry && entry.running) out.add(threadId);
    }
    return out;
  }

  getThreadRuntimeState(threadId) {
    const key = String(threadId || "");
    if (!key) return null;
    const entry = this.threadStateById.get(key);
    if (!entry) return null;
    return {
      threadId: key,
      running: Boolean(entry.running),
      ownerClientId: entry.ownerClientId || null,
      updatedAt: entry.updatedAt || null,
    };
  }

  getThreadRunDefaults(threadId) {
    const key = String(threadId || "");
    if (!key) return null;
    const entry = this.threadStateById.get(key);
    if (!entry || !entry.conversationState) return null;
    const defaults = extractRunDefaultsFromConversationState(entry.conversationState);
    if (!defaults.model && !defaults.effort) return null;
    return {
      model: defaults.model,
      effort: defaults.effort,
      updatedAt: entry.updatedAt || null,
    };
  }

  getModelSyncCandidates(options = {}) {
    const cwd = normalizeCwd(options.cwd);
    const candidates = [];
    for (const [threadId, entry] of this.threadStateById.entries()) {
      const ownerClientId =
        entry && entry.ownerClientId ? String(entry.ownerClientId).trim() : "";
      if (!ownerClientId || !entry.conversationState) continue;
      const defaults = extractRunDefaultsFromConversationState(entry.conversationState);
      const threadCwd = extractCwdFromConversationState(entry.conversationState);
      if (cwd && normalizeCwd(threadCwd) !== cwd) continue;
      if (!defaults.model && !defaults.effort) continue;
      candidates.push({
        threadId,
        ownerClientId,
        model: defaults.model,
        effort: defaults.effort,
        cwd: threadCwd,
        running: Boolean(entry.running),
        updatedAt: entry.updatedAt || null,
      });
    }
    candidates.sort(compareModelSyncCandidates);
    return candidates;
  }

  connect() {
    if (!this.started || !this.enabled) return;
    const client = new DesktopIpcClient({
      socketPath: this.socketPath,
      clientType: this.clientType,
      requestTimeoutMs: this.requestTimeoutMs,
    });
    this.client = client;

    client.on("connected", (status) => {
      this.lastError = null;
      this.emit("status", this.status());
      this.emit("connected", status);
    });
    client.on("initialized", (status) => {
      this.lastError = null;
      this.emit("status", this.status());
      this.emit("initialized", status);
    });
    client.on("frame", (frame) => {
      this.handleFrame(frame);
    });
    client.on("protocol-warning", (warning) => {
      this.emit("protocol-warning", warning);
    });
    client.on("error", (error) => {
      this.lastError = String(error && error.message ? error.message : error);
      this.emit("error", error);
      this.emit("status", this.status());
    });
    client.on("close", () => {
      this.emit("status", this.status());
      this.scheduleReconnect();
    });

    client.connect().catch((error) => {
      this.lastError = String(error && error.message ? error.message : error);
      this.emit("error", error);
      this.emit("status", this.status());
      this.scheduleReconnect();
    });
  }

  scheduleReconnect() {
    if (!this.started || !this.enabled || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelayMs);
    this.reconnectTimer.unref();
  }

  handleFrame(frame) {
    if (
      !frame ||
      frame.type !== "broadcast" ||
      frame.method !== "thread-stream-state-changed"
    ) {
      return;
    }
    const params = frame.params && typeof frame.params === "object" ? frame.params : {};
    const threadId = String(params.conversationId || params.threadId || "").trim();
    if (!threadId) return;

    const ownerClientId =
      typeof frame.sourceClientId === "string" && frame.sourceClientId.trim()
        ? frame.sourceClientId.trim()
        : null;
    const previous = this.threadStateById.get(threadId) || {
      threadId,
      ownerClientId: null,
      conversationState: null,
      running: false,
      updatedAt: null,
    };
    let conversationState = previous.conversationState;
    const change = params.change && typeof params.change === "object" ? params.change : null;

    if (change && change.type === "snapshot") {
      conversationState = cloneJson(change.conversationState || null);
    } else if (change && change.type === "patches" && Array.isArray(change.patches)) {
      if (conversationState) {
        try {
          conversationState = applyPatches(conversationState, change.patches);
        } catch (error) {
          this.emit("protocol-warning", {
            message: "Failed to apply Codex desktop IPC thread patches",
            threadId,
            error: String(error && error.message ? error.message : error),
          });
        }
      }
    }

    const patchRunning =
      change && change.type === "patches" && Array.isArray(change.patches)
        ? patchesContainRunningStatus(change.patches)
        : false;
    const running = conversationState
      ? isConversationStateRunning(conversationState)
      : Boolean(previous.running || patchRunning);
    const next = {
      threadId,
      ownerClientId: ownerClientId || previous.ownerClientId || null,
      conversationState,
      running,
      updatedAt: new Date().toISOString(),
    };
    this.threadStateById.set(threadId, next);
    trimMapToMaxEntries(this.threadStateById, this.maxThreads);

    if (
      previous.running !== next.running ||
      previous.ownerClientId !== next.ownerClientId ||
      previous.conversationState !== next.conversationState
    ) {
      this.emit("thread-state-changed", {
        threadId,
        running: next.running,
        ownerClientId: next.ownerClientId,
        updatedAt: next.updatedAt,
      });
    }
  }

  async startTurn(threadId, input, overrides = {}) {
    const { threadKey, entry, ownerClientId } = this.resolveReadyThreadOwner(threadId);

    const turnStartParams = buildTurnStartParams(
      threadKey,
      input,
      overrides,
      entry.conversationState
    );
    const response = await this.client.sendRequestAndWait(
      "thread-follower-start-turn",
      {
        conversationId: threadKey,
        turnStartParams,
        isSteering: Boolean(overrides && overrides.isSteering),
      },
      {
        targetClientId: ownerClientId,
        version: 1,
        timeoutMs: this.requestTimeoutMs,
      }
    );
    return {
      via: "desktop-ipc",
      ownerClientId,
      response: response && Object.prototype.hasOwnProperty.call(response, "result")
        ? response.result
        : null,
    };
  }

  async setModelAndReasoning(threadId, overrides = {}) {
    const { threadKey, entry, ownerClientId } = this.resolveReadyThreadOwner(threadId);
    const defaults = extractRunDefaultsFromConversationState(entry.conversationState);
    const model = normalizeModelName(overrides.model) || defaults.model;
    const reasoningEffort =
      normalizeReasoningEffort(overrides.reasoningEffort) ||
      normalizeReasoningEffort(overrides.effort) ||
      defaults.effort;
    if (!model) {
      throw desktopIpcError(
        `No model is known for thread ${threadKey}`,
        "IPC_BAD_MODEL"
      );
    }
    if (!reasoningEffort) {
      throw desktopIpcError(
        `No reasoning effort is known for thread ${threadKey}`,
        "IPC_BAD_REASONING_EFFORT"
      );
    }

    const response = await this.client.sendRequestAndWait(
      "thread-follower-set-model-and-reasoning",
      {
        conversationId: threadKey,
        model,
        reasoningEffort,
      },
      {
        targetClientId: ownerClientId,
        version: 1,
        timeoutMs: this.requestTimeoutMs,
      }
    );

    if (entry.conversationState) {
      const nextState = applyConversationRunDefaultsOverride(entry.conversationState, {
        model,
        effort: reasoningEffort,
      });
      this.threadStateById.set(threadKey, {
        ...entry,
        conversationState: nextState,
        updatedAt: new Date().toISOString(),
      });
    }

    return {
      via: "desktop-ipc",
      ownerClientId,
      model,
      reasoningEffort,
      response: response && Object.prototype.hasOwnProperty.call(response, "result")
        ? response.result
      : null,
    };
  }

  async setModelAndReasoningForKnownThreads(overrides = {}, options = {}) {
    if (this.sendMode === "off") {
      throw desktopIpcError("CODEX_DESKTOP_IPC_SEND_MODE is off", "IPC_SEND_DISABLED");
    }
    if (!this.client || !this.client.status().connected || !this.client.status().initialized) {
      throw desktopIpcError("Codex desktop IPC is not ready", "IPC_NOT_READY");
    }
    const candidates = this.getModelSyncCandidates(options);
    if (candidates.length === 0) {
      throw desktopIpcError(
        "No Codex desktop thread is available for model sync",
        "IPC_NO_SYNC_TARGET"
      );
    }

    const requestedModel = normalizeModelName(overrides.model);
    const requestedEffort =
      normalizeReasoningEffort(overrides.reasoningEffort) ||
      normalizeReasoningEffort(overrides.effort);
    const synced = [];
    const failed = [];
    for (const candidate of candidates) {
      try {
        const result = await this.setModelAndReasoning(candidate.threadId, {
          model: requestedModel || candidate.model,
          reasoningEffort: requestedEffort || candidate.effort,
        });
        synced.push({
          threadId: candidate.threadId,
          ownerClientId: result.ownerClientId,
          model: result.model,
          reasoningEffort: result.reasoningEffort,
          cwd: candidate.cwd || null,
        });
      } catch (error) {
        failed.push({
          threadId: candidate.threadId,
          error: String(error && error.message ? error.message : error),
        });
      }
    }
    if (synced.length === 0) {
      const error = desktopIpcError(
        failed.length > 0
          ? failed[0].error
          : "No Codex desktop thread accepted model sync",
        "IPC_MODEL_SYNC_FAILED"
      );
      error.failed = failed;
      throw error;
    }
    return {
      via: "desktop-ipc",
      fallback: true,
      synced,
      failed,
      model: synced[0].model,
      reasoningEffort: synced[0].reasoningEffort,
    };
  }

  resolveReadyThreadOwner(threadId) {
    if (this.sendMode === "off") {
      throw desktopIpcError("CODEX_DESKTOP_IPC_SEND_MODE is off", "IPC_SEND_DISABLED");
    }
    const threadKey = String(threadId || "").trim();
    if (!threadKey) {
      throw desktopIpcError("threadId is required", "IPC_BAD_THREAD_ID");
    }
    const entry = this.threadStateById.get(threadKey);
    const ownerClientId =
      entry && entry.ownerClientId ? String(entry.ownerClientId).trim() : "";
    if (!ownerClientId) {
      throw desktopIpcError(
        `No Codex desktop ownerClientId is known for thread ${threadKey}`,
        "IPC_NO_OWNER"
      );
    }
    if (!this.client || !this.client.status().connected || !this.client.status().initialized) {
      throw desktopIpcError("Codex desktop IPC is not ready", "IPC_NOT_READY");
    }
    return { threadKey, entry, ownerClientId };
  }
}

function createDesktopIpcMonitorFromEnv(env = process.env) {
  const enabled = normalizeBooleanFlag(
    env.CODEX_DESKTOP_IPC_ENABLED,
    process.platform === "darwin"
  );
  return new DesktopIpcMonitor({
    enabled,
    socketPath: String(env.CODEX_DESKTOP_IPC_SOCKET_PATH || "").trim() || undefined,
    reconnectDelayMs: Number(env.CODEX_DESKTOP_IPC_RECONNECT_MS || 2000),
    requestTimeoutMs: Number(env.CODEX_DESKTOP_IPC_REQUEST_TIMEOUT_MS || 20000),
    sendMode: normalizeDesktopIpcSendMode(env.CODEX_DESKTOP_IPC_SEND_MODE || "prefer"),
  });
}

function normalizeDesktopIpcSendMode(value) {
  const raw = String(value || "").trim().toLowerCase();
  return SEND_MODES.has(raw) ? raw : "prefer";
}

function buildTurnStartParams(threadId, input, overrides = {}, conversationState = null) {
  const template = findLatestTurnParamsTemplate(conversationState);
  const params = {
    ...cloneJson(template || {}),
    threadId,
    input: cloneJson(Array.isArray(input) ? input : []),
  };
  if (!Array.isArray(params.attachments)) {
    params.attachments = [];
  }

  applyOptionalOverride(params, "cwd", overrides.cwd);
  applyOptionalOverride(params, "approvalPolicy", overrides.approvalPolicy);
  applyOptionalOverride(params, "sandboxPolicy", overrides.sandboxPolicy);
  applyOptionalOverride(params, "summary", overrides.summary);
  applyOptionalOverride(params, "personality", overrides.personality);
  applyOptionalOverride(params, "outputSchema", overrides.outputSchema);
  applyOptionalOverride(params, "collaborationMode", overrides.collaborationMode);
  applyRunDefaultsOverride(params, {
    model: overrides.model,
    effort: overrides.effort || overrides.reasoningEffort,
  });
  return params;
}

function applyOptionalOverride(target, key, value) {
  if (value === undefined || value === null) return;
  target[key] = cloneJson(value);
}

function findLatestTurnParamsTemplate(conversationState) {
  if (!conversationState || typeof conversationState !== "object") return null;
  const turns = Array.isArray(conversationState.turns) ? conversationState.turns : [];
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const params = turns[i] && turns[i].params;
    if (params && typeof params === "object") return params;
  }
  return null;
}

function extractRunDefaultsFromConversationState(conversationState) {
  if (!conversationState || typeof conversationState !== "object") {
    return { model: null, effort: null };
  }
  const template = findLatestTurnParamsTemplate(conversationState) || {};
  const latestMode =
    getObjectValue(conversationState.latestCollaborationMode) ||
    getObjectValue(conversationState.latest_collaboration_mode) ||
    getObjectValue(template.collaborationMode) ||
    getObjectValue(template.collaboration_mode) ||
    null;
  const latestSettings =
    latestMode && getObjectValue(latestMode.settings) ? latestMode.settings : {};
  const templateSettings =
    getObjectValue(template.collaborationMode) &&
    getObjectValue(template.collaborationMode.settings)
      ? template.collaborationMode.settings
      : getObjectValue(template.collaboration_mode) &&
        getObjectValue(template.collaboration_mode.settings)
      ? template.collaboration_mode.settings
      : {};
  return {
    model:
      normalizeModelName(conversationState.latestModel) ||
      normalizeModelName(conversationState.latest_model) ||
      normalizeModelName(latestSettings.model) ||
      normalizeModelName(template.model) ||
      normalizeModelName(templateSettings.model),
    effort:
      normalizeReasoningEffort(conversationState.latestReasoningEffort) ||
      normalizeReasoningEffort(conversationState.latest_reasoning_effort) ||
      normalizeReasoningEffort(latestSettings.reasoning_effort) ||
      normalizeReasoningEffort(latestSettings.reasoningEffort) ||
      normalizeReasoningEffort(template.effort) ||
      normalizeReasoningEffort(template.reasoningEffort) ||
      normalizeReasoningEffort(templateSettings.reasoning_effort) ||
      normalizeReasoningEffort(templateSettings.reasoningEffort),
  };
}

function extractCwdFromConversationState(conversationState) {
  if (!conversationState || typeof conversationState !== "object") return null;
  const template = findLatestTurnParamsTemplate(conversationState) || {};
  const latestMode =
    getObjectValue(conversationState.latestCollaborationMode) ||
    getObjectValue(conversationState.latest_collaboration_mode) ||
    getObjectValue(template.collaborationMode) ||
    getObjectValue(template.collaboration_mode) ||
    null;
  const latestSettings =
    latestMode && getObjectValue(latestMode.settings) ? latestMode.settings : {};
  return (
    normalizeCwd(conversationState.cwd) ||
    normalizeCwd(conversationState.latestCwd) ||
    normalizeCwd(conversationState.latest_cwd) ||
    normalizeCwd(latestSettings.cwd) ||
    normalizeCwd(template.cwd)
  );
}

function applyConversationRunDefaultsOverride(conversationState, overrides = {}) {
  const next = cloneJson(conversationState || {});
  const model = normalizeModelName(overrides.model);
  const effort = normalizeReasoningEffort(overrides.effort || overrides.reasoningEffort);
  if (model) {
    next.latestModel = model;
    if (Object.prototype.hasOwnProperty.call(next, "latest_model")) {
      next.latest_model = model;
    }
  }
  if (effort) {
    next.latestReasoningEffort = effort;
    if (Object.prototype.hasOwnProperty.call(next, "latest_reasoning_effort")) {
      next.latest_reasoning_effort = effort;
    }
  }
  applyCollaborationModeObjectOverride(next, "latestCollaborationMode", {
    model,
    effort,
    createIfMissing: Boolean(model || effort),
  });
  applyCollaborationModeObjectOverride(next, "latest_collaboration_mode", {
    model,
    effort,
    createIfMissing: false,
  });
  const template = findLatestTurnParamsTemplate(next);
  if (template) {
    applyRunDefaultsOverride(template, { model, effort });
  }
  return next;
}

function applyRunDefaultsOverride(params, overrides = {}) {
  if (!params || typeof params !== "object") return;
  const model = normalizeModelName(overrides.model);
  const effort = normalizeReasoningEffort(overrides.effort || overrides.reasoningEffort);
  if (model) {
    params.model = model;
  }
  if (effort) {
    params.effort = effort;
  }
  applyCollaborationModeObjectOverride(params, "collaborationMode", {
    model,
    effort,
    createIfMissing: Boolean(model || effort),
  });
  applyCollaborationModeObjectOverride(params, "collaboration_mode", {
    model,
    effort,
    createIfMissing: false,
  });
}

function applyCollaborationModeObjectOverride(target, key, overrides = {}) {
  if (!target || typeof target !== "object") return;
  const existing = getObjectValue(target[key]);
  if (!existing && !overrides.createIfMissing) return;
  const nextMode = existing ? cloneJson(existing) : { mode: "default", settings: {} };
  const settings = getObjectValue(nextMode.settings)
    ? { ...nextMode.settings }
    : {};
  if (overrides.model) {
    settings.model = overrides.model;
  }
  if (overrides.effort) {
    settings.reasoning_effort = overrides.effort;
  }
  nextMode.settings = settings;
  target[key] = nextMode;
}

function normalizeModelName(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeCwd(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeReasoningEffort(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/[-\s]/g, "_")
    .toLowerCase();
  if (normalized === "extra_high" || normalized === "x_high") return "xhigh";
  return REASONING_EFFORTS.has(normalized) ? normalized : null;
}

function getObjectValue(value) {
  return value && typeof value === "object" ? value : null;
}

function compareModelSyncCandidates(left, right) {
  const runningDelta = Number(Boolean(right.running)) - Number(Boolean(left.running));
  if (runningDelta) return runningDelta;
  return Date.parse(right.updatedAt || 0) - Date.parse(left.updatedAt || 0);
}

function desktopIpcError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isConversationStateRunning(state) {
  if (!state || typeof state !== "object") return false;
  const turns = Array.isArray(state.turns) ? state.turns : [];
  if (turns.some((turn) => isRunningStatus(turn && turn.status))) return true;
  const requests = Array.isArray(state.requests) ? state.requests : [];
  return requests.some((request) => request && request.completed !== true);
}

function isRunningStatus(status) {
  const normalized = String(status || "")
    .trim()
    .replace(/[-\s]/g, "_")
    .toLowerCase();
  return RUNNING_STATUSES.has(normalized);
}

function patchesContainRunningStatus(patches) {
  return patches.some((patch) => {
    if (!patch || typeof patch !== "object") return false;
    const pathLabel = Array.isArray(patch.path) ? patch.path.join(".") : "";
    if (!/\bstatus\b/.test(pathLabel)) return false;
    return isRunningStatus(patch.value);
  });
}

function applyPatches(source, patches) {
  let state = cloneJson(source);
  for (const patch of patches) {
    state = applyPatch(state, patch);
  }
  return state;
}

function applyPatch(source, patch) {
  if (!patch || typeof patch !== "object") {
    throw new Error("Invalid patch");
  }
  const op = String(patch.op || "");
  const patchPath = Array.isArray(patch.path) ? patch.path : null;
  if (!patchPath || patchPath.length === 0) {
    throw new Error("Invalid patch path");
  }
  const next = cloneJson(source);
  const parentPath = patchPath.slice(0, -1);
  const last = patchPath[patchPath.length - 1];
  let parent = next;
  for (const segment of parentPath) {
    parent = descend(parent, segment);
  }

  if (op === "remove") {
    if (Array.isArray(parent) && Number.isInteger(last)) {
      parent.splice(last, 1);
      return next;
    }
    if (parent && typeof parent === "object" && typeof last === "string") {
      delete parent[last];
      return next;
    }
    throw new Error("Invalid remove patch target");
  }

  if (Array.isArray(parent) && Number.isInteger(last)) {
    if (op === "add") {
      parent.splice(last, 0, cloneJson(patch.value));
      return next;
    }
    if (op === "replace") {
      parent[last] = cloneJson(patch.value);
      return next;
    }
  }
  if (parent && typeof parent === "object" && typeof last === "string") {
    parent[last] = cloneJson(patch.value);
    return next;
  }
  throw new Error("Invalid patch target");
}

function descend(value, segment) {
  if (Array.isArray(value) && Number.isInteger(segment)) {
    if (segment < 0 || segment >= value.length) {
      throw new Error(`Patch array index out of range: ${segment}`);
    }
    return value[segment];
  }
  if (value && typeof value === "object" && typeof segment === "string") {
    if (!Object.prototype.hasOwnProperty.call(value, segment)) {
      throw new Error(`Patch object key missing: ${segment}`);
    }
    return value[segment];
  }
  throw new Error(`Invalid patch path segment: ${String(segment)}`);
}

function cloneJson(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function trimMapToMaxEntries(map, maxEntries) {
  const max = Number(maxEntries);
  if (!Number.isFinite(max) || max <= 0) return;
  while (map.size > max) {
    const first = map.keys().next();
    if (first.done) return;
    map.delete(first.value);
  }
}

module.exports = {
  DesktopIpcMonitor,
  createDesktopIpcMonitorFromEnv,
  _test: {
    applyPatches,
    applyRunDefaultsOverride,
    buildTurnStartParams,
    extractCwdFromConversationState,
    extractRunDefaultsFromConversationState,
    findLatestTurnParamsTemplate,
    isConversationStateRunning,
    isRunningStatus,
    normalizeReasoningEffort,
    normalizeDesktopIpcSendMode,
    patchesContainRunningStatus,
  },
};
