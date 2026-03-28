# Lemonade Stand Style Guide

This document defines the core aesthetic principles and UI architecture for the project. When modifying the user interface or generating new visual assets, adhere to these guidelines.

## Visual Theme & Inspiration
- **Theme**: "Cool Math Games" nostalgia upgraded to a premium, modern standard.
- **Vibe**: Vibrant, approachable, slightly whimsical but polished.
- **Rendering Style**: Crisp, 2D flat perspective vector art. No isometric or 2.5D angles.
- **Visual Touches**: Subtle drop shadows, smooth gradients, and clean lines.

## Color Palette
- **Primary Elements**: Solid vibrant colors. Warm yellows, clear blue skies, bright greens.
- **Accents**: Deep teals and soft golds for text, containers, and building backgrounds.
- Avoid generic web colors (plain `#F00`, `#00F`). Use harmonized gradient sets.

## Component Architecture
- **CSS Hierarchy**: We rely heavily on `App.css` and `index.css` for customized styling. Avoid adding inline styles or utility classes like Tailwind unless explicitly requested.
- **Animations**: Prefer CSS keyframes over JS-driven animations for performance and simplicity (e.g., floating money `.floatUp`, walking customers `.waddle`).
- **Data Visualization**: Use `recharts` for charting metrics (e.g., Revenue & Profit over time in `EveningScreen`).
- **Interactive Elements**: Use the `RangeSliderField` for numerical inputs that require visual scrubbing across a bounded scale instead of generic `<input type="number">`.

## Asset Generation (Nano Banana)
When generating new images with `nano banana 2`:
- Ensure the prompt explicitly mandates "STRICTLY ISOLATED ON SOLID WHITE BACKGROUND. NO SKY, NO GRASS, NO BACKGROUND AT ALL."
- Include "flat straightforward 2D perspective. Clean lines, solid vibrant colors."
- Automatically trim white pixels and map them to a transparent alpha channel using `sharp` (see `remove_bg.js` or `trim_images.js` in the root).
