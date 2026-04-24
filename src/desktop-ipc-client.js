const { EventEmitter } = require("events");
const crypto = require("crypto");
const net = require("net");
const os = require("os");
const path = require("path");

const INITIALIZING_CLIENT_ID = "initializing-client";
const MAX_FRAME_BYTES = 256 * 1024 * 1024;

function defaultDesktopIpcSocketPath() {
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  if (uid === null || uid === undefined) {
    return path.join(os.tmpdir(), "codex-ipc", "ipc.sock");
  }
  return path.join(os.tmpdir(), "codex-ipc", `ipc-${uid}.sock`);
}

class DesktopIpcClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.socketPath = options.socketPath || defaultDesktopIpcSocketPath();
    this.clientType = String(options.clientType || "phone-codex-observer").trim();
    this.requestTimeoutMs = Number(options.requestTimeoutMs || 20000);

    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.clientId = null;
    this.initializeRequestId = null;
    this.isInitialized = false;
    this.pendingRequests = new Map();
  }

  status() {
    return {
      socketPath: this.socketPath,
      connected: Boolean(this.socket && !this.socket.destroyed),
      initialized: this.isInitialized,
      clientId: this.clientId,
    };
  }

  async connect() {
    if (this.socket && !this.socket.destroyed) return;
    this.buffer = Buffer.alloc(0);
    this.clientId = null;
    this.isInitialized = false;

    const socket = await new Promise((resolve, reject) => {
      const next = net.createConnection(this.socketPath);
      next.once("connect", () => resolve(next));
      next.once("error", (error) => reject(error));
    });

    this.socket = socket;
    socket.on("data", (chunk) => this.handleData(chunk));
    socket.on("close", () => {
      this.socket = null;
      this.buffer = Buffer.alloc(0);
      this.clientId = null;
      this.isInitialized = false;
      this.rejectAllPending(new Error("Codex desktop IPC socket closed"));
      this.emit("close");
    });
    socket.on("error", (error) => {
      this.emit("error", error);
    });

    this.emit("connected", this.status());
    this.initialize();
  }

  close() {
    const socket = this.socket;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.clientId = null;
    this.isInitialized = false;
    this.rejectAllPending(new Error("Codex desktop IPC client closed"));
    if (socket && !socket.destroyed) {
      socket.end();
    }
  }

  initialize() {
    this.initializeRequestId = crypto.randomUUID();
    this.writeFrame({
      type: "request",
      requestId: this.initializeRequestId,
      sourceClientId: INITIALIZING_CLIENT_ID,
      version: 1,
      method: "initialize",
      params: {
        clientType: this.clientType,
      },
    });
  }

  writeFrame(frame) {
    const socket = this.socket;
    if (!socket || socket.destroyed || !socket.writable) {
      throw new Error("Codex desktop IPC socket is not connected");
    }
    const payload = Buffer.from(JSON.stringify(frame), "utf8");
    const header = Buffer.alloc(4);
    header.writeUInt32LE(payload.length, 0);
    socket.write(Buffer.concat([header, payload]));
  }

  sendResponse(requestId, resultType, payload) {
    const frame = {
      type: "response",
      requestId,
      resultType,
    };
    if (resultType === "success") {
      frame.result = payload;
    } else {
      frame.error = payload;
    }
    this.writeFrame(frame);
  }

  sendRequestAndWait(method, params, options = {}) {
    const requestId = options.requestId || crypto.randomUUID();
    const timeoutMs = Number(options.timeoutMs || this.requestTimeoutMs);
    const frame = {
      type: "request",
      requestId,
      method: String(method),
      params,
      sourceClientId: options.sourceClientId || this.clientId || INITIALIZING_CLIENT_ID,
    };
    if (options.targetClientId) frame.targetClientId = String(options.targetClientId);
    if (Number.isInteger(options.version)) frame.version = options.version;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Codex desktop IPC request timed out: ${String(method)}`));
      }, Math.max(1, timeoutMs));
      timer.unref();
      this.pendingRequests.set(requestId, {
        method: String(method),
        timer,
        resolve,
        reject,
      });
      try {
        this.writeFrame(frame);
      } catch (error) {
        clearTimeout(timer);
        this.pendingRequests.delete(requestId);
        reject(error);
      }
    });
  }

  rejectAllPending(error) {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  handleData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const frameSize = this.buffer.readUInt32LE(0);
      if (frameSize > MAX_FRAME_BYTES) {
        const error = new Error(
          `Codex desktop IPC frame exceeds limit (${frameSize} > ${MAX_FRAME_BYTES})`
        );
        this.emit("error", error);
        this.close();
        return;
      }
      if (this.buffer.length < 4 + frameSize) return;

      const payload = this.buffer.slice(4, 4 + frameSize);
      this.buffer = this.buffer.slice(4 + frameSize);
      let frame = null;
      try {
        frame = JSON.parse(payload.toString("utf8"));
      } catch (error) {
        this.emit("protocol-warning", {
          message: "Failed to parse Codex desktop IPC JSON frame",
          error: String(error && error.message ? error.message : error),
        });
        continue;
      }
      this.handleFrame(frame);
    }
  }

  handleFrame(frame) {
    this.emit("frame", frame);

    if (frame && frame.type === "client-discovery-request") {
      try {
        this.writeFrame({
          type: "client-discovery-response",
          requestId: frame.requestId,
          response: {
            canHandle: false,
          },
        });
      } catch (error) {
        this.emit("error", error);
      }
      return;
    }

    if (frame && frame.type === "request") {
      try {
        this.sendResponse(frame.requestId, "error", "phone-codex-no-ipc-handler");
      } catch (error) {
        this.emit("error", error);
      }
      return;
    }

    if (
      frame &&
      frame.type === "response" &&
      frame.requestId === this.initializeRequestId
    ) {
      if (frame.resultType === "success") {
        const result = frame.result && typeof frame.result === "object" ? frame.result : {};
        const clientId = typeof result.clientId === "string" ? result.clientId.trim() : "";
        this.clientId = clientId || null;
        this.isInitialized = true;
        this.emit("initialized", this.status());
      } else {
        this.emit("error", new Error(`Codex desktop IPC initialize failed: ${String(frame.error)}`));
      }
      return;
    }

    if (frame && frame.type === "response") {
      const pending = this.pendingRequests.get(frame.requestId);
      if (!pending) return;
      this.pendingRequests.delete(frame.requestId);
      clearTimeout(pending.timer);
      if (frame.resultType === "error") {
        pending.reject(
          new Error(
            `Codex desktop IPC ${pending.method} failed: ${formatIpcError(frame.error)}`
          )
        );
        return;
      }
      pending.resolve(frame);
    }
  }
}

function formatIpcError(error) {
  if (error === null || error === undefined) return "unknown error";
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch (_error) {
    return String(error);
  }
}

module.exports = {
  DesktopIpcClient,
  defaultDesktopIpcSocketPath,
  _test: {
    MAX_FRAME_BYTES,
    INITIALIZING_CLIENT_ID,
    formatIpcError,
  },
};
