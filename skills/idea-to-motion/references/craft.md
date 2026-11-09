# Craft rules

30 fps reference (1 frame = 33 ms). UI motion specs are for apps; video needs longer, because
nothing is triggered by the viewer and everything must be read. The kit's defaults already
follow this table, scaled by the style's `--mo-speed`.

## Timing

| Action | Duration | Ease |
|---|---|---|
| Icon, badge, dot in | 0.3–0.45 s | `back.out` (style overshoot) or `expo.out` |
| Text line, card in | 0.45–0.7 s | the style's ease-in (`power3.out`, `expo.out`...) |
| Panel, chart, group in | 0.6–0.9 s | same |
| Exit | 50–75 % of the entrance | `power2.in` |
| Emphasis pulse | 0.3 s | `power2.out` yoyo |
| Camera move | 0.8–1.5 s | `expo.inOut` |
| Scene transition | 0.3–0.6 s | `expo` / `power3.inOut` |
| Stroke draw | 0.5–1 s | `power2.inOut` |
| Number counter | 0.8–1.5 s | `power2.out` |
| Typing | 18–35 chars/s with jitter, ≤ 1.8 s per line | stepped |

- **Stagger:** list items 0.06–0.12 s, letters 0.02–0.05 s, words 0.05–0.08 s; total span ≤ 0.8 s.
- **Overlap:** start the next move at 60–75 % of the previous one. Never more than 3 moves
  strictly end-to-start.
- **Rhythm:** vary it: fast build, held read, snap. Scene lengths too (2.5, 2.5, 5, 2.5...).
  Speed up toward the climax, then release on the end card.
- **Distances:** text slides 20–60 px; cards scale from 0.9; icons from 0.4. Never fly text
  across the screen.
- **Overshoot** only on icons, badges, buttons, playful styles. Never on paragraphs, logos in
  luxury or editorial.

## Reading holds

- Any text ≥ 0.5 s + 0.3 s per word after it finishes appearing (min 1 s); numbers ≥ 1.5 s;
  the end card ≥ 2 s. About 2 words per second is a comfortable kinetic-type pace; 3 is the ceiling.
- While the viewer reads, only one thing moves (background drift, a breathe, one float).
- A new visual event every 1.5–3 s; never more than 3 s static.

## Typography

- Max 2 families (the style's display + body; mono only for numbers, code or labels).
- Display line-height 0.92–1.05, tracking slightly negative for big sans, positive for small caps.
- Minimum sizes at render size: 16:9 body 40, labels 34, smallest 28 · 9:16 body 46, labels 44,
  smallest 32 · 1:1 / 4:5 body 42, smallest 30. The `--fs-*` variables already respect these.
- Words on screen: ≤ 12 at once (≤ 8 on 9:16), ≤ 7 per line; break lines by meaning, not width.
- Kinetic type: one idea per beat, the key word bigger, heavier or in the accent; vary size
  (1 huge word, then a small line) rather than many same-size lines.

## Safe areas

| Canvas | Keep text inside |
|---|---|
| 16:9 1920×1080 | 96 px left/right, 64 px top, 120 px bottom |
| 9:16 1080×1920 (Shorts / Reels / TikTok) | top 250, bottom 560, 100 left and right (centred box ~880×1110); plus the like/share rail: no text in the right 190 px between 50 % and 82 % of the height (the check measures it) |
| 4:5 1080×1350 | 60 px sides, 80 top, 160 bottom |
| 1:1 1080×1080 | 60 px all sides |

Backgrounds, shapes and decoration may bleed; text and key visuals may not.

## Colour

- Only the style's variables (or brand overrides). 60/30/10: background, neutrals, accent.
  One accent per scene; `--accent-2` for "the thing that is different".
- Never meaning by colour alone: pair red/green with a word or an icon.
- Text contrast ≥ 4.5:1 (large display text ≥ 3:1).

## Layouts (pick one per scene, vary them)

Numbers are for the safe box (inside the platform margins). "Hero" = the main visual: an
illustration, a chart, a mockup, a giant number or word.

| Layout | 16:9 | 9:16 | 1:1 / 4:5 | Use for |
|---|---|---|---|---|
| **Split** | text column 40–45 % left, hero ≥ 60 % of the box height on the right (or mirrored) | not used: becomes Stack | text 50 % / hero 50 % side by side only with short text | statement + visual, before/after |
| **Stack** | hero top 50 %, title + one line under it | hero top 40–45 %, title, one line | hero top 50 % | most social scenes |
| **Full-bleed** | hero 70–90 % of the box, text on a card or a band | hero fills the box, 1–3 words over it | same | reveals, product, logo, big numbers |
| **Grid** | 2–4 cards in a row, equal widths, gap 40–56 px | 2–3 cards stacked, full width | 2×2 | lists, features, reasons, comparisons |
| **Kinetic** | 1–3 huge words centred (`--fs-mega` / `--fs-hook`), nothing else | same, max 2 words per line | same | hooks, quotes, punchlines |
| **Diagram** | nodes across the width, flow left → right | flow top → bottom | flow top → bottom | processes, systems, journeys |

- A recurring hero (the same product, mascot, object) changes scale, crop or position every
  scene: big in the hook, small in a corner of the list, full-bleed in the reveal.
- Never leave half the box empty unless the emptiness is the point (luxury, a single word).
  Fill with the style background, `MO.shapes`, a giant faded icon or number behind the content.
- Swiss and editorial: left-aligned Split and Grid on a visible grid; kinetic: Kinetic and
  Full-bleed; flat, iso, pastel, glass: Stack and Grid with cards.

## Composition

- Design every frame as a poster: one focal point, clear hierarchy, deliberate empty space.
- Swiss and editorial: left-aligned, asymmetric, on a grid. Kinetic: centred, huge. Others:
  centred groups with breathing room.
- Keep elements on consistent margins; reuse positions across scenes (a title stays where the
  previous one was): continuity feels edited.
- Match cuts beat transitions: the last frame's shape becomes the next frame's shape (a
  circle becomes a sun, a bar becomes a road).

## Transitions

| Transition | When |
|---|---|
| Cut (on the beat) | most changes, kinetic and social styles |
| Push / up | the next step of a sequence |
| Whip | topic change, high energy |
| Zoom / dive | into a detail |
| Fade / blur | luxury, editorial, emotional |
| Panel wipe | bold section breaks, listicles |
| Iris / wipe | playful reveals, once |

One family per video plus dive/zoom. A transition is ≤ 10 % of its scene.

## Light 3D and depth

CSS 3D, sparingly (≤ 20 % of the video): an isometric stack (`perspective: 1600px` on a
wrapper, `rotateX(55deg) rotateZ(-45deg)` on the layer), cards with a slight `rotateY`
settling to 0°, `MO.parallax` layers, `MO.push` slow push-ins. Never text on a plane tilted
more than 25°.

## What makes motion look cheap (avoid all)

Uniform fades on everything; one easing everywhere; everything appearing at once; bounce on
every element; dead frames > 3 s or constant chaos; tiny text or paragraphs; text under
platform UI; > 2 font families; pure #000/#FFF on large areas (except kinetic/luxury styles by
design); misaligned boxes; a logo intro instead of a hook; generic stock metaphors (light
bulbs, gears, handshakes) when a concrete visual of the topic exists; a sound on every event;
abrupt ending; music that ends before the video.
