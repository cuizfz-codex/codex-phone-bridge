function normalizeDecision(value) {
  return String(value || "").trim();
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
  if (method === "item/tool/requestUserInput") {
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
