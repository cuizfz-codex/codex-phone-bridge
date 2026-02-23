const test = require("node:test");
const assert = require("node:assert/strict");

const { OverlayManager } = require("../src/proxy/overlay-manager");

function textBlock(text) {
  return { type: "text", text };
}

test("OverlayManager enqueues only approval client turns", () => {
  const overlay = new OverlayManager({ approvalClientName: "bridge" });
  const ok1 = overlay.enqueueTurnStart({
    upKey: "u1",
    threadId: "t1",
    input: [textBlock("AAA")],
    createdAt: 123,
    sourceName: "bridge",
  });
  const ok2 = overlay.enqueueTurnStart({
    upKey: "u2",
    threadId: "t1",
    input: [textBlock("BBB")],
    createdAt: 124,
    sourceName: "desktop",
  });

  assert.equal(ok1, true);
  assert.equal(ok2, false);
});

test("OverlayManager materializes from queue without deleting pending (response can still correct)", () => {
  const overlay = new OverlayManager({ approvalClientName: "bridge" });
  overlay.enqueueTurnStart({
    upKey: "u1",
    threadId: "t1",
    input: [textBlock("AAA")],
    createdAt: 1000,
    sourceName: "bridge",
  });

  overlay.materializeFromQueue("t1", "turn-1");

  // pending still present so response can overwrite if needed
  assert.ok(overlay.pendingTurnStartsByUpKey.has("u1"));

  const map = overlay.ephemeralTurnsByThread.get("t1");
  assert.ok(map);
  const rec = map.get("turn-1");
  assert.ok(rec);
  assert.equal(rec.status, "inProgress");
  assert.equal(Array.isArray(rec.input), true);
  assert.equal(rec.input[0].type, "text");
  assert.equal(rec.input[0].text, "AAA");
  assert.deepEqual(rec.input[0].text_elements, []);
});

test("OverlayManager materializes from turn/start response and cleans up pending", () => {
  const overlay = new OverlayManager({ approvalClientName: "bridge" });
  overlay.enqueueTurnStart({
    upKey: "u1",
    threadId: "t1",
    input: [textBlock("AAA")],
    createdAt: 1000,
    sourceName: "bridge",
  });

  // started first
  overlay.materializeFromQueue("t1", "turn-1");
  // response later
  const mat = overlay.materializeFromTurnStartResponse("u1", { turn: { id: "turn-1" } });

  assert.ok(mat);
  assert.equal(overlay.pendingTurnStartsByUpKey.has("u1"), false);
});

test("OverlayManager injectIntoTurnRead adds userMessage if missing", () => {
  const overlay = new OverlayManager({ approvalClientName: "bridge" });
  overlay.enqueueTurnStart({
    upKey: "u1",
    threadId: "t1",
    input: [textBlock("AAA")],
    createdAt: 1000,
    sourceName: "bridge",
  });
  overlay.materializeFromQueue("t1", "turn-1");

  const result = { turn: { id: "turn-1", items: [] } };
  overlay.injectIntoTurnRead(result);

  assert.equal(result.turn.items[0].type, "userMessage");
  assert.equal(result.turn.items[0].id, "overlay-user-turn-1");
  assert.equal(result.turn.items[0].content[0].text, "AAA");
});

test("OverlayManager injectIntoTurnRead corrects mismatched userMessage and keeps authoritative overlay", () => {
  const overlay = new OverlayManager({ approvalClientName: "bridge" });
  overlay.enqueueTurnStart({
    upKey: "u1",
    threadId: "t1",
    input: [textBlock("AAA")],
    createdAt: 1000,
    sourceName: "bridge",
  });
  overlay.materializeFromTurnStartResponse("u1", { turn: { id: "turn-1" } });

  const result = {
    turn: {
      id: "turn-1",
      items: [{ type: "userMessage", id: "user-1", content: [textBlock("OLD")] }],
    },
  };
  overlay.injectIntoTurnRead(result, { requireAuthoritative: true });

  assert.equal(result.turn.items[0].type, "userMessage");
  assert.equal(result.turn.items[0].content[0].text, "AAA");
  assert.equal(overlay.ephemeralThreadByTurnId.has("turn-1"), true);
});

test("OverlayManager drops non-authoritative overlay after upstream userMessage appears", () => {
  const overlay = new OverlayManager({ approvalClientName: "bridge" });
  overlay.enqueueTurnStart({
    upKey: "u1",
    threadId: "t1",
    input: [textBlock("AAA")],
    createdAt: 1000,
    sourceName: "bridge",
  });
  overlay.materializeFromQueue("t1", "turn-1");

  const result = {
    turn: {
      id: "turn-1",
      items: [{ type: "userMessage", id: "user-1", content: [textBlock("OLD")] }],
    },
  };
  overlay.injectIntoTurnRead(result, { requireAuthoritative: false });

  assert.equal(overlay.ephemeralThreadByTurnId.has("turn-1"), false);
});

test("OverlayManager requireAuthoritative gate skips non-authoritative overlays", () => {
  const overlay = new OverlayManager({ approvalClientName: "bridge" });
  overlay.enqueueTurnStart({
    upKey: "u1",
    threadId: "t1",
    input: [textBlock("AAA")],
    createdAt: 1000,
    sourceName: "bridge",
  });
  // Queue materialization is non-authoritative (best-effort).
  overlay.materializeFromQueue("t1", "turn-1");

  const r1 = { turn: { id: "turn-1", items: [] } };
  overlay.injectIntoTurnRead(r1, { requireAuthoritative: true });
  assert.equal(r1.turn.items.length, 0);

  // Response materialization upgrades to authoritative.
  overlay.materializeFromTurnStartResponse("u1", { turn: { id: "turn-1" } });
  const r2 = { turn: { id: "turn-1", items: [] } };
  overlay.injectIntoTurnRead(r2, { requireAuthoritative: true });
  assert.equal(r2.turn.items[0].type, "userMessage");
  assert.equal(r2.turn.items[0].id, "overlay-user-turn-1");
  assert.equal(r2.turn.items[0].content[0].text, "AAA");
});
