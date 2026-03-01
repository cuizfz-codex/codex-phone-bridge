const http = require("http");
const https = require("https");
const net = require("net");
const os = require("os");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { URL } = require("url");

const { CodexAppServerClient } = require("../codex-rpc-client");
const { ThreadSyncService, ALL_SOURCE_KINDS } = require("../thread-service");
const { DesktopNudge, normalizeDesktopNudgeMode } = require("../desktop-nudge");
const { MediaService } = require("../media-service");
const { SSEHub } = require("../sse-hub");
const { buildTurnInput } = require("./lib/turn-input");
const { buildApprovalResponsePayload } = require("./lib/approvals");
const { normalizeBooleanFlag } = require("../shared/normalize");

// Resolve paths relative to this file so the bridge can run from anywhere,
// including inside an Electron asar bundle.
const WORKSPACE_ROOT = path.resolve(__dirname, "..", "..");
const PUBLIC_DIR = path.join(WORKSPACE_ROOT, "public");

const PORT = Number(process.env.PORT || 8787);
const BIND_HOST = String(process.env.BIND_HOST || "0.0.0.0").trim() || "0.0.0.0";
const HTTPS_ENABLED = normalizeBooleanFlag(process.env.HTTPS_ENABLED, false);
const HTTPS_CERT_FILE = String(process.env.HTTPS_CERT_FILE || "").trim();
const HTTPS_KEY_FILE = String(process.env.HTTPS_KEY_FILE || "").trim();
const HTTPS_CA_FILE = String(process.env.HTTPS_CA_FILE || "").trim();
const HTTPS_PASSPHRASE = String(process.env.HTTPS_PASSPHRASE || "");
const HTTPS_REDIRECT_PORT = parseInteger(
  process.env.HTTPS_REDIRECT_PORT,
  0,
  0,
  65535
);
const SERVER_SCHEME = HTTPS_ENABLED ? "https" : "http";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "";
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 1024 * 1024 * 8);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 120000);
const AUTH_TOKEN =
  process.env.AUTH_TOKEN || crypto.randomBytes(16).toString("hex");
const SIMPLE_LOGIN_PASSWORD = String(process.env.SIMPLE_LOGIN_PASSWORD || "").trim();
const REQUIRE_LOGIN = normalizeBooleanFlag(
  process.env.REQUIRE_LOGIN,
  Boolean(SIMPLE_LOGIN_PASSWORD)
);
const SESSION_COOKIE_NAME =
  String(process.env.SESSION_COOKIE_NAME || "phone_codex_session").trim() ||
  "phone_codex_session";
const SESSION_TTL_SEC = normalizeSessionTtlSec(
  process.env.SESSION_TTL_SEC,
  60 * 60 * 24 * 30
);
const SESSION_SECRET = crypto
  .createHash("sha256")
  .update(`phone-codex-session:${AUTH_TOKEN}`)
  .digest();

const CODEX_APP_SERVER_BIN =
  process.env.CODEX_APP_SERVER_BIN ||
  "/Applications/Codex.app/Contents/Resources/codex";
const CODEX_APP_SERVER_WS_URL = String(
  process.env.CODEX_APP_SERVER_WS_URL || ""
).trim();
const CODEX_APP_SERVER_WS_SPAWN = normalizeBooleanFlag(
  process.env.CODEX_APP_SERVER_WS_SPAWN,
  true
);
const MEDIA_ROOT =
  process.env.MEDIA_ROOT || path.join(WORKSPACE_ROOT, "data", "media");
const MEDIA_INDEX =
  process.env.MEDIA_INDEX || path.join(WORKSPACE_ROOT, "data", "media", "index.json");
const THREAD_LIST_POLL_MS = Number(process.env.THREAD_LIST_POLL_MS || 8000);
const THREAD_READ_POLL_ACTIVE_MS = Number(
  process.env.THREAD_READ_POLL_ACTIVE_MS || 2000
);
const THREAD_READ_POLL_IDLE_MS = Number(
  process.env.THREAD_READ_POLL_IDLE_MS || 10000
);
const MAX_IMAGE_MB = Number(process.env.MAX_IMAGE_MB || 12);
const DEFAULT_APPROVAL_POLICY = normalizeApprovalPolicy(
  process.env.DEFAULT_APPROVAL_POLICY || "never"
);
const DEFAULT_SANDBOX_POLICY = normalizeSandboxPolicy(
  process.env.DEFAULT_SANDBOX_POLICY || "danger-full-access"
);
const AUTO_APPROVAL_MODE = normalizeAutoApprovalMode(
  process.env.AUTO_APPROVAL_MODE || "acceptForSession"
);

const DESKTOP_NUDGE_MODE = normalizeDesktopNudgeMode(
  process.env.DESKTOP_NUDGE_MODE || "frontmost"
);
const DESKTOP_NUDGE_THROTTLE_MS = normalizeDesktopNudgeThrottleMs(
  process.env.DESKTOP_NUDGE_THROTTLE_MS,
  2000
);
const DESKTOP_NUDGE_HELPER_APP = String(
  process.env.DESKTOP_NUDGE_HELPER_APP || ""
).trim();
const REMOTE_MODE = String(process.env.REMOTE_MODE || "off")
  .trim()
  .toLowerCase();
const DEFAULT_ALLOWED_CLIENT_CIDRS = [
  "127.0.0.1/8",
  "::1/128",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "100.64.0.0/10",
  "fc00::/7",
];
const ALLOWED_CLIENT_CIDRS = parseAllowedClientCidrs(
  process.env.ALLOWED_CLIENT_CIDRS,
  DEFAULT_ALLOWED_CLIENT_CIDRS
);
const ALLOWED_CLIENT_BLOCKLIST = buildAllowBlockList(ALLOWED_CLIENT_CIDRS);
const REMOTE_URLS = parseRemoteUrls(process.env.REMOTE_URLS_JSON);
const REMOTE_TAILSCALE = parseRemoteTailscale(process.env.REMOTE_TAILSCALE_JSON);

const AUTH_TOKEN_HASH = crypto
  .createHash("sha256")
  .update(AUTH_TOKEN)
  .digest("hex");

let rpc = null;
let sseHub = null;
let mediaService = null;
let threadSync = null;
let desktopNudge = null;
let webTurnsCleanupTimer = null;
let httpRedirectServer = null;

const threadUsageById = new Map();
const threadUsageFileCache = new Map();
const webTurns = new Map();
const THREAD_USAGE_FILE_CACHE_MAX = 256;
const THREAD_USAGE_TAIL_WINDOWS = [
  256 * 1024,
  1024 * 1024,
  4 * 1024 * 1024,
  16 * 1024 * 1024,
];
const CODEX_STATE_ROOT = path.resolve(
  process.env.CODEX_HOME || path.join(os.homedir(), ".codex")
);
const CODEX_STATE_DB_FILE = path.join(CODEX_STATE_ROOT, "state_5.sqlite");
const THREAD_TITLE_CACHE_TTL_MS = parseInteger(
  process.env.THREAD_TITLE_CACHE_TTL_MS,
  3000,
  500,
  60000
);
const THREAD_TITLE_QUERY_TIMEOUT_MS = parseInteger(
  process.env.THREAD_TITLE_QUERY_TIMEOUT_MS,
  2500,
  500,
  15000
);
const THREAD_TITLE_QUERY_MAX_BUFFER = 1024 * 1024 * 4;

const threadTitleById = new Map();
let threadTitleCacheExpiresAt = 0;
let threadTitleCacheDbMtimeMs = 0;

function parseAllowedClientCidrs(value, fallback) {
  const source = String(value || "").trim();
  const rawItems = source
    ? source
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [...fallback];
  const out = [];
  for (const item of rawItems) {
    if (!out.includes(item)) out.push(item);
  }
  return out.length > 0 ? out : [...fallback];
}

function normalizeSessionTtlSec(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(60, Math.min(60 * 60 * 24 * 365, Math.floor(n)));
}

function normalizeIpAddress(input) {
  let text = String(input || "").trim();
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

function buildAllowBlockList(cidrs) {
  const blockList = new net.BlockList();
  let added = 0;

  const appendCidrs = (items) => {
    for (const raw of items) {
      const item = String(raw || "").trim();
      if (!item) continue;
      const [addrRaw, prefixRaw] = item.split("/");
      const address = normalizeIpAddress(addrRaw);
      const family = net.isIP(address);
      if (!family) {
        console.warn(`[phone-codex-bridge] skip invalid CIDR address: ${item}`);
        continue;
      }
      const defaultPrefix = family === 4 ? 32 : 128;
      const prefix = prefixRaw !== undefined ? Number(prefixRaw) : defaultPrefix;
      if (!Number.isInteger(prefix)) {
        console.warn(`[phone-codex-bridge] skip invalid CIDR prefix: ${item}`);
        continue;
      }
      if (
        (family === 4 && (prefix < 0 || prefix > 32)) ||
        (family === 6 && (prefix < 0 || prefix > 128))
      ) {
        console.warn(`[phone-codex-bridge] skip out-of-range CIDR prefix: ${item}`);
        continue;
      }
      try {
        blockList.addSubnet(address, prefix, family === 4 ? "ipv4" : "ipv6");
        added += 1;
      } catch (error) {
        console.warn(
          `[phone-codex-bridge] failed to add CIDR "${item}": ${
            error && error.message ? error.message : String(error)
          }`
        );
      }
    }
  };

  appendCidrs(cidrs);
  if (added === 0) {
    console.warn("[phone-codex-bridge] no valid CIDRs configured, falling back to defaults");
    appendCidrs(DEFAULT_ALLOWED_CLIENT_CIDRS);
  }
  return blockList;
}

function parseRemoteUrls(value) {
  const raw = String(value || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function parseRemoteTailscale(value) {
  const base = {
    installed: false,
    connected: false,
    ipv4: null,
    magicDns: null,
  };
  const raw = String(value || "").trim();
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return base;
    return {
      installed: Boolean(parsed.installed),
      connected: Boolean(parsed.connected),
      ipv4: parsed.ipv4 ? String(parsed.ipv4) : null,
      magicDns: parsed.magicDns ? String(parsed.magicDns) : null,
    };
  } catch {
    return base;
  }
}

function isClientIpAllowed(remoteAddress) {
  const ip = normalizeIpAddress(remoteAddress);
  if (!ip) return false;
  const family = net.isIP(ip);
  if (!family) return false;
  return ALLOWED_CLIENT_BLOCKLIST.check(ip, family === 4 ? "ipv4" : "ipv6");
}

function isMethodWithBody(method) {
  const m = String(method || "GET").toUpperCase();
  return m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE";
}

async function readRawBody(req, maxBytes) {
  if (Object.prototype.hasOwnProperty.call(req, "__rawBody")) {
    return String(req.__rawBody || "");
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      throw new Error(`Body too large. Max ${maxBytes} bytes.`);
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  req.__rawBody = raw;
  return raw;
}

function parseCookieHeader(headerValue) {
  const text = String(headerValue || "");
  if (!text) return {};
  const out = {};
  for (const part of text.split(";")) {
    const [rawName, ...rest] = part.split("=");
    const name = String(rawName || "").trim();
    if (!name) continue;
    out[name] = String(rest.join("=") || "").trim();
  }
  return out;
}

function safeTimingEqualText(a, b) {
  const aBuf = Buffer.from(String(a || ""));
  const bBuf = Buffer.from(String(b || ""));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function buildSessionSignature(payload) {
  return crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(String(payload || ""))
    .digest("base64url");
}

function buildSessionCookieValue(now = Date.now()) {
  const expMs = now + SESSION_TTL_SEC * 1000;
  const nonce = crypto.randomBytes(16).toString("base64url");
  const payload = `${expMs}.${nonce}`;
  const sig = buildSessionSignature(payload);
  return `${payload}.${sig}`;
}

function isSessionCookieValid(value) {
  if (!value) return false;
  const [expRaw, nonce, sig] = String(value || "").split(".");
  if (!expRaw || !nonce || !sig) return false;
  const expMs = Number(expRaw);
  if (!Number.isFinite(expMs) || expMs <= Date.now()) return false;
  const payload = `${expRaw}.${nonce}`;
  const expectedSig = buildSessionSignature(payload);
  return safeTimingEqualText(sig, expectedSig);
}

function isSessionAuthorized(req) {
  if (!REQUIRE_LOGIN) return true;
  const cookies = parseCookieHeader(req && req.headers ? req.headers.cookie : "");
  const sessionCookie = cookies[SESSION_COOKIE_NAME];
  return isSessionCookieValid(sessionCookie);
}

function buildSessionSetCookie(value) {
  return [
    `${SESSION_COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SEC}`,
  ].join("; ");
}

function buildSessionClearCookie() {
  return [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ].join("; ");
}

function authorizeV2Request(req) {
  if (isSessionAuthorized(req)) {
    return { ok: true, kind: REQUIRE_LOGIN ? "session" : "open" };
  }
  return { ok: false, status: 401, error: "Unauthorized" };
}

function loadHttpsServerOptions() {
  if (!HTTPS_ENABLED) return null;
  if (!HTTPS_CERT_FILE || !HTTPS_KEY_FILE) {
    throw new Error("HTTPS_ENABLED=1 requires HTTPS_CERT_FILE and HTTPS_KEY_FILE");
  }

  const certPath = path.resolve(HTTPS_CERT_FILE);
  const keyPath = path.resolve(HTTPS_KEY_FILE);
  if (!fs.existsSync(certPath)) {
    throw new Error(`HTTPS cert file not found: ${certPath}`);
  }
  if (!fs.existsSync(keyPath)) {
    throw new Error(`HTTPS key file not found: ${keyPath}`);
  }

  const options = {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  };
  if (HTTPS_CA_FILE) {
    const caPath = path.resolve(HTTPS_CA_FILE);
    if (!fs.existsSync(caPath)) {
      throw new Error(`HTTPS CA file not found: ${caPath}`);
    }
    options.ca = fs.readFileSync(caPath);
  }
  if (HTTPS_PASSPHRASE) {
    options.passphrase = HTTPS_PASSPHRASE;
  }
  return options;
}

function fallbackRedirectHost() {
  if (BIND_HOST === "0.0.0.0" || BIND_HOST === "::") return "localhost";
  if (BIND_HOST.includes(":") && !BIND_HOST.startsWith("[")) return `[${BIND_HOST}]`;
  return BIND_HOST;
}

function normalizeRedirectAuthority(req) {
  const rawHost = String((req && req.headers && req.headers.host) || "").trim();
  if (!rawHost) {
    return `${fallbackRedirectHost()}:${PORT}`;
  }
  const safe = rawHost.replace(/[^\w.\-:[\]]/g, "");
  if (!safe) {
    return `${fallbackRedirectHost()}:${PORT}`;
  }
  if (safe.startsWith("[")) {
    const withoutPort = safe.replace(/\]:\d+$/, "]");
    return `${withoutPort}:${PORT}`;
  }
  const withoutPort = safe.replace(/:\d+$/, "");
  return `${withoutPort}:${PORT}`;
}

function buildHttpsRedirectLocation(req) {
  const authority = normalizeRedirectAuthority(req);
  const reqPath = String((req && req.url) || "/");
  return `https://${authority}${reqPath.startsWith("/") ? reqPath : `/${reqPath}`}`;
}

async function handleBridgeRequest(req, res) {
  if (HTTPS_ENABLED) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const remoteAddress = req && req.socket ? req.socket.remoteAddress : "";
  if (!isClientIpAllowed(remoteAddress)) {
    sendJson(res, 403, {
      ok: false,
      error: "Forbidden client IP",
    });
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "local"}`);
  const pathname = decodeURIComponent(url.pathname || "/");

  try {
    if (req.method === "GET" && pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        now: new Date().toISOString(),
        service: "phone-codex-bridge",
        transport: {
          scheme: SERVER_SCHEME,
          httpsEnabled: HTTPS_ENABLED,
          redirectPort:
            Number.isInteger(HTTPS_REDIRECT_PORT) && HTTPS_REDIRECT_PORT > 0
              ? HTTPS_REDIRECT_PORT
              : null,
        },
        rpc: rpc.status(),
        sseClients: sseHub.count(),
        mediaRoot: MEDIA_ROOT,
        desktopNudge: desktopNudge.status(),
        remote: {
          mode: REMOTE_MODE === "tailscale" ? "tailscale" : "off",
          tailscale: REMOTE_TAILSCALE,
          urls: REMOTE_URLS,
          accessPolicy: {
            allowedCidrs: ALLOWED_CLIENT_CIDRS,
          },
        },
        auth: {
          mode: REQUIRE_LOGIN ? "password" : "open",
          requireLogin: REQUIRE_LOGIN,
          sessionTtlSec: REQUIRE_LOGIN ? SESSION_TTL_SEC : null,
        },
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/auth/status") {
      sendJson(res, 200, {
        ok: true,
        mode: REQUIRE_LOGIN ? "password" : "open",
        authenticated: isSessionAuthorized(req),
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/auth/login") {
      if (!REQUIRE_LOGIN) {
        sendJson(res, 200, {
          ok: true,
          mode: "open",
          authenticated: true,
        });
        return;
      }
      if (!SIMPLE_LOGIN_PASSWORD) {
        sendJson(res, 503, { ok: false, error: "Login password not configured" });
        return;
      }
      const body = await readJsonBody(req, MAX_BODY_BYTES);
      const password = String(body.password || "");
      if (!safeTimingEqualText(password, SIMPLE_LOGIN_PASSWORD)) {
        sendJson(res, 401, { ok: false, error: "Invalid password" });
        return;
      }
      const cookieValue = buildSessionCookieValue();
      sendJson(
        res,
        200,
        {
          ok: true,
          mode: "password",
          authenticated: true,
        },
        { "Set-Cookie": buildSessionSetCookie(cookieValue) }
      );
      return;
    }

    if (req.method === "POST" && pathname === "/api/auth/logout") {
      sendJson(
        res,
        200,
        {
          ok: true,
          mode: REQUIRE_LOGIN ? "password" : "open",
          authenticated: false,
        },
        { "Set-Cookie": buildSessionClearCookie() }
      );
      return;
    }

    if (
      pathname === "/api/command" ||
      pathname === "/api/history" ||
      pathname.startsWith("/api/command/") ||
      pathname.startsWith("/api/history/")
    ) {
      sendJson(res, 410, {
        ok: false,
        error: "Legacy API removed. Please migrate to /api/v2/* endpoints.",
      });
      return;
    }

    if (pathname.startsWith("/api/v2/")) {
      const authResult = authorizeV2Request(req);
      if (!authResult.ok) {
        sendJson(res, authResult.status || 401, {
          ok: false,
          error: authResult.error || "Unauthorized",
        });
        return;
      }
      await handleV2Api(req, res, url, pathname);
      return;
    }

    if (pathname.startsWith("/api/v3/")) {
      sendJson(res, 410, {
        ok: false,
        error: "Pairing API removed. Use /api/auth/* and /api/v2/* endpoints.",
      });
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      await serveStatic(pathname, req.method, res);
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(res, 500, { ok: false, error: message });
  }
}

const server = HTTPS_ENABLED
  ? https.createServer(loadHttpsServerOptions(), handleBridgeRequest)
  : http.createServer(handleBridgeRequest);

server.on("error", (error) => {
  console.error(`[phone-codex-bridge] ${SERVER_SCHEME} server error:`, error);
  process.exit(1);
});

function startHttpRedirectServerIfNeeded() {
  if (!HTTPS_ENABLED) return;
  if (!Number.isInteger(HTTPS_REDIRECT_PORT) || HTTPS_REDIRECT_PORT <= 0) return;
  if (HTTPS_REDIRECT_PORT === PORT) {
    console.warn(
      "[phone-codex-bridge] HTTPS_REDIRECT_PORT equals PORT; skip http->https redirect listener."
    );
    return;
  }
  if (httpRedirectServer) return;

  httpRedirectServer = http.createServer((req, res) => {
    const location = buildHttpsRedirectLocation(req);
    res.writeHead(308, {
      Location: location,
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "close",
    });
    res.end(`Redirecting to ${location}\n`);
  });

  httpRedirectServer.on("error", (error) => {
    console.error("[phone-codex-bridge] http redirect server error:", error);
  });

  httpRedirectServer.listen(HTTPS_REDIRECT_PORT, BIND_HOST, () => {
    console.log(
      `[phone-codex-bridge] http->https redirect on http://${BIND_HOST}:${HTTPS_REDIRECT_PORT} -> https://${BIND_HOST}:${PORT}`
    );
  });
}

async function handleV2Api(req, res, url, pathname) {
  if (req.method === "GET" && pathname === "/api/v2/events") {
    const threadId = (url.searchParams.get("threadId") || "").trim() || null;
    const clientId = sseHub.addClient(req, res, {
      threadId,
      authTokenHash: AUTH_TOKEN_HASH,
    });
    if (threadId) {
      threadSync.watchThread(threadId, clientId);
    }
    req.on("close", () => {
      threadSync.removeWatcherEverywhere(clientId);
    });
    sseHub.sendTo(clientId, "sync", {
      now: new Date().toISOString(),
      rpc: rpc.status(),
      threadId,
    });
    sseHub.sendTo(clientId, "approvals", {
      items: rpc.getPendingServerRequests(),
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/v2/approvals") {
    sendJson(res, 200, {
      ok: true,
      items: rpc.getPendingServerRequests(),
    });
    return;
  }

  const mApproval = pathname.match(/^\/api\/v2\/approvals\/([^/]+)$/);
  if (req.method === "POST" && mApproval) {
    const requestId = decodeURIComponent(mApproval[1]);
    const body = await readJsonBody(req, MAX_BODY_BYTES);
    const pending = rpc
      .getPendingServerRequests()
      .find((item) => String(item.id) === String(requestId));
    if (!pending) {
      sendJson(res, 404, { ok: false, error: "Pending approval not found" });
      return;
    }
    const responsePayload = buildApprovalResponsePayload(pending, body);
    rpc.respondToServerRequest(requestId, responsePayload);
    sseHub.broadcast("approval-resolved", {
      id: requestId,
      method: pending.method,
      resolvedAt: new Date().toISOString(),
      response: responsePayload,
    });
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && pathname === "/api/v2/threads") {
    const cursor = url.searchParams.get("cursor");
    const limit = parseInteger(url.searchParams.get("limit"), 50, 1, 200);
    const archived = parseOptionalBoolean(url.searchParams.get("archived"));
    const sourceKinds = parseCsvList(url.searchParams.get("sourceKinds"));
    const query = (url.searchParams.get("query") || "").trim();
    const modelProviders = parseCsvList(url.searchParams.get("modelProviders"));

    const result = await threadSync.listThreads({
      cursor,
      limit,
      archived,
      sourceKinds: sourceKinds.length > 0 ? sourceKinds : ALL_SOURCE_KINDS,
      modelProviders,
      query,
      sortKey: "updated_at",
    });
    const dataWithTitle = await decorateThreadListWithTitles(
      Array.isArray(result.data) ? result.data : []
    );
    sendJson(res, 200, {
      ok: true,
      ...result,
      data: dataWithTitle,
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/v2/models") {
    const limit = parseInteger(url.searchParams.get("limit"), 50, 1, 200);
    const cursor = url.searchParams.get("cursor");
    const result = await rpc.request("model/list", { limit, cursor });
    sendJson(res, 200, {
      ok: true,
      ...result,
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/v2/account") {
    const result = await rpc.request("account/read", { refreshToken: false });
    sendJson(res, 200, {
      ok: true,
      ...result,
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/v2/rate-limits") {
    const result = await rpc.request("account/rateLimits/read", {});
    const normalized = normalizeRateLimitsResponse(result || {});
    sendJson(res, 200, {
      ok: true,
      ...normalized,
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/v2/threads") {
    const rawBody = await readJsonBody(req, MAX_BODY_BYTES);
    const body = withDefaultApprovalPolicy(rawBody || {});
    const result = await threadSync.startThread(body);
    sseHub.broadcast("thread-created", {
      now: new Date().toISOString(),
      thread: result.thread || null,
    });
    sendJson(res, 200, {
      ok: true,
      ...result,
    });
    return;
  }

  const mThreadTurns = pathname.match(/^\/api\/v2\/threads\/([^/]+)\/turns$/);
  if (req.method === "POST" && mThreadTurns) {
    const threadId = decodeURIComponent(mThreadTurns[1]);
    const rawBody = await readJsonBody(req, MAX_BODY_BYTES);
    const body = withDefaultApprovalPolicy(rawBody || {});
    const built = buildTurnInput(body, mediaService);
    if (!built.input || built.input.length === 0) {
      sendJson(res, 400, { ok: false, error: "No input to send" });
      return;
    }
    const result = await threadSync.startTurn(threadId, built.input, body);
    const turnId =
      result && result.turn && result.turn.id ? String(result.turn.id) : "";
    if (turnId && rpc.status().transport === "stdio") {
      webTurns.set(webTurnKey(threadId, turnId), { createdAt: Date.now() });
      desktopNudge.request({ reason: "turn-start", threadId, turnId });
    }
    for (const mediaId of built.linkMediaIds) {
      await mediaService.linkMedia(mediaId, {
        threadId,
        turnId: result && result.turn ? result.turn.id : null,
      });
    }
    threadSync.triggerImmediateThreadRead(threadId);
    sendJson(res, 200, {
      ok: true,
      ...result,
      input: built.input,
    });
    return;
  }

  const mThreadInterrupt = pathname.match(
    /^\/api\/v2\/threads\/([^/]+)\/interrupt$/
  );
  if (req.method === "POST" && mThreadInterrupt) {
    const threadId = decodeURIComponent(mThreadInterrupt[1]);
    const body = await readJsonBody(req, MAX_BODY_BYTES);
    let turnId = body.turnId ? String(body.turnId) : "";
    if (!turnId) {
      const thread = await threadSync.readThread(threadId, true);
      const turns = Array.isArray(thread.turns) ? thread.turns : [];
      const inProgress = [...turns]
        .reverse()
        .find((turn) => turn && turn.status === "inProgress");
      if (!inProgress) {
        sendJson(res, 400, {
          ok: false,
          error: "No in-progress turn found",
        });
        return;
      }
      turnId = inProgress.id;
    }
    await threadSync.interruptTurn(threadId, turnId);
    sendJson(res, 200, { ok: true, threadId, turnId });
    return;
  }

  const mThreadName = pathname.match(/^\/api\/v2\/threads\/([^/]+)\/name$/);
  if (req.method === "POST" && mThreadName) {
    const threadId = decodeURIComponent(mThreadName[1]);
    const body = await readJsonBody(req, MAX_BODY_BYTES);
    const name = (body.name || "").trim();
    if (!name) {
      sendJson(res, 400, { ok: false, error: "name is required" });
      return;
    }
    await threadSync.setThreadName(threadId, name);
    sendJson(res, 200, { ok: true, threadId, name });
    return;
  }

  const mThreadArchive = pathname.match(/^\/api\/v2\/threads\/([^/]+)\/archive$/);
  if (req.method === "POST" && mThreadArchive) {
    const threadId = decodeURIComponent(mThreadArchive[1]);
    await threadSync.archiveThread(threadId);
    sendJson(res, 200, { ok: true, threadId });
    return;
  }

  const mThreadUnarchive = pathname.match(
    /^\/api\/v2\/threads\/([^/]+)\/unarchive$/
  );
  if (req.method === "POST" && mThreadUnarchive) {
    const threadId = decodeURIComponent(mThreadUnarchive[1]);
    const result = await threadSync.unarchiveThread(threadId);
    sendJson(res, 200, { ok: true, thread: result.thread || null });
    return;
  }

  const mThreadFork = pathname.match(/^\/api\/v2\/threads\/([^/]+)\/fork$/);
  if (req.method === "POST" && mThreadFork) {
    const threadId = decodeURIComponent(mThreadFork[1]);
    const body = await readJsonBody(req, MAX_BODY_BYTES);
    const result = await threadSync.forkThread(threadId, body || {});
    sendJson(res, 200, { ok: true, ...result });
    return;
  }

  const mThreadRead = pathname.match(/^\/api\/v2\/threads\/([^/]+)$/);
  if (req.method === "GET" && mThreadRead) {
    const threadId = decodeURIComponent(mThreadRead[1]);
    const includeTurns = parseOptionalBoolean(url.searchParams.get("includeTurns"));
    const include = includeTurns === null ? true : includeTurns;
    const thread = await threadSync.readThread(threadId, include);
    const decorated = await decorateThreadWithTitle(
      decorateThreadMedia(thread, mediaService)
    );
    const usage = await resolveThreadUsageForThread(String(threadId), thread);
    sendJson(res, 200, {
      ok: true,
      thread: decorated,
      usage,
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/v2/media/image") {
    const body = await readJsonBody(req, MAX_BODY_BYTES * 2);
    const result = await mediaService.saveImage(body || {});
    sendJson(res, 200, {
      ok: true,
      mediaId: result.mediaId,
      localPath: result.localPath,
      mimeType: result.mimeType,
      size: result.size,
      url: result.url,
    });
    return;
  }

  const mMedia = pathname.match(/^\/api\/v2\/media\/([^/]+)$/);
  if (req.method === "GET" && mMedia) {
    const mediaId = decodeURIComponent(mMedia[1]);
    const media = mediaService.getById(mediaId);
    if (!media) {
      sendJson(res, 404, { ok: false, error: "Media not found" });
      return;
    }
    const absPath = path.resolve(media.absolutePath);
    if (!absPath.startsWith(path.resolve(MEDIA_ROOT) + path.sep)) {
      sendJson(res, 403, { ok: false, error: "Forbidden" });
      return;
    }
    if (!fs.existsSync(absPath)) {
      sendJson(res, 404, { ok: false, error: "Media file missing" });
      return;
    }
    const stat = await fsp.stat(absPath);
    res.writeHead(200, {
      "Content-Type": media.mimeType || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": "private, max-age=120",
    });
    fs.createReadStream(absPath).pipe(res);
    return;
  }

  sendJson(res, 404, { ok: false, error: "Unknown /api/v2 endpoint" });
}

function normalizeAutoApprovalMode(value) {
  const mode = String(value || "").trim();
  const lower = mode.toLowerCase();
  if (lower === "accept") return "accept";
  if (lower === "acceptforsession") return "acceptForSession";
  return "manual";
}

function normalizeApprovalPolicy(value) {
  const policy = String(value || "").trim();
  if (!policy) return null;
  const lower = policy.toLowerCase();
  if (lower === "none" || lower === "manual" || lower === "inherit" || lower === "default") {
    return null;
  }
  return policy;
}

function normalizeSandboxPolicy(value) {
  const policy = String(value || "").trim();
  if (!policy) return null;
  const lower = policy.toLowerCase();
  if (lower === "none" || lower === "manual" || lower === "inherit" || lower === "default") {
    return null;
  }
  if (
    lower === "danger-full-access" ||
    lower === "dangerfullaccess" ||
    lower === "danger_full_access"
  ) {
    return "danger-full-access";
  }
  if (lower === "read-only" || lower === "readonly" || lower === "read_only") {
    return "read-only";
  }
  if (
    lower === "workspace-write" ||
    lower === "workspacewrite" ||
    lower === "workspace_write"
  ) {
    return "workspace-write";
  }
  return policy;
}

function normalizeDesktopNudgeThrottleMs(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function withDefaultApprovalPolicy(input) {
  const body = input && typeof input === "object" ? { ...input } : {};
  if (!body.approvalPolicy && DEFAULT_APPROVAL_POLICY) {
    body.approvalPolicy = DEFAULT_APPROVAL_POLICY;
  }
  if (body.sandbox) {
    const convertedSandbox = toThreadSandboxValue(body.sandbox);
    if (convertedSandbox) {
      body.sandbox = convertedSandbox;
    }
  }
  if (body.sandboxPolicy) {
    const convertedSandboxPolicy = toTurnSandboxPolicyValue(body.sandboxPolicy);
    if (convertedSandboxPolicy) {
      body.sandboxPolicy = convertedSandboxPolicy;
    }
  }
  if (!body.sandbox && DEFAULT_SANDBOX_POLICY) {
    const defaultSandbox = toThreadSandboxValue(DEFAULT_SANDBOX_POLICY);
    if (defaultSandbox) {
      body.sandbox = defaultSandbox;
    }
  }
  if (!body.sandboxPolicy && DEFAULT_SANDBOX_POLICY) {
    const defaultSandboxPolicy = toTurnSandboxPolicyValue(DEFAULT_SANDBOX_POLICY);
    if (defaultSandboxPolicy) {
      body.sandboxPolicy = defaultSandboxPolicy;
    }
  }
  return body;
}

function toThreadSandboxValue(policy) {
  if (!policy) return null;
  if (typeof policy === "object") {
    if (
      Object.prototype.hasOwnProperty.call(policy, "danger-full-access") ||
      Object.prototype.hasOwnProperty.call(policy, "read-only") ||
      Object.prototype.hasOwnProperty.call(policy, "workspace-write")
    ) {
      return policy;
    }
    if (typeof policy.type === "string") {
      if (policy.type === "dangerFullAccess") {
        return "danger-full-access";
      }
      if (policy.type === "readOnly") {
        return "read-only";
      }
    }
    return null;
  }
  const normalized = normalizeSandboxPolicy(policy);
  if (normalized === "danger-full-access" || normalized === "read-only") {
    return normalized;
  }
  return null;
}

function toTurnSandboxPolicyValue(policy) {
  if (!policy) return null;
  if (typeof policy === "object") {
    if (
      typeof policy.type === "string" &&
      (policy.type === "dangerFullAccess" || policy.type === "readOnly")
    ) {
      return policy;
    }
    if (Object.prototype.hasOwnProperty.call(policy, "danger-full-access")) {
      return { type: "dangerFullAccess" };
    }
    if (Object.prototype.hasOwnProperty.call(policy, "read-only")) {
      return { type: "readOnly" };
    }
    return null;
  }
  const normalized = normalizeSandboxPolicy(policy);
  if (normalized === "danger-full-access") {
    return { type: "dangerFullAccess" };
  }
  if (normalized === "read-only") {
    return { type: "readOnly" };
  }
  return null;
}

function autoApprovalDecisionForRequest(request) {
  if (AUTO_APPROVAL_MODE !== "accept" && AUTO_APPROVAL_MODE !== "acceptForSession") {
    return null;
  }
  if (!request || typeof request !== "object") return null;
  if (
    request.method !== "item/commandExecution/requestApproval" &&
    request.method !== "item/fileChange/requestApproval"
  ) {
    return null;
  }
  return AUTO_APPROVAL_MODE;
}

function maybeAutoResolveApprovalRequest(request) {
  const decision = autoApprovalDecisionForRequest(request);
  if (!decision) return false;
  try {
    const responsePayload = buildApprovalResponsePayload(request, { decision });
    rpc.respondToServerRequest(request.id, responsePayload);
    sseHub.broadcast("approval-resolved", {
      id: request.id,
      method: request.method,
      resolvedAt: new Date().toISOString(),
      response: responsePayload,
      auto: true,
      mode: AUTO_APPROVAL_MODE,
    });
    return true;
  } catch (error) {
    sseHub.broadcast("warning", {
      source: "auto-approval",
      message: String(error && error.message ? error.message : error),
      requestId: request.id,
      now: new Date().toISOString(),
    });
    return false;
  }
}

function autoResolvePendingApprovals() {
  const pending = rpc.getPendingServerRequests();
  for (const request of pending) {
    maybeAutoResolveApprovalRequest(request);
  }
}

function decorateThreadMedia(thread, mediaSvc) {
  if (!thread || typeof thread !== "object") return thread;
  const clone = JSON.parse(JSON.stringify(thread));
  if (!Array.isArray(clone.turns)) return clone;
  for (const turn of clone.turns) {
    if (!turn || !Array.isArray(turn.items)) continue;
    for (const item of turn.items) {
      if (!item || typeof item !== "object") continue;
      if (item.type === "userMessage" && Array.isArray(item.content)) {
        for (const content of item.content) {
          if (!content || typeof content !== "object") continue;
          if (content.type === "localImage" && content.path) {
            const media = mediaSvc.getByAbsolutePath(content.path);
            if (media) {
              content.mediaId = media.id;
              content.mediaUrl = mediaSvc.getPublicUrl(media.id);
            }
          }
        }
      }
      if (item.type === "imageView" && item.path) {
        const media = mediaSvc.getByAbsolutePath(item.path);
        if (media) {
          item.mediaId = media.id;
          item.mediaUrl = mediaSvc.getPublicUrl(media.id);
        }
      }
    }
  }
  return clone;
}

function parseInteger(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function parseOptionalBoolean(value) {
  if (value === null || value === undefined || value === "") return null;
  if (String(value).toLowerCase() === "true") return true;
  if (String(value).toLowerCase() === "false") return false;
  return null;
}

function parseCsvList(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function setCorsHeaders(res) {
  if (!CORS_ORIGIN) return;
  res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-Auth-Token"
  );
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function sendJson(res, statusCode, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}

async function readJsonBody(req, maxBytes) {
  const raw = await readRawBody(req, maxBytes);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (_error) {
    throw new Error("Invalid JSON body");
  }
}

async function serveStatic(pathname, method, res) {
  const targetPath = pathname === "/" ? "index.html" : pathname;
  const cleaned = path
    .normalize(targetPath)
    .replace(/^[/\\]+/, "")
    .replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, cleaned);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== PUBLIC_DIR) {
    sendJson(res, 403, { ok: false, error: "Forbidden" });
    return;
  }
  if (!fs.existsSync(filePath)) {
    sendJson(res, 404, { ok: false, error: "Not found" });
    return;
  }
  const stat = await fsp.stat(filePath);
  const type = contentType(filePath);
  const cacheControl =
    type.startsWith("text/html") ||
    type.startsWith("application/javascript") ||
    type.startsWith("text/css")
      ? "no-store"
      : "private, max-age=120";
  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": stat.size,
    "Cache-Control": cacheControl,
  });
  if (method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".webp")) return "image/webp";
  if (filePath.endsWith(".ico")) return "image/x-icon";
  if (filePath.endsWith(".webmanifest")) return "application/manifest+json";
  return "application/octet-stream";
}

function bindEvents() {
  rpc.on("connected", (info) => {
    sseHub.broadcast("sync", {
      status: "connected",
      info,
      now: new Date().toISOString(),
    });
  });
  rpc.on("ready", (info) => {
    sseHub.broadcast("sync", {
      status: "ready",
      info,
      now: new Date().toISOString(),
    });
    autoResolvePendingApprovals();
  });
  rpc.on("reconnecting", (info) => {
    sseHub.broadcast("sync", {
      status: "reconnecting",
      info,
      now: new Date().toISOString(),
    });
  });
  rpc.on("disconnected", (info) => {
    sseHub.broadcast("sync", {
      status: "disconnected",
      info,
      now: new Date().toISOString(),
    });
  });
  rpc.on("error", (error) => {
    sseHub.broadcast("error", {
      source: "rpc",
      message: String(error && error.message ? error.message : error),
      now: new Date().toISOString(),
    });
  });
  rpc.on("protocol-warning", (warning) => {
    sseHub.broadcast("warning", {
      source: "rpc",
      ...warning,
      now: new Date().toISOString(),
    });
  });
  rpc.on("stderr", (payload) => {
    // Keep stderr messages visible for debugging but non-fatal.
    console.warn(`[codex-app-server] ${payload.line}`);
  });
  rpc.on("notification", (notification) => {
    const normalized = normalizeRpcNotification(notification);
    maybeTrackThreadUsage(normalized);
    threadSync.handleRpcNotification(normalized);
    maybeNudgeDesktopForNotification(normalized);
    const webNotification = compactNotificationForWeb(normalized);
    sseHub.broadcast("rpc-notification", {
      ...webNotification,
      now: new Date().toISOString(),
    });
  });
  rpc.on("server-request", (request) => {
    if (maybeAutoResolveApprovalRequest(request)) {
      return;
    }
    sseHub.broadcast("approval-required", request);
  });

  threadSync.on("thread-list-updated", (payload) => {
    sseHub.broadcast("thread-list-updated", {
      reason: payload && payload.reason ? String(payload.reason) : "poll",
      updatedAt:
        payload && payload.updatedAt ? String(payload.updatedAt) : new Date().toISOString(),
      count: Array.isArray(payload && payload.data) ? payload.data.length : 0,
      hasNextCursor: Boolean(payload && payload.nextCursor),
    });
  });
  threadSync.on("thread-updated", (payload) => {
    const thread = payload && payload.thread ? payload.thread : null;
    const turns = thread && Array.isArray(thread.turns) ? thread.turns : [];
    sseHub.broadcastThread(payload.threadId, "thread-updated", {
      threadId: payload && payload.threadId ? String(payload.threadId) : "",
      source: payload && payload.source ? String(payload.source) : "poll",
      updatedAt:
        thread && thread.updatedAt ? Number(thread.updatedAt) : Date.now() / 1000,
      turnCount: turns.length,
    });
  });
  threadSync.on("error", (error) => {
    sseHub.broadcast("error", {
      source: "thread-sync",
      message: String(error && error.message ? error.message : error),
      now: new Date().toISOString(),
    });
  });
}

function setupApprovalReminderLoop() {
  setInterval(() => {
    const pending = rpc.getPendingServerRequests();
    const now = Date.now();
    for (const item of pending) {
      if (autoApprovalDecisionForRequest(item)) {
        continue;
      }
      const ageMs = now - new Date(item.receivedAt).getTime();
      if (ageMs >= 10 * 60 * 1000) {
        sseHub.broadcast("approval-pending-reminder", {
          ...item,
          ageMs,
        });
      }
    }
  }, 60000);
}

function normalizeRpcNotification(notification) {
  if (!notification || typeof notification !== "object") {
    return { method: "unknown", params: {} };
  }
  const method = String(notification.method || "");
  const params = notification.params || {};

  if (!method.startsWith("codex/event/")) {
    return {
      method,
      params,
    };
  }

  const msg = params.msg || {};
  const type = String(msg.type || method.slice("codex/event/".length));
  const threadId =
    msg.thread_id ||
    msg.threadId ||
    params.conversationId ||
    params.threadId ||
    null;
  const turnId = msg.turn_id || msg.turnId || null;
  const itemId = msg.item_id || (msg.item && msg.item.id) || null;

  const map = {
    thread_started: "thread/started",
    thread_name_updated: "thread/name/updated",
    turn_started: "turn/started",
    task_started: "turn/started",
    turn_complete: "turn/completed",
    task_complete: "turn/completed",
    item_started: "item/started",
    item_completed: "item/completed",
    agent_message_delta: "item/agentMessage/delta",
    exec_command_output_delta: "item/commandExecution/outputDelta",
    patch_apply_output_delta: "item/fileChange/outputDelta",
    token_count: "thread/tokenUsage/updated",
  };

  if (type === "token_count") {
    return {
      method: "thread/tokenUsage/updated",
      params: {
        ...params,
        threadId,
        turnId,
        tokenUsage: normalizeLegacyTokenUsage(msg),
      },
    };
  }

  return {
    method: map[type] || `legacy/${type}`,
    params: {
      ...params,
      threadId,
      turnId,
      itemId,
      delta: msg.delta || params.delta || "",
      item: msg.item || null,
      msg,
    },
  };
}

function compactNotificationForWeb(notification) {
  if (!notification || typeof notification !== "object") {
    return { method: "unknown", params: {} };
  }
  const method = String(notification.method || "");
  const params = notification.params && typeof notification.params === "object"
    ? notification.params
    : {};
  const threadId = params.threadId ? String(params.threadId) : null;
  const turnId = params.turnId ? String(params.turnId) : null;
  const itemId = params.itemId ? String(params.itemId) : null;

  if (method === "thread/tokenUsage/updated") {
    return {
      method,
      params: {
        threadId,
        turnId,
        tokenUsage: params.tokenUsage || null,
      },
    };
  }
  if (method === "item/agentMessage/delta") {
    return {
      method,
      params: {
        threadId,
        turnId,
        itemId,
        delta: typeof params.delta === "string" ? params.delta : "",
      },
    };
  }
  if (
    method === "turn/started" ||
    method === "turn/completed" ||
    method === "turn/interrupted" ||
    method === "item/started" ||
    method === "item/completed" ||
    method === "item/commandExecution/outputDelta" ||
    method === "item/fileChange/outputDelta" ||
    method === "thread/started" ||
    method === "thread/name/updated"
  ) {
    return {
      method,
      params: {
        threadId,
        turnId,
        itemId,
      },
    };
  }
  return {
    method,
    params: {
      threadId,
      turnId,
      itemId,
    },
  };
}

function maybeTrackThreadUsage(notification) {
  if (!notification || notification.method !== "thread/tokenUsage/updated") {
    return;
  }
  const params = notification.params || {};
  const threadId = params.threadId ? String(params.threadId) : "";
  if (!threadId) return;
  const usage = normalizeThreadTokenUsage(params.tokenUsage || params);
  if (!usage) return;
  threadUsageById.set(threadId, usage);
}

function webTurnKey(threadId, turnId) {
  return `${String(threadId)}:${String(turnId)}`;
}

function maybeNudgeDesktopForNotification(notification) {
  if (rpc.status().transport !== "stdio") return;
  if (!notification || typeof notification !== "object") return;
  if (notification.method !== "turn/completed") return;
  const params = notification.params || {};
  const threadId = params.threadId ? String(params.threadId) : "";
  const turnId = params.turnId ? String(params.turnId) : "";
  if (!threadId || !turnId) return;

  const key = webTurnKey(threadId, turnId);
  if (!webTurns.has(key)) return;
  webTurns.delete(key);
  desktopNudge.request({ reason: "turn-completed", threadId, turnId });
}

async function decorateThreadListWithTitles(threads) {
  if (!Array.isArray(threads) || threads.length === 0) return [];
  const ids = threads
    .map((thread) =>
      thread && typeof thread === "object" && thread.id ? String(thread.id).trim() : ""
    )
    .filter(Boolean);
  const titleRows = await resolveThreadTitleRows(ids);
  if (titleRows.size === 0) return threads;
  return threads.map((thread) => {
    const id = thread && thread.id ? String(thread.id) : "";
    return applyThreadTitleDecoration(thread, titleRows.get(id) || null);
  });
}

async function decorateThreadWithTitle(thread) {
  if (!thread || typeof thread !== "object" || !thread.id) return thread;
  const rows = await resolveThreadTitleRows([String(thread.id)]);
  return applyThreadTitleDecoration(thread, rows.get(String(thread.id)) || null);
}

function applyThreadTitleDecoration(thread, titleRow) {
  if (!thread || typeof thread !== "object" || !titleRow) return thread;
  const title = normalizeThreadTitleText(titleRow.title);
  if (!title) return thread;
  const firstUserMessage = normalizeThreadTitleText(
    titleRow.firstUserMessage || titleRow.first_user_message
  );
  const next = {
    ...thread,
    title,
    displayName: title,
  };
  if (firstUserMessage && !next.firstUserMessage) {
    next.firstUserMessage = firstUserMessage;
  }
  return next;
}

function normalizeThreadTitleText(value) {
  const text = String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return text;
}

async function resolveThreadTitleRows(threadIds) {
  const ids = [...new Set((threadIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (ids.length === 0) return new Map();

  let dbStat = null;
  try {
    dbStat = await fsp.stat(CODEX_STATE_DB_FILE);
  } catch {
    return new Map();
  }
  if (!dbStat || !dbStat.isFile()) return new Map();

  const now = Date.now();
  const dbMtimeMs = Number(dbStat.mtimeMs || 0);
  const cacheExpired = now >= threadTitleCacheExpiresAt;
  const dbChanged = dbMtimeMs !== threadTitleCacheDbMtimeMs;
  if (cacheExpired || dbChanged) {
    threadTitleById.clear();
    threadTitleCacheDbMtimeMs = dbMtimeMs;
  }

  const missing = ids.filter((id) => !threadTitleById.has(id));
  if (missing.length > 0) {
    const rows = await queryThreadTitleRowsByIds(missing);
    const rowById = new Map();
    for (const row of rows) {
      const id = row && row.id ? String(row.id).trim() : "";
      if (!id) continue;
      rowById.set(id, row);
      threadTitleById.set(id, row);
    }
    for (const id of missing) {
      if (!rowById.has(id)) {
        // Cache negative lookup to avoid repeated sqlite calls in the same window.
        threadTitleById.set(id, null);
      }
    }
  }
  threadTitleCacheExpiresAt = now + THREAD_TITLE_CACHE_TTL_MS;

  const out = new Map();
  for (const id of ids) {
    const row = threadTitleById.get(id);
    if (row && typeof row === "object") {
      out.set(id, row);
    }
  }
  return out;
}

async function queryThreadTitleRowsByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const inClause = ids.map((id) => sqlQuote(id)).join(", ");
  const sql = [
    "SELECT id, title, first_user_message AS firstUserMessage",
    "FROM threads",
    `WHERE id IN (${inClause});`,
  ].join(" ");
  let stdout = "";
  try {
    stdout = await execFileUtf8(
      "sqlite3",
      ["-readonly", "-json", CODEX_STATE_DB_FILE, sql],
      {
        timeout: THREAD_TITLE_QUERY_TIMEOUT_MS,
        maxBuffer: THREAD_TITLE_QUERY_MAX_BUFFER,
      }
    );
  } catch {
    return [];
  }
  if (!stdout.trim()) return [];
  try {
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function sqlQuote(value) {
  return `'${String(value || "").replace(/'/g, "''")}'`;
}

function execFileUtf8(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        const details = String(stderr || "").trim();
        if (details) {
          reject(new Error(`${error.message}: ${details}`));
          return;
        }
        reject(error);
        return;
      }
      resolve(String(stdout || ""));
    });
  });
}

function normalizeLegacyTokenUsage(msg) {
  const info = msg && msg.info ? msg.info : {};
  const total = info.total_token_usage || info.totalTokenUsage || {};
  const last = info.last_token_usage || info.lastTokenUsage || {};
  const modelContextWindow =
    info.model_context_window !== undefined
      ? Number(info.model_context_window)
      : info.modelContextWindow !== undefined
      ? Number(info.modelContextWindow)
      : null;
  return normalizeThreadTokenUsage({
    total,
    last,
    modelContextWindow,
  });
}

async function resolveThreadUsageForThread(threadId, thread) {
  const key = String(threadId || "");
  if (!key) return null;
  const cached = threadUsageById.get(key);
  if (cached) return cached;

  const fallback = await readThreadUsageFromRolloutPath(thread);
  if (fallback) {
    threadUsageById.set(key, fallback);
    return fallback;
  }
  return null;
}

async function readThreadUsageFromRolloutPath(thread) {
  const filePath = resolveThreadRolloutPath(thread);
  if (!filePath) return null;

  let stat = null;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    return null;
  }
  if (!stat.isFile() || stat.size <= 0) return null;

  const cached = threadUsageFileCache.get(filePath);
  if (
    cached &&
    cached.size === stat.size &&
    cached.mtimeMs === stat.mtimeMs &&
    cached.usage
  ) {
    return cached.usage;
  }

  const usage = await readLatestTokenUsageFromJsonlTail(filePath, stat.size);
  setThreadUsageFileCache(filePath, {
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    usage: usage || null,
    checkedAt: Date.now(),
  });
  return usage;
}

function resolveThreadRolloutPath(thread) {
  const rawPath =
    thread && typeof thread === "object" && thread.path
      ? String(thread.path).trim()
      : "";
  if (!rawPath || !rawPath.endsWith(".jsonl")) return "";
  const absolute = path.resolve(rawPath);
  if (!absolute.startsWith(CODEX_STATE_ROOT + path.sep)) return "";
  return absolute;
}

async function readLatestTokenUsageFromJsonlTail(filePath, fileSize) {
  const size = Number(fileSize || 0);
  if (!Number.isFinite(size) || size <= 0) return null;

  for (const windowBytes of THREAD_USAGE_TAIL_WINDOWS) {
    const readBytes = Math.min(size, windowBytes);
    const buffer = Buffer.alloc(readBytes);
    let handle = null;
    try {
      handle = await fsp.open(filePath, "r");
      await handle.read(buffer, 0, readBytes, size - readBytes);
    } catch {
      if (handle) {
        try {
          await handle.close();
        } catch {
          // noop
        }
      }
      return null;
    } finally {
      if (handle) {
        try {
          await handle.close();
        } catch {
          // noop
        }
      }
    }

    const text = buffer.toString("utf8");
    const lines = text.split("\n");
    if (readBytes < size && lines.length > 0) {
      // First line may be partial because this is a tail read.
      lines.shift();
    }
    const usage = extractTokenUsageFromJsonlLines(lines);
    if (usage) return usage;
    if (readBytes >= size) break;
  }
  return null;
}

function extractTokenUsageFromJsonlLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return null;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = String(lines[i] || "").trim();
    if (!line) continue;
    let entry = null;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (!entry || entry.type !== "event_msg") continue;
    const payload = entry.payload && typeof entry.payload === "object" ? entry.payload : null;
    if (!payload || payload.type !== "token_count") continue;
    const info = payload.info && typeof payload.info === "object" ? payload.info : null;
    if (!info) continue;
    const normalized = normalizeThreadTokenUsage(info);
    if (normalized && normalized.modelContextWindow) {
      return normalized;
    }
  }
  return null;
}

function setThreadUsageFileCache(filePath, entry) {
  threadUsageFileCache.set(filePath, entry);
  if (threadUsageFileCache.size <= THREAD_USAGE_FILE_CACHE_MAX) return;
  let oldestKey = "";
  let oldestTime = Number.POSITIVE_INFINITY;
  for (const [key, value] of threadUsageFileCache.entries()) {
    const checkedAt = Number(value && value.checkedAt ? value.checkedAt : 0);
    if (checkedAt < oldestTime) {
      oldestTime = checkedAt;
      oldestKey = key;
    }
  }
  if (oldestKey) {
    threadUsageFileCache.delete(oldestKey);
  }
}

function normalizeThreadTokenUsage(input) {
  if (!input || typeof input !== "object") return null;
  const total = normalizeTokenBreakdown(input.total || input.total_token_usage || {});
  const last = normalizeTokenBreakdown(input.last || input.last_token_usage || {});
  const modelContextWindow =
    input.modelContextWindow !== undefined && input.modelContextWindow !== null
      ? Number(input.modelContextWindow)
      : input.model_context_window !== undefined && input.model_context_window !== null
      ? Number(input.model_context_window)
      : null;

  return {
    total,
    last,
    modelContextWindow:
      Number.isFinite(modelContextWindow) && modelContextWindow > 0
        ? Math.floor(modelContextWindow)
        : null,
  };
}

function normalizeTokenBreakdown(input) {
  if (!input || typeof input !== "object") {
    return {
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
    };
  }
  return {
    inputTokens: toInt(input.inputTokens ?? input.input_tokens),
    outputTokens: toInt(input.outputTokens ?? input.output_tokens),
    cachedInputTokens: toInt(input.cachedInputTokens ?? input.cached_input_tokens),
    reasoningOutputTokens: toInt(
      input.reasoningOutputTokens ?? input.reasoning_output_tokens
    ),
    totalTokens: toInt(input.totalTokens ?? input.total_tokens),
  };
}

function normalizeRateLimitWindow(input) {
  if (!input || typeof input !== "object") return null;
  const usedPercent = Number(input.usedPercent);
  const boundedUsed = Number.isFinite(usedPercent)
    ? Math.max(0, Math.min(100, usedPercent))
    : null;
  const remainingPercent =
    boundedUsed === null ? null : Math.max(0, Math.min(100, 100 - boundedUsed));
  const windowDurationMins = Number(input.windowDurationMins);
  const resetsAt = Number(input.resetsAt);
  return {
    usedPercent: boundedUsed,
    remainingPercent,
    windowDurationMins:
      Number.isFinite(windowDurationMins) && windowDurationMins > 0
        ? Math.floor(windowDurationMins)
        : null,
    resetsAt: Number.isFinite(resetsAt) && resetsAt > 0 ? Math.floor(resetsAt) : null,
  };
}

function normalizeRateLimitSet(input) {
  if (!input || typeof input !== "object") return null;
  return {
    limitId: input.limitId ? String(input.limitId) : null,
    limitName: input.limitName ? String(input.limitName) : null,
    planType: input.planType ? String(input.planType) : null,
    primary: normalizeRateLimitWindow(input.primary),
    secondary: normalizeRateLimitWindow(input.secondary),
    credits:
      input.credits && typeof input.credits === "object"
        ? {
            hasCredits: Boolean(input.credits.hasCredits),
            unlimited: Boolean(input.credits.unlimited),
            balance:
              input.credits.balance !== undefined && input.credits.balance !== null
                ? String(input.credits.balance)
                : null,
          }
        : null,
  };
}

function normalizeRateLimitsResponse(input) {
  const src = input && typeof input === "object" ? input : {};
  const byIdSrc =
    src.rateLimitsByLimitId && typeof src.rateLimitsByLimitId === "object"
      ? src.rateLimitsByLimitId
      : {};
  const rateLimitsByLimitId = {};
  for (const [key, value] of Object.entries(byIdSrc)) {
    const normalized = normalizeRateLimitSet(value);
    if (normalized) {
      rateLimitsByLimitId[String(key)] = normalized;
    }
  }
  return {
    rateLimits: normalizeRateLimitSet(src.rateLimits),
    rateLimitsByLimitId,
  };
}

function toInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

async function bootstrap() {
  if (rpc) {
    throw new Error("Bridge already started");
  }

  rpc = new CodexAppServerClient({
    bin: CODEX_APP_SERVER_BIN,
    websocketUrl: CODEX_APP_SERVER_WS_URL || null,
    spawnWebsocketServer: CODEX_APP_SERVER_WS_SPAWN,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    initializeParams: {
      clientInfo: {
        name: "codex-phone-bridge",
        title: "Codex Phone Bridge",
        version: "0.2.0",
      },
      capabilities: {
        experimentalApi: true,
      },
    },
  });
  sseHub = new SSEHub();
  mediaService = new MediaService({
    mediaRoot: MEDIA_ROOT,
    indexPath: MEDIA_INDEX,
    maxImageBytes: MAX_IMAGE_MB * 1024 * 1024,
  });
  threadSync = new ThreadSyncService({
    rpc,
    listPollMs: THREAD_LIST_POLL_MS,
    activePollMs: THREAD_READ_POLL_ACTIVE_MS,
    idlePollMs: THREAD_READ_POLL_IDLE_MS,
  });
  desktopNudge = new DesktopNudge({
    mode: DESKTOP_NUDGE_MODE,
    throttleMs: DESKTOP_NUDGE_THROTTLE_MS,
    helperAppPath: DESKTOP_NUDGE_HELPER_APP,
    logger: console,
  });
  // Avoid leaks if this module is imported without running the bridge.
  webTurnsCleanupTimer = setInterval(() => {
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const [key, value] of webTurns.entries()) {
      const createdAt =
        value && typeof value.createdAt === "number" ? value.createdAt : 0;
      if (!createdAt || createdAt < cutoff) {
        webTurns.delete(key);
      }
    }
  }, 5 * 60 * 1000);

  bindEvents();
  setupApprovalReminderLoop();
  await mediaService.init();
  await rpc.start();
  threadSync.start();

  server.listen(PORT, BIND_HOST, () => {
    console.log(
      [
        `[phone-codex-bridge] listening on ${SERVER_SCHEME}://${BIND_HOST}:${PORT}`,
        HTTPS_ENABLED
          ? `[phone-codex-bridge] https cert: ${path.resolve(HTTPS_CERT_FILE)}`
          : "[phone-codex-bridge] https disabled",
        `[phone-codex-bridge] codex app-server bin: ${CODEX_APP_SERVER_BIN}`,
        `[phone-codex-bridge] media root: ${MEDIA_ROOT}`,
        `[phone-codex-bridge] media index: ${MEDIA_INDEX}`,
        `[phone-codex-bridge] poll list/active/idle(ms): ${THREAD_LIST_POLL_MS}/${THREAD_READ_POLL_ACTIVE_MS}/${THREAD_READ_POLL_IDLE_MS}`,
        `[phone-codex-bridge] default approval policy: ${DEFAULT_APPROVAL_POLICY || "(inherit)"}`,
        `[phone-codex-bridge] default sandbox policy: ${DEFAULT_SANDBOX_POLICY || "(inherit)"}`,
        `[phone-codex-bridge] auto approval mode: ${AUTO_APPROVAL_MODE}`,
        `[phone-codex-bridge] desktop nudge: ${DESKTOP_NUDGE_MODE} (throttleMs=${DESKTOP_NUDGE_THROTTLE_MS})`,
        `[phone-codex-bridge] remote mode: ${REMOTE_MODE === "tailscale" ? "tailscale" : "off"}`,
        `[phone-codex-bridge] allowed client CIDRs: ${ALLOWED_CLIENT_CIDRS.join(", ")}`,
        `[phone-codex-bridge] auth mode: ${REQUIRE_LOGIN ? "password-session" : "open"}`,
        REQUIRE_LOGIN
          ? `[phone-codex-bridge] session cookie: ${SESSION_COOKIE_NAME} (ttl=${SESSION_TTL_SEC}s)`
          : `[phone-codex-bridge] simple login disabled (trusted-network mode)`,
      ].join("\n")
    );
    startHttpRedirectServerIfNeeded();
  });
}

module.exports = {
  bootstrapBridge: bootstrap,
};
