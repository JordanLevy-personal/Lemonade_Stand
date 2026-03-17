# Mechanics Ideas

## Customer Preference Segments

### Summary

Add lightweight customer archetypes so stand choice is not driven only by a shared market score. This would sit on top of the current weighted stand selection rather than replace it.

### Candidate archetypes

- `Bargain hunters`: overweight lower price and accept weaker recipe fit.
- `Quality seekers`: overweight recipe-weather fit and satisfaction history.
- `Regulars`: overweight reputation and recent positive experiences with a stand.
- `Impulse buyers`: include a larger randomness band and weaker loyalty.

### How it could work

1. Generate a customer segment before stand scoring.
2. Adjust the effective stand score weights for that segment.
3. Optionally add a small per-customer loyalty bonus toward one stand.
4. Run the existing weighted winner selection using the adjusted scores.

### Upgrade idea: customer insight tooltip

Introduce a purchasable upgrade that reveals each customer's preferences in a tooltip or hover card while they are active in the day simulation.

- The tooltip could surface traits like `price sensitive`, `quality focused`, `loyal`, or `impulsive`.
- This would make customer segmentation legible to the player instead of feeling like hidden math.
- It creates a satisfying information-economy upgrade path without changing the underlying market rules.

### Persistent customer profiles

If we add the insight upgrade, customers should become persistent entities with unique profiles that stay consistent across the run.

- Each customer would spawn from a reusable profile rather than from a fully anonymous one-off roll.
- Profiles could store stable preferences, loyalty lean, and a small memory of past purchases or satisfaction.
- That would support future mechanics like regulars, word-of-mouth, neighborhood identity, and more informed strategic pricing.
- Server-side deterministic generation would still matter so the same profile history is shared across both multiplayer clients.

### Why this could help

- Makes the market feel less robotic and less purely deterministic.
- Creates room for different viable strategies instead of one dominant pricing pattern.
- Gives us a clean path to future features like repeat customers, neighborhood identity, and faction flavor.

### MVP-friendly guardrails

- Keep segment count small, likely `3-4`.
- Make the segment effect visible only through outcomes first; UI explanation can come later.
- Preserve deterministic server authority by generating segments from the room RNG.

## Flavor Variants And Area Demand

### Summary

Add named lemonade variants later, then let neighborhoods or runs have different demand pockets so not every flavor is universally good.

### Candidate directions

- `Named flavors`: strawberry, cherry, blueberry, and other variants that layer on top of the base lemon/sugar/ice recipe.
- `Area preferences`: some locations or customer groups strongly prefer one flavor while others treat it as niche.
- `Premium pricing`: specialty flavors can justify higher prices when demand is present, but create waste risk when the area is cold on that flavor.

### Why this could help

- Makes product choice feel more expressive than only tuning the base mix.
- Creates a more interesting risk-reward decision around niche demand and premium pricing.
- Pairs naturally with future customer insight tooling and persistent-profile systems.

### Guardrails

- Keep this out of the first persistent-profile implementation.
- Introduce flavors only after the current recipe-axis preference model feels good.
- Make area demand legible before adding a large flavor catalog.
