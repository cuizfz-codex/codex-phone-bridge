const { loadDotEnv } = require("./src/config/dotenv");

// Optional local env overrides for CLI usage. Electron spawns this with explicit env.
loadDotEnv({ cwd: process.cwd(), env: process.env });

const { bootstrapBridge } = require("./src/bridge/bridge-app");

bootstrapBridge().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[phone-codex-bridge] failed to bootstrap:", error);
});

