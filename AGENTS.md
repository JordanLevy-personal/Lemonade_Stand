# AGENTS.md

## Session Startup

- At the beginning of each new work session, use the `$new-task` skill at `/Users/jordanlevy/.codex/skills/new-task/SKILL.md` before implementation work begins.
- If the user explicitly says they are continuing an existing task, update that task instead of creating a duplicate.
- When a task is finished and the user wants it archived, use the `$resolve-task` skill at `/Users/jordanlevy/.codex/skills/resolve-task/SKILL.md`.

## Task Directory Rules

- Keep active task work inside `tasks/active/<task_slug>/`.
- Keep archived task work inside `tasks/resolved/<task_slug>/`.
- During migration, legacy task folders may still exist directly under `tasks/<task_slug>/`; treat them as active until they are moved or resolved.
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
- Existing task continuation: locate the relevant folder in `tasks/active/` first, then fall back to any legacy task folder still stored directly under `tasks/`.
- Completed task archival: use `$resolve-task` to move the task folder into `tasks/resolved/` while preserving its history.
- Use the task directory as the canonical home for task-specific artifacts.

## Telemetry Review

- For any new gameplay, UI, or server feature, run the `$playtest-telemetry-review` skill at `/Users/jordanlevy/.codex/skills/playtest-telemetry-review/SKILL.md` before finalizing implementation.
- Use `docs/playtest-data-catalog.json` as the canonical catalog of logged playtest fields and entities.
- If telemetry changes are needed, update the catalog in the same workstream.
- If no telemetry changes are needed, record the skill's rationale in the active task `progress_log.md` or final implementation summary.

## Ideas Directory

- When future gameplay, UX, or technical extension ideas come up during work, write them down in `ideas/` instead of leaving them only in chat.
- Prefer focused Markdown files by theme so ideas stay easy to revisit and expand later.

## UI & Style Guidelines

- Whenever modifying the user interface or generating new visual assets, consult `docs/STYLE.md` to ensure aesthetic consistency with the project's requirements.
