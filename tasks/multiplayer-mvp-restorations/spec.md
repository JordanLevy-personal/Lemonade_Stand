# Task Spec: Multiplayer MVP Restorations

## Summary

- Restore three regressions in the multiplayer MVP: replace LAN-only wording with network-neutral room wording, bring back a player inventory view, and bring back the computed ingredient cost per cup based on the current recipe and market prices.

## Goal

- Recover the planning and simulation context players had in the single-player version without changing the multiplayer protocol or widening the gameplay scope.

## Success Criteria

- Player-facing copy no longer implies the experience is LAN-only.
- Multiplayer planning shows the current player's inventory and projected inventory after staged purchases.
- Multiplayer planning shows the computed ingredient cost per cup for the current recipe.
- Multiplayer simulation shows a live remaining-inventory view that updates as sales resolve.

## In Scope

- Client-facing wording updates for lobby, waiting, top bar, and connection messaging.
- Restoring inventory visibility in multiplayer planning and live simulation.
- Restoring the computed ingredient cost per cup based on the active recipe and current market prices.
- Tests for the restored UI behavior and any supporting pure helpers.

## Out of Scope

- WebSocket protocol changes.
- Server room-shape changes.
- Matchmaking, NAT traversal, or explicit internet-play feature work.
- Rebalancing gameplay, customer logic, or the broader multiplayer flow.

## UX / Behavior / Workflow

- Use network-neutral language such as room or multiplayer instead of LAN-only language.
- In planning, present inventory context alongside the existing forecast and price controls so players can understand buying power and cup capacity at a glance.
- In simulation, show the current player's remaining inventory as the day plays out so depletion is visible during sales.
- Keep opponent-private information private.

## Technical Constraints

- Follow TDD, SOLID, and clean code principles.
- Keep task artifacts inside `tasks/multiplayer-mvp-restorations/`.
- Preserve the existing UI style guidance in `docs/STYLE.md`.
- Prefer small, pure helpers for inventory and cost calculations if they improve clarity and testability.

## Deliverables

- Updated task documentation in `tasks/multiplayer-mvp-restorations/spec.md`.
- Append-only progress logging in `tasks/multiplayer-mvp-restorations/progress_log.md`.

## Acceptance Criteria

- The updated multiplayer UI no longer shows misleading LAN-only wording.
- The planning screen restores inventory visibility and computed ingredient cost feedback.
- The live simulation screen restores a visible inventory readout that changes as purchases resolve.
- Automated tests cover the restored behavior and continue passing.

## Assumptions and Defaults

- Treat this as a follow-up restoration task rather than a rewrite of the existing multiplayer task.
- Restore the inventory view for planning plus live day playback.
- Restore ingredient cost per cup, not a new selling-price mechanic.
- Keep the change scoped to client UX and tests unless implementation exposes a clear need for a small shared helper.
