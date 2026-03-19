# Task Spec: Playtest Telemetry

## Summary

- Add server-side playtest telemetry that persists game, player-day, customer profile, customer event, and customer offer-score records to a SQLite database for offline balancing analysis.
- Add a repo-level playtest data catalog and a reusable telemetry review skill so future feature work evaluates whether new telemetry should be logged.

## Goal

- Capture authoritative raw gameplay inputs and customer-level simulation details per game and per day without disrupting multiplayer gameplay.

## Success Criteria

- The server writes one game row per room and one player-day row per player/day.
- The server writes customer taste profiles at game start and customer-level event / scoring records when a day simulates.
- Anonymous stable browser identity is included in telemetry without exposing it through shared room state.
- A repo JSON catalog exists for logged playtest fields and can be updated by a dedicated skill.
- Repo workflow guidance requires telemetry review for new gameplay, UI, and server features.

## In Scope

- Client analytics identity generation and protocol updates for room create/join.
- Server-side SQLite schema, repository, and write integration.
- Engine or server-side telemetry payloads needed to explain customer buy / skip / sold-out outcomes.
- Repo catalog and new `playtest-telemetry-review` skill.
- Automated tests for repository behavior, telemetry payload generation, and end-to-end server logging.

## Out of Scope

- Export endpoints or in-app telemetry dashboards.
- Account systems or player login.
- Analytics for every intermediate UI adjustment before plan submission.
- Production data warehousing beyond a single server-local SQLite database.

## UX / Behavior / Workflow

- Multiplayer play should remain unchanged from the player perspective.
- The client should generate a stable anonymous analytics ID once and reuse it on future sessions.
- Telemetry write failures should not break room creation, plan submission, or simulation flow.
- New feature work should run the telemetry review skill before completion so the catalog stays current.

## Technical Constraints

- Follow TDD, SOLID, and clean code principles.
- Keep task artifacts inside `tasks/active/playtest-telemetry/`.
- Use SQLite on the server via Node runtime support and default the database path to `./data/playtest-telemetry.sqlite`.
- Keep analytics identity server-only and avoid adding it to broadcast room state.
- Validate the new skill with the existing skill validator tooling.

## Deliverables

- Telemetry-aware client, shared contracts, engine/server integration, and repository code.
- `docs/playtest-data-catalog.json`.
- New Codex skill under `/Users/jordanlevy/.codex/skills/playtest-telemetry-review/`.
- Updated repo workflow guidance in `AGENTS.md`.
- Automated tests plus manual playtest instructions.

## Acceptance Criteria

- Playing two days of a two-player game produces one game record, four player-day records, one game-scoped customer profile set, and per-day customer event / offer-score rows.
- Customer event rows include outcome reasons and preferred recipe snapshots.
- Offer-score rows capture enough raw inputs to explain selection, rejection, and sold-out outcomes.
- Re-submitting a plan before both players are ready overwrites the same player-day plan row instead of creating duplicates.
- The telemetry review skill can assess a feature, ask for developer opinion, and update the JSON catalog deterministically.

## Assumptions and Defaults

- `roomId` acts as the v1 `gameId`.
- V1 retrieval is manual by pulling the SQLite file from the VPS.
- Outcome reasons in v1 are limited to `purchased`, `all_prices_above_willingness`, and `selected_stand_sold_out`.
- Offer results in v1 are limited to `selected`, `not_selected`, `price_rejected`, and `selected_but_sold_out`.
