const { EventEmitter } = require("events");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const DESKTOP_RUNTIME_SCAN_TTL_MS = 3000;
const SESSION_TAIL_BYTES = 96 * 1024;

const ALL_SOURCE_KINDS = [
  "cli",
  "vscode",
  "exec",
  "appServer",
  "subAgent",
  "subAgentReview",
  "subAgentCompact",
  "subAgentThreadSpawn",
  "subAgentOther",
  "unknown",
];

class ThreadSyncService extends EventEmitter {
  constructor(options) {
    super();
    this.rpc = options.rpc;
    this.listPollMs = Number(options.listPollMs || 8000);
    this.activePollMs = Number(options.activePollMs || 2000);
    this.idlePollMs = Number(options.idlePollMs || 10000);
    this.defaultPageLimit = Number(options.defaultPageLimit || 50);

    this.listTimer = null;
    this.watchTimer = null;
    this.isStarted = false;

    this.listCache = {
      updatedAt: null,
      data: [],
      nextCursor: null,
    };
    this.watchedThreads = new Map();
    this.listInFlightByKey = new Map();
    this.desktopRuntimeScan = options.desktopRuntimeScan !== false;
    this.desktopRuntimeScanTtlMs = Number(
      options.desktopRuntimeScanTtlMs || DESKTOP_RUNTIME_SCAN_TTL_MS
    );
    this.desktopRuntimeCache = {
      updatedAt: 0,
      threadIds: new Set(),
    };
    this.desktopIpcMonitor = options.desktopIpcMonitor || null;
    this.terminalRuntimeSuppressionTtlMs = Number(
      options.terminalRuntimeSuppressionTtlMs || 5 * 60 * 1000
    );
    this.terminalRuntimeSuppressions = new Map();
  }

  start() {
    if (this.isStarted) return;
    this.isStarted = true;
    this.listTimer = setInterval(() => {
      this.refreshThreadList("poll").catch((error) => {
        this.emit("error", error);
      });
    }, this.listPollMs);
    this.watchTimer = setInterval(() => {
      this._pollWatchedThreads().catch((error) => {
        this.emit("error", error);
      });
    }, 1000);
    this.refreshThreadList("startup").catch((error) => {
      this.emit("error", error);
    });
  }

  stop() {
    this.isStarted = false;
    if (this.listTimer) {
      clearInterval(this.listTimer);
      this.listTimer = null;
    }
    if (this.watchTimer) {
      clearInterval(this.watchTimer);
      this.watchTimer = null;
    }
    this.watchedThreads.clear();
  }

  watchThread(threadId, watcherId) {
    if (!threadId) return;
    const key = String(threadId);
    let entry = this.watchedThreads.get(key);
    if (!entry) {
      entry = {
        threadId: key,
        watcherIds: new Set(),
        dueAt: 0,
        lastSignature: "",
        inProgress: false,
        lastReadAt: null,
      };
      this.watchedThreads.set(key, entry);
    }
    if (watcherId) {
      entry.watcherIds.add(String(watcherId));
    }
    entry.dueAt = 0;
  }

  unwatchThread(threadId, watcherId) {
    if (!threadId) return;
    const key = String(threadId);
    const entry = this.watchedThreads.get(key);
    if (!entry) return;

    if (watcherId) {
      entry.watcherIds.delete(String(watcherId));
    } else {
      entry.watcherIds.clear();
    }

    if (entry.watcherIds.size === 0) {
      this.watchedThreads.delete(key);
    }
  }

  removeWatcherEverywhere(watcherId) {
    for (const [threadId, entry] of this.watchedThreads.entries()) {
      entry.watcherIds.delete(String(watcherId));
      if (entry.watcherIds.size === 0) {
        this.watchedThreads.delete(threadId);
      }
    }
  }

  triggerImmediateThreadRead(threadId) {
    const entry = this.watchedThreads.get(String(threadId));
    if (!entry) return;
    entry.dueAt = 0;
  }

  async refreshThreadList(reason = "manual") {
    const result = await this.listThreads({
      limit: 100,
      archived: false,
      sourceKinds: ALL_SOURCE_KINDS,
    });
    const signature = JSON.stringify(
      result.data.map((item) => [
        item.id,
        item.updatedAt,
        item.preview,
        item.inProgress === true || item.running === true,
      ])
    );
    const oldSignature = JSON.stringify(
      this.listCache.data.map((item) => [
        item.id,
        item.updatedAt,
        item.preview,
        item.inProgress === true || item.running === true,
      ])
    );
    this.listCache = {
      updatedAt: new Date().toISOString(),
      data: result.data,
      nextCursor: result.nextCursor,
    };
    if (signature !== oldSignature) {
      this.emit("thread-list-updated", {
        reason,
        updatedAt: this.listCache.updatedAt,
        data: this.listCache.data,
        nextCursor: this.listCache.nextCursor,
      });
    }
    return this.listCache;
  }

  getCachedThreadList() {
    return this.listCache;
  }

  async listThreads(options = {}) {
    const limit = clampInt(options.limit, 1, 200, this.defaultPageLimit);
    const archived =
      options.archived === null || options.archived === undefined
        ? null
        : Boolean(options.archived);
    const cursor = options.cursor ? String(options.cursor) : null;
    const sourceKinds =
      Array.isArray(options.sourceKinds) && options.sourceKinds.length > 0
        ? options.sourceKinds
        : ALL_SOURCE_KINDS;
    const modelProviders =
      Array.isArray(options.modelProviders) && options.modelProviders.length > 0
      ? options.modelProviders
      : null;
    const sortKey = options.sortKey ? String(options.sortKey) : "updated_at";
    const query = options.query ? String(options.query).trim().toLowerCase() : "";
    const requestKey = buildThreadListRequestKey({
      limit,
      archived,
      cursor,
      sourceKinds,
      modelProviders,
      sortKey,
      query,
    });
    const inFlight = this.listInFlightByKey.get(requestKey);
    if (inFlight) return inFlight;

    const request = this._listThreadsUncached({
      limit,
      archived,
      cursor,
      sourceKinds,
      modelProviders,
      sortKey,
      query,
    });
    this.listInFlightByKey.set(requestKey, request);
    try {
      return await request;
    } finally {
      if (this.listInFlightByKey.get(requestKey) === request) {
        this.listInFlightByKey.delete(requestKey);
      }
    }
  }

  async _listThreadsUncached({
    limit,
    archived,
    cursor,
    sourceKinds,
    modelProviders,
    sortKey,
    query,
  }) {
    if (!query) {
      const result = await this.rpc.request("thread/list", {
        cursor,
        limit,
        archived,
        sourceKinds,
        modelProviders,
        sortKey,
        useStateDbOnly: true,
      });
      return this._decorateThreadListRuntimeState(
        normalizeThreadListResponse(result)
      );
    }

    let pageCursor = cursor;
    let loops = 0;
    const maxLoops = 25;
    const collected = [];
    while (loops < maxLoops && collected.length < limit) {
      loops += 1;
      const page = normalizeThreadListResponse(
        await this.rpc.request("thread/list", {
          cursor: pageCursor,
          limit: 100,
          archived,
          sourceKinds,
          modelProviders,
          sortKey,
          useStateDbOnly: true,
        })
      );
      for (const item of page.data) {
        if (matchesThreadQuery(item, query)) {
          collected.push(item);
          if (collected.length >= limit) break;
        }
      }
      if (!page.nextCursor) {
        pageCursor = null;
        break;
      }
      pageCursor = page.nextCursor;
    }
    const decorated = await this._decorateThreadListRuntimeState({ data: collected });
    return {
      data: decorated.data,
      nextCursor: pageCursor,
    };
  }

  async _decorateThreadListRuntimeState(result) {
    const normalized = normalizeThreadListResponse(result);
    const desktopRunningThreadIds = await this._getDesktopRuntimeThreadIds();
    normalized.data = normalized.data.map((thread) => {
      return this._decorateThreadRuntimeState(thread, desktopRunningThreadIds);
    });
    return normalized;
  }

  _decorateThreadRuntimeState(thread, desktopRunningThreadIds = new Set()) {
    if (!thread || !thread.id) return thread;
    const entry = this.watchedThreads.get(String(thread.id));
    if (hasInProgressTurn(thread)) {
      this._clearTerminalRuntimeSuppression(thread.id);
      return {
        ...thread,
        inProgress: true,
        running: true,
      };
    }
    if (hasAuthoritativeTerminalTurns(thread)) {
      if (entry) {
        entry.inProgress = false;
      }
      this._suppressTerminalRuntime(thread.id);
      this._markDesktopIpcThreadNotRunning(thread.id);
      return {
        ...thread,
        inProgress: false,
        running: false,
      };
    }
    if (this._isTerminalRuntimeSuppressed(thread.id)) {
      return {
        ...thread,
        inProgress: false,
        running: false,
      };
    }
    const isRunning =
      (entry && entry.inProgress) ||
      desktopRunningThreadIds.has(String(thread.id));
    if (!isRunning) return thread;
    return {
      ...thread,
      inProgress: true,
      running: true,
    };
  }

  async _getDesktopRuntimeThreadIds() {
    const ipcThreadIds = this._getDesktopIpcRunningThreadIds();
    if (!this.desktopRuntimeScan) return ipcThreadIds;
    const now = Date.now();
    if (
      this.desktopRuntimeCache.updatedAt &&
      now - this.desktopRuntimeCache.updatedAt < this.desktopRuntimeScanTtlMs
    ) {
      return mergeSets(this.desktopRuntimeCache.threadIds, ipcThreadIds);
    }

    try {
      const threadIds = await scanDesktopRuntimeThreadIds();
      this.desktopRuntimeCache = {
        updatedAt: now,
        threadIds,
      };
      return mergeSets(threadIds, ipcThreadIds);
    } catch (error) {
      this.emit("error", error);
      this.desktopRuntimeCache = {
        updatedAt: now,
        threadIds: new Set(),
      };
      return ipcThreadIds;
    }
  }

  _markDesktopIpcThreadNotRunning(threadId) {
    if (
      !this.desktopIpcMonitor ||
      typeof this.desktopIpcMonitor.markThreadNotRunning !== "function"
    ) {
      return false;
    }
    try {
      return this.desktopIpcMonitor.markThreadNotRunning(threadId, {
        reason: "thread-read-terminal",
      });
    } catch (error) {
      this.emit("error", error);
      return false;
    }
  }

  _suppressTerminalRuntime(threadId) {
    const key = String(threadId || "").trim();
    if (!key) return;
    this.terminalRuntimeSuppressions.set(key, Date.now());
  }

  _clearTerminalRuntimeSuppression(threadId) {
    const key = String(threadId || "").trim();
    if (!key) return;
    this.terminalRuntimeSuppressions.delete(key);
  }

  _isTerminalRuntimeSuppressed(threadId) {
    const key = String(threadId || "").trim();
    if (!key) return false;
    const since = this.terminalRuntimeSuppressions.get(key);
    if (!since) return false;
    const ttl = Math.max(0, this.terminalRuntimeSuppressionTtlMs);
    if (ttl > 0 && Date.now() - since > ttl) {
      this.terminalRuntimeSuppressions.delete(key);
      return false;
    }
    return true;
  }

  _getDesktopIpcRunningThreadIds() {
    if (
      !this.desktopIpcMonitor ||
      typeof this.desktopIpcMonitor.getRunningThreadIds !== "function"
    ) {
      return new Set();
    }
    try {
      return this.desktopIpcMonitor.getRunningThreadIds();
    } catch (error) {
      this.emit("error", error);
      return new Set();
    }
  }

  async readThread(threadId, includeTurns = true) {
    const result = await this.rpc.request("thread/read", {
      threadId: String(threadId),
      includeTurns: Boolean(includeTurns),
    });
    const thread = result && result.thread ? result.thread : null;
    if (!thread) {
      throw new Error("Thread not found");
    }
    const desktopRunningThreadIds = await this._getDesktopRuntimeThreadIds();
    return this._decorateThreadRuntimeState(thread, desktopRunningThreadIds);
  }

  async startThread(params = {}) {
    const payload = compactObject({
      model: params.model || null,
      modelProvider: params.modelProvider || null,
      serviceTier: params.serviceTier || null,
      cwd: params.cwd || null,
      approvalPolicy: params.approvalPolicy || null,
      approvalsReviewer: params.approvalsReviewer || null,
      sandbox: params.sandbox || null,
      permissionProfile: params.permissionProfile || null,
      config: params.config || null,
      serviceName: params.serviceName || null,
      baseInstructions: params.baseInstructions || null,
      developerInstructions: params.developerInstructions || null,
      personality: params.personality || null,
      ephemeral: params.ephemeral || false,
      sessionStartSource: normalizeThreadStartSource(params.sessionStartSource),
      experimentalRawEvents: Boolean(params.experimentalRawEvents || false),
      persistExtendedHistory: Boolean(params.persistExtendedHistory || false),
    });
    return this.rpc.request("thread/start", payload);
  }

  async startTurn(threadId, input, overrides = {}) {
    const threadKey = String(threadId);
    this._clearTerminalRuntimeSuppression(threadKey);
    const payload = compactObject({
      threadId: threadKey,
      input,
      cwd: overrides.cwd || null,
      approvalPolicy: overrides.approvalPolicy || null,
      sandboxPolicy: overrides.sandboxPolicy || null,
      model: overrides.model || null,
      effort: overrides.effort || null,
      summary: overrides.summary || null,
      personality: overrides.personality || null,
      outputSchema: overrides.outputSchema || null,
      collaborationMode: overrides.collaborationMode || null,
    });
    try {
      return await this.rpc.request("turn/start", payload);
    } catch (error) {
      if (!isThreadNotFoundError(error)) {
        throw error;
      }
      const resumeOverrides = await this.resolveResumeOverrides(threadKey, overrides);
      await this.resumeThread(threadKey, resumeOverrides);
      const retryPayload =
        payload.cwd || !resumeOverrides.cwd
          ? payload
          : { ...payload, cwd: resumeOverrides.cwd };
      return this.rpc.request("turn/start", retryPayload);
    }
  }

  async resumeThread(threadId, overrides = {}) {
    return this.rpc.request(
      "thread/resume",
      compactObject({
        threadId: String(threadId),
        model: overrides.model || null,
        modelProvider: overrides.modelProvider || null,
        cwd: overrides.cwd || null,
        approvalPolicy: overrides.approvalPolicy || null,
        approvalsReviewer: overrides.approvalsReviewer || null,
        sandbox: overrides.sandbox || null,
        permissionProfile: overrides.permissionProfile || null,
        config: overrides.config || null,
        baseInstructions: overrides.baseInstructions || null,
        developerInstructions: overrides.developerInstructions || null,
        personality: overrides.personality || null,
        persistExtendedHistory: Boolean(overrides.persistExtendedHistory || false),
      })
    );
  }

  async resolveResumeOverrides(threadId, overrides = {}) {
    const resolved = { ...overrides };
    if (resolved.cwd && resolved.modelProvider) {
      return resolved;
    }
    const thread = await this.findThreadById(threadId);
    if (!thread) {
      return resolved;
    }
    if (!resolved.cwd && thread.cwd) {
      resolved.cwd = thread.cwd;
    }
    if (!resolved.modelProvider && thread.modelProvider) {
      resolved.modelProvider = thread.modelProvider;
    }
    return resolved;
  }

  async findThreadById(threadId) {
    const key = String(threadId);
    const cached = this.listCache.data.find((thread) => String(thread.id) === key);
    if (cached) {
      return cached;
    }
    try {
      const result = await this.listThreads({
        limit: 100,
        archived: null,
        sourceKinds: ALL_SOURCE_KINDS,
        query: key,
      });
      return (
        (result.data || []).find((thread) => String(thread.id) === key) || null
      );
    } catch (_error) {
      return null;
    }
  }

  async interruptTurn(threadId, turnId) {
    return this.rpc.request("turn/interrupt", {
      threadId: String(threadId),
      turnId: String(turnId),
    });
  }

  async setThreadName(threadId, name) {
    return this.rpc.request("thread/name/set", {
      threadId: String(threadId),
      name: String(name),
    });
  }

  async archiveThread(threadId) {
    return this.rpc.request("thread/archive", { threadId: String(threadId) });
  }

  async unarchiveThread(threadId) {
    return this.rpc.request("thread/unarchive", { threadId: String(threadId) });
  }

  async forkThread(threadId, overrides = {}) {
    return this.rpc.request("thread/fork", {
      threadId: String(threadId),
      path: overrides.path || null,
      model: overrides.model || null,
      modelProvider: overrides.modelProvider || null,
      cwd: overrides.cwd || null,
      approvalPolicy: overrides.approvalPolicy || null,
      approvalsReviewer: overrides.approvalsReviewer || null,
      sandbox: overrides.sandbox || null,
      permissionProfile: overrides.permissionProfile || null,
      config: overrides.config || null,
      baseInstructions: overrides.baseInstructions || null,
      developerInstructions: overrides.developerInstructions || null,
      persistExtendedHistory: Boolean(overrides.persistExtendedHistory || false),
    });
  }

  handleRpcNotification(notification) {
    const method = notification.method;
    const params = notification.params || {};
    const threadId = params.threadId || (params.thread && params.thread.id) || null;
    if (method === "turn/started" && threadId) {
      this._clearTerminalRuntimeSuppression(threadId);
    }

    if (
      method === "thread/started" ||
      method === "thread/name/updated" ||
      method === "thread/tokenUsage/updated"
    ) {
      this.refreshThreadList("notification").catch((error) => {
        this.emit("error", error);
      });
    }

    if (
      method === "turn/started" ||
      method === "turn/completed" ||
      method === "item/started" ||
      method === "item/completed" ||
      method === "item/agentMessage/delta" ||
      method === "item/commandExecution/outputDelta" ||
      method === "item/fileChange/outputDelta"
    ) {
      if (threadId) {
        this.triggerImmediateThreadRead(threadId);
      }
    }
  }

  async _pollWatchedThreads() {
    const now = Date.now();
    for (const [threadId, entry] of this.watchedThreads.entries()) {
      if (entry.watcherIds.size === 0) {
        this.watchedThreads.delete(threadId);
        continue;
      }
      if (entry.dueAt > now) continue;
      try {
        const thread = await this.readThread(threadId, true);
        const signature = threadSignature(thread);
        if (signature !== entry.lastSignature) {
          entry.lastSignature = signature;
          this.emit("thread-updated", {
            threadId,
            thread,
            source: "poll",
          });
        }
        const inProgress = hasInProgressTurn(thread);
        entry.inProgress = inProgress;
        entry.lastReadAt = new Date().toISOString();
        entry.dueAt = now + (inProgress ? this.activePollMs : this.idlePollMs);
      } catch (error) {
        entry.dueAt = now + 3000;
        this.emit("error", error);
      }
    }
  }
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function normalizeThreadListResponse(result) {
  const data = Array.isArray(result && result.data) ? result.data : [];
  const nextCursor =
    result && Object.prototype.hasOwnProperty.call(result, "nextCursor")
      ? result.nextCursor
      : null;
  return {
    data,
    nextCursor,
  };
}

function mergeSets(...sets) {
  const out = new Set();
  for (const set of sets) {
    if (!set || typeof set[Symbol.iterator] !== "function") continue;
    for (const value of set) {
      out.add(String(value));
    }
  }
  return out;
}

function matchesThreadQuery(thread, query) {
  if (!query) return true;
  const haystack = [
    thread.id,
    thread.displayName,
    thread.title,
    thread.firstUserMessage,
    thread.preview,
    thread.cwd,
    thread.modelProvider,
    thread.source,
    thread.path,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  return haystack.includes(query);
}

function hasInProgressTurn(thread) {
  if (!thread || !Array.isArray(thread.turns)) return false;
  return thread.turns.some((turn) => turn && isRunningStatus(turn.status));
}

function hasAuthoritativeTerminalTurns(thread) {
  if (!thread || !Array.isArray(thread.turns) || thread.turns.length === 0) {
    return false;
  }
  if (hasInProgressTurn(thread)) return false;
  const lastTurn = [...thread.turns].reverse().find((turn) => turn && turn.status);
  return Boolean(lastTurn && isTerminalStatus(lastTurn.status));
}

async function scanDesktopRuntimeThreadIds() {
  if (process.platform !== "darwin") return new Set();

  const { stdout } = await execFileAsync("ps", ["-axo", "pid,command"], {
    maxBuffer: 1024 * 1024,
  });
  const pids = parseCodexAppServerPids(stdout);
  const threadIds = new Set();
  await Promise.all(
    pids.map(async (pid) => {
      const { stdout: lsofOut } = await execFileAsync(
        "lsof",
        ["-Pan", "-p", pid],
        { maxBuffer: 3 * 1024 * 1024 }
      );
      const sessions = parseRuntimeSessionFilesFromLsof(lsofOut);
      await Promise.all(
        sessions.map(async (sessionPath) => {
          const threadId = parseThreadIdFromSessionPath(sessionPath);
          if (!threadId) return;
          if (await isRuntimeSessionLogActive(sessionPath)) {
            threadIds.add(threadId);
          }
        })
      );
    })
  );
  return threadIds;
}

function parseCodexAppServerPids(psOutput) {
  return String(psOutput || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.+)$/);
      if (!match) return null;
      const command = match[2];
      if (
        !command.includes("/Applications/Codex.app/Contents/Resources/codex") ||
        !/\bapp-server\b/.test(command)
      ) {
        return null;
      }
      return match[1];
    })
    .filter(Boolean);
}

function parseRuntimeSessionFilesFromLsof(lsofOutput) {
  const files = new Set();
  for (const line of String(lsofOutput || "").split(/\r?\n/)) {
    if (!line.includes("/.codex/sessions/") || !line.includes(".jsonl")) {
      continue;
    }
    const fields = line.trim().split(/\s+/);
    const fd = fields[3] || "";
    if (!fd.includes("w")) continue;
    const filePath = fields.slice(8).join(" ");
    if (filePath.endsWith(".jsonl")) {
      files.add(filePath);
    }
  }
  return [...files];
}

function parseThreadIdFromSessionPath(sessionPath) {
  const base = path.basename(String(sessionPath || ""));
  const match = base.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i
  );
  return match ? match[1] : null;
}

async function isRuntimeSessionLogActive(sessionPath) {
  const text = await readTail(sessionPath, SESSION_TAIL_BYTES);
  return isRuntimeSessionTailActive(text);
}

async function readTail(filePath, maxBytes) {
  const stat = await fs.promises.stat(filePath);
  const length = Math.min(Number(maxBytes) || SESSION_TAIL_BYTES, stat.size);
  if (length <= 0) return "";
  const handle = await fs.promises.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, stat.size - length);
    return buffer.toString("utf8");
  } finally {
    await handle.close();
  }
}

function isRuntimeSessionTailActive(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .filter(Boolean);
  let inspected = 0;
  for (let i = lines.length - 1; i >= 0 && inspected < 120; i -= 1) {
    let record = null;
    try {
      record = JSON.parse(lines[i]);
    } catch (_error) {
      continue;
    }
    inspected += 1;
    const decision = classifyRuntimeRecord(record);
    if (decision !== null) return decision;
  }
  return false;
}

function classifyRuntimeRecord(record) {
  if (!record || typeof record !== "object") return null;
  if (record.type === "turn_context") return true;

  const payload = record.payload || {};
  if (record.type === "event_msg") {
    const eventType = payload.type || "";
    if (
      eventType === "task_complete" ||
      eventType === "turn_aborted" ||
      eventType === "shutdown_complete"
    ) {
      return false;
    }
    if (eventType === "agent_message" && payload.phase === "final_answer") {
      return false;
    }
    if (eventType === "token_count") return null;
    if (eventType) return true;
  }

  if (record.type === "response_item") {
    const item = payload.payload || payload;
    if (item.type === "message" && item.phase === "final_answer") {
      return false;
    }
    if (item.type) return true;
  }

  return null;
}

function isRunningStatus(value) {
  const status = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, "");
  return (
    status === "inprogress" ||
    status === "running" ||
    status === "started" ||
    status === "streaming" ||
    status === "working" ||
    status === "busy"
  );
}

function isTerminalStatus(value) {
  const status = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, "");
  return (
    status === "completed" ||
    status === "failed" ||
    status === "interrupted" ||
    status === "canceled" ||
    status === "cancelled"
  );
}

function threadSignature(thread) {
  if (!thread) return "";
  const turns = Array.isArray(thread.turns) ? thread.turns : [];
  const turnSig = turns.map((turn) => {
    const itemCount = Array.isArray(turn.items) ? turn.items.length : 0;
    return `${turn.id}:${turn.status}:${itemCount}`;
  });
  return JSON.stringify({
    id: thread.id,
    updatedAt: thread.updatedAt,
    title: thread.title,
    displayName: thread.displayName,
    preview: thread.preview,
    turns: turnSig,
  });
}

function isThreadNotFoundError(error) {
  const message =
    error && typeof error.message === "string" ? error.message : String(error || "");
  return /thread not found/i.test(message);
}

function compactObject(input) {
  const out = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (value === null || value === undefined) continue;
    out[key] = value;
  }
  return out;
}

function normalizeThreadStartSource(value) {
  const raw = String(value || "").trim();
  if (raw === "startup" || raw === "clear") return raw;
  return null;
}

function buildThreadListRequestKey(input) {
  const sourceKinds = Array.isArray(input.sourceKinds)
    ? input.sourceKinds.map((item) => String(item)).sort()
    : [];
  const modelProviders = Array.isArray(input.modelProviders)
    ? input.modelProviders.map((item) => String(item)).sort()
    : null;
  return JSON.stringify({
    limit: input.limit,
    archived: input.archived,
    cursor: input.cursor || null,
    sourceKinds,
    modelProviders,
    sortKey: input.sortKey || "updated_at",
    query: input.query || "",
  });
}

module.exports = {
  ThreadSyncService,
  ALL_SOURCE_KINDS,
  _test: {
    classifyRuntimeRecord,
    hasAuthoritativeTerminalTurns,
    isRuntimeSessionTailActive,
    isTerminalStatus,
    parseCodexAppServerPids,
    parseRuntimeSessionFilesFromLsof,
    parseThreadIdFromSessionPath,
  },
};
