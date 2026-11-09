// Local voice-over for idea-to-motion: Kokoro v1.0 (82M, Apache-2.0) through sherpa-onnx,
// offline after a one-time model download (~130 MB). No API key, no cloud.
// Languages: English (US/UK), French, Spanish, Italian, Brazilian Portuguese, Japanese,
// Mandarin, Hindi. One WAV per line, placed at the scene time; word timings are interpolated
// inside each spoken line (by characters), which is enough for word-highlight captions.

import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";

const MODEL = "kokoro-int8-multi-lang-v1_0";
const MODEL_URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/${MODEL}.tar.bz2`;

// Kokoro v1.0 speaker table (sherpa-onnx voices.bin order).
export const VOICES = [
  ["af_heart", 3, "en", "female, warm (US) — default English"], ["af_bella", 2, "en", "female, bright (US)"],
  ["af_nicole", 6, "en", "female, soft, close (US)"], ["af_sarah", 9, "en", "female, neutral (US)"],
  ["am_michael", 16, "en", "male, warm (US)"], ["am_adam", 11, "en", "male, deep (US)"], ["am_puck", 18, "en", "male, upbeat (US)"],
  ["bf_emma", 21, "en-gb", "female (UK)"], ["bm_george", 26, "en-gb", "male, mature (UK)"], ["bm_fable", 25, "en-gb", "male, storyteller (UK)"],
  ["ff_siwis", 30, "fr", "female — default French"],
  ["ef_dora", 28, "es", "female — default Spanish"], ["em_alex", 29, "es", "male (Spanish)"],
  ["if_sara", 35, "it", "female — default Italian"], ["im_nicola", 36, "it", "male (Italian)"],
  ["pf_dora", 42, "pt", "female — default Portuguese (BR)"], ["pm_alex", 43, "pt", "male (Portuguese, BR)"],
  ["jf_alpha", 37, "ja", "female — default Japanese"], ["jm_kumo", 41, "ja", "male (Japanese)"],
  ["zf_xiaobei", 45, "zh", "female — default Mandarin"], ["zm_yunxi", 50, "zh", "male (Mandarin)"],
  ["hf_alpha", 31, "hi", "female — default Hindi"], ["hm_omega", 33, "hi", "male (Hindi)"],
];
const LANG_CODE = { en: "en-us", "en-gb": "en-gb", fr: "fr", es: "es", it: "it", pt: "pt-br", ja: "ja", zh: "zh", hi: "hi" };

export function listVoices(lang) {
  const rows = VOICES.filter((v) => !lang || v[2] === lang || v[2].startsWith(lang));
  return ["Voices (Kokoro v1.0, Apache-2.0). Set project.json  \"voice\": { \"voice\": \"<id>\", \"speed\": 1 }", ...rows.map((v) => `  ${v[0].padEnd(11)} ${v[2].padEnd(6)} ${v[3]}`)];
}

function ensureModel(TC) {
  const root = join(dirname(TC), "models");
  const dir = join(root, MODEL);
  if (existsSync(join(dir, "model.int8.onnx"))) return dir;
  mkdirSync(root, { recursive: true });
  const tar = join(root, MODEL + ".tar.bz2");
  console.log(`Downloading the voice model once (~130 MB) into ${root} ...`);
  // curl ships with macOS, Windows 10+ and nearly every Linux; tar extracts .bz2 on all three.
  let r = spawnSync("curl", ["-fsSL", "--retry", "3", "-o", tar, MODEL_URL], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`download failed: ${MODEL_URL}`);
  r = spawnSync("tar", ["-xjf", tar, "-C", root], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("could not extract " + tar + " (needs tar with bzip2)");
  rmSync(tar, { force: true });
  return dir;
}

function wavMono(path, samples, sr) {
  const n = samples.length, data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([h, data]));
}

// Speech span (trim the model's leading/trailing silence) and word times inside it.
function wordTimes(text, samples, sr, at) {
  const thr = 0.02;
  let a = 0, b = samples.length - 1;
  while (a < b && Math.abs(samples[a]) < thr) a++;
  while (b > a && Math.abs(samples[b]) < thr) b--;
  const s0 = a / sr, s1 = b / sr;
  const ws = text.trim().split(/\s+/).filter(Boolean);
  // Weight: letters, plus a pause after punctuation.
  const wt = ws.map((w) => w.replace(/[^\p{L}\p{N}]/gu, "").length + 1.5 + (/[.!?]$/.test(w) ? 3 : /[,;:]$/.test(w) ? 1.5 : 0));
  const total = wt.reduce((x, y) => x + y, 0);
  let acc = 0;
  return ws.map((w, i) => {
    const t0 = s0 + ((s1 - s0) * acc) / total;
    acc += wt[i];
    const pause = /[.!?]$/.test(w) ? 3 : /[,;:]$/.test(w) ? 1.5 : 0;
    const t1 = s0 + ((s1 - s0) * (acc - pause)) / total;
    return { w, t0: +(at + t0).toFixed(3), t1: +(at + t1).toFixed(3) };
  });
}

/**
 * lines: [{ id, text, at (absolute s), max (s available in its scene) }]
 * Writes <audioDir>/vo.wav (48 kHz stereo, full length) and returns { words: { sN: [...] scene-local }, warnings }.
 */
export async function synthLines(TC, p, lines, audioDir, toWav48, total) {
  if (!existsSync(join(TC, "node_modules", "sherpa-onnx-node"))) {
    throw new Error("Voice-over engine missing. Run: node <skill>/scripts/motion.mjs setup --voice");
  }
  const req = createRequire(join(TC, "package.json"));
  const sherpa = req("sherpa-onnx-node");
  const dir = ensureModel(TC);
  const lang = (p.voice.lang || p.lang || "en").toLowerCase();
  const code = LANG_CODE[lang] || LANG_CODE[lang.slice(0, 2)];
  if (!code) throw new Error(`no voice for language "${lang}" (available: ${Object.keys(LANG_CODE).join(", ")})`);
  const v = p.voice.voice ? VOICES.find((x) => x[0] === p.voice.voice) : VOICES.find((x) => x[2] === lang || (lang.startsWith(x[2]) && x[3].includes("default")));
  if (!v) throw new Error(`unknown voice "${p.voice.voice}". List: node <skill>/scripts/motion.mjs voices`);
  const tts = new sherpa.OfflineTts({
    model: { kokoro: { model: join(dir, "model.int8.onnx"), voices: join(dir, "voices.bin"), tokens: join(dir, "tokens.txt"),
      dataDir: join(dir, "espeak-ng-data"), dictDir: join(dir, "dict"),
      lexicon: [join(dir, "lexicon-us-en.txt"), join(dir, "lexicon-zh.txt")].join(","), lang: code }, numThreads: 4 },
    maxNumSentences: 1,
  });
  const SR = 48000, n = Math.ceil(total * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  const words = {}, warnings = [];
  const tmp = join(audioDir, ".vo-tmp");
  mkdirSync(tmp, { recursive: true });
  const report = [];
  for (const ln of lines) {
    // Hyphens between letters make espeak skip a phoneme with noisy warnings: speak them as spaces.
    const spoken = (ln.say || ln.text).replace(/(\p{L})[-‐‑](\p{L})/gu, "$1 $2");
    const a = tts.generate({ text: spoken, sid: v[1], speed: p.voice.speed || 1 });
    const raw = join(tmp, ln.id + ".raw.wav"), w48 = join(tmp, ln.id + ".wav");
    wavMono(raw, a.samples, a.sampleRate);
    const dur = a.samples.length / a.sampleRate;
    toWav48(raw, w48, dur);
    // Caption words come from the displayed text; their times spread over the spoken audio.
    const wt = wordTimes(ln.text, a.samples, a.sampleRate, 0);
    const talk = wt.length ? wt[wt.length - 1].t1 : dur;
    report.push({ id: ln.id, talk: +talk.toFixed(2), room: +ln.max.toFixed(2) });
    if (talk > ln.max - 0.3) warnings.push(`${ln.id}: the line lasts ${talk.toFixed(1)} s but the scene leaves ${ln.max.toFixed(1)} s after voAt: shorten the line or lengthen the scene`);
    const b = readFileSync(w48);
    const off = b.indexOf("data") + 8;
    const s0 = Math.round(ln.at * SR);
    for (let i = 0; off + i * 4 + 3 < b.length && s0 + i < n; i++) { L[s0 + i] += b.readInt16LE(off + i * 4) / 32768; R[s0 + i] += b.readInt16LE(off + i * 4 + 2) / 32768; }
    const sceneAt = ln.at - (ln.sceneStart != null ? ln.sceneStart : 0);
    words[ln.id] = wt.map((x) => ({ w: x.w, t0: +(x.t0 + sceneAt).toFixed(3), t1: +(x.t1 + sceneAt).toFixed(3) }));
  }
  rmSync(tmp, { recursive: true, force: true });
  // Peak-normalise the voice to -3 dBFS (the final loudnorm sets the programme level).
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = peak > 0 ? 0.708 / peak : 1;
  const data = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) { data.writeInt16LE(Math.round(L[i] * g * 32767), i * 4); data.writeInt16LE(Math.round(R[i] * g * 32767), i * 4 + 2); }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(join(audioDir, "vo.wav"), Buffer.concat([h, data]));
  return { words, warnings, voice: v[0], report };
}

// Worker mode: `node voice.mjs worker job.json` runs the synthesis in its own process, so the
// native engine's stderr chatter can be captured and summarised by the CLI.
if (process.argv[2] === "worker") {
  const job = JSON.parse(readFileSync(process.argv[3], "utf8"));
  const toWav48 = (src, dst, dur) => {
    const r = spawnSync(job.ffmpeg, ["-y", "-v", "error", "-i", src, "-ac", "2", "-ar", "48000", "-af", `apad,atrim=0:${dur}`, "-c:a", "pcm_s16le", dst]);
    if (r.status !== 0) throw new Error("ffmpeg could not convert " + src);
  };
  synthLines(job.TC, job.p, job.lines, job.audioDir, toWav48, job.total)
    .then((res) => { writeFileSync(job.out, JSON.stringify(res)); process.exit(0); })
    .catch((e) => { writeFileSync(job.out, JSON.stringify({ error: e.message })); process.exit(1); });
}
