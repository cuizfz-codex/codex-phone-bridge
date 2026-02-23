function safeToUtf8(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  if (value instanceof ArrayBuffer) return Buffer.from(value).toString("utf8");
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("utf8");
  }
  return String(value);
}

module.exports = {
  safeToUtf8,
};

