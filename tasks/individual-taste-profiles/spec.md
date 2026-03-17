# Task Spec: Individual Taste Profiles

## Summary

- Add run-persistent customer taste profiles to the simulation engine so customer choice depends on more than shared weather fit, price, and reputation.
- Keep this first pass engine-only, with deterministic multiplayer-safe behavior and automated coverage.

## Goal

- Make repeat customers feel like individuals by giving them stable recipe tastes and lightweight stand-specific memory across a run.

## Success Criteria

- The engine generates a deterministic persistent customer roster from the room seed.
- Customer choice can differ because of individual lemon, sugar, and ice preferences.
- Repeat-customer history can modestly influence later stand choice without overriding price ceilings or inventory limits.
- Existing multiplayer day flow remains intact and tests pass.

## In Scope

- New persistent customer profile and history state in the game engine.
- Deterministic day sampling from a reusable customer roster.
- Personalized recipe-fit scoring based on per-customer taste offsets.
- Small bounded stand-history influence on future customer choice.
- Engine tests covering determinism, taste-driven differentiation, history influence, and guardrails.
- Task artifacts and idea capture for follow-on flavor and representation concepts.

## Out of Scope

- New visible insight tooltip or other customer-preference UI.
- Named lemonade flavor gameplay such as strawberry, cherry, or blueberry.
- Broader calculator or planning-assist work unless a real implementation gap is uncovered.
- Large multiplayer protocol or UI contract redesigns.

## UX / Behavior / Workflow

- Players should not see a new taste-profile UI in this pass.
- Day resolution should continue to look and behave the same from the player perspective.
- Customer behavior should become less uniform under the hood so recipe differences matter more organically over multiple days.

## Technical Constraints

- Work in `/Users/jordanlevy/GitHub/personal/active/games/Roguelike_Lemonade_Stand-taste-profiles`.
- Follow TDD, SOLID principles, and clean code guidance from `AGENTS.md`.
- Preserve deterministic server authority by deriving customer state and day sampling from room RNG and persisted room state.
- Keep external UI and multiplayer protocol behavior unchanged unless a minimal compatibility update is required.

## Deliverables

- Engine updates for persistent customer profiles and history.
- Automated tests for the new simulation behavior.
- `ideas/` updates for named flavor niches and broader customer visual representation.
- Task documentation in `tasks/individual-taste-profiles/`.

## Acceptance Criteria

- Starting the same seeded room twice produces the same persistent customer roster and matching simulation outcomes.
- Different customer taste profiles can prefer different stands under the same weather.
- Customer stand history updates after a sale and can influence a later day for that same customer.
- Customers still refuse overpriced cups and cannot buy from sold-out stands.
- `npm run test:run` passes.

## Assumptions and Defaults

- This is a new workstream rather than a continuation of an existing task folder.
- Customer roster size is based on the maximum daily customer count in balance data.
- Persistent history is intentionally minimal in v1: purchases, last day seen, and rolling average satisfaction.
- Voice-memo ideas about named flavors and customer representation are captured for future work, not implemented now.
