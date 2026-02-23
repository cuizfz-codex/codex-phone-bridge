function sanitizeUserInputArray(input) {
  const result = [];
  for (const item of input) {
    if (!item || typeof item !== "object" || !item.type) continue;
    if (item.type === "text") {
      const text = String(item.text || "").trim();
      if (!text) continue;
      result.push({
        type: "text",
        text,
        text_elements: Array.isArray(item.text_elements) ? item.text_elements : [],
      });
      continue;
    }
    if (item.type === "image") {
      const url = String(item.url || "").trim();
      if (!url) continue;
      result.push({ type: "image", url });
      continue;
    }
    if (item.type === "localImage") {
      const localPath = String(item.path || "").trim();
      if (!localPath) continue;
      result.push({ type: "localImage", path: localPath });
      continue;
    }
    if (item.type === "skill") {
      const name = String(item.name || "").trim();
      const skillPath = String(item.path || "").trim();
      if (name && skillPath) {
        result.push({ type: "skill", name, path: skillPath });
      }
      continue;
    }
    if (item.type === "mention") {
      const name = String(item.name || "").trim();
      const mentionPath = String(item.path || "").trim();
      if (name && mentionPath) {
        result.push({ type: "mention", name, path: mentionPath });
      }
      continue;
    }
  }
  return result;
}

function buildTurnInput(body, mediaSvc) {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const linkMediaIds = [];
  if (Array.isArray(body.input) && body.input.length > 0) {
    return {
      input: sanitizeUserInputArray(body.input),
      linkMediaIds,
    };
  }

  const input = [];
  const text = (body.text || "").trim();
  if (text) {
    input.push({
      type: "text",
      text,
      text_elements: [],
    });
  }

  const imageMediaIds = Array.isArray(body.imageMediaIds) ? body.imageMediaIds : [];
  for (const idRaw of imageMediaIds) {
    const mediaId = String(idRaw);
    const media = mediaSvc.getById(mediaId);
    if (!media) continue;
    if (media.kind !== "image") continue;
    input.push({
      type: "localImage",
      path: media.absolutePath,
    });
    linkMediaIds.push(mediaId);
  }

  const imagePaths = Array.isArray(body.imagePaths) ? body.imagePaths : [];
  for (const p of imagePaths) {
    if (!p) continue;
    input.push({
      type: "localImage",
      path: String(p),
    });
  }

  const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls : [];
  for (const u of imageUrls) {
    if (!u) continue;
    input.push({
      type: "image",
      url: String(u),
    });
  }

  return {
    input: sanitizeUserInputArray(input),
    linkMediaIds,
  };
}

module.exports = {
  buildTurnInput,
  sanitizeUserInputArray,
};
