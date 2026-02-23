const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");

const {
  DeviceAuthManager,
  buildCanonicalPath,
  buildSigningString,
  hmacBase64Url,
  sha256HexUtf8,
} = require("../src/bridge/device-auth");

async function makeManager() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "pc-auth-"));
  const statePath = path.join(dir, "device-binding.json");
  const mgr = new DeviceAuthManager({
    mode: "strict",
    legacyTokenMode: "off",
    statePath,
    pairingCodeLength: 6,
    pairingTtlSec: 300,
  });
  await mgr.init();
  return { mgr, dir, statePath };
}

test("pairing and signature verification succeeds", async (t) => {
  const { mgr, dir } = await makeManager();
  t.after(async () => {
    await fsp.rm(dir, { recursive: true, force: true });
  });

  const started = await mgr.startPairingSession({ baseUrls: ["http://127.0.0.1:8787"] });
  assert.ok(started.pairingId);
  assert.ok(started.code);

  const completed = await mgr.completePairing({
    pairingId: started.pairingId,
    code: started.code,
    deviceName: "iPhone",
    remoteAddress: "192.168.1.20",
  });
  assert.equal(completed.ok, true);
  assert.ok(completed.deviceId);
  assert.ok(completed.deviceSecret);

  const method = "POST";
  const pathname = "/api/v2/threads";
  const search = new URLSearchParams();
  const ts = Date.now();
  const nonce = "nonce-1";
  const body = JSON.stringify({ model: "gpt-5" });
  const keyHex = sha256HexUtf8(completed.deviceSecret);
  const canonicalPath = buildCanonicalPath(pathname, search, ["sig"]);
  const signingString = buildSigningString({
    method,
    canonicalPath,
    bodySha256: sha256HexUtf8(body),
    timestampMs: String(ts),
    nonce,
    deviceId: completed.deviceId,
  });
  const sig = hmacBase64Url(keyHex, signingString);

  const verified = await mgr.verifySignedRequest({
    method,
    pathname,
    searchParams: search,
    rawBody: body,
    credentials: {
      deviceId: completed.deviceId,
      timestampMs: String(ts),
      nonce,
      signature: sig,
    },
  });
  assert.equal(verified.ok, true);
});

test("replay nonce is rejected", async (t) => {
  const { mgr, dir } = await makeManager();
  t.after(async () => {
    await fsp.rm(dir, { recursive: true, force: true });
  });

  const started = await mgr.startPairingSession();
  const completed = await mgr.completePairing({
    pairingId: started.pairingId,
    code: started.code,
    deviceName: "Phone",
    remoteAddress: "100.80.1.5",
  });
  assert.equal(completed.ok, true);

  const method = "GET";
  const pathname = "/api/v2/threads";
  const search = new URLSearchParams("limit=20");
  const ts = Date.now();
  const nonce = "nonce-fixed";
  const body = "";
  const keyHex = sha256HexUtf8(completed.deviceSecret);
  const canonicalPath = buildCanonicalPath(pathname, search, ["sig"]);
  const signingString = buildSigningString({
    method,
    canonicalPath,
    bodySha256: sha256HexUtf8(body),
    timestampMs: String(ts),
    nonce,
    deviceId: completed.deviceId,
  });
  const sig = hmacBase64Url(keyHex, signingString);

  const first = await mgr.verifySignedRequest({
    method,
    pathname,
    searchParams: search,
    rawBody: body,
    credentials: {
      deviceId: completed.deviceId,
      timestampMs: String(ts),
      nonce,
      signature: sig,
    },
  });
  assert.equal(first.ok, true);

  const second = await mgr.verifySignedRequest({
    method,
    pathname,
    searchParams: search,
    rawBody: body,
    credentials: {
      deviceId: completed.deviceId,
      timestampMs: String(ts),
      nonce,
      signature: sig,
    },
  });
  assert.equal(second.ok, false);
  assert.equal(second.code, "replay_detected");
});

test("pairing from non-lan non-tailnet address is rejected", async (t) => {
  const { mgr, dir } = await makeManager();
  t.after(async () => {
    await fsp.rm(dir, { recursive: true, force: true });
  });

  const started = await mgr.startPairingSession();
  const completed = await mgr.completePairing({
    pairingId: started.pairingId,
    code: started.code,
    deviceName: "Phone",
    remoteAddress: "8.8.8.8",
  });
  assert.equal(completed.ok, false);
  assert.equal(completed.status, 403);
});

test("state file never stores device secret plaintext", async (t) => {
  const { mgr, dir, statePath } = await makeManager();
  t.after(async () => {
    await fsp.rm(dir, { recursive: true, force: true });
  });

  const started = await mgr.startPairingSession();
  const completed = await mgr.completePairing({
    pairingId: started.pairingId,
    code: started.code,
    deviceName: "Phone",
    remoteAddress: "192.168.1.9",
  });
  assert.equal(completed.ok, true);

  const content = await fsp.readFile(statePath, "utf8");
  assert.equal(content.includes(completed.deviceSecret), false);
  assert.ok(content.includes("secretHash"));
  assert.equal(fs.existsSync(statePath), true);
});
