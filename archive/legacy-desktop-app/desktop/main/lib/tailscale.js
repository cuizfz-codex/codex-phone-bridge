const { execFile } = require("child_process");

const { safeString } = require("./util");

function execFileAsync(bin, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      {
        timeout: timeoutMs,
      },
      (err, stdout, stderr) => {
        if (err) {
          const wrapped = new Error(
            safeString(stderr || stdout || err.message).trim() || "Command failed"
          );
          wrapped.code = err.code || null;
          wrapped.killed = Boolean(err.killed);
          wrapped.signal = err.signal || null;
          reject(wrapped);
          return;
        }
        resolve(String(stdout || ""));
      }
    );
  });
}

function normalizeCliPath(value) {
  const trimmed = safeString(value).trim();
  return trimmed || "tailscale";
}

function extractMagicDnsName(statusJson) {
  const dns = safeString(
    statusJson &&
      statusJson.Self &&
      (statusJson.Self.DNSName || statusJson.Self.DnsName || statusJson.Self.dnsName)
  ).trim();
  if (!dns) return null;
  return dns.endsWith(".") ? dns.slice(0, -1) : dns;
}

function extractTailscaleIpv4(statusJson) {
  const ips =
    statusJson &&
    statusJson.Self &&
    Array.isArray(statusJson.Self.TailscaleIPs)
      ? statusJson.Self.TailscaleIPs
      : [];
  for (const ip of ips) {
    const text = safeString(ip).trim();
    if (/^\d+\.\d+\.\d+\.\d+$/.test(text) && text.startsWith("100.")) {
      return text;
    }
  }
  for (const ip of ips) {
    const text = safeString(ip).trim();
    if (/^\d+\.\d+\.\d+\.\d+$/.test(text)) {
      return text;
    }
  }
  return null;
}

async function getTailscaleStatus(options = {}) {
  const cliPath = normalizeCliPath(options.cliPath);
  const timeoutMs = Math.max(500, Number(options.timeoutMs || 2000));
  const result = {
    cliPath,
    installed: false,
    connected: false,
    ipv4: null,
    magicDns: null,
    backendState: null,
    errorCode: null,
    errorMessage: "",
  };

  try {
    await execFileAsync(cliPath, ["version"], timeoutMs);
    result.installed = true;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      result.errorCode = "not_installed";
      result.errorMessage = "tailscale CLI not found";
      return result;
    }
    result.errorCode = "version_failed";
    result.errorMessage = safeString(error && error.message ? error.message : error);
    return result;
  }

  let statusText = "";
  try {
    statusText = await execFileAsync(cliPath, ["status", "--json"], timeoutMs);
  } catch (error) {
    result.errorCode = "status_failed";
    result.errorMessage = safeString(error && error.message ? error.message : error);
    return result;
  }

  let statusJson = null;
  try {
    statusJson = JSON.parse(statusText);
  } catch {
    result.errorCode = "status_parse_failed";
    result.errorMessage = "tailscale status returned invalid JSON";
    return result;
  }

  const backendState = safeString(statusJson && statusJson.BackendState).trim() || null;
  const ipv4 = extractTailscaleIpv4(statusJson);
  const magicDns = extractMagicDnsName(statusJson);
  const connected = backendState === "Running" && Boolean(ipv4 || magicDns);

  result.backendState = backendState;
  result.ipv4 = ipv4;
  result.magicDns = magicDns;
  result.connected = connected;
  if (!connected) {
    result.errorCode = "not_connected";
    result.errorMessage = backendState
      ? `tailscale backend state: ${backendState}`
      : "tailscale is not connected";
  }
  return result;
}

module.exports = {
  getTailscaleStatus,
  normalizeCliPath,
};
