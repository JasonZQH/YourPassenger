# shellcheck shell=bash

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

wait_for_condition() {
  local ready_message="$1"
  local wait_label="$2"
  local attempts="${3:-60}"
  local interval_seconds="${4:-1}"
  local progress_every="${5:-10}"
  shift 5

  local attempt
  for attempt in $(seq 1 "$attempts"); do
    if "$@"; then
      echo "$ready_message"
      return 0
    fi

    if (( attempt == 1 || attempt % progress_every == 0 )); then
      echo "Still waiting for $wait_label (${attempt}/${attempts})..."
    fi
    sleep "$interval_seconds"
  done

  echo "Timed out waiting for $wait_label" >&2
  return 1
}

tcp_target_reachable() {
  local host="$1"
  local port="$2"

  node -e "
    const net = require('net');
    const socket = net.createConnection({
      host: process.argv[1],
      port: Number(process.argv[2]),
    });
    socket.setTimeout(2000);
    socket.on('connect', () => { socket.end(); process.exit(0); });
    socket.on('timeout', () => { socket.destroy(); process.exit(1); });
    socket.on('error', () => process.exit(1));
  " "$host" "$port" >/dev/null 2>&1
}

tcp_target_reachable_from_url() {
  local url="$1"
  local parsed
  parsed="$(node -e "
    const { URL } = require('url');
    const parsed = new URL(process.argv[1]);
    process.stdout.write(parsed.hostname + '\n' + String(Number(parsed.port || 5432)));
  " "$url")"
  local host="${parsed%%$'\n'*}"
  local port="${parsed##*$'\n'}"
  tcp_target_reachable "$host" "$port"
}

http_target_ready() {
  local url="$1"
  curl -fsS "$url" >/dev/null 2>&1
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

database_name_from_url() {
  local url="$1"
  local without_credentials="${url#*@}"
  local path_part="${without_credentials#*/}"
  echo "${path_part%%\?*}"
}

docker_postgres_ready() {
  compose exec -T postgres pg_isready -U "$LOCAL_POSTGRES_USER" -d postgres >/dev/null 2>&1
}

wait_for_postgres() {
  if ! docker_mode_enabled; then
    local url
    local label
    local redacted_url

    for label in auth profile session; do
      case "$label" in
        auth) url="$AUTH_DATABASE_URL" ;;
        profile) url="$PROFILE_DATABASE_URL" ;;
        session) url="$SESSION_DATABASE_URL" ;;
      esac

      redacted_url="$(redact_postgres_url "$url")"
      echo "Waiting for PostgreSQL target [$label]: $redacted_url"

      if ! wait_for_condition \
        "PostgreSQL target [$label] is reachable." \
        "[$label] PostgreSQL" \
        60 \
        1 \
        10 \
        tcp_target_reachable_from_url \
        "$url"; then
        echo "Final target for [$label]: $redacted_url" >&2
        return 1
      fi
    done

    echo "PostgreSQL is reachable for all configured targets."
    return 0
  fi

  wait_for_condition \
    "Postgres is ready." \
    "Postgres" \
    60 \
    1 \
    10 \
    docker_postgres_ready
}

wait_for_http() {
  local url="$1"
  local label="$2"
  if ! wait_for_condition \
    "$label is ready." \
    "$label at $url" \
    60 \
    1 \
    10 \
    http_target_ready \
    "$url"; then
    echo "Final health target: $url" >&2
    return 1
  fi
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

stop_local_database() {
  compose stop postgres >/dev/null || true
}

follow_docker_logs() {
  local active_services_line
  active_services_line="$(active_services)"
  local logged_services=()

  if [[ -n "$active_services_line" ]]; then
    read -r -a logged_services <<< "$active_services_line"
  fi

  local compose_log_pids=()
  local service

  for service in "${logged_services[@]}"; do
    local log_file
    log_file="$(log_file_for_service "$service")"
    (
      compose logs -f --no-color "$service" | tee -a "$log_file"
    ) &
    compose_log_pids+=("$!")
  done

  while true; do
    for service in "${logged_services[@]}"; do
      if ! compose ps --status running --services 2>/dev/null | grep -Fxq "$service"; then
        echo "$service container is not running." >&2
        kill "${compose_log_pids[@]}" 2>/dev/null || true
        return 1
      fi
    done
    sleep 1
  done
}
