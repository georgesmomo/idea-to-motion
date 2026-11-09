# Example: why honey never spoils

**Prompt:** `/idea-to-motion 30-second explainer: why honey never spoils, with a voice-over`

https://github.com/user-attachments/assets/2d6f6909-f40c-4e2c-9e10-346df8a14295

The brief passed both intake gates (the subject is the message; facts come from research), so
the skill generated directly: no questions. Result: the video above
(27.5 s, 16:9, paper style, warm music, voice-over with captions, −14 LUFS).

What it shows:
- the hook readable at frame 0 (it is also the thumbnail);
- emoji used as illustrations, a line icon drawn stroke by stroke;
- cards that land exactly when the voice names them (`MO.atWord`);
- hand-drawn circle and underline (`MO.scribble`), marker highlight (`MO.mark`);
- brand colour override in `project.json` (amber accent on the paper style);
- facts with sources (`facts.md`), source line on the end card.

Rebuild it:

```bash
node <skill>/scripts/motion.mjs final examples/honey-never-spoils
```

(`sync` restores the generated files: kit copy, GSAP, fonts; `sound` regenerates the voice,
music and effects.)
