const elements = {
  sidebar: document.querySelector("#sidebar"),
  backdrop: document.querySelector("#sidebar-backdrop"),
  menuToggle: document.querySelector("#menu-toggle"),
  openSettings: document.querySelector("#open-settings"),
  settingsDialog: document.querySelector("#settings-dialog"),
  settingsForm: document.querySelector("#settings-form"),
  cancelSettings: document.querySelector("#cancel-settings"),
  serverBase: document.querySelector("#server-base"),
  authToken: document.querySelector("#auth-token"),
  openPairing: document.querySelector("#open-pairing"),
  pairingBanner: document.querySelector("#pairing-banner"),
  pairingBannerBtn: document.querySelector("#pairing-banner-btn"),
  pairingDialog: document.querySelector("#pairing-dialog"),
  pairingForm: document.querySelector("#pairing-form"),
  cancelPairing: document.querySelector("#cancel-pairing"),
  pairingId: document.querySelector("#pairing-id"),
  pairingDeviceName: document.querySelector("#pairing-device-name"),
  pairingCode: document.querySelector("#pairing-code"),
  pairingStatus: document.querySelector("#pairing-status"),
  statusBar: document.querySelector("#status-bar"),
  threadList: document.querySelector("#thread-list"),
  threadSearch: document.querySelector("#thread-search"),
  sourceFilter: document.querySelector("#source-filter"),
  archivedToggle: document.querySelector("#archived-toggle"),
  desktopCompatibleToggle: document.querySelector("#desktop-compatible-toggle"),
  lockBanner: document.querySelector("#lock-banner"),
  lockBannerText: document.querySelector("#lock-banner-text"),
  unlockThreadBtn: document.querySelector("#unlock-thread-btn"),
  refreshThreadsBtn: document.querySelector("#refresh-threads-btn"),
  newThreadBtn: document.querySelector("#new-thread-btn"),
  threadTitle: document.querySelector("#thread-title"),
  threadMeta: document.querySelector("#thread-meta"),
  contextWidget: document.querySelector("#context-widget"),
  contextRing: document.querySelector("#context-ring"),
  contextUsageText: document.querySelector("#context-usage-text"),
  contextPctText: document.querySelector("#context-pct-text"),
  quotaWidget: document.querySelector("#quota-widget"),
  quota5hText: document.querySelector("#quota-5h-text"),
  quota7dText: document.querySelector("#quota-7d-text"),
  themeSelect: document.querySelector("#theme-select"),
  chat: document.querySelector("#chat"),
  approvalsPanel: document.querySelector("#approval-panel"),
  approvalList: document.querySelector("#approval-list"),
  composer: document.querySelector("#composer"),
  input: document.querySelector("#message-input"),
  sendBtn: document.querySelector("#send-btn"),
  imagePicker: document.querySelector("#image-picker"),
  pickImageBtn: document.querySelector("#pick-image-btn"),
  voiceBtn: document.querySelector("#voice-btn"),
  pendingImages: document.querySelector("#pending-images"),
  pendingVoice: document.querySelector("#pending-voice"),
};

const storageKeys = {
  baseUrl: "codex_v2_base_url",
  token: "codex_v2_auth_token",
  deviceId: "codex_v3_device_id",
  deviceSecret: "codex_v3_device_secret",
  pairingId: "codex_v3_pairing_id",
  pairingCode: "codex_v3_pairing_code",
  pairingAuto: "codex_v3_pairing_auto",
  pairingMode: "codex_v3_pairing_mode",
  deviceName: "codex_v3_device_name",
  lockedThreadId: "codex_v2_locked_thread_id",
  initialThreadId: "codex_v2_initial_thread_id",
  desktopCompatibleMode: "codex_v2_desktop_compatible_mode",
  theme: "codex_v2_theme",
};

const legacyStorageKeys = {
  baseUrl: "codex_bridge_base_url",
  token: "codex_bridge_auth_token",
};

// Codex Desktop does not always surface every source kind in its sidebar.
// In "desktop compatible mode", default to a subset to better match the desktop UI.
const DESKTOP_COMPAT_SOURCE_KINDS = ["vscode", "cli", "appServer", "unknown"];
const RATE_LIMIT_POLL_MS = 60000;

const state = {
  loadingThreads: false,
  loadingThread: false,
  threadLoadSeq: 0,
  sending: false,
  threads: [],
  projects: [],
  expandedProjectKey: null,
  projectCollapsedByUser: false,
  selectedThreadId: null,
  selectedThread: null,
  selectedThreadUsage: null,
  initialThreadId: null,
  lockedThreadId: null,
  desktopCompatibleMode: true,
  forceScrollToBottom: false,
  chatScrollLocked: false,
  threadUsageById: new Map(),
  pendingApprovals: [],
  pendingImages: [],
  pendingVoice: null,
  eventSource: null,
  listPollTimer: null,
  threadPollTimer: null,
  threadRefreshTimer: null,
  liveDeltas: new Map(),
  pairing: {
    active: false,
    pairingId: "",
    pairingCode: "",
    auto: false,
    autoTried: false,
  },
  theme: "light",
  quota: {
    rateLimits: null,
    pollTimer: null,
    lastError: "",
  },
  voice: {
    recording: false,
    mediaRecorder: null,
    recognition: null,
    stream: null,
    chunks: [],
    finalTranscript: "",
    interimTranscript: "",
  },
};

init();

function init() {
  applyQueryBootstrap();
  migrateLegacySettings();
  initializeTheme();
  initializeRateLimitPolling();
  renderQuotaUsage();
  if (elements.pairingDeviceName && !elements.pairingDeviceName.value) {
    elements.pairingDeviceName.value = getStoredDeviceName();
  }
  state.pairing.pairingId = getPendingPairingId();
  state.pairing.pairingCode = getPendingPairingCode();
  state.pairing.auto = getPairingAutoFlag();
  state.pairing.autoTried = false;
  state.pairing.active = getPairingModeFlag();
  state.initialThreadId = getInitialThreadId();
  state.lockedThreadId = getLockedThreadId();
  state.desktopCompatibleMode = getDesktopCompatibleMode();
  const initialBase = localStorage.getItem(storageKeys.baseUrl) || window.location.origin;
  const initialToken = localStorage.getItem(storageKeys.token) || "";
  elements.serverBase.value = normalizeBaseUrl(initialBase);
  elements.authToken.value = initialToken;
  if (elements.desktopCompatibleToggle) {
    elements.desktopCompatibleToggle.checked = state.desktopCompatibleMode;
  }
  bindEvents();
  applyLockedThreadUi();
  renderPairingBanner();
  setStatus("初始化中...");
  bootstrap();
}

function initializeTheme() {
  const theme = getThemePreference();
  applyTheme(theme, { persist: false });
}

function getThemePreference() {
  const stored = String(localStorage.getItem(storageKeys.theme) || "")
    .trim()
    .toLowerCase();
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  if (
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

function applyTheme(theme, options = {}) {
  const next = String(theme || "").toLowerCase() === "dark" ? "dark" : "light";
  state.theme = next;
  document.documentElement.setAttribute("data-theme", next);
  if (elements.themeSelect && elements.themeSelect.value !== next) {
    elements.themeSelect.value = next;
  }
  if (options.persist) {
    localStorage.setItem(storageKeys.theme, next);
  }
}

function initializeRateLimitPolling() {
  if (state.quota.pollTimer) {
    clearInterval(state.quota.pollTimer);
  }
  state.quota.pollTimer = setInterval(() => {
    loadRateLimits({ silent: true }).catch(() => {
      // noop
    });
  }, RATE_LIMIT_POLL_MS);
}

async function loadRateLimits(options = {}) {
  const silent = Boolean(options.silent);
  try {
    const data = await apiFetchJson("/api/v2/rate-limits");
    state.quota.rateLimits = normalizeRateLimitsPayload(data || {});
    state.quota.lastError = "";
    renderQuotaUsage();
  } catch (error) {
    state.quota.lastError = asMessage(error);
    state.quota.rateLimits = null;
    renderQuotaUsage();
    if (!silent) {
      setStatus(`读取限额失败: ${state.quota.lastError}`);
    }
  }
}

function normalizeRateLimitsPayload(input) {
  const src = input && typeof input === "object" ? input : {};
  return {
    rateLimits: normalizeRateLimitSet(src.rateLimits),
    rateLimitsByLimitId: src.rateLimitsByLimitId && typeof src.rateLimitsByLimitId === "object"
      ? src.rateLimitsByLimitId
      : {},
  };
}

function normalizeRateLimitSet(input) {
  if (!input || typeof input !== "object") return null;
  return {
    limitId: input.limitId ? String(input.limitId) : null,
    limitName: input.limitName ? String(input.limitName) : null,
    primary: normalizeRateLimitWindow(input.primary),
    secondary: normalizeRateLimitWindow(input.secondary),
    planType: input.planType ? String(input.planType) : null,
  };
}

function normalizeRateLimitWindow(input) {
  if (!input || typeof input !== "object") return null;
  const usedPercent = Number(input.usedPercent);
  const used = Number.isFinite(usedPercent)
    ? Math.max(0, Math.min(100, usedPercent))
    : null;
  const remaining = used === null ? null : Math.max(0, Math.min(100, 100 - used));
  return {
    usedPercent: used,
    remainingPercent: remaining,
    windowDurationMins:
      Number.isFinite(Number(input.windowDurationMins)) &&
      Number(input.windowDurationMins) > 0
        ? Math.floor(Number(input.windowDurationMins))
        : null,
    resetsAt:
      Number.isFinite(Number(input.resetsAt)) && Number(input.resetsAt) > 0
        ? Math.floor(Number(input.resetsAt))
        : null,
  };
}

function renderQuotaUsage() {
  let set = state.quota.rateLimits ? state.quota.rateLimits.rateLimits : null;
  if (!set && state.quota.rateLimits && state.quota.rateLimits.rateLimitsByLimitId) {
    const values = Object.values(state.quota.rateLimits.rateLimitsByLimitId);
    if (values.length > 0) {
      const codexLike = values.find((item) => item && String(item.limitId || "").startsWith("codex"));
      set = codexLike || values[0] || null;
    }
  }
  const primary = set && set.primary ? set.primary : null;
  const secondary = set && set.secondary ? set.secondary : null;
  renderQuotaRow(elements.quota5hText, primary ? primary.remainingPercent : null);
  renderQuotaRow(elements.quota7dText, secondary ? secondary.remainingPercent : null);

  if (elements.quotaWidget) {
    const pText = primary && primary.remainingPercent !== null ? `${Math.round(primary.remainingPercent)}%` : "--%";
    const sText = secondary && secondary.remainingPercent !== null ? `${Math.round(secondary.remainingPercent)}%` : "--%";
    elements.quotaWidget.title = `Codex 限额剩余：5h ${pText} · 7d ${sText}`;
  }
}

function renderQuotaRow(textEl, remainPercent) {
  if (!textEl) return;
  if (remainPercent === null || remainPercent === undefined || !Number.isFinite(Number(remainPercent))) {
    textEl.textContent = "--%";
    return;
  }
  const pct = Math.max(0, Math.min(100, Number(remainPercent)));
  textEl.textContent = `${Math.round(pct)}%`;
}

async function bootstrap() {
  renderPairingBanner();
  try {
    await Promise.all([
      loadThreads({ preserveSelection: false }),
      loadPendingApprovals(),
      loadRateLimits({ silent: true }),
    ]);
    if (state.lockedThreadId) {
      const lockedExists = state.threads.some(
        (item) => item.id === state.lockedThreadId
      );
      if (lockedExists) {
        await selectThread(state.lockedThreadId);
      } else {
        state.selectedThreadId = state.lockedThreadId;
        await loadCurrentThread(state.lockedThreadId, { silent: true });
      }
    } else if (state.initialThreadId) {
      const initialThreadId = state.initialThreadId;
      clearInitialThreadId();
      const initialExists = state.threads.some((item) => item.id === initialThreadId);
      if (initialExists) {
        await selectThread(initialThreadId);
      } else {
        state.selectedThreadId = initialThreadId;
        await loadCurrentThread(initialThreadId, { silent: true });
      }
    } else if (!state.selectedThreadId && state.threads.length > 0) {
      await selectThread(state.threads[0].id);
    } else if (state.selectedThreadId) {
      await loadCurrentThread(state.selectedThreadId, { silent: true });
    }
    await connectEventSource();
    startPolling();
    if (state.pairing.active && state.pairing.pairingId && !hasBoundDevice()) {
      showPairingDialog({
        pairingId: state.pairing.pairingId,
        message: "检测到配对会话。若二维码包含验证码将自动完成；失败时可手动输入。",
      });
    }
    if (state.lockedThreadId) {
      setStatus(`在线（锁定线程 ${state.lockedThreadId.slice(0, 8)}...）`);
    } else {
      setStatus("在线");
    }
  } catch (error) {
    const message = asMessage(error);
    setStatus(`初始化失败: ${message}`);
    if (/unauthorized/i.test(message)) {
      renderPairingBanner(true);
      if (state.pairing.pairingId || !hasBoundDevice()) {
        const autoPaired = await maybeAutoCompletePairing();
        if (autoPaired) {
          return;
        }
        showPairingDialog({
          pairingId: state.pairing.pairingId || getPendingPairingId(),
          message:
            "当前未授权访问。请在桌面端控制页点击 Start Pairing，并扫码后自动绑定；若自动失败请手动输入验证码。",
        });
        return;
      }
      const legacyToken = localStorage.getItem(legacyStorageKeys.token) || "";
      if (legacyToken && !localStorage.getItem(storageKeys.token)) {
        localStorage.setItem(storageKeys.token, legacyToken);
        elements.authToken.value = legacyToken;
      }
      const legacyBase = localStorage.getItem(legacyStorageKeys.baseUrl) || "";
      if (legacyBase && !localStorage.getItem(storageKeys.baseUrl)) {
        localStorage.setItem(storageKeys.baseUrl, normalizeBaseUrl(legacyBase));
        elements.serverBase.value = normalizeBaseUrl(legacyBase);
      }
      elements.settingsDialog.showModal();
    }
  }
}

function bindEvents() {
  elements.menuToggle.addEventListener("click", () => {
    elements.sidebar.classList.toggle("open");
    elements.backdrop.classList.toggle("show");
  });
  elements.backdrop.addEventListener("click", () => {
    elements.sidebar.classList.remove("open");
    elements.backdrop.classList.remove("show");
  });

  elements.openSettings.addEventListener("click", () => {
    elements.settingsDialog.showModal();
  });
  elements.cancelSettings.addEventListener("click", () => {
    elements.settingsDialog.close();
  });
  elements.settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    localStorage.setItem(storageKeys.baseUrl, normalizeBaseUrl(elements.serverBase.value));
    localStorage.setItem(storageKeys.token, elements.authToken.value.trim());
    elements.settingsDialog.close();
    setStatus("设置已保存，正在重连...");
    disconnectEventSource();
    await bootstrap();
  });
  if (elements.themeSelect) {
    elements.themeSelect.addEventListener("change", () => {
      applyTheme(elements.themeSelect.value, { persist: true });
    });
  }
  if (elements.openPairing) {
    elements.openPairing.addEventListener("click", () => {
      showPairingDialog({ pairingId: getPendingPairingId() });
    });
  }
  if (elements.pairingBannerBtn) {
    elements.pairingBannerBtn.addEventListener("click", () => {
      showPairingDialog({ pairingId: getPendingPairingId() });
    });
  }
  if (elements.cancelPairing) {
    elements.cancelPairing.addEventListener("click", () => {
      if (elements.pairingDialog && elements.pairingDialog.open) {
        elements.pairingDialog.close();
      }
    });
  }
  if (elements.pairingForm) {
    elements.pairingForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await submitPairingForm().catch((error) => {
        setPairingStatus(`配对失败: ${asMessage(error)}`, true);
      });
    });
  }

  elements.refreshThreadsBtn.addEventListener("click", () => {
    loadThreads({ preserveSelection: true }).catch((error) => {
      setStatus(`刷新失败: ${asMessage(error)}`);
    });
  });
  elements.newThreadBtn.addEventListener("click", () => {
    if (state.lockedThreadId) {
      setStatus("已锁定单线程，不允许新建线程");
      return;
    }
    createThread().catch((error) => {
      setStatus(`新建失败: ${asMessage(error)}`);
    });
  });

  elements.threadSearch.addEventListener("input", debounce(() => {
    loadThreads({ preserveSelection: true }).catch((error) => {
      setStatus(`搜索失败: ${asMessage(error)}`);
    });
  }, 250));
  elements.sourceFilter.addEventListener("change", () => {
    loadThreads({ preserveSelection: true }).catch((error) => {
      setStatus(`筛选失败: ${asMessage(error)}`);
    });
  });
  elements.archivedToggle.addEventListener("change", () => {
    loadThreads({ preserveSelection: true }).catch((error) => {
      setStatus(`筛选失败: ${asMessage(error)}`);
    });
  });
  elements.desktopCompatibleToggle.addEventListener("change", () => {
    state.desktopCompatibleMode = Boolean(elements.desktopCompatibleToggle.checked);
    localStorage.setItem(
      storageKeys.desktopCompatibleMode,
      state.desktopCompatibleMode ? "1" : "0"
    );
    renderCurrentThread();
    loadThreads({ preserveSelection: true, silent: true }).catch(() => {
      // noop
    });
  });
  if (elements.unlockThreadBtn) {
    elements.unlockThreadBtn.addEventListener("click", () => {
      if (!state.lockedThreadId) return;
      state.lockedThreadId = null;
      localStorage.removeItem(storageKeys.lockedThreadId);
      applyLockedThreadUi();
      void connectEventSource();
      loadThreads({ preserveSelection: true }).catch((error) => {
        setStatus(`解除锁定后加载失败: ${asMessage(error)}`);
      });
      setStatus("已解除单线程锁定");
    });
  }
  if (elements.chat) {
    elements.chat.addEventListener("scroll", () => {
      state.chatScrollLocked = !isChatNearBottom(80);
    });
  }

  elements.threadList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const actionElement = target.closest("[data-action]");
    const threadElement = target.closest("[data-thread-id]");
    const action = (actionElement && actionElement.dataset.action) || "open";
    if (action === "toggle-project") {
      const encoded =
        (actionElement && actionElement.dataset.projectKey) || "";
      const key = decodeURIComponent(encoded);
      if (!key) return;
      if (state.expandedProjectKey === key) {
        state.expandedProjectKey = null;
        state.projectCollapsedByUser = true;
      } else {
        state.expandedProjectKey = key;
        state.projectCollapsedByUser = false;
      }
      renderThreadList();
      return;
    }

    const threadId =
      (actionElement && actionElement.dataset.threadId) ||
      (threadElement && threadElement.dataset.threadId) ||
      "";
    if (!threadId) return;
    if (action === "open") {
      selectThread(threadId).catch((error) => {
        setStatus(`打开 thread 失败: ${asMessage(error)}`);
      });
      return;
    }
    if (action === "rename") {
      renameThread(threadId).catch((error) => {
        setStatus(`重命名失败: ${asMessage(error)}`);
      });
      return;
    }
    if (action === "archive") {
      archiveThread(threadId).catch((error) => {
        setStatus(`归档失败: ${asMessage(error)}`);
      });
      return;
    }
    if (action === "unarchive") {
      unarchiveThread(threadId).catch((error) => {
        setStatus(`取消归档失败: ${asMessage(error)}`);
      });
      return;
    }
    if (action === "fork") {
      forkThread(threadId).catch((error) => {
        setStatus(`Fork 失败: ${asMessage(error)}`);
      });
    }
  });

  elements.pickImageBtn.addEventListener("click", () => {
    elements.imagePicker.click();
  });
  elements.imagePicker.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.files) return;
    uploadImages(Array.from(input.files)).catch((error) => {
      setStatus(`图片上传失败: ${asMessage(error)}`);
    });
  });

  elements.voiceBtn.addEventListener("click", () => {
    toggleVoiceRecording().catch((error) => {
      setStatus(`语音失败: ${asMessage(error)}`);
    });
  });

  elements.pendingImages.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const mediaId = target.dataset.removeMediaId;
    if (!mediaId) return;
    state.pendingImages = state.pendingImages.filter((item) => item.mediaId !== mediaId);
    renderPendingImages();
  });

  elements.pendingVoice.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.action === "clear-voice") {
      state.pendingVoice = null;
      renderPendingVoice();
    }
  });
  elements.pendingVoice.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement)) return;
    if (!state.pendingVoice) return;
    state.pendingVoice.transcript = target.value;
  });

  elements.approvalList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const requestId = target.dataset.requestId;
    const decision = target.dataset.decision;
    if (!requestId || !decision) return;
    submitApproval(requestId, decision).catch((error) => {
      setStatus(`审批提交失败: ${asMessage(error)}`);
    });
  });

  elements.composer.addEventListener("submit", (event) => {
    event.preventDefault();
    sendCurrentMessage().catch((error) => {
      setStatus(`发送失败: ${asMessage(error)}`);
    });
  });
}

function applyQueryBootstrap() {
  const params = new URLSearchParams(window.location.search);
  const base = params.get("base");
  const token = params.get("token");
  const pairingMode = params.get("pairing") === "1";
  const pairingId = (params.get("pairingId") || "").trim();
  const pairingCode = (params.get("pairingCode") || params.get("code") || "").trim();
  const pairingAuto =
    params.get("autoPair") === "1" || params.get("autopair") === "1";
  const threadId = params.get("threadId") || params.get("thread") || "";
  const lockThreadId = params.get("lockThreadId") || "";
  const lockMode = params.get("lock") === "1";
  const unlockThread = params.get("unlockThread");
  let changed = false;

  if (base && base.trim()) {
    localStorage.setItem(storageKeys.baseUrl, normalizeBaseUrl(base));
    changed = true;
  }
  if (token && token.trim()) {
    localStorage.setItem(storageKeys.token, token.trim());
    changed = true;
  }
  if (pairingMode || pairingId || pairingCode) {
    if (pairingMode || pairingId || pairingCode) {
      sessionStorage.setItem(storageKeys.pairingMode, "1");
      changed = true;
    }
    if (pairingId) {
      sessionStorage.setItem(storageKeys.pairingId, pairingId);
      changed = true;
    }
    if (pairingCode) {
      sessionStorage.setItem(storageKeys.pairingCode, pairingCode);
      changed = true;
    } else {
      sessionStorage.removeItem(storageKeys.pairingCode);
      changed = true;
    }
    if (pairingAuto) {
      sessionStorage.setItem(storageKeys.pairingAuto, "1");
      changed = true;
    } else {
      sessionStorage.removeItem(storageKeys.pairingAuto);
      changed = true;
    }
  }
  const currentLocked = String(localStorage.getItem(storageKeys.lockedThreadId) || "").trim();
  const resolvedLockThreadId = lockThreadId.trim() || (lockMode ? threadId.trim() : "");
  if (unlockThread === "1" || !resolvedLockThreadId) {
    if (currentLocked) {
      localStorage.removeItem(storageKeys.lockedThreadId);
      changed = true;
    }
  } else if (currentLocked !== resolvedLockThreadId) {
    localStorage.setItem(storageKeys.lockedThreadId, resolvedLockThreadId);
    changed = true;
  }

  if (threadId && threadId.trim() && !resolvedLockThreadId) {
    sessionStorage.setItem(storageKeys.initialThreadId, threadId.trim());
    changed = true;
  }
  if (changed) {
    const clean = `${window.location.origin}${window.location.pathname}`;
    window.history.replaceState(null, "", clean);
  }
}

function getPairingModeFlag() {
  return String(sessionStorage.getItem(storageKeys.pairingMode) || "").trim() === "1";
}

function clearPairingModeFlag() {
  sessionStorage.removeItem(storageKeys.pairingMode);
  state.pairing.active = false;
}

function getPairingAutoFlag() {
  return String(sessionStorage.getItem(storageKeys.pairingAuto) || "").trim() === "1";
}

function clearPairingAutoFlag() {
  sessionStorage.removeItem(storageKeys.pairingAuto);
  state.pairing.auto = false;
}

function getPendingPairingId() {
  return String(sessionStorage.getItem(storageKeys.pairingId) || "").trim();
}

function setPendingPairingId(pairingId) {
  const clean = String(pairingId || "").trim();
  if (!clean) {
    sessionStorage.removeItem(storageKeys.pairingId);
  } else {
    sessionStorage.setItem(storageKeys.pairingId, clean);
  }
  state.pairing.pairingId = clean;
}

function getPendingPairingCode() {
  return String(sessionStorage.getItem(storageKeys.pairingCode) || "").trim();
}

function setPendingPairingCode(code) {
  const clean = String(code || "").trim();
  if (!clean) {
    sessionStorage.removeItem(storageKeys.pairingCode);
  } else {
    sessionStorage.setItem(storageKeys.pairingCode, clean);
  }
  state.pairing.pairingCode = clean;
}

function getInitialThreadId() {
  return String(sessionStorage.getItem(storageKeys.initialThreadId) || "").trim();
}

function clearInitialThreadId() {
  sessionStorage.removeItem(storageKeys.initialThreadId);
  state.initialThreadId = null;
}

function getLockedThreadId() {
  return String(localStorage.getItem(storageKeys.lockedThreadId) || "").trim();
}

function getDesktopCompatibleMode() {
  const raw = String(localStorage.getItem(storageKeys.desktopCompatibleMode) || "").trim();
  if (!raw) return true;
  return raw !== "0" && raw.toLowerCase() !== "false";
}

function applyLockedThreadUi() {
  const locked = Boolean(state.lockedThreadId);
  elements.newThreadBtn.disabled = locked;
  elements.threadSearch.disabled = locked;
  elements.sourceFilter.disabled = locked;
  elements.archivedToggle.disabled = locked;
  if (elements.lockBanner) {
    elements.lockBanner.hidden = !locked;
  }
  if (elements.lockBannerText) {
    elements.lockBannerText.textContent = locked
      ? `当前仅显示锁定线程 ${state.lockedThreadId.slice(0, 8)}...；点击下方可恢复全部 project。`
      : "";
  }
}

function renderPairingBanner(forceShow = false) {
  if (!elements.pairingBanner) return;
  const needsPairing = forceShow || !hasBoundDevice();
  elements.pairingBanner.classList.toggle("hidden", !needsPairing);
}

function setPairingStatus(text, isError = false) {
  if (!elements.pairingStatus) return;
  elements.pairingStatus.textContent = String(text || "");
  elements.pairingStatus.style.color = isError ? "#ad3412" : "";
}

function showPairingDialog(options = {}) {
  if (!elements.pairingDialog) return;
  const pairingId =
    String(options.pairingId || "").trim() || getPendingPairingId() || "";
  const pairingCode =
    String(options.pairingCode || "").trim() || getPendingPairingCode() || "";
  if (elements.pairingId) {
    elements.pairingId.value = pairingId;
  }
  if (elements.pairingCode) {
    elements.pairingCode.value = pairingCode;
  }
  if (pairingId) {
    setPendingPairingId(pairingId);
  }
  if (pairingCode) {
    setPendingPairingCode(pairingCode);
  }
  if (options.message) {
    setPairingStatus(options.message, false);
  } else {
    setPairingStatus("");
  }
  if (!elements.pairingDialog.open) {
    elements.pairingDialog.showModal();
  }
}

async function submitPairingForm() {
  const pairingId = String(elements.pairingId ? elements.pairingId.value : "")
    .trim();
  const code = String(elements.pairingCode ? elements.pairingCode.value : "")
    .trim();
  const deviceName = String(
    elements.pairingDeviceName ? elements.pairingDeviceName.value : ""
  ).trim();
  if (!pairingId) {
    throw new Error("Pairing ID 不能为空");
  }
  if (!code) {
    throw new Error("验证码不能为空");
  }
  if (elements.pairingDeviceName) {
    const finalName = deviceName || inferDefaultDeviceName();
    elements.pairingDeviceName.value = finalName;
  }
  await completePairing({
    pairingId,
    code,
    deviceName: deviceName || inferDefaultDeviceName(),
    closeDialog: true,
    showStatus: true,
  });
}

async function completePairing(options = {}) {
  const pairingId = String(options.pairingId || "").trim();
  const code = String(options.code || "").trim();
  const deviceName = String(options.deviceName || inferDefaultDeviceName()).trim() || inferDefaultDeviceName();
  const closeDialog = options.closeDialog !== false;
  const showStatus = options.showStatus !== false;

  if (!pairingId) throw new Error("Pairing ID 不能为空");
  if (!code) throw new Error("验证码不能为空");
  if (showStatus) {
    setPairingStatus("配对中...");
  }
  const result = await apiFetchJson("/api/v3/pairing/complete", {
    method: "POST",
    body: {
      pairingId,
      code,
      deviceName,
    },
    authMode: "none",
  });
  setDeviceCredentials({
    deviceId: result.deviceId,
    deviceSecret: result.deviceSecret,
    deviceName,
  });
  setPendingPairingId("");
  setPendingPairingCode("");
  clearPairingModeFlag();
  clearPairingAutoFlag();
  state.pairing.autoTried = true;
  if (elements.pairingCode) {
    elements.pairingCode.value = "";
  }
  if (showStatus) {
    setPairingStatus("配对成功，正在重连...");
  }
  if (closeDialog && elements.pairingDialog && elements.pairingDialog.open) {
    elements.pairingDialog.close();
  }
  renderPairingBanner(false);
  disconnectEventSource();
  await bootstrap();
}

async function maybeAutoCompletePairing() {
  if (hasBoundDevice()) return false;
  if (state.pairing.autoTried) return false;
  const pairingId = getPendingPairingId();
  const pairingCode = getPendingPairingCode();
  const autoFlag = getPairingAutoFlag();
  if (!pairingId || !pairingCode || !autoFlag) return false;

  state.pairing.autoTried = true;
  try {
    setStatus("检测到配对二维码，自动绑定中...");
    await completePairing({
      pairingId,
      code: pairingCode,
      deviceName: getStoredDeviceName() || inferDefaultDeviceName(),
      closeDialog: true,
      showStatus: false,
    });
    return true;
  } catch (error) {
    setStatus(`自动配对失败: ${asMessage(error)}`);
    return false;
  }
}

function migrateLegacySettings() {
  const hasNewToken = Boolean(localStorage.getItem(storageKeys.token));
  const hasNewBase = Boolean(localStorage.getItem(storageKeys.baseUrl));
  const oldToken = localStorage.getItem(legacyStorageKeys.token) || "";
  const oldBase = localStorage.getItem(legacyStorageKeys.baseUrl) || "";

  if (!hasNewToken && oldToken) {
    localStorage.setItem(storageKeys.token, oldToken);
  }
  if (!hasNewBase && oldBase) {
    localStorage.setItem(storageKeys.baseUrl, normalizeBaseUrl(oldBase));
  }
}

function startPolling() {
  if (state.listPollTimer) clearInterval(state.listPollTimer);
  state.listPollTimer = setInterval(() => {
    loadThreads({ preserveSelection: true, silent: true }).catch(() => {
      // noop
    });
  }, 8000);
  scheduleThreadPoll();
}

function scheduleThreadPoll() {
  if (state.threadPollTimer) clearTimeout(state.threadPollTimer);
  if (!state.selectedThreadId || !state.selectedThread) return;

  const hasInProgress = threadHasInProgress(state.selectedThread);
  const delay = hasInProgress ? 2000 : 10000;
  state.threadPollTimer = setTimeout(async () => {
    if (!state.selectedThreadId) return;
    try {
      await loadCurrentThread(state.selectedThreadId, { silent: true });
    } catch (_error) {
      // noop
    } finally {
      scheduleThreadPoll();
    }
  }, delay);
}

function queueThreadRefresh(delay = 350) {
  if (state.threadRefreshTimer) clearTimeout(state.threadRefreshTimer);
  state.threadRefreshTimer = setTimeout(() => {
    if (!state.selectedThreadId) return;
    loadCurrentThread(state.selectedThreadId, { silent: true }).catch(() => {
      // noop
    });
  }, delay);
}

async function connectEventSource() {
  disconnectEventSource();
  const base = getBaseUrl();
  const qs = new URLSearchParams();
  const watchThreadId = state.selectedThreadId || state.lockedThreadId;
  if (watchThreadId) {
    qs.set("threadId", watchThreadId);
  }
  let eventUrl = `${base}/api/v2/events`;
  if (hasBoundDevice()) {
    const signed = await buildSignedQueryAuth({
      method: "GET",
      pathname: "/api/v2/events",
      query: qs,
      body: "",
    });
    qs.set("deviceId", signed.deviceId);
    qs.set("ts", signed.timestamp);
    qs.set("nonce", signed.nonce);
    qs.set("sig", signed.signature);
  } else {
    const token = getToken();
    if (!token) return;
    qs.set("token", token);
  }
  if (qs.toString()) {
    eventUrl += `?${qs.toString()}`;
  }
  const es = new EventSource(eventUrl);
  state.eventSource = es;

  es.addEventListener("open", () => {
    setStatus("已连接（SSE）");
  });
  es.addEventListener("error", () => {
    setStatus("SSE 连接波动，自动重连中...");
  });
  es.addEventListener("sync", (event) => {
    const payload = parseSse(event);
    if (!payload) return;
    if (payload.status === "reconnecting") {
      setStatus(`重连中 (attempt=${payload.info && payload.info.attempt ? payload.info.attempt : "?"})`);
      return;
    }
    if (payload.status === "ready") {
      setStatus("在线");
      return;
    }
    if (payload.status) {
      setStatus(`同步状态: ${payload.status}`);
    }
  });
  es.addEventListener("approvals", (event) => {
    const payload = parseSse(event);
    if (!payload || !Array.isArray(payload.items)) return;
    state.pendingApprovals = payload.items;
    renderApprovals();
  });
  es.addEventListener("approval-required", (event) => {
    const payload = parseSse(event);
    if (!payload) return;
    upsertPendingApproval(payload);
    renderApprovals();
  });
  es.addEventListener("approval-resolved", (event) => {
    const payload = parseSse(event);
    if (!payload) return;
    state.pendingApprovals = state.pendingApprovals.filter(
      (item) => String(item.id) !== String(payload.id)
    );
    renderApprovals();
  });
  es.addEventListener("approval-pending-reminder", (event) => {
    const payload = parseSse(event);
    if (!payload) return;
    setStatus(`审批待处理: ${payload.method}`);
  });
  es.addEventListener("thread-list-updated", () => {
    loadThreads({ preserveSelection: true, silent: true }).catch(() => {
      // noop
    });
  });
  es.addEventListener("thread-updated", (event) => {
    const payload = parseSse(event);
    if (!payload || !payload.thread) return;
    if (state.selectedThreadId && payload.thread.id === state.selectedThreadId) {
      state.selectedThread = payload.thread;
      state.liveDeltas.clear();
      renderCurrentThread();
      state.selectedThreadUsage =
        state.threadUsageById.get(state.selectedThreadId) || null;
      renderContextUsage();
      scheduleThreadPoll();
    }
  });
  es.addEventListener("rpc-notification", (event) => {
    const payload = parseSse(event);
    if (!payload) return;
    handleRpcNotification(payload);
  });
  es.addEventListener("error", (event) => {
    const payload = parseSse(event);
    if (!payload || !payload.message) return;
    setStatus(`错误: ${payload.message}`);
  });
}

function disconnectEventSource() {
  if (!state.eventSource) return;
  try {
    state.eventSource.close();
  } catch (_error) {
    // noop
  }
  state.eventSource = null;
}

function handleRpcNotification(payload) {
  const method = payload.method;
  const params = payload.params || {};
  if (method === "thread/tokenUsage/updated") {
    const threadId = String(params.threadId || "");
    if (!threadId) return;
    const usage = normalizeTokenUsage(params.tokenUsage || params);
    state.threadUsageById.set(threadId, usage);
    if (threadId === state.selectedThreadId) {
      state.selectedThreadUsage = usage;
      renderContextUsage();
    }
    return;
  }

  if (method === "item/agentMessage/delta") {
    if (params.threadId !== state.selectedThreadId) return;
    const itemId = params.itemId || "live";
    const prev = state.liveDeltas.get(itemId) || "";
    state.liveDeltas.set(itemId, prev + String(params.delta || ""));
    renderLiveDeltas();
    return;
  }

  if (
    method === "turn/started" ||
    method === "turn/completed" ||
    method === "turn/interrupted" ||
    method === "item/started" ||
    method === "item/completed" ||
    method === "item/commandExecution/outputDelta" ||
    method === "item/fileChange/outputDelta"
  ) {
    if (params.threadId === state.selectedThreadId) {
      queueThreadRefresh(300);
    }
    return;
  }

  if (method === "thread/started" || method === "thread/name/updated") {
    loadThreads({ preserveSelection: true, silent: true }).catch(() => {
      // noop
    });
  }
}

async function loadThreads(options = {}) {
  if (state.loadingThreads) return;
  state.loadingThreads = true;
  const preserveSelection = options.preserveSelection !== false;
  const silent = Boolean(options.silent);
  try {
    const includeArchived = Boolean(elements.archivedToggle.checked);
    const commonParams = new URLSearchParams();
    commonParams.set("limit", "100");
    if (!state.lockedThreadId) {
      const query = elements.threadSearch.value.trim();
      if (query) commonParams.set("query", query);
      const source = elements.sourceFilter.value.trim();
      if (source) {
        commonParams.set("sourceKinds", source);
      } else if (state.desktopCompatibleMode) {
        commonParams.set("sourceKinds", DESKTOP_COMPAT_SOURCE_KINDS.join(","));
      }
    }

    const fetchThreads = async (archivedFlag) => {
      const params = new URLSearchParams(commonParams);
      params.set("archived", String(Boolean(archivedFlag)));
      const data = await apiFetchJson(`/api/v2/threads?${params.toString()}`);
      const threads = Array.isArray(data.data) ? data.data : [];
      for (const item of threads) {
        if (item && typeof item === "object") {
          item.archived = Boolean(archivedFlag);
        }
      }
      return threads;
    };

    let threads = await fetchThreads(false);
    if (includeArchived) {
      const archivedThreads = await fetchThreads(true);
      const seen = new Set(threads.map((t) => String(t && t.id ? t.id : "")));
      for (const item of archivedThreads) {
        const key = String(item && item.id ? item.id : "");
        if (!key || seen.has(key)) continue;
        seen.add(key);
        threads.push(item);
      }
      threads.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    }

    state.threads = threads;
    if (state.lockedThreadId) {
      let lockedThread =
        state.threads.find((item) => item.id === state.lockedThreadId) || null;
      if (!lockedThread) {
        try {
          const lockedData = await apiFetchJson(
            `/api/v2/threads/${encodeURIComponent(
              state.lockedThreadId
            )}?includeTurns=false`
          );
          lockedThread = lockedData.thread || null;
        } catch (_error) {
          lockedThread = null;
        }
      }
      state.threads = lockedThread ? [lockedThread] : [];
    }
    state.projects = groupThreadsByProject(state.threads);

    if (
      state.expandedProjectKey &&
      !state.projects.some((item) => item.key === state.expandedProjectKey)
    ) {
      state.expandedProjectKey = null;
      state.projectCollapsedByUser = false;
    }
    if (!state.expandedProjectKey && state.selectedThreadId && !state.projectCollapsedByUser) {
      const selected = state.threads.find((item) => item.id === state.selectedThreadId);
      if (selected) {
        state.expandedProjectKey = getProjectKey(selected);
      }
    }

    if (preserveSelection && state.selectedThreadId) {
      const exists = state.threads.some((item) => item.id === state.selectedThreadId);
      if (!exists && state.threads.length > 0) {
        await selectThread(state.threads[0].id);
      } else if (!exists && state.threads.length === 0) {
        state.selectedThreadId = null;
        state.selectedThread = null;
        state.selectedThreadUsage = null;
        renderCurrentThread();
      }
    } else if (!state.selectedThreadId && state.threads.length > 0) {
      await selectThread(state.threads[0].id);
    }

    if (!silent) {
      setStatus(`Threads: ${state.threads.length}`);
    }
    renderThreadList();
  } finally {
    state.loadingThreads = false;
  }
}

async function selectThread(threadId) {
  if (state.lockedThreadId && String(threadId) !== state.lockedThreadId) {
    setStatus(`已锁定线程 ${state.lockedThreadId.slice(0, 8)}...`);
    return;
  }
  state.selectedThreadId = String(threadId);
  const thread = state.threads.find((item) => item.id === state.selectedThreadId);
  if (thread && !state.projectCollapsedByUser) {
    state.expandedProjectKey = getProjectKey(thread);
  }
  state.selectedThreadUsage = state.threadUsageById.get(state.selectedThreadId) || null;
  state.liveDeltas.clear();
  state.forceScrollToBottom = true;
  state.chatScrollLocked = false;
  renderThreadList();
  renderContextUsage();
  await loadCurrentThread(state.selectedThreadId, { silent: false });
  await connectEventSource();
  elements.sidebar.classList.remove("open");
  elements.backdrop.classList.remove("show");
}

async function loadCurrentThread(threadId, options = {}) {
  if (!threadId) return;
  const loadSeq = ++state.threadLoadSeq;
  state.loadingThread = true;
  const silent = Boolean(options.silent);
  try {
    const data = await apiFetchJson(
      `/api/v2/threads/${encodeURIComponent(threadId)}?includeTurns=true`
    );
    if (loadSeq !== state.threadLoadSeq) {
      return;
    }
    state.selectedThread = data.thread;
    // thread/read may omit archived state; keep it consistent with the list view.
    const cached = state.threads.find((item) => item && item.id === String(threadId));
    if (cached && typeof cached.archived === "boolean" && state.selectedThread) {
      state.selectedThread.archived = cached.archived;
    }
    if (data.usage) {
      const normalizedUsage = normalizeTokenUsage(data.usage);
      state.threadUsageById.set(String(threadId), normalizedUsage);
      state.selectedThreadUsage = normalizedUsage;
    } else {
      state.selectedThreadUsage = state.threadUsageById.get(String(threadId)) || null;
    }
    state.liveDeltas.clear();
    renderCurrentThread();
    renderContextUsage();
    if (!silent) {
      const turnCount = Array.isArray(data.thread && data.thread.turns)
        ? data.thread.turns.length
        : 0;
      setStatus(`已加载 thread ${threadId.slice(0, 8)}... · turns ${turnCount}`);
    }
    scheduleThreadPoll();
  } finally {
    if (loadSeq === state.threadLoadSeq) {
      state.loadingThread = false;
    }
  }
}

function renderThreadList() {
  elements.threadList.innerHTML = "";
  const projects = state.projects && state.projects.length > 0 ? state.projects : groupThreadsByProject(state.threads);
  if (projects.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "没有可显示的 threads。";
    elements.threadList.append(empty);
    return;
  }
  if (
    state.expandedProjectKey &&
    !projects.some((p) => p.key === state.expandedProjectKey)
  ) {
    state.expandedProjectKey = null;
    state.projectCollapsedByUser = false;
  }
  if (!state.expandedProjectKey && state.selectedThreadId && !state.projectCollapsedByUser) {
    const selected = state.threads.find((item) => item.id === state.selectedThreadId);
    if (selected) {
      state.expandedProjectKey = getProjectKey(selected);
    }
  }

  for (const project of projects) {
    const group = document.createElement("section");
    group.className = "project-group";
    const expanded = project.key === state.expandedProjectKey;
    if (expanded) {
      group.classList.add("expanded");
    }

    const header = document.createElement("button");
    header.type = "button";
    header.className = "project-header";
    header.dataset.action = "toggle-project";
    header.dataset.projectKey = encodeURIComponent(project.key);
    header.setAttribute("aria-expanded", expanded ? "true" : "false");
    header.innerHTML = [
      `<span class="project-main"><span class="project-title">${escapeHtml(project.name)}</span><span class="project-count">${project.threads.length} threads</span></span>`,
      `<span class="project-caret">${expanded ? "▾" : "▸"}</span>`,
    ].join("");
    group.append(header);

    const pathMeta = document.createElement("div");
    pathMeta.className = "project-path";
    pathMeta.textContent = project.key;
    group.append(pathMeta);

    if (expanded) {
      const list = document.createElement("div");
      list.className = "project-thread-list";
      for (const thread of project.threads) {
        const row = document.createElement("article");
        row.className = "thread-item";
        row.dataset.threadId = thread.id;
        row.dataset.action = "open";
        if (thread.id === state.selectedThreadId) {
          row.classList.add("active");
        }

        const open = document.createElement("button");
        open.className = "thread-open";
        open.dataset.threadId = thread.id;
        open.dataset.action = "open";

        const title = document.createElement("div");
        title.className = "thread-preview";
        title.textContent = thread.preview || "(空线程)";

        const meta = document.createElement("div");
        meta.className = "thread-meta";
        const metaParts = [
          thread.id.slice(0, 8),
          thread.source || "unknown",
          thread.modelProvider || "openai",
          formatThreadTime(thread.updatedAt),
        ];
        if (thread.archived) {
          metaParts.push("已归档");
        }
        meta.textContent = metaParts.join(" · ");
        open.append(title, meta);

        if (!state.lockedThreadId) {
          const actions = document.createElement("div");
          actions.className = "thread-actions";
          actions.append(
            actionButton("改名", "rename", thread.id),
            actionButton(
              thread.archived ? "取消归档" : "归档",
              thread.archived ? "unarchive" : "archive",
              thread.id
            ),
            actionButton("Fork", "fork", thread.id)
          );
          row.append(open, actions);
        } else {
          row.append(open);
        }
        list.append(row);
      }
      group.append(list);
    }

    elements.threadList.append(group);
  }
}

function actionButton(label, action, threadId) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn mini ghost";
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.threadId = threadId;
  return button;
}

function renderCurrentThread() {
  const thread = state.selectedThread;
  const viewport = captureChatViewport();
  const forceBottom = Boolean(state.forceScrollToBottom);
  const shouldStickBottom =
    forceBottom || (!state.chatScrollLocked && viewport.nearBottom);
  elements.chat.innerHTML = "";
  if (!thread) {
    elements.threadTitle.textContent = "请选择一个 Thread";
    elements.threadMeta.textContent = "";
    state.selectedThreadUsage = null;
    renderContextUsage();
    state.forceScrollToBottom = false;
    return;
  }

  elements.threadTitle.textContent = thread.preview
    ? thread.preview.slice(0, 56)
    : `Thread ${thread.id.slice(0, 8)}`;
  const turnCount = Array.isArray(thread.turns) ? thread.turns.length : 0;
  const source = thread.source || "unknown";
  const sourceHint =
    state.desktopCompatibleMode && source === "exec"
      ? " · (桌面端可能不显示 exec 来源线程)"
      : "";
  const archivedHint = thread.archived ? " · 已归档" : "";
  elements.threadMeta.textContent = `${source} · ${thread.cwd || "-"} · ${
    thread.id
  } · turns ${turnCount}${sourceHint}${archivedHint}`;
  renderContextUsage();

  const turns = Array.isArray(thread.turns) ? thread.turns : [];
  if (turns.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "该 Thread 还没有对话内容。";
    elements.chat.append(empty);
    restoreChatViewport(viewport, shouldStickBottom);
    if (shouldStickBottom) {
      state.chatScrollLocked = false;
    }
    state.forceScrollToBottom = false;
    return;
  }

  for (const turn of turns) {
    const turnWrap = document.createElement("section");
    turnWrap.className = "turn";
    const turnHeader = document.createElement("header");
    turnHeader.className = "turn-header";
    turnHeader.textContent = `Turn ${turn.id} · ${turn.status}`;
    turnWrap.append(turnHeader);

    const normalized = normalizeTurnItemsForDisplay(turn.items);
    for (const item of normalized.items) {
      turnWrap.append(renderThreadItem(item));
    }
    if (normalized.hiddenAgentCount > 0) {
      const hint = document.createElement("div");
      hint.className = "turn-hint";
      hint.textContent = `已隐藏过程更新 ${normalized.hiddenAgentCount} 条（桌面一致视图）`;
      turnWrap.append(hint);
    }

    if (turn.error) {
      const error = document.createElement("pre");
      error.className = "item error";
      error.textContent = JSON.stringify(turn.error, null, 2);
      turnWrap.append(error);
    }

    elements.chat.append(turnWrap);
  }

  renderLiveDeltas({ shouldAutoScroll: shouldStickBottom });
  restoreChatViewport(viewport, shouldStickBottom);
  if (shouldStickBottom) {
    state.chatScrollLocked = false;
  }
  state.forceScrollToBottom = false;
}

function renderThreadItem(item) {
  if (item.type === "userMessage") {
    const box = document.createElement("article");
    box.className = "item msg user";
    const contentList = Array.isArray(item.content) ? item.content : [];
    for (const c of contentList) {
      if (c.type === "text") {
        const p = document.createElement("p");
        p.className = "text";
        p.textContent = c.text || "";
        box.append(p);
      } else if (c.type === "image") {
        box.append(renderImage(c.url, "image"));
      } else if (c.type === "localImage") {
        box.append(renderImage(c.mediaUrl || "", c.path || "local image"));
      }
    }
    return box;
  }

  if (item.type === "agentMessage") {
    const box = document.createElement("article");
    box.className = "item msg assistant";
    const p = document.createElement("p");
    p.className = "text";
    p.textContent = item.text || "";
    box.append(p);
    return box;
  }

  if (item.type === "reasoning" || item.type === "plan") {
    const details = document.createElement("details");
    details.className = "item details";
    const summary = document.createElement("summary");
    summary.textContent = item.type === "reasoning" ? "Reasoning" : "Plan";
    const pre = document.createElement("pre");
    if (item.type === "reasoning") {
      pre.textContent = [
        ...(Array.isArray(item.summary) ? item.summary : []),
        "",
        ...(Array.isArray(item.content) ? item.content : []),
      ].join("\n");
    } else {
      pre.textContent = item.text || "";
    }
    details.append(summary, pre);
    return details;
  }

  if (item.type === "commandExecution") {
    const details = document.createElement("details");
    details.className = "item details";
    const summary = document.createElement("summary");
    summary.textContent = `Command · ${item.status}`;
    const pre = document.createElement("pre");
    pre.textContent = [
      `cwd: ${item.cwd || "-"}`,
      `command: ${item.command || "-"}`,
      "",
      item.aggregatedOutput || "(no output)",
    ].join("\n");
    details.append(summary, pre);
    return details;
  }

  if (item.type === "fileChange") {
    const details = document.createElement("details");
    details.className = "item details";
    const summary = document.createElement("summary");
    summary.textContent = `File Change · ${item.status}`;
    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(item.changes || [], null, 2);
    details.append(summary, pre);
    return details;
  }

  if (item.type === "imageView") {
    const box = document.createElement("article");
    box.className = "item msg assistant";
    box.append(renderImage(item.mediaUrl || "", item.path || "image view"));
    return box;
  }

  const fallback = document.createElement("details");
  fallback.className = "item details";
  const summary = document.createElement("summary");
  summary.textContent = item.type || "item";
  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify(item, null, 2);
  fallback.append(summary, pre);
  return fallback;
}

function renderImage(src, alt) {
  const wrap = document.createElement("div");
  wrap.className = "image-wrap";
  if (!src) {
    const p = document.createElement("p");
    p.className = "dim";
    p.textContent = `无法显示图片: ${alt}`;
    wrap.append(p);
    return wrap;
  }
  const img = document.createElement("img");
  img.loading = "lazy";
  img.src = src;
  img.alt = alt || "image";
  wrap.append(img);
  return wrap;
}

function renderLiveDeltas(options = {}) {
  const existing = elements.chat.querySelector(".live-delta");
  if (existing) existing.remove();
  if (state.liveDeltas.size === 0) return;
  const shouldAutoScroll = Boolean(
    options.shouldAutoScroll !== undefined
      ? options.shouldAutoScroll
      : !state.chatScrollLocked && isChatNearBottom()
  );
  const section = document.createElement("section");
  section.className = "live-delta";
  const text = [...state.liveDeltas.values()].join("");
  if (!text.trim()) return;
  const title = document.createElement("header");
  title.textContent = "Assistant (实时输出)";
  const pre = document.createElement("pre");
  pre.textContent = text;
  section.append(title, pre);
  elements.chat.append(section);
  if (shouldAutoScroll) {
    elements.chat.scrollTop = elements.chat.scrollHeight;
  }
}

function isChatNearBottom(threshold = 36) {
  const maxScrollTop = elements.chat.scrollHeight - elements.chat.clientHeight;
  if (maxScrollTop <= 0) return true;
  return maxScrollTop - elements.chat.scrollTop <= threshold;
}

function captureChatViewport() {
  return {
    scrollTop: elements.chat.scrollTop,
    nearBottom: isChatNearBottom(),
  };
}

function restoreChatViewport(viewport, forceBottom = false) {
  if (!viewport) return;
  if (forceBottom) {
    elements.chat.scrollTop = elements.chat.scrollHeight;
    return;
  }
  const maxScrollTop = Math.max(0, elements.chat.scrollHeight - elements.chat.clientHeight);
  elements.chat.scrollTop = Math.min(viewport.scrollTop, maxScrollTop);
}

async function loadPendingApprovals() {
  const data = await apiFetchJson("/api/v2/approvals");
  state.pendingApprovals = Array.isArray(data.items) ? data.items : [];
  renderApprovals();
}

function upsertPendingApproval(payload) {
  const idx = state.pendingApprovals.findIndex(
    (item) => String(item.id) === String(payload.id)
  );
  if (idx >= 0) {
    state.pendingApprovals[idx] = payload;
  } else {
    state.pendingApprovals.push(payload);
  }
}

function renderApprovals() {
  elements.approvalList.innerHTML = "";
  if (state.pendingApprovals.length === 0) {
    elements.approvalsPanel.classList.add("hidden");
    return;
  }
  elements.approvalsPanel.classList.remove("hidden");

  for (const item of state.pendingApprovals) {
    const card = document.createElement("article");
    card.className = "approval-card";
    const title = document.createElement("h4");
    title.textContent = item.method;
    const meta = document.createElement("pre");
    meta.textContent = JSON.stringify(item.params || {}, null, 2);

    const actions = document.createElement("div");
    actions.className = "approval-actions";

    if (item.method === "item/commandExecution/requestApproval") {
      actions.append(
        approvalButton("接受", "accept", item.id),
        approvalButton("会话放行", "acceptForSession", item.id),
        approvalButton("拒绝", "decline", item.id),
        approvalButton("取消", "cancel", item.id)
      );
    } else if (item.method === "item/fileChange/requestApproval") {
      actions.append(
        approvalButton("接受", "accept", item.id),
        approvalButton("会话放行", "acceptForSession", item.id),
        approvalButton("拒绝", "decline", item.id),
        approvalButton("取消", "cancel", item.id)
      );
    } else if (item.method === "item/tool/requestUserInput") {
      actions.append(approvalButton("取消", "cancel", item.id));
    } else {
      actions.append(approvalButton("取消", "cancel", item.id));
    }

    card.append(title, meta, actions);
    elements.approvalList.append(card);
  }
}

function approvalButton(label, decision, requestId) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn mini";
  btn.textContent = label;
  btn.dataset.requestId = requestId;
  btn.dataset.decision = decision;
  return btn;
}

async function submitApproval(requestId, decision) {
  await apiFetchJson(`/api/v2/approvals/${encodeURIComponent(requestId)}`, {
    method: "POST",
    body: {
      decision,
    },
  });
  state.pendingApprovals = state.pendingApprovals.filter(
    (item) => String(item.id) !== String(requestId)
  );
  renderApprovals();
  setStatus(`审批已提交: ${decision}`);
}

async function createThread() {
  if (state.lockedThreadId) {
    setStatus("已锁定单线程，不允许新建线程");
    return;
  }
  // Prefer creating the thread within the currently expanded/selected project.
  // Otherwise Codex may default to "/" and the new thread becomes hard to find.
  const preferredCwd = resolvePreferredCwdForNewThread();
  const data = await apiFetchJson("/api/v2/threads", {
    method: "POST",
    body: preferredCwd ? { cwd: preferredCwd } : {},
  });
  const thread = data.thread;
  if (thread && thread.id) {
    await loadThreads({ preserveSelection: false });
    await selectThread(thread.id);
  } else {
    await loadThreads({ preserveSelection: true });
  }
}

async function renameThread(threadId) {
  const item = state.threads.find((t) => t.id === threadId);
  const initial = item && item.preview ? item.preview.slice(0, 64) : "";
  const name = window.prompt("输入新线程名", initial);
  if (!name || !name.trim()) return;
  await apiFetchJson(`/api/v2/threads/${encodeURIComponent(threadId)}/name`, {
    method: "POST",
    body: { name: name.trim() },
  });
  await loadThreads({ preserveSelection: true });
  if (state.selectedThreadId === threadId) {
    await loadCurrentThread(threadId, { silent: true });
  }
}

async function archiveThread(threadId) {
  await apiFetchJson(`/api/v2/threads/${encodeURIComponent(threadId)}/archive`, {
    method: "POST",
    body: {},
  });
  await loadThreads({ preserveSelection: true });
  if (state.selectedThreadId === threadId) {
    await loadCurrentThread(threadId, { silent: true });
  }
}

async function unarchiveThread(threadId) {
  await apiFetchJson(`/api/v2/threads/${encodeURIComponent(threadId)}/unarchive`, {
    method: "POST",
    body: {},
  });
  await loadThreads({ preserveSelection: true });
  if (state.selectedThreadId === threadId) {
    await loadCurrentThread(threadId, { silent: true });
  }
}

async function forkThread(threadId) {
  const data = await apiFetchJson(`/api/v2/threads/${encodeURIComponent(threadId)}/fork`, {
    method: "POST",
    body: {},
  });
  await loadThreads({ preserveSelection: true });
  if (data.thread && data.thread.id) {
    await selectThread(data.thread.id);
  }
}

async function sendCurrentMessage() {
  if (state.sending) return;
  let threadId = state.lockedThreadId || state.selectedThreadId;
  if (!threadId) {
    await createThread();
    threadId = state.lockedThreadId || state.selectedThreadId;
  }
  if (!threadId) {
    throw new Error("Cannot determine thread id");
  }

  const text = elements.input.value.trim();
  const hasText = Boolean(text);
  const hasImages = state.pendingImages.length > 0;
  const hasVoice = Boolean(state.pendingVoice);
  if (!hasText && !hasImages && !hasVoice) {
    return;
  }

  const payload = {
    text,
    imageMediaIds: state.pendingImages.map((item) => item.mediaId),
    voiceMediaId: state.pendingVoice ? state.pendingVoice.mediaId : null,
    voiceTranscript: state.pendingVoice ? state.pendingVoice.transcript : "",
  };

  state.sending = true;
  elements.sendBtn.disabled = true;
  setStatus("发送中...");
  try {
    const sent = await apiFetchJson(`/api/v2/threads/${encodeURIComponent(threadId)}/turns`, {
      method: "POST",
      body: payload,
    });
    elements.input.value = "";
    clearPendingAttachments();
    const turnId =
      sent && sent.turn && sent.turn.id ? String(sent.turn.id) : "";
    if (turnId) {
      setStatus(`已发送到 thread ${threadId.slice(0, 8)}... · turn ${turnId}`);
    } else {
      setStatus(`已发送到 thread ${threadId.slice(0, 8)}...`);
    }
    state.forceScrollToBottom = true;
    state.chatScrollLocked = false;
    queueThreadRefresh(300);
    loadThreads({ preserveSelection: true, silent: true }).catch(() => {
      // noop
    });
  } finally {
    state.sending = false;
    elements.sendBtn.disabled = false;
    elements.input.focus();
  }
}

function clearPendingAttachments() {
  state.pendingImages = [];
  state.pendingVoice = null;
  renderPendingImages();
  renderPendingVoice();
}

async function uploadImages(files) {
  for (const file of files) {
    const dataUrl = await readFileAsDataUrl(file);
    const resp = await apiFetchJson("/api/v2/media/image", {
      method: "POST",
      body: {
        dataUrl,
        fileName: file.name,
        mimeType: file.type || "image/jpeg",
      },
    });
    state.pendingImages.push({
      mediaId: resp.mediaId,
      localPath: resp.localPath,
      previewUrl: dataUrl,
      fileName: file.name,
    });
  }
  elements.imagePicker.value = "";
  renderPendingImages();
}

function renderPendingImages() {
  elements.pendingImages.innerHTML = "";
  if (state.pendingImages.length === 0) return;
  for (const item of state.pendingImages) {
    const card = document.createElement("article");
    card.className = "pending-card";
    const img = document.createElement("img");
    img.src = item.previewUrl;
    img.alt = item.fileName || "image";
    const meta = document.createElement("span");
    meta.textContent = item.fileName || item.mediaId;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn mini ghost";
    remove.textContent = "移除";
    remove.dataset.removeMediaId = item.mediaId;
    card.append(img, meta, remove);
    elements.pendingImages.append(card);
  }
}

async function toggleVoiceRecording() {
  if (state.voice.recording) {
    await stopVoiceRecording();
  } else {
    await startVoiceRecording();
  }
}

async function startVoiceRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("当前浏览器不支持录音");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  state.voice.stream = stream;
  state.voice.mediaRecorder = recorder;
  state.voice.chunks = [];
  state.voice.finalTranscript = "";
  state.voice.interimTranscript = "";

  recorder.addEventListener("dataavailable", (event) => {
    if (event.data && event.data.size > 0) {
      state.voice.chunks.push(event.data);
    }
  });
  recorder.addEventListener("stop", async () => {
    const blob = new Blob(state.voice.chunks, {
      type: recorder.mimeType || "audio/webm",
    });
    if (blob.size > 0) {
      try {
        await uploadVoiceBlob(blob, state.voice.finalTranscript.trim());
      } catch (error) {
        setStatus(`语音上传失败: ${asMessage(error)}`);
      }
    }
    cleanupVoiceState();
  });

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.addEventListener("result", (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0] ? result[0].transcript : "";
        if (result.isFinal) finalText += transcript;
        else interimText += transcript;
      }
      if (finalText) state.voice.finalTranscript += finalText;
      state.voice.interimTranscript = interimText;
      setStatus(
        `录音中... ${state.voice.finalTranscript}${state.voice.interimTranscript}`
      );
    });
    recognition.addEventListener("error", () => {
      // 语音识别失败不阻断录音。
    });
    state.voice.recognition = recognition;
    recognition.start();
  }

  recorder.start(250);
  state.voice.recording = true;
  elements.voiceBtn.textContent = "停止";
  setStatus("录音中...");
}

async function stopVoiceRecording() {
  if (!state.voice.recording) return;
  state.voice.recording = false;
  elements.voiceBtn.textContent = "语音";
  if (state.voice.recognition) {
    try {
      state.voice.recognition.stop();
    } catch (_error) {
      // noop
    }
  }
  if (state.voice.mediaRecorder && state.voice.mediaRecorder.state !== "inactive") {
    state.voice.mediaRecorder.stop();
  } else {
    cleanupVoiceState();
  }
}

function cleanupVoiceState() {
  if (state.voice.stream) {
    for (const track of state.voice.stream.getTracks()) {
      track.stop();
    }
  }
  state.voice.mediaRecorder = null;
  state.voice.recognition = null;
  state.voice.stream = null;
  state.voice.chunks = [];
  state.voice.interimTranscript = "";
  state.voice.recording = false;
  elements.voiceBtn.textContent = "语音";
}

async function uploadVoiceBlob(blob, transcript) {
  const dataUrl = await readBlobAsDataUrl(blob);
  const resp = await apiFetchJson("/api/v2/media/voice", {
    method: "POST",
    body: {
      dataUrl,
      fileName: `voice-${Date.now()}.webm`,
      mimeType: blob.type || "audio/webm",
      metadata: {
        transcriptPreview: transcript.slice(0, 256),
      },
    },
  });
  state.pendingVoice = {
    mediaId: resp.mediaId,
    filePath: resp.filePath,
    mimeType: resp.mimeType,
    transcript,
  };
  renderPendingVoice();
  setStatus("语音已保存并待发送");
}

function renderPendingVoice() {
  elements.pendingVoice.innerHTML = "";
  if (!state.pendingVoice) return;
  const card = document.createElement("article");
  card.className = "pending-card voice";
  const title = document.createElement("strong");
  title.textContent = `语音: ${state.pendingVoice.mediaId.slice(0, 8)}...`;
  const transcript = document.createElement("textarea");
  transcript.rows = 2;
  transcript.placeholder = "可编辑转写文本";
  transcript.value = state.pendingVoice.transcript || "";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "btn mini ghost";
  remove.textContent = "移除语音";
  remove.dataset.action = "clear-voice";
  card.append(title, transcript, remove);
  elements.pendingVoice.append(card);
}

function threadHasInProgress(thread) {
  const turns = Array.isArray(thread && thread.turns) ? thread.turns : [];
  return turns.some((turn) => turn && turn.status === "inProgress");
}

function normalizeTurnItemsForDisplay(rawItems) {
  const items = Array.isArray(rawItems) ? rawItems : [];
  if (!state.desktopCompatibleMode) {
    return {
      items,
      hiddenAgentCount: 0,
    };
  }

  let lastAgentMessageIndex = -1;
  for (let i = 0; i < items.length; i += 1) {
    if (items[i] && items[i].type === "agentMessage") {
      lastAgentMessageIndex = i;
    }
  }
  if (lastAgentMessageIndex < 0) {
    return {
      items,
      hiddenAgentCount: 0,
    };
  }

  const visible = [];
  let hiddenAgentCount = 0;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item && item.type === "agentMessage" && i !== lastAgentMessageIndex) {
      hiddenAgentCount += 1;
      continue;
    }
    visible.push(item);
  }
  return {
    items: visible,
    hiddenAgentCount,
  };
}

function renderContextUsage() {
  const usage = state.selectedThreadUsage;
  if (!usage) {
    elements.contextRing.style.setProperty("--pct", "0");
    if (elements.contextUsageText) elements.contextUsageText.textContent = "-- / --";
    if (elements.contextPctText) elements.contextPctText.textContent = "--%";
    if (elements.contextWidget) {
      elements.contextWidget.title = "上下文窗口使用率";
    }
    return;
  }
  const windowSize = Number(usage.modelContextWindow || 0);
  if (!windowSize || windowSize <= 0) {
    elements.contextRing.style.setProperty("--pct", "0");
    if (elements.contextUsageText) elements.contextUsageText.textContent = "-- / --";
    if (elements.contextPctText) elements.contextPctText.textContent = "--%";
    if (elements.contextWidget) {
      elements.contextWidget.title = "上下文窗口大小不可用";
    }
    return;
  }
  let usedTokens = toInt(usage.last && usage.last.inputTokens);
  if (!usedTokens) {
    usedTokens = toInt(usage.total && usage.total.inputTokens);
  }
  if (!usedTokens) {
    usedTokens = toInt(usage.last && usage.last.totalTokens);
  }
  if (!usedTokens) {
    usedTokens = toInt(usage.total && usage.total.totalTokens);
  }
  const pct = Math.max(0, Math.min(100, (usedTokens / windowSize) * 100));
  const remain = Math.max(0, windowSize - usedTokens);
  const usedCompact = formatTokenCompact(usedTokens);
  const windowCompact = formatTokenCompact(windowSize);
  elements.contextRing.style.setProperty("--pct", String(pct));
  if (elements.contextUsageText) {
    elements.contextUsageText.textContent = `${usedCompact} / ${windowCompact}`;
  }
  if (elements.contextPctText) {
    elements.contextPctText.textContent = `${Math.round(pct)}%`;
  }
  if (elements.contextWidget) {
    elements.contextWidget.title = `上下文（last.inputTokens）：已用 ${formatToken(usedTokens)} / ${formatToken(
      windowSize
    )}，剩余 ${formatToken(remain)} tokens`;
  }
}

function normalizeTokenUsage(input) {
  if (!input || typeof input !== "object") return null;
  const total = normalizeTokenBreakdown(input.total || input.total_token_usage || {});
  const last = normalizeTokenBreakdown(input.last || input.last_token_usage || {});
  const windowSize =
    input.modelContextWindow ?? input.model_context_window ?? null;
  const nWindow = Number(windowSize);
  return {
    total,
    last,
    modelContextWindow:
      Number.isFinite(nWindow) && nWindow > 0 ? Math.floor(nWindow) : null,
  };
}

function normalizeTokenBreakdown(input) {
  const src = input && typeof input === "object" ? input : {};
  return {
    inputTokens: toInt(src.inputTokens ?? src.input_tokens),
    outputTokens: toInt(src.outputTokens ?? src.output_tokens),
    cachedInputTokens: toInt(src.cachedInputTokens ?? src.cached_input_tokens),
    reasoningOutputTokens: toInt(
      src.reasoningOutputTokens ?? src.reasoning_output_tokens
    ),
    totalTokens: toInt(src.totalTokens ?? src.total_tokens),
  };
}

function groupThreadsByProject(threads) {
  const map = new Map();
  for (const thread of threads || []) {
    const key = getProjectKey(thread);
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        name: getProjectName(key),
        threads: [],
        lastUpdated: 0,
      };
      map.set(key, group);
    }
    group.threads.push(thread);
    group.lastUpdated = Math.max(group.lastUpdated, Number(thread.updatedAt || 0));
  }

  const groups = [...map.values()];
  for (const g of groups) {
    g.threads.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  }
  groups.sort((a, b) => b.lastUpdated - a.lastUpdated || a.name.localeCompare(b.name));
  return groups;
}

function getProjectKey(thread) {
  if (!thread || !thread.cwd) return "(unknown)";
  return String(thread.cwd);
}

function resolvePreferredCwdForNewThread() {
  if (state.expandedProjectKey && state.expandedProjectKey !== "(unknown)") {
    return String(state.expandedProjectKey);
  }
  const selected = state.threads.find((item) => item.id === state.selectedThreadId);
  if (selected && selected.cwd) {
    const cwd = String(selected.cwd);
    if (cwd && cwd !== "(unknown)") return cwd;
  }
  if (Array.isArray(state.projects) && state.projects.length > 0) {
    const top = state.projects[0];
    if (top && top.key && top.key !== "(unknown)") return String(top.key);
  }
  return "";
}

function getProjectName(projectKey) {
  const clean = String(projectKey || "").replace(/[\\/]+$/, "");
  if (!clean || clean === "(unknown)") return "(unknown)";
  const parts = clean.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : clean;
}

function formatToken(n) {
  return Number(n || 0).toLocaleString("en-US");
}

function formatTokenCompact(value) {
  const n = Math.max(0, Number(value || 0));
  if (!Number.isFinite(n)) return "--";
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  }
  if (n >= 1_000) {
    return `${Math.round(n / 1_000)}k`;
  }
  return String(Math.round(n));
}

function toInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeBaseUrl(value) {
  const v = String(value || "").trim();
  if (!v) return window.location.origin;
  return v.replace(/\/$/, "");
}

function getBaseUrl() {
  return normalizeBaseUrl(localStorage.getItem(storageKeys.baseUrl) || window.location.origin);
}

function getToken() {
  return String(localStorage.getItem(storageKeys.token) || "");
}

function getDeviceCredentials() {
  return {
    deviceId: String(localStorage.getItem(storageKeys.deviceId) || "").trim(),
    deviceSecret: String(localStorage.getItem(storageKeys.deviceSecret) || "").trim(),
  };
}

function getStoredDeviceName() {
  return String(localStorage.getItem(storageKeys.deviceName) || "").trim();
}

function inferDefaultDeviceName() {
  const ua = String(navigator.userAgent || "").toLowerCase();
  if (ua.includes("iphone")) return "iPhone";
  if (ua.includes("ipad")) return "iPad";
  if (ua.includes("android")) return "Android Phone";
  return "Phone Browser";
}

function hasBoundDevice() {
  const creds = getDeviceCredentials();
  return Boolean(creds.deviceId && creds.deviceSecret);
}

function setDeviceCredentials(input) {
  const data = input && typeof input === "object" ? input : {};
  const deviceId = String(data.deviceId || "").trim();
  const deviceSecret = String(data.deviceSecret || "").trim();
  const deviceName = String(data.deviceName || "").trim() || inferDefaultDeviceName();
  if (!deviceId || !deviceSecret) return;
  localStorage.setItem(storageKeys.deviceId, deviceId);
  localStorage.setItem(storageKeys.deviceSecret, deviceSecret);
  localStorage.setItem(storageKeys.deviceName, deviceName);
  if (elements.pairingDeviceName) {
    elements.pairingDeviceName.value = deviceName;
  }
}

function clearDeviceCredentials() {
  localStorage.removeItem(storageKeys.deviceId);
  localStorage.removeItem(storageKeys.deviceSecret);
}

function randomNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function buildCanonicalPath(pathname, searchParams, excludedKeys = []) {
  const entries = [];
  for (const [key, value] of searchParams.entries()) {
    if (excludedKeys.includes(key)) continue;
    entries.push([key, value]);
  }
  entries.sort((a, b) => {
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    if (a[1] < b[1]) return -1;
    if (a[1] > b[1]) return 1;
    return 0;
  });
  const qs = new URLSearchParams();
  for (const [key, value] of entries) {
    qs.append(key, value);
  }
  const query = qs.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function buildSigningString({
  method,
  canonicalPath,
  bodySha256,
  timestampMs,
  nonce,
  deviceId,
}) {
  return [
    "v1",
    String(method || "GET").toUpperCase(),
    String(canonicalPath || "/"),
    String(bodySha256 || ""),
    String(timestampMs || ""),
    String(nonce || ""),
    String(deviceId || ""),
  ].join("\n");
}

async function buildSignedQueryAuth({ method, pathname, query, body }) {
  const creds = getDeviceCredentials();
  if (!creds.deviceId || !creds.deviceSecret) {
    throw new Error("Device not paired");
  }
  const params = query instanceof URLSearchParams ? new URLSearchParams(query.toString()) : new URLSearchParams();
  const timestamp = String(Date.now());
  const nonce = randomNonce();
  params.set("deviceId", creds.deviceId);
  params.set("ts", timestamp);
  params.set("nonce", nonce);

  const canonicalPath = buildCanonicalPath(pathname, params, ["sig"]);
  const bodySha256 = await sha256HexUtf8(body || "");
  const keyHex = await sha256HexUtf8(creds.deviceSecret);
  const signingString = buildSigningString({
    method,
    canonicalPath,
    bodySha256,
    timestampMs: timestamp,
    nonce,
    deviceId: creds.deviceId,
  });
  const signature = await hmacSha256Base64UrlFromHexKey(keyHex, signingString);
  return {
    deviceId: creds.deviceId,
    timestamp,
    nonce,
    signature,
  };
}

async function buildSignedHeaderAuth({ method, pathname, query, body }) {
  const creds = getDeviceCredentials();
  if (!creds.deviceId || !creds.deviceSecret) {
    throw new Error("Device not paired");
  }
  const params =
    query instanceof URLSearchParams
      ? new URLSearchParams(query.toString())
      : new URLSearchParams();
  const timestamp = String(Date.now());
  const nonce = randomNonce();
  // Header auth carries device credentials in headers, so canonical path
  // must be built from the original request query only.
  const canonicalPath = buildCanonicalPath(pathname, params, ["sig"]);
  const bodySha256 = await sha256HexUtf8(body || "");
  const keyHex = await sha256HexUtf8(creds.deviceSecret);
  const signingString = buildSigningString({
    method,
    canonicalPath,
    bodySha256,
    timestampMs: timestamp,
    nonce,
    deviceId: creds.deviceId,
  });
  const signature = await hmacSha256Base64UrlFromHexKey(keyHex, signingString);
  return {
    deviceId: creds.deviceId,
    timestamp,
    nonce,
    signature,
  };
}

async function apiFetchJson(pathname, options = {}) {
  const base = getBaseUrl();
  const method = String(options.method || "GET").toUpperCase();
  const authMode = String(options.authMode || "auto").toLowerCase();
  const headers = {};
  let body = undefined;
  let rawBody = "";
  if (options.body !== undefined) {
    rawBody = JSON.stringify(options.body);
    body = rawBody;
    headers["Content-Type"] = "application/json";
  }

  const urlObj = new URL(pathname, base);
  if (authMode !== "none") {
    const wantsDevice = authMode === "device" || authMode === "auto";
    if (wantsDevice && hasBoundDevice()) {
      const signed = await buildSignedHeaderAuth({
        method,
        pathname: decodeURIComponent(urlObj.pathname || "/"),
        query: urlObj.searchParams,
        body: rawBody,
      });
      headers["X-Device-Id"] = signed.deviceId;
      headers["X-Device-Timestamp"] = signed.timestamp;
      headers["X-Device-Nonce"] = signed.nonce;
      headers["X-Device-Signature"] = signed.signature;
    } else {
      const token = getToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }
  }

  const response = await fetch(urlObj.toString(), {
    method,
    headers,
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    if (response.status === 401 || response.status === 403) {
      const msg = String(data.error || "").toLowerCase();
      if (
        msg.includes("missing device signature") ||
        msg.includes("device_not_bound") ||
        msg.includes("unknown_device") ||
        msg.includes("bad_signature")
      ) {
        clearDeviceCredentials();
        renderPairingBanner(true);
      }
    }
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

function setStatus(text) {
  elements.statusBar.textContent = `状态: ${text}`;
}

function parseSse(event) {
  try {
    return JSON.parse(event.data);
  } catch (_error) {
    return null;
  }
}

function formatThreadTime(ts) {
  if (!ts) return "-";
  const n = Number(ts);
  if (Number.isFinite(n) && n > 1000000000) {
    return new Date(n * 1000).toLocaleString();
  }
  return String(ts);
}

function asMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Blob reader failed"));
    reader.readAsDataURL(blob);
  });
}

function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

const textEncoder = new TextEncoder();

function utf8Bytes(input) {
  return textEncoder.encode(String(input || ""));
}

function bytesToHex(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

function hexToBytes(hex) {
  const clean = String(hex || "").trim().toLowerCase();
  if (!clean || clean.length % 2 !== 0) {
    throw new Error("Invalid hex key");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    const byte = Number.parseInt(clean.slice(i, i + 2), 16);
    if (!Number.isFinite(byte)) {
      throw new Error("Invalid hex key");
    }
    out[i / 2] = byte;
  }
  return out;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function rotr(x, n) {
  return (x >>> n) | (x << (32 - n));
}

function sha256BytesSync(bytes) {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const H = [
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ];

  const bitLen = bytes.length * 8;
  const totalLen = ((bytes.length + 9 + 63) >> 6) << 6;
  const msg = new Uint8Array(totalLen);
  msg.set(bytes, 0);
  msg[bytes.length] = 0x80;
  const view = new DataView(msg.buffer);
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  view.setUint32(totalLen - 8, hi, false);
  view.setUint32(totalLen - 4, lo, false);

  const w = new Uint32Array(64);
  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let t = 0; t < 16; t += 1) {
      w[t] = view.getUint32(offset + t * 4, false);
    }
    for (let t = 16; t < 64; t += 1) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }

    let a = H[0];
    let b = H[1];
    let c = H[2];
    let d = H[3];
    let e = H[4];
    let f = H[5];
    let g = H[6];
    let h = H[7];

    for (let t = 0; t < 64; t += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < H.length; i += 1) {
    outView.setUint32(i * 4, H[i], false);
  }
  return out;
}

function hmacSha256BytesSync(keyBytes, messageBytes) {
  const blockSize = 64;
  let key = keyBytes;
  if (key.length > blockSize) {
    key = sha256BytesSync(key);
  }
  const normalized = new Uint8Array(blockSize);
  normalized.set(key.subarray(0, blockSize));

  const oKeyPad = new Uint8Array(blockSize);
  const iKeyPad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i += 1) {
    oKeyPad[i] = normalized[i] ^ 0x5c;
    iKeyPad[i] = normalized[i] ^ 0x36;
  }

  const inner = new Uint8Array(blockSize + messageBytes.length);
  inner.set(iKeyPad, 0);
  inner.set(messageBytes, blockSize);
  const innerHash = sha256BytesSync(inner);

  const outer = new Uint8Array(blockSize + innerHash.length);
  outer.set(oKeyPad, 0);
  outer.set(innerHash, blockSize);
  return sha256BytesSync(outer);
}

async function sha256HexUtf8(input) {
  const bytes = utf8Bytes(input);
  if (crypto && crypto.subtle) {
    try {
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return bytesToHex(new Uint8Array(digest));
    } catch {
      // fall through to sync implementation
    }
  }
  return bytesToHex(sha256BytesSync(bytes));
}

async function hmacSha256Base64UrlFromHexKey(hexKey, message) {
  const keyBytes = hexToBytes(hexKey);
  const msgBytes = utf8Bytes(message);
  if (crypto && crypto.subtle) {
    try {
      const key = await crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const sig = await crypto.subtle.sign("HMAC", key, msgBytes);
      return bytesToBase64Url(new Uint8Array(sig));
    } catch {
      // fall through to sync implementation
    }
  }
  return bytesToBase64Url(hmacSha256BytesSync(keyBytes, msgBytes));
}
