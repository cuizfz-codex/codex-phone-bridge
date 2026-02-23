const { execFile } = require("child_process");

const { safeString } = require("./util");

function launchctl(args, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    execFile("/bin/launchctl", args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) {
        const msg = stderr ? String(stderr).trim() : err.message;
        reject(new Error(msg || err.message));
        return;
      }
      resolve(String(stdout || "").trim());
    });
  });
}

async function getLaunchctlEnv(name) {
  const key = safeString(name).trim();
  if (!key) return "";
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  if (!Number.isInteger(uid)) return "";

  try {
    const dump = await launchctl(["print", `gui/${uid}`], 2500);
    const lines = String(dump || "").split(/\r?\n/);
    let inEnv = false;
    for (const raw of lines) {
      const line = String(raw || "");
      if (!inEnv) {
        if (line.trim() === "environment = {") {
          inEnv = true;
        }
        continue;
      }
      if (line.trim() === "}") break;
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=>\s*(.*)\s*$/);
      if (!match) continue;
      const k = match[1];
      const v = match[2] || "";
      if (k === key) return v;
    }
    return "";
  } catch {
    return "";
  }
}

async function setCodexWsEnv(wsUrl, { appendLog } = {}) {
  const value = safeString(wsUrl).trim();
  if (!value) throw new Error("Missing ws url");
  typeof appendLog === "function" && appendLog("app", `Setting launchctl CODEX_APP_SERVER_WS_URL=${value}`);

  await launchctl(["unsetenv", "CODEX_APP_SERVER_FORCE_CLI"]).catch((err) => {
    typeof appendLog === "function" &&
      appendLog(
        "app",
        `launchctl unsetenv CODEX_APP_SERVER_FORCE_CLI failed: ${safeString(err && err.message ? err.message : err)}`
      );
    return null;
  });

  await launchctl(["setenv", "CODEX_APP_SERVER_WS_URL", value], 2000).catch((err) => {
    throw new Error(
      `launchctl setenv CODEX_APP_SERVER_WS_URL failed: ${safeString(
        err && err.message ? err.message : err
      )}`
    );
  });

  // Best-effort verification (avoid silent failures that later cause 1006 lockouts).
  const observed = await getLaunchctlEnv("CODEX_APP_SERVER_WS_URL");
  if (observed !== value) {
    typeof appendLog === "function" &&
      appendLog(
        "app",
        `Warning: launchctl env mismatch (expected=${value}, observed=${observed || "(empty)"})`
      );
  }
}

async function unsetCodexWsEnv({ appendLog } = {}) {
  typeof appendLog === "function" &&
    appendLog("app", "Clearing launchctl CODEX_APP_SERVER_WS_URL (+ FORCE_CLI)");

  await launchctl(["unsetenv", "CODEX_APP_SERVER_WS_URL"]).catch((err) => {
    typeof appendLog === "function" &&
      appendLog(
        "app",
        `launchctl unsetenv CODEX_APP_SERVER_WS_URL failed: ${safeString(err && err.message ? err.message : err)}`
      );
    return null;
  });
  await launchctl(["unsetenv", "CODEX_APP_SERVER_FORCE_CLI"]).catch((err) => {
    typeof appendLog === "function" &&
      appendLog(
        "app",
        `launchctl unsetenv CODEX_APP_SERVER_FORCE_CLI failed: ${safeString(err && err.message ? err.message : err)}`
      );
    return null;
  });
}

module.exports = {
  launchctl,
  getLaunchctlEnv,
  setCodexWsEnv,
  unsetCodexWsEnv,
};

