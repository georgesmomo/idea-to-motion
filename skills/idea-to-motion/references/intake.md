# Intake: go direct, or ask once

The goal is the fewest round trips that still give a video the user recognises as theirs.
Most prompts need zero or one question. Never more than one round.

## 1. Extract

From the prompt and any attached files, fill `brief.md`:

| Field | Weight | Inferable? |
|---|---|---|
| Message: the one sentence the viewer should remember | 25 | Partly (from the subject, for topic videos) |
| Facts the genre needs (names, dates, prices, numbers, quotes, URL) | 20 | **Never** |
| Goal / CTA | 10 | Yes, genre default |
| Platform / ratio | 10 | Yes |
| Tone / style | 10 | Yes, genre default |
| Duration | 8 | Yes |
| Audience | 7 | Yes |
| Brand (colours, logo, font) | 5 | Yes (the style's palette) |
| Language | 3 | Yes (the prompt's language) |
| References | 2 | Yes |

## 2. Decide

Two gates, both required for direct mode:
- **G1, message:** you can write the one-sentence message without guessing the user's intent.
  "Explain how vaccines train the immune system" passes (the subject is the message).
  "A video for my company" fails.
- **G2, genre facts:** the facts this genre cannot do without are present.

| Genre | Required facts (G2) |
|---|---|
| Event promo | what, when, where (link optional) |
| Product launch / app feature / social ad | product name + the main benefit (price only if it is shown) |
| Quote / kinetic type | the exact text (+ author if attributed) |
| Data story | the numbers and their source |
| Recipe / how-to | the dish or task + the steps (or let the agent use well-known steps, said in the report) |
| Real estate | place, price, 2–3 key specs |
| Celebration | the name (+ occasion) |
| Logo reveal | the brand name (+ logo file if any) |
| NGO / cause | the cause + the ask |
| Explainer / educational / history / listicle / "X in 60 s" | the topic (facts come from research) |
| Personal brand / portfolio | name + role + 2–3 proof points |

Score the weighted table (inferable fields count fully once a default applies). Both gates
pass and score ≥ 60: **direct**. Otherwise: **ask**.

Overrides: "just go", "surprise me", "fais comme tu veux", a non-interactive run → direct
with placeholders for missing hard facts. "Ask me questions", "let's brainstorm", "show me the
plan first" → ask, and wait for "go" after the storyboard.

## 3. Ask (one message, at most 3 questions)

Choose by information gain: a missing hard fact first, then the angle, then the destination,
then the vibe. Skip anything you can infer. Use the `AskUserQuestion` tool when available
(each question: 2–4 options, recommended first, a "you choose" option included); otherwise a
numbered list the user can answer with "1b 2a 3c".

Question bank (adapt the wording to the user's language and topic):

1. **Angle** (the most valuable question; offer real storylines, not categories):
   "Which story? a) Before/after: the 6 a.m. rush vs. the 90-second brew (recommended)
   b) Three reasons in 15 seconds c) Countdown to launch day d) You choose"
2. **Missing facts:** "Price and opening date? a) Use placeholders I can edit later
   (recommended) b) I'll type them now"
3. **Destination:** "Where will it play? a) Reels / TikTok / Shorts, 9:16, 15–20 s
   (recommended for ads) b) LinkedIn / Instagram feed, 1:1, 20–30 s c) YouTube / website /
   slides, 16:9, 30–60 s"
4. **Vibe:** three styles from styles.md that fit the genre, the best one first, each with
   three words: "a) Paper: warm, handmade, crafted b) Editorial: elegant, calm, premium
   c) Kinetic: bold, loud, fast d) You choose"
5. **Voice:** only if the genre benefits (explainer, educational, cause): "Voice-over?
   a) No, music and on-screen text (recommended for social) b) Yes, a warm female voice
   c) Yes, a calm male voice"
6. **Brand:** only if it is clearly a company: "Brand colours? a) Pick for me (recommended)
   b) I'll give hex codes / a logo file"

Never ask about pace, easing, fonts, scene count, transitions or music tempo: those are your
craft.

## 4. Defaults

| Field | Default |
|---|---|
| Duration | ad / teaser / social 15 s · event 20 s · most genres 30 s · explainer / educational 45–60 s · logo reveal 6 s · cap 90 s |
| Ratio | named platform → its ratio (see craft.md). None named: social genres (ad, event, celebration, recipe, quote, listicle) 9:16; others 16:9 |
| Style · mood | genre → table in styles.md |
| Language | the prompt's language for on-screen text and voice |
| Voice-over | off; on when asked, or for a 45 s+ explainer if the user agreed |
| Captions | always when there is a voice-over (most social viewing is muted) |
| CTA | the genre's (genres.md) |
| FPS | 30 |
| Output | `./idea-to-motion/<slug>/renders/<slug>.mp4` |

## 5. Examples

Direct (generate now):
- "30 s 16:9 launch teaser for Nova, a note-taking app with offline AI summaries, dark tech
  style, CTA 'Join the waitlist at nova.app'." → launch, darktech, energetic.
- "Kinetic typography, 15 s, 9:16: 'Done is better than perfect.' bold yellow and black."
  → quote, kinetic.
- "Vidéo d'anniversaire pour Léa qui a 30 ans, 12 s, ludique." → celebration, pastel, French.
- "Data story, 45 s: remote work 12 % (2019), 31 % (2021), 58 % (2023), source Gartner, editorial."
- "Explain how a black hole forms, 60 s, for teenagers." → educational, darktech or
  synthwave, research the facts.

Ask:
- "Une vidéo pour ma boulangerie." → G1 fails. Ask: angle (new product / opening / signature
  item), destination, vibe.
- "Make something about climate change." → G1 fails. Ask: angle (one shocking number /
  3 everyday actions / a manifesto), destination, facts source.
- "Promo for my event." → G2 fails. Ask: when/where (placeholders allowed), destination, vibe.
- "Launch video for our app." → G2 fails (no benefit). Ask: the hero feature (3 guesses from
  the app name or repo if available + "you choose"), destination.
- "Explain blockchain." → passes G1/G2 but the audience changes everything: one question
  (beginners recommended / developers / investors), then go.
