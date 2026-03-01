const { EventEmitter } = require("events");

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
      result.data.map((item) => [item.id, item.updatedAt, item.preview])
    );
    const oldSignature = JSON.stringify(
      this.listCache.data.map((item) => [item.id, item.updatedAt, item.preview])
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

    if (!query) {
      const result = await this.rpc.request("thread/list", {
        cursor,
        limit,
        archived,
        sourceKinds,
        modelProviders,
        sortKey,
      });
      return normalizeThreadListResponse(result);
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
    return {
      data: collected,
      nextCursor: pageCursor,
    };
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
    return thread;
  }

  async startThread(params = {}) {
    const payload = {
      model: params.model || null,
      modelProvider: params.modelProvider || null,
      cwd: params.cwd || null,
      approvalPolicy: params.approvalPolicy || null,
      sandbox: params.sandbox || null,
      config: params.config || null,
      baseInstructions: params.baseInstructions || null,
      developerInstructions: params.developerInstructions || null,
      personality: params.personality || null,
      ephemeral: params.ephemeral || false,
      experimentalRawEvents: Boolean(params.experimentalRawEvents || false),
    };
    return this.rpc.request("thread/start", payload);
  }

  async startTurn(threadId, input, overrides = {}) {
    const threadKey = String(threadId);
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
        sandbox: overrides.sandbox || null,
        config: overrides.config || null,
        baseInstructions: overrides.baseInstructions || null,
        developerInstructions: overrides.developerInstructions || null,
        personality: overrides.personality || null,
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
      sandbox: overrides.sandbox || null,
      config: overrides.config || null,
      baseInstructions: overrides.baseInstructions || null,
      developerInstructions: overrides.developerInstructions || null,
    });
  }

  handleRpcNotification(notification) {
    const method = notification.method;
    const params = notification.params || {};
    const threadId = params.threadId || (params.thread && params.thread.id) || null;

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
  return thread.turns.some((turn) => turn && turn.status === "inProgress");
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

module.exports = {
  ThreadSyncService,
  ALL_SOURCE_KINDS,
};
