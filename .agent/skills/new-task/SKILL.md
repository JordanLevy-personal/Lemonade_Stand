---
name: new-task
description: Create and maintain a task workspace under a repo's `tasks/` directory by interviewing the user, then writing a comprehensive `spec.md` and a structured `progress_log.md` with timestamps. Use when starting a new workstream or session, when the user asks to create task artifacts, or when a repo expects per-task folders before implementation begins.
---

# New Task

## Overview

Create a new task folder, interview the user until the task is specific enough to work from, then write the task artifacts that future sessions should rely on.

## Workflow

1. Determine the task slug.
2. Create `tasks/<task_slug>/`.
3. Interview the user until `spec.md` can be written as a working spec rather than a transcript.
4. Write `spec.md`.
5. Write `progress_log.md`.
6. Keep all later task artifacts inside the same task folder.

## Task Folder Rules

- Always create work under `tasks/<task_slug>/`.
- Use a short hyphen-case slug. Prefer the user’s wording when possible.
- If the user explicitly says to continue an existing task, update that task folder instead of creating a new one.
- If multiple existing task folders could match, inspect `tasks/` first and ask only if the ambiguity is real.

## Interviewing For The Spec

- Ask focused questions until the task has clear goals, scope, success criteria, constraints, and important decisions.
- If the user has already provided enough detail, do not force extra questioning.
- Prefer concise rounds of questions over a long interrogation.
- Capture defaults and assumptions explicitly if the user leaves them open.

## Writing `spec.md`

- Use `assets/spec-template.md` as the default structure.
- Write the current agreed spec, not the conversation history.
- Include:
  - Summary
  - Goal and success criteria
  - In-scope and out-of-scope work
  - UX, behavior, or workflow expectations when relevant
  - Technical constraints and dependencies
  - Acceptance criteria
  - Assumptions and defaults
- Trim empty sections instead of leaving placeholder text behind.

## Writing `progress_log.md`

- Use `assets/progress-log-template.md` as the starting structure.
- Create the log immediately after the spec.
- Use local timestamps.
- Make the log append-only.
- Each meaningful entry should capture:
  - Timestamp
  - Status or milestone
  - What was accomplished
  - Validation performed
  - Important decisions or next steps

## Ongoing Use

- When more work happens on the task, append to `progress_log.md` instead of rewriting history.
- Keep related notes, plans, reports, screenshots, or other artifacts in the same task folder.
- Check repo-level workflow docs such as `AGENTS.md` and follow any task-storage rules they define.
