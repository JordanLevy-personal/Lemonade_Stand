# Task Spec: Lemonade Stand UI Foundation

## Summary

- Create the first themed visual pass for the playable lemonade stand UI so the game starts to feel like a street-side stand simulation instead of a generic panel app.
- Use the provided coffee shop game screenshot as visual inspiration for composition and mood, while keeping the first pass intentionally simpler and faster to build with basic shapes, lightweight assets, and clean layout structure.
- Make the day phase feel like an actual selling experience by showing customers move across the screen and visually signal whether they buy.

## Goal

- Rework the current React UI into a simple but cohesive lemonade stand presentation that supports the existing game flow and gives us a solid base for future polish, animation, and richer art.
- Introduce a readable customer flow during the day phase so players can watch demand resolve instead of only jumping straight from setup to report data.

## Success Criteria

- The main play screen reads as a lemonade stand scene rather than a dashboard.
- Existing gameplay information remains accessible and usable across Morning, Evening, Night Draft, and Game Over states.
- The first pass works with placeholder art, simple geometry, or generated assets so implementation is not blocked on final illustrations.
- The UI is visually structured in a way that can accept upgraded art assets later without another large rewrite.
- The day phase visibly shows individual customers traversing the scene and indicating purchase or non-purchase outcomes.
- The first indicator pass uses simple symbols above customers, with a clean path to later replace those symbols with richer reason icons such as price, reputation, weather, or recipe.

## In Scope

- Establish an art direction for the first playable themed UI based on the pasted coffee shop reference:
  - street or sidewalk scene backdrop
  - simple lemonade stand/cart focal point
  - HUD-style overlays for money, rent, weather, inventory, and day status
  - simplified neighborhood or environmental framing around the stand
- Redesign the existing screens and panels to fit that scene-based layout.
- Keep the current game systems and interaction flow intact while changing presentation.
- Add a visible day-resolution sequence where customers move through the scene one at a time or in a controlled stream.
- Represent customers as simple stick-figure placeholders in the first pass.
- Show a temporary visual decision indicator above each customer:
  - `green check` for purchase
  - `red X` for no purchase
- Design the customer indicator layer so it can later support reason-specific icons or bubbles for price, reputation, weather, recipe, or stock issues.
- Use basic shapes, gradients, borders, and temporary assets where needed.
- Prepare the UI so later assets can replace placeholders with minimal structural changes.
- Identify which art can be provided by the user versus generated with the `imagegen` skill versus built directly in CSS/SVG.
- Use the `develop-web-game` skill during implementation for short iteration loops, visual checks, screenshots, and browser validation.

## Out of Scope

- Final polished production art for every element.
- Complex character animation, crowd simulation, or advanced scene motion.
- Rewriting core gameplay rules, card balance, save logic, or simulation systems.
- Building a fully asset-driven scene pipeline before the first themed UI pass is proven out.
- Matching the reference image one-to-one in complexity.
- Final reason-icon artwork for all customer decision causes in the first implementation pass.

## UX / Behavior / Workflow

- The stand/cart should be the visual centerpiece of the main game screen.
- Key player stats should remain quickly readable at a glance, ideally in compact overlay panels rather than large stacked cards.
- Morning setup should feel like preparing the stand for the day.
- Submitting the morning setup should transition into a visible day simulation rather than an immediate hidden calculation.
- During the day phase, customers should enter the scene, walk past or toward the stand, resolve a buy/no-buy decision, and then continue off-screen.
- A customer who buys should communicate success clearly before leaving the scene.
- A customer who does not buy should communicate rejection clearly before leaving the scene.
- The first pass will use a `green check` or `red X` above the customer head instead of a detailed speech bubble.
- The customer flow should feel paced enough to watch, but not so slow that a day becomes tedious.
- Evening results should occur after the visible customer sequence completes.
- Evening results should feel like a recap layered onto the same world/theme rather than a disconnected admin screen.
- Night draft should still feel distinct, but remain visually connected to the lemonade stand presentation.
- Desktop is the primary target for this pass, with mobile and smaller widths remaining usable and readable.
- The first pass should favor clarity and layout confidence over art quantity.

## Technical Constraints

- Follow TDD for UI-facing changes where practical, extending the existing React/Vitest/Testing Library coverage before or alongside implementation.
- Keep the implementation within the existing Vite + React + TypeScript app structure.
- Preserve current gameplay behavior and state transitions in `src/App.tsx` and game engine modules unless a UI refactor requires small interface changes.
- Prefer exposing customer-resolution data from the simulation in a structured way rather than recreating business decisions separately in the UI.
- Any new customer animation or timeline state should remain simple, deterministic enough to test, and separable from the core business rules.
- Prefer modular UI components and asset boundaries that support later replacement and extension.
- Keep task artifacts inside `tasks/lemonade-stand-ui-foundation/`.
- Log progress as append-only entries in `progress_log.md`.

## Deliverables

- Updated task spec and progress log for this workstream.
- A first-pass themed lemonade stand UI implementation.
- A first-pass customer walk-by presentation for the day phase using stick-figure customers and decision indicators.
- Supporting tests for new UI structure and important interaction regressions.
- Any placeholder or generated assets needed for the first pass, stored in the repo and referenced by the UI.
- A clear list of recommended user-provided assets for future visual upgrades.

## Acceptance Criteria

- The app renders a simple scene-based lemonade stand UI that is visibly closer to the provided reference than the current dashboard layout.
- Morning, Evening, Night Draft, and Game Over states remain functional and understandable.
- The day phase includes an observable customer flow instead of only an immediate calculation jump.
- Customers are shown as simple placeholder figures that move across the scene.
- Each customer shows a visible `green check` or `red X` outcome indicator at decision time.
- Existing core interactions continue to work after the UI changes.
- Automated tests pass for the affected UI behavior.
- Manual test instructions are prepared for visual and interaction checks before any staging or commit step.
- Placeholder art usage is intentional and documented well enough for future asset replacement.

## Assumptions and Defaults

- The task slug for this workstream is `lemonade-stand-ui-foundation`.
- The first implementation pass will use simple rectangles, CSS styling, lightweight SVGs, or temporary generated art rather than waiting for hand-made final assets.
- The current screenshot is directional inspiration for layout, storefront feel, and scene composition, not a literal style target.
- Asset generation may use the `imagegen` skill if that is faster than hand-creating placeholders and if generated art fits the current visual direction.
- The user may later provide custom assets such as background art, stand/cart art, signage, icons, character cutouts, or decorative props.
- If no asset is available for a UI element, the default is to build a clean placeholder version in CSS or SVG first.
- Customer placeholders will default to simple stick figures until better crowd art exists.
- Customer decision feedback will default to `green check` and `red X` indicators before we introduce reason-specific icon bubbles.
