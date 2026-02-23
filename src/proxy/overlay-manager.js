const { deepCloneJson } = require("../shared/clone");
const { safeJsonStringify } = require("../shared/json");

function normalizeTextInputBlocks(input) {
  const items = Array.isArray(input) ? input : [];
  return items.map((block) => {
    if (!block || typeof block !== "object") return block;
    const type = block.type ? String(block.type) : "";
    if (type !== "text") return block;
    const text = typeof block.text === "string" ? block.text : String(block.text || "");
    return {
      ...block,
      type: "text",
      text,
      // Some Codex payloads include this field; keeping it stable avoids UI churn.
      text_elements: Array.isArray(block.text_elements) ? block.text_elements : [],
    };
  });
}

function signatureForInputBlocks(input) {
  const normalized = normalizeTextInputBlocks(
    Array.isArray(input) ? deepCloneJson(input) : []
  );
  return safeJsonStringify(normalized);
}

class OverlayManager {
  constructor(options = {}) {
    this.approvalClientName =
      String(options.approvalClientName || "codex-phone-bridge").trim() ||
      "codex-phone-bridge";
    this.debugLog = typeof options.debugLog === "function" ? options.debugLog : () => {};

    // pending turn/start records keyed by upstream request id (jsonIdKey).
    this.pendingTurnStartsByUpKey = new Map(); // upKey -> { threadId, input, inputSig, createdAt }
    this.pendingTurnStartQueues = new Map(); // threadId -> upKey[]
    this.ephemeralTurnsByThread = new Map(); // threadId -> Map(turnId -> { input, inputSig, createdAt, status, authoritative })
    this.ephemeralThreadByTurnId = new Map(); // turnId -> threadId
  }

  status() {
    let queuedEntries = 0;
    for (const queue of this.pendingTurnStartQueues.values()) {
      if (Array.isArray(queue)) queuedEntries += queue.length;
    }
    let ephemeralTurns = 0;
    for (const map of this.ephemeralTurnsByThread.values()) {
      if (map && typeof map === "object" && typeof map.size === "number") ephemeralTurns += map.size;
    }
    return {
      pendingTurnStarts: this.pendingTurnStartsByUpKey.size,
      queuedThreads: this.pendingTurnStartQueues.size,
      queuedEntries,
      ephemeralThreads: this.ephemeralTurnsByThread.size,
      ephemeralTurns,
    };
  }

  enqueueTurnStart({ upKey, threadId, input, createdAt, sourceName }) {
    const keyUp = String(upKey || "");
    const keyThread = String(threadId || "");
    const source = String(sourceName || "");
    if (!keyUp || !keyThread) return false;
    if (source !== this.approvalClientName) return false;

    const normalizedInput = normalizeTextInputBlocks(
      Array.isArray(input) ? deepCloneJson(input) : []
    );
    const record = {
      threadId: keyThread,
      input: normalizedInput,
      inputSig: safeJsonStringify(normalizedInput),
      createdAt: Number(createdAt || Date.now()),
    };
    this.pendingTurnStartsByUpKey.set(keyUp, record);
    let queue = this.pendingTurnStartQueues.get(keyThread);
    if (!queue) {
      queue = [];
      this.pendingTurnStartQueues.set(keyThread, queue);
    }
    queue.push(keyUp);
    this.debugLog(
      `[overlay] turn/start enqueue thread=${keyThread} upKey=${keyUp} queueLen=${queue.length}`
    );
    return true;
  }

  dropPendingTurnStart(upKey) {
    const keyUp = String(upKey || "");
    if (!keyUp) return;
    const rec = this.pendingTurnStartsByUpKey.get(keyUp) || null;
    if (rec) this.pendingTurnStartsByUpKey.delete(keyUp);
    if (!rec || !rec.threadId) return;

    const queue = this.pendingTurnStartQueues.get(rec.threadId);
    if (!Array.isArray(queue) || queue.length === 0) return;
    const idx = queue.indexOf(keyUp);
    if (idx >= 0) queue.splice(idx, 1);
    if (queue.length === 0) this.pendingTurnStartQueues.delete(rec.threadId);
  }

  markTurnStatus(threadId, turnId, status) {
    const keyThread = String(threadId || "");
    const keyTurn = String(turnId || "");
    if (!keyThread || !keyTurn) return;
    const map = this.ephemeralTurnsByThread.get(keyThread);
    const rec = map ? map.get(keyTurn) : null;
    if (!rec) return;
    rec.status = String(status || rec.status || "completed");
  }

  getTurnRecord(threadId, turnId) {
    const keyThread = String(threadId || "");
    const keyTurn = String(turnId || "");
    if (!keyThread || !keyTurn) return null;
    const map = this.ephemeralTurnsByThread.get(keyThread);
    if (!map) return null;
    return map.get(keyTurn) || null;
  }

  _getEphemeralMap(threadId) {
    const key = String(threadId || "");
    if (!key) return null;
    let map = this.ephemeralTurnsByThread.get(key);
    if (!map) {
      map = new Map();
      this.ephemeralTurnsByThread.set(key, map);
    }
    return map;
  }

  _materializeEphemeralTurn(threadId, turnId, record, { overwrite, authoritative }) {
    const keyThread = String(threadId || "");
    const keyTurn = String(turnId || "");
    if (!keyThread || !keyTurn) return { changed: false, overwritten: false };
    if (!record || typeof record !== "object") return { changed: false, overwritten: false };

    const map = this._getEphemeralMap(keyThread);
    if (!map) return { changed: false, overwritten: false };

    const existing = map.get(keyTurn) || null;
    const nextInput = Array.isArray(record.input) ? deepCloneJson(record.input) : [];
    const nextSig = record.inputSig ? String(record.inputSig) : safeJsonStringify(nextInput);
    const nextCreatedAt = Number(record.createdAt || Date.now());
    const overwriteOk = Boolean(overwrite);
    const nextAuthoritative = Boolean(authoritative);

    if (!existing) {
      map.set(keyTurn, {
        input: nextInput,
        inputSig: nextSig,
        createdAt: nextCreatedAt,
        status: "inProgress",
        authoritative: nextAuthoritative,
      });
      this.ephemeralThreadByTurnId.set(keyTurn, keyThread);
      return { changed: true, overwritten: false };
    }

    if (!overwriteOk) return { changed: false, overwritten: false };

    const prevSig = existing.inputSig
      ? String(existing.inputSig)
      : safeJsonStringify(Array.isArray(existing.input) ? existing.input : []);
    if (prevSig === nextSig) {
      // Even if the input did not change, response-based materialization should be able to
      // "upgrade" a non-authoritative overlay (queue guess) into an authoritative one.
      if (nextAuthoritative && !existing.authoritative) {
        existing.authoritative = true;
        return { changed: true, overwritten: true };
      }
      return { changed: false, overwritten: false };
    }

    const prevStatus = String(existing.status || "inProgress");
    const preserveStatus = prevStatus === "completed" || prevStatus === "interrupted";
    existing.input = nextInput;
    existing.inputSig = nextSig;
    existing.createdAt = nextCreatedAt;
    if (!preserveStatus) existing.status = "inProgress";
    if (nextAuthoritative) existing.authoritative = true;
    this.ephemeralThreadByTurnId.set(keyTurn, keyThread);
    return { changed: true, overwritten: true };
  }

  materializeFromQueue(threadId, turnId) {
    const keyThread = String(threadId || "");
    const keyTurn = String(turnId || "");
    if (!keyThread || !keyTurn) {
      return { matched: false, reason: "invalid-key" };
    }

    // If already materialized (response arrived first), don't consume the queue.
    const existingThread = this.ephemeralThreadByTurnId.get(keyTurn);
    if (existingThread && String(existingThread) === keyThread) {
      return {
        matched: false,
        reason: "already-materialized",
        threadId: keyThread,
        turnId: keyTurn,
        record: this.getTurnRecord(keyThread, keyTurn),
      };
    }

    const queue = this.pendingTurnStartQueues.get(keyThread);
    if (!Array.isArray(queue) || queue.length === 0) {
      return { matched: false, reason: "queue-empty", threadId: keyThread, turnId: keyTurn };
    }

    while (queue.length > 0) {
      const upKey = queue.shift();
      const rec = this.pendingTurnStartsByUpKey.get(upKey);
      this.debugLog(
        `[overlay] turn/started dequeue thread=${keyThread} turn=${keyTurn} upKey=${upKey} rec=${
          rec ? "1" : "0"
        } queueLen=${queue.length}`
      );
      if (!rec) continue;
      const materialized = this._materializeEphemeralTurn(keyThread, keyTurn, rec, {
        overwrite: false,
        authoritative: false,
      });
      return {
        matched: true,
        reason: "dequeued",
        threadId: keyThread,
        turnId: keyTurn,
        upKey,
        changed: materialized.changed,
        overwritten: materialized.overwritten,
        record: deepCloneJson(rec),
      };
    }

    if (queue.length === 0) {
      this.pendingTurnStartQueues.delete(keyThread);
    }
    return {
      matched: false,
      reason: "queue-depleted",
      threadId: keyThread,
      turnId: keyTurn,
    };
  }

  materializeFromTurnStartResponse(upKey, result) {
    const keyUp = String(upKey || "");
    if (!keyUp) {
      return { matched: false, reason: "invalid-upKey" };
    }
    const record = this.pendingTurnStartsByUpKey.get(keyUp);
    if (!record) {
      return { matched: false, reason: "missing-record" };
    }

    const turnObj = result && typeof result === "object" ? result.turn : null;
    const turnId = String(turnObj && turnObj.id ? turnObj.id : "");
    const threadId = String(record.threadId || "");
    if (!threadId || !turnId) {
      return { matched: false, reason: "missing-ids", threadId, turnId };
    }

    const mat = this._materializeEphemeralTurn(threadId, turnId, record, {
      overwrite: true,
      authoritative: true,
    });

    const queue = this.pendingTurnStartQueues.get(threadId);
    if (Array.isArray(queue) && queue.length > 0) {
      const idx = queue.indexOf(keyUp);
      if (idx >= 0) queue.splice(idx, 1);
      if (queue.length === 0) this.pendingTurnStartQueues.delete(threadId);
    }
    this.pendingTurnStartsByUpKey.delete(keyUp);

    return {
      matched: true,
      reason: "response-materialized",
      threadId,
      turnId,
      changed: mat.changed,
      overwritten: mat.overwritten,
      upKey: keyUp,
      record: deepCloneJson(record),
      queuePruned: true,
    };
  }

  injectIntoThreadList(result, options = {}) {
    if (!result || typeof result !== "object") return;
    const requireAuthoritative = Boolean(options.requireAuthoritative);
    const data = Array.isArray(result.data) ? result.data : null;
    if (!data) return;

    for (const thread of data) {
      if (!thread || typeof thread !== "object") continue;
      const threadId = thread.id ? String(thread.id) : "";
      if (!threadId) continue;
      const map = this.ephemeralTurnsByThread.get(threadId);
      if (!map || map.size === 0) continue;

      let latest = null;
      for (const rec of map.values()) {
        if (!rec || typeof rec !== "object") continue;
        if (requireAuthoritative && !rec.authoritative) continue;
        if (!latest || Number(rec.createdAt || 0) > Number(latest.createdAt || 0)) {
          latest = rec;
        }
      }
      if (!latest) continue;

      const createdAtSec = Math.floor(Number(latest.createdAt || Date.now()) / 1000);
      const baseUpdatedAt = Number(thread.updatedAt || 0);
      if (Number.isFinite(createdAtSec) && createdAtSec > baseUpdatedAt) {
        thread.updatedAt = createdAtSec;
      }

      const input = Array.isArray(latest.input) ? latest.input : [];
      const textPart = input.find((i) => i && i.type === "text" && i.text);
      if (textPart && typeof textPart.text === "string") {
        const nextPreview = String(textPart.text).trim();
        if (nextPreview) thread.preview = nextPreview;
      }
    }
  }

  injectIntoTurnRead(result, options = {}) {
    if (!result || typeof result !== "object") return;
    const requireAuthoritative = Boolean(options.requireAuthoritative);
    const turn = result.turn;
    if (!turn || typeof turn !== "object") return;
    const turnId = turn.id ? String(turn.id) : "";
    if (!turnId) return;

    const threadId = this.ephemeralThreadByTurnId.get(turnId);
    if (!threadId) return;
    const map = this.ephemeralTurnsByThread.get(threadId);
    const rec = map ? map.get(turnId) : null;
    if (!rec) {
      this.ephemeralThreadByTurnId.delete(turnId);
      return;
    }

    const items = Array.isArray(turn.items) ? turn.items : null;
    const userIndex = items
      ? items.findIndex((it) => it && it.type === "userMessage")
      : -1;
    if (userIndex >= 0) {
      // Upstream included a userMessage item; ensure it matches authoritative overlay.
      if (rec.authoritative) {
        const existingSig = signatureForInputBlocks(
          items[userIndex] && items[userIndex].content
        );
        const expectedSig = rec.inputSig
          ? String(rec.inputSig)
          : signatureForInputBlocks(rec.input);
        if (existingSig !== expectedSig) {
          items[userIndex].content = Array.isArray(rec.input) ? deepCloneJson(rec.input) : [];
        }
      } else {
        // Non-authoritative queue guesses are only useful until upstream catches up.
        map.delete(turnId);
        this.ephemeralThreadByTurnId.delete(turnId);
        if (map.size === 0) {
          this.ephemeralTurnsByThread.delete(threadId);
        }
      }
      return;
    }

    if (requireAuthoritative && !rec.authoritative) return;

    const userItem = {
      type: "userMessage",
      id: `overlay-user-${turnId}`,
      content: Array.isArray(rec.input) ? deepCloneJson(rec.input) : [],
    };
    if (items) items.unshift(userItem);
    else turn.items = [userItem];

    if (!turn.status && rec.status) {
      turn.status = rec.status;
    }
  }

  injectIntoThreadRead(threadId, result, options = {}) {
    const keyThread = String(threadId || "");
    if (!keyThread || !result || typeof result !== "object") return;
    const requireAuthoritative = Boolean(options.requireAuthoritative);
    const thread = result.thread;
    if (!thread || typeof thread !== "object") return;
    if (!Array.isArray(thread.turns)) return;

    const ephemeral = this.ephemeralTurnsByThread.get(keyThread);
    if (!ephemeral || ephemeral.size === 0) return;

    // Preserve upstream ordering when injecting ephemeral turns.
    const inferDescending = () => {
      const ids = [];
      for (const t of thread.turns) {
        const id = t && t.id ? String(t.id) : "";
        if (id) ids.push(id);
        if (ids.length >= 12) break;
      }
      if (ids.length < 2) return true; // default newest-first
      let desc = 0;
      let asc = 0;
      for (let i = 1; i < ids.length; i += 1) {
        if (ids[i - 1] > ids[i]) desc += 1;
        else if (ids[i - 1] < ids[i]) asc += 1;
      }
      if (desc === 0 && asc === 0) return true;
      return desc >= asc;
    };
    const descending = inferDescending();

    const turnById = new Map();
    for (const t of thread.turns) {
      const id = t && t.id ? String(t.id) : "";
      if (!id) continue;
      if (!turnById.has(id)) turnById.set(id, t);
    }

    const toAdd = [];
    for (const [turnId, rec] of ephemeral.entries()) {
      if (!turnId) continue;
      const existingTurn = turnById.get(turnId) || null;
      if (!existingTurn) {
        if (!requireAuthoritative || rec.authoritative) {
          toAdd.push({ turnId, rec });
        }
        continue;
      }

      const items = Array.isArray(existingTurn.items) ? existingTurn.items : null;
      const userIndex = items
        ? items.findIndex((it) => it && it.type === "userMessage")
        : -1;
      if (userIndex < 0) {
        if (requireAuthoritative && !rec.authoritative) {
          continue;
        }
        const userItem = {
          type: "userMessage",
          id: `overlay-user-${turnId}`,
          content: Array.isArray(rec.input) ? deepCloneJson(rec.input) : [],
        };
        if (items) items.unshift(userItem);
        else existingTurn.items = [userItem];
        continue;
      }

      // Upstream now includes a userMessage item; ensure it matches authoritative overlay.
      if (rec.authoritative) {
        const existingSig = signatureForInputBlocks(
          items[userIndex] && items[userIndex].content
        );
        const expectedSig = rec.inputSig
          ? String(rec.inputSig)
          : signatureForInputBlocks(rec.input);
        if (existingSig !== expectedSig) {
          items[userIndex].content = Array.isArray(rec.input) ? deepCloneJson(rec.input) : [];
        }
      } else {
        // Non-authoritative queue guesses should not outlive upstream persistence.
        ephemeral.delete(turnId);
        this.ephemeralThreadByTurnId.delete(turnId);
      }
    }
    if (ephemeral.size === 0) {
      this.ephemeralTurnsByThread.delete(keyThread);
    }
    if (toAdd.length === 0) return;

    // Sort injections in the same direction as upstream.
    toAdd.sort((a, b) => {
      const aAt = Number(a.rec.createdAt || 0);
      const bAt = Number(b.rec.createdAt || 0);
      return descending ? bAt - aAt : aAt - bAt;
    });

    const baseUpdatedAt = Number(thread.updatedAt || 0);
    let newestUpdatedAt = baseUpdatedAt;

    for (const { turnId, rec } of toAdd) {
      const createdAtSec = Math.floor(Number(rec.createdAt || Date.now()) / 1000);
      newestUpdatedAt = Math.max(newestUpdatedAt, createdAtSec);
      const injected = {
        id: String(turnId),
        items: [
          {
            type: "userMessage",
            id: `overlay-user-${turnId}`,
            content: Array.isArray(rec.input) ? deepCloneJson(rec.input) : [],
          },
        ],
        status: rec.status || "inProgress",
        error: null,
      };

      const injectedId = String(turnId);
      let insertAt = thread.turns.length;
      if (descending) {
        for (let i = 0; i < thread.turns.length; i += 1) {
          const existingId =
            thread.turns[i] && thread.turns[i].id ? String(thread.turns[i].id) : "";
          if (!existingId) continue;
          if (existingId < injectedId) {
            insertAt = i;
            break;
          }
        }
      } else {
        for (let i = 0; i < thread.turns.length; i += 1) {
          const existingId =
            thread.turns[i] && thread.turns[i].id ? String(thread.turns[i].id) : "";
          if (!existingId) continue;
          if (existingId > injectedId) {
            insertAt = i;
            break;
          }
        }
      }
      thread.turns.splice(insertAt, 0, injected);
    }

    if (Number.isFinite(newestUpdatedAt) && newestUpdatedAt > baseUpdatedAt) {
      thread.updatedAt = newestUpdatedAt;
    }
    if (toAdd.length > 0) {
      let latest = null;
      for (const entry of toAdd) {
        if (!latest || Number(entry.rec.createdAt || 0) > Number(latest.createdAt || 0)) {
          latest = entry.rec;
        }
      }
      const input = latest && Array.isArray(latest.input) ? latest.input : [];
      const textPart = input.find((i) => i && i.type === "text" && i.text);
      if (textPart && typeof textPart.text === "string") {
        thread.preview = String(textPart.text).trim() || thread.preview;
      }
    }
  }

  cleanup(now = Date.now()) {
    const staleStartMs = 3 * 60 * 1000;
    for (const [upKey, rec] of this.pendingTurnStartsByUpKey.entries()) {
      if (!rec || typeof rec !== "object") {
        this.pendingTurnStartsByUpKey.delete(upKey);
        continue;
      }
      if (now - Number(rec.createdAt || 0) <= staleStartMs) continue;
      this.pendingTurnStartsByUpKey.delete(upKey);
    }
    for (const [threadId, queue] of this.pendingTurnStartQueues.entries()) {
      if (!Array.isArray(queue) || queue.length === 0) {
        this.pendingTurnStartQueues.delete(threadId);
        continue;
      }
      const filtered = queue.filter((upKey) => this.pendingTurnStartsByUpKey.has(upKey));
      if (filtered.length === 0) this.pendingTurnStartQueues.delete(threadId);
      else if (filtered.length !== queue.length) this.pendingTurnStartQueues.set(threadId, filtered);
    }

    const staleEphemeralMs = 60 * 60 * 1000;
    for (const [threadId, map] of this.ephemeralTurnsByThread.entries()) {
      if (!map || typeof map !== "object" || map.size === 0) {
        this.ephemeralTurnsByThread.delete(threadId);
        continue;
      }
      for (const [turnId, rec] of map.entries()) {
        if (!rec || typeof rec !== "object") {
          map.delete(turnId);
          this.ephemeralThreadByTurnId.delete(turnId);
          continue;
        }
        if (now - Number(rec.createdAt || 0) > staleEphemeralMs) {
          map.delete(turnId);
          this.ephemeralThreadByTurnId.delete(turnId);
        }
      }
      if (map.size === 0) this.ephemeralTurnsByThread.delete(threadId);
    }
  }
}

module.exports = {
  OverlayManager,
  normalizeTextInputBlocks,
};
