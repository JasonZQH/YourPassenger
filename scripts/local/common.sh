#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOCAL_DIR="$ROOT_DIR/.local"
RUN_DIR="$LOCAL_DIR/run"
COMPOSE_FILE="$ROOT_DIR/docker-compose.local.yml"
COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$COMMON_DIR/lib"

# shellcheck source=scripts/local/lib/context.sh
source "$LIB_DIR/context.sh"
# shellcheck source=scripts/local/lib/services.sh
source "$LIB_DIR/services.sh"
# shellcheck source=scripts/local/lib/runtime.sh
source "$LIB_DIR/runtime.sh"
# shellcheck source=scripts/local/lib/infra.sh
source "$LIB_DIR/infra.sh"
