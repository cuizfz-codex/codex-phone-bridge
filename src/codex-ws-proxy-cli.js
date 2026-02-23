const { CodexWsProxy } = require("./codex-ws-proxy");
const { loadDotEnv } = require("./config/dotenv");
const { normalizePort, normalizeBooleanFlag } = require("./shared/normalize");

async function main() {
  loadDotEnv({ cwd: process.cwd(), env: process.env });

  const listenPort = normalizePort(process.env.CODEX_WS_PROXY_LISTEN_PORT, 18791);
  const spawnUpstream = normalizeBooleanFlag(
    process.env.CODEX_WS_PROXY_SPAWN_UPSTREAM,
    true
  );
  const codexBin =
    process.env.CODEX_APP_SERVER_BIN ||
    "/Applications/Codex.app/Contents/Resources/codex";

  const proxy = new CodexWsProxy({
    listenHost: "127.0.0.1",
    listenPort,
    spawnUpstream,
    bin: codexBin,
    approvalClientName: process.env.CODEX_WS_PROXY_APPROVAL_CLIENT_NAME,
    logger: console,
  });

  const shutdown = async (signal) => {
    console.log(`[phone-codex-proxy] received ${signal}, shutting down`);
    try {
      await proxy.stop();
    } catch {
      // noop
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  console.log("[phone-codex-proxy] starting", proxy.status());
  await proxy.start();
}

main().catch((error) => {
  console.error(
    `[phone-codex-proxy] fatal: ${String(
      error && error.message ? error.message : error
    )}`
  );
  process.exit(1);
});
