# Task Spec: Multiplayer Room Disconnect Debugging

## Summary

- Investigate a live multiplayer issue where the host appears to disconnect after both players join a room and the session sits for about a minute, producing a "The room connection failed." client error.

## Goal

- Identify the root cause of the room disconnect and implement or recommend the smallest reliable fix in the deployed stack or game code.

## Success Criteria

- We capture enough client, backend, and proxy evidence to determine whether the disconnect is caused by application logic, WebSocket lifecycle handling, or deployment infrastructure.
- We confirm the close behavior with concrete logs, including timestamps and WebSocket close details where available.
- If a code or config fix is needed, it is implemented and validated locally or with a clear manual verification plan.

## In Scope

- Inspecting the frontend socket lifecycle, backend room/socket lifecycle, and deployment proxy configuration.
- Gathering VPS logs from the systemd service and Nginx during a reproduction attempt.
- Checking for idle timeout, proxy timeout, heartbeat, reconnect, or room-state handling issues.
- Recommending or implementing follow-up fixes once the cause is confirmed.

## Out of Scope

- Broad multiplayer feature redesign unrelated to the disconnect.
- Non-room networking work outside the current WebSocket deployment path.
- Production infrastructure changes unrelated to this failure mode unless they are directly required to fix the disconnect.

## UX / Behavior / Workflow

- The host creates a room, a second player joins, and both clients remain connected while idle in the room.
- If a disconnect does occur, the UI should expose enough information to identify whether the socket closed cleanly, unexpectedly, or due to an upstream failure.

## Technical Constraints

- Follow repo guidance to keep all task artifacts under `tasks/multiplayer-room-disconnect-debugging/`.
- Prefer evidence-driven debugging before code changes.
- The deployed stack uses Nginx in front of a systemd-managed Node WebSocket server, with Cloudflare in front of the VPS.
- Existing code already logs `socket_connected`, `client_message`, `socket_error`, `socket_closed`, and `player_disconnected` events on the backend.

## Deliverables

- Investigation notes in this task folder.
- Root-cause hypothesis backed by logs or reproduction evidence.
- Any code or config changes required to resolve the issue, plus validation notes.
- Manual test steps for multiplayer verification after any change.

## Acceptance Criteria

- We can reproduce or clearly characterize the disconnect path.
- We can point to the layer causing the disconnect: client, Node WebSocket server, Nginx, Cloudflare, or another network intermediary.
- We provide either a confirmed fix or a sharply narrowed next action with exact evidence still needed.

## Assumptions and Defaults

- This is a new debugging workstream rather than a continuation of an existing task folder.
- The disconnect likely occurs on the deployed VPS path rather than in a purely local environment.
- The first debugging pass should avoid code changes until we inspect live logs around the failure window.
