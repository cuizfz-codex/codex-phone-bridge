function safeMeta(value) {
  if (!value || typeof value !== "object") return null;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    if (v === null) out[k] = null;
    else if (typeof v === "string") out[k] = v;
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else {
      // Avoid leaking message content by default. Nested objects should be explicit.
      out[k] = "[object]";
    }
  }
  return Object.keys(out).length ? out : null;
}

function formatLine({ ts, level, component, message, meta }) {
  const parts = [ts, `[${level}]`, component ? `[${component}]` : null, message]
    .filter(Boolean)
    .join(" ");
  if (!meta) return parts;
  return `${parts} ${JSON.stringify(meta)}`;
}

function createLogger(options = {}) {
  const component = options.component ? String(options.component) : "";
  const debugEnabled = Boolean(options.debug);
  const write =
    typeof options.write === "function"
      ? options.write
      : (line) => {
          // eslint-disable-next-line no-console
          console.log(line);
        };

  const logAt = (level, message, meta) => {
    const ts = new Date().toISOString();
    const line = formatLine({
      ts,
      level,
      component,
      message: String(message || ""),
      meta: safeMeta(meta),
    });
    try {
      write(line);
    } catch {
      // noop
    }
  };

  return {
    debugEnabled,
    debug: (message, meta) => {
      if (!debugEnabled) return;
      logAt("DEBUG", message, meta);
    },
    info: (message, meta) => logAt("INFO", message, meta),
    warn: (message, meta) => logAt("WARN", message, meta),
    error: (message, meta) => logAt("ERROR", message, meta),
    child: (childComponent) =>
      createLogger({
        component: component && childComponent ? `${component}:${childComponent}` : childComponent,
        debug: debugEnabled,
        write,
      }),
  };
}

module.exports = {
  createLogger,
};

