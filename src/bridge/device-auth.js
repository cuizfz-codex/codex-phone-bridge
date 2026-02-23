const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const net = require("net");
const path = require("path");

const DEFAULT_PAIRING_NETWORK_CIDRS = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "100.64.0.0/10",
  "fc00::/7",
  "127.0.0.1/8",
  "::1/128",
];

function safeString(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function normalizeMode(value, fallback) {
  const raw = safeString(value).trim().toLowerCase();
  if (raw === "strict") return "strict";
  if (raw === "hybrid") return "hybrid";
  if (raw === "off") return "off";
  return fallback;
}

function normalizeLegacyMode(value, fallback) {
  const raw = safeString(value).trim().toLowerCase();
  if (raw === "off") return "off";
  if (raw === "on") return "on";
  return fallback;
}

function parseCidrs(value, fallback) {
  const out = [];
  const push = (input) => {
    const item = safeString(input).trim();
    if (!item) return;
    if (!out.includes(item)) out.push(item);
  };
  if (Array.isArray(value)) {
    for (const item of value) push(item);
  } else if (typeof value === "string") {
    for (const item of value.split(/[,\n]/g)) push(item);
  }
  if (out.length > 0) return out;
  return [...fallback];
}

function toInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function normalizeIpAddress(input) {
  let text = safeString(input).trim();
  if (!text) return "";
  const zoneIndex = text.indexOf("%");
  if (zoneIndex >= 0) {
    text = text.slice(0, zoneIndex);
  }
  if (text.startsWith("::ffff:")) {
    const maybeV4 = text.slice(7);
    if (net.isIP(maybeV4) === 4) return maybeV4;
  }
  return text;
}

function sha256HexUtf8(input) {
  return crypto.createHash("sha256").update(Buffer.from(safeString(input), "utf8")).digest("hex");
}

function hmacBase64Url(hexKey, input) {
  const key = Buffer.from(safeString(hexKey), "hex");
  return crypto
    .createHmac("sha256", key)
    .update(Buffer.from(safeString(input), "utf8"))
    .digest("base64url");
}

function buildCanonicalPath(pathname, searchParams, excludedKeys = []) {
  const entries = [];
  for (const [key, value] of searchParams.entries()) {
    if (excludedKeys.includes(key)) continue;
    entries.push([key, value]);
  }
  entries.sort((a, b) => {
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    if (a[1] < b[1]) return -1;
    if (a[1] > b[1]) return 1;
    return 0;
  });
  const qs = new URLSearchParams();
  for (const [key, value] of entries) {
    qs.append(key, value);
  }
  const query = qs.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function buildSigningString({
  method,
  canonicalPath,
  bodySha256,
  timestampMs,
  nonce,
  deviceId,
}) {
  return [
    "v1",
    safeString(method || "GET").toUpperCase(),
    safeString(canonicalPath || "/"),
    safeString(bodySha256 || sha256HexUtf8("")),
    safeString(timestampMs),
    safeString(nonce),
    safeString(deviceId),
  ].join("\n");
}

function normalizeState(raw) {
  const state = raw && typeof raw === "object" ? raw : {};
  const active = state.activeDevice && typeof state.activeDevice === "object" ? state.activeDevice : null;
  const pairing = state.pairingSession && typeof state.pairingSession === "object" ? state.pairingSession : null;
  return {
    activeDevice: active
      ? {
          deviceId: safeString(active.deviceId),
          name: safeString(active.name) || "Phone Device",
          secretHash: safeString(active.secretHash),
          createdAt: safeString(active.createdAt),
          lastSeenAt: safeString(active.lastSeenAt || active.createdAt),
        }
      : null,
    pairingSession: pairing
      ? {
          pairingId: safeString(pairing.pairingId),
          codeHash: safeString(pairing.codeHash),
          createdAt: safeString(pairing.createdAt),
          expiresAt: safeString(pairing.expiresAt),
        }
      : null,
    nonceReplayCacheMeta:
      state.nonceReplayCacheMeta && typeof state.nonceReplayCacheMeta === "object"
        ? {
            lastPurgeAt: safeString(state.nonceReplayCacheMeta.lastPurgeAt || ""),
          }
        : { lastPurgeAt: "" },
  };
}

class DeviceAuthManager {
  constructor(options = {}) {
    this.mode = normalizeMode(options.mode || "strict", "strict");
    this.legacyTokenMode = normalizeLegacyMode(options.legacyTokenMode || "off", "off");
    this.statePath =
      safeString(options.statePath).trim() || path.join(process.cwd(), "device-binding.json");
    this.pairingCodeLength = toInt(options.pairingCodeLength, 6, 4, 12);
    this.pairingTtlSec = toInt(options.pairingTtlSec, 300, 30, 1800);
    this.maxBoundDevices = 1;
    this.nonceTtlMs = toInt(options.nonceTtlMs, 10 * 60 * 1000, 60 * 1000, 60 * 60 * 1000);
    this.timeSkewMs = toInt(options.timeSkewMs, 90 * 1000, 15 * 1000, 10 * 60 * 1000);
    this.logger = options.logger || console;
    this.pairingNetworkCidrs = parseCidrs(
      options.pairingNetworkCidrs,
      DEFAULT_PAIRING_NETWORK_CIDRS
    );
    this.pairingNetworkBlockList = this._buildBlockList(this.pairingNetworkCidrs);
    this.state = normalizeState(null);
    this.nonceReplay = new Map();
  }

  async init() {
    this.state = await this.loadState();
  }

  async loadState() {
    try {
      const content = await fsp.readFile(this.statePath, "utf8");
      return normalizeState(JSON.parse(content));
    } catch {
      return normalizeState(null);
    }
  }

  async saveState() {
    const dir = path.dirname(this.statePath);
    await fsp.mkdir(dir, { recursive: true });
    const tmpPath = `${this.statePath}.tmp`;
    await fsp.writeFile(tmpPath, JSON.stringify(this.state, null, 2), "utf8");
    await fsp.rename(tmpPath, this.statePath);
  }

  _buildBlockList(cidrs) {
    const blockList = new net.BlockList();
    for (const raw of cidrs) {
      const item = safeString(raw).trim();
      if (!item) continue;
      const [addrRaw, prefixRaw] = item.split("/");
      const address = normalizeIpAddress(addrRaw);
      const family = net.isIP(address);
      if (!family) continue;
      const defaultPrefix = family === 4 ? 32 : 128;
      const prefix = prefixRaw !== undefined ? Number(prefixRaw) : defaultPrefix;
      if (!Number.isInteger(prefix)) continue;
      if ((family === 4 && (prefix < 0 || prefix > 32)) || (family === 6 && (prefix < 0 || prefix > 128))) {
        continue;
      }
      try {
        blockList.addSubnet(address, prefix, family === 4 ? "ipv4" : "ipv6");
      } catch {
        // noop
      }
    }
    return blockList;
  }

  _isPairingNetworkAllowed(remoteAddress) {
    const ip = normalizeIpAddress(remoteAddress);
    if (!ip) return false;
    const family = net.isIP(ip);
    if (!family) return false;
    return this.pairingNetworkBlockList.check(ip, family === 4 ? "ipv4" : "ipv6");
  }

  _purgeReplay(nowMs) {
    const now = Number(nowMs || Date.now());
    for (const [nonce, expireAt] of this.nonceReplay.entries()) {
      if (expireAt <= now) this.nonceReplay.delete(nonce);
    }
    this.state.nonceReplayCacheMeta.lastPurgeAt = new Date(now).toISOString();
  }

  _randomDigits(length) {
    const out = [];
    while (out.length < length) {
      const b = crypto.randomBytes(1)[0];
      const digit = b % 10;
      out.push(String(digit));
    }
    return out.join("");
  }

  _safeCompare(a, b) {
    const aa = Buffer.from(safeString(a), "utf8");
    const bb = Buffer.from(safeString(b), "utf8");
    if (aa.length !== bb.length) return false;
    return crypto.timingSafeEqual(aa, bb);
  }

  _basePairingPath(pairingId) {
    const qs = new URLSearchParams();
    qs.set("pairing", "1");
    qs.set("pairingId", pairingId);
    return `/?${qs.toString()}`;
  }

  _publicActiveDevice() {
    const active = this.state.activeDevice;
    if (!active) return null;
    return {
      deviceId: active.deviceId,
      name: active.name,
      createdAt: active.createdAt,
      lastSeenAt: active.lastSeenAt,
    };
  }

  getStateSummary() {
    const pairing = this.state.pairingSession;
    const now = Date.now();
    const pairingOpen =
      Boolean(pairing && pairing.expiresAt) && new Date(pairing.expiresAt).getTime() > now;
    return {
      mode: this.mode,
      legacyTokenMode: this.legacyTokenMode,
      pairingCodeLength: this.pairingCodeLength,
      pairingTtlSec: this.pairingTtlSec,
      maxBoundDevices: this.maxBoundDevices,
      pairingNetworkCidrs: [...this.pairingNetworkCidrs],
      activeDevice: this._publicActiveDevice(),
      pairingSession: pairing
        ? {
            pairingId: pairing.pairingId,
            createdAt: pairing.createdAt,
            expiresAt: pairing.expiresAt,
            open: pairingOpen,
          }
        : null,
    };
  }

  async startPairingSession(options = {}) {
    const now = Date.now();
    const pairingId = crypto.randomUUID();
    const code = this._randomDigits(this.pairingCodeLength);
    const expiresAt = new Date(now + this.pairingTtlSec * 1000).toISOString();

    this.state.pairingSession = {
      pairingId,
      codeHash: sha256HexUtf8(code),
      createdAt: new Date(now).toISOString(),
      expiresAt,
    };
    await this.saveState();

    const baseUrls = Array.isArray(options.baseUrls)
      ? options.baseUrls.map((item) => safeString(item).trim()).filter(Boolean)
      : [];
    const pairingPath = this._basePairingPath(pairingId);
    const pairingUrls = baseUrls.map((base) => `${base}${pairingPath}`);

    return {
      pairingId,
      code,
      expiresAt,
      pairingPath,
      pairingUrls,
      mode: this.mode,
    };
  }

  async resetBinding() {
    this.state.activeDevice = null;
    this.state.pairingSession = null;
    await this.saveState();
    return { ok: true };
  }

  async completePairing(options = {}) {
    const pairingId = safeString(options.pairingId).trim();
    const code = safeString(options.code).trim();
    const deviceName = safeString(options.deviceName).trim() || "Phone Device";
    const remoteAddress = safeString(options.remoteAddress).trim();

    if (!this._isPairingNetworkAllowed(remoteAddress)) {
      return { ok: false, status: 403, error: "Pairing is only allowed from LAN or tailnet" };
    }
    const session = this.state.pairingSession;
    if (!session) {
      return { ok: false, status: 400, error: "No active pairing session" };
    }
    if (!pairingId || pairingId !== session.pairingId) {
      return { ok: false, status: 400, error: "Invalid pairingId" };
    }
    const expireMs = new Date(session.expiresAt).getTime();
    if (!Number.isFinite(expireMs) || expireMs <= Date.now()) {
      return { ok: false, status: 410, error: "Pairing session expired" };
    }
    const providedHash = sha256HexUtf8(code);
    if (!this._safeCompare(providedHash, session.codeHash)) {
      return { ok: false, status: 403, error: "Invalid verification code" };
    }

    const deviceSecret = crypto.randomBytes(32).toString("base64url");
    const secretHash = sha256HexUtf8(deviceSecret);
    const nowIso = new Date().toISOString();
    this.state.activeDevice = {
      deviceId: crypto.randomUUID(),
      name: deviceName.slice(0, 64),
      secretHash,
      createdAt: nowIso,
      lastSeenAt: nowIso,
    };
    this.state.pairingSession = null;
    this.nonceReplay.clear();
    await this.saveState();

    return {
      ok: true,
      status: 200,
      deviceId: this.state.activeDevice.deviceId,
      deviceSecret,
      issuedAt: nowIso,
    };
  }

  _extractCredentials(source) {
    const get = (key) => safeString(source[key]).trim();
    return {
      deviceId: get("deviceId"),
      timestampMs: get("timestampMs"),
      nonce: get("nonce"),
      signature: get("signature"),
    };
  }

  async verifySignedRequest(options = {}) {
    if (this.mode === "off") {
      return { ok: false, code: "device_auth_off" };
    }
    const active = this.state.activeDevice;
    if (!active || !active.deviceId || !active.secretHash) {
      return { ok: false, status: 401, code: "device_not_bound" };
    }

    const credentials = this._extractCredentials(options.credentials || {});
    if (
      !credentials.deviceId ||
      !credentials.timestampMs ||
      !credentials.nonce ||
      !credentials.signature
    ) {
      return { ok: false, status: 401, code: "missing_signature_fields" };
    }
    if (credentials.deviceId !== active.deviceId) {
      return { ok: false, status: 401, code: "unknown_device" };
    }

    const ts = Number(credentials.timestampMs);
    if (!Number.isFinite(ts)) {
      return { ok: false, status: 401, code: "invalid_timestamp" };
    }
    const now = Date.now();
    if (Math.abs(now - ts) > this.timeSkewMs) {
      return { ok: false, status: 401, code: "timestamp_out_of_window" };
    }

    this._purgeReplay(now);
    if (this.nonceReplay.has(credentials.nonce)) {
      return { ok: false, status: 401, code: "replay_detected" };
    }

    const method = safeString(options.method || "GET").toUpperCase();
    const pathname = safeString(options.pathname || "/");
    const searchParams =
      options.searchParams instanceof URLSearchParams
        ? options.searchParams
        : new URLSearchParams();
    const canonicalPath = buildCanonicalPath(pathname, searchParams, ["sig"]);
    const bodySha256 = sha256HexUtf8(options.rawBody || "");
    const signingString = buildSigningString({
      method,
      canonicalPath,
      bodySha256,
      timestampMs: credentials.timestampMs,
      nonce: credentials.nonce,
      deviceId: credentials.deviceId,
    });
    const expected = hmacBase64Url(active.secretHash, signingString);
    if (!this._safeCompare(expected, credentials.signature)) {
      return { ok: false, status: 401, code: "bad_signature" };
    }

    this.nonceReplay.set(credentials.nonce, now + this.nonceTtlMs);
    const lastSeenMs = new Date(active.lastSeenAt || 0).getTime();
    if (!Number.isFinite(lastSeenMs) || now - lastSeenMs > 30 * 1000) {
      active.lastSeenAt = new Date(now).toISOString();
      await this.saveState().catch(() => null);
    }

    return {
      ok: true,
      status: 200,
      deviceId: active.deviceId,
      code: "ok",
    };
  }
}

function extractDeviceCredentialsFromRequest(req, url, allowQuery = false) {
  const headers = req && req.headers ? req.headers : {};
  const out = {
    deviceId: safeString(headers["x-device-id"] || "").trim(),
    timestampMs: safeString(headers["x-device-timestamp"] || "").trim(),
    nonce: safeString(headers["x-device-nonce"] || "").trim(),
    signature: safeString(headers["x-device-signature"] || "").trim(),
  };
  if (allowQuery) {
    if (!out.deviceId) out.deviceId = safeString(url.searchParams.get("deviceId")).trim();
    if (!out.timestampMs) out.timestampMs = safeString(url.searchParams.get("ts")).trim();
    if (!out.nonce) out.nonce = safeString(url.searchParams.get("nonce")).trim();
    if (!out.signature) out.signature = safeString(url.searchParams.get("sig")).trim();
  }
  return out;
}

function isLocalAddress(remoteAddress) {
  const ip = normalizeIpAddress(remoteAddress);
  if (!ip) return false;
  if (ip === "127.0.0.1" || ip === "::1") return true;
  return false;
}

module.exports = {
  DeviceAuthManager,
  DEFAULT_PAIRING_NETWORK_CIDRS,
  sha256HexUtf8,
  hmacBase64Url,
  buildCanonicalPath,
  buildSigningString,
  extractDeviceCredentialsFromRequest,
  isLocalAddress,
  normalizeIpAddress,
  normalizeMode,
  normalizeLegacyMode,
};
