const test = require("node:test");
const assert = require("node:assert/strict");

const { _test } = require("../src/bridge/bridge-app");

test("rate limit snapshot reuses last successful payload as stale fallback", () => {
  _test.resetRateLimitsSnapshotForTest();

  const live = _test.rememberRateLimitsSnapshot({
    rateLimits: {
      limitId: "codex",
      primary: { usedPercent: 12, windowDurationMins: 300, resetsAt: 1746901200 },
      secondary: { usedPercent: 34, windowDurationMins: 10080, resetsAt: 1747401200 },
    },
  });

  assert.equal(live.stale, false);
  assert.equal(live.rateLimits.primary.remainingPercent, 88);
  assert.ok(Number.isInteger(live.cachedAt));

  const fallback = _test.getRateLimitsSnapshotPayload();
  assert.ok(fallback);
  assert.equal(fallback.stale, true);
  assert.equal(fallback.rateLimits.primary.remainingPercent, 88);
  assert.equal(fallback.cachedAt, live.cachedAt);
});

test("rate limit snapshot ignores empty payloads", () => {
  _test.resetRateLimitsSnapshotForTest();

  assert.equal(_test.hasRateLimitsData({ rateLimits: null, rateLimitsByLimitId: {} }), false);

  const empty = _test.rememberRateLimitsSnapshot({
    rateLimits: null,
    rateLimitsByLimitId: {},
  });
  assert.equal(empty.stale, false);
  assert.equal(empty.cachedAt, null);
  assert.equal(_test.getRateLimitsSnapshotPayload(), null);
});

test("rate limit snapshot stays on the last good payload when a later payload is empty", () => {
  _test.resetRateLimitsSnapshotForTest();

  const live = _test.rememberRateLimitsSnapshot({
    rateLimitsByLimitId: {
      codex: {
        limitId: "codex",
        primary: { usedPercent: 20, windowDurationMins: 300, resetsAt: 1746901200 },
      },
    },
  });
  assert.equal(live.rateLimitsByLimitId.codex.primary.remainingPercent, 80);

  const empty = _test.rememberRateLimitsSnapshot({
    rateLimits: null,
    rateLimitsByLimitId: {},
  });
  assert.equal(empty.cachedAt, live.cachedAt);

  const fallback = _test.getRateLimitsSnapshotPayload();
  assert.equal(fallback.rateLimitsByLimitId.codex.primary.remainingPercent, 80);
});

test("normalizeMarkdownLocalImagePath accepts absolute paths and file urls only", () => {
  assert.equal(
    _test.normalizeMarkdownLocalImagePath("/tmp/demo.png"),
    "/tmp/demo.png"
  );
  assert.equal(
    _test.normalizeMarkdownLocalImagePath("file:///tmp/demo%20chart.png"),
    "/tmp/demo chart.png"
  );
  assert.equal(_test.normalizeMarkdownLocalImagePath("https://example.com/demo.png"), "");
  assert.equal(_test.normalizeMarkdownLocalImagePath("demo.png"), "");
});

test("rewriteMarkdownLocalImageRefs replaces local markdown images with media urls", async () => {
  const calls = [];
  const mediaSvc = {
    getByAbsolutePath(input) {
      if (input === "/tmp/chart.png") {
        return { id: "img-1", absolutePath: input };
      }
      return null;
    },
    getPublicUrl(mediaId) {
      return `/api/v2/media/${mediaId}`;
    },
  };

  const output = await _test.rewriteMarkdownLocalImageRefs(
    "before\n![图1](/tmp/chart.png)\nafter",
    mediaSvc,
    {
      threadId: "thread-1",
      turnId: "turn-1",
      allowedRoots: calls,
    }
  );

  assert.equal(output, "before\n![图1](/api/v2/media/img-1)\nafter");
});
