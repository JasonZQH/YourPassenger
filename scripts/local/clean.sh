#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
load_local_env

LEGACY_LOG_DIR="$LOCAL_DIR/logs"

if docker_mode_enabled; then
  compose down -v --remove-orphans >/dev/null || true
else
  stop_local_environment
fi

rm -rf "$LEGACY_LOG_DIR" "$RUN_DIR"
find "$LOCAL_DIR" -maxdepth 1 -type d -name '*_logs' -prune -exec rm -rf {} + 2>/dev/null || true
mkdir -p "$RUN_DIR"
rm -rf "$ROOT_DIR"/apps/*/dist
rm -rf "$ROOT_DIR"/packages/*/dist

if docker_mode_enabled; then
  echo "Local Docker state, volumes, archived logs, and build artifacts were cleaned."
else
  echo "Local host run state, archived logs, and build artifacts were cleaned."
fi
