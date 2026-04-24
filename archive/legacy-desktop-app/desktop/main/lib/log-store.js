const path = require("path");
const fs = require("fs");

const { nowIso, safeString } = require("./util");
const { getUserDataDir } = require("./config-store");

const MAX_LOG_LINES = 1500;

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function createLogStore({ app, appName, getMainWindow }) {
  const logBuffer = [];
  let logFileStream = null;

  function logFilePath() {
    return path.join(getUserDataDir(app, appName), "logs", "phone-codex.log");
  }

  function ensureLogFileStream() {
    if (logFileStream) return;
    if (!app || !app.isReady()) return;
    try {
      const p = logFilePath();
      ensureDir(path.dirname(p));
      logFileStream = fs.createWriteStream(p, { flags: "a" });
      logFileStream.on("error", () => {
        try {
          logFileStream && logFileStream.end();
        } catch {
          // noop
        }
        logFileStream = null;
      });
    } catch {
      logFileStream = null;
    }
  }

  function appendLog(source, line) {
    const msg = { at: nowIso(), source, line: safeString(line) };
    logBuffer.push(msg);
    while (logBuffer.length > MAX_LOG_LINES) logBuffer.shift();

    const win = typeof getMainWindow === "function" ? getMainWindow() : null;
    if (win && !win.isDestroyed()) {
      win.webContents.send("log-line", msg);
    }

    ensureLogFileStream();
    try {
      if (logFileStream && logFileStream.writable) {
        logFileStream.write(`${msg.at} [${msg.source}] ${msg.line}\n`);
      }
    } catch {
      // noop
    }
  }

  function createLogger(source) {
    return {
      log: (...args) => appendLog(source, args.join(" ")),
      warn: (...args) => appendLog(source, args.join(" ")),
      error: (...args) => appendLog(source, args.join(" ")),
    };
  }

  function recent(limit = 300) {
    const n = Math.max(0, Math.min(2000, Number(limit || 0)));
    return n ? logBuffer.slice(-n) : [];
  }

  function close() {
    try {
      if (logFileStream) logFileStream.end();
    } catch {
      // noop
    }
    logFileStream = null;
  }

  return {
    appendLog,
    createLogger,
    recent,
    logFilePath,
    close,
  };
}

module.exports = {
  createLogStore,
};

