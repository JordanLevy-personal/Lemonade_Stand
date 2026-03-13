# AGENTS.md

## Session Startup

- At the beginning of each new work session, use the `$new-task` skill at `/Users/jordanlevy/.codex/skills/new-task/SKILL.md` before implementation work begins.
- If the user explicitly says they are continuing an existing task, update that task instead of creating a duplicate.

## Task Directory Rules

- Keep all task work inside `tasks/<task_slug>/`.
- Every task directory must contain at minimum:
  - `spec.md`
  - `progress_log.md`
- Put any additional artifacts for that task in the same task directory.

## Spec Rules

- `spec.md` should capture the agreed working specification, not a raw transcript.
- Include the task goal, scope, constraints, acceptance criteria, key decisions, and explicit assumptions/defaults.

## Progress Log Rules

- `progress_log.md` should be append-only.
- Every entry must include a local timestamp.
- Log meaningful progress, validation, and notable decisions as work happens.

## Expected Workflow

- New session or new workstream: create a new task with `$new-task`.
- Existing task continuation: locate the relevant task folder and continue updating its `progress_log.md`.
- Use the task directory as the canonical home for task-specific artifacts.
