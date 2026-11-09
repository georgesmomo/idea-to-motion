# Example: a 3D French Reel, "your brain in 5 numbers" (9:16)

**Prompt:** `/idea-to-motion Reel de 30 s en français : "Ton cerveau en 5 chiffres", voix off, énergique, en 3D, transitions qui claquent`

https://github.com/user-attachments/assets/a9980191-ec32-4d27-aa4d-d84a5b5b2eda

Complete brief, so no questions. Result: the video above
(29.1 s, 1080x1920, darktech style with a neon brand override, energetic 126 bpm, French voice `ff_siwis`, motion blur on).

What it shows:
- **MO3D in every scene** (three.js, drawn from the scene timeline, seek-safe):
  - Noto emoji extruded into 3D objects with their own colours (`MO3D.svg`: brain, balance scale, battery, lightning bolt, droplet);
  - 3D type in the style's font, letter by letter (`MO3D.text(..., { letters: true })` + `MO3D.letters`: flip, drop with bounce, spin);
  - point clouds (`MO3D.particles`: a sphere of neurons, a warp tunnel, a ring, rising bubbles);
  - materials (metal, gold on a floor with contact shadows, neon with bloom, clay, a glass sphere refracting the drop);
  - camera moves and punch-ins (`MO3D.cam`), idle hover (`MO3D.hover`).
- **Six different transitions, each on overlapping scenes** (`"overlap"` in project.json, enter/exit on `#sN-scene`): deep (dive into the brain), cube, cube up, spin, deck, blur.
- One number per beat, counted 1/5 → 5/5, synced to the French voice with `MO.atWord`, counters (`MO.count`), a flash on the "mais" hit, a recap and a share CTA on the beat.
- `vo` in normal spelling for the screen, `say` for numbers in words ("quatre-vingt-six milliards").
- Every number sourced in [facts.md](facts.md); text kept inside the Reels/TikTok safe box and out of the like/share rail.

Tip learned here: `MO3D.svg` normalises its size through `obj.scale`, so animate scale on a holder group (`new st.T.Group()` passed as `parent`), not on the returned object.
