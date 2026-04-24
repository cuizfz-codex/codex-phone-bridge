const test = require("node:test");
const assert = require("node:assert/strict");

const { buildApprovalResponsePayload } = require("../src/bridge/lib/approvals");

test("permissions approval grants requested permissions for this turn", () => {
  const pending = {
    method: "item/permissions/requestApproval",
    params: {
      permissions: {
        network: { enabled: true },
        fileSystem: { read: ["/tmp/read"], write: ["/tmp/write"] },
      },
    },
  };

  const response = buildApprovalResponsePayload(pending, { decision: "accept" });

  assert.deepEqual(response, {
    permissions: {
      network: { enabled: true },
      fileSystem: { read: ["/tmp/read"], write: ["/tmp/write"] },
    },
    scope: "turn",
    strictAutoReview: false,
  });
});

test("permissions approval can grant for the session", () => {
  const pending = {
    method: "item/permissions/requestApproval",
    params: {
      permissions: {
        network: { enabled: true },
        fileSystem: { read: null, write: ["/tmp/write"] },
      },
    },
  };

  const response = buildApprovalResponsePayload(pending, {
    decision: "acceptForSession",
    strictAutoReview: true,
  });

  assert.equal(response.scope, "session");
  assert.equal(response.strictAutoReview, true);
  assert.deepEqual(response.permissions.fileSystem.write, ["/tmp/write"]);
});

test("permissions decline returns an empty grant", () => {
  const pending = {
    method: "item/permissions/requestApproval",
    params: {
      permissions: {
        network: { enabled: true },
        fileSystem: { read: ["/tmp/read"], write: ["/tmp/write"] },
      },
    },
  };

  const response = buildApprovalResponsePayload(pending, { decision: "decline" });

  assert.deepEqual(response, {
    permissions: {
      network: { enabled: null },
      fileSystem: { read: null, write: null },
    },
    scope: "turn",
    strictAutoReview: false,
  });
});

test("command approval can apply a network policy amendment", () => {
  const response = buildApprovalResponsePayload(
    { method: "item/commandExecution/requestApproval", params: {} },
    {
      decision: "applyNetworkPolicyAmendment",
      networkPolicyAmendment: { host: "example.com", action: "allow" },
    }
  );

  assert.deepEqual(response, {
    decision: {
      applyNetworkPolicyAmendment: {
        network_policy_amendment: { host: "example.com", action: "allow" },
      },
    },
  });
});
