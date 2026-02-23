#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT_DIR}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "ERROR: not a git repository: ${ROOT_DIR}" >&2
  exit 1
fi

if ! command -v rg >/dev/null 2>&1; then
  echo "ERROR: rg (ripgrep) is required for safety scan." >&2
  exit 1
fi

tmp_matches="$(mktemp)"
trap 'rm -f "${tmp_matches}"' EXIT

git ls-files -z \
  | xargs -0 rg -n --no-heading --color=never \
      -e "https?://([0-9]{1,3}\\.){3}[0-9]{1,3}(:[0-9]+)?" \
      -e "https?://[A-Za-z0-9.-]+\\.ts\\.net(:[0-9]+)?" \
      >"${tmp_matches}" || true

if [[ ! -s "${tmp_matches}" ]]; then
  echo "OK: no static IP / ts.net URLs found in tracked files."
  exit 0
fi

tmp_flagged="$(mktemp)"
trap 'rm -f "${tmp_matches}" "${tmp_flagged}"' EXIT

# Allow explicit local-only examples.
rg -v "https?://(127\\.0\\.0\\.1|localhost|\\[::1\\])(:[0-9]+)?" "${tmp_matches}" >"${tmp_flagged}" || true

if [[ -s "${tmp_flagged}" ]]; then
  echo "ERROR: potential sensitive static addresses found:" >&2
  cat "${tmp_flagged}" >&2
  echo >&2
  echo "Please replace them with runtime-generated values or generic placeholders." >&2
  exit 1
fi

echo "OK: no sensitive static addresses found (local-only URLs ignored)."
