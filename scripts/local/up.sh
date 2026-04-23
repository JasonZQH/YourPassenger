#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
load_local_env
assign_docker_postgres_port
initialize_run_context
ensure_local_dirs
write_env_snapshot

require_command npm
require_command curl

if [[ -z "${AUTH_TOKEN_SECRET:-}" ]]; then
  echo "Missing AUTH_TOKEN_SECRET. Copy .env.example to .env.local and set it there." >&2
  exit 1
fi

if docker_mode_enabled; then
  echo "Starting local environment in Docker mode."
  echo "Docker PostgreSQL host port: $DOCKER_POSTGRES_PORT"
  require_command docker
  if [[ -n "$(compose ps -q 2>/dev/null)" ]]; then
    echo "Refusing to start while Docker local services are already running. Run make local-down DOCKER=1 first." >&2
    exit 1
  fi
else
  if [[ -z "${AUTH_DATABASE_URL:-}" || -z "${PROFILE_DATABASE_URL:-}" || -z "${SESSION_DATABASE_URL:-}" ]]; then
    echo "Host mode could not determine database URLs." >&2
    echo "Copy .env.example to .env.local and set AUTH_DATABASE_URL / PROFILE_DATABASE_URL / SESSION_DATABASE_URL." >&2
    exit 1
  fi

  echo "Starting local environment in host mode."
  echo "PostgreSQL targets:"
  echo "- auth:    $(redact_postgres_url "$AUTH_DATABASE_URL")"
  echo "- profile: $(redact_postgres_url "$PROFILE_DATABASE_URL")"
  echo "- session: $(redact_postgres_url "$SESSION_DATABASE_URL")"
  for service in "${SERVICES[@]}"; do
    cleanup_stale_pid "$service"
    if service_running "$service"; then
      echo "Refusing to start while $service is already running. Run make local-down first." >&2
      exit 1
    fi
  done
fi

shutting_down=0

cleanup() {
  local exit_code="${1:-0}"
  if [[ "$shutting_down" -eq 1 ]]; then
    return
  fi

  shutting_down=1
  stop_local_environment

  if [[ "$exit_code" -eq 130 ]]; then
    echo ""
    echo "Local environment stopped."
  fi
}

trap 'cleanup 130; exit 130' INT TERM
trap 'status=$?; if [[ $status -ne 0 ]]; then cleanup "$status"; fi' EXIT

if docker_mode_enabled; then
  echo "Starting Docker PostgreSQL..."
  compose up -d postgres
fi
echo "Checking PostgreSQL reachability..."
wait_for_postgres
if docker_mode_enabled; then
  echo "Ensuring Docker PostgreSQL databases exist..."
  ensure_postgres_databases
else
  echo "Host mode assumes AUTH/PROFILE/SESSION database URLs point to existing databases."
fi
initialize_migration_log
echo "Migration log: $(migration_log_file)"

if docker_mode_enabled; then
  echo "Building service images..."
  compose build auth-service profile-service session-service conversation-service app-server

  echo "Applying Prisma migrations in containers..."
  run_migration_command auth-service compose run --rm auth-service npm run prisma:migrate:deploy -w @yourpassenger/auth-service
  run_migration_command profile-service compose run --rm profile-service npm run prisma:migrate:deploy -w @yourpassenger/profile-service
  run_migration_command session-service compose run --rm session-service npm run prisma:migrate:deploy -w @yourpassenger/session-service

  echo "Starting service containers..."
  compose up -d auth-service profile-service session-service conversation-service app-server

  for service in auth-service profile-service session-service conversation-service app-server; do
    wait_for_http "$(readiness_url_for_service "$service")" "$service"
  done
else
  cd "$ROOT_DIR"
  echo "Generating Prisma clients..."
  npm run prisma:generate -w @yourpassenger/auth-service
  npm run prisma:generate -w @yourpassenger/profile-service
  npm run prisma:generate -w @yourpassenger/session-service

  echo "Applying Prisma migrations..."
  run_migration_command auth-service npm run prisma:migrate:deploy -w @yourpassenger/auth-service
  run_migration_command profile-service npm run prisma:migrate:deploy -w @yourpassenger/profile-service
  run_migration_command session-service npm run prisma:migrate:deploy -w @yourpassenger/session-service

  echo "Starting services..."
  for service in auth-service profile-service session-service conversation-service app-server; do
    start_service "$service"
    wait_for_http "$(readiness_url_for_service "$service")" "$service"
  done
fi

echo ""
echo "Local environment is up."
echo "- app-server: http://localhost:$APP_SERVER_PORT/v1"
echo "- realtime:   ws://localhost:$APP_SERVER_PORT/v1/realtime"
echo "- logs:       $LOG_ARCHIVE_DIR"
echo "- migrations: $(migration_log_file)"
echo "- snapshot:   $RUN_DIR/local.env.snapshot"
echo "- stop:       Ctrl+C"

if docker_mode_enabled; then
  follow_docker_logs
else
  monitor_services
fi
