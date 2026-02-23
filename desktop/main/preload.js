const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("phoneCodex", {
  getStatus: () => ipcRenderer.invoke("get-status"),
  getRemoteStatus: () => ipcRenderer.invoke("get-remote-status"),
  getRemoteUrls: () => ipcRenderer.invoke("get-remote-urls"),
  setSync: (enabled) => ipcRenderer.invoke("set-sync", Boolean(enabled)),
  emergencyDisable: (reason) => ipcRenderer.invoke("emergency-disable", reason || ""),
  openWebUi: () => ipcRenderer.invoke("open-web-ui"),
  copyText: (text) => ipcRenderer.invoke("copy-text", String(text || "")),
  generateQr: (url) => ipcRenderer.invoke("generate-qr", String(url || "")),
  setConfig: (patch) => ipcRenderer.invoke("set-config", patch || {}),
  saveRemoteSettings: (patch) => ipcRenderer.invoke("save-remote-settings", patch || {}),
  startPairing: () => ipcRenderer.invoke("start-pairing"),
  getPairingState: () => ipcRenderer.invoke("get-pairing-state"),
  resetPairing: () => ipcRenderer.invoke("reset-pairing"),
  regenToken: () => ipcRenderer.invoke("regen-token"),
  onStatus: (fn) => ipcRenderer.on("status", (_evt, st) => fn(st)),
  onLogLine: (fn) => ipcRenderer.on("log-line", (_evt, line) => fn(line)),
});
