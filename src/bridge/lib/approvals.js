function normalizeDecision(value) {
  return String(value || "").trim();
}

function emptyGrantedPermissions() {
  return {
    network: { enabled: null },
    fileSystem: { read: null, write: null },
  };
}

function cloneJson(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function permissionResponseForDecision(pending, decision, input) {
  const params = pending && pending.params && typeof pending.params === "object"
    ? pending.params
    : {};
  const requested = params.permissions && typeof params.permissions === "object"
    ? params.permissions
    : {};
  const explicit = input.permissions && typeof input.permissions === "object"
    ? input.permissions
    : null;
  const accepted = decision === "accept" || decision === "acceptForSession";
  return {
    permissions: accepted
      ? cloneJson(explicit || requested || emptyGrantedPermissions())
      : emptyGrantedPermissions(),
    scope: decision === "acceptForSession" ? "session" : "turn",
    strictAutoReview: Boolean(input.strictAutoReview),
  };
}

function buildApprovalResponsePayload(pending, body) {
  const method = pending.method;
  const input = body && typeof body === "object" ? body : {};
  if (method === "item/commandExecution/requestApproval") {
    const decision = normalizeDecision(input.decision);
    const allowed = new Set([
      "accept",
      "acceptForSession",
      "decline",
      "cancel",
      "acceptWithExecpolicyAmendment",
      "applyNetworkPolicyAmendment",
    ]);
    if (!allowed.has(decision)) {
      throw new Error("Invalid decision for command execution approval");
    }
    if (decision === "acceptWithExecpolicyAmendment") {
      if (!input.execpolicyAmendment || typeof input.execpolicyAmendment !== "object") {
        throw new Error("execpolicyAmendment is required");
      }
      return {
        decision: {
          acceptWithExecpolicyAmendment: {
            execpolicy_amendment: input.execpolicyAmendment,
          },
        },
      };
    }
    if (decision === "applyNetworkPolicyAmendment") {
      const amendment =
        input.networkPolicyAmendment ||
        input.network_policy_amendment ||
        null;
      if (!amendment || typeof amendment !== "object") {
        throw new Error("networkPolicyAmendment is required");
      }
      return {
        decision: {
          applyNetworkPolicyAmendment: {
            network_policy_amendment: amendment,
          },
        },
      };
    }
    return { decision };
  }
  if (method === "item/fileChange/requestApproval") {
    const decision = normalizeDecision(input.decision);
    const allowed = new Set(["accept", "acceptForSession", "decline", "cancel"]);
    if (!allowed.has(decision)) {
      throw new Error("Invalid decision for file change approval");
    }
    return { decision };
  }
  if (method === "item/permissions/requestApproval") {
    const decision = normalizeDecision(input.decision);
    const allowed = new Set(["accept", "acceptForSession", "decline", "cancel"]);
    if (!allowed.has(decision)) {
      throw new Error("Invalid decision for permissions approval");
    }
    return permissionResponseForDecision(pending, decision, input);
  }
  if (method === "item/tool/requestUserInput") {
    if (normalizeDecision(input.decision) === "cancel") {
      return { answers: {} };
    }
    if (!input.answers || typeof input.answers !== "object") {
      throw new Error("answers is required");
    }
    return { answers: input.answers };
  }
  if (method === "item/tool/call") {
    return {
      contentItems: Array.isArray(input.contentItems) ? input.contentItems : [],
      success: Boolean(input.success),
    };
  }
  if (method === "account/chatgptAuthTokens/refresh") {
    if (!input.tokens || typeof input.tokens !== "object") {
      throw new Error("tokens are required");
    }
    return input.tokens;
  }
  if (method === "applyPatchApproval" || method === "execCommandApproval") {
    if (!("decision" in input)) {
      throw new Error("decision is required");
    }
    return { decision: input.decision };
  }
  if ("result" in input) {
    return input.result;
  }
  throw new Error(`Unsupported approval method: ${method}`);
}

module.exports = {
  buildApprovalResponsePayload,
  normalizeDecision,
};
