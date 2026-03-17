#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
SYSTEMD_SERVICE="${SYSTEMD_SERVICE:-roguelike-lemonade-stand.service}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1:3001/health}"
DRY_RUN=false

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1"
}

run() {
  if [[ "${DRY_RUN}" == true ]]; then
    printf '[dry-run] %s\n' "$*"
    return
  fi

  "$@"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --branch)
      DEPLOY_BRANCH="${2:?Missing value for --branch}"
      shift 2
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      printf 'Usage: %s [--dry-run] [--branch <name>]\n' "${BASH_SOURCE[0]}" >&2
      exit 1
      ;;
  esac
done

cd "${REPO_DIR}"

log "Deploying branch ${DEPLOY_BRANCH} from ${REPO_DIR}"
run git fetch --prune origin
run git checkout "${DEPLOY_BRANCH}"
run git pull --ff-only origin "${DEPLOY_BRANCH}"

log "Installing dependencies"
run npm ci

log "Building production bundle"
run npm run build

log "Restarting ${SYSTEMD_SERVICE}"
run sudo systemctl restart "${SYSTEMD_SERVICE}"

log "Reloading nginx"
run sudo systemctl reload nginx

log "Checking backend health at ${HEALTHCHECK_URL}"
run curl --fail --silent --show-error "${HEALTHCHECK_URL}"

log "Redeploy complete"
