# Task Spec: Multiplayer LAN MVP Pivot

## Summary

- Pivot the project from a single-player roguelike lemonade stand into a 2-player LAN-only multiplayer shared-market game.
- Remove roguelike systems entirely and replace them with a room-authoritative multiplayer flow backed by a lightweight local server.
- Deliver a repeatable day loop where two players connect from separate laptops, plan privately, watch the same customer simulation, review results, and continue to the next day.

## Goal

- Build a playable local-network MVP that supports one host and one joined player competing in the same lemonade market from separate browsers.

## Success Criteria

- A host can start the game on one laptop, share a LAN URL, and a second player can join from another laptop on the same network.
- Both players can submit daily plans privately and the server automatically starts the day once both are ready.
- The server generates one shared customer event timeline and both clients replay the same simulation.
- Results are applied server-side and carry over into the next planning day.
- Disconnecting a player pauses the room and reconnecting restores the session.

## In Scope

- New multiplayer room model with `RoomState`, `PlayerState`, and a shared simulation payload.
- Removal of cards, rent, night phase, and game-over-on-negative-money systems.
- Shared pure TypeScript gameplay logic used by both client and server.
- Lightweight in-repo WebSocket LAN server under `server/`.
- Host/join lobby UI and private player planning UI.
- Two-stand simulation scene and results flow.
- Automated tests for engine, server, and client behavior.
- Task artifacts and progress logging in `tasks/multiplayer-lan-mvp/`.

## Out of Scope

- Internet play, NAT traversal, or matchmaking.
- Room-code UX beyond a simple LAN URL and room id.
- AI/bot takeover, spectators, or a final match win condition.
- Faction gameplay asymmetry beyond cosmetic identity.
- Shared finite ingredient stock.

## UX / Behavior / Workflow

- One laptop hosts the room and shares a LAN URL with the second player.
- Each player joins from their own browser and keeps an individual player session.
- Planning is private per client. Players buy ingredients, set recipe, set price, and submit readiness.
- The server advances automatically from planning to simulation when both players are ready.
- Both clients render the same customer rush and attribute customers to the selected stand based on server-issued events.
- Results show both players' performance and then move back into planning for the next day.
- If either player disconnects, the room enters a paused state until reconnection.

## Technical Constraints

- Follow TDD, SOLID, and clean code principles.
- Prefer CSS-driven presentation and preserve the project's existing visual style guidance in `docs/STYLE.md`.
- Keep the simulation and scoring math in shared pure TypeScript modules.
- Use a lightweight Node WebSocket server for room authority and synchronization.
- Support local deployment and LAN play across multiple laptops.

## Deliverables

- Multiplayer gameplay and networking code in the app and `server/`.
- Updated scripts and TypeScript configuration for client and server development.
- Rewritten tests for multiplayer engine logic, server behavior, and UI flow.
- Task documentation in `tasks/multiplayer-lan-mvp/spec.md` and `tasks/multiplayer-lan-mvp/progress_log.md`.

## Acceptance Criteria

- Running the host flow locally produces a shareable LAN URL for the second player.
- Two players can complete at least two consecutive days with money, inventory, and reputation carrying forward.
- The decision engine honors price, recipe-weather fit, reputation, willingness-to-pay, and inventory limits.
- Shared event playback stays meaningfully aligned across both clients using one server-generated timeline.
- Disconnect and reconnect pause and resume the same room instead of resetting progress.
- Automated tests cover the main multiplayer engine rules, server room transitions, and core client screens.

## Assumptions and Defaults

- Branch name: `codex/multiplayer-lan-mvp`.
- Task slug: `multiplayer-lan-mvp`.
- Factions are cosmetic only in this MVP.
- Shared ingredient prices use unlimited stock.
- Playback uses a shared server-generated event timeline instead of strict frame lockstep.
- One host laptop runs the server and host client, then shares the LAN URL with the second player.
