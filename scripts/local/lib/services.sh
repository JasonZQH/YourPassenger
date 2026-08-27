# shellcheck shell=bash

SERVICES=(auth-service profile-service session-service conversation-service chat-agent-service app-server)
DB_SERVICES=(auth-service profile-service session-service)

trim_whitespace() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

validate_service_name() {
  case "$1" in
    auth-service|profile-service|session-service|conversation-service|chat-agent-service|app-server) return 0 ;;
    *) return 1 ;;
  esac
}

service_in_list() {
  local target="$1"
  shift
  local item
  for item in "$@"; do
    if [[ "$item" == "$target" ]]; then
      return 0
    fi
  done
  return 1
}

parse_skip_services() {
  SKIP_SERVICES=()
  local raw="${SKIP:-}"
  local token
  local normalized

  if [[ -z "$(trim_whitespace "$raw")" ]]; then
    return 0
  fi

  IFS=',' read -r -a tokens <<< "$raw"
  for token in "${tokens[@]}"; do
    normalized="$(trim_whitespace "$token")"
    if [[ -z "$normalized" ]]; then
      continue
    fi
    if ! validate_service_name "$normalized"; then
      echo "Unsupported service in SKIP: $normalized" >&2
      return 1
    fi
    if ! service_in_list "$normalized" "${SKIP_SERVICES[@]:-}"; then
      SKIP_SERVICES+=("$normalized")
    fi
  done
}

service_skipped() {
  local service_name="$1"
  service_in_list "$service_name" "${SKIP_SERVICES[@]:-}"
}

filtered_services() {
  local result=()
  local service_name
  for service_name in "$@"; do
    if ! service_skipped "$service_name"; then
      result+=("$service_name")
    fi
  done
  printf '%s' "${result[*]}"
}

active_services() {
  filtered_services "${SERVICES[@]}"
}

populate_active_services_buffer() {
  ACTIVE_SERVICES_BUFFER=()
  local services_line
  services_line="$(filtered_services "$@")"

  if [[ -n "$services_line" ]]; then
    read -r -a ACTIVE_SERVICES_BUFFER <<< "$services_line"
  fi
}

assert_valid_skip_configuration() {
  local dependency
  if ! service_skipped "app-server"; then
    for dependency in auth-service profile-service session-service conversation-service chat-agent-service; do
      if service_skipped "$dependency"; then
        echo "Invalid SKIP configuration: app-server depends on $dependency. Skip app-server as well or keep $dependency enabled." >&2
        return 1
      fi
    done
  fi
}

workspace_for_service() {
  case "$1" in
    auth-service) echo "@yourpassenger/auth-service" ;;
    profile-service) echo "@yourpassenger/profile-service" ;;
    session-service) echo "@yourpassenger/session-service" ;;
    conversation-service) echo "@yourpassenger/conversation-service" ;;
    chat-agent-service) echo "@yourpassenger/chat-agent-service" ;;
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
    chat-agent-service) echo "$CHAT_AGENT_SERVICE_PORT" ;;
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
