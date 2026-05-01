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

test("DesktopIpcMonitor clears running from terminal patches without snapshot", () => {
  const monitor = new DesktopIpcMonitor({ enabled: false });
  monitor.threadStateById.set("thread-1", {
    threadId: "thread-1",
    ownerClientId: "desktop-client-1",
    conversationState: null,
    running: true,
    updatedAt: new Date().toISOString(),
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

test("DesktopIpcMonitor can reconcile stale running state from authoritative thread reads", () => {
  const monitor = new DesktopIpcMonitor({ enabled: false });
  const events = [];
  monitor.on("thread-state-changed", (event) => events.push(event));
  monitor.threadStateById.set("thread-1", {
    threadId: "thread-1",
    ownerClientId: "desktop-client-1",
    running: true,
    updatedAt: new Date().toISOString(),
    conversationState: {
      turns: [{ id: "turn-1", status: "inProgress", items: [] }],
      requests: [{ id: "request-1", completed: false }],
    },
  });

  assert.equal(
    monitor.markThreadNotRunning("thread-1", { reason: "thread-read-terminal" }),
    true
  );

  const state = monitor.threadStateById.get("thread-1");
  assert.equal(state.running, false);
  assert.equal(state.conversationState.turns[0].status, "completed");
  assert.equal(state.conversationState.requests[0].completed, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].running, false);
  assert.equal(events[0].reason, "thread-read-terminal");
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
            effort: "xhigh",
            collaborationMode: {
              mode: "default",
              settings: {
                model: "gpt-test",
                reasoning_effort: "xhigh",
              },
            },
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
    { approvalPolicy: "never", effort: "high" }
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
  assert.equal(sent.params.turnStartParams.effort, "high");
  assert.equal(
    sent.params.turnStartParams.collaborationMode.settings.reasoning_effort,
    "high"
  );
  assert.equal(sent.params.turnStartParams.approvalPolicy, "never");
});

test("DesktopIpcMonitor syncs model and reasoning to desktop owner", async () => {
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
      latestModel: "gpt-5.5",
      latestReasoningEffort: "xhigh",
      latestCollaborationMode: {
        mode: "default",
        settings: {
          model: "gpt-5.5",
          reasoning_effort: "xhigh",
        },
      },
      turns: [],
      requests: [],
    },
  });

  const result = await monitor.setModelAndReasoning("thread-1", {
    reasoningEffort: "high",
  });

  assert.equal(result.via, "desktop-ipc");
  assert.equal(result.model, "gpt-5.5");
  assert.equal(result.reasoningEffort, "high");
  assert.equal(sent.method, "thread-follower-set-model-and-reasoning");
  assert.deepEqual(sent.params, {
    conversationId: "thread-1",
    model: "gpt-5.5",
    reasoningEffort: "high",
  });
  assert.equal(sent.options.targetClientId, "desktop-client-1");
  assert.equal(
    monitor.getThreadRunDefaults("thread-1").effort,
    "high"
  );
});

test("DesktopIpcMonitor syncs reasoning to known desktop threads by cwd", async () => {
  const monitor = new DesktopIpcMonitor({ enabled: false, sendMode: "prefer" });
  const sent = [];
  monitor.client = {
    status() {
      return { connected: true, initialized: true };
    },
    async sendRequestAndWait(method, params, options) {
      sent.push({ method, params, options });
      return { resultType: "success", result: { ok: true } };
    },
  };
  const updatedAt = new Date().toISOString();
  monitor.threadStateById.set("thread-1", {
    threadId: "thread-1",
    ownerClientId: "desktop-client-1",
    running: false,
    updatedAt,
    conversationState: {
      latestModel: "gpt-5.5",
      latestReasoningEffort: "xhigh",
      turns: [{ params: { cwd: "/tmp/project-a" } }],
      requests: [],
    },
  });
  monitor.threadStateById.set("thread-2", {
    threadId: "thread-2",
    ownerClientId: "desktop-client-2",
    running: false,
    updatedAt,
    conversationState: {
      latestModel: "gpt-5.4",
      latestReasoningEffort: "medium",
      turns: [{ params: { cwd: "/tmp/project-b" } }],
      requests: [],
    },
  });

  const result = await monitor.setModelAndReasoningForKnownThreads(
    { reasoningEffort: "high" },
    { cwd: "/tmp/project-a" }
  );

  assert.equal(result.fallback, true);
  assert.equal(result.synced.length, 1);
  assert.equal(result.synced[0].threadId, "thread-1");
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].params, {
    conversationId: "thread-1",
    model: "gpt-5.5",
    reasoningEffort: "high",
  });
  assert.equal(monitor.getThreadRunDefaults("thread-1").effort, "high");
  assert.equal(monitor.getThreadRunDefaults("thread-2").effort, "medium");
});

test("DesktopIpcMonitor reads nested collaboration defaults", () => {
  assert.deepEqual(
    _test.extractRunDefaultsFromConversationState({
      latestCollaborationMode: {
        mode: "default",
        settings: {
          model: "gpt-5.5",
          reasoning_effort: "high",
        },
      },
      turns: [
        {
          params: {
            model: "old-model",
            effort: "xhigh",
          },
        },
      ],
    }),
    { model: "gpt-5.5", effort: "high" }
  );
});

test("DesktopIpcMonitor reads cwd from latest turn params", () => {
  assert.equal(
    _test.extractCwdFromConversationState({
      turns: [
        {
          params: {
            cwd: "/tmp/project",
            model: "gpt-5.5",
            effort: "high",
          },
        },
      ],
    }),
    "/tmp/project"
  );
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
