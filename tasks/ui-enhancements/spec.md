# UI Enhancements

## Summary
Enhance the visual appeal and dynamic feel of Roguelike Lemonade Stand by upgrading from basic CSS shapes to premium, animated aesthetics while preserving the existing React game engine logic.

## Goal and success criteria
- **Goal:** Transform the game from a minimal prototype to a polished, premium experience by adding dynamic backgrounds, characterized customer sprites, day/night transitions, and rich card artwork.
- **Success Criteria:** The user perceives a noticeable quality jump in game feel; weather actually looks like weather; customers feel alive; night market cards have visual identity. We will use `nano banana 2` (via the generate_image tool) to generate any necessary assets.

## Proposed Enhancements (In-Scope)
Based on a review of the game flow and screenshots, here are the proposed enhancements:
1. **Dynamic Weather & Time of Day:** Current background is static. We will add sky gradient transitions that smoothly shift from morning to sunset, along with particle overlays for rain or custom CSS weather effects based on the `GameState.weather`.
2. **Customer Sprites:** Replace the CSS stick figures with generated character sprites. We will use the image/asset generation tool to create a few distinct customer types and animate their walking cycles across the lane.
3. **Card Artwork (Night Market & Active Build):** The "Night Market" drafting screen lacks "roguelike" flair. We will generate minimalist, tarot-style icons or illustrations for each upgrade card category to make drafting visually satisfying.
4. **Micro-Animations & Polish:** Add satisfying spring animations for customer reaction indicators (✅/❌), money floating text on successful sales, and hover/focus states for all interactive panels.
5. **Stand Evolution:** Add visual tiers to the `stand-cart` that reflect the player's reputation or day progression, replacing the simple shape composition.

Out-of-scope:
- Altering the underlying game simulation math (e.g. `balance.ts`, `engine.ts`)

## Technical constraints and dependencies
- The enhancements must live purely in the presentation layer (`App.tsx`, `App.css`, `index.css`, new components).
- Any generated images must be placed in `src/assets/` and optimized.
- We must expose `window.render_game_to_text` and `window.advanceTime` in the global scope to support automated testing with the `develop-web-game` Playwright client.

## Assumptions and defaults
- The aesthetic should evoke the classic "Cool Math Games" Lemonade Stand (bright yellow stand, clear blue skies, vibrant green grass) but rendered with a "modern" premium feel (e.g., smooth gradients, subtle drop shadows, clean vector shapes, perhaps 2.5D layered depth).
- The existing teal/gold typography and metric cards can be adapted or re-themed to match this vibrant, nostalgic direction while keeping the modern UI architecture.
