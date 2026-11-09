# Quality loop

Agents cannot watch a video, but they can look at frames. This loop is what separates a
studio result from a generated one. Up to 3 rounds before the final render.

## 1. `motion check <dir>`

HyperFrames lint plus runtime, layout, contrast and craft checks, then the kit's own
**safe-area check** (every visible text measured at several moments of each scene, with the
real fonts, against the platform safe zone). Findings caused by the kit's own layers on purpose
are hidden; the full JSON is in `.motion-check.json`.

| Finding | Usual fix |
|---|---|
| `[safe-area] … outside the safe area` | move or shrink into the safe box; use `.mo-mid` / `.mo-center` / `.mo-fill` |
| `content_overlap`, `text_occluded` | give each text its own zone; move captions or charts apart |
| `text_below_floor` | raise to the `--fs-*` variables (never under 28 px at 1080) |
| `line_unread` | hold longer (0.5 s + 0.3 s per word) or cut words. On voice-over captions it is acceptable: they follow the voice |
| `dead_stretch` (> 3 s static) | add a beat, `breathe`, `float`, `push`, or shorten the scene |
| `first_frame_empty` | s1 hook with `{ kind: "settle" }` (or any reveal at 0 leaving it readable) |
| `contrast_aa_failure` | text in `--text` on `--bg`, or `--on-accent` on accent fills; brand colours: fix the pair |
| `missing_timeline_registry` | `window.__timelines["sN"] = tl;` with the exact id |
| `non_deterministic_code` | remove `Math.random` / `Date.now`; `MO.rng(seed)` |
| `font_family_without_font_face` | a font outside the style: add it to `brand.displayFont` (embedded) |
| `film_silent` before sound | normal: sound is added at draft/final |
| `[process] brief.md / storyboard.md / facts.md …` | fill them: the critic and the user read them; the storyboard has one row per scene |
| `[process] sN: vo … looks like a pronunciation` | captions in normal spelling in `vo`, the pronunciation in `say` |
| contrast warning on a line with a `.mo-mark` word | the checker samples the whole line on the marker colour: confirm in the stills |

Zero errors required. Warnings: fix, or say in one line why it is intended.

## 2. `motion stills <dir> [--at 1.2,4.5]`

Frame 0, one still per scene at 65 % and the last frame, plus the `--at` key moments you add.
Always keep the per-scene stills: they show each scene at rest. More than 9 frames are split
over `contact-sheet-1.jpg`, `-2.jpg`... Mid-animation frames look unfinished: judge layout on
the 65 % stills, motion on the sequence. With a voice-over, the voice is generated first, so captions appear. Open the contact sheet,
then single frames. The dashed magenta box is the platform safe area (stills only). Check:

1. **Hook:** readable at frame 0, ≤ 8 words, the biggest thing on screen. Would it stop a
   thumb in a feed?
2. **One focus per frame:** the eye knows where to go in under a second.
3. **Legibility:** nothing under the size floor, clipped, overflowing, overlapping, or under
   platform UI (9:16). Test the phone view: would it read at 360 px wide?
4. **Hierarchy:** one title, ≤ 12 words on screen (8 on 9:16), a clear size ratio (≥ 1.6×).
5. **Style:** it looks like the chosen style, not like a default template; only style colours;
   accent used for one thing per scene; grain/texture present when the style has it.
6. **Composition:** aligned to the safe box, consistent margins, not everything centred when
   the style is swiss or editorial, no empty half-frame unless intended.
7. **Facts:** every word, number, date and price on screen appears in facts.md; placeholders
   visible and listed.
8. **Ending:** CTA or takeaway held ≥ 2 s, clean end card.

## 3. Critic pass (once, after the first clean check)

A fresh pair of eyes catches what the builder no longer sees. If you can start a sub-agent,
give it this prompt (fill the brackets) and the image paths; it must not see your code:

```text
You are a senior motion designer reviewing a storyboard's still frames before render.
Brief: [brief.md content]. Storyboard: [storyboard.md content].
Frames (open each): [paths of contact sheet + single stills].
Platform: [ratio, where it plays]. Style intended: [style].
Give notes only, no score, no praise, max 12 lines:
P0 = would embarrass us if shipped (unreadable, wrong fact, broken layout, empty frame, text in the UI zone).
P1 = clearly weaker than a studio would deliver (weak hook, cluttered frame, no focal point, monotone motion implied by identical frames, off-style).
P2 = polish.
For each: frame (time), what is wrong, the concrete fix.
```

No sub-agent available: do the same yourself, honestly, against the checklist. Fix all P0 and
P1, then re-run check and stills. Do not argue with the critic in the report; fix or say why
not in one line.

## 4. Draft

`motion draft <dir>` renders fast with the full mix and prints duration, streams, loudness,
black segments. After changes made after the stills, extract frames from the MP4:
`motion frames <dir>/renders/draft.mp4 --at 0.5,4.2,9.8` (writes `frames/sheet.png`) and
compare with the stills (same fonts, same layout).

## Stop conditions

- 3 rounds done and only taste issues remain: render and mention them.
- A problem you cannot fix (offline fonts, broken Chrome): stop and tell the user what to run.
- Never report "done" while `verify` shows ✗.
