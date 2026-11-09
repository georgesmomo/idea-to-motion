# Example: one quote, six styles

**Prompt:** `/idea-to-motion 6-second kinetic quote, square: "Done is better than perfect."`

The same scene file rendered with six values of `"style"` in `project.json`: `kinetic`,
`editorial`, `luxury`, `brutalist`, `synthwave`, `doodle` (music mood changed to match each).
Fonts, colours, texture, easing, speed and default reveals all come from the style.
Result: [assets/styles.gif](../../assets/styles.gif) · with sound: [assets/styles-reel.mp4](../../assets/styles-reel.mp4).

Try another style:

```bash
# edit "style" in project.json (flat, darktech, blueprint, kinetic, editorial, swiss, brutalist,
# synthwave, iso, paper, doodle, luxury, glass, pastel), then
node <skill>/scripts/motion.mjs final examples/quote-six-styles
```
