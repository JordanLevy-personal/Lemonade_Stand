# Progress Log

## Task

- **Name:** Multiplayer Room Disconnect Debugging
- **Started:** 2026-03-18 11:01:43 PDT
- **Current Status:** In Progress

## Session Summary

Investigating a production-like multiplayer disconnect where the host appears to drop from the room after both players join and the connection sits idle for about a minute.

## Timeline

### 2026-03-18 11:01:43 PDT - Task setup and initial code inspection

- **Status:** In Progress
- **Work Completed:** Created the task workspace, reviewed the repo-level workflow instructions, and inspected the client socket, backend socket server, room manager, deployment guide, systemd service template, and Nginx proxy config.
- **Validation:** Verified that the backend already logs socket lifecycle events and that the deployment proxies `/ws` through Nginx to the Node server on port `3001`.
- **Decisions / Notes:** Initial hypothesis is an idle WebSocket timeout or intermediary close, because the disconnect reportedly happens after the room is idle for roughly a minute and the code currently has no explicit heartbeat or ping/pong handling at the app level.
- **Next Step:** Collect backend and proxy logs from the VPS during a live reproduction attempt and inspect close codes/reasons on the affected clients.

### 2026-03-18 11:11:19 PDT - Confirmed idle close pattern and added heartbeat keepalive

- **Status:** Completed
- **Work Completed:** Reviewed VPS evidence showing repeated abnormal WebSocket closes with code `1006` and no reason after idle room joins, added a socket-server heartbeat interval that sends WebSocket ping frames to idle clients, and extended the local `ws` type shim plus tests to cover the new keepalive behavior.
- **Validation:** Ran `npm run test:run -- server/socket-server.test.ts`, `npm run test:run`, and `npm run build` successfully.
- **Decisions / Notes:** The failure pattern is consistent with an idle connection being dropped by the network path or client environment rather than a room-manager rule; server-driven ping traffic is the smallest robust mitigation because browser WebSocket clients automatically reply with pong frames.
- **Next Step:** Deploy the heartbeat change to the VPS and manually verify that two idle clients remain connected for longer than the previous failure window.

### 2026-03-18 11:25:04 PDT - Identified GitHub Actions deployment failure

- **Status:** Completed
- **Work Completed:** Inspected the production deploy workflow and queried recent GitHub Actions runs with `gh`, confirming the deploy job failed before SSH execution because `appleboy/ssh-action@v1.2.2` rejected the unsupported `script_stop` input. Removed that input from the workflow.
- **Validation:** Ran `gh run list --workflow deploy-vps.yml --limit 5`, `gh run view 23220407688`, and `git diff --check`.
- **Decisions / Notes:** The workflow already uses `set -euo pipefail` inside the remote script, so removing `script_stop` preserves fail-fast behavior without relying on an unsupported action input.
- **Next Step:** Push the workflow fix and trigger a fresh deploy run, then inspect the next failing step if any remain.

### 2026-03-18 11:31:59 PDT - Hardened deploy health check timing

- **Status:** Completed
- **Work Completed:** Confirmed that `http://127.0.0.1:3001/health` is the correct backend-only health target for this deployment, then updated both the VPS redeploy script and the GitHub Actions workflow to retry the health check after `systemctl restart` instead of failing on a single immediate curl.
- **Validation:** Ran `bash -n scripts/redeploy-vps.sh`, parsed `.github/workflows/deploy-vps.yml` as YAML, and ran `git diff --check`.
- **Decisions / Notes:** The deploy was likely failing because the service was checked too quickly after restart; the new retry loop preserves the useful backend-local health check while making deploys resilient to normal startup delay.
- **Next Step:** Re-run the VPS script or GitHub Actions deploy and confirm the service becomes healthy within the retry window.

## Validation

- `rg -n "room|disconnect|heartbeat|timeout|websocket|socket|host|join" . --glob '!tasks/**' --glob '!node_modules/**'`
- `sed -n '1,240p' server/socket-server.ts`
- `sed -n '1,220p' src/client/socket.ts`
- `sed -n '1,260p' docs/deployment/hetzner-vps.md`
- `sed -n '1,220p' deploy/nginx/roguelike-lemonade-stand.conf`
- `npm run test:run -- server/socket-server.test.ts`
- `npm run test:run`
- `npm run build`
- `gh run list --workflow deploy-vps.yml --limit 5`
- `gh run view 23220407688`
- `git diff --check`
- `bash -n scripts/redeploy-vps.sh`
