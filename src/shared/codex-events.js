function safeString(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function firstNonEmpty(...values) {
  for (const v of values) {
    const s = safeString(v).trim();
    if (s) return s;
  }
  return "";
}

function extractThreadTurnIds(method, params) {
  const m = safeString(method).trim();
  const p = params && typeof params === "object" ? params : {};

  // "Normalized" RPC notifications typically include threadId/turnId directly.
  const normalizedThreadId = firstNonEmpty(p.threadId, p.thread_id, p.thread && p.thread.id);
  const normalizedTurnId = firstNonEmpty(p.turnId, p.turn_id, p.turn && p.turn.id);
  const normalizedItemId = firstNonEmpty(p.itemId, p.item_id, p.item && p.item.id);
  if (normalizedThreadId || normalizedTurnId || normalizedItemId) {
    return {
      threadId: normalizedThreadId || null,
      turnId: normalizedTurnId || null,
      itemId: normalizedItemId || null,
      variant: "normalized",
    };
  }

  // Raw "codex/event/*" notifications embed identifiers under params.msg.
  const msg = p.msg && typeof p.msg === "object" ? p.msg : null;
  if (m.startsWith("codex/event/") || msg) {
    const threadId = firstNonEmpty(
      msg && (msg.thread_id || msg.threadId),
      p.conversationId,
      p.threadId
    );
    const turnId = firstNonEmpty(msg && (msg.turn_id || msg.turnId));
    const itemId = firstNonEmpty(
      msg && msg.item_id,
      msg && msg.item && msg.item.id
    );
    if (threadId || turnId || itemId) {
      return {
        threadId: threadId || null,
        turnId: turnId || null,
        itemId: itemId || null,
        variant: "codex_event",
      };
    }
  }

  return { threadId: null, turnId: null, itemId: null, variant: "unknown" };
}

function classifyTurnLifecycle(method, params) {
  const m = safeString(method).trim();
  if (!m) return null;

  // Normalized lifecycle notifications
  if (m === "turn/started" || m === "task/started" || m === "task_started") {
    return "turnStarted";
  }
  if (
    m === "turn/completed" ||
    m === "task/completed" ||
    m === "task_complete" ||
    m === "taskCompleted"
  ) {
    return "turnCompleted";
  }
  if (
    m === "turn/interrupted" ||
    m === "task/interrupted" ||
    m === "task_interrupted" ||
    m === "taskInterrupted"
  ) {
    return "turnInterrupted";
  }

  // Raw events: codex/event/*
  if (m.startsWith("codex/event/")) {
    const p = params && typeof params === "object" ? params : {};
    const msg = p.msg && typeof p.msg === "object" ? p.msg : {};
    const type = safeString(msg.type || m.slice("codex/event/".length))
      .trim()
      .toLowerCase();

    if (type === "turn_started" || type === "task_started") return "turnStarted";
    if (type === "turn_complete" || type === "task_complete") return "turnCompleted";
    if (type === "turn_interrupted" || type === "task_interrupted") return "turnInterrupted";
  }

  return null;
}

module.exports = {
  extractThreadTurnIds,
  classifyTurnLifecycle,
};

