const test = require("node:test");
const assert = require("node:assert/strict");

const { extractThreadTurnIds, classifyTurnLifecycle } = require("../src/shared/codex-events");

test("extractThreadTurnIds: normalized ids", () => {
  const out = extractThreadTurnIds("turn/started", {
    threadId: "t1",
    turnId: "u1",
    itemId: "i1",
  });
  assert.equal(out.variant, "normalized");
  assert.equal(out.threadId, "t1");
  assert.equal(out.turnId, "u1");
  assert.equal(out.itemId, "i1");
});

test("extractThreadTurnIds: codex/event ids", () => {
  const out = extractThreadTurnIds("codex/event/turn_started", {
    msg: {
      type: "turn_started",
      thread_id: "t2",
      turn_id: "u2",
      item_id: "i2",
    },
  });
  assert.equal(out.variant, "codex_event");
  assert.equal(out.threadId, "t2");
  assert.equal(out.turnId, "u2");
  assert.equal(out.itemId, "i2");
});

test("classifyTurnLifecycle: normalized methods", () => {
  assert.equal(classifyTurnLifecycle("turn/started", {}), "turnStarted");
  assert.equal(classifyTurnLifecycle("turn/completed", {}), "turnCompleted");
  assert.equal(classifyTurnLifecycle("turn/interrupted", {}), "turnInterrupted");
});

test("classifyTurnLifecycle: codex/event methods", () => {
  assert.equal(
    classifyTurnLifecycle("codex/event/turn_started", { msg: { type: "turn_started" } }),
    "turnStarted"
  );
  assert.equal(
    classifyTurnLifecycle("codex/event/task_complete", { msg: { type: "task_complete" } }),
    "turnCompleted"
  );
  assert.equal(
    classifyTurnLifecycle("codex/event/task_interrupted", { msg: { type: "task_interrupted" } }),
    "turnInterrupted"
  );
});

