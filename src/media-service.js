const crypto = require("crypto");
const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");

const MIME_TO_EXT = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/heic": ".heic",
};

class MediaService {
  constructor(options) {
    this.mediaRoot = path.resolve(options.mediaRoot);
    this.indexPath = path.resolve(options.indexPath);
    this.maxImageBytes = Number(options.maxImageBytes || 12 * 1024 * 1024);
    this._index = {
      version: 1,
      items: [],
    };
    this._byId = new Map();
    this._byAbsPath = new Map();
    this._persistQueue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(this.mediaRoot, { recursive: true });
    await fs.mkdir(path.dirname(this.indexPath), { recursive: true });

    if (!fsSync.existsSync(this.indexPath)) {
      await this._persistIndex();
      return;
    }

    const raw = await fs.readFile(this.indexPath, "utf8");
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (_error) {
      parsed = null;
    }

    if (!parsed || !Array.isArray(parsed.items)) {
      this._index = { version: 1, items: [] };
      await this._persistIndex();
      return;
    }

    this._index = {
      version: 1,
      items: parsed.items,
    };
    this._rebuildMaps();
  }

  _rebuildMaps() {
    this._byId.clear();
    this._byAbsPath.clear();
    for (const item of this._index.items) {
      this._byId.set(item.id, item);
      if (item.absolutePath) {
        this._byAbsPath.set(path.resolve(item.absolutePath), item);
      }
    }
  }

  _queuePersist() {
    this._persistQueue = this._persistQueue.then(() => this._persistIndex());
    return this._persistQueue;
  }

  async _persistIndex() {
    const tmpPath = `${this.indexPath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(this._index, null, 2), "utf8");
    await fs.rename(tmpPath, this.indexPath);
  }

  list() {
    return this._index.items.slice();
  }

  listRecent(limit = 50) {
    return this._index.items.slice(-limit).reverse();
  }

  getById(mediaId) {
    return this._byId.get(mediaId) || null;
  }

  getByAbsolutePath(filePath) {
    return this._byAbsPath.get(path.resolve(filePath)) || null;
  }

  getPublicUrl(mediaId) {
    return `/api/v2/media/${encodeURIComponent(mediaId)}`;
  }

  async linkMedia(mediaId, info = {}) {
    const item = this.getById(mediaId);
    if (!item) {
      return null;
    }
    if (info.threadId) item.threadId = String(info.threadId);
    if (info.turnId) item.turnId = String(info.turnId);
    item.updatedAt = new Date().toISOString();
    await this._queuePersist();
    return item;
  }

  async saveImage(payload) {
    return this._saveFromDataUrl("image", payload, this.maxImageBytes);
  }

  async _saveFromDataUrl(kind, payload, sizeLimit) {
    const parsed = this._parsePayload(payload);
    if (!parsed.buffer || parsed.buffer.length === 0) {
      throw new Error("Empty media payload");
    }
    if (parsed.buffer.length > sizeLimit) {
      throw new Error(
        `${kind} file too large (${parsed.buffer.length} bytes), max ${sizeLimit}`
      );
    }

    const ext = this._resolveExt(parsed.mimeType, parsed.fileName);
    const mediaId = crypto.randomUUID();
    const now = new Date();
    const y = String(now.getUTCFullYear());
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    const d = String(now.getUTCDate()).padStart(2, "0");

    const dir = path.join(this.mediaRoot, kind, y, m, d);
    await fs.mkdir(dir, { recursive: true });

    const storedName = `${mediaId}${ext}`;
    const absolutePath = path.join(dir, storedName);
    await fs.writeFile(absolutePath, parsed.buffer);

    const item = {
      id: mediaId,
      kind,
      mimeType: parsed.mimeType,
      size: parsed.buffer.length,
      fileName: this._sanitizeFileName(parsed.fileName || storedName),
      storedName,
      absolutePath,
      relativePath: path.relative(this.mediaRoot, absolutePath),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      threadId: payload.threadId ? String(payload.threadId) : null,
      turnId: payload.turnId ? String(payload.turnId) : null,
      metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {},
    };

    this._index.items.push(item);
    this._byId.set(item.id, item);
    this._byAbsPath.set(path.resolve(item.absolutePath), item);
    await this._queuePersist();

    return {
      mediaId,
      mimeType: item.mimeType,
      size: item.size,
      fileName: item.fileName,
      localPath: item.absolutePath,
      filePath: item.absolutePath,
      url: this.getPublicUrl(mediaId),
      createdAt: item.createdAt,
    };
  }

  _parsePayload(payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid media payload");
    }
    const dataUrl = payload.dataUrl ? String(payload.dataUrl) : "";
    const base64 = payload.base64 ? String(payload.base64) : "";
    const fileName = payload.fileName ? String(payload.fileName) : "";
    let mimeType = payload.mimeType ? String(payload.mimeType) : "";
    let bodyBase64 = "";

    if (dataUrl) {
      const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
      if (!match || !match[3]) {
        throw new Error("Invalid dataUrl");
      }
      if (match[1]) mimeType = mimeType || match[1].trim();
      bodyBase64 = match[3];
    } else if (base64) {
      bodyBase64 = base64;
    } else {
      throw new Error("Missing dataUrl or base64 payload");
    }

    const buffer = Buffer.from(bodyBase64, "base64");
    if (!mimeType) {
      mimeType = "application/octet-stream";
    }

    return {
      mimeType,
      buffer,
      fileName,
    };
  }

  _resolveExt(mimeType, fileName) {
    const safeMime = String(mimeType || "").toLowerCase();
    const fromMime = MIME_TO_EXT[safeMime];
    if (fromMime) return fromMime;

    const ext = path.extname(fileName || "").toLowerCase();
    if (ext && ext.length <= 10) return ext;

    if (safeMime.startsWith("image/")) return ".img";
    return ".bin";
  }

  _sanitizeFileName(fileName) {
    return String(fileName || "file")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .slice(0, 120);
  }
}

module.exports = {
  MediaService,
};
