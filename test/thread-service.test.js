const test = require("node:test");
const assert = require("node:assert/strict");

const { ThreadSyncService, _test } = require("../src/thread-service");

test("ThreadSyncService coalesces identical thread/list requests", async () => {
  let requestCount = 0;
  let resolveRequest;
  let requestParams = null;
  const rpc = {
    request(method, params) {
      requestCount += 1;
      assert.equal(method, "thread/list");
      requestParams = params;
      return new Promise((resolve) => {
        resolveRequest = resolve;
      });
    },
  };
  const service = new ThreadSyncService({ rpc, desktopRuntimeScan: false });

  const first = service.listThreads({ limit: 20, archived: false });
  const second = service.listThreads({ archived: false, limit: 20 });

  assert.equal(requestCount, 1);
  assert.equal(requestParams.useStateDbOnly, true);
  resolveRequest({ data: [{ id: "thread-1" }], nextCursor: null });

  assert.deepEqual(await first, { data: [{ id: "thread-1" }], nextCursor: null });
  assert.deepEqual(await second, { data: [{ id: "thread-1" }], nextCursor: null });
});

test("ThreadSyncService decorates list items with desktop IPC running state", async () => {
  const rpc = {
    async request(method, params) {
      assert.equal(method, "thread/list");
      assert.equal(params.useStateDbOnly, true);
      return { data: [{ id: "thread-1", turns: [] }], nextCursor: null };
    },
  };
  const desktopIpcMonitor = {
    getRunningThreadIds() {
      return new Set(["thread-1"]);
    },
  };
  const service = new ThreadSyncService({
    rpc,
    desktopRuntimeScan: false,
    desktopIpcMonitor,
  });

  const result = await service.listThreads({ limit: 20, archived: false });
  assert.equal(result.data[0].running, true);
  assert.equal(result.data[0].inProgress, true);
});

test("runtime session tail distinguishes active turns from completed turns", () => {
  const active = [
    JSON.stringify({
      type: "response_item",
      payload: { type: "reasoning" },
    }),
    JSON.stringify({
      type: "response_item",
      payload: { type: "function_call" },
    }),
  ].join("\n");
  const completed = [
    JSON.stringify({
      type: "response_item",
      payload: { type: "message", phase: "final_answer" },
    }),
    JSON.stringify({
      type: "event_msg",
      payload: { type: "token_count" },
    }),
    JSON.stringify({
      type: "event_msg",
      payload: { type: "task_complete" },
    }),
  ].join("\n");

  assert.equal(_test.isRuntimeSessionTailActive(active), true);
  assert.equal(_test.isRuntimeSessionTailActive(completed), false);
});

test("desktop runtime scan parses write-open session files", () => {
  const threadId = "019d9c9e-ea7d-73b0-830d-a89deb73bee2";
  const sessionPath = `/Users/mac/.codex/sessions/2026/04/17/rollout-2026-04-17T11-05-53-${threadId}.jsonl`;
  const lsof = [
    "COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME",
    `codex 123 mac 95w REG 1,17 100 42 ${sessionPath}`,
    `codex 123 mac 96r REG 1,17 100 43 ${sessionPath}`,
  ].join("\n");

  assert.deepEqual(_test.parseRuntimeSessionFilesFromLsof(lsof), [sessionPath]);
  assert.equal(_test.parseThreadIdFromSessionPath(sessionPath), threadId);
});
