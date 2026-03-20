# Task Spec: Multiplayer Player Scaling

## Summary

- Expand the multiplayer room flow from the current practical 2-player experience to an intentionally supported 2-4 player experience.
- Preserve the existing room-authoritative architecture while making the lobby, readiness flow, simulation scene, and results copy scale cleanly for 3 and 4 players.
- Deliver the work in a dedicated worktree branched from `main`, with tests, manual validation guidance, and a PR back into `main`.

## Goal

- Let a host create a multiplayer room for 2, 3, or 4 players, fill that room from separate clients, and see the correct multi-player visual state throughout the day loop.

## Success Criteria

- The host can choose a multiplayer target player count of 2, 3, or 4 from the lobby.
- The server accepts only supported player counts and keeps the room in the lobby until the configured number of players have joined.
- Planning, simulation, results, pause, and waiting copy all reflect “all players” or explicit ready counts rather than 2-player assumptions.
- The live simulation scene displays all active stands for 3-player and 4-player rooms and routes customers toward the correct stand anchor.
- Automated tests cover the new room-size behavior and the main count-aware UI states.

## In Scope

- Host-side player-count selection for multiplayer rooms.
- Shared validation for supported player counts.
- Lobby/waiting/readiness copy updates for 3-4 player rooms.
- Simulation layout support for showing all stands at once for 3-4 players.
- Results and next-day messaging updates for multi-player counts.
- Task artifacts, progress logging, manual test guidance, and PR preparation.

## Out of Scope

- Matchmaking or internet-play changes.
- New factions or asymmetric faction mechanics.
- A balance redesign for higher player counts beyond preserving the current demand scaling formula.
- Spectator support or partial bot fill-ins for empty seats.

## UX / Behavior / Workflow

- Singleplayer remains a 1-player flow and bypasses the multiplayer selector.
- Hosting multiplayer presents a selector for 2, 3, or 4 players.
- Waiting screens show the joined roster and remaining open seats until the room is full.
- Planning keeps player plans private and communicates progress with count-aware readiness messaging.
- Simulation shows every stand in the room, using compact stand presentation for 3-4 players so all stands remain visible on desktop and mobile.
- Results remain player-by-player cards, but the explanatory copy refers to all players instead of both players.

## Technical Constraints

- Follow TDD, SOLID, and clean code principles.
- Keep the existing protocol field names and room model shape unless a narrow helper extraction is needed.
- Do not silently accept unsupported multiplayer player counts on the server.
- Preserve the current 2-player balance baseline in `defaultBalanceConfig.maxPlayers` for this task.
- Run the playtest telemetry review before finalizing.

## Acceptance Criteria

- Creating a multiplayer room sends the selected supported `targetPlayerCount`.
- A 4-player room stays in the lobby until the 4th player joins and does not start simulation until all 4 plans are submitted.
- A 4-player results room does not advance until all 4 players request the next day.
- The waiting/planning/results UI no longer contains 2-player-specific wording in multiplayer rooms.
- The simulation screen shows 3 or 4 stand elements with stable placement and readable labels.

## Assumptions and Defaults

- Branch: `codex/multiplayer-player-scaling`
- Worktree: `worktrees/Roguelike_Lemonade_Stand-multiplayer-player-scaling`
- Task slug: `multiplayer-player-scaling`
- Supported multiplayer counts for this pass: `2`, `3`, and `4`
- Existing factions may be reused by multiple players.
