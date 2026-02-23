#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNTIME_DIR="${ROOT_DIR}/data/runtime"
PID_FILE="${RUNTIME_DIR}/phone-codex.pid"
LOG_FILE="${RUNTIME_DIR}/phone-codex.log"

mkdir -p "${RUNTIME_DIR}"

if [[ -f "${ROOT_DIR}/launcher.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/launcher.env"
  set +a
fi

PORT="${PORT:-8787}"
BIND_HOST="${BIND_HOST:-0.0.0.0}"
REQUIRE_LOGIN="${REQUIRE_LOGIN:-0}"
SIMPLE_LOGIN_PASSWORD="${SIMPLE_LOGIN_PASSWORD:-}"
CODEX_APP_SERVER_WS_SPAWN="${CODEX_APP_SERVER_WS_SPAWN:-1}"
REMOTE_MODE="${REMOTE_MODE:-tailscale}"

detect_lan_ipv4() {
  local iface=""
  iface="$(route get default 2>/dev/null | awk '/interface:/{print $2; exit}' || true)"
  if [[ -z "${iface}" ]]; then
    return 1
  fi
  ipconfig getifaddr "${iface}" 2>/dev/null || true
}

detect_tailscale_ipv4() {
  if ! command -v tailscale >/dev/null 2>&1; then
    return 1
  fi
  tailscale ip -4 2>/dev/null | awk "NR==1 {print; exit}" || true
}

detect_tailscale_dns() {
  if ! command -v tailscale >/dev/null 2>&1; then
    return 1
  fi
  local dns=""
  dns="$(
    tailscale status --json 2>/dev/null |
      awk -F'"' '/"DNSName":/ { print $4; exit }'
  )"
  dns="${dns%.}"
  if [[ -z "${dns}" ]]; then
    return 1
  fi
  printf "%s\n" "${dns}"
}

LAN_IPV4="$(detect_lan_ipv4 || true)"
TAILSCALE_IPV4="$(detect_tailscale_ipv4 || true)"
TAILSCALE_DNS="$(detect_tailscale_dns || true)"

REMOTE_URLS_JSON="[]"
remote_url_parts=()
if [[ -n "${LAN_IPV4}" ]]; then
  remote_url_parts+=("\"http://${LAN_IPV4}:${PORT}\"")
fi
if [[ -n "${TAILSCALE_IPV4}" ]]; then
  remote_url_parts+=("\"http://${TAILSCALE_IPV4}:${PORT}\"")
fi
if [[ -n "${TAILSCALE_DNS}" ]]; then
  remote_url_parts+=("\"http://${TAILSCALE_DNS}:${PORT}\"")
fi
if [[ "${#remote_url_parts[@]}" -gt 0 ]]; then
  REMOTE_URLS_JSON="[${remote_url_parts[*]}]"
  REMOTE_URLS_JSON="${REMOTE_URLS_JSON// /,}"
fi

TS_INSTALLED="false"
TS_CONNECTED="false"
if command -v tailscale >/dev/null 2>&1; then
  TS_INSTALLED="true"
  if [[ -n "${TAILSCALE_IPV4}" || -n "${TAILSCALE_DNS}" ]]; then
    TS_CONNECTED="true"
  fi
fi
REMOTE_TAILSCALE_JSON="{\"installed\":${TS_INSTALLED},\"connected\":${TS_CONNECTED},\"ipv4\":$(
  [[ -n "${TAILSCALE_IPV4}" ]] && printf "\"%s\"" "${TAILSCALE_IPV4}" || printf "null"
),\"magicDns\":$(
  [[ -n "${TAILSCALE_DNS}" ]] && printf "\"%s\"" "${TAILSCALE_DNS}" || printf "null"
)}"

if [[ "${REQUIRE_LOGIN}" == "1" && -z "${SIMPLE_LOGIN_PASSWORD}" ]]; then
  echo "ERROR: REQUIRE_LOGIN=1, but SIMPLE_LOGIN_PASSWORD is empty."
  echo "Please set a password in launcher.env."
  read -r -p "Press Enter to close..."
  exit 1
fi

is_pid_running() {
  local pid="$1"
  [[ -n "${pid}" ]] && kill -0 "${pid}" >/dev/null 2>&1
}

wait_for_health() {
  local retries=40
  local i
  for ((i = 0; i < retries; i += 1)); do
    if curl -fsS --max-time 2 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

print_urls() {
  echo "Local URL : http://127.0.0.1:${PORT}"
  if [[ -n "${LAN_IPV4}" ]]; then
    echo "Phone URL : http://${LAN_IPV4}:${PORT}"
  fi
  if [[ -n "${TAILSCALE_IPV4}" ]]; then
    echo "Tailscale : http://${TAILSCALE_IPV4}:${PORT}"
  fi
  if [[ -n "${TAILSCALE_DNS}" ]]; then
    echo "MagicDNS  : http://${TAILSCALE_DNS}:${PORT}"
  fi
}

if [[ -f "${PID_FILE}" ]]; then
  OLD_PID="$(cat "${PID_FILE}" 2>/dev/null || true)"
  if is_pid_running "${OLD_PID}" && wait_for_health; then
    echo "phone-codex is already running (PID ${OLD_PID})."
    print_urls
    echo "Log file : ${LOG_FILE}"
    open "http://127.0.0.1:${PORT}" >/dev/null 2>&1 || true
    read -r -p "Press Enter to close..."
    exit 0
  fi
  rm -f "${PID_FILE}"
fi

LISTENING_PIDS="$(lsof -tiTCP:${PORT} -sTCP:LISTEN 2>/dev/null || true)"
if [[ -n "${LISTENING_PIDS}" ]]; then
  echo "ERROR: Port ${PORT} is already in use by another process:"
  echo "${LISTENING_PIDS}" | xargs -n1 ps -p 2>/dev/null || true
  read -r -p "Press Enter to close..."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is not installed or not in PATH."
  read -r -p "Press Enter to close..."
  exit 1
fi

if [[ ! -d "${ROOT_DIR}/node_modules" ]]; then
  echo "Installing dependencies (first run only)..."
  (cd "${ROOT_DIR}" && npm install)
fi

echo "Starting phone-codex..."
echo "Mode     : $( [[ "${REQUIRE_LOGIN}" == "1" ]] && echo "password login" || echo "open (no password)" )"
echo "Bind host: ${BIND_HOST}"
echo "Port     : ${PORT}"
echo "Remote   : ${REMOTE_MODE}"

(
  cd "${ROOT_DIR}"
  nohup env \
    PORT="${PORT}" \
    BIND_HOST="${BIND_HOST}" \
    REQUIRE_LOGIN="${REQUIRE_LOGIN}" \
    SIMPLE_LOGIN_PASSWORD="${SIMPLE_LOGIN_PASSWORD}" \
    REMOTE_MODE="${REMOTE_MODE}" \
    REMOTE_URLS_JSON="${REMOTE_URLS_JSON}" \
    REMOTE_TAILSCALE_JSON="${REMOTE_TAILSCALE_JSON}" \
    CODEX_APP_SERVER_WS_URL="" \
    CODEX_APP_SERVER_WS_SPAWN="${CODEX_APP_SERVER_WS_SPAWN}" \
    node server.js >>"${LOG_FILE}" 2>&1 &
  echo "$!" >"${PID_FILE}"
)

NEW_PID="$(cat "${PID_FILE}" 2>/dev/null || true)"
if ! is_pid_running "${NEW_PID}"; then
  echo "ERROR: failed to start process."
  echo "Check log: ${LOG_FILE}"
  tail -n 40 "${LOG_FILE}" || true
  rm -f "${PID_FILE}"
  read -r -p "Press Enter to close..."
  exit 1
fi

if ! wait_for_health; then
  echo "ERROR: service started but health check failed."
  echo "Check log: ${LOG_FILE}"
  tail -n 60 "${LOG_FILE}" || true
  read -r -p "Press Enter to close..."
  exit 1
fi

echo "phone-codex started successfully (PID ${NEW_PID})."
print_urls
echo "Log file : ${LOG_FILE}"

open "http://127.0.0.1:${PORT}" >/dev/null 2>&1 || true
read -r -p "Press Enter to close..."
