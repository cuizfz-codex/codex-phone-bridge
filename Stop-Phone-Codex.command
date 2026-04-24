#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNTIME_DIR="${ROOT_DIR}/data/runtime"
PID_FILE="${RUNTIME_DIR}/phone-codex.pid"
LAUNCH_DIR="${HOME}/.phone-codex-launch"
RUNNER_FILE="${LAUNCH_DIR}/launch-phone-codex.sh"
LOG_FILE="${LAUNCH_DIR}/phone-codex.log"
LEGACY_RUNNER_FILE="${RUNTIME_DIR}/launch-phone-codex.sh"
LAUNCH_LABEL="${LAUNCH_LABEL:-com.phone-codex.server}"

if [[ -f "${ROOT_DIR}/launcher.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/launcher.env"
  set +a
fi

PORT="${PORT:-8787}"
LOCAL_HTTP_PREVIEW_PORT="${LOCAL_HTTP_PREVIEW_PORT:-8786}"

stopped_any=0

if command -v launchctl >/dev/null 2>&1; then
  if launchctl remove "${LAUNCH_LABEL}" >/dev/null 2>&1; then
    echo "Removed launchctl job ${LAUNCH_LABEL}"
    stopped_any=1
    sleep 1
  fi
fi

if [[ -f "${PID_FILE}" ]]; then
  PID="$(cat "${PID_FILE}" 2>/dev/null || true)"
  if [[ -n "${PID}" ]] && kill -0 "${PID}" >/dev/null 2>&1; then
    kill "${PID}" >/dev/null 2>&1 || true
    sleep 1
    if kill -0 "${PID}" >/dev/null 2>&1; then
      kill -9 "${PID}" >/dev/null 2>&1 || true
    fi
    echo "Stopped phone-codex PID ${PID}"
    stopped_any=1
  fi
  rm -f "${PID_FILE}"
fi

PORT_PIDS="$(lsof -tiTCP:${PORT} -sTCP:LISTEN 2>/dev/null || true)"
if [[ -n "${PORT_PIDS}" ]]; then
  echo "${PORT_PIDS}" | xargs kill >/dev/null 2>&1 || true
  sleep 1
  STILL="$(lsof -tiTCP:${PORT} -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${STILL}" ]]; then
    echo "${STILL}" | xargs kill -9 >/dev/null 2>&1 || true
  fi
  echo "Stopped listeners on port ${PORT}"
  stopped_any=1
fi

if [[ "${LOCAL_HTTP_PREVIEW_PORT}" =~ ^[0-9]+$ && "${LOCAL_HTTP_PREVIEW_PORT}" -gt 0 ]]; then
  PREVIEW_PIDS="$(lsof -tiTCP:${LOCAL_HTTP_PREVIEW_PORT} -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${PREVIEW_PIDS}" ]]; then
    echo "${PREVIEW_PIDS}" | xargs kill >/dev/null 2>&1 || true
    sleep 1
    PREVIEW_STILL="$(lsof -tiTCP:${LOCAL_HTTP_PREVIEW_PORT} -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "${PREVIEW_STILL}" ]]; then
      echo "${PREVIEW_STILL}" | xargs kill -9 >/dev/null 2>&1 || true
    fi
    echo "Stopped local preview listeners on port ${LOCAL_HTTP_PREVIEW_PORT}"
    stopped_any=1
  fi
fi

if [[ "${stopped_any}" -eq 0 ]]; then
  echo "No running phone-codex service found."
fi

rm -f "${RUNNER_FILE}" "${LEGACY_RUNNER_FILE}" "${LOG_FILE}"

if [[ -t 0 && -t 1 ]]; then
  read -r -p "Press Enter to close..." || true
fi
