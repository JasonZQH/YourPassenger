#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
load_local_env

if db_only_mode_enabled; then
  stop_local_database
  echo "Local PostgreSQL is down."
  exit 0
fi

stop_local_environment

echo "Local environment is down."
