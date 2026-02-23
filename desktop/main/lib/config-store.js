const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const { safeString, normalizePort, normalizeBool } = require("./util");

const DEFAULT_ALLOWED_CLIENT_CIDRS = [
  "127.0.0.1/8",
  "::1/128",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "100.64.0.0/10",
  "fc00::/7",
];
const DEFAULT_PAIRING_NETWORK_CIDRS = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "100.64.0.0/10",
  "fc00::/7",
  "127.0.0.1/8",
  "::1/128",
];

function normalizeDesktopOverlayMode(value, fallback = "authoritative") {
  const raw = safeString(value).trim().toLowerCase();
  if (raw === "off") return "off";
  if (raw === "authoritative") return "authoritative";
  return fallback;
}

function normalizeDeviceAuthMode(value, fallback = "strict") {
  const raw = safeString(value).trim().toLowerCase();
  if (raw === "strict") return "strict";
  if (raw === "hybrid") return "hybrid";
  if (raw === "off") return "off";
  return fallback;
}

function normalizeLegacyTokenMode(value, fallback = "off") {
  const raw = safeString(value).trim().toLowerCase();
  if (raw === "off") return "off";
  if (raw === "on") return "on";
  return fallback;
}

function normalizeBoundedInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function normalizeRemoteMode(value, fallback = "tailscale") {
  const raw = safeString(value).trim().toLowerCase();
  if (raw === "tailscale") return "tailscale";
  if (raw === "off") return "off";
  return fallback;
}

function defaultUiLanguage() {
  const lang = safeString(process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES)
    .trim()
    .toLowerCase();
  if (lang.startsWith("zh")) return "zh-CN";
  return "en";
}

function normalizeUiLanguage(value, fallback) {
  const raw = safeString(value).trim().toLowerCase();
  if (raw === "zh" || raw === "zh-cn" || raw === "zh_hans" || raw === "zh-hans") {
    return "zh-CN";
  }
  if (raw === "en" || raw === "en-us" || raw === "en_us" || raw === "en-gb" || raw === "en_gb") {
    return "en";
  }
  return fallback;
}

function normalizeCidrList(value, fallback) {
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
  return [...(Array.isArray(fallback) ? fallback : DEFAULT_ALLOWED_CLIENT_CIDRS)];
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readJsonFile(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function writeJsonFile(p, obj) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

function generateAuthToken() {
  return crypto.randomBytes(32).toString("hex");
}

function getUserDataDir(app, appName) {
  // Ensure the directory name is stable across environments.
  // electron-builder productName is also set to phone-codex.
  try {
    appName && app.setName(appName);
  } catch {
    // noop
  }
  return app.getPath("userData");
}

function configPath(app, appName) {
  return path.join(getUserDataDir(app, appName), "config.json");
}

function loadConfig(app, appName) {
  const p = configPath(app, appName);
  const existing = readJsonFile(p) || {};
  const uiLanguageDefault = defaultUiLanguage();
  const merged = {
    bridgePort: normalizePort(existing.bridgePort, 8787),
    bindHost: existing.bindHost === "127.0.0.1" ? "127.0.0.1" : "0.0.0.0",
    proxyPort: normalizePort(existing.proxyPort, 18791),
    authToken: safeString(existing.authToken) || generateAuthToken(),
    codexCliPath:
      safeString(existing.codexCliPath) ||
      "/Applications/Codex.app/Contents/Resources/codex",
    proxyDebug: normalizeBool(existing.proxyDebug, false),
    desktopOverlayMode: normalizeDesktopOverlayMode(
      existing.desktopOverlayMode,
      "authoritative"
    ),
    remoteMode: normalizeRemoteMode(existing.remoteMode, "tailscale"),
    allowLanClients: normalizeBool(existing.allowLanClients, true),
    tailscaleCliPath: safeString(existing.tailscaleCliPath).trim() || "tailscale",
    allowedClientCidrs: normalizeCidrList(
      existing.allowedClientCidrs,
      DEFAULT_ALLOWED_CLIENT_CIDRS
    ),
    showRemoteUrlInUi: normalizeBool(existing.showRemoteUrlInUi, true),
    deviceAuthMode: normalizeDeviceAuthMode(existing.deviceAuthMode, "strict"),
    pairingCodeLength: normalizeBoundedInt(existing.pairingCodeLength, 6, 4, 12),
    pairingTtlSec: normalizeBoundedInt(existing.pairingTtlSec, 300, 30, 1800),
    pairingNetworkCidrs: normalizeCidrList(
      existing.pairingNetworkCidrs,
      DEFAULT_PAIRING_NETWORK_CIDRS
    ),
    maxBoundDevices: 1,
    legacyTokenMode: normalizeLegacyTokenMode(existing.legacyTokenMode, "off"),
    uiLanguage: normalizeUiLanguage(existing.uiLanguage, uiLanguageDefault),
  };
  writeJsonFile(p, merged);
  return merged;
}

function saveConfig(app, appName, patch) {
  const p = configPath(app, appName);
  const current = readJsonFile(p) || {};
  const next = { ...current, ...(patch || {}) };
  writeJsonFile(p, next);
  return next;
}

module.exports = {
  getUserDataDir,
  configPath,
  loadConfig,
  saveConfig,
  generateAuthToken,
  DEFAULT_ALLOWED_CLIENT_CIDRS,
  DEFAULT_PAIRING_NETWORK_CIDRS,
};
