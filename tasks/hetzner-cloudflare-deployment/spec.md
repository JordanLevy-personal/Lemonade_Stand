# Task Spec: Hetzner Cloudflare Deployment

## Summary

- Prepare the multiplayer Lemonade Stand game for a first production deployment on a Hetzner VPS using a Cloudflare-managed domain.
- Establish a simple, maintainable hosting approach that matches the current architecture: a Vite-built frontend plus a long-running Node WebSocket server.

## Goal

- Make the project deployable to a single Hetzner VPS behind Cloudflare with a clear setup path, production-ready runtime configuration, and repeatable validation steps.

## Success Criteria

- The repository contains deployment artifacts and documentation for running the app on a Hetzner VPS.
- The production setup serves the built frontend over HTTPS and proxies WebSocket traffic correctly for multiplayer play.
- The deployment flow is simple enough for a manual first release and future updates.
- Manual validation steps exist for testing both page delivery and multiplayer room behavior after deployment.

## In Scope

- Define the production hosting shape for this repo.
- Add deployment configuration for a single-server VPS setup.
- Add or update scripts needed to build and run the app in production.
- Document Cloudflare DNS, reverse proxy, HTTPS, and process/runtime expectations.
- Provide manual testing guidance for verifying the live deployment.

## Out of Scope

- CI/CD pipeline setup unless it becomes necessary for the initial deployment flow.
- Horizontal scaling, multi-server coordination, or persistent external data stores.
- Rewriting the multiplayer server to use a different hosting platform or runtime.
- Non-deployment gameplay or UI changes.

## UX / Behavior / Workflow

- Players should access the game from the purchased domain over HTTPS.
- The browser client should connect to the backend through the same public host using secure WebSockets.
- Initial deployment should favor a straightforward manual workflow over automation-heavy infrastructure.
- The setup should be understandable and easy to update during early iteration.

## Technical Constraints

- Follow repo workflow rules in `AGENTS.md`, including task-local artifacts and append-only progress logging.
- Keep the current React/Vite frontend and Node WebSocket server architecture intact.
- Assume a single Hetzner VPS running Linux with Cloudflare managing DNS and proxying public traffic.
- Prefer deployment artifacts that are easy to operate and debug on a small VPS.
- Favor a host-managed Nginx + systemd deployment over extra orchestration layers for the first release.

## Deliverables

- Deployment task artifacts in `tasks/hetzner-cloudflare-deployment/`.
- Production deployment configuration committed in the repo.
- Documentation for provisioning, configuring, deploying, and verifying the app on the VPS.
- Manual testing steps for validating the deployed game.

## Acceptance Criteria

- A developer can follow the repo documentation to provision the app on a Hetzner VPS.
- The frontend can be built and served in production mode.
- The backend can run persistently in production mode and accept WebSocket connections through the public domain.
- Reverse proxy configuration supports both normal HTTP requests and WebSocket upgrades.
- The repo includes explicit manual checks for load, room creation, player join, and multiplayer progression.

## Assumptions and Defaults

- The VPS will be a single Ubuntu-based Hetzner instance.
- Cloudflare will remain the DNS provider and public edge in front of the VPS.
- The first production deployment will be manual rather than CI-driven.
- Nginx will serve the built frontend and proxy WebSocket traffic to the local Node server.
- The multiplayer server will run as a systemd service on the VPS.
- HTTPS termination will be handled on the VPS reverse proxy, with Cloudflare configured to use a strict origin SSL mode.
