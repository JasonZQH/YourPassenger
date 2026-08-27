# shellcheck shell=bash

pid_file_for_service() {
  echo "$RUN_DIR/$1.pid"
}

current_log_archive_dir() {
  echo "${LOG_ARCHIVE_DIR:-$LOCAL_DIR}"
}

log_file_for_service() {
  echo "$(current_log_archive_dir)/$1.log"
}

migration_log_file() {
  echo "$(current_log_archive_dir)/migrations.log"
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

command_for_pid() {
  local pid="$1"
  ps -p "$pid" -o comm= 2>/dev/null | tr -d '[:space:]'
}

is_node_family_command() {
  local command_name="$1"
  case "$command_name" in
    *node|*npm|*npx) return 0 ;;
    *) return 1 ;;
  esac
}

cleanup_service_port() {
  local service_name="$1"
  local port
  port="$(port_for_service "$service_name")"

  if ! command -v lsof >/dev/null 2>&1; then
    return 0
  fi

  local pid
  while IFS= read -r pid; do
    if [[ -z "$pid" ]]; then
      continue
    fi

    local command_name
    command_name="$(command_for_pid "$pid")"
    if ! is_node_family_command "$command_name"; then
      echo "Port $port is held by non-node process $pid ($command_name); leaving it alone." >&2
      continue
    fi

    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 20); do
      if ! is_pid_running "$pid"; then
        echo "Stopped residual process on port $port for $service_name."
        break
      fi
      sleep 0.25
    done

    if is_pid_running "$pid"; then
      kill -9 "$pid" 2>/dev/null || true
      echo "Force-stopped residual process on port $port for $service_name."
    fi
  done < <(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
}

cleanup_service_ports() {
  local service_name
  for service_name in "${SERVICES[@]}"; do
    cleanup_service_port "$service_name"
  done
}

monitor_services() {
  local active_services_line
  active_services_line="$(active_services)"
  local monitored_services=()

  if [[ -n "$active_services_line" ]]; then
    read -r -a monitored_services <<< "$active_services_line"
  fi

  while true; do
    for service in "${monitored_services[@]}"; do
      cleanup_stale_pid "$service"
      if ! service_running "$service"; then
        echo "$service exited unexpectedly." >&2
        return 1
      fi
    done
    sleep 1
  done
}

stop_local_environment() {
  if docker_mode_enabled; then
    compose down >/dev/null || true
    return
  fi

  for service in app-server chat-agent-service conversation-service session-service profile-service auth-service; do
    stop_service "$service"
  done
  cleanup_service_ports
}
