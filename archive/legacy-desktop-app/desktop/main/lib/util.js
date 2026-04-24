function nowIso() {
  return new Date().toISOString();
}

function safeString(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function normalizePort(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(65535, Math.floor(n)));
}

function normalizeBool(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  const raw = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(raw)) return true;
  if (["0", "false", "no", "n", "off"].includes(raw)) return false;
  return fallback;
}

module.exports = {
  nowIso,
  safeString,
  normalizePort,
  normalizeBool,
};

