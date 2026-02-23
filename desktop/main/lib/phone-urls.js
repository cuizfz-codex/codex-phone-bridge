const { safeString, normalizePort } = require("./util");
const { listLanIps } = require("./net");

function buildPhoneUrls(cfg, options = {}) {
  const port = normalizePort(cfg.bridgePort, 8787);
  const token = safeString(cfg.authToken);
  const bindLocalOnly = cfg.bindHost === "127.0.0.1";
  const lanIps = Array.isArray(options.lanIps) ? options.lanIps : listLanIps();
  const ips = bindLocalOnly ? ["127.0.0.1"] : lanIps;
  const tailscale = options.tailscale && typeof options.tailscale === "object" ? options.tailscale : null;
  const urls = [];
  const seenBase = new Set();
  const remoteEnabled = safeString(cfg.remoteMode).trim().toLowerCase() === "tailscale";
  const showRemote = cfg.showRemoteUrlInUi !== false;
  for (const ip of ips) {
    if (remoteEnabled && ip.startsWith("100.")) {
      // Keep Tailscale endpoints in the dedicated Remote Access section to avoid duplicates.
      continue;
    }
    const base = `http://${ip}:${port}`;
    if (seenBase.has(base)) continue;
    seenBase.add(base);
    const full = `${base}/?base=${encodeURIComponent(base)}&token=${encodeURIComponent(
      token
    )}`;
    urls.push({
      kind: ip === "127.0.0.1" ? "local" : "lan",
      ip,
      url: full,
      base,
    });
  }

  if (remoteEnabled && showRemote && !bindLocalOnly && tailscale && tailscale.connected) {
    if (tailscale.ipv4) {
      const base = `http://${tailscale.ipv4}:${port}`;
      if (seenBase.has(base)) {
        // no-op
      } else {
        seenBase.add(base);
        urls.push({
          kind: "tailscale",
          ip: tailscale.ipv4,
          url: `${base}/?base=${encodeURIComponent(base)}&token=${encodeURIComponent(token)}`,
          base,
        });
      }
    }
    if (tailscale.magicDns) {
      const host = tailscale.magicDns;
      const base = `http://${host}:${port}`;
      if (!seenBase.has(base)) {
        seenBase.add(base);
        urls.push({
          kind: "tailscale",
          ip: host,
          url: `${base}/?base=${encodeURIComponent(base)}&token=${encodeURIComponent(token)}`,
          base,
        });
      }
    }
  }
  return urls;
}

module.exports = {
  buildPhoneUrls,
};
