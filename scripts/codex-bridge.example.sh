#!/usr/bin/env bash
set -euo pipefail

PROMPT="${1:-}"
if [[ -z "${PROMPT}" ]]; then
  echo "Missing prompt" >&2
  exit 1
fi

# 将下面命令替换为你本机可用的 Codex CLI 调用方式。
# 例如：
# codex exec --prompt "${PROMPT}"
echo "Please edit scripts/codex-bridge.example.sh with your Codex CLI command."
echo "Prompt:"
echo "${PROMPT}"
