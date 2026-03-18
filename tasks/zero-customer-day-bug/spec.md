# Task Spec: Zero Customer Day Bug

## Summary

- Investigate and fix the regression on `main` where a day can show `0/0` customers, resulting in no customer visits and no sales.

## Goal

- Restore normal daily customer generation so simulation days always use the configured weather-based customer pool unless a legitimate game rule says otherwise.

## Success Criteria

- The root cause of the `0/0` customer day is identified on a `main`-based worktree.
- The bug is covered by an automated regression test before the fix is applied.
- The fix preserves existing simulation behavior outside of the broken scenario.
- Manual testing steps are documented for validating customer flow in the running game.

## In Scope

- Reproducing the bug from the current `main` branch state.
- Investigating the daily planning/simulation path in the game engine.
- Adding or updating automated tests around customer-count generation or simulation startup.
- Implementing the smallest safe fix for the regression.

## Out of Scope

- Broad multiplayer or UI redesign work unrelated to the zero-customer regression.
- Balance retuning unless a balance default is directly responsible for the bug.
- Refactors beyond what is needed to keep the fix clean and testable.

## UX / Behavior / Workflow

- A new planning day should present a non-zero customer target when the active weather profile defines one.
- Starting simulation with valid players and plans should produce customer events and allow stands to serve customers when inventory and pricing permit.
- The investigation should happen in a dedicated `main`-based worktree so it can proceed in parallel with existing branch work.

## Technical Constraints

- Follow TDD and keep the change aligned with SOLID and clean code principles.
- Keep all task artifacts inside `tasks/zero-customer-day-bug/`.
- Prefer focused engine-level regression coverage in the existing Vitest suite.
- Do not stage or commit anything before validation and manual test guidance are prepared.

## Deliverables

- Updated engine test coverage for the zero-customer regression.
- Source fix in the simulation or customer-count path.
- Task documentation in `tasks/zero-customer-day-bug/`.
- Manual testing instructions for the user.

## Acceptance Criteria

- Automated tests pass for the new regression case and the relevant existing suite.
- A simulated day no longer reports `0/0` customers when the weather profile defines customers.
- The final handoff explains the design/behavioral choice behind the fix and includes manual test steps.

## Assumptions and Defaults

- The issue can be diagnosed from the current local `main` branch without fetching remote changes.
- Existing engine tests are the right first layer for reproducing the bug.
- The worktree branch for this task is `codex/zero-customer-day-bug`.
