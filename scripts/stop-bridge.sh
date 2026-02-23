#!/usr/bin/env bash
set -euo pipefail

PID_FILE="/tmp/codex-phone-bridge.pid"
PORT="${PORT:-8787}"

if [[ -f "${PID_FILE}" ]]; then
  PID="$(cat "${PID_FILE}")"
  if kill -0 "${PID}" >/dev/null 2>&1; then
    kill "${PID}"
    echo "stopped pid ${PID}"
  fi
  rm -f "${PID_FILE}"
fi

PIDS="$(lsof -tiTCP:${PORT} -sTCP:LISTEN || true)"
if [[ -n "${PIDS}" ]]; then
  echo "${PIDS}" | xargs kill
  echo "stopped listeners on port ${PORT}"
fi
