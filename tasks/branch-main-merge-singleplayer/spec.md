# Task Spec: Branch Main Merge Singleplayer

## Summary

- Update local branch structure so the current multiplayer branch is merged into `main` and a separate singleplayer branch is created from the updated `main`.

## Goal

- Safely align local branches for the next phase of work without disturbing existing uncommitted changes in the active worktree.

## Success Criteria

- Local `main` includes the current branch changes.
- A new local branch for singleplayer work exists from the updated `main`.
- Existing uncommitted changes in the active worktree remain untouched.

## In Scope

- Inspect current git state.
- Merge the current branch into local `main`.
- Create a new singleplayer branch from updated `main`.
- Record the work in the task directory.

## Out of Scope

- Pushing branches to `origin`.
- Renaming existing branches.
- Resolving unrelated code changes in the dirty worktree.

## UX / Behavior / Workflow

- The active worktree should stay on the current branch with its local modifications preserved.
- Branch management should happen in a separate temporary worktree to avoid stashing or checkout conflicts.

## Technical Constraints

- Follow repo instructions requiring task artifacts under `tasks/`.
- Avoid destructive git operations and do not revert user changes.
- Use non-interactive git commands only.

## Deliverables

- `tasks/branch-main-merge-singleplayer/spec.md`
- `tasks/branch-main-merge-singleplayer/progress_log.md`
- Updated local git branches

## Acceptance Criteria

- `git branch --verbose` shows `main` at the current branch tip.
- `git branch --verbose` shows `codex/roguelike-singleplayer` created from updated `main`.
- The original worktree still shows the same uncommitted files on the current branch.

## Assumptions and Defaults

- The requested singleplayer branch name will be `codex/roguelike-singleplayer` to follow repository branch naming rules.
- The merge target is local `main`; remote pushes are not performed unless explicitly requested.
- Because the current branch is strictly ahead of `main`, a fast-forward merge is acceptable.
