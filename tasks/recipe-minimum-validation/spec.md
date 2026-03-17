# Task Spec: Recipe Minimum Validation

## Summary

- Fix recipe validation so `0, 0, 0` is not allowed for lemonade recipes.
- Only ice may be set to `0`; lemons and sugar must remain positive decimal values.
- Rebalance satisfaction so middling and weak recipe/price scores fall off nonlinearly instead of linearly.

## Goal

- Prevent invalid low-effort recipes from being submitted while preserving the current ability to serve no-ice lemonade and make weak recipe/price combinations feel meaningfully worse in satisfaction.

## Success Criteria

- Lemons clamp to a positive decimal minimum instead of rounding to a whole number.
- Sugar clamps to a positive decimal minimum instead of rounding to a whole number.
- Ice still clamps to a minimum of `0`.
- Fractional recipe values above the minimum are preserved.
- Existing planning flow continues to work.
- Satisfaction applies a steeper nonlinear penalty as recipe fit and price score decline.

## In Scope

- Engine-side daily plan recipe sanitization.
- Planning UI minimum constraints for recipe inputs.
- Test coverage for the new validation behavior.
- Satisfaction-curve rebalancing and test coverage.

## Out of Scope

- Implementing taste profiles.
- Broader UI redesign of the planning controls.

## UX / Behavior / Workflow

- Players can still lower ice to `0`.
- Players cannot set lemons or sugar to `0`; values should sanitize back to a small positive decimal minimum.
- Players can use fractional ingredient amounts in recipes.

## Technical Constraints

- Follow TDD.
- Keep changes small and localized.
- Preserve existing multiplayer planning behavior.

## Deliverables

- Updated validation logic in the game engine.
- Updated planning input minimums in the client.
- Tests covering the validation rule.
- Updated satisfaction logic with nonlinear falloff.
- Manual testing guidance and a satisfaction-formula summary in the handoff.

## Acceptance Criteria

- Submitting or updating a recipe with `0` lemons or sugar results in the configured positive decimal minimum.
- Submitting or updating a recipe with `0` ice keeps `0`.
- Submitting fractional recipe values preserves those decimals.
- Satisfaction for middling recipe fit and price is lower than the old linear blend.
- Relevant automated tests pass.

## Assumptions and Defaults

- The fix should be implemented at both the model layer and the planning UI layer.
- A minimum step of `0.1` is an acceptable positive decimal floor for lemons and sugar until a different precision is requested.
- Existing recipes above the new minimums should remain unchanged apart from configured decimal rounding.
