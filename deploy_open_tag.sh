#!/usr/bin/env bash
# AIPP Open Tag — Phoenix-safe production deployment
#
# Default mode is read-only preflight. Nothing is deployed unless --deploy is
# supplied. This script never stops, recreates, removes or prunes Phoenix,
# LNbits, Docker volumes or the compose project.

set -Eeuo pipefail
IFS=$'\n\t'

MODE="preflight"
COMPOSE_FILE="${AIPP_COMPOSE_FILE:-docker-compose.yml}"
APP_SERVICE="${AIPP_APP_SERVICE:-aipp-key}"
PHOENIX_SERVICE="${AIPP_PHOENIX_SERVICE:-phoenixd}"
APP_DIR="${AIPP_APP_DIR:-$(pwd)}"
BACKUP_DIR="${AIPP_BACKUP_DIR:-$(dirname "$APP_DIR")/aipp-backups}"
HEALTH_URL="${AIPP_HEALTH_URL:-https://aipp.dev/health}"
TAG_ID="${AIPP_STAGING_TAG_ID:-}"
SKIP_TESTS="false"

usage() {
  cat <<'EOF'
Usage:
  ./deploy_open_tag.sh [options]             # read-only preflight
  ./deploy_open_tag.sh --deploy [options]    # deploy only the AIPP service

Options:
  --deploy                 Perform deployment after all safety checks pass
  --compose-file PATH      Compose file (default: docker-compose.yml)
  --service NAME           AIPP service name (default: aipp-key)
  --phoenix-service NAME   Phoenix service name (default: phoenixd)
  --app-dir PATH           AIPP source directory (default: current directory)
  --backup-dir PATH        Backup destination (default: beside APP_DIR)
  --health-url URL         Public health endpoint
  --tag-id ID              Existing staging tag for HTML/JSON smoke tests
  --skip-tests             Skip npm test; build and smoke checks still run
  -h, --help               Show this help

Environment equivalents:
  AIPP_COMPOSE_FILE, AIPP_APP_SERVICE, AIPP_PHOENIX_SERVICE, AIPP_APP_DIR,
  AIPP_BACKUP_DIR, AIPP_HEALTH_URL, AIPP_STAGING_TAG_ID
EOF
}

log() { printf '[AIPP deploy] %s\n' "$*"; }
die() { printf '[AIPP deploy] ERROR: %s\n' "$*" >&2; exit 1; }

while (($#)); do
  case "$1" in
    --deploy) MODE="deploy" ;;
    --compose-file) shift; COMPOSE_FILE="${1:?missing compose path}" ;;
    --service) shift; APP_SERVICE="${1:?missing service name}" ;;
    --phoenix-service) shift; PHOENIX_SERVICE="${1:?missing Phoenix service name}" ;;
    --app-dir) shift; APP_DIR="${1:?missing app directory}" ;;
    --backup-dir) shift; BACKUP_DIR="${1:?missing backup directory}" ;;
    --health-url) shift; HEALTH_URL="${1:?missing health URL}" ;;
    --tag-id) shift; TAG_ID="${1:?missing tag id}" ;;
    --skip-tests) SKIP_TESTS="true" ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
  shift
done

command -v docker >/dev/null || die "docker is not installed"
docker compose version >/dev/null 2>&1 || die "docker compose is unavailable"
command -v curl >/dev/null || die "curl is not installed"
command -v tar >/dev/null || die "tar is not installed"

APP_DIR="$(cd "$APP_DIR" && pwd -P)"
if [[ "$COMPOSE_FILE" != /* ]]; then COMPOSE_FILE="${APP_DIR}/${COMPOSE_FILE}"; fi
[[ -f "$COMPOSE_FILE" ]] || die "Compose file not found: $COMPOSE_FILE"
[[ -f "${APP_DIR}/package-lock.json" ]] || die "package-lock.json not found in $APP_DIR"
[[ -f "${APP_DIR}/Dockerfile" ]] || die "Dockerfile not found in $APP_DIR"

mapfile -t SERVICES < <(docker compose -f "$COMPOSE_FILE" config --services)
printf '%s\n' "${SERVICES[@]}" | grep -Fxq "$APP_SERVICE" || die "AIPP service '$APP_SERVICE' is not in the compose file"
printf '%s\n' "${SERVICES[@]}" | grep -Fxq "$PHOENIX_SERVICE" || die "Phoenix service '$PHOENIX_SERVICE' is not in the compose file"
[[ "$APP_SERVICE" != "$PHOENIX_SERVICE" ]] || die "AIPP and Phoenix service names cannot be the same"

PHOENIX_CONTAINER="$(docker compose -f "$COMPOSE_FILE" ps -q "$PHOENIX_SERVICE")"
[[ -n "$PHOENIX_CONTAINER" ]] || die "Phoenix container is not running"
PHOENIX_RUNNING="$(docker inspect -f '{{.State.Running}}' "$PHOENIX_CONTAINER")"
[[ "$PHOENIX_RUNNING" == "true" ]] || die "Phoenix container is not healthy/running"
PHOENIX_STARTED="$(docker inspect -f '{{.State.StartedAt}}' "$PHOENIX_CONTAINER")"
PHOENIX_MOUNTS="$(docker inspect -f '{{range .Mounts}}{{.Name}}|{{.Source}}->{{.Destination}};{{end}}' "$PHOENIX_CONTAINER")"
[[ -n "$PHOENIX_MOUNTS" ]] || die "Phoenix has no persistent mount; stop and verify its data storage manually"

log "Preflight passed"
log "Compose: $COMPOSE_FILE"
log "AIPP service: $APP_SERVICE"
log "Phoenix service: $PHOENIX_SERVICE (container $PHOENIX_CONTAINER)"
log "Phoenix persistent mount detected"

if [[ "$MODE" == "preflight" ]]; then
  log "Read-only mode complete. Run again with --deploy to continue."
  exit 0
fi

[[ -f "${APP_DIR}/.env" ]] || die ".env is missing; deployment will not create or replace it"
grep -Eq '^AIPP_RECEIPT_SECRET=.{32,}$' "${APP_DIR}/.env" || die "Set AIPP_RECEIPT_SECRET to at least 32 characters in the existing .env"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RELEASE_BACKUP="${BACKUP_DIR}/${STAMP}"
mkdir -p "$RELEASE_BACKUP"
chmod 700 "$BACKUP_DIR" "$RELEASE_BACKUP"

log "Backing up configuration and application data"
cp -p "${APP_DIR}/.env" "${RELEASE_BACKUP}/env.backup"
chmod 600 "${RELEASE_BACKUP}/env.backup"
cp -p "$COMPOSE_FILE" "${RELEASE_BACKUP}/compose.backup.yml"

if [[ -f "${APP_DIR}/data/aipp.db" ]]; then
  cp -p "${APP_DIR}/data/aipp.db" "${RELEASE_BACKUP}/aipp.db"
  [[ ! -f "${APP_DIR}/data/aipp.db-wal" ]] || cp -p "${APP_DIR}/data/aipp.db-wal" "${RELEASE_BACKUP}/aipp.db-wal"
  [[ ! -f "${APP_DIR}/data/aipp.db-shm" ]] || cp -p "${APP_DIR}/data/aipp.db-shm" "${RELEASE_BACKUP}/aipp.db-shm"
elif [[ -f "${APP_DIR}/aipp.db" ]]; then
  cp -p "${APP_DIR}/aipp.db" "${RELEASE_BACKUP}/aipp.db"
  [[ ! -f "${APP_DIR}/aipp.db-wal" ]] || cp -p "${APP_DIR}/aipp.db-wal" "${RELEASE_BACKUP}/aipp.db-wal"
  [[ ! -f "${APP_DIR}/aipp.db-shm" ]] || cp -p "${APP_DIR}/aipp.db-shm" "${RELEASE_BACKUP}/aipp.db-shm"
else
  log "No host SQLite file found. If AIPP uses a named volume or external DB, confirm its independent backup."
fi

docker inspect "$PHOENIX_CONTAINER" > "${RELEASE_BACKUP}/phoenix-container-before.json"
printf '%s\n' "$PHOENIX_MOUNTS" > "${RELEASE_BACKUP}/phoenix-mounts-before.txt"
APP_CONTAINER_BEFORE="$(docker compose -f "$COMPOSE_FILE" ps -q "$APP_SERVICE")"
if [[ -n "$APP_CONTAINER_BEFORE" ]]; then
  docker inspect "$APP_CONTAINER_BEFORE" > "${RELEASE_BACKUP}/aipp-container-before.json"
fi

cd "$APP_DIR"
log "Installing clean dependencies and building AIPP"
npm ci
npm run build
if [[ "$SKIP_TESTS" != "true" ]]; then npm test; fi

OLD_IMAGE="$(docker inspect -f '{{.Image}}' "$(docker compose -f "$COMPOSE_FILE" ps -q "$APP_SERVICE")" 2>/dev/null || true)"
printf '%s\n' "$OLD_IMAGE" > "${RELEASE_BACKUP}/previous-aipp-image.txt"

log "Building only '$APP_SERVICE'"
docker compose -f "$COMPOSE_FILE" build "$APP_SERVICE"

log "Updating only '$APP_SERVICE' without dependencies"
docker compose -f "$COMPOSE_FILE" up -d --no-deps "$APP_SERVICE"

for attempt in {1..24}; do
  if curl --fail --silent --show-error --max-time 8 "$HEALTH_URL" > "${RELEASE_BACKUP}/health.json"; then
    break
  fi
  if [[ "$attempt" == "24" ]]; then
    docker compose -f "$COMPOSE_FILE" logs --tail=120 "$APP_SERVICE" > "${RELEASE_BACKUP}/aipp-failed.log" 2>&1 || true
    die "AIPP health check failed. Phoenix was not touched. Review $RELEASE_BACKUP"
  fi
  sleep 5
done

PHOENIX_CONTAINER_AFTER="$(docker compose -f "$COMPOSE_FILE" ps -q "$PHOENIX_SERVICE")"
PHOENIX_STARTED_AFTER="$(docker inspect -f '{{.State.StartedAt}}' "$PHOENIX_CONTAINER_AFTER")"
PHOENIX_MOUNTS_AFTER="$(docker inspect -f '{{range .Mounts}}{{.Name}}|{{.Source}}->{{.Destination}};{{end}}' "$PHOENIX_CONTAINER_AFTER")"
[[ "$PHOENIX_CONTAINER_AFTER" == "$PHOENIX_CONTAINER" ]] || die "Phoenix container identity changed unexpectedly"
[[ "$PHOENIX_STARTED_AFTER" == "$PHOENIX_STARTED" ]] || die "Phoenix restarted unexpectedly"
[[ "$PHOENIX_MOUNTS_AFTER" == "$PHOENIX_MOUNTS" ]] || die "Phoenix mounts changed unexpectedly"

if [[ -n "$TAG_ID" ]]; then
  log "Running Open Tag HTML/JSON smoke checks"
  curl --fail --silent --show-error --max-time 10 -H 'Accept: application/json' \
    "${HEALTH_URL%/health}/t/${TAG_ID}" > "${RELEASE_BACKUP}/open-tag.json"
  curl --fail --silent --show-error --max-time 10 -H 'Accept: text/html' \
    "${HEALTH_URL%/health}/t/${TAG_ID}" > "${RELEASE_BACKUP}/open-tag.html"
else
  log "No staging tag ID supplied; Open Tag representation smoke test skipped"
fi

log "Deployment completed"
log "Phoenix container, start time and persistent mounts are unchanged"
log "Backup: $RELEASE_BACKUP"
log "Health: $HEALTH_URL"
