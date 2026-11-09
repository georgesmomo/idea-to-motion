# Sound: effects, music, voice

`motion sound <dir>` (run by `draft` and `final`) builds `assets/audio/mix.wav` from three
layers, all generated locally and licence-free:

1. **Voice-over** (optional): Kokoro v1.0, offline, through sherpa-onnx.
2. **Effects**: synthesised from the cues the kit logged while building the timelines.
3. **Music**: a procedural bed composed for the mood, length and beat grid.

Mix: music ducks about 10 dB under the voice, effects sit above the bed, then `final`
normalises to −14 LUFS (−16 LUFS when there are only effects), true peak −1.5 dBTP, two-pass.

## Effects

Types: `whoosh swish pop click tick typing riser swell impact boom glitch ding error shimmer
sparkle scribble paper`.

| Motion | Sound (automatic) |
|---|---|
| `enter` / `exit` / `panel` / `zoom` / `dive` | whoosh |
| reveal `slam`, `settle`, `stamp` | impact |
| reveal `pop`, `card`, `drop` | pop (quieter for cards and drops) |
| `mark`, `lineChart` | swish |
| `scribble`, `draw` | scribble |
| `type`, `scramble` | typing (synced to the characters) |
| `count` | soft ticks |
| `shine` | shimmer |
| `confetti` | pop + sparkle |
| `ring` | riser |
| `ok` / `fail` / `glitch` | ding / error / glitch |

Thinning keeps it musical: one whoosh per 0.5 s, small sounds not closer than 0.14 s, one
typing at a time. More than 2 sounds per second is flagged as busy.

Manual cues: `cues.json` → `[{ "t": 12.4, "sfx": "boom" }, { "t": 3.0, "sfx": "riser", "dur": 1.5 }]`
(absolute seconds, added to the automatic ones). `"sound": "manual"` in project.json uses only
`cues.json`; `"none"` removes effects (music and voice stay).

Use `boom` once per video at most (the big reveal or the logo hit), `riser` into a reveal,
`shimmer` for premium moments, `paper` for paper-style transitions (`{ sfx: "paper" }` on
`enter`).

## Music

`project.json` → `"music": { "mood": "upbeat", "volume": 0.8, "bpm": null, "seed": null }`.

| Mood | BPM | Character | Genres |
|---|---|---|---|
| `upbeat` | 116 | major pop, plucks, claps, four-on-the-floor | explainer, app, listicle, corporate |
| `energetic` | 126 | minor house, offbeat bass, arps, open hats | launch, social ad, event, sport |
| `chill` | 84 | lo-fi keys (7ths), swing, soft kit | educational, personal, calm explainer |
| `epic` | 92 | strings, brass, toms | quote, logo, big announcement, history |
| `playful` | 128 | marimba, bouncy bass | kids, celebration, food, fun brand |
| `tense` | 100 | dark pad, pulsing 16ths | data, problem statement, mystery, cyber |
| `elegant` | 88 | strings and keys, sparse | luxury, real estate, fashion |
| `warm` | 96 | keys, plucks, gentle groove | NGO, recipe, local business, family |

- Structure: one soft intro bar, the groove, a lift (drop-out and snare roll) into the scene
  marked `"hit": true`, and an ending that resolves on the tonic with a final hit that rings
  to the end of the video. Different `seed` → a different chord progression.
- Beat grid: `motion beats <dir>` prints bar-aligned scene lengths. Cut on bar lines; land
  stamps, slams and punch words on beats with `MO.snap`.
- Preview: `motion music <mood> --duration 20 --out preview.wav`.
- The user's own track: `"music": "assets/audio/track.mp3"` (it is trimmed, faded and ducked
  the same way). Only use music the user owns or has a licence for. No beat grid then.
- `"music": null` → no music.

## Voice-over

```json
"voice": { "voice": "ff_siwis", "speed": 1.0 },
"scenes": [{ "id": "s2", "duration": 5, "vo": "Chaque matin, Lila cuit ses croissants à 7 h.", "voAt": 0.3 }]
```

- Install once: `motion setup --voice` (engine); the model (~130 MB) downloads on the first
  voice-over. Voices: `motion voices [--lang fr]`. Languages: en (US/UK), fr, es, it, pt-BR,
  ja, zh, hi. The voice language follows `voice.lang`, else `project.lang`.
- One `vo` line per scene, spoken from `voAt` (default 0.25 s). The voice is fairly fast: plan
  ~2.8 words per second. `motion sound` prints, per scene, the speech length and the room
  left, and flags lines that do not fit: shorten the line or lengthen the scene (with a voice,
  the voice drives scene lengths, not the music bars).
- `vo` is what the captions show; `say` (optional) is what the voice pronounces. Write `say`
  for numbers, dates, codes, URLs and acronyms, in words, in the voice's language:
  `"vo": "Code BLOC1 sur blocparty.fr", "say": "Code bloc un, sur bloc party point f r"`.
  Hyphens are spoken as spaces. Put punctuation right after the word (`incroyable!`), never
  alone.
- The voice is regenerated only when a line, the voice or the timings change; `check`,
  `stills`, `draft` and `final` do it automatically, so captions are always current.
- Sync visuals to words: `MO.atWord("s3", "gratuit")` returns the scene-local time the word
  is spoken (`{ end: true }` for its end), e.g. `MO.reveal(tl, "#s3-price", MO.atWord("s3", "free"), { kind: "stamp" })`.
- Captions: `<div id="s2-cap" class="mo-caption"></div>` in the scene, then
  `if (window.MO_VO && MO_VO.s2) MO.captions(tl, "#s2-cap", MO_VO.s2);`. One caption line at a
  time (≤ 6 words, short groups merged), the spoken word highlighted in the style colour that
  reads best on the dark pill. Word times are interpolated within each line (good for word
  highlight, not frame-exact lip sync). With a voice-over, `.mo-mid` and `.mo-fill` stop above
  the caption band automatically; content you place yourself must stay above it too
  (`bottom: calc(var(--safe-b) + var(--cap-zone))`). `"captions": false` in project.json turns
  the band off.
- Write for the ear: short sentences, one idea each, numbers said the way they are shown.
  The voice says the idea; the screen shows its key words, not the same sentence in full.
- Never clone or imitate a real person's voice.
