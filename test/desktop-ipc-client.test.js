const test = require("node:test");
const assert = require("node:assert/strict");

const { DesktopIpcClient } = require("../src/desktop-ipc-client");

function decodeWrittenFrame(buffer) {
  const size = buffer.readUInt32LE(0);
  return JSON.parse(buffer.slice(4, 4 + size).toString("utf8"));
}

test("DesktopIpcClient sends request frames and resolves matching responses", async () => {
  let written = null;
  const client = new DesktopIpcClient({ requestTimeoutMs: 1000 });
  client.clientId = "phone-client";
  client.socket = {
    destroyed: false,
    writable: true,
    write(buffer) {
      written = buffer;
    },
  };

  const pending = client.sendRequestAndWait(
    "thread-follower-start-turn",
    { conversationId: "thread-1" },
    { targetClientId: "desktop-client", version: 1 }
  );
  const frame = decodeWrittenFrame(written);
  assert.equal(frame.method, "thread-follower-start-turn");
  assert.equal(frame.sourceClientId, "phone-client");
  assert.equal(frame.targetClientId, "desktop-client");
  assert.equal(frame.version, 1);

  client.handleFrame({
    type: "response",
    requestId: frame.requestId,
    method: frame.method,
    resultType: "success",
    result: { ok: true },
  });

  const response = await pending;
  assert.deepEqual(response.result, { ok: true });
});

test("DesktopIpcClient rejects matching error responses", async () => {
  let written = null;
  const client = new DesktopIpcClient({ requestTimeoutMs: 1000 });
  client.socket = {
    destroyed: false,
    writable: true,
    write(buffer) {
      written = buffer;
    },
  };

  const pending = client.sendRequestAndWait("x/test", {}, {});
  const frame = decodeWrittenFrame(written);
  client.handleFrame({
    type: "response",
    requestId: frame.requestId,
    method: frame.method,
    resultType: "error",
    error: "no-client-found",
  });

  await assert.rejects(pending, /no-client-found/);
});
