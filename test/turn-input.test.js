const test = require("node:test");
const assert = require("node:assert/strict");

const { buildTurnInput } = require("../src/bridge/lib/turn-input");

function mockMediaService(mediaById) {
  const map = mediaById || {};
  return {
    getById(id) {
      return map[id] || null;
    },
  };
}

test("buildTurnInput keeps plain text and linked images", () => {
  const mediaSvc = mockMediaService({
    img1: {
      id: "img1",
      kind: "image",
      absolutePath: "/tmp/image-1.png",
    },
  });

  const result = buildTurnInput(
    {
      text: "hello world",
      imageMediaIds: ["img1"],
    },
    mediaSvc
  );

  assert.equal(result.input.length, 2);
  assert.deepEqual(result.input[0], {
    type: "text",
    text: "hello world",
    text_elements: [],
  });
  assert.deepEqual(result.input[1], {
    type: "localImage",
    path: "/tmp/image-1.png",
  });
  assert.deepEqual(result.linkMediaIds, ["img1"]);
});

test("buildTurnInput ignores non-image media ids", () => {
  const mediaSvc = mockMediaService({
    media1: {
      id: "media1",
      kind: "file",
      absolutePath: "/tmp/anything.bin",
    },
  });

  const result = buildTurnInput(
    {
      text: "",
      imageMediaIds: ["media1"],
    },
    mediaSvc
  );

  assert.equal(result.input.length, 0);
  assert.deepEqual(result.linkMediaIds, []);
});
