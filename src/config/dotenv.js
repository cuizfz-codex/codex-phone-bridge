const fs = require("fs");
const path = require("path");

function loadDotEnv(options = {}) {
  const cwd = options.cwd ? String(options.cwd) : process.cwd();
  const targetEnv = options.env || process.env;
  const envPath = options.envPath ? String(options.envPath) : path.join(cwd, ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in targetEnv)) {
      targetEnv[key] = value;
    }
  }
}

module.exports = {
  loadDotEnv,
};

