# Lemonade Stand

A browser-based business sim where each day is a lemonade-stand management puzzle and each night is a card draft that bends the rules of the run.

## Tech Stack

- React 19
- TypeScript
- Vite
- Vitest + React Testing Library

## Runtime Requirements

- Node.js 22.12+ recommended
- npm 10+ recommended

## Scripts

- `npm install`
- `npm run dev`
- `npm test -- --run`
- `npm run lint`
- `npm run build`

## Architecture

- `src/game/engine.ts` contains the pure simulation loop, turn transitions, and save/load helpers.
- `src/game/cards.ts` defines the hook-based card catalog.
- `src/App.tsx` is the UI shell that drives the engine and persists the current run to local storage.

## Current Scope

- Instant day resolution with weather, inventory purchasing, recipe tuning, pricing, rent pressure, and bankruptcy game over.
- Full starter card deck with permanent, temporary, and instant effects.
- Local save/resume, desktop-first responsive UI, and automated coverage for both engine rules and key screens.
