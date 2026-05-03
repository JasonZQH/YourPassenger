#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
load_local_env
parse_skip_services
assert_valid_skip_configuration
assign_docker_postgres_port
initialize_run_context
ensure_local_dirs
write_env_snapshot

require_command npm
require_command curl

print_skip_summary() {
  if (( ${#SKIP_SERVICES[@]} > 0 )); then
    echo "Skipping services: ${SKIP_SERVICES[*]}"
  fi
}

ensure_required_config() {
  if [[ -z "${AUTH_TOKEN_SECRET:-}" ]]; then
    echo "Missing AUTH_TOKEN_SECRET. Copy .env.example to .env.local and set it there." >&2
    exit 1
  fi
}

ensure_active_services_available() {
  if db_only_mode_enabled; then
    return 0
  fi

  local active_services_summary
  active_services_summary="$(active_services_text "${SERVICES[@]}")"
  if [[ -z "$active_services_summary" ]]; then
    echo "No active services remain after applying SKIP. Use make db-up if you only want PostgreSQL." >&2
    exit 1
  fi

  echo "Active services: $active_services_summary"
}

populate_requested_services() {
  populate_active_services_buffer "$@"
}

active_services_text() {
  populate_requested_services "$@"
  printf '%s' "${ACTIVE_SERVICES_BUFFER[*]}"
}

run_for_active_services() {
  local empty_message="$1"
  local summary_message="$2"
  local callback_name="$3"
  shift 3

  populate_requested_services "$@"

  if [[ ${#ACTIVE_SERVICES_BUFFER[@]} -eq 0 ]]; then
    echo "$empty_message"
    return 0
  fi

  echo "$summary_message ${ACTIVE_SERVICES_BUFFER[*]}"
  local service
  for service in "${ACTIVE_SERVICES_BUFFER[@]}"; do
    "$callback_name" "$service"
  done
}

run_host_prisma_generate_for_service() {
  local service="$1"
  npm run prisma:generate -w "$(workspace_for_service "$service")"
}

run_host_migration_for_service() {
  local service="$1"
  run_migration_command "$service" npm run prisma:migrate:deploy -w "$(workspace_for_service "$service")"
}

run_docker_migration_for_service() {
  local service="$1"
  run_migration_command "$service" compose run --rm "$service" npm run prisma:migrate:deploy -w "$(workspace_for_service "$service")"
}

run_host_prisma_generate() {
  run_for_active_services \
    "Skipping Prisma generate (no active DB-backed services)." \
    "Generating Prisma clients for:" \
    run_host_prisma_generate_for_service \
    "${DB_SERVICES[@]}"
}

run_host_migrations() {
  run_for_active_services \
    "Skipping Prisma migrations (no active DB-backed services)." \
    "Applying Prisma migrations for:" \
    run_host_migration_for_service \
    "${DB_SERVICES[@]}"
}

run_docker_migrations() {
  run_for_active_services \
    "Skipping Prisma migrations in Docker (no active DB-backed services)." \
    "Applying Prisma migrations in Docker for:" \
    run_docker_migration_for_service \
    "${DB_SERVICES[@]}"
}

start_active_services() {
  local mode="$1"
  shift
  local service

  case "$mode" in
    host)
      for service in "$@"; do
        start_service "$service"
      done
      ;;
    docker)
      compose up -d "$@"
      ;;
    *)
      echo "Unsupported start mode: $mode" >&2
      exit 1
      ;;
  esac

  for service in "$@"; do
    wait_for_http "$(readiness_url_for_service "$service")" "$service"
  done
}

start_layer() {
  local layer_name="$1"
  shift

  populate_requested_services "$@"

  if [[ ${#ACTIVE_SERVICES_BUFFER[@]} -eq 0 ]]; then
    echo "Skipping $layer_name layer (no active services)."
    return 0
  fi

  if docker_mode_enabled; then
    echo "Starting $layer_name layer in Docker: ${ACTIVE_SERVICES_BUFFER[*]}"
    start_active_services docker "${ACTIVE_SERVICES_BUFFER[@]}"
  else
    echo "Starting $layer_name layer: ${ACTIVE_SERVICES_BUFFER[*]}"
    start_active_services host "${ACTIVE_SERVICES_BUFFER[@]}"
  fi
}

build_active_docker_images() {
  run_for_active_services \
    "Skipping Docker image build (no active services)." \
    "Building service images for:" \
    compose_build_service \
    "${SERVICES[@]}"
}

compose_build_service() {
  local service="$1"
  compose build "$service"
}

preflight_docker_mode() {
  if db_only_mode_enabled; then
    echo "Starting database-only environment in Docker mode."
  else
    echo "Starting local environment in Docker mode."
  fi
  echo "Docker PostgreSQL host port: $DOCKER_POSTGRES_PORT"
  require_command docker
  if [[ -n "$(compose ps --status running --services 2>/dev/null | grep -vx 'postgres' || true)" ]] && ! db_only_mode_enabled; then
    echo "Refusing to start while Docker local services are already running. Run make local-down DOCKER=1 first." >&2
    exit 1
  fi
}

preflight_host_mode() {
  if db_only_mode_enabled; then
    echo "DB_ONLY=1 requires DOCKER=1." >&2
    exit 1
  fi
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
}

run_preflight_phase() {
  ensure_required_config
  print_skip_summary
  ensure_active_services_available

  if docker_mode_enabled; then
    preflight_docker_mode
  else
    preflight_host_mode
  fi
}

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

run_database_phase() {
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
}

print_database_only_summary() {
  echo ""
  echo "Database-only environment is up."
  echo "- postgres:   localhost:$DOCKER_POSTGRES_PORT"
  echo "- snapshot:   $RUN_DIR/local.env.snapshot"
}

run_migration_phase() {
  initialize_migration_log
  echo "Migration log: $(migration_log_file)"

  if docker_mode_enabled; then
    build_active_docker_images

    run_docker_migrations
    return 0
  fi

  cd "$ROOT_DIR"
  run_host_prisma_generate
  run_host_migrations
}

run_service_startup_phase() {
  start_layer "core" auth-service profile-service session-service conversation-service
  start_layer "gateway" app-server
}

print_runtime_summary() {
  echo ""
  echo "Local environment is up."
  echo "- app-server: http://localhost:$APP_SERVER_PORT/v1"
  echo "- realtime:   ws://localhost:$APP_SERVER_PORT/v1/realtime"
  echo "- logs:       $LOG_ARCHIVE_DIR"
  echo "- migrations: $(migration_log_file)"
  echo "- snapshot:   $RUN_DIR/local.env.snapshot"
  echo "- stop:       Ctrl+C"
}

attach_runtime_logs() {
  if docker_mode_enabled; then
    follow_docker_logs
  else
    monitor_services
  fi
}

run_preflight_phase
run_database_phase

if db_only_mode_enabled; then
  print_database_only_summary
  exit 0
fi

run_migration_phase
run_service_startup_phase
print_runtime_summary
attach_runtime_logs
