function normalizeHost(value, fallback) {
  const raw = String(value || "").trim();
  return raw || fallback;
}

function normalizePort(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(65535, Math.floor(n)));
}

function normalizeBooleanFlag(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const raw = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(raw)) return true;
  if (["0", "false", "no", "n", "off"].includes(raw)) return false;
  return fallback;
}

function safeString(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

module.exports = {
  normalizeHost,
  normalizePort,
  normalizeBooleanFlag,
  safeString,
};

