# Example: the universe in 40 seconds

**Prompt:** `/idea-to-motion 40-second explainer: from "you are here" to the edge of the observable universe, one continuous pull-back, 3D, documentary voice-over`

https://github.com/user-attachments/assets/9be14847-9370-47bb-9f0e-73bf7f1c15cf

The brief passed both intake gates, so the skill generated directly: no questions. Result:
the video above (40.6 s, 16:9, darktech style with
a cinematic brand override, epic music, British documentary voice, −14 LUFS).

What it shows:
- **everything is procedural 3D** (`MO3D`, three.js), with no image files: Earth with clouds and atmosphere, the Moon with
  craters, a granulated Sun, the solar system with orbiting planets, a 52,000-star spiral galaxy,
  a flight through 130 galaxies, the cosmic web inside the observable universe;
- **one camera that never stops pulling back**: a match cut from s1 to s2 on the same Earth, then
  `blur`, `back` (zoom out), `deep` (fly in) overlap transitions between worlds;
- HTML labels pinned to 3D points (`MO3D.label`): the "you are here" pin follows the Earth and
  the Milky Way;
- numbers counting on the word the voice says them (`MO.count` + `MO.atWord`), with a smaller
  unit in the same element;
- a photon travelling from the Sun to the Earth while the voice says "the light you see…";
- render-time motion blur (`"motionBlur": true`), bloom on the brightest points;
- facts with sources (`facts.md`).

Rebuild it:

```bash
node <skill>/scripts/motion.mjs final examples/universe-in-40-seconds
```

(`sync` restores the generated files: kit copy, three.js, GSAP, fonts and 3D fonts; `sound`
regenerates the voice, music and effects.)
