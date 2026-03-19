# Progress Log

## Task

- **Name:** Zero Customer Day Bug
- **Started:** 2026-03-18 11:39:11 PDT
- **Current Status:** Completed

## Session Summary

Investigating a `main` regression where a day can start with `0/0` customers and no one is served. Work is isolated in a dedicated `main`-based worktree and will proceed with a test-first engine-level diagnosis.

## Timeline

### 2026-03-18 11:39:11 PDT - Task setup and branch isolation

- **Status:** Completed
- **Work Completed:** Reviewed repo instructions, loaded the `$new-task` workflow, created the `codex/zero-customer-day-bug` worktree from local `main`, and inspected the engine/test entry points likely involved in customer generation.
- **Validation:** Confirmed local `main` exists at `5258de6`; created worktree at `/Users/jordanlevy/GitHub/personal/active/games/Roguelike_Lemonade_Stand-zero-customers`; verified the project uses Vitest with engine coverage in `src/game/engine.test.ts`.
- **Decisions / Notes:** Starting with engine-level reproduction because the symptom is customer-count related and the codebase already has simulation tests.
- **Next Step:** Reproduce the `0/0` path with a failing test or direct simulation trace, then implement the smallest safe fix.

### 2026-03-18 11:43:43 PDT - Root cause confirmed and regression fix validated

- **Status:** Completed
- **Work Completed:** Added a regression test for `RoomManager` with the default hooks, confirmed a fresh room started simulation with zero customer events, then fixed the room bootstrap contract so `createDay()` provides the seeded `customerRoster` and `rngSeed` needed for day-one simulation.
- **Validation:** `npm run test:run -- server/default-game-hooks.test.ts server/room-manager.test.ts server/socket-server.test.ts src/game/engine.test.ts`; `npx eslint server/default-game-hooks.ts server/default-game-hooks.test.ts server/room-manager.ts server/room-manager.test.ts`
- **Decisions / Notes:** The bug was caused by initializing new rooms with `customerRoster: []` in `RoomManager.createRoom()`. The UI symptom (`0/0` customers) was downstream of the server passing an empty roster into the simulation engine. Repo-wide `npm run lint` still reports pre-existing `src/App.tsx` issues unrelated to this server-side fix.
- **Next Step:** Commit the validated fix on the worktree branch and create a PR against `main`.

## Validation

- `git worktree add ../Roguelike_Lemonade_Stand-zero-customers -b codex/zero-customer-day-bug main`
- `sed -n '1,260p' src/game/engine.ts`
- `sed -n '1,920p' src/game/engine.test.ts`
- `npm ci`
- `npm run test:run -- server/default-game-hooks.test.ts`
- `npm run test:run -- server/default-game-hooks.test.ts server/room-manager.test.ts server/socket-server.test.ts src/game/engine.test.ts`
- `npx eslint server/default-game-hooks.ts server/default-game-hooks.test.ts server/room-manager.ts server/room-manager.test.ts`
