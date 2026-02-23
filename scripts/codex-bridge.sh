#!/usr/bin/env bash
set -euo pipefail

PROMPT="${1:-}"
if [[ -z "${PROMPT}" ]]; then
  echo "Missing prompt" >&2
  exit 1
fi

TMP_OUT="$(mktemp)"
TMP_ERR="$(mktemp)"
cleanup() {
  rm -f "${TMP_OUT}" "${TMP_ERR}"
}
trap cleanup EXIT

CODEX_BIN="${CODEX_BIN:-/Applications/Codex.app/Contents/Resources/codex}"
if [[ ! -x "${CODEX_BIN}" ]]; then
  CODEX_BIN="$(command -v codex || true)"
fi
if [[ -z "${CODEX_BIN}" ]]; then
  echo "Cannot find codex binary. Set CODEX_BIN in environment." >&2
  exit 1
fi

if "${CODEX_BIN}" exec --full-auto --skip-git-repo-check -o "${TMP_OUT}" "${PROMPT}" >/dev/null 2>"${TMP_ERR}"; then
  cat "${TMP_OUT}"
else
  cat "${TMP_ERR}" >&2
  exit 1
fi
