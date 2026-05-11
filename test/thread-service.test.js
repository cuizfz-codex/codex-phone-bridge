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

test("ThreadSyncService decorates active thread status as running", async () => {
  const rpc = {
    async request(method, params) {
      assert.equal(method, "thread/list");
      assert.equal(params.useStateDbOnly, true);
      return {
        data: [{ id: "thread-1", status: { type: "active" }, turns: [] }],
        nextCursor: null,
      };
    },
  };
  const service = new ThreadSyncService({ rpc, desktopRuntimeScan: false });

  const result = await service.listThreads({ limit: 20, archived: false });
  assert.equal(result.data[0].running, true);
  assert.equal(result.data[0].inProgress, true);
});

test("ThreadSyncService lets authoritative terminal turns clear stale desktop running state", async () => {
  const rpc = {
    async request(method) {
      assert.equal(method, "thread/read");
      return {
        thread: {
          id: "thread-1",
          turns: [{ id: "turn-1", status: "completed", items: [] }],
        },
      };
    },
  };
  let markedThreadId = null;
  const desktopIpcMonitor = {
    getRunningThreadIds() {
      return new Set(["thread-1"]);
    },
    markThreadNotRunning(threadId) {
      markedThreadId = threadId;
      return true;
    },
  };
  const service = new ThreadSyncService({
    rpc,
    desktopRuntimeScan: false,
    desktopIpcMonitor,
  });

  const thread = await service.readThread("thread-1", true);
  assert.equal(thread.running, false);
  assert.equal(thread.inProgress, false);
  assert.equal(markedThreadId, "thread-1");
});

test("ThreadSyncService falls back when new empty thread is not materialized yet", async () => {
  const calls = [];
  const rpc = {
    async request(method, params) {
      calls.push({ method, params });
      assert.equal(method, "thread/read");
      if (params.includeTurns) {
        throw new Error(
          "RPC error (-32600): thread thread-1 is not materialized yet; includeTurns is unavailable before first user message"
        );
      }
      return {
        thread: {
          id: "thread-1",
          cwd: "/tmp/project",
          status: { type: "idle" },
        },
      };
    },
  };
  const service = new ThreadSyncService({ rpc, desktopRuntimeScan: false });

  const thread = await service.readThread("thread-1", true);
  assert.equal(thread.id, "thread-1");
  assert.deepEqual(thread.turns, []);
  assert.deepEqual(
    calls.map((call) => call.params.includeTurns),
    [true, false]
  );
});

test("ThreadSyncService suppresses stale runtime scan after terminal read until next turn starts", async () => {
  const rpc = {
    async request(method, params) {
      if (method === "thread/read") {
        return {
          thread: {
            id: "thread-1",
            turns: [{ id: "turn-1", status: "completed", items: [] }],
          },
        };
      }
      if (method === "thread/list") {
        assert.equal(params.useStateDbOnly, true);
        return { data: [{ id: "thread-1" }], nextCursor: null };
      }
      throw new Error(`unexpected method ${method}`);
    },
  };
  const service = new ThreadSyncService({
    rpc,
    desktopRuntimeScan: false,
    desktopIpcMonitor: {
      getRunningThreadIds() {
        return new Set(["thread-1"]);
      },
      markThreadNotRunning() {
        return true;
      },
    },
  });

  await service.readThread("thread-1", true);
  let list = await service.listThreads({ limit: 20, archived: false });
  assert.equal(list.data[0].running, false);
  assert.equal(list.data[0].inProgress, false);

  service.handleRpcNotification({
    method: "turn/started",
    params: { threadId: "thread-1" },
  });
  list = await service.listThreads({ limit: 20, archived: false });
  assert.equal(list.data[0].running, true);
  assert.equal(list.data[0].inProgress, true);
});

test("ThreadSyncService wakes watched threads on interruption and thread status changes", () => {
  const service = new ThreadSyncService({
    rpc: { request: async () => ({ data: [], nextCursor: null }) },
    desktopRuntimeScan: false,
  });
  service.watchThread("thread-1", "watcher-1");
  const entry = service.watchedThreads.get("thread-1");
  assert.ok(entry);

  entry.dueAt = Date.now() + 60000;
  service.handleRpcNotification({
    method: "turn/interrupted",
    params: { threadId: "thread-1" },
  });
  assert.equal(entry.dueAt, 0);

  entry.dueAt = Date.now() + 60000;
  service.handleRpcNotification({
    method: "thread/status/changed",
    params: { threadId: "thread-1", status: { type: "active" } },
  });
  assert.equal(entry.dueAt, 0);
  assert.equal(entry.inProgress, true);

  entry.dueAt = Date.now() + 60000;
  service.handleRpcNotification({
    method: "thread/status/changed",
    params: { threadId: "thread-1", status: { type: "idle" } },
  });
  assert.equal(entry.dueAt, 0);
  assert.equal(entry.inProgress, false);
});

test("thread terminal helper requires turn data and terminal last status", () => {
  assert.equal(_test.hasAuthoritativeTerminalTurns({ id: "t", turns: [] }), false);
  assert.equal(
    _test.hasAuthoritativeTerminalTurns({
      id: "t",
      turns: [{ id: "turn-1", status: "inProgress" }],
    }),
    false
  );
  assert.equal(
    _test.hasAuthoritativeTerminalTurns({
      id: "t",
      turns: [{ id: "turn-1", status: "interrupted" }],
    }),
    true
  );
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
