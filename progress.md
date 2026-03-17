Original prompt: ok lets add a quick feature for computing the amount of cups that can be sold based on the current inventory, and total amount that can be sold based on what ingredients you would be buying, based on the current selection we have on ingredients to buy. there should be a slick interface with simple text telling us how many we will be able to sell after buying these ingredients by adding the potential purchased ingredients to the current inventory. additionally, lets add a small feature where the inventory account updates in real time as sales are made

## 2026-03-13 11:22:35 PDT

- Started a new task workspace at `tasks/inventory-sales-forecast/`.
- Reviewed the morning setup flow, existing inventory handling, tests, and style guide.
- Planned to implement this in TDD order: add failing tests for forecast math and live inventory playback, then wire the UI and animation state.

## 2026-03-13 11:30:36 PDT

- Added red tests for sellable-cup forecasting and live day inventory output, then implemented the supporting engine helpers and UI.
- Morning setup now includes a forecast panel that compares current cup capacity against the staged shopping basket in real time.
- Day playback now derives inventory-on-hand from resolved sales so the sidebar and `render_game_to_text` stay synced with the visible simulation.
- Validation passed with targeted Vitest runs, the full test suite, a production build, and browser screenshots in `output/web-game/`.
