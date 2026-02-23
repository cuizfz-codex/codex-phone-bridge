#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNTIME_DIR="${ROOT_DIR}/data/runtime"
PID_FILE="${RUNTIME_DIR}/phone-codex.pid"

if [[ -f "${ROOT_DIR}/launcher.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/launcher.env"
  set +a
fi

PORT="${PORT:-8787}"

stopped_any=0

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

if [[ "${stopped_any}" -eq 0 ]]; then
  echo "No running phone-codex service found."
fi

read -r -p "Press Enter to close..."
