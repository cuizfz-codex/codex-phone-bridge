function safeJsonStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function jsonIdKey(id) {
  return JSON.stringify(id);
}

module.exports = {
  safeJsonStringify,
  jsonIdKey,
};

