const crypto = require("crypto");

class SSEHub {
  constructor() {
    this.clients = new Map();
    this.keepAlive = setInterval(() => {
      this.broadcast("ping", { now: new Date().toISOString() });
    }, 15000);
  }

  addClient(req, res, options = {}) {
    const id = crypto.randomUUID();
    const threadId = options.threadId || null;
    const authTokenHash = options.authTokenHash || null;

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(": connected\n\n");

    this.clients.set(id, {
      id,
      req,
      res,
      threadId,
      authTokenHash,
      createdAt: Date.now(),
      lastSentAt: Date.now(),
    });

    req.on("close", () => {
      this.removeClient(id);
    });
    req.on("error", () => {
      this.removeClient(id);
    });

    return id;
  }

  removeClient(id) {
    const client = this.clients.get(id);
    if (!client) return;
    this.clients.delete(id);
    try {
      client.res.end();
    } catch (_error) {
      // noop
    }
  }

  hasClient(id) {
    return this.clients.has(id);
  }

  getClient(id) {
    return this.clients.get(id) || null;
  }

  count() {
    return this.clients.size;
  }

  sendTo(clientId, event, data) {
    const client = this.clients.get(clientId);
    if (!client) return false;
    return this._send(client, event, data);
  }

  broadcast(event, data, predicate = null) {
    for (const client of this.clients.values()) {
      if (predicate && !predicate(client)) {
        continue;
      }
      this._send(client, event, data);
    }
  }

  broadcastThread(threadId, event, data) {
    this.broadcast(event, data, (client) => {
      if (!client.threadId) return true;
      return client.threadId === threadId;
    });
  }

  _send(client, event, data) {
    if (!this.clients.has(client.id)) return false;
    try {
      const lines = [
        `event: ${event}`,
        `data: ${JSON.stringify(data)}`,
        "",
        "",
      ];
      client.res.write(lines.join("\n"));
      client.lastSentAt = Date.now();
      return true;
    } catch (_error) {
      this.removeClient(client.id);
      return false;
    }
  }

  close() {
    clearInterval(this.keepAlive);
    for (const clientId of [...this.clients.keys()]) {
      this.removeClient(clientId);
    }
  }
}

module.exports = {
  SSEHub,
};

