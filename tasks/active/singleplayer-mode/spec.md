# Task Spec: Singleplayer Mode

## Summary

- Add a dedicated singleplayer entry flow beside multiplayer hosting while keeping the game room-based so the same lifecycle scales from 1 to N players.

## Goal

- Ship a true singleplayer mode that reuses the multiplayer pipeline, keeps future player-count scaling straightforward, and adds telemetry needed for later balance tuning.

## Success Criteria

- The lobby offers `Play Single-Player` beside `Host Room`.
- Creating a singleplayer game produces a 1-seat room that enters planning immediately.
- Singleplayer plan submission and next-day requests resolve immediately because only one player is required.
- Customer demand scales from the current 2-player weather baselines using configured player count.
- Room contracts, server lifecycle logic, and telemetry all use the same authoritative room configuration.

## In Scope

- Add `gameMode` and `targetPlayerCount` to room creation and room state contracts.
- Refactor room lifecycle logic to use configurable seat counts instead of hard-coded 2-player rules.
- Add the singleplayer lobby button and solo-friendly room flow copy.
- Scale per-day customer counts from the weather baseline based on player count.
- Persist and catalog `gameMode` and `playerCount` telemetry fields.
- Add and update automated tests for UI, engine, room manager, and telemetry behavior.

## Out of Scope

- AI-controlled rival stands.
- Dynamic conversion between singleplayer and multiplayer after room creation.
- Exposing 3+ player lobbies in the UI.
- Broad gameplay rebalancing beyond the first-pass customer scaling rule.

## UX / Behavior / Workflow

- Multiplayer hosting keeps the current waiting-room flow for a second player.
- Singleplayer creates a room-backed solo game but skips the waiting-room delay and goes straight into planning.
- Planning, simulation, and results screens continue to use the shared room flow, with copy adjusted where needed so solo play reads naturally.
- Implementation work happens in a dedicated git worktree on `codex/singleplayer-mode` so the original dirty worktree remains untouched.

## Technical Constraints

- Follow TDD and keep the shared room pipeline as the primary architecture.
- Prefer room/game configuration that can scale from 1 to N players without duplicating logic for solo and multiplayer.
- Keep task artifacts under `tasks/active/singleplayer-mode/`.
- Run the playtest telemetry review before finalizing and update `docs/playtest-data-catalog.json` if telemetry changes are implemented.

## Deliverables

- `tasks/active/singleplayer-mode/spec.md`
- `tasks/active/singleplayer-mode/progress_log.md`
- Updated client, server, shared engine, telemetry repository, and tests for singleplayer mode

## Acceptance Criteria

- Automated tests cover solo room creation, solo simulation start, solo next-day advance, solo join rejection, preserved multiplayer behavior, customer scaling, and telemetry persistence.
- `npm run test:run` passes.
- `npm run build` passes.
- Manual testing steps exist for validating solo and multiplayer flows in the local LAN app.

## Assumptions and Defaults

- Singleplayer launches as one human stand with no AI rival.
- The current weather `customerCount` values are treated as the 2-player baseline and are scaled with `round(baseCount * targetPlayerCount / 2)`, clamped to at least 1.
- The first implementation exposes only 1-player and 2-player entry points in the UI, even though the room model is built around configurable seat count.
- Telemetry additions will be limited to `gameMode` and `playerCount` unless implementation reveals a concrete need for another raw field.
