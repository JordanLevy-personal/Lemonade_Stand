# Progress Log

## Task

- **Name:** Multiplayer LAN MVP Pivot
- **Started:** 2026-03-16 21:36:05 PDT
- **Current Status:** In Progress

## Session Summary

Transitioning the project from a single-player roguelike loop into a 2-player LAN-authoritative multiplayer lemonade stand MVP with a shared simulation timeline.

## Timeline

### 2026-03-16 21:36:05 PDT - Task setup and implementation kickoff

- **Status:** Completed
- **Work Completed:** Reviewed the existing codebase, clarified the MVP scope, created the `codex/multiplayer-lan-mvp` branch, created the `tasks/multiplayer-lan-mvp/` workspace, and wrote the working spec for the multiplayer LAN pivot.
- **Validation:** Confirmed clean git status before branching and verified there was no matching existing task folder to continue.
- **Decisions / Notes:** The MVP will use a lightweight WebSocket LAN server, a room-authoritative shared event timeline, cosmetic factions only, shared ingredient prices with unlimited stock, and pause-on-disconnect behavior.
- **Next Step:** Split implementation across engine, server, and client workstreams and integrate the resulting changes.

### 2026-03-16 21:59:23 PDT - Core multiplayer implementation and automated validation

- **Status:** Completed
- **Work Completed:** Replaced the old roguelike engine with a room-based multiplayer domain model, removed cards, added a LAN WebSocket server with room lifecycle handling, rebuilt the React client around host/join/planning/simulation/results, and updated the protocol and tests to the new MVP flow.
- **Validation:** `npx vitest run src/game/engine.test.ts server/lan-room-server.test.ts src/App.test.tsx`, `npm run test:run`, and `npm run build` all passed.
- **Decisions / Notes:** The real server now matches the tested client contract, reconnect is stored as room session metadata in local storage, and next-day advancement currently occurs once both players request it.
- **Next Step:** Run browser-level validation on the LAN client, inspect screenshots/state, and then prepare manual LAN testing instructions for cross-laptop verification.

### 2026-03-16 22:05:25 PDT - Browser validation and live lobby fix

- **Status:** Completed
- **Work Completed:** Ran the live app through the Playwright game-testing loop, identified and fixed a lobby-state crash caused by `dailyPlan: null` from the real server, and added an explicit waiting-room screen for the host after room creation.
- **Validation:** Browser sanity check via Playwright, inspected `/Users/jordanlevy/GitHub/personal/active/games/Roguelike_Lemonade_Stand/output/web-game/shot-0.png`, confirmed `output/web-game/state-0.json`, reran `npx vitest run src/App.test.tsx`, reran `npm run test:run`, and reran `npm run build`.
- **Decisions / Notes:** URL query prefill for `name`, `roomId`, and `faction` was added to support deterministic browser validation and easier local smoke testing without changing the normal host/join flow.
- **Next Step:** Hand off a concise implementation summary plus manual LAN test instructions for two laptops.

### 2026-03-16 21:58:44 PDT - Multiplayer LAN MVP integrated and validated

- **Status:** Completed
- **Work Completed:** Replaced the roguelike loop with multiplayer room/player domain types and shared simulation logic, rebuilt the client around host/join LAN flow and private planning/results screens, added the in-repo WebSocket LAN server, removed obsolete roguelike/server leftovers, and aligned the client-server protocol with the shared gameplay model.
- **Validation:** `npm run test:run -- src/game/engine.test.ts src/App.test.tsx server/room-manager.test.ts`, `npm run build`, and `npm run test:run`.
- **Decisions / Notes:** Kept the authoritative simulation on the server, used the Vite dev server as the shareable LAN URL with `/ws` proxying to the Node WebSocket server, and kept factions cosmetic-only while preserving carryover money, inventory, and reputation.
- **Next Step:** Manual LAN verification across two laptops and player feedback on pacing, balance, and reconnect behavior.

### 2026-03-16 22:36:03 PDT - Customer stand-selection investigation

- **Status:** Completed
- **Work Completed:** Reviewed the multiplayer task artifacts, traced the customer selection path in `src/game/engine.ts`, and analyzed how `generateCustomerBudget`, `calculateStandScore`, and `chooseWinner` interact during the shared simulation. Confirmed that customers currently choose the single highest-scoring stand deterministically unless the scores are exactly tied, which explains the observed one-stand clustering when one player has even a small edge.
- **Validation:** Reviewed `src/game/engine.ts`, `src/game/engine.test.ts`, and `src/game/balance.ts`. Ran targeted `npx tsx` simulation probes to compare equal-stand scenarios against small-advantage scenarios. Observed that equal stands split customers across seeds, while a `+$0.05` price advantage or `+2` reputation advantage caused the advantaged stand to win all contested customers until inventory depletion.
- **Decisions / Notes:** Improvement options to consider next are: probabilistic winner selection weighted by relative stand score, explicit exploration noise added per customer before winner selection, or a mixed model where some customers have stand loyalty / idiosyncratic preference layered on top of the existing shared scoring formula.
- **Next Step:** Align on the preferred balancing direction, then implement it test-first and provide manual gameplay checks focused on customer distribution fairness.

### 2026-03-16 23:06:59 PDT - Weighted customer stand selection implemented

- **Status:** Completed
- **Work Completed:** Replaced deterministic highest-score winner selection with a weighted lottery based on each stand's computed score, keeping the simulation server-authoritative and seed-deterministic while allowing near-equal stands to split customers more naturally. Added an engine test that checks aggregate behavior for a slight stand advantage under controlled conditions, documented the future segmented-customer mechanic idea in `ideas/mechanics.md`, added the follow-on concept for a purchasable customer-preference tooltip plus persistent customer profiles, and updated `AGENTS.md` so future ideas are captured in `ideas/`.
- **Validation:** `npx vitest run src/game/engine.test.ts`, `npm run test:run`, and `npm run build`
- **Decisions / Notes:** The current fix intentionally keeps the existing score formula and only changes how scores are converted into stand choice. This is the lowest-risk balance improvement and leaves room for future customer segment mechanics on top of the weighted selector.
- **Next Step:** Run manual multiplayer gameplay checks to confirm customer flow now looks less binary in real play, then decide whether score weighting needs tuning after hands-on testing.

## Validation

- `git status --short`
- `git branch --show-current`
- `ls -1 tasks`
- `npx vitest run src/game/engine.test.ts server/lan-room-server.test.ts src/App.test.tsx`
- `npm run test:run`
- `npm run build`
- `node "$WEB_GAME_CLIENT" --url "http://127.0.0.1:5173/?name=Alex&faction=sun-guild" --actions-file "$WEB_GAME_ACTIONS" --click-selector "button:has-text('Host LAN Room')" --iterations 2 --pause-ms 250`
- `npm run test:run -- src/game/engine.test.ts src/App.test.tsx server/room-manager.test.ts`
- `npm run build`
- `npm run test:run`

### 2026-03-17 09:40:56 PDT - Live deployment multiplayer status check

- **Status:** Completed
- **Work Completed:** Reviewed the existing multiplayer task artifacts and code paths to verify scope, then smoke-tested the public deployment at `https://jordanlevy.xyz`. Confirmed the original implementation task was intentionally scoped to LAN-only UX/documentation, but the live deployment now exposes the multiplayer WebSocket endpoint at `wss://jordanlevy.xyz/ws` and supports room creation plus a second client joining the same room over the public domain.
- **Validation:** Reviewed `tasks/multiplayer-lan-mvp/spec.md`, `tasks/multiplayer-lan-mvp/progress_log.md`, `src/client/socket.ts`, `src/App.tsx`, `server/socket-server.ts`, and `docs/deployment/hetzner-vps.md`. Verified `https://jordanlevy.xyz` returned `200 OK`. Opened a live WebSocket connection to `wss://jordanlevy.xyz/ws` and received a successful `connected` response after sending `create_room`. Opened two live WebSocket clients against `wss://jordanlevy.xyz/ws`, created a room, joined it from the second client, and confirmed both players reached the `planning` phase in the same room.
- **Decisions / Notes:** Current mismatch is mostly naming/scope communication rather than backend capability. The repo still labels the product and UI as `LAN MVP`, and the task spec explicitly lists internet play as out of scope, but the deployed architecture now supports direct internet play via a shared public host plus room id as long as both players can reach `jordanlevy.xyz`.
- **Next Step:** Decide whether to treat this as an official internet-play MVP and update product copy/docs accordingly, or keep positioning it as LAN-first until we manually validate the full browser flow between two real remote players.

### 2026-03-17 13:12:35 PDT - Cross-network mobile verification and intermittent connection review

- **Status:** Completed
- **Work Completed:** Reviewed the intermittent mobile error report against the live client strings and deployment behavior after cross-network manual testing began to succeed from mobile to mobile. Confirmed the likely user-facing error text is currently `The LAN room connection failed.` from the browser WebSocket error handler, with `The room connection closed.` as the related close-path fallback.
- **Validation:** Inspected `src/client/socket.ts`, `src/App.tsx`, and `deploy/nginx/roguelike-lemonade-stand.conf`. Reviewed live Nginx access logs showing successful `GET /ws` upgrades with `101` responses from both mobile clients and no corresponding Nginx error log entries during the reported failures.
- **Decisions / Notes:** The evidence points away from a basic Nginx WebSocket proxy misconfiguration and toward an intermittent connection-lifecycle issue, likely on the browser/mobile/network side or due to missing keepalive behavior in the current WebSocket flow. The existing `LAN` wording in errors is now misleading for the public deployment and makes diagnosis harder.
- **Next Step:** Add better connection diagnostics, neutralize the public-facing `LAN` error text, and consider heartbeat / reconnect handling if manual testing keeps showing sporadic mobile disconnects.

### 2026-03-17 13:24:25 PDT - Connection instrumentation added for live debugging

- **Status:** Completed
- **Work Completed:** Added client-side websocket diagnostics for open, error, and close events, including close-code details surfaced through the UI when a room connection drops. Added server-side structured lifecycle logging for socket connect, inbound message types, room creation/join, plan submission, next-day requests, socket errors, socket close events, and player disconnects. Added tests covering the new close diagnostics and server logging path.
- **Validation:** `npx vitest run src/App.test.tsx server/socket-server.test.ts`, `npx vitest run src/game/engine.test.ts src/App.test.tsx server/room-manager.test.ts server/socket-server.test.ts`, and `npm run build`
- **Decisions / Notes:** Kept the instrumentation additive and low-risk by avoiding gameplay-protocol changes. Current work improves observability first so the next intermittent mobile failure should yield actionable client close codes and server lifecycle logs before we decide whether heartbeat or reconnect logic is needed.
- **Next Step:** Manually reproduce the intermittent mobile disconnect again, capture the exact on-screen error plus new server logs, and then decide whether to prioritize keepalive, reconnect, or deployment header refinements.
