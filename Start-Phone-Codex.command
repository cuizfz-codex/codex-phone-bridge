#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNTIME_DIR="${ROOT_DIR}/data/runtime"
PID_FILE="${RUNTIME_DIR}/phone-codex.pid"
LOG_FILE="${RUNTIME_DIR}/phone-codex.log"
TLS_DIR="${RUNTIME_DIR}/tls"

mkdir -p "${RUNTIME_DIR}"
mkdir -p "${TLS_DIR}"

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
HTTPS_ENABLED="${HTTPS_ENABLED:-1}"
HTTPS_REDIRECT_PORT="${HTTPS_REDIRECT_PORT:-0}"
TLS_MODE="${TLS_MODE:-auto}" # auto|custom|tailscale|self-signed
TLS_CERT_FILE="${TLS_CERT_FILE:-}"
TLS_KEY_FILE="${TLS_KEY_FILE:-}"
TLS_CA_FILE="${TLS_CA_FILE:-}"
TLS_HOSTNAME="${TLS_HOSTNAME:-}"
TLS_INSECURE_SKIP_VERIFY="${TLS_INSECURE_SKIP_VERIFY:-0}"
QR_READY="1"
TAILSCALE_CERT_ERROR=""

if [[ "${HTTPS_ENABLED}" != "1" ]]; then
  echo "ERROR: HTTPS is required. Set HTTPS_ENABLED=1."
  read -r -p "Press Enter to close..."
  exit 1
fi

URL_SCHEME="https"

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

is_file_readable() {
  local p="$1"
  [[ -n "${p}" && -f "${p}" && -r "${p}" ]]
}

resolve_tls_files_from_env() {
  if is_file_readable "${TLS_CERT_FILE}" && is_file_readable "${TLS_KEY_FILE}"; then
    TLS_CERT_FILE="$(cd "$(dirname "${TLS_CERT_FILE}")" && pwd)/$(basename "${TLS_CERT_FILE}")"
    TLS_KEY_FILE="$(cd "$(dirname "${TLS_KEY_FILE}")" && pwd)/$(basename "${TLS_KEY_FILE}")"
    return 0
  fi
  return 1
}

issue_tailscale_cert() {
  local host="$1"
  [[ -z "${host}" ]] && return 1
  command -v tailscale >/dev/null 2>&1 || return 1
  local cert_file="${TLS_DIR}/${host}.crt"
  local key_file="${TLS_DIR}/${host}.key"
  local tailscale_output=""
  if tailscale_output="$(
    tailscale cert --cert-file "${cert_file}" --key-file "${key_file}" "${host}" 2>&1
  )"; then
    TLS_CERT_FILE="${cert_file}"
    TLS_KEY_FILE="${key_file}"
    TLS_HOSTNAME="${host}"
    TAILSCALE_CERT_ERROR=""
    return 0
  fi
  TAILSCALE_CERT_ERROR="${tailscale_output}"
  return 1
}

issue_self_signed_cert() {
  command -v openssl >/dev/null 2>&1 || return 1
  local cert_file="${TLS_DIR}/selfsigned.crt"
  local key_file="${TLS_DIR}/selfsigned.key"
  local conf_file="${TLS_DIR}/selfsigned-openssl.cnf"

  local san_entries=("DNS:localhost" "IP:127.0.0.1")
  if [[ -n "${LAN_IPV4}" ]]; then
    san_entries+=("IP:${LAN_IPV4}")
  fi
  if [[ -n "${TAILSCALE_IPV4}" ]]; then
    san_entries+=("IP:${TAILSCALE_IPV4}")
  fi
  if [[ -n "${TAILSCALE_DNS}" ]]; then
    san_entries+=("DNS:${TAILSCALE_DNS}")
  fi
  if [[ -n "${TLS_HOSTNAME}" ]]; then
    san_entries+=("DNS:${TLS_HOSTNAME}")
  fi
  local san_csv
  san_csv="$(IFS=,; echo "${san_entries[*]}")"

  cat > "${conf_file}" <<EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_req

[dn]
CN = phone-codex.local

[v3_req]
keyUsage = keyEncipherment, dataEncipherment, digitalSignature
extendedKeyUsage = serverAuth
subjectAltName = ${san_csv}
EOF

  openssl req \
    -x509 \
    -nodes \
    -newkey rsa:2048 \
    -days 825 \
    -keyout "${key_file}" \
    -out "${cert_file}" \
    -config "${conf_file}" >/dev/null 2>&1

  TLS_CERT_FILE="${cert_file}"
  TLS_KEY_FILE="${key_file}"
  # Self-signed cert is not publicly trusted; local health checks must skip verify.
  TLS_INSECURE_SKIP_VERIFY="1"
  return 0
}

prepare_tls_material() {
  local mode
  mode="$(echo "${TLS_MODE}" | tr '[:upper:]' '[:lower:]')"

  if resolve_tls_files_from_env; then
    return 0
  fi

  case "${mode}" in
    custom)
      echo "ERROR: TLS_MODE=custom requires valid TLS_CERT_FILE and TLS_KEY_FILE."
      return 1
      ;;
    tailscale)
      if issue_tailscale_cert "${TLS_HOSTNAME:-${TAILSCALE_DNS}}"; then
        return 0
      fi
      echo "ERROR: Failed to issue tailscale cert. Ensure tailscale is connected and MagicDNS is available."
      if [[ -n "${TAILSCALE_CERT_ERROR}" ]]; then
        echo "tailscale cert output: ${TAILSCALE_CERT_ERROR}"
      fi
      return 1
      ;;
    self-signed)
      if issue_self_signed_cert; then
        return 0
      fi
      echo "ERROR: Failed to create self-signed certificate (openssl missing?)."
      return 1
      ;;
    auto|*)
      if issue_tailscale_cert "${TLS_HOSTNAME:-${TAILSCALE_DNS}}"; then
        return 0
      fi
      if [[ -n "${TAILSCALE_CERT_ERROR}" ]]; then
        echo "WARN: tailscale cert unavailable, fallback to self-signed TLS."
        echo "      tailscale cert output: ${TAILSCALE_CERT_ERROR}"
      fi
      if issue_self_signed_cert; then
        return 0
      fi
      echo "ERROR: Failed to prepare TLS cert (tailscale cert + openssl fallback both failed)."
      return 1
      ;;
  esac
}

if ! prepare_tls_material; then
  read -r -p "Press Enter to close..."
  exit 1
fi

REMOTE_URLS_JSON="[]"
remote_url_parts=()
if [[ -n "${LAN_IPV4}" ]]; then
  remote_url_parts+=("\"${URL_SCHEME}://${LAN_IPV4}:${PORT}\"")
fi
if [[ -n "${TAILSCALE_IPV4}" ]]; then
  remote_url_parts+=("\"${URL_SCHEME}://${TAILSCALE_IPV4}:${PORT}\"")
fi
if [[ -n "${TAILSCALE_DNS}" ]]; then
  remote_url_parts+=("\"${URL_SCHEME}://${TAILSCALE_DNS}:${PORT}\"")
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

url_encode() {
  local raw="$1"
  node -e 'process.stdout.write(encodeURIComponent(process.argv[1] || ""))' "${raw}"
}

build_init_url_from_base() {
  local base="$1"
  local encoded_base
  encoded_base="$(url_encode "${base}")"
  printf "%s/?base=%s\n" "${base}" "${encoded_base}"
}

build_setup_url_from_base() {
  local base="$1"
  printf "%s/\n" "${base}"
}

ensure_qrcode_module() {
  if (cd "${ROOT_DIR}" && node -e 'require.resolve("qrcode")' >/dev/null 2>&1); then
    return 0
  fi
  echo "Installing missing dependency: qrcode ..."
  if ! (cd "${ROOT_DIR}" && npm install --no-fund --no-audit qrcode); then
    return 1
  fi
  (cd "${ROOT_DIR}" && node -e 'require.resolve("qrcode")' >/dev/null 2>&1)
}

wait_for_health() {
  local retries=40
  local i
  local curl_args=(-fsS --max-time 2)
  if [[ "${URL_SCHEME}" == "https" && "${TLS_INSECURE_SKIP_VERIFY}" == "1" ]]; then
    curl_args+=(-k)
  fi
  for ((i = 0; i < retries; i += 1)); do
    if curl "${curl_args[@]}" "${URL_SCHEME}://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

pick_open_url() {
  if [[ -n "${TAILSCALE_DNS}" ]]; then
    printf "%s\n" "${URL_SCHEME}://${TAILSCALE_DNS}:${PORT}"
    return
  fi
  if [[ -n "${LAN_IPV4}" ]]; then
    printf "%s\n" "${URL_SCHEME}://${LAN_IPV4}:${PORT}"
    return
  fi
  printf "%s\n" "${URL_SCHEME}://127.0.0.1:${PORT}"
}

pick_setup_url() {
  local base
  base="$(pick_open_url)"
  build_setup_url_from_base "${base}"
}

print_urls() {
  local local_base="${URL_SCHEME}://127.0.0.1:${PORT}"
  echo "Local URL : ${local_base}"
  echo "Init URL  : $(build_init_url_from_base "${local_base}")"
  echo "Quick URL : $(build_setup_url_from_base "${local_base}")"
  if [[ -n "${LAN_IPV4}" ]]; then
    local lan_base="${URL_SCHEME}://${LAN_IPV4}:${PORT}"
    echo "Phone URL : ${lan_base}"
    echo "Init LAN  : $(build_init_url_from_base "${lan_base}")"
    echo "Quick LAN : $(build_setup_url_from_base "${lan_base}")"
  fi
  if [[ -n "${TAILSCALE_IPV4}" ]]; then
    local ts_ip_base="${URL_SCHEME}://${TAILSCALE_IPV4}:${PORT}"
    echo "Tailscale : ${ts_ip_base}"
    echo "Init TSIP : $(build_init_url_from_base "${ts_ip_base}")"
    echo "Quick TSIP: $(build_setup_url_from_base "${ts_ip_base}")"
  fi
  if [[ -n "${TAILSCALE_DNS}" ]]; then
    local ts_dns_base="${URL_SCHEME}://${TAILSCALE_DNS}:${PORT}"
    echo "MagicDNS  : ${ts_dns_base}"
    echo "Init DNS  : $(build_init_url_from_base "${ts_dns_base}")"
    echo "Quick DNS : $(build_setup_url_from_base "${ts_dns_base}")"
  fi
}

render_setup_qr() {
  local url="$1"
  local output_file="$2"

  (cd "${ROOT_DIR}" && node - "${url}" "${output_file}" <<'NODE'
const QRCode = require("qrcode");

const text = String(process.argv[2] || "");
const outputPath = String(process.argv[3] || "");

async function run() {
  const qr = QRCode.create(text, { errorCorrectionLevel: "H" });
  const modules = qr.modules;
  const size = modules.size;
  const margin = 2;
  const lines = [];
  const isDark = (x, y) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return false;
    return modules.get(x, y);
  };
  for (let y = -margin; y < size + margin; y += 2) {
    let line = "";
    for (let x = -margin; x < size + margin; x += 1) {
      const top = isDark(x, y);
      const bottom = isDark(x, y + 1);
      if (top && bottom) line += "█";
      else if (top) line += "▀";
      else if (bottom) line += "▄";
      else line += " ";
    }
    lines.push(line);
  }
  process.stdout.write(lines.join("\n") + "\n");
  if (outputPath) {
    await QRCode.toFile(outputPath, text, {
      type: "png",
      margin: 4,
      scale: 10,
      errorCorrectionLevel: "H",
    });
  }
}

run().catch((error) => {
  process.stderr.write(String(error && error.message ? error.message : error) + "\n");
  process.exit(1);
});
NODE
  )
}

show_mobile_bootstrap() {
  local setup_url
  setup_url="$(pick_setup_url)"
  local qr_file="${RUNTIME_DIR}/phone-codex-mobile-setup-qr.png"

  if [[ "${TLS_INSECURE_SKIP_VERIFY}" == "1" ]]; then
    echo "Cert Note: self-signed certificate in use; first visit may show NET::ERR_CERT_AUTHORITY_INVALID."
    echo "           To remove warning, provide a trusted cert via TLS_MODE=custom."
  fi

  echo "Setup URL : ${setup_url}"
  if [[ "${QR_READY}" != "1" ]]; then
    echo "Setup QR  : unavailable (qrcode dependency is not ready)"
  elif render_setup_qr "${setup_url}" "${qr_file}"; then
    echo "Setup QR  : ${qr_file}"
    open "${qr_file}" >/dev/null 2>&1 || true
  else
    echo "Setup QR  : unavailable (failed to render terminal/PNG QR)"
  fi

  open "${setup_url}" >/dev/null 2>&1 || true
}

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is not installed or not in PATH."
  read -r -p "Press Enter to close..."
  exit 1
fi

if [[ ! -d "${ROOT_DIR}/node_modules" ]]; then
  echo "Installing dependencies (first run only)..."
  (cd "${ROOT_DIR}" && npm install)
fi

if ! ensure_qrcode_module; then
  QR_READY="0"
  echo "WARN: qrcode dependency is unavailable; setup QR will be skipped."
fi

if [[ -f "${PID_FILE}" ]]; then
  OLD_PID="$(cat "${PID_FILE}" 2>/dev/null || true)"
  if is_pid_running "${OLD_PID}" && wait_for_health; then
    echo "phone-codex is already running (PID ${OLD_PID})."
    print_urls
    echo "Log file : ${LOG_FILE}"
    show_mobile_bootstrap
    read -r -p "Press Enter to close..."
    exit 0
  fi
  rm -f "${PID_FILE}"
fi

LISTENING_PIDS="$(lsof -tiTCP:${PORT} -sTCP:LISTEN 2>/dev/null || true)"
if [[ -n "${LISTENING_PIDS}" ]]; then
  if wait_for_health; then
    echo "phone-codex is already running on port ${PORT}."
    print_urls
    echo "Log file : ${LOG_FILE}"
    show_mobile_bootstrap
    read -r -p "Press Enter to close..."
    exit 0
  fi
  echo "ERROR: Port ${PORT} is already in use by another process:"
  echo "${LISTENING_PIDS}" | xargs -n1 ps -p 2>/dev/null || true
  read -r -p "Press Enter to close..."
  exit 1
fi

echo "Starting phone-codex..."
echo "Mode     : $( [[ "${REQUIRE_LOGIN}" == "1" ]] && echo "password login" || echo "open (no password)" )"
echo "Bind host: ${BIND_HOST}"
echo "Port     : ${PORT}"
echo "HTTPS    : enabled"
echo "TLS mode : ${TLS_MODE}"
echo "TLS cert : ${TLS_CERT_FILE}"
echo "Remote   : ${REMOTE_MODE}"
if [[ "${TLS_INSECURE_SKIP_VERIFY}" == "1" ]]; then
  echo "TLS verify: skipped for local checks (self-signed cert)"
fi

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
    HTTPS_ENABLED="1" \
    HTTPS_CERT_FILE="${TLS_CERT_FILE}" \
    HTTPS_KEY_FILE="${TLS_KEY_FILE}" \
    HTTPS_CA_FILE="${TLS_CA_FILE}" \
    HTTPS_REDIRECT_PORT="${HTTPS_REDIRECT_PORT}" \
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

show_mobile_bootstrap
read -r -p "Press Enter to close..."
