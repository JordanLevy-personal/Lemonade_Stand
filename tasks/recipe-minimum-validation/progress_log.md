# Progress Log

## Task

- **Name:** Recipe Minimum Validation
- **Started:** 2026-03-17 15:15:14 PDT
- **Current Status:** In Progress

## Session Summary

Fixing recipe validation so lemons and sugar cannot be zero while supporting fractional recipes and applying a steeper nonlinear satisfaction curve.

## Timeline

### 2026-03-17 15:15:14 PDT - Task initialized

- **Status:** In Progress
- **Work Completed:** Created the task workspace, reviewed the task workflow, inspected recipe validation paths, and traced the current satisfaction calculation in the engine.
- **Validation:** Read `AGENTS.md`, skill instructions, `docs/STYLE.md`, `progress.md`, and the relevant engine/app files.
- **Decisions / Notes:** Scoped the change to engine sanitization, UI minimums, and targeted tests only. Satisfaction balancing remains explanatory for this pass.
- **Next Step:** Add failing tests for the new recipe minimum rules, then implement the smallest supporting code change.

### 2026-03-17 15:19:26 PDT - Validation fix completed

- **Status:** Completed
- **Work Completed:** Added TDD coverage for recipe minimums, introduced shared recipe sanitization that floors lemons and sugar at `1` while keeping ice at `0`, and updated the planning UI to enforce the same rule before submission.
- **Validation:** `npm run test:run -- src/game/engine.test.ts src/App.test.tsx`; `npm run test:run`; `npm run build`; browser sanity pass via the Playwright client against `npm run dev:lan`, with artifacts in `output/web-game/recipe-minimum-validation/`.
- **Decisions / Notes:** Updated a deterministic simulation test to use stocked inventory instead of the retired all-zero infinite-cup exploit.
- **Next Step:** If desired, rebalance satisfaction to add a stronger nonlinear penalty for low-ingredient recipes once taste profiles are defined.

### 2026-03-17 15:31:30 PDT - Fractional recipe and satisfaction rebalance

- **Status:** Completed
- **Work Completed:** Replaced whole-number recipe clamping with shared fractional sanitization at `0.1` minimum for lemons and sugar, preserved decimal recipe values, hardened sellable-cup math for fractional quantities, and changed satisfaction to a quadratic curve over recipe fit and price score.
- **Validation:** `npm run test:run -- src/game/engine.test.ts src/App.test.tsx`; `npm run test:run`; `npm run build`; browser sanity pass via the Playwright client against `npm run dev:lan`, with artifacts in `output/web-game/recipe-minimum-validation-fractions/`.
- **Decisions / Notes:** Kept stand-selection scoring unchanged and scoped the nonlinear change to satisfaction/reputation only. Used `0.1` as the current fractional minimum/step for recipe ingredients.
- **Next Step:** If you want customer choice itself to punish weak recipes/prices more aggressively, apply the same curve to `calculateStandScore` in a follow-up.

## Validation

- `npm run test:run -- src/game/engine.test.ts src/App.test.tsx`
- `npm run test:run`
- `npm run build`
- Playwright browser sanity artifacts in `output/web-game/recipe-minimum-validation/`
- Playwright browser sanity artifacts in `output/web-game/recipe-minimum-validation-fractions/`
