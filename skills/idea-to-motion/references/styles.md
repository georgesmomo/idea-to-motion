# Styles

A style is a whole design system in one attribute (`project.json` → `"style"`): palette,
fonts (Google Fonts, OFL, embedded in the render), shape language, texture, and **motion
character**. The kit reads `--mo-speed`, `--mo-ease-in`, `--mo-overshoot`, `--mo-stagger`,
`--mo-step` ("on twos" frame stepping), `--mo-reveal` (default reveal) and `--mo-enter`
(default transition) from it, so the same scene code moves like the style. Change the style
and the video re-skins; still re-check the stills (font widths differ).

## Which style for which brief

| Brief | First choice | Alternatives |
|---|---|---|
| SaaS, app, startup, corporate explainer | `flat` | `iso`, `glass` |
| Tech, AI, dev tools, data, cyber | `darktech` | `blueprint`, `synthwave` |
| Systems, architecture, engineering, how-it-works | `blueprint` | `darktech`, `iso` |
| Bold social ad, quote, announcement, sport, music | `kinetic` | `brutalist`, `synthwave` |
| Journalism, data story, history, culture, books | `editorial` | `swiss`, `luxury` |
| Design, architecture, museum, event poster, typography | `swiss` | `editorial`, `brutalist` |
| Startup with attitude, creators, Gen Z, listicle | `brutalist` | `kinetic`, `pastel` |
| Gaming, nightlife, music event, retro | `synthwave` | `kinetic`, `darktech` |
| Real estate, infrastructure, product layers, "stack" metaphors | `iso` | `flat`, `blueprint` |
| Food, kids, crafts, local business, NGO, sustainability | `paper` | `doodle`, `pastel` |
| Education, tutorial, personal story, whiteboard explainer | `doodle` | `paper`, `flat` |
| Fashion, jewellery, hotel, premium brand, logo reveal | `luxury` | `editorial`, `swiss` |
| Wellness, fintech app, beauty, lifestyle | `glass` | `pastel`, `flat` |
| Birthday, baby, kids, cute, friendly brand | `pastel` | `doodle`, `paper` |

Genre default mood (music): launch `energetic` · app/explainer `upbeat` · social ad
`energetic` · event `energetic` · educational `chill` · quote `epic` or `tense` · data
`tense` or `chill` · logo `epic` · listicle `upbeat` · celebration `playful` · recipe `warm` ·
real estate `elegant` · NGO `warm` (swelling) · personal brand `chill` · luxury anything
`elegant`.

## The 14 styles

| Style | Palette (bg / text / accent / accent-2) | Fonts (display + body) | Motion character | Texture |
|---|---|---|---|---|
| `flat` | #F1FAEE / #0B2545 / #0B5FFF / #FFB703 | Plus Jakarta Sans + Inter | back.out(1.4), card reveals, push | soft circles |
| `darktech` | #0B0F14 / #E6EDF3 / #00E5A0 / #7C5CFF | Space Grotesk + JetBrains Mono | expo.out, fast (0.9×), whip | grid, glow, vignette |
| `blueprint` | #0B1B2E / #E6EDF7 / #4FC3F7 / #FFB547 | Inter 900 + IBM Plex Mono | power3.out, whip | blueprint grid, vignette |
| `kinetic` | #0A0A0A / #FFFFFF / #F5FF3D / #FF2E63 | Anton (uppercase) + Inter | power4.out, very fast (0.7×), slam, hard cuts | grain |
| `editorial` | #F6F1E7 / #1B1B1B / #B3392F / #1F4E79 | DM Serif Display + DM Sans | power2.inOut, slow (1.35×), mask reveals, fades | paper grain |
| `swiss` | #F4F1EA / #111111 / #E63312 / #111111 | Archivo 900 + IBM Plex Mono | expo.out, no overshoot, slide from left, push | grid rules, grain |
| `brutalist` | #FFF4D6 / #000000 / #FF5C8A / #4D6BFE | Space Grotesk + Space Mono | back.out(2), pop, hard cuts | thick borders, offset shadows, dot grid |
| `synthwave` | #0D0221 / #FDF1FF / #FF2A6D / #05D9E8 | Audiowide (uppercase) + Rajdhani | sine, slow (1.2×), blur reveals, zoom | perspective grid floor, neon glow |
| `iso` | #EAF0FF / #2B2D42 / #3B5BDB / #FF8FAB | Outfit + DM Sans | power3.out, drop from above | iso dot grid, extruded shadows |
| `paper` | #F2E8CF / #264653 / #BC4749 / #386641 | Fredoka + Nunito | back.out(1.5), drop, **on twos** (12 fps steps) | heavy grain, layered shadows |
| `doodle` | #FFFDF5 / #222222 / #FF6B6B / #4D96FF | Patrick Hand + Nunito | back.out(1.6), pop, **on twos** | notebook lines, wobbly borders |
| `luxury` | #0E0D0B / #EDE6D6 / #C9A96E / #EDE6D6 | Cormorant Garamond + Montserrat | power2.inOut, very slow (1.6×), blur, fades, half drift | vignette, light grain |
| `glass` | lilac→pink gradient / #1D1D2B / #6C47FF / #FF5FA2 | Sora + Manrope | power3.out, blur reveals, zoom | blurred colour fields, frosted cards |
| `pastel` | #FFF1F5 / #3D2C4E / #FF7AA8 / #7BC6FF | Baloo 2 + Nunito | back.out(1.8), pop, push | soft circles |

Every style also defines `--accent-3`, `--ok`, `--err`, `--panel`, `--line`, `--muted`,
`--on-accent` (text on accent fills), `--radius`, `--border-w`, `--shadow`.

## Do and don't per style

- **flat / pastel / iso:** big rounded cards, icons in tiles, one accent per scene. Don't put
  long text on the coloured circles.
- **darktech / blueprint:** keep glow for the hero element; grid always drifting. Mono for
  numbers, labels and code only.
- **kinetic:** one to three words per frame, huge (`.mo-mega`, `--fs-hook`), cut on the beat
  (`MO.punch`), accent colour for the punch word only. Don't use cards or icons tiles; type is
  the visual.
- **editorial:** serif headlines, generous margins, `MO.lines` mask reveals, hairline rules
  (`.mo-rule` + `grow`), numbers as display figures. Slow is the point: never `slam` or `pop`.
- **swiss:** asymmetric layout on a grid (left-aligned, not centred), huge numerals, red only
  for the key element. Left slides, no overshoot.
- **brutalist:** black borders and hard shadows come from the style; tilt cards ±2°; mono
  labels; pops are welcome.
- **synthwave:** neon glow on titles is automatic; keep text short and uppercase; slow drifts.
- **paper / doodle:** motion steps at 12 fps automatically (hand-made feel); use `draw` for
  icons and people (Open Peeps), `scribble` for emphasis. Don't use blur or glow.
- **luxury:** few words, a lot of space, letter-spaced kicker, `shine` on the name, long holds,
  fades and blur; music `elegant`. Never `pop`, `slam`, confetti or bright colours.
- **glass:** frosted cards (`.mo-card`, automatic backdrop blur) over the colour fields; soft
  zooms. Keep contrast: text on cards, not on the raw gradient.

## Brand colours and fonts

Keep the style (its layout, motion and texture) and override the palette and fonts in
`project.json`; `motion sync` writes the overrides after the style and embeds the fonts:

```json
"brand": { "accent": "#E4002B", "accent2": "#111111", "onAccent": "#FFFFFF",
           "bg": null, "text": null, "displayFont": "Montserrat", "bodyFont": null }
```

- Any key may be null or omitted (the style's value stays).
- Fonts must be Google Fonts families (downloaded and embedded like the style's). A font that
  is not on Google Fonts: ask for the .woff2/.ttf, put it in `assets/fonts/`, and set
  `"fontFiles": { "Brand Sans": "assets/fonts/brand-sans.woff2" }` plus `"displayFont": "Brand Sans"`.
- Check contrast after overriding (`motion check` reports it). Text on `--accent` fills uses
  `--on-accent`: set it when the brand accent is light.
- A logo file (SVG preferred): copy it to `assets/` and use `<img src="assets/logo.svg">`, or
  inline the SVG to `MO.draw` its strokes.
