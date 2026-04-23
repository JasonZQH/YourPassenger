#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
load_local_env
ensure_local_dirs

LEGACY_LOG_DIR="$LOCAL_DIR/logs"

for service in "${SERVICES[@]}"; do
  cleanup_stale_pid "$service"
  if service_running "$service"; then
    echo "Refusing to clean while $service is still running. Run make local-down first." >&2
    exit 1
  fi
done

rm -rf "$LEGACY_LOG_DIR" "$RUN_DIR"
find "$LOCAL_DIR" -maxdepth 1 -type d -name '*_logs' -prune -exec rm -rf {} + 2>/dev/null || true
mkdir -p "$RUN_DIR"
rm -rf "$ROOT_DIR"/apps/*/dist
rm -rf "$ROOT_DIR"/packages/*/dist

echo "Local run state, archived logs, and build artifacts were cleaned."
