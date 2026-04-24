const test = require("node:test");
const assert = require("node:assert/strict");

const { DesktopIpcMonitor, _test } = require("../src/desktop-ipc-monitor");

test("DesktopIpcMonitor tracks running state from desktop IPC snapshots", () => {
  const monitor = new DesktopIpcMonitor({ enabled: false });
  monitor.handleFrame({
    type: "broadcast",
    method: "thread-stream-state-changed",
    sourceClientId: "desktop-client-1",
    params: {
      conversationId: "thread-1",
      change: {
        type: "snapshot",
        conversationState: {
          turns: [{ id: "turn-1", status: "inProgress", items: [] }],
          requests: [],
        },
      },
    },
  });

  assert.deepEqual([...monitor.getRunningThreadIds()], ["thread-1"]);
  assert.deepEqual(monitor.getThreadRuntimeState("thread-1"), {
    threadId: "thread-1",
    running: true,
    ownerClientId: "desktop-client-1",
    updatedAt: monitor.getThreadRuntimeState("thread-1").updatedAt,
  });
});

test("DesktopIpcMonitor applies patch updates to clear running state", () => {
  const monitor = new DesktopIpcMonitor({ enabled: false });
  monitor.handleFrame({
    type: "broadcast",
    method: "thread-stream-state-changed",
    sourceClientId: "desktop-client-1",
    params: {
      conversationId: "thread-1",
      change: {
        type: "snapshot",
        conversationState: {
          turns: [{ id: "turn-1", status: "inProgress", items: [] }],
          requests: [],
        },
      },
    },
  });
  monitor.handleFrame({
    type: "broadcast",
    method: "thread-stream-state-changed",
    sourceClientId: "desktop-client-1",
    params: {
      conversationId: "thread-1",
      change: {
        type: "patches",
        patches: [
          {
            op: "replace",
            path: ["turns", 0, "status"],
            value: "completed",
          },
        ],
      },
    },
  });

  assert.deepEqual([...monitor.getRunningThreadIds()], []);
  assert.equal(monitor.getThreadRuntimeState("thread-1").running, false);
});

test("DesktopIpcMonitor treats incomplete requests as active", () => {
  assert.equal(
    _test.isConversationStateRunning({
      turns: [{ id: "turn-1", status: "completed", items: [] }],
      requests: [{ id: 1, completed: false }],
    }),
    true
  );
});

test("DesktopIpcMonitor sends turns to known desktop owner", async () => {
  const monitor = new DesktopIpcMonitor({ enabled: false, sendMode: "prefer" });
  let sent = null;
  monitor.client = {
    status() {
      return { connected: true, initialized: true };
    },
    async sendRequestAndWait(method, params, options) {
      sent = { method, params, options };
      return { resultType: "success", result: { ok: true } };
    },
  };
  monitor.threadStateById.set("thread-1", {
    threadId: "thread-1",
    ownerClientId: "desktop-client-1",
    running: false,
    updatedAt: new Date().toISOString(),
    conversationState: {
      turns: [
        {
          params: {
            threadId: "thread-1",
            cwd: "/tmp/project",
            model: "gpt-test",
            input: [{ type: "text", text: "old" }],
            attachments: [{ label: "old", path: "/tmp/old", fsPath: "/tmp/old" }],
          },
        },
      ],
      requests: [],
    },
  });

  const result = await monitor.startTurn(
    "thread-1",
    [{ type: "text", text: "hello" }],
    { approvalPolicy: "never" }
  );

  assert.equal(result.via, "desktop-ipc");
  assert.equal(result.ownerClientId, "desktop-client-1");
  assert.equal(sent.method, "thread-follower-start-turn");
  assert.equal(sent.options.targetClientId, "desktop-client-1");
  assert.equal(sent.options.version, 1);
  assert.equal(sent.params.conversationId, "thread-1");
  assert.deepEqual(sent.params.turnStartParams.input, [{ type: "text", text: "hello" }]);
  assert.equal(sent.params.turnStartParams.cwd, "/tmp/project");
  assert.equal(sent.params.turnStartParams.model, "gpt-test");
  assert.equal(sent.params.turnStartParams.approvalPolicy, "never");
});

test("DesktopIpcMonitor refuses sends when owner is unknown", async () => {
  const monitor = new DesktopIpcMonitor({ enabled: false, sendMode: "prefer" });
  monitor.client = {
    status() {
      return { connected: true, initialized: true };
    },
  };
  await assert.rejects(
    monitor.startTurn("thread-missing", [{ type: "text", text: "hello" }], {}),
    (error) => error.code === "IPC_NO_OWNER"
  );
});
