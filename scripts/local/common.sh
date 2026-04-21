#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOCAL_DIR="$ROOT_DIR/.local"
RUN_DIR="$LOCAL_DIR/run"
COMPOSE_FILE="$ROOT_DIR/docker-compose.local.yml"

SERVICES=(auth-service profile-service session-service conversation-service app-server)

redact_postgres_url() {
  node - <<'NODE' "$1"
const [rawUrl] = process.argv.slice(2);

if (!rawUrl) {
  process.exit(1);
}

const url = new URL(rawUrl);
if (url.password) {
  url.password = '***';
}
console.log(url.toString());
NODE
}

load_local_env() {
  export DOCKER="${DOCKER:-0}"
  export APP_SERVER_PORT="${APP_SERVER_PORT:-3000}"
  export AUTH_SERVICE_PORT="${AUTH_SERVICE_PORT:-3101}"
  export PROFILE_SERVICE_PORT="${PROFILE_SERVICE_PORT:-3102}"
  export SESSION_SERVICE_PORT="${SESSION_SERVICE_PORT:-3103}"
  export CONVERSATION_SERVICE_PORT="${CONVERSATION_SERVICE_PORT:-3104}"

  export LOCAL_POSTGRES_USER="${LOCAL_POSTGRES_USER:-db_user}"
  export LOCAL_POSTGRES_PASSWORD="${LOCAL_POSTGRES_PASSWORD:-db_password}"
  export DOCKER_POSTGRES_PORT="${DOCKER_POSTGRES_PORT:-5432}"

  if [[ -f "$ROOT_DIR/.env.local" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ROOT_DIR/.env.local"
    set +a
  fi

  if docker_mode_enabled; then
    export AUTH_DATABASE_URL="${AUTH_DATABASE_URL:-postgresql://${LOCAL_POSTGRES_USER}:${LOCAL_POSTGRES_PASSWORD}@localhost:${DOCKER_POSTGRES_PORT}/yourpassenger_auth?schema=public}"
    export PROFILE_DATABASE_URL="${PROFILE_DATABASE_URL:-postgresql://${LOCAL_POSTGRES_USER}:${LOCAL_POSTGRES_PASSWORD}@localhost:${DOCKER_POSTGRES_PORT}/yourpassenger_profile?schema=public}"
    export SESSION_DATABASE_URL="${SESSION_DATABASE_URL:-postgresql://${LOCAL_POSTGRES_USER}:${LOCAL_POSTGRES_PASSWORD}@localhost:${DOCKER_POSTGRES_PORT}/yourpassenger_session?schema=public}"
  fi

  export AUTH_SERVICE_BASE_URL="${AUTH_SERVICE_BASE_URL:-http://localhost:${AUTH_SERVICE_PORT}}"
  export PROFILE_SERVICE_BASE_URL="${PROFILE_SERVICE_BASE_URL:-http://localhost:${PROFILE_SERVICE_PORT}}"
  export SESSION_SERVICE_BASE_URL="${SESSION_SERVICE_BASE_URL:-http://localhost:${SESSION_SERVICE_PORT}}"
  export CONVERSATION_SERVICE_BASE_URL="${CONVERSATION_SERVICE_BASE_URL:-http://localhost:${CONVERSATION_SERVICE_PORT}}"
}

docker_mode_enabled() {
  [[ "${DOCKER:-0}" == "1" ]]
}

initialize_run_context() {
  export LOCAL_RUN_ID="${LOCAL_RUN_ID:-$(date +%Y%m%d-%H%M%S)}"
  export LOG_ARCHIVE_DIR="$LOCAL_DIR/${LOCAL_RUN_ID}_logs"
}

ensure_local_dirs() {
  mkdir -p "$RUN_DIR"
  if [[ -n "${LOG_ARCHIVE_DIR:-}" ]]; then
    mkdir -p "$LOG_ARCHIVE_DIR"
  fi
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose -f "$COMPOSE_FILE" "$@"
    return
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f "$COMPOSE_FILE" "$@"
    return
  fi

  echo "Docker Compose is required." >&2
  exit 1
}

port_is_available() {
  local port="$1"
  node -e "
    const net = require('net');
    const port = Number(process.argv[1]);
    const server = net.createServer();
    server.unref();
    server.on('error', () => process.exit(1));
    server.listen({ host: '127.0.0.1', port }, () => {
      server.close(() => process.exit(0));
    });
  " "$port" >/dev/null 2>&1
}

assign_docker_postgres_port() {
  if ! docker_mode_enabled; then
    return 0
  fi

  if [[ -n "${DOCKER_POSTGRES_PORT:-}" ]] && port_is_available "$DOCKER_POSTGRES_PORT"; then
    export DOCKER_POSTGRES_PORT
    return 0
  fi

  if [[ -z "${DOCKER_POSTGRES_PORT:-}" ]] && port_is_available 5432; then
    export DOCKER_POSTGRES_PORT=5432
    return 0
  fi

  local candidate
  for candidate in $(seq 55432 55480); do
    if port_is_available "$candidate"; then
      export DOCKER_POSTGRES_PORT="$candidate"
      return 0
    fi
  done

  echo "Unable to find an available host port for Docker PostgreSQL." >&2
  exit 1
}

workspace_for_service() {
  case "$1" in
    auth-service) echo "@yourpassenger/auth-service" ;;
    profile-service) echo "@yourpassenger/profile-service" ;;
    session-service) echo "@yourpassenger/session-service" ;;
    conversation-service) echo "@yourpassenger/conversation-service" ;;
    app-server) echo "@yourpassenger/app-server" ;;
    *)
      echo "Unknown service: $1" >&2
      exit 1
      ;;
  esac
}

port_for_service() {
  case "$1" in
    auth-service) echo "$AUTH_SERVICE_PORT" ;;
    profile-service) echo "$PROFILE_SERVICE_PORT" ;;
    session-service) echo "$SESSION_SERVICE_PORT" ;;
    conversation-service) echo "$CONVERSATION_SERVICE_PORT" ;;
    app-server) echo "$APP_SERVER_PORT" ;;
    *)
      echo "Unknown service: $1" >&2
      exit 1
      ;;
  esac
}

readiness_url_for_service() {
  local service_name="$1"
  echo "http://localhost:$(port_for_service "$service_name")/v1/health/ready"
}

pid_file_for_service() {
  echo "$RUN_DIR/$1.pid"
}

log_file_for_service() {
  echo "$LOG_ARCHIVE_DIR/$1.log"
}

migration_log_file() {
  echo "$LOG_ARCHIVE_DIR/migrations.log"
}

initialize_migration_log() {
  local log_file
  log_file="$(migration_log_file)"

  cat > "$log_file" <<EOF
[$(date '+%Y-%m-%d %H:%M:%S')] local-up migration session
mode=$(docker_mode_enabled && echo docker || echo host)
auth_db=$(redact_postgres_url "$AUTH_DATABASE_URL")
profile_db=$(redact_postgres_url "$PROFILE_DATABASE_URL")
session_db=$(redact_postgres_url "$SESSION_DATABASE_URL")

EOF
}

run_migration_command() {
  local label="$1"
  shift
  local log_file
  log_file="$(migration_log_file)"

  {
    printf '=== [%s] %s ===\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$label"
    "$@"
    printf '=== [%s] %s: success ===\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$label"
  } 2>&1 | sed -e "s/^/[migration:${label}] /" | tee -a "$log_file"
}

service_pid() {
  local file
  file="$(pid_file_for_service "$1")"
  if [[ -f "$file" ]]; then
    tr -d '[:space:]' < "$file"
  fi
}

is_pid_running() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

service_running() {
  local pid
  pid="$(service_pid "$1")"
  is_pid_running "$pid"
}

cleanup_stale_pid() {
  local service_name="$1"
  local pid_file
  pid_file="$(pid_file_for_service "$service_name")"
  if [[ -f "$pid_file" ]] && ! service_running "$service_name"; then
    rm -f "$pid_file"
  fi
}

start_service() {
  local service_name="$1"
  local workspace
  workspace="$(workspace_for_service "$service_name")"
  local pid_file
  pid_file="$(pid_file_for_service "$service_name")"
  local log_file
  log_file="$(log_file_for_service "$service_name")"

  cleanup_stale_pid "$service_name"

  if service_running "$service_name"; then
    echo "$service_name is already running (pid $(service_pid "$service_name"))."
    return
  fi

  (
    cd "$ROOT_DIR"
    exec npm run start:dev -w "$workspace" \
      > >(
        while IFS= read -r line; do
          printf '[%s] %s\n' "$service_name" "$line" | tee -a "$log_file"
        done
      ) \
      2> >(
        while IFS= read -r line; do
          printf '[%s] %s\n' "$service_name" "$line" | tee -a "$log_file" >&2
        done
      )
  ) &
  echo $! > "$pid_file"

  echo "Started $service_name (pid $(service_pid "$service_name"))."
}

stop_service() {
  local service_name="$1"
  local pid_file
  pid_file="$(pid_file_for_service "$service_name")"

  if [[ ! -f "$pid_file" ]]; then
    return
  fi

  local pid
  pid="$(service_pid "$service_name")"
  if [[ -z "$pid" ]]; then
    rm -f "$pid_file"
    return
  fi

  if ! is_pid_running "$pid"; then
    rm -f "$pid_file"
    return
  fi

  kill "$pid"

  for _ in $(seq 1 20); do
    if ! is_pid_running "$pid"; then
      rm -f "$pid_file"
      echo "Stopped $service_name."
      return
    fi
    sleep 0.5
  done

  kill -9 "$pid" 2>/dev/null || true
  rm -f "$pid_file"
  echo "Force-stopped $service_name."
}

database_name_from_url() {
  local url="$1"
  local without_credentials="${url#*@}"
  local path_part="${without_credentials#*/}"
  echo "${path_part%%\?*}"
}

wait_for_postgres() {
  if ! docker_mode_enabled; then
    local urls=("$AUTH_DATABASE_URL" "$PROFILE_DATABASE_URL" "$SESSION_DATABASE_URL")
    local url
    local label
    local redacted_url
    local attempt

    for label in auth profile session; do
      case "$label" in
        auth) url="$AUTH_DATABASE_URL" ;;
        profile) url="$PROFILE_DATABASE_URL" ;;
        session) url="$SESSION_DATABASE_URL" ;;
      esac

      redacted_url="$(redact_postgres_url "$url")"
      echo "Waiting for PostgreSQL target [$label]: $redacted_url"

      for attempt in $(seq 1 60); do
        if node -e "
          const { URL } = require('url');
          const net = require('net');
          const url = new URL(process.argv[1]);
          const socket = net.createConnection({
            host: url.hostname,
            port: Number(url.port || 5432),
          });
          socket.setTimeout(2000);
          socket.on('connect', () => { socket.end(); process.exit(0); });
          socket.on('timeout', () => { socket.destroy(); process.exit(1); });
          socket.on('error', () => process.exit(1));
        " "$url" >/dev/null 2>&1; then
          echo "PostgreSQL target [$label] is reachable."
          break
        fi
        if (( attempt == 1 || attempt % 10 == 0 )); then
          echo "Still waiting for [$label] PostgreSQL (${attempt}/60)..."
        fi
        sleep 1
      done

      if ! node -e "
        const { URL } = require('url');
        const net = require('net');
        const url = new URL(process.argv[1]);
        const socket = net.createConnection({
          host: url.hostname,
          port: Number(url.port || 5432),
        });
        socket.setTimeout(2000);
        socket.on('connect', () => { socket.end(); process.exit(0); });
        socket.on('timeout', () => { socket.destroy(); process.exit(1); });
        socket.on('error', () => process.exit(1));
      " "$url" >/dev/null 2>&1; then
        echo "Timed out waiting for PostgreSQL target [$label] at $redacted_url" >&2
        return 1
      fi
    done

    echo "PostgreSQL is reachable for all configured targets."
    return 0
  fi

  for _ in $(seq 1 60); do
    if compose exec -T postgres pg_isready -U "$LOCAL_POSTGRES_USER" -d postgres >/dev/null 2>&1; then
      echo "Postgres is ready."
      return 0
    fi
    sleep 1
  done

  echo "Timed out waiting for Postgres." >&2
  return 1
}

wait_for_http() {
  local url="$1"
  local label="$2"

  for _ in $(seq 1 60); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "$label is ready."
      return 0
    fi
    sleep 1
  done

  echo "Timed out waiting for $label at $url" >&2
  return 1
}

ensure_database() {
  local database_url="$1"
  if ! docker_mode_enabled; then
    return 0
  fi

  local database_name
  database_name="$(database_name_from_url "$database_url")"
  if [[ ! "$database_name" =~ ^[A-Za-z0-9_]+$ ]]; then
    echo "Refusing to create database with unsupported name: $database_name" >&2
    return 1
  fi

  local exists
  exists="$(compose exec -T postgres psql -U "$LOCAL_POSTGRES_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$database_name'")"
  if [[ "$exists" == "1" ]]; then
    echo "Database $database_name already exists."
    return 0
  fi

  compose exec -T postgres psql -U "$LOCAL_POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$database_name\";" >/dev/null
  echo "Created database $database_name."
}

ensure_postgres_databases() {
  ensure_database "$AUTH_DATABASE_URL"
  ensure_database "$PROFILE_DATABASE_URL"
  ensure_database "$SESSION_DATABASE_URL"
}

stop_local_environment() {
  if docker_mode_enabled; then
    compose down >/dev/null || true
    return
  fi

  for service in app-server conversation-service session-service profile-service auth-service; do
    stop_service "$service"
  done

}

monitor_services() {
  while true; do
    for service in "${SERVICES[@]}"; do
      cleanup_stale_pid "$service"
      if ! service_running "$service"; then
        echo "$service exited unexpectedly." >&2
        return 1
      fi
    done
    sleep 1
  done
}

follow_docker_logs() {
  local compose_log_pids=()
  local service

  for service in "${SERVICES[@]}"; do
    local log_file
    log_file="$(log_file_for_service "$service")"
    (
      compose logs -f --no-color "$service" | tee -a "$log_file"
    ) &
    compose_log_pids+=("$!")
  done

  while true; do
    for service in "${SERVICES[@]}"; do
      if ! compose ps --status running --services 2>/dev/null | grep -Fxq "$service"; then
        echo "$service container is not running." >&2
        kill "${compose_log_pids[@]}" 2>/dev/null || true
        return 1
      fi
    done
    sleep 1
  done
}

write_env_snapshot() {
  cat > "$RUN_DIR/local.env.snapshot" <<SNAPSHOT
APP_SERVER_PORT=$APP_SERVER_PORT
AUTH_SERVICE_PORT=$AUTH_SERVICE_PORT
PROFILE_SERVICE_PORT=$PROFILE_SERVICE_PORT
SESSION_SERVICE_PORT=$SESSION_SERVICE_PORT
CONVERSATION_SERVICE_PORT=$CONVERSATION_SERVICE_PORT
AUTH_SERVICE_BASE_URL=$AUTH_SERVICE_BASE_URL
PROFILE_SERVICE_BASE_URL=$PROFILE_SERVICE_BASE_URL
SESSION_SERVICE_BASE_URL=$SESSION_SERVICE_BASE_URL
CONVERSATION_SERVICE_BASE_URL=$CONVERSATION_SERVICE_BASE_URL
AUTH_DATABASE_URL=$AUTH_DATABASE_URL
PROFILE_DATABASE_URL=$PROFILE_DATABASE_URL
SESSION_DATABASE_URL=$SESSION_DATABASE_URL
PUBLIC_WS_BASE_URL=${PUBLIC_WS_BASE_URL:-}
LOG_ARCHIVE_DIR=${LOG_ARCHIVE_DIR:-}
DOCKER=${DOCKER:-0}
SNAPSHOT
}
