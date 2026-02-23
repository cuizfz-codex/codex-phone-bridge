const net = require("net");

function safeString(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function normalizeHost(value, fallback) {
  const raw = safeString(value).trim();
  return raw || fallback;
}

function normalizePort(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(65535, Math.floor(n)));
}

function ipBytesToString(bytes) {
  return `${bytes[0]}.${bytes[1]}.${bytes[2]}.${bytes[3]}`;
}

function buildSocksReply(rep, bindPort = 0) {
  const port = normalizePort(bindPort, 0);
  return Buffer.from([
    0x05,
    rep & 0xff,
    0x00,
    0x01, // IPv4
    0x00,
    0x00,
    0x00,
    0x00,
    (port >> 8) & 0xff,
    port & 0xff,
  ]);
}

class CodexSocksProxy {
  constructor(options = {}) {
    this.listenHost = normalizeHost(options.listenHost, "127.0.0.1");
    this.listenPort = normalizePort(options.listenPort, 1080);

    // Keep the proxy narrowly scoped: Codex uses it only to reach the local WS app-server.
    this.allowedHost = normalizeHost(options.allowedHost, "127.0.0.1");
    this.allowedPort = normalizePort(options.allowedPort, 0);
    if (!this.allowedPort) {
      throw new Error("CodexSocksProxy requires allowedPort");
    }

    this.logger = options.logger || console;

    this.server = null;
    this.sockets = new Set();
    this.totalConnections = 0;
  }

  status() {
    return {
      listen: `${this.listenHost}:${this.listenPort}`,
      allowed: `${this.allowedHost}:${this.allowedPort}`,
      openSockets: this.sockets.size,
      totalConnections: this.totalConnections,
    };
  }

  async start() {
    if (this.server) return;
    this.server = net.createServer((socket) => this._handleClient(socket));
    this.server.on("error", (err) => {
      this.logger.error(
        `[phone-codex-socks] server error: ${safeString(err && err.message ? err.message : err)}`
      );
    });

    await new Promise((resolve, reject) => {
      const onError = (err) => reject(err);
      this.server.once("error", onError);
      this.server.listen(this.listenPort, this.listenHost, () => {
        this.server.removeListener("error", onError);
        this.logger.log(
          `[phone-codex-socks] listening on ${this.listenHost}:${this.listenPort} (allow ${this.allowedHost}:${this.allowedPort})`
        );
        resolve();
      });
    });
  }

  async stop() {
    const server = this.server;
    this.server = null;

    for (const socket of this.sockets) {
      try {
        socket.destroy();
      } catch {
        // noop
      }
    }
    this.sockets.clear();

    if (!server) return;
    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      const timer = setTimeout(finish, 800);
      try {
        server.close(() => {
          clearTimeout(timer);
          finish();
        });
      } catch {
        clearTimeout(timer);
        finish();
      }
    });
  }

  _handleClient(socket) {
    this.totalConnections += 1;
    this.sockets.add(socket);

    const peer = `${safeString(socket.remoteAddress)}:${safeString(socket.remotePort)}`;
    this.logger.log(`[phone-codex-socks] client connected peer=${peer}`);

    socket.setNoDelay(true);

    let buf = Buffer.alloc(0);
    let stage = "greeting";
    let remote = null;

    const cleanup = () => {
      if (remote) {
        try {
          remote.destroy();
        } catch {
          // noop
        }
        remote = null;
      }
      this.sockets.delete(socket);
    };

    socket.on("close", () => {
      this.logger.log(`[phone-codex-socks] client closed peer=${peer}`);
      cleanup();
    });
    socket.on("error", (err) => {
      this.logger.warn(
        `[phone-codex-socks] client error peer=${peer} error=${safeString(
          err && err.message ? err.message : err
        )}`
      );
    });

    const deny = (rep) => {
      try {
        socket.write(buildSocksReply(rep));
      } catch {
        // noop
      }
      try {
        socket.destroy();
      } catch {
        // noop
      }
    };

    const onData = (chunk) => {
      if (!chunk || chunk.length === 0) return;
      buf = Buffer.concat([buf, Buffer.from(chunk)]);

      while (true) {
        if (stage === "greeting") {
          if (buf.length < 2) return;
          const ver = buf[0];
          const nmethods = buf[1];
          if (ver !== 0x05) {
            deny(0x01);
            return;
          }
          if (buf.length < 2 + nmethods) return;
          const methods = buf.slice(2, 2 + nmethods);
          buf = buf.slice(2 + nmethods);

          const supportsNoAuth = methods.includes(0x00);
          if (!supportsNoAuth) {
            try {
              socket.write(Buffer.from([0x05, 0xff]));
            } catch {
              // noop
            }
            try {
              socket.destroy();
            } catch {
              // noop
            }
            return;
          }

          try {
            socket.write(Buffer.from([0x05, 0x00]));
          } catch {
            deny(0x01);
            return;
          }
          stage = "request";
          continue;
        }

        if (stage === "request") {
          if (buf.length < 4) return;
          const ver = buf[0];
          const cmd = buf[1];
          const atyp = buf[3];

          if (ver !== 0x05) {
            deny(0x01);
            return;
          }
          if (cmd !== 0x01) {
            deny(0x07); // Command not supported
            return;
          }

          let host = "";
          let port = 0;
          let need = 0;

          if (atyp === 0x01) {
            need = 4 + 4 + 2;
            if (buf.length < need) return;
            host = ipBytesToString(buf.slice(4, 8));
            port = buf.readUInt16BE(8);
            buf = buf.slice(need);
          } else if (atyp === 0x03) {
            if (buf.length < 5) return;
            const len = buf[4];
            need = 4 + 1 + len + 2;
            if (buf.length < need) return;
            host = buf.slice(5, 5 + len).toString("utf8");
            port = buf.readUInt16BE(5 + len);
            buf = buf.slice(need);
          } else if (atyp === 0x04) {
            need = 4 + 16 + 2;
            if (buf.length < need) return;
            // We only allow loopback anyway; keep a compact representation.
            host = "::1";
            port = buf.readUInt16BE(4 + 16);
            buf = buf.slice(need);
          } else {
            deny(0x08); // Address type not supported
            return;
          }

          const normalizedHost = safeString(host).trim();
          const normalizedPort = normalizePort(port, 0);
          const allowed =
            (normalizedHost === this.allowedHost ||
              (this.allowedHost === "127.0.0.1" && normalizedHost === "localhost") ||
              (this.allowedHost === "localhost" && normalizedHost === "127.0.0.1")) &&
            normalizedPort === this.allowedPort;

          if (!allowed) {
            this.logger.warn(
              `[phone-codex-socks] deny peer=${peer} dst=${normalizedHost}:${normalizedPort} (allow ${this.allowedHost}:${this.allowedPort})`
            );
            deny(0x02); // Connection not allowed by ruleset
            return;
          }

          stage = "connecting";
          socket.pause();

          const leftover = buf;
          buf = Buffer.alloc(0);

          remote = net.connect(
            { host: normalizedHost, port: normalizedPort },
            () => {
              try {
                const bindPort = remote.localPort || 0;
                socket.write(buildSocksReply(0x00, bindPort));
              } catch {
                // noop
              }

              if (leftover.length) {
                try {
                  remote.write(leftover);
                } catch {
                  // noop
                }
              }

              socket.removeListener("data", onData);
              socket.resume();

              // Bidirectional tunnel.
              socket.pipe(remote);
              remote.pipe(socket);
            }
          );

          remote.on("error", (err) => {
            this.logger.warn(
              `[phone-codex-socks] connect failed peer=${peer} dst=${normalizedHost}:${normalizedPort} error=${safeString(
                err && err.message ? err.message : err
              )}`
            );
            try {
              socket.write(buildSocksReply(0x05));
            } catch {
              // noop
            }
            try {
              socket.destroy();
            } catch {
              // noop
            }
          });

          remote.on("close", () => {
            try {
              socket.destroy();
            } catch {
              // noop
            }
          });

          return;
        }

        return;
      }
    };

    socket.on("data", onData);
  }
}

module.exports = {
  CodexSocksProxy,
};

