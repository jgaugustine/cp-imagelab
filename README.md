## Overview

ImageLab is an interactive playground for image adjustments with math-first explanations.


## Features

- Centered, intuitive controls: brightness (±), contrast (×), saturation (×), vibrance (±), hue (±°)
- Pixel inspector: original vs transformed values with step-by-step transforms
- Toggle between gamma-space and linear-light saturation model
- RGB cube visualizations for intuition
- Customizable transform order


## Getting started

Prereqs: Node 18+ (or a compatible runtime)

Install dependencies:

```bash
npm install
```

Run the dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```


## Tech stack

- Vite + React + TypeScript
- Tailwind CSS + shadcn/ui components


## Project structure

- `src/pages/Index.tsx`: main page and controls
- `src/components/ImageCanvas.tsx`: rendering and per-pixel transforms
- `src/components/MathExplanation.tsx`: math, visualizations, and explanations
- `src/components/PixelInspector.tsx`: per-pixel inspection overlay
- `src/components/TransformationOrderControls.tsx`: pipeline ordering UI
- `src/lib/imageResize.ts`: client-side downscale helper for uploads
- `src/types/transformations.ts`: shared types


## Why I chose these control conventions

I designed the ImageLab controls so that each knob reflects the underlying math and matches common imaging conventions. Here’s what I chose and why.

### Brightness (± amount, neutral = 0)
I chose brightness as an additive offset centered at 0 because brightness is literally modeled as adding a constant to each RGB channel. Positive values add light, negative values subtract light. A signed control with 0 in the middle directly mirrors this model and keeps the slider’s midpoint “neutral.”

- **Model**: `rgb' = rgb + brightness`
- **Range**: [-100, 100]
- **Why**: Matches matrix-addition intuition and most imaging UIs.

### Contrast (× factor, neutral = 1.00)
I chose contrast as a multiplier with 1.00 as neutral because contrast is modeled as scaling distances from mid-gray. A factor of 1 leaves the image unchanged; values below 1 compress contrast; values above 1 expand it.

- **Model**: `rgb' = (rgb - 128) * contrast + 128`
- **Range**: [0.00, 2.00]
- **Why**: Multiplier conveys “how much contrast” clearly; 1× is naturally neutral.

### Saturation (× factor, neutral = 1.00)
I chose saturation as a multiplier with 1.00 neutral to stay faithful to the math (mixing each pixel toward/away from its luma/gray). This also aligns with web/CSS filters and color pipeline literature.

- **Model (gamma-space)**: `rgb' = gray + (rgb - gray) * saturation`
- **Range**: [0.00, 2.00]
- **Why**: A multiplier best communicates “chroma scaling,” with 1× unchanged.

### Vibrance (± amount, neutral = 0)
I chose vibrance as a signed amount centered at 0 because vibrance is an adaptive saturation boost that depends on how saturated a color already is. It’s not a simple global multiplier; instead, it increases low-sat colors more than high-sat ones, and can also be negative for gentle desaturation.

- **Model**: `factor = saturation + vibrance * (1 - s)` where `s` is a per-pixel saturation estimate
- **Range**: [-1.00, 1.00]
- **Why**: A ± control communicates “amount of adaptive boost,” not a uniform scale. 0 is neutral, positive values add tasteful color without clipping highly saturated pixels.

### Hue (± degrees, neutral = 0°)
I chose hue as a signed rotation in degrees centered at 0° because hue is a rotation in color space. Allowing negative rotation makes the slider symmetric and intuitive.

- **Model**: rotate RGB around the gray axis via a 3×3 rotation matrix
- **Range**: [-180°, 180°]
- **Why**: Symmetric rotation around 0° matches mental models and preserves wrap-around.

### Centered sliders for neutral values
I centered every control’s neutral value so the middle position means “no change.”

- **Brightness**: 0 at center (± amounts)
- **Contrast**: 1× at center (0–2 range)
- **Saturation**: 1× at center (0–2 range)
- **Vibrance**: 0 at center (± amounts)
- **Hue**: 0° at center (± degrees)

This consistency reduces cognitive load: move left to subtract/decrease, right to add/increase; the midpoint always means “original image.”

### Standards and references I aligned with
- **Mathematical models**: additive brightness, contrast as mid-gray scaling, saturation as chroma scaling toward gray, hue as rotation about the gray axis.
- **Common UIs**: 0-centered sliders for additive/angle controls; 1×-centered sliders for multiplicative controls.
- **Web/CSS**: `saturate()` and `contrast()` use multiplicative factors with 1 as neutral.

### Practical safeguards (implementation detail)
Where appropriate, I clamp channel values to [0, 255] and bound effective saturation factors to prevent numerical inversions or excessive clipping, while preserving a responsive feel.


## Saturation (multiplier) vs. Vibrance (adaptive amount)

I chose to present Saturation as a multiplier and Vibrance as a ± amount because they play different roles:

- Saturation uniformly scales chroma for every pixel relative to its gray/luma. That’s a pure scaling operation, so a factor with 1× neutral is the clearest representation.

- Vibrance is intentionally non-uniform: it boosts low-saturation regions more than already vivid regions to avoid oversaturation. It modifies the saturation factor by an amount that depends on current per-pixel saturation `s`:
  - `effectiveFactor = saturation + vibrance * (1 - s)`

So, a multiplier UI for vibrance would be misleading (it isn’t a uniform scale), while a ± amount centered at 0 communicates “add or subtract adaptive saturation.”


