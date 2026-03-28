# Task Spec: Playwright Multiplayer Entry Skill

## Summary

- Create a reusable Codex skill that packages a Playwright script for multiplayer browser entry flows.
- Default the workflow to this project's host-and-join flow so the skill is immediately useful here.
- Keep the script configurable enough to reuse on similar local multiplayer web apps.

## Goal

- Turn the one-off multiplayer browser validation flow into a repeatable skill with a bundled script, clear invocation instructions, and validation.

## Success Criteria

- A new skill exists under `$CODEX_HOME/skills/`.
- The skill includes a runnable Playwright script that opens host and guest pages, creates a room, joins it, and waits for the target multiplayer screen.
- The script captures useful artifacts such as screenshots and a concise JSON summary.
- The skill documents when to use it and how to run the script.
- The skill validates cleanly with the skill validator.

## In Scope

- New skill initialization and metadata.
- Bundled Playwright script for multiplayer host/join browser checks.
- Skill instructions in `SKILL.md`.
- Validation against the current lemonade stand multiplayer flow.

## Out of Scope

- Reworking the app's multiplayer UI or networking behavior.
- General browser testing coverage beyond the multiplayer entry flow.
- Packaging a full MCP or test framework integration.

## UX / Behavior / Workflow

- The default script flow should work against this app's local host/join interface with minimal arguments.
- The script should emit a summary that helps diagnose failures quickly.
- The skill should explain how to override selectors and labels when a target app differs.

## Technical Constraints

- Follow the `skill-creator` workflow.
- Keep the skill concise and script-first.
- Prefer a deterministic, parameterized CLI over fragile ad hoc browser instructions.

## Deliverables

- New skill folder under `/Users/jordanlevy/.codex/skills/`.
- `SKILL.md` with concise usage guidance.
- Bundled Playwright script.
- Updated task log and repo `progress.md`.

## Acceptance Criteria

- The skill passes `quick_validate.py`.
- The Playwright script runs successfully against the local multiplayer app.
- The script produces browser artifacts for the host/join flow.

## Assumptions and Defaults

- Playwright is already available in the local environment.
- This repo's host/join labels and planning-screen heading are the primary default target.
- The skill should still expose flags so it can be adapted to similar flows without code changes.
