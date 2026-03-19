# Task Spec: Task Archive Workflow

## Summary

- Define a maintenance workflow that separates active task work from resolved task history.
- Update the existing `$new-task` skill so new work is created under an active task directory by default.
- Create a complementary resolved-task skill or equivalent workflow that archives completed task folders into a resolved directory.

## Goal

- Make task creation and task resolution explicit, repeatable, and easy to maintain across future Codex sessions.

## Success Criteria

- The task workflow uses `tasks/active/` for new or ongoing work and `tasks/resolved/` for completed work.
- `$new-task` creates task folders in the active location without breaking required task artifacts.
- A dedicated skill or documented workflow exists for moving finished task folders from active to resolved.
- Repo guidance and task artifacts reflect the new directory structure.
- We can review the current task inventory and identify which existing tasks appear ready to archive.

## In Scope

- Planning the `tasks/active/` and `tasks/resolved/` directory structure.
- Updating repo workflow documentation that currently assumes `tasks/<task_slug>/`.
- Updating the `$new-task` skill to target `tasks/active/<task_slug>/` for this repo workflow.
- Creating a resolved-task skill, or an equivalent explicit archive workflow, that moves completed tasks into `tasks/resolved/`.
- Reviewing existing task folders and proposing archival candidates.

## Out of Scope

- Deleting historical task records.
- Redesigning the contents of `spec.md` or `progress_log.md` beyond what the new directory structure requires.
- Automatically deciding task completion status without human review.
- General repo cleanup unrelated to task workflow maintenance.

## UX / Behavior / Workflow

- New workstreams should start in `tasks/active/<task_slug>/`.
- Existing in-progress work should remain easy to continue from the active directory.
- Resolving a task should move the whole task folder into `tasks/resolved/<task_slug>/` while preserving history.
- The archive workflow should be explicit enough that a future session can resolve a task without guessing naming or destination rules.
- After the workflow change, reviewing task status should involve scanning active tasks first and resolved tasks only for history.

## Technical Constraints

- Follow repo instructions to create and maintain task artifacts for this workstream.
- Keep task-specific planning artifacts inside `tasks/active/task-archive-workflow/`.
- Preserve append-only progress logs when moving completed tasks.
- Do not overwrite or silently discard existing task folders during migration.
- Prefer concise skill instructions with any detailed or repeated behavior handled by scripts only if needed.

## Deliverables

- Task spec and progress log for this maintenance workstream.
- Updated repo workflow docs reflecting `tasks/active/` and `tasks/resolved/`.
- Updated `$new-task` skill instructions and any supporting assets needed for the new task location.
- A new resolved-task skill, or equivalent artifact, for archiving completed tasks.
- A review of current task folders with suggested archive candidates.

## Acceptance Criteria

- The directory structure and workflow rules are documented clearly enough to follow in a fresh session.
- Creating a new task through the updated workflow results in an active task folder with the expected artifacts.
- Resolving a task through the new workflow preserves the task folder contents in the resolved location.
- Existing tasks can be categorized into active or likely resolved without ambiguity for most cases.

## Assumptions and Defaults

- `tasks/active/` and `tasks/resolved/` should both live inside the repo's existing `tasks/` directory.
- The resolved-task behavior is best represented as a dedicated skill unless implementation friction suggests a lighter-weight documented workflow.
- Existing flat task folders will either be migrated into `tasks/active/` or reviewed before any bulk move happens.
- We will validate workflow changes with targeted checks and manual test steps instead of staging anything automatically.
