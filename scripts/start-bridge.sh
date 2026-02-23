#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="/tmp/codex-phone-bridge.pid"
LOG_FILE="/tmp/codex-phone-bridge.log"
PORT="${PORT:-8787}"

if lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "bridge already running on port ${PORT}"
  exit 0
fi

cd "${ROOT_DIR}"
nohup node server.js >"${LOG_FILE}" 2>&1 &
PID=$!
echo "${PID}" > "${PID_FILE}"

sleep 1
if ! kill -0 "${PID}" >/dev/null 2>&1; then
  echo "failed to start bridge, check ${LOG_FILE}" >&2
  exit 1
fi

IFACE="$(route get default 2>/dev/null | awk '/interface:/{print $2; exit}')"
LAN_IP=""
if [[ -n "${IFACE}" ]]; then
  LAN_IP="$(ipconfig getifaddr "${IFACE}" 2>/dev/null || true)"
fi

echo "bridge started"
echo "pid: ${PID}"
echo "log: ${LOG_FILE}"
if [[ -n "${LAN_IP}" ]]; then
  echo "url: http://${LAN_IP}:${PORT}"
else
  echo "url: http://127.0.0.1:${PORT}"
fi
