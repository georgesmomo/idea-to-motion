# Example: a French Reel with voice-over (9:16)

**Prompt:** `/idea-to-motion Reels de 15-20 s en français sur la règle 20-20-20 pour les yeux, style énergique, avec voix off`

Complete brief, so no questions. Result: [assets/demo-reel-fr.mp4](../../assets/demo-reel-fr.mp4)
(17.1 s, 1080x1920, kinetic style, energetic 126 bpm, French voice `ff_siwis`).

What it shows:
- `MO.punch`: one word per beat, the first one readable at frame 0;
- `vo` (caption spelling, "20-20-20") vs `say` (pronunciation, "vingt, vingt, vingt");
- `"captions": false`: in the kinetic style the text on screen already is the sentence;
- rows that slam in when the voice says them (`MO.atWord`);
- `MO.shapes` filling the zones outside the Reels/TikTok safe area, where text may not go;
- the safe-area check, including the like/share rail on the right.
