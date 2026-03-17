# Task Spec: GitHub Action VPS Deploy

## Summary

- Add a GitHub Actions workflow that deploys the app to the Hetzner VPS after pushes to `main`.
- Reuse the existing documented VPS update flow instead of inventing a second deployment path.

## Goal

- Make production deploys repeatable from GitHub so merging and pushing to `main` can trigger the VPS update automatically.

## Success Criteria

- The repo contains a GitHub Actions workflow for VPS deployment.
- The workflow can be triggered automatically on pushes to `main` and manually with `workflow_dispatch`.
- The workflow connects to the VPS over SSH and runs the existing update steps for the app.
- The deployment docs explain the required GitHub secrets/variables and the one-time server prerequisites.

## In Scope

- A new workflow under `.github/workflows/`.
- Documentation updates for required GitHub repository secrets and variables.
- Task artifacts in `tasks/github-action-vps-deploy/`.

## Out of Scope

- Provisioning the VPS from scratch.
- Changing the runtime architecture away from Nginx + systemd + Node.
- Setting GitHub secrets or VPS SSH access directly from this repo.
- Replacing the existing server-side deploy flow with containers or a different delivery model.

## UX / Behavior / Workflow

- Pushes to `main` should trigger the deploy workflow when application or deployment files change.
- A manual dispatch should allow rerunning the deploy without creating a new commit.
- The remote deployment should pull the latest `main`, install dependencies, build the app, restart the Node service, and reload Nginx.

## Technical Constraints

- Follow TDD where practical, plus SOLID and clean code principles.
- Keep deployment behavior aligned with `docs/deployment/hetzner-vps.md`.
- Use GitHub-hosted automation with SSH-based remote execution.
- Keep environment-specific credentials out of the repo and in GitHub secrets / variables.

## Deliverables

- A GitHub Actions deployment workflow.
- Updated deployment documentation covering GitHub-side setup.
- Progress logging in `tasks/github-action-vps-deploy/progress_log.md`.

## Acceptance Criteria

- The workflow YAML is syntactically valid.
- Existing test and build commands still pass after the workflow/doc changes.
- The docs list the exact GitHub secrets and variables needed to make the deploy work.

## Assumptions and Defaults

- Production deployments target the existing Hetzner VPS.
- The VPS already has the repo cloned and can `git pull` from `origin/main`.
- The systemd service name remains `roguelike-lemonade-stand.service`.
- The default deploy path remains `/var/www/roguelike-lemonade-stand`.
