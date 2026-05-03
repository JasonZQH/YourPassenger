# shellcheck shell=bash

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
  export DB_ONLY="${DB_ONLY:-0}"
  export SKIP="${SKIP:-}"
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

db_only_mode_enabled() {
  [[ "${DB_ONLY:-0}" == "1" ]]
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
DB_ONLY=${DB_ONLY:-0}
SKIP=${SKIP:-}
DOCKER_POSTGRES_PORT=$DOCKER_POSTGRES_PORT
SNAPSHOT
}
