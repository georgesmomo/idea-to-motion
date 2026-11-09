# Example: AURA launch film (3D)

**Prompt:** `/idea-to-motion 30-second launch film for AURA, a smart speaker shaped like a glass orb. Keynote feel, 3D, dark stage, male voice-over. CTA: pre-order at aura.example`

> **AURA is a fictional product** invented for this showcase. Every spec on screen (360°,
> 20 h, "listens only when you ask") is a placeholder, listed as such in `facts.md`.
> `aura.example` is a reserved example domain.

Result: [assets/demo-aura.mp4](../../assets/demo-aura.mp4) (33.5 s, 16:9, darktech style with a lavender/aqua brand
override, energetic music, `am_michael` voice-over, −14 LUFS).

What it shows:
- **real-time 3D** with `MO3D` (three.js, drawn from the scene timeline, seek-safe): a clear
  glass orb holding a violet light core (fresnel halo, `MO3D.glow`) and a teal swirl of light
  (`MO3D.particles("galaxy")`), a halo ring, star fields and dust, bloom, contact shadows;
- **camera work in 3D**: a dive into a speck of light (s1 → s2), a 75° orbit around the
  product (s2), slow dollies under every feature;
- **extruded 3D logo** in the brand font (Sora, converted to 3D outlines at sync): chrome
  letters flip up one by one while a light bar sweeps behind them;
- **a beat montage** before the logo: four hard cuts of the orb from different angles, one per
  beat, each with its own dolly, recapping the features in one word each (`MO.punch`);
- **6 kinds of transition**: a blur dissolve out of the dive, a cube turn, a 3D deck slide, a
  whip with motion blur, hard cuts on the beat, a zoom-out (`back`) into the logo; overlapping
  scenes (`"overlap"` in `project.json`) where both faces show;
- **motion blur** on the whole film (`"motionBlur": true`);
- sound waves as flat rings that leave the orb on every beat, grow and fade (`MO.snap`), the core that "wakes up"
  exactly when the voice says "ask" (`MO.atWord`), counters (0 → 360°, 0 → 20 h);
- the music lift lands on the product reveal (`"hit": true` on s2).

Rebuild it:

```bash
node <skill>/scripts/motion.mjs final examples/aura-launch
```

(`sync` restores the generated files: kit copy, three.js, GSAP, fonts and 3D fonts; `sound`
regenerates the voice, music and effects. The render uses the GPU when Chrome has one; with
motion blur and eight 3D stages, about 3–8 minutes.)
