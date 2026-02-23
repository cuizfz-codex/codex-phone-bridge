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

test("buildTurnInput uses voice transcript preview when explicit transcript is missing", () => {
  const mediaSvc = mockMediaService({
    voice1: {
      id: "voice1",
      kind: "voice",
      metadata: {
        transcriptPreview: "hello from preview",
      },
    },
  });

  const result = buildTurnInput(
    {
      text: "",
      voiceMediaId: "voice1",
      voiceTranscript: "",
    },
    mediaSvc
  );

  assert.equal(result.input.length, 1);
  assert.equal(result.input[0].type, "text");
  assert.match(result.input[0].text, /\[语音转写\]/);
  assert.match(result.input[0].text, /hello from preview/);
  assert.deepEqual(result.linkMediaIds, ["voice1"]);
});

test("buildTurnInput keeps voice turn sendable when transcript is unavailable", () => {
  const mediaSvc = mockMediaService({
    voice2: {
      id: "voice2",
      kind: "voice",
      metadata: {},
    },
  });

  const result = buildTurnInput(
    {
      text: "",
      voiceMediaId: "voice2",
      voiceTranscript: "",
    },
    mediaSvc
  );

  assert.equal(result.input.length, 1);
  assert.equal(result.input[0].type, "text");
  assert.match(result.input[0].text, /Voice message attached/i);
  assert.deepEqual(result.linkMediaIds, ["voice2"]);
});
