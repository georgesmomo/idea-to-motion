# The MO motion kit

`assets/mo/motion.js` (global `MO`) and `motion.css`, copied and kept current by `motion sync`.
GSAP 3.15 is loaded with DrawSVG, MorphSVG, MotionPath, CustomEase and SplitText (free
"no charge" licence, installed at setup, not redistributed).

Every helper adds tweens to the scene's paused timeline at a **scene-local** time and returns
the time its motion ends, so beats chain: `let t = MO.reveal(tl, "#s2-a", 0.05); t = MO.words(tl, "#s2-b", t + 0.1);`
Helpers log the sounds their motion implies (`motion sound` synthesises them). Pass
`{ sfx: false }` to mute one, `{ sfx: "boom" }` to swap it. Durations scale with the style's
`--mo-speed`; eases and overshoot follow the style.

## Scene skeleton (what `motion new/sync` writes)

```html
<template>
  <div id="root" data-composition-id="s2" data-width="1920" data-height="1080">
    <div class="mo-scene" id="s2-scene">
      <div class="mo-bg" id="s2-bg"></div>              <!-- style background, drifts -->
      <div class="mo-stage" id="s2-stage">              <!-- enters / exits -->
        <div class="mo-camera" id="s2-cam">             <!-- zoom / dive / push target -->
          <div class="mo-mid"> ... your content ... </div>
        </div>
      </div>
      <div class="mo-grain"></div>                      <!-- style grain, if any -->
    </div>
  </div>
  <script>
    (function () {
      const D = 5;  // synced with project.json
      const tl = gsap.timeline({ paused: true });
      MO.icons();                        // fill [data-icon] elements (if you use icons)
      MO.drift(tl, "#s2-bg", 0, D);
      MO.enter(tl, "#s2-stage", 0);      // not in s1
      let t = MO.reveal(tl, "#s2-title", 0.05);
      // ...
      MO.exit(tl, "#s2-stage", D);       // not in the last scene
      window.__timelines["s2"] = tl;
    })();
  </script>
</template>
```

## Layout classes (all inside the platform safe area)

| Class | Use |
|---|---|
| `.mo-mid` | full safe box, flex column, centred (the default container) |
| `.mo-center` | absolute, left/right = safe insets, text centred; set `top` yourself |
| `.mo-safe` | absolute, left/right = safe insets, left-aligned (swiss, editorial) |
| `.mo-fill` | absolute, the whole safe box (charts, diagrams, timelines) |
| `.mo-row` / `.mo-col` | flex row / column with gaps |

Text on an accent fill: `.mo-on-accent` (or `.mo-fill-accent` for a filled word). Type: `.mo-mega` (1–2 words, huge), `.mo-hook`, `.mo-title`, `.mo-quote`, `.mo-kicker`
(small caps label in the accent), `.mo-body`, `.mo-small`, `.mo-stat` (numbers). Colours:
`.mo-accent`, `.mo-accent-2`, `.mo-accent-3`, `.mo-muted`, `.mo-ok`, `.mo-err`. Sizes follow
the ratio (`--fs-*`): use `font-size: var(--fs-title)` in your own styles, not px.

Blocks: `.mo-card`, `.mo-chip`, `.mo-badge`, `.mo-btn` (CTA), `.mo-url`, `.mo-icon` (1em,
inherits colour), `.mo-icon-tile` (icon in a card), `.mo-num` (numbered circle), `.mo-rule`
(accent line, use `kind: "grow"`), `.mo-flash`, `.mo-caption` (voice-over captions),
`.mo-phone > .mo-screen`, `.mo-browser > .mo-bar` (+ `<i></i><i></i><i></i><span>url</span>`),
`.mo-term > .mo-term-bar + .mo-term-body > .mo-tline`, `.mo-swap`, `.mo-mark`,
`.mo-line-mask > span`.

## Text

| Call | What |
|---|---|
| `MO.reveal(tl, target, at, { kind, dur, stagger, ease, from })` | first appearance. kinds: `rise drop left right card pop settle slam stamp blur fade mask wipe flip spin grow line`. Default kind: the style's. Several targets stagger by the style's stagger. |
| `MO.hide(tl, target, at, { kind })` | exit: `fade drop up left shrink blur` |
| `MO.words(tl, target, at, { kind, stagger })` | word by word (child elements count as one word) |
| `MO.chars(tl, target, at, { kind })` | letter by letter (names, logos, short titles) |
| `MO.lines(tl, target, at)` | masked line reveal; markup: each line as `<span class="mo-line-mask"><span>…</span></span>` |
| `MO.punch(tl, box, at, { beat, kind, hideLast })` | children shown one at a time in the same spot, one per beat (kinetic type). Default beat: the music's. At 0, the first word settles in already readable (frame 0). |
| `MO.scramble(tl, target, "TEXT", at, { dur })` | decoding effect that resolves to the text |
| `MO.mark(tl, ".mo-mark", at, { color })` | marker highlight drawn behind a word; text flips to `--on-accent` |
| `MO.scribble(tl, target, at, { kind, color })` | hand-drawn `underline circle strike box` around an element |
| `MO.type(tl, target, "text", at, { cps })` | typing with caret (search bars, chat, terminals) |
| `MO.stream(tl, ".lines", at)` | output lines one after another |
| `MO.count(tl, target, from, to, at, { decimals, prefix, suffix, sep, point })` | animated number (`sep: " "`, `point: ","` for French) |
| `MO.swap(tl, a, b, at)` | replace a value in place (`.mo-swap` wrapper) |
| `MO.captions(tl, "#sN-cap", MO_VO.sN)` | karaoke captions for the scene's voice-over line (see sound.md) |
| `MO.atWord("sN", "word", { fallback: 1.2, end })` | scene-local time the voice says a word (sync reveals to the voice). Always pass a `fallback` (used when there is no voice or the word is not found) |

## Emphasis and life

`MO.shapes(tl, "#sN-bg", at, D, { n: 8, kinds, colors, size, area })` (seeded decorative
shapes that pop in and float: fill the background and the zones outside the safe area, e.g.
the top and bottom of a 9:16, where text may not go) · `MO.pulse(tl, t, at)` · `MO.breathe(tl, t, at, dur)` (1 → 1.03 while the viewer reads) ·
`MO.float(tl, targets, at, dur, { amp, rot, seed })` (seeded idle float for shapes, icons,
balloons) · `MO.focus(tl, keep, all, at, { dim: 0.25 })` (dim everything but `keep`) / `MO.unfocus(tl, all, at)` · `MO.highlight(tl, t, at, "--accent")`
· `MO.shine(tl, t, at)` (light sweep: logos, buttons, luxury) · `MO.burst(tl, t, at)` (radial
lines, once per video) · `MO.flash(tl, ".mo-flash", at)` · `MO.glitch` / `MO.fail` / `MO.ok`
(state changes on `--state`, e.g. diagram nodes, cards with `border-color: var(--state)`).

## Icons, people, SVG

Fetch once per project (the CLI prints the key to use):

```bash
motion icon rocket heart --project .            # Lucide (default), line icons, drawable
motion icon tabler:chef-hat ph:coffee-fill --project .   # Tabler, Phosphor (-fill, -duotone)
motion icon emoji:croissant flag:fr --project .  # Noto colour emoji, circle flags
motion icon brand:spotify --project .            # brand logos (exact match only)
motion icon person:lila person:sam --mood happy --project .   # Open Peeps characters (CC0)
```

Markup: `<span class="mo-icon" data-icon="rocket"></span>` then `MO.icons()` at the top of the
script; size with `font-size` (an icon is 1em) or width/height. Colour: `color: var(--accent)`
(line icons use `currentColor`; emoji, flags, brands and people keep their colours).

| Call | What |
|---|---|
| `MO.draw(tl, target, at, { dur, stagger })` | draws the strokes of any SVG inside target (line icons, people, logos, maps, arrows), fills fade in after |
| `MO.morph(tl, "#pathA", "#pathB", at)` | morph one SVG path into another (shape → icon, circle → logo) |
| `MO.along(tl, target, "#path", at, { rotate })` | move an element's centre along an SVG path (plane on a route, pin on a map). Put the path in an `<svg class="mo-svg-layer" width="1920" height="1080" viewBox="0 0 1920 1080">` at the top-left of the same container as the element |

Lottie (user-supplied JSON only): put files in `assets/lottie/`, `motion sync` adds the
player; in the scene: `const a = lottie.loadAnimation({ container: q, renderer: "svg", autoplay: false, loop: false, path: "assets/lottie/x.json" }); (window.__hfLottie = window.__hfLottie || []).push(a);`
The renderer seeks it with the composition time.

## Illustration: what to use

- **Noto emoji are the illustration library** (3,000+ colour drawings in one consistent style:
  animals, food, objects, places, people, weather, science). `emoji:octopus`,
  `emoji:honey-pot`, `emoji:rocket`. Big (200–500 px) they read as illustrations, not as chat
  emoji. Search names with a wrong guess: the CLI suggests close matches.
- **Line icons** (Lucide, Tabler, Phosphor) for UI-like, diagram and flat styles; they can be
  drawn stroke by stroke with `MO.draw`.
- **Open Peeps** (`person:<seed>`) for people in doodle, paper, flat, pastel styles.
- Do not mix families in one frame (emoji next to line icons next to a hand-drawn shape looks
  random). One family per video, two at most (people + one icon family).
- Hand-built SVG: only simple geometric shapes (a sun, a road, a phone, a chart). Complex
  figures (animals, faces) drawn by hand look amateur: use emoji or Open Peeps instead.
- Give the hero visual at least 35–40 % of the frame. Empty halves read as unfinished; fill the
  background with the style texture, `MO.shapes`, or a big faded icon behind the content.

## Charts and data

```js
const c = MO.bars("#s3-chart", [{ label: "2019", value: 12 }, { label: "2023", value: 58, hi: true }],
                  { w: 1100, h: 520, format: { suffix: "%" } });
let t = c.build(tl, 0.3);                          // axis, bars grow, values count up
const l = MO.lineChart("#s4-chart", [{ label: "Jan", value: 3 }, ...], { w: 1200, h: 500 });
t = l.build(tl, 0.2);                              // line draws, area fades, dots pop
MO.ring(tl, "#s5-ring", 0.72, 0.3, { size: 420, label: "#s5-pct" });   // donut to 72 %, label counts
const tm = MO.timeline("#s6-fill", [{ year: "1969", text: "Moon landing" }, ...]);
t = tm.build(tl, 0.2, { per: 0.8 });               // track fills, stops pop in order
```

Charts are placed centred in their container (`.mo-fill` works well) unless you pass `x`, `y`.

## Particles

`MO.confetti(tl, "#sN-scene", at, { x, y, n: 70, colors: ["--accent", ...], power, gravity, life })`:
seeded physics computed at build time, deterministic on every frame.

## Diagrams (systems, processes, flows)

```js
const d = MO.diagram("#s2-cam", {
  nodes: [{ id: "farm", label: "Farm", sub: "milk", icon: "tabler-cow", x: 400, y: 540 },
          { id: "shop", label: "Shop", icon: "emoji-shopping-cart", x: 1500, y: 540 }],
  edges: [{ from: "farm", to: "shop", label: "48 h" }],
}, { prefix: "s2" });
let t = d.build(tl, 0.2);                 // nodes then edges, in order
t = d.flow(tl, ["farm", "shop"], t + 0.2); // a packet travels, target pulses
d.cascade(tl, ["farm", "shop"], t, "--ok"); d.tint(tl, "farm", "shop", t, "--err", { dim: true });
```

## Transitions and camera

| Call | What |
|---|---|
| `MO.enter(tl, stage, 0, kind)` | scene entrance; kinds `push whip up zoom fade rise iris wipe cut`; default: the style's |
| `MO.exit(tl, stage, D, kind)` | exit ending exactly at D; pair with the next scene's enter |
| `MO.panel(tl, "#sN-scene", D, { color, half: "in" })` + `MO.panel(tl, "#sN+1-scene", 0, { half: "out" })` | a colour panel wipes over the cut (bold, editorial) |
| `MO.zoom(tl, cam, target, at, { scale })` / `MO.home(tl, cam, at)` | centre the camera on an element / back |
| `MO.dive(tl, cam, target, D)` | zoom through an element into the next scene (next scene: `enter "zoom"`) |
| `MO.push(tl, cam, 0, D, { scale: 1.06 })` | slow push-in across a scene (depth, no frozen frame) |
| `MO.parallax(tl, [[el, 1], [el2, 0.4]], 0, D, { dx: -80 })` | layers moving at different depths |

Use one transition family per video (plus dive/zoom). Hard cuts are fine and often better
on the beat.

## Beat sync

With generated music, `MO.beat()` is the beat length and `MO.snap("s3", 1.3)` the nearest
beat to scene-local 1.3 s. Put hits (stamps, slams, punch words, the CTA) on beats.

## Timing rules the kit does not enforce

- First reveal of a scene at 0–0.05 s (the stage enters already filled).
- Reading hold ≥ 0.5 s + 0.3 s per word after a text finishes appearing.
- One hero move at a time; secondary motion smaller and slower.
- `reveal` uses `fromTo`: call it once per element. Later changes: `tl.to(...)` or helpers.

## HyperFrames rules (the renderer)

- No `Math.random`, `Date.now`, `requestAnimationFrame`, timers, CSS animations or
  transitions, network fetches, `repeat: -1`. `MO.rng(seed)` for variation.
- To keep an element hidden until a later moment, reveal it later with a kit reveal (its
  `fromTo` hides it from the start), or give it `style="opacity:0"` in the markup and animate
  it with `tl.to`. `tl.set(el, { opacity: 0 }, 0)` is rejected by the linter.
- Animate transforms, opacity, colours, clip-path, stroke: never `left`, `top`, `width`,
  `height` (they snap to pixels and stutter).
- `.mo-card` is `position: relative` (it flows in `.mo-row` / `.mo-col`); add
  `position:absolute; left:…; top:…` yourself for a free-placed card.
- Scene ids are prefixed (`#s3-...`) and unique in the whole video.
- `window.__timelines["sN"]` registered last, paused.
- Images and videos: local files in `assets/`, referenced relatively.
