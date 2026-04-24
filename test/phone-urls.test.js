const test = require("node:test");
const assert = require("node:assert/strict");

const { buildPhoneUrls } = require("../archive/legacy-desktop-app/desktop/main/lib/phone-urls");

test("buildPhoneUrls includes LAN and tailscale URLs when enabled", () => {
  const urls = buildPhoneUrls(
    {
      bridgePort: 8787,
      bindHost: "0.0.0.0",
      authToken: "tok",
      remoteMode: "tailscale",
      showRemoteUrlInUi: true,
    },
    {
      lanIps: ["192.168.1.8", "100.72.1.9"],
      tailscale: {
        connected: true,
        ipv4: "100.72.1.9",
        magicDns: "device.tail.ts.net",
      },
    }
  );

  assert.equal(
    urls.some((item) => item.kind === "lan" && item.ip === "192.168.1.8"),
    true
  );
  assert.equal(
    urls.some((item) => item.kind === "tailscale" && item.ip === "100.72.1.9"),
    true
  );
  assert.equal(
    urls.some((item) => item.kind === "tailscale" && item.ip === "device.tail.ts.net"),
    true
  );
  // Tailnet IPv4 should not appear as LAN entry when remote mode is tailscale.
  assert.equal(
    urls.some((item) => item.kind === "lan" && item.ip === "100.72.1.9"),
    false
  );
});

test("buildPhoneUrls does not include tailscale URLs when bind host is local only", () => {
  const urls = buildPhoneUrls(
    {
      bridgePort: 8787,
      bindHost: "127.0.0.1",
      authToken: "tok",
      remoteMode: "tailscale",
      showRemoteUrlInUi: true,
    },
    {
      lanIps: ["192.168.1.8"],
      tailscale: {
        connected: true,
        ipv4: "100.72.1.9",
        magicDns: "device.tail.ts.net",
      },
    }
  );

  assert.equal(urls.length, 1);
  assert.equal(urls[0].kind, "local");
  assert.equal(urls[0].ip, "127.0.0.1");
});
