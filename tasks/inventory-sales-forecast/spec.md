# Task Spec: Inventory Sales Forecast

## Summary

- Add a morning-planning UI that shows how many cups can be sold from current inventory and how many cups could be sold after applying the currently selected ingredient purchases.
- Keep the inventory display in sync during the animated day so players can see stock deplete in real time as sales happen.

## Goal

- Help the player understand immediate sales capacity before starting the day and make inventory consumption feel visible during the day simulation.

## Success Criteria

- Morning setup shows current sellable cups based on inventory and recipe.
- Morning setup shows projected sellable cups after adding the selected purchases to inventory.
- The projected values update live as purchase quantities or recipe values change.
- The day simulation inventory display updates as resolved sales consume ingredients instead of waiting until the end-of-day summary.

## In Scope

- Inventory-to-cups calculations based on the active recipe.
- A polished, lightweight forecast panel in the morning setup UI.
- Real-time inventory readout updates during the day playback.
- Automated tests for the new calculations and UI behavior.

## Out of Scope

- Rebalancing demand, pricing, or customer generation.
- Changing save format or long-term progression systems.
- Adding new ingredients or recipe dimensions.

## UX / Behavior / Workflow

- The morning setup should explain in simple text how many cups the player can sell now and how many they can sell after the staged purchases are added.
- Forecast messaging should feel like a helpful planning aid rather than a spreadsheet dump.
- The inventory HUD during the day should reflect remaining lemons, sugar, and ice as customer purchases resolve.

## Technical Constraints

- Follow TDD and keep code changes aligned with SOLID and clean-code principles.
- Keep task artifacts inside `tasks/inventory-sales-forecast/`.
- Preserve the existing visual language described in `docs/STYLE.md`.
- Use the existing React/Vitest setup for validation.

## Deliverables

- Updated application logic and styles for the forecast and live inventory behavior.
- New or updated automated tests covering the feature.
- Task documentation in `tasks/inventory-sales-forecast/`.

## Acceptance Criteria

- With any valid recipe, the UI shows current cups available from inventory and projected cups available after selected purchases.
- Forecast values update without submitting the form.
- During the day playback, the inventory display decreases in sync with completed sales.
- Existing tests still pass, and new tests cover the added behavior.

## Assumptions and Defaults

- Cup capacity is limited strictly by ingredient counts and the active recipe quantities.
- A recipe ingredient value of zero should not block the forecast for the other ingredients.
- The morning forecast uses the staged purchase selection only; it does not assume extra money beyond the current chosen basket.
