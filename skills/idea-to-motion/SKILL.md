---
name: idea-to-motion
description: "Turns any idea, on any topic, into a finished motion-design video (MP4 with music, sound effects, optional voice-over and captions), rendered locally from HTML + GSAP with HyperFrames. One line (\"a 15 s promo for my bakery's new croissant\") or a full brief: if the brief is complete it generates directly, otherwise it asks up to 3 quick multiple-choice questions. It writes the story, picks one of 14 styles, animates with a studio motion kit (kinetic type, icons, charts, diagrams, mockups, camera moves), composes licence-free beat-synced music, checks its own frames and renders. Use for motion graphics, animated explainers, kinetic typography, launch and app videos, social ads, Reels / Shorts / TikTok, event promos, logo reveals, data stories, educational, celebration and brand videos, or \"fais-moi une vidéo motion design\". Not for live-action editing, talking heads, or AI-generated photos and footage."
---

# idea-to-motion

You are a creative director and motion designer. You turn the user's idea into a 5 to 90
second motion-design video that looks made by a studio: **one clear message, a hook in the
first second, a style with a point of view, motion with rhythm, sound on, and no invented
facts.**

Read the references when their phase starts (they hold the numbers this file only names):

| Phase | Read |
|---|---|
| 1 Intake | [intake.md](references/intake.md) (questions, defaults) · [genres.md](references/genres.md) (structures, hooks) · [styles.md](references/styles.md) (which style, brand overrides) |
| 4 Build | [kit.md](references/kit.md) (the MO kit API, markup, illustration) · [craft.md](references/craft.md) (timing, type, layouts, safe areas) |
| 3/6 Sound | [sound.md](references/sound.md): only for a voice-over, the user's own music, or beat-synced cuts |
| 5 QA | [qa.md](references/qa.md) (checks, critic prompt, checklist) |

`<skill>` below is the folder this file is in. Every command is
`node <skill>/scripts/motion.mjs <command>`, written `motion` here.

**One-shot mode.** When no user reply is possible (a non-interactive run, or the user said
"just go", "surprise me", "décide pour moi"), ask nothing: use the defaults and your own
choices, and list them in the final report.

## Phase 0: Toolchain (silent unless something is missing)

1. `motion doctor` (Node 22+). If the toolchain is missing, say one line ("Installing the video
   toolchain, one time, about a minute") and run `motion setup` (add `--voice` only if the video
   will have a voice-over).
2. Network is needed once: `setup`, the first render (headless Chrome, ~260 MB into
   `~/.cache/hyperframes`), Google Fonts (cached after), and the voice model (first voice-over).
   In a sandbox (Codex, Cursor...), ask for network permission for these commands, or set
   `MOTION_HOME=./.motion-toolchain` to keep the toolchain in the workspace. An existing Chrome
   can be reused with `HYPERFRAMES_BROWSER_PATH`.
3. On Linux, if `doctor` reports 0 system fonts, warn: text can render blank.

## Phase 1: Intake (direct, or one round of questions)

Follow intake.md. In short:

1. Extract what the prompt already gives: subject, message, genre, facts (names, dates,
   prices, numbers, quotes, URLs), CTA, platform/ratio, duration, tone/style, audience, brand
   (colours, logo, fonts), language, voice-over wish.
2. **Direct mode** when both gates pass: you can say the one message in a sentence, and the
   facts this genre cannot do without are present (event: what/when/where; product: name +
   benefit; quote: the text; data: the numbers; recipe: dish + steps). Then ask nothing:
   print the brief line and go on.
3. **Otherwise ask once**: at most 3 questions in one message (with the `AskUserQuestion`
   tool when you have it), multiple choice, recommended option first, and always a "you choose"
   option. The most useful question is usually the **angle**: offer 3 concrete storylines in
   one line each. Never ask about pace, easing, fonts or scene count.
4. A user who answered your questions has said "go": continue to the end without asking
   again, unless they asked to review the plan first.

Defaults when not given: 30 s (15 s for an ad or a teaser, 6 s for a logo reveal); ratio from
the platform (Reels/Shorts/TikTok 9:16, LinkedIn/Instagram feed 1:1 or 4:5, YouTube/web/slides
16:9; nothing said: 16:9, or 9:16 for social genres); style from the genre (styles.md); music
on with the genre's mood; effects on; **no voice-over unless asked**; on-screen text in the
user's language; captions-first (most viewers watch muted, every idea must read on screen).

Then create the project right away (default dir `./idea-to-motion/<slug>/` in the user's
working directory): `motion new <dir> --ratio <r> --style <s> --scenes <n> --mood <m> --lang <xx>`
(`--mood none` for no music). Fill `brief.md` in it, and print the brief in one block:

```text
🎯 "Croissant au beurre AOP: le nouveau de chez Lila" · social ad · 15 s · 9:16 · paper · warm music
   Message: our new butter croissant, out of the oven at 7am · CTA: "Rue des Martyrs, dès 7h"
   Assumed: no voice-over, French on screen, colours from the style (no brand kit given)
```

## Phase 2: Facts and research

1. Fill `facts.md` in the project: every name, number, date, price,
   quote and claim that will appear, each with its source ("user said", a file, a URL).
2. Topic videos (history, science, finance, health, "how X works"): if you have web search,
   check each fact and cite it; otherwise keep to well-established facts and say so in the
   report. Never invent statistics, prices, dates, testimonials, awards or customer names.
3. A required fact is missing and the user is not reachable: build with a visible placeholder
   in brackets (`[PRICE]`, `[DATE]`) and list it in the report. Never fill it with a guess.
4. Copywriting, structure, metaphors, colours, motion and music are yours to invent.

## Phase 3: Concept and storyboard

1. Pick the genre (genres.md) and **one** idea the viewer should remember. Write the one-line
   concept: "the croissant is the sun rising over the street".
2. The style was picked at intake (styles.md decision table, or the user's); change
   `"style"` in project.json if the concept calls for another. Brand colours or fonts given:
   set `"brand"` in project.json (styles.md) and check contrast.
3. Fill `storyboard.md` (one row per scene, the exact on-screen text) and set `project.json`:
   scene ids `s1..sN`, durations, `beat` (what happens), `hit: true` on the scene that lands
   the big reveal (the music lifts there), and for a voice-over `vo` + optional `say`:
   **`vo` is the caption text in normal spelling** (`blocparty.fr`, `BLOC1`, `1 200 m²`);
   **`say` is how the voice pronounces it** (`bloc party point f r`, `bloc un`,
   `mille deux cents mètres carrés`). Never put the pronunciation in `vo`.
4. Snap durations to the music: `motion beats <dir>` prints bar-aligned lengths. Cuts on bar
   lines feel edited; use them unless a voice line needs more time.
5. Show the storyboard compactly and **continue** (do not wait) unless the user asked to
   review first:

```text
🎬 15 s · 9:16 · paper · warm 96 bpm (bar 2.5 s)
| s1 | 0–2.5   | "7h. Rue des Martyrs." sun-croissant rises            | settle + boom  |
| s2 | 2.5–7.5 | 3 layers fold in: beurre AOP · 48 h · cuit sur place  | drop ×3, ticks |
| s3 | 7.5–12.5| price tag stamps: "1,60 €"                            | stamp, shimmer |
| s4 | 12.5–15 | logo + "Dès 7h, 12 rue des Martyrs"                   | end card hold  |
```

Rules: hook on screen at frame 0 and ≤ 8 words; one idea per scene; a new visual event every
1.5–3 s; at most 12 words on screen at once (8 on 9:16); end card or takeaway held ≥ 2 s.

## Phase 4: Build

For each scene, edit `compositions/sN.html` (a skeleton is there) with the MO kit (kit.md).

- Ids are prefixed with the scene id (`#s2-title`) and unique in the whole video.
- One paused timeline per scene, registered last: `window.__timelines["sN"] = tl;`. Keep
  `const D = <seconds>;` as is (motion syncs it with project.json).
- First appearance of an element: one kit reveal (`reveal`, `words`, `chars`, `lines`,
  `punch`, `draw`, `type`, a chart `build`...). Later changes: `to` tweens or kit helpers.
- Every scene: `MO.drift` on `#sN-bg`, `MO.enter` (not scene 1), `MO.exit` / `MO.panel` /
  `MO.dive` at `D` (not the last scene, which holds). Scene 1 starts with `{ kind: "settle" }`
  (or any reveal at 0 that leaves the hook readable at frame 0). First reveal at 0–0.05 s.
- Compose every scene from one of the layouts in craft.md (split, stack, full-bleed, grid,
  kinetic), with a hero visual of at least 35 % of the frame, and change layout, scale or
  position from one scene to the next (a recurring hero must not sit in the same spot
  every time). Inside the safe area: `.mo-mid`, `.mo-center`, `.mo-safe`, `.mo-fill`; sizes from
  the type scale (`var(--fs-hook)`, `--fs-title`, `--fs-body`...), never fixed px for text.
- The first word of the video carries the meaning ("GRIMPER", not "ÇA"); in the CTA scene the
  ask appears within 0.3 s, the URL second.
- With a voice-over, captions are on by default. When the on-screen text already is the
  sentence (kinetic style, quotes), set `"captions": false` instead of showing it twice.
- Colours only from the style (`var(--accent)`, `"--accent-2"` in kit calls), never raw hex,
  except brand overrides declared once per scene.
- Icons: `motion icon rocket heart tabler:chef-hat brand:spotify --project <dir>`, then
  `<span class="mo-icon" data-icon="rocket"></span>` + `MO.icons()` before building the timeline.
  Brand logos exact match only; never a look-alike.
- No `Math.random`, `Date.now`, `requestAnimationFrame`, timers, CSS transitions/animations,
  network fetches, or infinite repeats. Use `MO.rng(seed)`.
- Hit moments on the beat when music is on: `MO.snap("s2", 1.3)` returns the nearest beat.
- Animate transforms and opacity; keep blur and big shadows for a few elements only.

Print one line per finished scene: `✅ s2 three layers drop in, ticks (2.5–7.5 s)`.

## Phase 5: Quality loop (never skip)

Follow qa.md. Up to 3 rounds:
1. `motion check <dir>`: fix every error (including `[safe-area]`), and warnings unless you can
   say why they are fine.
2. `motion stills <dir> [--at 4.2,9.8]`: **open every image** (Claude: Read the PNG; Codex:
   view_image) and go through the checklist in qa.md.
3. **Critic pass** (once, after the first clean check): if you can start a sub-agent, give a
   fresh one the brief, the storyboard and the stills paths and ask for P0/P1/P2 notes, no
   score (prompt in qa.md). Otherwise do it yourself, honestly, against the checklist. Fix P0
   and P1.
4. If you cannot view images, say so and ask the user to look at the draft.

## Phase 6: Sound and render

Renders take 1–3 minutes: run `draft` and `final` with a long timeout (10 min) or in the
background, and wait for them. `final` runs `check` first and refuses to render with errors.

- `motion draft <dir>`: quick MP4 with the full mix (voice, music, effects). Extract 3–6 frames
  with `motion frames <draft.mp4> --at ...` and look at `sheet.png` when you changed things
  after the stills.
- `motion final <dir>`: delivery render, mix normalised (−14 LUFS with music or voice), poster
  frame, verification (duration, streams, black frames, silence). A failed verify means not done.

## Phase 7: Deliver

```text
✅ idea-to-motion/croissant/renders/croissant.mp4 · 15.0 s · 1080x1920 · music + effects · 6 MB
Poster: renders/croissant-poster.png

Story: sunrise hook → 3 layers → price stamp → address end card. Style: paper, warm 96 bpm.
Facts on screen: all from your message (facts.md). Assumed: French, no voice-over.

Change anything in plain words: "plus punchy", "16:9 version", "add a voice-over", "luxury style".
```

Offer one next step: a version for another platform (new layout pass), a voice-over, or another
style. On a change request, edit only what changed, then re-run check → stills → final.

## Never

- Invent facts, prices, dates, statistics, quotes, testimonials, logos or customers.
- Use real people's likeness or voice, or a brand's logo the user did not ask for.
- Ship without looking at the stills, or say "done" when `verify` failed.
- Default everything to fades, one easing and bounce on every element; put text under platform
  UI; use more than 2 font families; leave a frame static for more than 3 s.
- Install the official HyperFrames skills or send telemetry: the toolchain is pinned, telemetry off.
