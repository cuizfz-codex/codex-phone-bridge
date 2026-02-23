const os = require("os");
const net = require("net");

const { safeString, normalizePort } = require("./util");

function listLanIps() {
  const results = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const item of ifaces[name] || []) {
      if (!item) continue;
      if (item.family !== "IPv4") continue;
      if (item.internal) continue;
      if (!item.address) continue;
      results.push(item.address);
    }
  }
  // stable order
  return [...new Set(results)].sort();
}

async function isPortFree(host, port) {
  const targetHost = safeString(host) || "127.0.0.1";
  const targetPort = normalizePort(port, 0);
  if (!targetPort) return false;

  return await new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", (err) => {
      if (err && err.code === "EADDRINUSE") resolve(false);
      else resolve(false);
    });
    tester.listen(targetPort, targetHost, () => {
      tester.close(() => resolve(true));
    });
  });
}

module.exports = {
  listLanIps,
  isPortFree,
};

