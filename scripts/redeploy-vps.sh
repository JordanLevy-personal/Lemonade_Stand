#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
SYSTEMD_SERVICE="${SYSTEMD_SERVICE:-roguelike-lemonade-stand.service}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1:3001/health}"
HEALTHCHECK_ATTEMPTS="${HEALTHCHECK_ATTEMPTS:-20}"
HEALTHCHECK_DELAY_SECONDS="${HEALTHCHECK_DELAY_SECONDS:-2}"
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

wait_for_health() {
  local attempt=1

  while [[ "${attempt}" -le "${HEALTHCHECK_ATTEMPTS}" ]]; do
    if curl --fail --silent --show-error "${HEALTHCHECK_URL}" >/dev/null; then
      return 0
    fi

    log "Health check attempt ${attempt}/${HEALTHCHECK_ATTEMPTS} failed; retrying in ${HEALTHCHECK_DELAY_SECONDS}s"
    sleep "${HEALTHCHECK_DELAY_SECONDS}"
    attempt=$((attempt + 1))
  done

  log "Health check failed after ${HEALTHCHECK_ATTEMPTS} attempts"
  sudo systemctl status "${SYSTEMD_SERVICE}" --no-pager || true
  sudo journalctl -u "${SYSTEMD_SERVICE}" -n 50 --no-pager || true
  return 1
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
if [[ "${DRY_RUN}" == true ]]; then
  printf '[dry-run] wait_for_health\n'
else
  wait_for_health
fi

log "Redeploy complete"
