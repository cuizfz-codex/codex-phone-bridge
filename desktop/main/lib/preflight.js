const net = require("net");
const WebSocket = require("ws");

const { normalizePort, safeString } = require("./util");

async function preflightSocksConnect({
  socksHost = "127.0.0.1",
  socksPort = 1080,
  dstHost = "127.0.0.1",
  dstPort,
  timeoutMs = 1500,
}) {
  const targetPort = normalizePort(dstPort, 0);
  if (!targetPort) return false;

  const readExact = (socket, bytesNeeded) =>
    new Promise((resolve, reject) => {
      let buf = Buffer.alloc(0);
      const onData = (chunk) => {
        buf = Buffer.concat([buf, Buffer.from(chunk)]);
        if (buf.length >= bytesNeeded) {
          socket.off("data", onData);
          resolve(buf.slice(0, bytesNeeded));
        }
      };
      socket.on("data", onData);
      socket.once("error", reject);
    });

  return await new Promise((resolve) => {
    const socket = net.connect({ host: socksHost, port: socksPort });
    let finished = false;
    const finish = (ok) => {
      if (finished) return;
      finished = true;
      try {
        socket.destroy();
      } catch {
        // noop
      }
      resolve(ok);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    socket.once("error", () => {
      clearTimeout(timer);
      finish(false);
    });

    socket.once("connect", async () => {
      try {
        // Greeting: SOCKS5, 1 method, no-auth.
        socket.write(Buffer.from([0x05, 0x01, 0x00]));
        const greetResp = await readExact(socket, 2);
        if (greetResp[0] !== 0x05 || greetResp[1] !== 0x00) {
          clearTimeout(timer);
          finish(false);
          return;
        }

        // Connect request: IPv4 dstHost only (we use 127.0.0.1).
        if (dstHost !== "127.0.0.1") {
          clearTimeout(timer);
          finish(false);
          return;
        }
        const portHi = (targetPort >> 8) & 0xff;
        const portLo = targetPort & 0xff;
        socket.write(
          Buffer.from([0x05, 0x01, 0x00, 0x01, 127, 0, 0, 1, portHi, portLo])
        );

        const connResp = await readExact(socket, 10);
        const ok = connResp[0] === 0x05 && connResp[1] === 0x00;
        clearTimeout(timer);
        finish(ok);
      } catch {
        clearTimeout(timer);
        finish(false);
      }
    });
  });
}

async function preflightProxyHandshake(wsUrl, timeoutMs = 2000) {
  return await new Promise((resolve) => {
    const ws = new WebSocket(wsUrl, { handshakeTimeout: timeoutMs });
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try {
        ws.terminate();
      } catch {
        // noop
      }
      resolve(ok);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    ws.on("open", () => {
      try {
        ws.send(
          `${JSON.stringify({
            id: "preflight:initialize",
            method: "initialize",
            params: {
              clientInfo: {
                name: "phone-codex-preflight",
                title: "preflight",
                version: "0.0.0",
              },
              capabilities: { experimentalApi: true },
            },
          })}\n`
        );
      } catch {
        clearTimeout(timer);
        finish(false);
      }
    });

    ws.on("message", (data) => {
      const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg && msg.id === "preflight:initialize" && msg.result) {
            clearTimeout(timer);
            finish(true);
            return;
          }
        } catch {
          // ignore
        }
      }
    });

    ws.on("error", () => {
      clearTimeout(timer);
      finish(false);
    });
    ws.on("close", () => {
      clearTimeout(timer);
      finish(false);
    });
  });
}

module.exports = {
  preflightSocksConnect,
  preflightProxyHandshake,
};

