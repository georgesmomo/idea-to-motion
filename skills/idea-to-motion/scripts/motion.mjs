#!/usr/bin/env node
// idea-to-motion CLI: setup, new project, checks, stills, sound (sfx + music + voice), renders.
// Usage: node motion.mjs <command> [dir] [options]
//   doctor                      check Node, fonts, toolchain
//   setup [--voice]             install the pinned toolchain once (~/.cache/idea-to-motion); --voice adds TTS
//   new <dir> [--ratio 16:9|9:16|1:1|4:5] [--style flat] [--scenes 5] [--mood upbeat] [--lang en]
//   sync [dir]                  rebuild index.html from project.json (run by every command below)
//   check [dir]                 lint + runtime/layout/contrast + safe-area checks, short summary
//   stills [dir] [--at 1,3.5]   still frames + contact sheet for visual QA
//   beats [dir]                 the music beat grid and scene lengths snapped to bars
//   sound [dir]                 sfx (from the kit's cues) + music + voice-over -> assets/audio/mix.wav
//   music <mood> [--duration 20] [--out f.wav]   preview a music bed
//   voices [--lang fr]          list voice-over voices
//   draft [dir]                 fast low-quality MP4 with sound, verified
//   final [dir] [--music f.mp3] [--name file]  delivery MP4, loudness-normalised, poster, verified
//   verify <file.mp4> [--duration 30]
//   frames <file.mp4> --at 1,4  extract frames (+ sheet.png) from a rendered video
//   icon <name> [name...] [--project <dir>]   lucide (default), tabler:, ph:, emoji:, flag:, brand:, person:<seed>

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, statSync, rmSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { renderCues, SFX_TYPES } from "./sfx.mjs";
import { renderMusic, beatGrid, MOOD_NAMES } from "./music.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL = resolve(HERE, "..");
const ME = join(HERE, "motion.mjs");
const TC_VERSION = "1";
const PINS = {
  hyperframes: "0.9.23",
  "ffmpeg-static": "5.3.0",
  "ffprobe-static": "3.1.0",
  gsap: "3.15.0",
  "simple-icons": "16.37.0",
  "puppeteer-core": "25.16.0",
  "@iconify/utils": "3.1.7",
  "@iconify-json/lucide": "1.2.152",
  "@iconify-json/tabler": "1.2.43",
  "@iconify-json/ph": "1.2.2",
  "@iconify-json/noto": "1.2.10",
  "@iconify-json/circle-flags": "1.2.14",
  "@dicebear/core": "9.4.3",
  "@dicebear/open-peeps": "9.4.2",
  "lottie-web": "5.13.0",
  three: "0.187.0",
  esbuild: "0.28.2",
  fontkit: "2.0.4",
};
// Voice-over: sherpa-onnx 1.12.x (2.x dropped the espeak front end needed for French etc.).
const VOICE_PINS = { "sherpa-onnx-node": "1.12.36" };
const GSAP_PLUGINS = ["DrawSVGPlugin", "MorphSVGPlugin", "MotionPathPlugin", "CustomEase", "SplitText"];
const TC = process.env.MOTION_HOME || join(homedir(), ".cache", "idea-to-motion", "tc" + TC_VERSION);
const RATIOS = { "16:9": [1920, 1080], "9:16": [1080, 1920], "1:1": [1080, 1080], "4:5": [1080, 1350] };
const CSS_SRC = () => readFileSync(join(SKILL, "kit", "motion.css"), "utf8");
const STYLES = [...CSS_SRC().matchAll(/\/\* @style ([a-z0-9-]+) \*\//g)].map((m) => m[1]);

// ---------- helpers ----------

const args = process.argv.slice(2);
const cmd = args[0];
function opt(name, def) {
  const i = args.indexOf("--" + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
}
function flag(name) { return args.includes("--" + name); }
function positional(n) {
  const out = [];
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith("--")) { if (args[i + 1] && !args[i + 1].startsWith("--")) i++; continue; }
    out.push(args[i]);
  }
  return out[n];
}
function die(msg) { console.error("✗ " + msg); process.exit(1); }
function say(msg) { console.log(msg); }

function tcRequire() {
  if (!existsSync(join(TC, "node_modules", "hyperframes"))) die(`Toolchain missing. Run: node ${ME} setup`);
  return createRequire(join(TC, "package.json"));
}
function bins() {
  const req = tcRequire();
  return { ffmpeg: req("ffmpeg-static"), ffprobe: req("ffprobe-static").path,
    hf: join(TC, "node_modules", ".bin", platform() === "win32" ? "hyperframes.cmd" : "hyperframes") };
}
function env() {
  const b = bins();
  return Object.assign({}, process.env, {
    HYPERFRAMES_FFMPEG_PATH: b.ffmpeg, HYPERFRAMES_FFPROBE_PATH: b.ffprobe,
    HYPERFRAMES_NO_TELEMETRY: "1", DO_NOT_TRACK: "1", HYPERFRAMES_SKIP_SKILLS: "1", HYPERFRAMES_NO_UPDATE_CHECK: "1",
  });
}
// Windows: only .cmd shims need a shell, and then every argument must be quoted by hand.
function winQuote(a) { return /[\s"&|<>^()]/.test(a) ? '"' + String(a).replace(/"/g, '\\"') + '"' : a; }
function run(bin, argv, o = {}) {
  const isCmd = platform() === "win32" && /\.cmd$/i.test(bin);
  const r = isCmd
    ? spawnSync(winQuote(bin), argv.map(winQuote), Object.assign({ encoding: "utf8", env: env(), maxBuffer: 1 << 28, shell: true }, o))
    : spawnSync(bin, argv, Object.assign({ encoding: "utf8", env: env(), maxBuffer: 1 << 28 }, o));
  if (r.error) die(`${basename(bin)} failed to start: ${r.error.message}`);
  return r;
}
function hf(dir, argv, o = {}) { return run(bins().hf, argv, Object.assign({ cwd: dir }, o)); }

function projectDir(p) {
  const d = resolve(p || ".");
  if (!existsSync(join(d, "project.json"))) die(`No project.json in ${d}. Create one with: node ${ME} new <dir>`);
  return d;
}
function musicSpec(p) {
  if (!p.music) return null;
  if (typeof p.music === "string") return { file: p.music };
  return p.music;
}
function readProject(d) {
  let p;
  try { p = JSON.parse(readFileSync(join(d, "project.json"), "utf8")); } catch (e) { die("project.json is not valid JSON: " + e.message); }
  if (!RATIOS[p.ratio]) die(`project.json: ratio must be one of ${Object.keys(RATIOS).join(", ")}`);
  if (!STYLES.includes(p.style)) die(`project.json: style must be one of ${STYLES.join(", ")}`);
  if (!Array.isArray(p.scenes) || !p.scenes.length) die("project.json: scenes must be a non-empty array");
  const seen = {};
  p.scenes.forEach((s, i) => {
    if (!/^s\d+$/.test(s.id)) die(`project.json: scene ${i} id "${s.id}" must look like s1, s2...`);
    if (seen[s.id]) die(`project.json: duplicate scene id ${s.id}`);
    seen[s.id] = 1;
    if (typeof s.duration !== "number" || !(s.duration > 0)) die(`project.json: scene ${s.id} needs a numeric duration > 0 (got ${JSON.stringify(s.duration)})`);
    if (s.vo != null && typeof s.vo !== "string") die(`project.json: scene ${s.id} vo must be a string (the line spoken in this scene)`);
    if (s.overlap != null) {
      const prev = p.scenes[i - 1];
      if (!prev || typeof s.overlap !== "number" || s.overlap < 0 || s.overlap >= Math.min(prev.duration, s.duration) / 2)
        die(`project.json: scene ${s.id} overlap must be a number of seconds, less than half of this scene and of the previous one (not on s1)`);
    }
  });
  if (p.fps != null && ![24, 25, 30, 50, 60].includes(p.fps)) die("project.json: fps must be 24, 25, 30, 50 or 60");
  if (p.sound != null && !["auto", "manual", "none"].includes(p.sound)) die('project.json: sound must be "auto", "manual" or "none"');
  const m = musicSpec(p);
  if (m && !m.file && !MOOD_NAMES.includes(m.mood)) die(`project.json: music.mood must be one of ${MOOD_NAMES.join(", ")} (or music: null, or music: "file.mp3")`);
  if (p.voice && typeof p.voice !== "object") die('project.json: voice must be null or { "voice": "<id>", "speed": 1 }');
  return p;
}
// "overlap" (seconds) starts a scene that much before the previous one ends: both are on screen
// during the transition (the outgoing exit and the incoming enter play together).
function sceneStarts(p) {
  const o = {}; let t = 0;
  p.scenes.forEach((s, i) => { if (i) t -= s.overlap || 0; o[s.id] = +t.toFixed(3); t += s.duration; });
  return o;
}
function totalDuration(p) { const last = p.scenes[p.scenes.length - 1]; return +(sceneStarts(p)[last.id] + last.duration).toFixed(3); }

// ---------- commands ----------

function doctor() {
  const major = +process.versions.node.split(".")[0];
  say(`${major >= 22 ? "✓" : "✗"} Node ${process.versions.node}${major >= 22 ? "" : " (need 22 or later)"}`);
  if (platform() === "linux") {
    const r = spawnSync("fc-list", [], { encoding: "utf8" });
    const n = r.stdout ? r.stdout.trim().split("\n").filter(Boolean).length : 0;
    say(`${n > 0 ? "✓" : "✗"} System fonts: ${n}${n > 0 ? "" : " — install one (e.g. apt install fonts-dejavu-core), or text can render blank"}`);
  }
  for (const tool of ["npm", "curl", "tar"]) {
    const r = spawnSync(tool, ["--version"], { encoding: "utf8", shell: platform() === "win32" });
    say(`${r.status === 0 ? "✓" : "✗"} ${tool}${r.status === 0 ? "" : " not found (needed for setup, fonts and the voice model)"}`);
  }
  const ok = existsSync(join(TC, "node_modules", "hyperframes"));
  say(`${ok ? "✓" : "✗"} Toolchain ${ok ? "ready" : "not installed"} at ${TC}`);
  if (ok) {
    const r = run(bins().hf, ["doctor"], { cwd: TC });
    const out = (r.stdout || "") + (r.stderr || "");
    out.split("\n").filter((l) => /ffmpeg|ffprobe|chrome|node/i.test(l)).slice(0, 6).forEach((l) => say("  " + l.trim()));
    const v = existsSync(join(TC, "node_modules", "sherpa-onnx-node"));
    say(`${v ? "✓" : "·"} Voice-over ${v ? "engine ready (Kokoro, the model downloads on first use)" : "not installed (optional: setup --voice)"}`);
  }
  if (major < 22) process.exit(1);
}

function setup() {
  const major = +process.versions.node.split(".")[0];
  if (major < 22) die(`Node ${process.versions.node} found; HyperFrames needs Node 22+. Install it from nodejs.org or with nvm, then retry.`);
  mkdirSync(TC, { recursive: true });
  const deps = Object.assign({}, PINS, flag("voice") || existsSync(join(TC, "node_modules", "sherpa-onnx-node")) ? VOICE_PINS : {});
  writeFileSync(join(TC, "package.json"), JSON.stringify({ name: "idea-to-motion-toolchain", private: true, dependencies: deps }, null, 2));
  say(`Installing toolchain in ${TC} (one time, ~1-2 min${flag("voice") ? ", voice adds ~1 min" : ""})...`);
  const r = spawnSync("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: TC, stdio: "inherit", shell: platform() === "win32" });
  if (r.status !== 0) die("npm install failed (see above).");
  run(bins().hf, ["telemetry", "disable"], { cwd: TC });
  say("✓ Toolchain ready: hyperframes " + PINS.hyperframes + ", ffmpeg (static), gsap " + PINS.gsap + ", icons (Lucide, Tabler, Phosphor, Noto emoji, flags, Simple Icons), Open Peeps");
  if (flag("voice")) say("✓ Voice-over engine (sherpa-onnx). The Kokoro voice model (~130 MB) downloads on the first voice-over.");
  say("  The first render downloads a headless Chrome (~260 MB) into ~/.cache/hyperframes.");
}

function sceneSkeleton(id, W, H, duration, first, last) {
  return `<template>
  <div id="root" data-composition-id="${id}" data-width="${W}" data-height="${H}">
    <div class="mo-scene" id="${id}-scene">
      <div class="mo-bg" id="${id}-bg"></div>
      <div class="mo-stage" id="${id}-stage">
        <div class="mo-camera" id="${id}-cam">
          <div class="mo-mid">
            <h1 class="mo-hook" id="${id}-title">Scene ${id}</h1>
          </div>
        </div>
      </div>
      <div class="mo-grain"></div>
    </div>
  </div>
  <script>
    (function () {
      const D = ${duration}; // kept in sync with project.json by motion
      const tl = gsap.timeline({ paused: true });
      MO.drift(tl, "#${id}-bg", 0, D);
      ${first ? "" : `MO.enter(tl, "#${id}-stage", 0);
      `}// First reveal at 0-0.05 s so the stage never arrives empty.
      let t = MO.reveal(tl, "#${id}-title", ${first ? "0" : "0.05"}${first ? ', { kind: "settle" }' : ""});
      ${last ? "// Last scene: no exit, the end card holds to the end." : `MO.exit(tl, "#${id}-stage", D);`}
      window.__timelines["${id}"] = tl;
    })();
  </script>
</template>
`;
}

function copyVendor(d) {
  const req = tcRequire();
  const dist = join(dirname(req.resolve("gsap/package.json")), "dist");
  for (const f of ["gsap", ...GSAP_PLUGINS]) {
    const dst = join(d, "assets", "vendor", f + ".min.js");
    if (!existsSync(dst)) copyFileSync(join(dist, f + ".min.js"), dst);
  }
}

function newProject() {
  const dir = positional(0);
  if (!dir) die("Usage: new <dir> [--ratio 16:9] [--style flat] [--scenes 5] [--mood upbeat] [--lang en]");
  const d = resolve(dir);
  if (existsSync(join(d, "project.json"))) die(`${d} already has a project.json`);
  const ratio = opt("ratio", "16:9"), style = opt("style", "flat"), n = +opt("scenes", "5"), mood = opt("mood", "upbeat");
  if (!RATIOS[ratio]) die(`--ratio must be one of ${Object.keys(RATIOS).join(", ")}`);
  if (!STYLES.includes(style)) die(`--style must be one of ${STYLES.join(", ")}`);
  if (mood !== "none" && !MOOD_NAMES.includes(mood)) die(`--mood must be one of ${MOOD_NAMES.join(", ")}, none`);
  for (const sub of ["compositions", "assets/vendor", "assets/mo", "assets/audio"]) mkdirSync(join(d, sub), { recursive: true });
  const scenes = [];
  for (let i = 1; i <= n; i++) scenes.push({ id: "s" + i, duration: 4, beat: "" });
  const project = { title: basename(d), ratio, style, lang: opt("lang", "en"), fps: 30, sound: "auto",
    music: mood === "none" ? null : { mood, volume: 0.8 }, voice: null, scenes };
  writeFileSync(join(d, "project.json"), JSON.stringify(project, null, 2) + "\n");
  writeFileSync(join(d, "cues.json"), "[]\n");
  writeFileSync(join(d, "hyperframes.json"), JSON.stringify({ paths: { blocks: "compositions", components: "compositions/components", assets: "assets" } }, null, 2) + "\n");
  writeFileSync(join(d, "meta.json"), JSON.stringify({ id: basename(d), name: basename(d) }, null, 2) + "\n");
  for (const f of ["brief.md", "storyboard.md", "facts.md"]) copyFileSync(join(SKILL, "template", f), join(d, f));
  sync(d);
  say(`✓ Project created: ${d}`);
  say(`  ${ratio} ${RATIOS[ratio].join("x")}, style "${style}", ${n} scenes of 4 s, music ${mood}`);
  say(`  Next: edit project.json (durations, vo lines), then compositions/sN.html`);
}

// Only the chosen style's block goes into the page: its fonts are the only ones embedded.
function cssFor(style) {
  const src = CSS_SRC();
  const first = src.indexOf("/* @style ");
  const base = src.slice(0, first);
  const m = new RegExp(`/\\* @style ${style} \\*/([\\s\\S]*?)/\\* @end \\*/`).exec(src);
  return base + (m ? m[1] : "");
}
function fontFamilies(style) {
  const css = cssFor(style);
  return [...new Set([...css.matchAll(/\.mo-fonts-[a-z0-9-]+ \{ font-family: "([^"]+)"; \}/g)].map((m) => m[1]))];
}

// Fonts: downloaded once from Google Fonts (all OFL) into the toolchain cache, copied into the
// project and declared with @font-face in index.html, so the render embeds exactly these files
// (offline after the first fetch, no silent substitution).
const FONT_CACHE = join(dirname(TC), "fonts");
let FONTS_MISSING = [];
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const SUBSETS = { ru: ["cyrillic", "cyrillic-ext"], uk: ["cyrillic", "cyrillic-ext"], bg: ["cyrillic"], el: ["greek", "greek-ext"], vi: ["vietnamese"] };
function curl(url, out) {
  const r = spawnSync("curl", ["-fsSL", "--retry", "2", "-A", UA, ...(out ? ["-o", out] : []), url], { encoding: out ? undefined : "utf8", maxBuffer: 1 << 26 });
  return r.status === 0 ? (out ? true : r.stdout) : null;
}
function fontCss(family) {
  mkdirSync(FONT_CACHE, { recursive: true });
  const slug = family.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const cssFile = join(FONT_CACHE, slug + ".css");
  if (existsSync(cssFile)) return readFileSync(cssFile, "utf8");
  const fam = family.replace(/ /g, "+");
  let css = curl(`https://fonts.googleapis.com/css2?family=${fam}:wght@300;400;500;600;700;800;900&display=block`);
  if (!css) {
    // Not every family has every weight: ask weight by weight.
    css = ["300", "400", "500", "600", "700", "800", "900"].map((w) => curl(`https://fonts.googleapis.com/css2?family=${fam}:wght@${w}&display=block`) || "").join("\n");
  }
  if (!css || !/@font-face/.test(css)) return null;
  writeFileSync(cssFile, css);
  return css;
}
function embedFonts(d, p) {
  const keep = ["latin", "latin-ext"].concat(SUBSETS[(p.lang || "en").slice(0, 2)] || []);
  const out = [], missing = [];
  mkdirSync(join(d, "assets", "fonts"), { recursive: true });
  const b = p.brand || {};
  const fams = fontFamilies(p.style).concat([b.displayFont, b.bodyFont].filter((f) => f && !(b.fontFiles || {})[f]));
  for (const family of [...new Set(fams)]) {
    const css = fontCss(family);
    if (!css) { missing.push(family); continue; }
    for (const m of css.matchAll(/\/\* ([a-z-]+) \*\/\s*(@font-face \{[\s\S]*?\})/g)) {
      if (!keep.includes(m[1])) continue;
      const url = (/url\((https:[^)]+)\)/.exec(m[2]) || [])[1];
      if (!url) continue;
      const file = family.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + basename(url).replace(/[^a-zA-Z0-9._-]/g, "");
      const cached = join(FONT_CACHE, file), local = join(d, "assets", "fonts", file);
      if (!existsSync(cached) && !curl(url, cached)) { missing.push(family); continue; }
      if (!existsSync(local)) copyFileSync(cached, local);
      out.push(m[2].replace(/url\([^)]+\)/, `url("assets/fonts/${file}")`));
    }
  }
  for (const [fam, file] of Object.entries(b.fontFiles || {})) {
    if (!existsSync(join(d, file))) { say(`  ⚠ brand font file not found: ${file}`); continue; }
    out.push(`@font-face { font-family: "${fam}"; src: url("${file}"); font-display: block; }`);
  }
  FONTS_MISSING = [...new Set(missing)];
  if (missing.length) say(`  ⚠ fonts not downloaded (offline?): ${[...new Set(missing)].join(", ")}. The render falls back to a generic font; run again online.`);
  return [...new Set(out)].join("\n");
}

// ---------- 3D (MO3D) ----------
// three.js and a few addons bundled once into one classic script (works from file:// and in the
// render), the kit's 3D layer, and the style's fonts converted to three.js typeface outlines.
function buildThreeKit(out) {
  const req = tcRequire();
  const entry = join(TC, "three-kit-entry.mjs");
  writeFileSync(entry, `import * as T from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { Font } from "three/examples/jsm/loaders/FontLoader.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
window.THREE = Object.assign({}, T, { RoomEnvironment, TextGeometry, Font, RoundedBoxGeometry, SVGLoader, EffectComposer, RenderPass, UnrealBloomPass, OutputPass, mergeVertices });
`);
  req("esbuild").buildSync({ entryPoints: [entry], bundle: true, format: "iife", minify: true, outfile: out, absWorkingDir: TC, logLevel: "error" });
  // Deterministic by construction: three's ids come from a seeded generator, and its animation
  // loop (unused: the timeline draws every frame) cannot start a wall-clock rAF loop.
  const seeded = "var __moRand=(function(){var a=20261109;return function(){a=(a+0x6d2b79f5)|0;var t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};})();"
    + "var __moNoFrame=function(){return 0;};\n";
  writeFileSync(out, seeded + readFileSync(out, "utf8").replace(/Math\.random/g, "__moRand")
    .replace(/(?:self|window|globalThis)\.requestAnimationFrame|\brequestAnimationFrame\b/g, "__moNoFrame")
    .replace(/(?:self|window|globalThis)\.cancelAnimationFrame|\bcancelAnimationFrame\b/g, "__moNoFrame"));
}
const CHARS3D = (() => { let s = ""; for (let c = 32; c < 127; c++) s += String.fromCharCode(c); for (let c = 160; c < 256; c++) s += String.fromCharCode(c); return s + "€’‘“”–—…•→←↑↓★✓×÷≈≠≤≥∞Œœ"; })();
// A static TrueType file of `family` for 3D outlines (Google Fonts serves static .ttf instances to
// non-browser clients), heaviest weight unless `want` is given.
function fontFileFor(family, want) {
  mkdirSync(FONT_CACHE, { recursive: true });
  const slug = family.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const order = want ? [want, 800, 700, 900, 600, 500, 400] : [900, 800, 700, 600, 500, 400];
  for (const w of [...new Set(order)]) {
    const file = join(FONT_CACHE, `3d-${slug}-${w}.ttf`);
    if (existsSync(file)) return { file, weight: w };
    const r = spawnSync("curl", ["-fsSL", "--retry", "2", `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${w}`], { encoding: "utf8" });
    const url = r.status === 0 ? (/url\((https:[^)]+\.ttf)\)/.exec(r.stdout) || [])[1] : null;
    if (url && curl(url, file)) return { file, weight: w };
  }
  return null;
}
function typeface(file, weight) {
  const fontkit = tcRequire()("fontkit");
  let font = fontkit.openSync(file);
  if (font.variationAxes && font.variationAxes.wght && /\.ttf$/i.test(file)) {
    const a = font.variationAxes.wght;
    font = font.getVariation({ wght: Math.max(a.min, Math.min(a.max, weight)) });
  }
  const r = (v) => Math.round(v);
  const glyphs = {};
  for (const ch of CHARS3D) {
    const cp = ch.codePointAt(0);
    if (!font.hasGlyphForCodePoint(cp)) continue;
    const g = font.glyphForCodePoint(cp);
    const o = [];
    for (const c of g.path.commands) {
      const a = c.args;
      if (c.command === "moveTo") o.push("m", r(a[0]), r(a[1]));
      else if (c.command === "lineTo") o.push("l", r(a[0]), r(a[1]));
      else if (c.command === "quadraticCurveTo") o.push("q", r(a[2]), r(a[3]), r(a[0]), r(a[1]));
      else if (c.command === "bezierCurveTo") o.push("b", r(a[4]), r(a[5]), r(a[0]), r(a[1]), r(a[2]), r(a[3]));
    }
    const bb = g.bbox;
    glyphs[ch] = { ha: r(g.advanceWidth), x_min: r(bb.minX), x_max: r(bb.maxX), o: o.join(" ") };
  }
  return { glyphs, familyName: font.familyName, ascender: font.ascent, descender: font.descent, underlinePosition: font.underlinePosition,
    underlineThickness: font.underlineThickness || 50, boundingBox: { xMin: font.bbox.minX, yMin: font.bbox.minY, xMax: font.bbox.maxX, yMax: font.bbox.maxY },
    resolution: font.unitsPerEm, original_font_information: { format: 0, fontFamily: font.familyName } };
}
function threeAssets(d, p) {
  const dir = join(d, "compositions");
  const uses = existsSync(dir) && readdirSync(dir).some((f) => f.endsWith(".html") && /\bMO3D\./.test(readFileSync(join(dir, f), "utf8")));
  if (!uses) return false;
  const bundle = join(TC, `three-kit-${PINS.three}-2.js`);
  if (!existsSync(bundle)) {
    if (!existsSync(join(TC, "node_modules", "three"))) die(`3D scenes need three.js in the toolchain. Run: node ${ME} setup`);
    buildThreeKit(bundle);
  }
  const copyIfNew = (src, dst) => { if (!existsSync(dst) || readFileSync(src, "utf8") !== readFileSync(dst, "utf8")) copyFileSync(src, dst); };
  copyIfNew(bundle, join(d, "assets", "vendor", "three-kit.js"));
  copyIfNew(join(SKILL, "kit", "motion3d.js"), join(d, "assets", "mo", "motion3d.js"));
  // 3D fonts: the style's display and body families (brand fonts win), heaviest weight.
  const fams = fontFamilies(p.style), b = p.brand || {};
  const want = { display: b.font3d || b.displayFont || fams[0], body: b.bodyFont || fams[1] || fams[0] };
  const out = join(d, "assets", "mo", "fonts3d.js");
  const key = JSON.stringify([want, CHARS3D.length, 2]);
  if (existsSync(out) && readFileSync(out, "utf8").startsWith(`/* ${key} */`)) return true;
  const data = {};
  for (const [role, fam] of Object.entries(want)) {
    const local = (b.fontFiles || {})[fam];
    const f = local && existsSync(join(d, local)) ? { file: join(d, local), weight: 800 } : fontFileFor(fam, role === "body" ? 800 : null);
    if (!f) { say(`  ⚠ 3D font "${fam}" not available (offline?): MO3D.text falls back to the other one`); continue; }
    try { data[role] = typeface(f.file, f.weight); } catch (e) { say(`  ⚠ 3D font "${fam}" could not be converted: ${e.message}`); }
  }
  writeFileSync(out, `/* ${key} */\nwindow.MO_FONTS3D = ${JSON.stringify(data)};\n`);
  return true;
}

function brandCss(p) {
  const b = p.brand;
  if (!b) return "";
  const map = { accent: "--accent", accent2: "--accent-2", accent3: "--accent-3", onAccent: "--on-accent", bg: "--bg", text: "--text", panel: "--panel", muted: "--muted" };
  const decl = Object.keys(map).filter((k) => b[k]).map((k) => `${map[k]}: ${b[k]};`);
  if (b.bg) decl.push("--bg-2: " + b.bg + ";");
  if (b.displayFont) decl.push(`--font-display: "${b.displayFont}", sans-serif;`);
  if (b.bodyFont) decl.push(`--font-body: "${b.bodyFont}", sans-serif;`);
  const lit = [b.displayFont, b.bodyFont].filter(Boolean).map((f, i) => `.mo-fonts-brand-${i} { font-family: "${f}"; }`).join(" ");
  return decl.length ? `      /* brand overrides (project.json) */ ${lit}\n      [data-style="${p.style}"] { ${decl.join(" ")} }` : "";
}

function sync(d) {
  const p = readProject(d);
  const [W, H] = RATIOS[p.ratio];
  const total = totalDuration(p), starts = sceneStarts(p);
  const hosts = p.scenes.map((s, idx) => {
    const file = join(d, "compositions", s.id + ".html");
    if (!existsSync(file)) { mkdirSync(join(d, "compositions"), { recursive: true }); writeFileSync(file, sceneSkeleton(s.id, W, H, s.duration, idx === 0, idx === p.scenes.length - 1)); }
    else {
      const src = readFileSync(file, "utf8");
      if (!/const D = [\d.]+;/.test(src)) say(`  ⚠ ${s.id}.html: no "const D = <seconds>;" line, so its duration is not synced`);
      const next = src.replace(/const D = [\d.]+;/, `const D = ${s.duration};`)
        .replace(/(data-composition-id="s\d+" data-width=")\d+(" data-height=")\d+/, `$1${W}$2${H}`);
      if (next !== src) writeFileSync(file, next);
    }
    const h = `      <div id="${s.id}" data-composition-id="${s.id}" data-composition-src="compositions/${s.id}.html"
        data-start="${starts[s.id]}" data-duration="${s.duration}" data-track-index="${1 + (idx % 2) * 2}" data-track-kind="graphics"
        data-width="${W}" data-height="${H}" style="z-index:${idx + 1}"></div>`;
    return h;
  });
  for (const sub of ["compositions", "assets/vendor", "assets/mo", "assets/audio"]) mkdirSync(join(d, sub), { recursive: true });
  copyVendor(d);
  const uses3d = threeAssets(d, p);
  // Lottie files the user supplied (assets/lottie/*.json): ship the player too.
  const hasLottie = existsSync(join(d, "assets", "lottie"));
  if (hasLottie && !existsSync(join(d, "assets", "vendor", "lottie_light.min.js"))) {
    copyFileSync(join(dirname(tcRequire().resolve("lottie-web/package.json")), "build", "player", "lottie_light.min.js"), join(d, "assets", "vendor", "lottie_light.min.js"));
  }
  if (!existsSync(join(d, "hyperframes.json"))) writeFileSync(join(d, "hyperframes.json"), JSON.stringify({ paths: { blocks: "compositions", components: "compositions/components", assets: "assets" } }, null, 2) + "\n");
  // Keep the kit copy current with the skill version.
  for (const f of ["motion.js", "motion.css"]) {
    const src = join(SKILL, "kit", f), dst = join(d, "assets", "mo", f);
    if (!existsSync(dst) || readFileSync(src, "utf8") !== readFileSync(dst, "utf8")) copyFileSync(src, dst);
  }
  // Beat grid for MO.snap / MO.beat (only with generated music).
  const m = musicSpec(p);
  const beatsFile = join(d, "assets", "mo", "beats.js");
  if (m && m.mood) {
    const gr = beatGrid(m.mood, total, m.bpm);
    writeFileSync(beatsFile, `window.MO_BEATS = ${JSON.stringify({ bpm: gr.bpm, beat: gr.beat, bar: gr.bar, starts: sceneStarts(p) })};\n`);
  } else if (existsSync(beatsFile)) rmSync(beatsFile);
  const extra = ["icons.js", "beats.js", "vo.js"].filter((f) => existsSync(join(d, "assets", "mo", f)))
    .map((f) => `\n    <script src="assets/mo/${f}"></script>`).join("");
  const plugins = GSAP_PLUGINS.map((f) => `\n    <script src="assets/vendor/${f}.min.js"></script>`).join("");
  const mix = join(d, "assets", "audio", "mix.wav");
  const hasAudio = p.sound !== "none" && existsSync(mix);
  const audio = hasAudio ? `\n      <audio id="mo-mix" src="assets/audio/mix.wav" data-start="0" data-duration="${total}" data-track-index="2" data-volume="1"></audio>` : "";
  const html = `<!doctype html>
<!-- Generated by idea-to-motion from project.json. Edit project.json and compositions/, not this file. -->
<html lang="${p.lang || "en"}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <script src="assets/vendor/gsap.min.js"></script>${plugins}
    <script>gsap.registerPlugin(${GSAP_PLUGINS.filter((x) => x !== "SplitText").join(", ")});</script>
    <script src="assets/mo/motion.js"></script>${uses3d ? `\n    <script src="assets/vendor/three-kit.js"></script>\n    <script src="assets/mo/fonts3d.js"></script>\n    <script src="assets/mo/motion3d.js"></script>` : ""}${hasLottie ? `\n    <script src="assets/vendor/lottie_light.min.js"></script>` : ""}${extra}
    <style>
${embedFonts(d, p)}
${cssFor(p.style)}
${brandCss(p)}
      html, body { width: ${W}px; height: ${H}px; }
    </style>
  </head>
  <body data-style="${p.style}" data-ratio="${p.ratio.replace(":", "x")}"${p.voice && p.scenes.some((s) => s.vo) && p.captions !== false ? " data-captions" : ""}>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-fps="${p.fps || 30}" data-width="${W}" data-height="${H}"${p.motionBlur ? ` data-motion-blur="on"${typeof p.motionBlur === "number" ? ` data-motion-blur-shutter="${p.motionBlur}"` : ""}` : ""}>
${hosts.join("\n")}${audio}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`;
  writeFileSync(join(d, "index.html"), html);
  return p;
}

// Findings caused by the kit's own layers on purpose (oversized drifting background, full-frame
// scene, stage moving during transitions). Hidden from the summary, kept in the JSON report.
function expected(f) {
  const where = String(f.selector || f.elementId || f.target || "");
  if (f.code === "container_overflow" && /-(bg|stage|cam|scene)\b/.test(where)) return true;
  if (f.code === "canvas_covered" && (/-(bg|scene)\b/.test(where) || /^#s\d+ > div:nth-of-type\(1\) > div:nth-of-type\(1\)$/.test(where))) return true;
  if (/mo-grain|mo-flash/.test(where)) return true;
  // A 3D stage is a full-frame canvas: stars and floors reach the edges on purpose.
  if (f.code === "canvas_content_at_edge" && /-gl\b/.test(where)) return true;
  // Voice-over captions follow the voice: their on-screen time is the speech, not a reading hold.
  if (f.code === "line_unread" && /-cap\b/.test(where)) return true;
  return false;
}

// A line that mixes a marker-highlighted word with plain words is sampled as one block by the
// contrast check (white text measured on the marker colour): a false alarm. Downgrade it to a
// warning; the stills show the real result.
let PROJECT_DIR = null;
function markerFalseAlarm(f) {
  if (f.code !== "contrast_aa_failure" || !f.sourceFile || !f.text || !PROJECT_DIR) return false;
  let src = "";
  try { src = readFileSync(join(PROJECT_DIR, f.sourceFile), "utf8"); } catch { return false; }
  const marks = [...src.matchAll(/class="[^"]*\bmo-mark\b[^"]*"[^>]*>([^<]+)</g)].map((m) => m[1].trim()).filter(Boolean);
  return marks.some((m) => f.text.includes(m) && f.text.trim() !== m);
}
function severityOf(f) {
  const sev = f.severity || f.level || (f.error ? "error" : "warning");
  return sev === "error" && markerFalseAlarm(f) ? "warning" : sev;
}

function summarizeFindings(section, name, max = 12) {
  if (!section) return [];
  const out = [];
  (section.findings || []).filter((f) => !expected(f) && (f.severity || "") !== "info").slice(0, max).forEach((f) => {
    const sev = severityOf(f);
    const where = f.file || f.selector || f.elementId || f.target || "";
    const at = f.time != null ? ` @${f.time}s` : f.at != null ? ` @${f.at}s` : "";
    const msg = String(f.message || f.detail || "").replace(/references\/motion\.md/g, "references/craft.md");
    out.push(`  ${sev === "error" ? "✗" : "⚠"} [${name}] ${f.code || f.rule || f.kind || ""} ${where}${at} — ${msg}`.replace(/\s+/g, " "));
  });
  return out;
}

async function check() {
  const d = projectDir(positional(0));
  PROJECT_DIR = d;
  let p = sync(d);
  if (p.voice) { await voiceOver(d, p, true); p = sync(d); }
  const noAudioYet = p.sound !== "none" && !existsSync(join(d, "assets", "audio", "mix.wav"));
  const lint = hf(d, ["lint", "--json"]);
  let lintJson = null;
  try { lintJson = JSON.parse(lint.stdout.slice(lint.stdout.indexOf("{"))); } catch {}
  const r = hf(d, ["check", "--json"]);
  let j = null;
  try { j = JSON.parse(r.stdout.slice(r.stdout.indexOf("{"))); } catch {}
  if (!j) { say((r.stdout || "") + (r.stderr || "")); die("check did not return JSON"); }
  let errors = 0, warnings = 0;
  const lines = [];
  ["lint", "runtime", "layout", "motion", "contrast", "craft", "audio"].forEach((s) => {
    const sec = j[s];
    if (!sec) return;
    if (noAudioYet && sec.findings) sec.findings = sec.findings.filter((f) => !["film_silent", "audio_none"].includes(f.code));
    (sec.findings || []).forEach((f) => {
      if (expected(f) || f.severity === "info") return;
      if (severityOf(f) === "error") errors++; else warnings++;
    });
    lines.push(...summarizeFindings(sec, s));
  });
  if (lintJson && !j.lint) {
    (lintJson.findings || []).forEach((f) => { if (f.severity === "error") errors++; else if (f.severity !== "info") warnings++; });
    lines.push(...summarizeFindings(lintJson, "lint"));
  }
  // The process files the critic and the user read must be filled, and match project.json.
  const proc = [];
  for (const f of ["brief.md", "storyboard.md", "facts.md"]) {
    const fp = join(d, f);
    if (!existsSync(fp)) { proc.push(`${f} is missing`); continue; }
    const txt = readFileSync(fp, "utf8");
    // Table rows (minus the header) whose cells after the first are not all empty.
    const body = txt.split("\n").filter((l) => /^\|/.test(l) && !/^\|[\s\-|:]+\|$/.test(l)).slice(1);
    const rows = body.filter((l) => l.split("|").slice(2, -1).some((c) => c.trim())).length;
    if (f === "brief.md" && rows < 4) proc.push("brief.md is not filled (message, genre, platform, style...): fill it, the critic reads it");
    else if (f === "storyboard.md" && rows < p.scenes.length) proc.push(rows ? `storyboard.md has ${rows} row(s) for ${p.scenes.length} scenes` : "storyboard.md is still the empty template: fill it");
    else if (f === "facts.md" && rows === 0) proc.push("facts.md has no entries: list every name, number, date and price shown, with its source");
  }
  // A caption written as a pronunciation ("point f r", spelled-out letters) belongs in "say".
  p.scenes.forEach((sc) => {
    if (sc.vo && !sc.say && /(\s(point|dot)\s|\b([a-z])\s([a-z])\b\s([a-z])\b)/i.test(sc.vo)) proc.push(`${sc.id}: vo "${sc.vo.slice(0, 40)}" looks like a pronunciation: write the caption in normal spelling in vo, the pronunciation in say`);
  });
  warnings += proc.length;
  let safe = [];
  try { safe = await safeAreaCheck(d, p); } catch (e) { say("  ⚠ safe-area check skipped: " + e.message); }
  errors += safe.length;
  say(`${errors ? "✗" : "✓"} check: ${errors} error(s), ${warnings} warning(s)`);
  lines.forEach((l) => say(l));
  safe.slice(0, 15).forEach((l) => say("  ✗ [safe-area] " + l));
  proc.forEach((l) => say("  ⚠ [process] " + l));
  if (noAudioYet) say("  (sound is added at draft/final: no audio warnings yet)");
  writeFileSync(join(d, ".motion-check.json"), JSON.stringify(j, null, 2));
  say(`  full report: ${join(d, ".motion-check.json")}`);
  if (errors) process.exitCode = 1;
}

async function stills() {
  const d = projectDir(positional(0));
  let p = sync(d);
  if (p.voice) { await voiceOver(d, p, true); p = sync(d); }
  // Frame 0 (the hook / thumbnail), one still per scene at 65 % of its length, plus any --at.
  const ts = [0], st0 = sceneStarts(p);
  p.scenes.forEach((s) => ts.push(+(st0[s.id] + s.duration * 0.65).toFixed(2)));
  const extra = opt("at", null);
  if (extra) extra.split(",").map(Number).filter((x) => !isNaN(x)).forEach((x) => ts.push(x));
  if (flag("only") && extra) ts.splice(0, ts.length, ...extra.split(",").map(Number));
  const at = [...new Set(ts)].sort((a, b) => a - b).join(",");
  const out = join(d, ".motion-stills");
  rmSync(out, { recursive: true, force: true });
  const html = readFileSync(join(d, "index.html"), "utf8");
  if (!flag("no-safe")) writeFileSync(join(d, "index.html"), html.replace("<body ", "<body data-safe-overlay "));
  let r;
  try { r = hf(d, ["snapshot", "--at", at, "-o", out, "--json"]); } finally { writeFileSync(join(d, "index.html"), html); }
  if (r.status !== 0) { say((r.stdout || "") + (r.stderr || "")); die("snapshot failed"); }
  const files = existsSync(out) ? readdirSync(out).filter((f) => /\.(png|jpe?g)$/.test(f)).sort() : [];
  say(`✓ ${files.length} image(s) in ${out}`);
  files.forEach((f) => say("  " + join(out, f)));
  say("  Open the contact sheet(s), then single frames for detail. The dashed magenta box is the");
  say("  platform safe area (stills only, never rendered): text must stay inside it.");
}

function browserPath() {
  if (process.env.HYPERFRAMES_BROWSER_PATH && existsSync(process.env.HYPERFRAMES_BROWSER_PATH)) return process.env.HYPERFRAMES_BROWSER_PATH;
  const r = run(bins().hf, ["browser", "path"], { cwd: TC });
  const line = ((r.stdout || "") + "\n" + (r.stderr || "")).split("\n").map((l) => l.trim()).find((l) => l && existsSync(l));
  if (line) return line;
  for (const c of ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]) if (existsSync(c)) return c;
  const e = run(bins().hf, ["browser", "ensure"], { cwd: TC });
  const l2 = ((e.stdout || "") + "\n" + (e.stderr || "")).split("\n").map((l) => l.trim()).find((l) => l && existsSync(l));
  if (l2) return l2;
  die("No Chrome found. Run: npx hyperframes browser ensure");
}

// Same page head as the render (style CSS, GSAP + plugins, kit, icons, beats), fonts from Google
// Fonts so measured text widths match the video.
function harnessHead(d, p) {
  const idx = readFileSync(join(d, "index.html"), "utf8");
  const head = (/<head>([\s\S]*?)<\/head>/.exec(idx) || [])[1] || "";
  // 3D stages build their scene but skip GPU drawing here (layout and cues only): software GL in
  // this headless page would take seconds per frame.
  return "<script>window.MO3D_HARNESS = true;</script>" + head;
}
// Each scene alone in a page with the same head as index.html (fonts, CSS, GSAP, kit), loaded
// from the project folder so relative asset paths resolve.
function sceneHarness(d, p, s, head, W, H) {
  const src = readFileSync(join(d, "compositions", s.id + ".html"), "utf8");
  const m = src.match(/<template>([\s\S]*)<\/template>/);
  const html = `<!doctype html><html><head>${head}<style>html,body{width:${W}px;height:${H}px;margin:0}</style></head>` +
    `<body data-style="${p.style}" data-ratio="${p.ratio.replace(":", "x")}"${p.voice && p.scenes.some((x) => x.vo) && p.captions !== false ? " data-captions" : ""}><script>window.__timelines={};</script>${m ? m[1] : src}</body></html>`;
  const f = join(d, ".motion-harness.html");
  writeFileSync(f, html);
  return "file://" + f.replace(/\\/g, "/");
}
async function withPage(d, p, fn) {
  const puppeteer = tcRequire()("puppeteer-core");
  const [W, H] = RATIOS[p.ratio];
  const browser = await puppeteer.launch({ executablePath: browserPath(), headless: true, args: ["--no-sandbox", "--disable-gpu", "--allow-file-access-from-files"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H });
    page.setDefaultNavigationTimeout(180000); page.setDefaultTimeout(180000); // 3D scenes build textures on load
    return await fn(page, harnessHead(d, p), W, H);
  } finally { await browser.close(); rmSync(join(d, ".motion-harness.html"), { force: true }); }
}

// Text that leaves the platform safe area, measured at a few moments of each scene.
async function safeAreaCheck(d, p) {
  const found = [];
  let fontsOk = true;
  const fams = fontFamilies(p.style);
  await withPage(d, p, async (page, head, W, H) => {
    const starts = sceneStarts(p);
    for (const s of p.scenes) {
      await page.goto(sceneHarness(d, p, s, head, W, H), { waitUntil: "load" });
      const ok = await page.evaluate(async (fams) => {
        const t = new Promise((r) => setTimeout(() => r("timeout"), 8000));
        await Promise.race([Promise.all(fams.flatMap((f) => ["400", "700", "900"].map((w) => document.fonts.load(`${w} 40px "${f}"`)))), t]);
        return fams.length === 0 || document.fonts.check(`400 40px "${fams[0]}"`);
      }, fams);
      if (!ok) fontsOk = false;
      // Fonts loaded after the scene script built its layout: rebuild with the right metrics.
      await page.goto(sceneHarness(d, p, s, head, W, H), { waitUntil: "load" });
      const idx = p.scenes.indexOf(s), oIn = s.overlap || 0, oOut = (p.scenes[idx + 1] || {}).overlap || 0;
      const res = await page.evaluate((id, D, rail, oIn, oOut) => {
        const tl = window.__timelines && window.__timelines[id];
        if (!tl) return [];
        const cs = getComputedStyle(document.body);
        const n = (v) => parseFloat(cs.getPropertyValue(v)) || 0;
        const box = { l: n("--safe-l"), r: innerWidth - n("--safe-r"), t: n("--safe-t"), b: innerHeight - n("--safe-b") };
        const out = [];
        // Sampled outside the overlap windows (a scene turning in a cube transition is not a layout).
        const times = [0.35, 0.6, 0.85].map((f) => +Math.min(Math.max(D * f, oIn + 0.05), D - oOut - 0.05).toFixed(2));
        if (id === "s1") times.unshift(0);
        for (const t of times) {
          tl.seek(t, false);
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode())) {
            const txt = node.textContent.trim();
            if (!txt || node.parentElement.closest("script,style,.mo-bg,[data-safe-ignore]")) continue;
            let el = node.parentElement, op = 1;
            while (el && el !== document.body) { op *= parseFloat(getComputedStyle(el).opacity); el = el.parentElement; }
            if (op < 0.2) continue;
            const r = document.createRange(); r.selectNodeContents(node);
            const rect = r.getBoundingClientRect();
            if (!rect.width) continue;
            // Fully off-canvas text (parked for a later move) is not a safe-area problem.
            if (rect.right < 0 || rect.left > innerWidth || rect.bottom < 0 || rect.top > innerHeight) continue;
            const slack = 4, sides = [];
            // 9:16: the like/share/comment rail covers the right 190 px from 50 % to 82 % of the height.
            const railR = rail && rect.bottom > innerHeight * 0.5 && rect.top < innerHeight * 0.82 ? innerWidth - 190 : box.r;
            if (rect.left < box.l - slack) sides.push("left " + Math.round(box.l - rect.left) + "px");
            if (rect.right > Math.min(box.r, railR) + slack) sides.push((railR < box.r ? "right, under the like/share rail " : "right ") + Math.round(rect.right - Math.min(box.r, railR)) + "px");
            if (rect.top < box.t - slack) sides.push("top " + Math.round(box.t - rect.top) + "px");
            if (rect.bottom > box.b + slack) sides.push("bottom " + Math.round(rect.bottom - box.b) + "px");
            if (sides.length) out.push({ t, text: txt.slice(0, 40), sides: sides.join(", ") });
          }
        }
        const seen = {};
        return out.filter((x) => (seen[x.text] ? false : (seen[x.text] = true)));
      }, s.id, s.duration, p.ratio === "9:16", oIn, oOut);
      res.forEach((x) => found.push(`${s.id} @${(starts[s.id] + x.t).toFixed(2)}s "${x.text}" outside the safe area (${x.sides})`));
    }
  });
  if (!fontsOk) say("  ⚠ safe-area check ran without web fonts (offline?): widths are approximate");
  return found;
}

// Run each scene once in headless Chrome and collect the cues the kit logged.
async function autoCues(d, p) {
  const out = [], problems = [];
  await withPage(d, p, async (page, head, W, H) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message || e)));
    const starts = sceneStarts(p);
    for (const s of p.scenes) {
      errors.length = 0;
      await page.goto(sceneHarness(d, p, s, head, W, H), { waitUntil: "load" });
      const info = await page.evaluate((id) => ({
        cues: window.MO ? window.MO.cues.slice() : [],
        tl: !!(window.__timelines && window.__timelines[id]),
        dur: window.__timelines && window.__timelines[id] ? window.__timelines[id].duration() : 0,
      }), s.id);
      if (errors.length) problems.push(`${s.id}.html throws: ${errors[0]}`);
      else if (!info.tl) problems.push(`${s.id}.html does not register window.__timelines["${s.id}"]`);
      else if (info.dur > s.duration + 0.05) say(`  ⚠ ${s.id}: motion lasts ${info.dur.toFixed(2)} s but the scene is ${s.duration} s: the end is cut`);
      info.cues.forEach((c) => { if (c.t < s.duration) out.push(Object.assign({}, c, { t: +(c.t + starts[s.id]).toFixed(3), scene: s.id })); });
    }
  });
  if (problems.length) { problems.forEach((m) => say("  ✗ " + m)); die("Fix the scene script(s) above before rendering."); }
  return out;
}

const PRIORITY = { boom: 10, impact: 9, error: 8, ding: 7, shimmer: 7, glitch: 6, riser: 6, swell: 5, whoosh: 5, sparkle: 4, typing: 4,
  scribble: 3, swish: 3, paper: 3, pop: 3, tick: 2, click: 1 };
function thin(cues) {
  const sorted = cues.slice().sort((a, b) => a.t - b.t || (PRIORITY[b.sfx] || 0) - (PRIORITY[a.sfx] || 0));
  const kept = [];
  for (const c of sorted) {
    if (c.manual) { kept.push(c); continue; }
    if (c.sfx === "whoosh" && kept.some((k) => k.sfx === "whoosh" && Math.abs(k.t - c.t) < 0.5)) continue;
    if ((c.sfx === "impact" || c.sfx === "boom") && kept.some((k) => (k.sfx === "impact" || k.sfx === "boom") && Math.abs(k.t - c.t) < 0.8)) continue;
    if ((PRIORITY[c.sfx] || 0) <= 3 && kept.some((k) => Math.abs(k.t - c.t) < 0.14)) continue;
    if ((c.sfx === "typing" || c.sfx === "scribble") && kept.some((k) => k.sfx === c.sfx && k.t + (k.dur || 1) > c.t)) continue;
    kept.push(c);
  }
  return kept;
}

// ---------- WAV io and mixing ----------
function readWav(f) {
  const b = readFileSync(f);
  let o = 12, fmt = null, data = null;
  while (o + 8 <= b.length) {
    const id = b.toString("ascii", o, o + 4), len = b.readUInt32LE(o + 4);
    if (id === "fmt ") fmt = { ch: b.readUInt16LE(o + 10), sr: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) };
    if (id === "data") data = b.subarray(o + 8, o + 8 + len);
    o += 8 + len + (len % 2);
  }
  if (!fmt || !data || fmt.bits !== 16 || fmt.sr !== 48000) die(`${f}: expected a 16-bit 48 kHz WAV`);
  const n = Math.floor(data.length / (2 * fmt.ch)), L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    L[i] = data.readInt16LE(i * 2 * fmt.ch) / 32768;
    R[i] = fmt.ch > 1 ? data.readInt16LE(i * 2 * fmt.ch + 2) / 32768 : L[i];
  }
  return { L, R };
}
function writeWav(f, L, R) {
  const n = L.length, data = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), i * 4 + 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(48000, 24); h.writeUInt32LE(192000, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(f, Buffer.concat([h, data]));
}
// Any audio file -> 48 kHz stereo WAV, trimmed/padded to `dur`.
function toWav48(src, dst, dur) {
  const r = run(bins().ffmpeg, ["-y", "-v", "error", "-i", src, "-ac", "2", "-ar", "48000", "-af", `apad,atrim=0:${dur}`, "-c:a", "pcm_s16le", dst]);
  if (r.status !== 0) die(`could not read audio ${src}: ${(r.stderr || "").split("\n").slice(-3).join(" ")}`);
}

// Voice-over is regenerated only when the voice settings, lines or timings change.
async function voiceOver(d, p, quiet) {
  const lines = p.scenes.filter((s) => s.vo && s.vo.trim());
  const out = join(d, "assets", "audio", "vo.wav");
  const hashFile = join(d, "assets", "audio", ".vo-hash");
  if (!p.voice || !lines.length) { if (existsSync(out)) rmSync(out); rmSync(join(d, "assets", "mo", "vo.js"), { force: true }); rmSync(hashFile, { force: true }); return null; }
  const key = JSON.stringify([p.voice, p.lang, totalDuration(p), p.scenes.map((s) => [s.id, s.duration, s.vo, s.say, s.voAt])]);
  if (existsSync(out) && existsSync(join(d, "assets", "mo", "vo.js")) && existsSync(hashFile) && readFileSync(hashFile, "utf8") === key) {
    if (!quiet) say("✓ voice-over: unchanged");
    return out;
  }
  if (!existsSync(join(dirname(TC), "models", "kokoro-int8-multi-lang-v1_0", "model.int8.onnx"))) say("Downloading the voice model once (~130 MB, about a minute)...");
  const starts = sceneStarts(p);
  const job = join(d, "assets", "audio", ".vo-job.json"), outJson = join(d, "assets", "audio", ".vo-result.json");
  writeFileSync(job, JSON.stringify({ TC, p, total: totalDuration(p), audioDir: join(d, "assets", "audio"), ffmpeg: bins().ffmpeg, out: outJson,
    lines: lines.map((s) => ({ id: s.id, text: s.vo, say: s.say, sceneStart: starts[s.id], at: starts[s.id] + (s.voAt != null ? s.voAt : 0.25), max: s.duration - (s.voAt != null ? s.voAt : 0.25) })) }));
  const r = spawnSync(process.execPath, [join(HERE, "voice.mjs"), "worker", job], { encoding: "utf8", maxBuffer: 1 << 26 });
  let res = null;
  try { res = JSON.parse(readFileSync(outJson, "utf8")); } catch {}
  rmSync(job, { force: true }); rmSync(outJson, { force: true });
  if (!res || res.error) die("voice-over: " + ((res && res.error) || (r.stderr || "").split("\n").filter(Boolean).slice(-5).join(" ")));
  const cps = [...new Set([...(r.stderr || "").matchAll(/codepoint: \\U\+([0-9a-fA-F]+)/g)].map((m) => String.fromCodePoint(parseInt(m[1], 16))))];
  if (cps.length) say(`  ⚠ the voice skipped these characters: ${cps.map((c) => JSON.stringify(c)).join(" ")} (harmless for punctuation; write symbols, codes and URLs in words in "say")`);
  res.warnings.forEach((w) => say("  ⚠ " + w));
  // Word timings per scene (scene-local), for MO.captions(tl, "#sN-cap", MO_VO.sN).
  writeFileSync(join(d, "assets", "mo", "vo.js"), "window.MO_VO = " + JSON.stringify(res.words) + ";\n");
  writeFileSync(hashFile, key);
  say(`✓ voice-over: ${lines.length} line(s), voice ${res.voice}`);
  res.report.forEach((r) => say(`  ${r.id}: speech ${r.talk}s of ${r.room}s available${r.talk > r.room - 0.3 ? "  ✗ too long" : ""}`));
  return out;
}

async function sound(dPath) {
  const d = projectDir(dPath || positional(0));
  let p = sync(d);
  const total = totalDuration(p), n = Math.ceil(total * 48000);
  const audioDir = join(d, "assets", "audio");
  const mix = join(audioDir, "mix.wav");
  if (p.sound === "none" && !musicSpec(p) && !p.voice) { if (existsSync(mix)) rmSync(mix); say("✓ sound: none"); sync(d); return; }
  // 1. Voice first: its word timings feed captions, and it ducks the music.
  const voFile = await voiceOver(d, p);
  p = sync(d);
  // 2. Effects from the kit's cues (+ cues.json).
  const manual = existsSync(join(d, "cues.json")) ? JSON.parse(readFileSync(join(d, "cues.json"), "utf8")) : [];
  let cues = manual.map((c) => Object.assign({ manual: true }, c));
  if (p.sound === "auto") cues = thin((await autoCues(d, p)).concat(cues));
  if (p.sound === "none") cues = [];
  writeFileSync(join(d, "cues.auto.json"), JSON.stringify(cues, null, 1) + "\n");
  const sfxFile = join(audioDir, "sfx.wav");
  if (cues.length) {
    const res = renderCues(cues, total, sfxFile, 7);
    res.problems.forEach((m) => say("  ✗ " + m));
    if (res.problems.length) die("Fix cues.json (types: " + SFX_TYPES.join(", ") + ")");
    const by = {};
    cues.forEach((c) => { by[c.sfx] = (by[c.sfx] || 0) + 1; });
    say(`✓ effects: ${cues.length} sounds (${Object.keys(by).map((k) => by[k] + " " + k).join(", ")})`);
    if (cues.length / total > 2) say("  ⚠ more than 2 sounds per second: busy. Mute some helpers with { sfx: false }.");
    if ((by.impact || 0) > Math.max(2, total / 4)) say(`  ⚠ ${by.impact} impacts in ${total} s: sounds like a drum machine. Keep impacts for the hook and the big reveal ({ sfx: false } on the others).`);
  } else if (existsSync(sfxFile)) rmSync(sfxFile);
  // 3. Music: generated for a mood, or a file.
  const m = musicSpec(p);
  const musFile = join(audioDir, "music.wav");
  if (m && m.mood) {
    const hits = (p.scenes.filter((s) => s.hit).map((s) => sceneStarts(p)[s.id]));
    const info = renderMusic({ mood: m.mood, duration: total, bpm: m.bpm, seed: m.seed, key: m.key, hits, out: musFile });
    say(`✓ music: ${m.mood}, ${info.bpm} bpm, bar ${info.bar.toFixed(2)} s, resolves at ${info.endAt}s`);
  } else if (m && m.file) {
    const src = resolve(d, m.file);
    if (!existsSync(src)) die(`music file not found: ${src}`);
    toWav48(src, musFile, total);
    say(`✓ music: ${basename(src)}`);
  } else if (existsSync(musFile)) rmSync(musFile);
  // 4. Mix: music bed under effects, ducked under the voice.
  const L = new Float32Array(n), R = new Float32Array(n);
  const add = (f, g, duckBy) => {
    if (!f || !existsSync(f)) return;
    const w = readWav(f);
    for (let i = 0; i < n && i < w.L.length; i++) { const k = duckBy ? g * duckBy[i] : g; L[i] += w.L[i] * k; R[i] += w.R[i] * k; }
  };
  let duck = null;
  if (voFile && existsSync(voFile)) {
    const v = readWav(voFile);
    duck = new Float32Array(n).fill(1);
    let env = 0;
    const att = Math.exp(-1 / (0.03 * 48000)), rel = Math.exp(-1 / (0.35 * 48000));
    for (let i = 0; i < n; i++) {
      const x = i < v.L.length ? Math.abs(v.L[i]) + Math.abs(v.R[i]) : 0;
      env = x > env ? att * env + (1 - att) * x : rel * env + (1 - rel) * x;
      duck[i] = 1 - 0.68 * Math.min(1, env * 8); // about -10 dB under speech
    }
  }
  const musicGain = 0.42 * (m && m.volume != null ? m.volume : 0.8) / 0.8;
  add(existsSync(musFile) ? musFile : null, musicGain, duck);
  add(existsSync(sfxFile) ? sfxFile : null, voFile ? 0.55 : 0.8, null);
  add(voFile, 1.0, null);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  if (peak === 0) { if (existsSync(mix)) rmSync(mix); say("⚠ No sound at all: the video will be silent."); sync(d); return; }
  const g = 0.89 / peak; // linear: the final render's limiter handles true peaks
  for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; }
  writeWav(mix, L, R);
  say(`✓ mix.wav: ${[voFile && "voice", existsSync(musFile) && "music", cues.length && "effects"].filter(Boolean).join(" + ")}, ${total}s`);
  sync(d);
}

function beats() {
  const d = projectDir(positional(0));
  const p = readProject(d);
  const m = musicSpec(p);
  if (!m || !m.mood) die("No generated music in project.json (music.mood): no beat grid.");
  const total = totalDuration(p);
  const gr = beatGrid(m.mood, total, m.bpm);
  say(`${m.mood}: ${gr.bpm} bpm · beat ${gr.beat.toFixed(3)} s · bar ${gr.bar.toFixed(3)} s`);
  const st = sceneStarts(p);
  let tn = 0;
  p.scenes.forEach((s, i) => {
    const half = gr.bar / 2;
    const snapped = +(Math.max(1, Math.round(s.duration / half)) * half).toFixed(3);
    if (i) tn -= s.overlap || 0;
    say(`  ${s.id}: now ${s.duration}s (starts ${st[s.id].toFixed(2)}s) → suggested ${snapped}s (${+(snapped / gr.bar).toFixed(1)} bars, starts ${tn.toFixed(2)}s)`);
    tn += snapped;
  });
  say(`  total now ${total}s → suggested ${tn.toFixed(2)}s. With a voice-over, keep the lengths the voice needs.`);
  say("  Cuts on bar lines land on the downbeat. In scenes, MO.snap(\"sN\", t) moves a hit to the nearest beat.");
}

function musicPreview() {
  const mood = positional(0);
  if (!MOOD_NAMES.includes(mood)) die(`Usage: music <${MOOD_NAMES.join("|")}> [--duration 20] [--out file.wav]`);
  const out = resolve(opt("out", `music-${mood}.wav`));
  const info = renderMusic({ mood, duration: +opt("duration", "20"), bpm: opt("bpm") ? +opt("bpm") : undefined, seed: opt("seed") ? +opt("seed") : undefined, out });
  say(`✓ ${out} · ${info.bpm} bpm · bar ${info.bar.toFixed(2)} s`);
}

async function voices() {
  const { listVoices } = await import("./voice.mjs");
  listVoices(opt("lang", null)).forEach((l) => say(l));
}

function probe(file) {
  const r = run(bins().ffprobe, ["-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate", "-of", "json", file]);
  try { return JSON.parse(r.stdout); } catch { return null; }
}

function verify(file, expect, expectAudio) {
  if (!existsSync(file)) die("No file " + file);
  const j = probe(file);
  if (!j) die("ffprobe could not read " + file);
  const v = (j.streams || []).find((s) => s.codec_type === "video");
  const a = (j.streams || []).find((s) => s.codec_type === "audio");
  const dur = +(j.format && j.format.duration);
  const problems = [];
  if (!v) problems.push("no video stream");
  if (expectAudio && !a) problems.push("no audio stream (sound is on in project.json: run motion sound and check)");
  if (expect && Math.abs(dur - expect) > 0.1) problems.push(`duration ${dur.toFixed(2)}s, expected ${expect}s`);
  const ff = bins().ffmpeg;
  const bd = run(ff, ["-hide_banner", "-i", file, "-vf", "blackdetect=d=0.4:pix_th=0.03", "-an", "-f", "null", "-"]);
  const blacks = ((bd.stderr || "").match(/black_start:[\d.]+ black_end:[\d.]+/g) || []);
  if (blacks.length) problems.push("black segments: " + blacks.join("; ") + " (fine only if the style is dark and the frame is intentionally empty)");
  let vol = null, lufs = null;
  if (a) {
    const vd = run(ff, ["-hide_banner", "-i", file, "-af", "volumedetect,ebur128", "-vn", "-f", "null", "-"]);
    const m = (vd.stderr || "").match(/max_volume: (-?[\d.]+) dB/);
    vol = m ? +m[1] : null;
    const l = [...(vd.stderr || "").matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop();
    lufs = l ? +l[1] : null;
    if (vol != null && vol < -50) problems.push("audio track is silent");
  }
  const size = (statSync(file).size / 1048576).toFixed(1);
  say(`${problems.length ? "✗" : "✓"} ${file}`);
  say(`  ${v ? `${v.codec_name} ${v.width}x${v.height} ${v.r_frame_rate}` : "no video"} · ${dur.toFixed(2)} s · ${a ? `audio ${a.codec_name}${lufs != null ? ` ${lufs} LUFS` : ""}${vol != null ? ` peak ${vol} dB` : ""}` : "no audio"} · ${size} MB`);
  problems.forEach((m) => say("  ✗ " + m));
  if (problems.length) process.exitCode = 1;
  return problems.length === 0;
}

function render(d, quality, out, extra = []) {
  mkdirSync(dirname(out), { recursive: true });
  say(`Rendering (${quality})...`);
  const t0 = Date.now();
  const r = hf(d, ["render", "--quality", quality, "-o", out, "--quiet", ...extra], { stdio: ["ignore", "pipe", "pipe"] });
  if (r.status !== 0 || !existsSync(out)) {
    say(((r.stdout || "") + (r.stderr || "")).split("\n").slice(-30).join("\n"));
    die("render failed");
  }
  say(`  done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

function hasSound(d, p) { return p.sound !== "none" || !!musicSpec(p) || !!p.voice; }

async function draft() {
  const d = projectDir(positional(0));
  await sound(d);
  const p = sync(d);
  const out = join(d, "renders", "draft.mp4");
  render(d, "draft", out);
  verify(out, totalDuration(p), hasSound(d, p) && existsSync(join(d, "assets", "audio", "mix.wav")));
}

async function finalRender() {
  const d = projectDir(positional(0));
  if (!flag("skip-check")) {
    // Never spend a long render on a project with known errors.
    const r = spawnSync(process.execPath, [ME, "check", d], { encoding: "utf8" });
    const first = (r.stdout || "").split("\n")[0];
    if (r.status !== 0) { say((r.stdout || "").split("\n").slice(0, 20).join("\n")); die("check has errors: fix them first (or --skip-check)."); }
    say(first);
  }
  await sound(d);
  const p = sync(d);
  if (FONTS_MISSING.length && !flag("allow-font-fallback")) die(`style fonts not embedded (${FONTS_MISSING.join(", ")}): the video would use a generic font. Run once with network, or pass --allow-font-fallback.`);
  const total = totalDuration(p);
  const raw = join(d, "renders", ".raw.mp4");
  render(d, "delivery", raw, ["--workers", "1"]);
  const name = opt("name", (p.title || "video").replace(/[^a-zA-Z0-9-_]+/g, "-").toLowerCase());
  const out = join(d, "renders", name + ".mp4");
  const cliMusic = opt("music", null);
  const music = cliMusic ? resolve(cliMusic) : null;
  if (music && !existsSync(music)) die(`Music file not found: ${music}`);
  const ff = bins().ffmpeg;
  const hasAudio = !!(probe(raw).streams || []).find((s) => s.codec_type === "audio");
  let argv;
  if (music) {
    const fadeOut = Math.max(0, total - 2);
    const mus = `[1:a]atrim=0:${total},afade=t=in:d=1,afade=t=out:st=${fadeOut}:d=2,volume=0.22[m]`;
    argv = hasAudio
      ? ["-y", "-i", raw, "-i", music, "-filter_complex", `${mus};[0:a][m]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1:LRA=11,alimiter=limit=0.84:level=false[a]`, "-map", "0:v", "-map", "[a]"]
      : ["-y", "-i", raw, "-i", music, "-filter_complex", `${mus};[m]loudnorm=I=-14:TP=-1:LRA=11,alimiter=limit=0.84:level=false[a]`, "-map", "0:v", "-map", "[a]"];
  } else if (hasAudio) {
    // Music or voice: platform target -14 LUFS. Effects only: a little quieter.
    const I = musicSpec(p) || p.voice ? "-14" : "-16";
    argv = ["-y", "-i", raw, "-af", `loudnorm=I=${I}:TP=-1.5:LRA=11,alimiter=limit=0.84:level=false`, "-map", "0:v", "-map", "0:a"];
  } else {
    argv = ["-y", "-i", raw, "-map", "0:v"];
  }
  argv = twoPassLoudnorm(ff, argv);
  argv.push("-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", "-t", String(total), out);
  const r = run(ff, argv);
  if (r.status !== 0) { say((r.stderr || "").split("\n").slice(-15).join("\n")); die("audio finishing failed"); }
  rmSync(raw, { force: true });
  // Poster: the hook frame reads best as a thumbnail; --poster-at overrides.
  const posterAt = opt("poster-at", null) != null ? +opt("poster-at") : Math.min(1.2, p.scenes[0].duration * 0.5);
  run(ff, ["-y", "-v", "error", "-ss", String(posterAt), "-i", out, "-frames:v", "1", join(d, "renders", name + "-poster.png")]);
  verify(out, total, hasAudio || !!music);
  say(`  poster: ${join(d, "renders", name + "-poster.png")}`);
}

function frames() {
  const file = resolve(positional(0) || "");
  if (!existsSync(file)) die("Usage: frames <file.mp4> --at 1.5,4,9");
  const at = (opt("at", "1") || "1").split(",").map(Number);
  const out = join(dirname(file), "frames");
  mkdirSync(out, { recursive: true });
  const files = [];
  at.forEach((t) => {
    const f = join(out, `frame-${t}s.png`);
    run(bins().ffmpeg, ["-y", "-v", "error", "-ss", String(t), "-i", file, "-frames:v", "1", f]);
    if (existsSync(f)) files.push(f);
    say("  " + f);
  });
  if (files.length > 1) {
    const per = 3, rows = Math.ceil(files.length / per);
    const vs = (probe(file).streams || []).find((x) => x.codec_type === "video") || { width: 16, height: 9 };
    const th = Math.round((640 * vs.height) / vs.width / 2) * 2;
    let fc = files.map((_, i) => `[${i}]scale=640:${th}[s${i}]`).join(";");
    for (let i = files.length; i < rows * per; i++) fc += `;color=c=0x808080:s=640x${th}:d=1[s${i}]`;
    const rowLabels = [];
    for (let r = 0; r < rows; r++) { fc += `;${Array.from({ length: per }, (_, k) => `[s${r * per + k}]`).join("")}hstack=${per}[r${r}]`; rowLabels.push(`[r${r}]`); }
    fc += rows > 1 ? `;${rowLabels.join("")}vstack=${rows}[out]` : `;[r0]null[out]`;
    const sheet = join(out, "sheet.png");
    run(bins().ffmpeg, ["-y", "-v", "error", ...files.flatMap((f) => ["-i", f]), "-filter_complex", fc, "-map", "[out]", "-frames:v", "1", sheet]);
    if (existsSync(sheet)) say("  sheet: " + sheet);
  }
}

// Measure with a first loudnorm pass, then apply the measured values linearly, so sparse
// tracks are not pumped by the one-pass dynamic mode.
function twoPassLoudnorm(ff, argv) {
  const s = argv.join("\u0000");
  const m = /loudnorm=I=(-?[\d.]+):TP=(-?[\d.]+):LRA=([\d.]+)/.exec(s);
  if (!m) return argv;
  const target = `loudnorm=I=${m[1]}:TP=${m[2]}:LRA=${m[3]}`;
  const measureArgv = argv.map((a) => a.replace(target, target + ":print_format=json"));
  const probeArgv = [];
  for (let i = 0; i < measureArgv.length; i++) {
    if (measureArgv[i] === "-y") continue;
    if (measureArgv[i] === "-map" && measureArgv[i + 1] === "0:v") { i++; continue; }
    probeArgv.push(measureArgv[i]);
  }
  const r = run(ff, ["-hide_banner", ...probeArgv, "-f", "null", "-"]);
  const j = /\{[\s\S]*"input_i"[\s\S]*?\}/.exec(r.stderr || "");
  if (!j) return argv;
  let mv;
  try { mv = JSON.parse(j[0]); } catch { return argv; }
  if (!isFinite(+mv.input_i)) return argv;
  const applied = `${target}:measured_I=${mv.input_i}:measured_TP=${mv.input_tp}:measured_LRA=${mv.input_lra}:measured_thresh=${mv.input_thresh}:offset=${mv.target_offset}:linear=true`;
  return argv.map((a) => a.replace(target, applied));
}

// ---------- icons ----------
// Iconify sets bundled in the toolchain (permissive licences only):
//   lucide:<n> (default, ISC) · tabler:<n> (MIT) · ph:<n> Phosphor (MIT, ph:<n>-fill / -duotone)
//   emoji:<n> Noto colour emoji (Apache-2.0, e.g. emoji:croissant) · flag:<cc> circle flags (MIT)
//   brand:<n> Simple Icons (CC0; logos stay trademarks of their owners)
// Saved as window.MO_ICONS[key] = { svg }.
const ICON_SETS = { lucide: "lucide", tabler: "tabler", ph: "ph", emoji: "noto", flag: "circle-flags" };
const iconSetCache = {};
function iconSvg(spec) {
  const req = tcRequire();
  let [lib, name] = spec.includes(":") ? spec.split(/:(.*)/s) : ["lucide", spec];
  name = (name || "").trim().toLowerCase().replace(/\s+/g, "-");
  if (lib === "brand") {
    const si = req("simple-icons");
    const all = Object.values(si).filter((x) => x && x.slug);
    const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
    const key = norm(name);
    const hit = all.find((x) => x.slug === key) || all.find((x) => norm(x.title) === key);
    if (!hit) return { near: all.filter((x) => x.slug.includes(key)).slice(0, 6).map((x) => "brand:" + x.slug), brand: true };
    return { key: "brand-" + hit.slug, svg: `<svg viewBox="0 0 24 24" fill="#${hit.hex}"><path d="${hit.path}"/></svg>`, title: hit.title, color: "#" + hit.hex };
  }
  const setName = ICON_SETS[lib];
  if (!setName) return { near: [], bad: `unknown icon library "${lib}" (use ${Object.keys(ICON_SETS).join(":, ")}: or brand:)` };
  if (!iconSetCache[setName]) iconSetCache[setName] = JSON.parse(readFileSync(join(dirname(req.resolve(`@iconify-json/${setName}/package.json`)), "icons.json"), "utf8"));
  const set = iconSetCache[setName];
  const { getIconData, iconToSVG, iconToHTML, replaceIDs } = req("@iconify/utils");
  const data = getIconData(set, name);
  if (!data) {
    const all = Object.keys(set.icons).concat(Object.keys(set.aliases || {}));
    const parts = name.split("-");
    const near = all.filter((x) => x.includes(name) || parts.every((p) => x.includes(p))).slice(0, 8);
    return { near: near.map((x) => (lib === "lucide" ? x : lib + ":" + x)) };
  }
  const r = iconToSVG(data, { height: "1em" });
  const svg = iconToHTML(replaceIDs(r.body, (lib + "-" + name).replace(/[^a-z0-9-]/g, "") + "-"), Object.assign({}, r.attributes, { width: "100%", height: "100%" }));
  return { key: lib === "lucide" ? name : lib + "-" + name, svg };
}

// Open Peeps characters (CC0 artwork by Pablo Stanley, via DiceBear). Same seed, same person.
async function personSvg(seed, o) {
  const req = tcRequire();
  const core = req("@dicebear/core"), peeps = req("@dicebear/open-peeps");
  const style = peeps.default || peeps;
  const opts = { seed, backgroundColor: ["transparent"], facialHairProbability: o.beard ? 100 : 0, accessoriesProbability: 10 };
  if (o.mood) opts.face = { happy: ["smile", "smileBig", "smileTeeth", "cute"], calm: ["calm", "solemn", "serious"], sad: ["cry", "tired", "concerned"], surprised: ["awe", "eatingHappy", "contempt"] }[o.mood];
  if (o.skin) opts.skinColor = [o.skin.replace("#", "")];
  const svg = core.createAvatar(style, opts).toString();
  return svg.replace(/<svg /, '<svg width="100%" height="100%" ');
}

async function icon() {
  const names = args.slice(1).filter((a, i, arr) => !a.startsWith("--") && arr[i - 1] !== "--project");
  if (!names.length) die("Usage: icon <name> [name...] [--project <dir>]   e.g. icon rocket heart tabler:chef-hat brand:spotify --project .");
  const found = {};
  for (const n of names) {
    if (n.startsWith("person:")) {
      const seed = n.slice(7) || "person";
      found["person-" + seed.toLowerCase().replace(/[^a-z0-9-]/g, "")] = { svg: await personSvg(seed, { mood: opt("mood", null), beard: flag("beard") }) };
      say(`✓ ${n} → MO_ICONS["person-${seed.toLowerCase().replace(/[^a-z0-9-]/g, "")}"] (Open Peeps, CC0)`);
      continue;
    }
    const r = iconSvg(n);
    if (!r.svg) {
      say(`✗ ${n}: ${r.bad || "not found"}${r.near && r.near.length ? ` (did you mean: ${r.near.join(", ")}?)` : ""}${r.brand ? ". Brands missing from Simple Icons (AWS, Azure, most Microsoft): use a label." : ""}`);
      continue;
    }
    found[r.key] = { svg: r.svg };
    say(`✓ ${n} → MO_ICONS["${r.key}"]${r.title ? ` (${r.title}, ${r.color})` : ""}`);
  }
  const proj = opt("project", null);
  if (proj) {
    const d = projectDir(proj);
    const f = join(d, "assets", "mo", "icons.js");
    let cur = {};
    if (existsSync(f)) { try { cur = JSON.parse(readFileSync(f, "utf8").replace(/^[^{]*/, "").replace(/;\s*$/, "")); } catch {} }
    Object.assign(cur, found);
    writeFileSync(f, "window.MO_ICONS = " + JSON.stringify(cur) + ";\n");
    sync(d);
    say(`  saved to ${f}: <span class="mo-icon" data-icon="<key>"></span> + MO.icons(), or icon: "<key>" in MO.diagram`);
  } else if (Object.keys(found).length) say("  (add --project <dir> to save them for the scenes)");
}

switch (cmd) {
  case "doctor": doctor(); break;
  case "setup": setup(); break;
  case "new": newProject(); break;
  case "sync": { const d = projectDir(positional(0)); sync(d); say("✓ index.html rebuilt from project.json"); break; }
  case "check": await check(); break;
  case "stills": await stills(); break;
  case "beats": beats(); break;
  case "sound": await sound(); break;
  case "music": musicPreview(); break;
  case "voices": await voices(); break;
  case "draft": await draft(); break;
  case "final": await finalRender(); break;
  case "verify": verify(resolve(positional(0) || ""), opt("duration") ? +opt("duration") : null, false); break;
  case "icon": await icon(); break;
  case "frames": frames(); break;
  default:
    { const ls = readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1); say(ls.slice(0, ls.findIndex((l) => !l.startsWith("//"))).map((l) => l.replace(/^\/\/ ?/, "")).join("\n")); }
    if (cmd) process.exitCode = 1;
}
