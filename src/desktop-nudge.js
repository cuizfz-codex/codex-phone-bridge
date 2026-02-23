const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

function normalizeDesktopNudgeMode(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "frontmost";
  if (raw === "off") return "off";
  if (raw === "frontmost") return "frontmost";
  if (raw === "activate") return "activate";
  return "frontmost";
}

function toNonNegativeInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function buildAppleScript(mode) {
  const safeMode = normalizeDesktopNudgeMode(mode);
  return [
    `set nudgeMode to "${safeMode}"`,
    `tell application "System Events"`,
    `  set codexRunning to exists (process "Codex")`,
    `  if codexRunning is false then return`,
    `  if nudgeMode is "frontmost" then`,
    `    if frontmost of process "Codex" is false then return`,
    `  end if`,
    `end tell`,
    `if nudgeMode is "activate" then`,
    `  tell application "Codex" to activate`,
    `  delay 0.05`,
    `end if`,
    `try`,
    `  tell application "System Events"`,
    `    tell process "Codex"`,
    `      set canNext to false`,
    `      set canPrev to false`,
    `      try`,
    `        set canNext to enabled of menu item "Next Thread" of menu 1 of menu bar item "View" of menu bar 1`,
    `      end try`,
    `      try`,
    `        set canPrev to enabled of menu item "Previous Thread" of menu 1 of menu bar item "View" of menu bar 1`,
    `      end try`,
    `      if canNext then`,
    `        click menu item "Next Thread" of menu 1 of menu bar item "View" of menu bar 1`,
    `        delay 0.15`,
    `        try`,
    `          click menu item "Previous Thread" of menu 1 of menu bar item "View" of menu bar 1`,
    `        end try`,
    `        return`,
    `      end if`,
    `      if canPrev then`,
    `        click menu item "Previous Thread" of menu 1 of menu bar item "View" of menu bar 1`,
    `        delay 0.15`,
    `        try`,
    `          click menu item "Next Thread" of menu 1 of menu bar item "View" of menu bar 1`,
    `        end try`,
    `        return`,
    `      end if`,
    `    end tell`,
    `  end tell`,
    `end try`,
  ];
}

function normalizeHelperAppPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return path.resolve(raw);
}

function detectHelperAppPath(explicitPath) {
  const resolvedExplicit = normalizeHelperAppPath(explicitPath);
  if (resolvedExplicit) {
    try {
      if (fs.existsSync(resolvedExplicit)) return resolvedExplicit;
    } catch {
      // ignore
    }
  }

  const defaultPath = path.resolve(
    process.cwd(),
    "tools",
    "CodexDesktopNudge.app"
  );
  try {
    if (fs.existsSync(defaultPath)) return defaultPath;
  } catch {
    // ignore
  }

  return "";
}

class DesktopNudge {
  constructor(options = {}) {
    this.mode = normalizeDesktopNudgeMode(options.mode);
    this.throttleMs = toNonNegativeInt(options.throttleMs, 2000);
    this.logger = options.logger || console;
    this.helperAppPath = detectHelperAppPath(options.helperAppPath);
    this.runner = this.helperAppPath ? "helper-app" : "osascript";

    this._lastRunAt = 0;
    this._timer = null;
    this._pending = null;
  }

  status() {
    return {
      mode: this.mode,
      throttleMs: this.throttleMs,
      runner: this.runner,
      helperAppPath: this.helperAppPath || null,
      scheduled: Boolean(this._timer),
      lastRunAt: this._lastRunAt ? new Date(this._lastRunAt).toISOString() : null,
    };
  }

  request(info = {}) {
    if (this.mode === "off") return;

    const payload =
      info && typeof info === "object"
        ? { ...info, requestedAt: new Date().toISOString() }
        : { requestedAt: new Date().toISOString() };
    this._pending = payload;

    const now = Date.now();
    const elapsed = now - this._lastRunAt;
    const delay = elapsed >= this.throttleMs ? 0 : this.throttleMs - elapsed;

    if (delay === 0) {
      if (this._timer) {
        clearTimeout(this._timer);
        this._timer = null;
      }
      void this._run();
      return;
    }

    if (this._timer) {
      return;
    }

    this._timer = setTimeout(() => {
      this._timer = null;
      void this._run();
    }, delay);
  }

  _run() {
    const pending = this._pending;
    this._pending = null;
    this._lastRunAt = Date.now();

    if (this.runner === "helper-app") {
      const args = ["-gj", "-a", this.helperAppPath, "--args", this.mode];
      return new Promise((resolve) => {
        execFile("/usr/bin/open", args, { timeout: 2000 }, (error) => {
          if (error) {
            const details = [
              pending && pending.reason ? `reason=${pending.reason}` : null,
              pending && pending.threadId ? `threadId=${pending.threadId}` : null,
              pending && pending.turnId ? `turnId=${pending.turnId}` : null,
            ]
              .filter(Boolean)
              .join(" ");
            this.logger.warn(
              `[desktop-nudge] helper-app failed${details ? ` (${details})` : ""}: ${String(
                error && error.message ? error.message : error
              )}`
            );
          }
          resolve();
        });
      });
    }

    const script = buildAppleScript(this.mode);
    const args = [];
    for (const line of script) {
      args.push("-e", line);
    }

    return new Promise((resolve) => {
      execFile("/usr/bin/osascript", args, { timeout: 2000 }, (error, stdout, stderr) => {
        if (error) {
          const details = [
            pending && pending.reason ? `reason=${pending.reason}` : null,
            pending && pending.threadId ? `threadId=${pending.threadId}` : null,
            pending && pending.turnId ? `turnId=${pending.turnId}` : null,
          ]
            .filter(Boolean)
            .join(" ");
          const output = String((stderr || stdout || error.message || error) ?? "").trim();
          this.logger.warn(
            `[desktop-nudge] failed${details ? ` (${details})` : ""}: ${output}`
          );
        }
        resolve();
      });
    });
  }
}

module.exports = {
  DesktopNudge,
  normalizeDesktopNudgeMode,
};
