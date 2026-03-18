# Task Spec: Recipe Sliders

## Summary

- Replace the recipe number inputs in the planning screen with sliders.
- Support slider values for lemons and sugar from `0.1` to `5` in `0.1` steps.
- Support slider values for ice from `0` to `5` in whole-number steps.

## Goal

- Make recipe tuning faster and more tactile while preserving the existing planning flow and recipe sanitization rules.

## Success Criteria

- Lemons and sugar are controlled with sliders instead of number inputs.
- Lemons and sugar sliders move in `0.1` increments with bounds `0.1` through `5`.
- Ice is controlled with a slider that moves in whole numbers with bounds `0` through `5`.
- The submitted plan still preserves the selected recipe values accurately.
- Existing price and purchase fields continue to behave as they do today.

## In Scope

- Planning-screen recipe controls.
- Reusable slider field UI for bounded numeric recipe inputs.
- Test coverage for the slider behavior and submission payload.
- Styling needed to match the existing planning screen aesthetic.

## Out of Scope

- Changing recipe simulation rules or balancing.
- Converting shopping inputs or pricing to sliders.
- Larger planning-screen redesign beyond the new recipe controls.

## UX / Behavior / Workflow

- Each recipe ingredient shows a labeled slider and a visible current value.
- Lemons and sugar cannot be scrubbed below `0.1`.
- Ice can still be set to `0`.
- Price per cup remains an editable numeric field.

## Technical Constraints

- Follow TDD.
- Keep the change localized to the planning UI unless tests reveal a supporting need elsewhere.
- Prefer a reusable slider field instead of duplicating slider markup three times.
- Follow `docs/STYLE.md`, which explicitly prefers `RangeSliderField` for bounded numerical scrubbing.

## Deliverables

- Updated recipe controls in the planning screen.
- Automated tests covering the requested slider ranges and stepping behavior.
- Manual testing guidance for the new recipe interaction.

## Acceptance Criteria

- The planning screen renders sliders for lemons, sugar, and ice.
- Lemons slider uses `min=0.1`, `max=5`, and `step=0.1`.
- Sugar slider uses `min=0.1`, `max=5`, and `step=0.1`.
- Ice slider uses `min=0`, `max=5`, and `step=1`.
- Adjusting the sliders updates the submitted plan with the selected recipe values.
- Relevant automated tests pass.

## Assumptions and Defaults

- The lower bound for ice remains `0` to preserve no-ice recipes from the current rules.
- The upper bound of `5` is a temporary cap for all three ingredients until a later balancing pass changes it.
- Slider values may continue to flow through the existing recipe sanitization logic before submission.
