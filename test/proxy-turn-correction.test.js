const test = require("node:test");
const assert = require("node:assert/strict");

const { CodexWsProxy } = require("../src/codex-ws-proxy");

function createProxy() {
  const logger = {
    log() {},
    warn() {},
    error() {},
  };
  return new CodexWsProxy({
    listenHost: "127.0.0.1",
    listenPort: 0,
    spawnUpstream: false,
    desktopOverlayMode: "authoritative",
    logger,
    debug: false,
  });
}

function textBlock(text) {
  return { type: "text", text };
}

function materializeAuthoritativeTurn(proxy, threadId, turnId, text) {
  const upKey = `up-${threadId}-${turnId}`;
  proxy.overlay.enqueueTurnStart({
    upKey,
    threadId,
    input: [textBlock(text)],
    createdAt: Date.now(),
    sourceName: "codex-phone-bridge",
  });
  proxy.overlay.materializeFromTurnStartResponse(upKey, {
    turn: {
      id: turnId,
      status: "inProgress",
    },
  });
}

test("turn started state never downgrades from hadUserMessage=true to false", () => {
  const proxy = createProxy();

  proxy._trackTurnStartedState({
    method: "turn/started",
    threadId: "t1",
    turnId: "turn-1",
    hadUserMessage: true,
    userInput: [textBlock("2+2?")],
    corrected: true,
    correctedByQueue: false,
  });

  // Simulate a later legacy variant that still misses userMessage.
  proxy._trackTurnStartedState({
    method: "codex/event/turn_started",
    threadId: "t1",
    turnId: "turn-1",
    hadUserMessage: false,
    userInput: null,
    corrected: false,
    correctedByQueue: false,
  });

  const state = proxy.turnStartedBroadcastState.get("t1::turn-1");
  assert.ok(state);
  assert.equal(state.hadUserMessage, true);
  assert.equal(Boolean(state.inputSig), true);
  assert.equal(state.corrected, true);
});

test("response correction emits desktop fix even when turn/started state does not exist yet", () => {
  const proxy = createProxy();
  const calls = [];
  proxy._broadcastDesktopUserMessageEvent = (...args) => calls.push(["user", ...args]);
  proxy._broadcastUserMessageItemForDesktop = (...args) => calls.push(["item", ...args]);
  proxy._broadcastTurnStartedCorrection = (...args) => calls.push(["turn", ...args]);

  proxy._handleTurnStartResponseCorrection(
    {
      matched: true,
      threadId: "t1",
      turnId: "turn-2",
      record: {
        input: [textBlock("3+3?")],
        status: "inProgress",
      },
    },
    { turn: { id: "turn-2", status: "inProgress" } }
  );

  const userCalls = calls.filter((c) => c[0] === "user");
  const itemCalls = calls.filter((c) => c[0] === "item");
  const turnCalls = calls.filter((c) => c[0] === "turn");
  assert.equal(userCalls.length, 1);
  assert.equal(itemCalls.length, 1);
  assert.equal(turnCalls.length, 2);
  assert.equal(turnCalls[0][5] && turnCalls[0][5].variant, "normalized");
  assert.equal(turnCalls[1][5] && turnCalls[1][5].variant, "codex_event");

  const state = proxy.turnStartedBroadcastState.get("t1::turn-2");
  assert.ok(state);
  assert.equal(state.hadUserMessage, true);
  assert.equal(state.corrected, true);
});

test("desktop correction emits codex/event/user_message with plain text", () => {
  const proxy = createProxy();
  const sent = [];
  proxy._sendToDesktopClients = (obj) => sent.push(obj);
  proxy._broadcastUserMessageItemForDesktop = () => {};
  proxy._broadcastTurnStartedCorrection = () => {};

  const changed = proxy._emitDesktopAuthoritativeCorrection(
    "t1",
    "turn-4",
    [textBlock("2+2等于多少")],
    "inProgress"
  );

  assert.equal(changed, true);
  const msg = sent.find((entry) => entry && entry.method === "codex/event/user_message");
  assert.ok(msg);
  assert.equal(msg.params && msg.params.id, "turn-4");
  assert.equal(msg.params && msg.params.conversationId, "t1");
  assert.equal(msg.params && msg.params.msg && msg.params.msg.thread_id, "t1");
  assert.equal(msg.params && msg.params.msg && msg.params.msg.turn_id, "turn-4");
  assert.equal(msg.params && msg.params.msg && msg.params.msg.message, "2+2等于多少");
});

test("codex/event turn correction includes canonical ids", () => {
  const proxy = createProxy();
  const sent = [];
  proxy._sendToDesktopClients = (obj) => sent.push(obj);

  proxy._broadcastTurnStartedCorrection("t2", "turn-5", [textBlock("hello")], "inProgress", {
    variant: "codex_event",
  });

  const msg = sent.find((entry) => entry && entry.method === "codex/event/turn_started");
  assert.ok(msg);
  assert.equal(msg.params && msg.params.id, "turn-5");
  assert.equal(msg.params && msg.params.conversationId, "t2");
  assert.equal(msg.params && msg.params.msg && msg.params.msg.thread_id, "t2");
  assert.equal(msg.params && msg.params.msg && msg.params.msg.turn_id, "turn-5");
});

test("desktop userMessage item correction emits canonical codex/event item shape", () => {
  const proxy = createProxy();
  const sent = [];
  proxy._sendToDesktopClients = (obj) => sent.push(obj);

  proxy._broadcastUserMessageItemForDesktop("t3", "turn-6", [textBlock("world")]);

  const started = sent.find((entry) => entry && entry.method === "codex/event/item_started");
  const completed = sent.find((entry) => entry && entry.method === "codex/event/item_completed");
  assert.ok(started);
  assert.ok(completed);
  assert.equal(started.params && started.params.id, "turn-6");
  assert.equal(started.params && started.params.conversationId, "t3");
  assert.equal(
    started.params &&
      started.params.msg &&
      started.params.msg.item &&
      started.params.msg.item.type,
    "UserMessage"
  );
  assert.equal(completed.params && completed.params.id, "turn-6");
  assert.equal(completed.params && completed.params.conversationId, "t3");
});

test("aligns codex/event userMessage item notification to authoritative input", () => {
  const proxy = createProxy();
  materializeAuthoritativeTurn(proxy, "t4", "turn-7", "new text");

  const msg = {
    method: "codex/event/item_started",
    params: {
      msg: {
        type: "item_started",
        thread_id: "t4",
        turn_id: "turn-7",
        item: {
          type: "UserMessage",
          id: "item-7",
          content: [textBlock("old text")],
        },
      },
    },
  };

  const changed = proxy._maybeAlignUserMessageItemNotification(msg);
  assert.equal(changed, true);
  assert.equal(
    msg.params &&
      msg.params.msg &&
      msg.params.msg.item &&
      msg.params.msg.item.content &&
      msg.params.msg.item.content[0] &&
      msg.params.msg.item.content[0].text,
    "new text"
  );
});

test("aligns codex/event user_message text to authoritative input", () => {
  const proxy = createProxy();
  materializeAuthoritativeTurn(proxy, "t5", "turn-8", "fresh text");

  const msg = {
    method: "codex/event/user_message",
    params: {
      id: "turn-8",
      conversationId: "t5",
      msg: {
        type: "user_message",
        message: "stale text",
      },
    },
  };

  const changed = proxy._maybeAlignUserMessageTextNotification(msg);
  assert.equal(changed, true);
  assert.equal(msg.params && msg.params.msg && msg.params.msg.message, "fresh text");
});

test("authoritative mapping survives turn/read before late user_message notification", () => {
  const proxy = createProxy();
  materializeAuthoritativeTurn(proxy, "t6", "turn-9", "latest prompt");

  // Simulate bridge reading turn data first (this previously dropped authoritative overlay).
  const turnRead = {
    turn: {
      id: "turn-9",
      items: [{ type: "userMessage", id: "user-9", content: [textBlock("latest prompt")] }],
    },
  };
  proxy.overlay.injectIntoTurnRead(turnRead, { requireAuthoritative: false });

  const msg = {
    method: "codex/event/user_message",
    params: {
      id: "turn-9",
      conversationId: "t6",
      msg: {
        type: "user_message",
        message: "stale previous prompt",
      },
    },
  };
  const changed = proxy._maybeAlignUserMessageTextNotification(msg);
  assert.equal(changed, true);
  assert.equal(msg.params && msg.params.msg && msg.params.msg.message, "latest prompt");
});

test("augment turn started supports codex/event payloads", () => {
  const proxy = createProxy();
  const msg = {
    method: "codex/event/turn_started",
    params: {
      msg: {
        type: "turn_started",
        thread_id: "t1",
        turn_id: "turn-3",
      },
    },
  };

  const changed = proxy._augmentTurnStartedNotification(msg, "t1", "turn-3", {
    input: [textBlock("4+4?")],
  });

  assert.equal(changed, true);
  assert.equal(msg.params.msg.item_id, "overlay-user-turn-3");
  assert.equal(msg.params.msg.item.type, "userMessage");
  assert.equal(msg.params.msg.turn.items[0].type, "userMessage");
  assert.equal(msg.params.msg.turn.items[0].content[0].text, "4+4?");
});
