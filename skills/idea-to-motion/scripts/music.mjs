// Procedural background music for idea-to-motion. No samples, no licences: a seeded
// arranger writes chords, bass, drums and a lead for a mood, and a small synth renders them.
// The same { mood, bpm, seed, duration } always gives the same WAV.
//
// renderMusic({ mood: "upbeat", duration: 30, bpm?, seed?, key?, hits?: [t...], out })
//   -> { bpm, bar, beats: [t...], downbeats: [t...] }
// Moods: upbeat, chill, epic, playful, tense, elegant, energetic, warm, none

import { writeFileSync } from "node:fs";

const SR = 48000;

function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------- moods ----------
// prog: chord roots as scale degrees (0-6) with quality from the scale; one chord per bar.
// drums: pattern per 16th step (k = kick, s = snare/clap, h = hat, o = open hat).
export const MOODS = {
  upbeat:    { bpm: 116, scale: "major", key: 60, progs: [[0, 4, 5, 3], [5, 3, 0, 4], [0, 5, 3, 4]], pad: "saw", lead: "pluck", bass: "eighths",
               drums: { k: "x...x...x...x...", s: "....x.......x...", h: "..x...x...x...x." }, swing: 0, bright: 0.7 },
  energetic: { bpm: 126, scale: "minor", key: 57, progs: [[0, 5, 2, 6], [0, 3, 5, 4]], pad: "saw", lead: "arp", bass: "offbeat",
               drums: { k: "x...x...x...x...", s: "....x.......x...", h: "..x...x...x...x.", o: "......x.......x." }, swing: 0, bright: 0.85 },
  chill:     { bpm: 84, scale: "major", key: 62, progs: [[1, 4, 0, 5], [3, 2, 1, 0]], seventh: true, pad: "keys", lead: "keys", bass: "roots",
               drums: { k: "x......x..x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." }, swing: 0.18, bright: 0.35, lofi: true },
  epic:      { bpm: 92, scale: "minor", key: 50, progs: [[0, 5, 2, 6], [0, 6, 5, 6]], pad: "strings", lead: "brass", bass: "long",
               drums: { k: "x.......x.x.....", s: "........x.......", h: "" }, toms: true, swing: 0, bright: 0.55 },
  playful:   { bpm: 128, scale: "major", key: 65, progs: [[0, 3, 4, 0], [0, 5, 3, 4]], pad: "none", lead: "marimba", bass: "bouncy",
               drums: { k: "x.....x...x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." }, swing: 0.1, bright: 0.8 },
  tense:     { bpm: 100, scale: "minor", key: 52, progs: [[0, 0, 5, 4], [0, 1, 0, 6]], pad: "dark", lead: "pulse", bass: "pulse16",
               drums: { k: "x.......x.......", s: "............x...", h: "x.xxx.xxx.xxx.xx" }, swing: 0, bright: 0.4 },
  elegant:   { bpm: 88, scale: "major", key: 63, progs: [[0, 5, 3, 4], [3, 4, 2, 5]], seventh: true, pad: "strings", lead: "keys", bass: "roots",
               drums: { k: "x.........x.....", s: "", h: "....x.......x..." }, swing: 0.08, bright: 0.45 },
  warm:      { bpm: 96, scale: "major", key: 60, progs: [[0, 4, 5, 3], [3, 0, 4, 5]], pad: "keys", lead: "pluck", bass: "roots",
               drums: { k: "x.......x.......", s: "....x.......x...", h: "..x...x...x...x." }, swing: 0.1, bright: 0.5 },
};
export const MOOD_NAMES = Object.keys(MOODS);

const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
function chord(m, deg, seventh) {
  const sc = SCALES[m.scale];
  const notes = [0, 2, 4].concat(seventh ? [6] : []).map((i) => {
    const d = deg + i;
    return m.key + sc[d % 7] + 12 * Math.floor(d / 7);
  });
  return notes;
}

// ---------- DSP ----------
function biquad(type, f, q) {
  f = Math.min(f, SR * 0.45);
  const w = (2 * Math.PI * f) / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === "bp") { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === "hp") { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
function filt() { return { x1: 0, x2: 0, y1: 0, y2: 0 }; }
function run(st, k, x) {
  const y = k[0] * x + k[1] * st.x1 + k[2] * st.x2 - k[3] * st.y1 - k[4] * st.y2;
  st.x2 = st.x1; st.x1 = x; st.y2 = st.y1; st.y1 = y;
  return y;
}
function adsr(t, len, a, d, s, r) {
  if (t < 0) return 0;
  let v = t < a ? t / a : t < a + d ? 1 - (1 - s) * ((t - a) / d) : s;
  if (t > len) v *= Math.max(0, 1 - (t - len) / r);
  return v;
}

// A bus is a pair of Float32Arrays; notes are mixed in with a pan.
function bus(n) { return { L: new Float32Array(n), R: new Float32Array(n) }; }
function put(b, i, v, pan) {
  if (i < 0 || i >= b.L.length) return;
  b.L[i] += v * Math.cos(((pan + 1) * Math.PI) / 4);
  b.R[i] += v * Math.sin(((pan + 1) * Math.PI) / 4);
}

// Instruments write into a bus at time t (s) for len (s).
const INST = {
  kick(b, t, g) {
    const n = Math.round(0.42 * SR), s0 = Math.round(t * SR);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const u = i / SR, f = 48 + 110 * Math.exp(-u / 0.035);
      ph += (2 * Math.PI * f) / SR;
      const v = Math.tanh(Math.sin(ph) * 1.6) * Math.exp(-u / 0.16) + (i < 60 ? (1 - i / 60) * 0.3 : 0);
      put(b, s0 + i, v * g, 0);
    }
  },
  snare(b, t, g, r, clap) {
    const n = Math.round(0.25 * SR), s0 = Math.round(t * SR), st = filt(), k = biquad("bp", clap ? 1400 : 2200, 0.7);
    for (let i = 0; i < n; i++) {
      const u = i / SR;
      let env = Math.exp(-u / (clap ? 0.06 : 0.07));
      if (clap) env *= u < 0.03 ? [1, 0.3, 1, 0.3, 1][Math.floor(u / 0.006)] || 1 : 1;
      const tone = clap ? 0 : Math.sin(2 * Math.PI * 190 * u) * Math.exp(-u / 0.03) * 0.5;
      put(b, s0 + i, (run(st, k, r() * 2 - 1) * 1.3 + tone) * env * g, 0.05);
    }
  },
  hat(b, t, g, r, open) {
    const n = Math.round((open ? 0.22 : 0.05) * SR), s0 = Math.round(t * SR), st = filt(), k = biquad("hp", 7500, 0.8);
    for (let i = 0; i < n; i++) {
      const u = i / SR, env = Math.exp(-u / (open ? 0.08 : 0.014));
      put(b, s0 + i, run(st, k, r() * 2 - 1) * env * g * 0.8, 0.25);
    }
  },
  tom(b, t, g, pitch) {
    const n = Math.round(0.6 * SR), s0 = Math.round(t * SR);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const u = i / SR, f = pitch * (1 + 0.6 * Math.exp(-u / 0.05));
      ph += (2 * Math.PI * f) / SR;
      put(b, s0 + i, Math.tanh(Math.sin(ph) * 1.4) * Math.exp(-u / 0.22) * g, -0.15);
    }
  },
  // Sub-heavy bass: two saws through a low-pass, short release.
  bass(b, t, len, note, g, bright) {
    const n = Math.round((len + 0.08) * SR), s0 = Math.round(t * SR), st = filt();
    const f = midiHz(note);
    let p1 = 0, p2 = 0;
    for (let i = 0; i < n; i++) {
      const u = i / SR;
      p1 = (p1 + f / SR) % 1; p2 = (p2 + (f * 1.004) / SR) % 1;
      const raw = (2 * p1 - 1) * 0.5 + (2 * p2 - 1) * 0.3 + Math.sin(2 * Math.PI * p1) * 0.7;
      const k = biquad("lp", 180 + 900 * bright * Math.exp(-u / 0.12), 0.9);
      put(b, s0 + i, run(st, k, raw) * adsr(u, len, 0.005, 0.1, 0.8, 0.06) * g, 0);
    }
  },
  // Detuned saw pad, slow attack.
  pad(b, t, len, notes, g, bright, kind) {
    const n = Math.round((len + 0.6) * SR), s0 = Math.round(t * SR);
    const voices = [];
    notes.forEach((m, j) => [-0.12, 0, 0.11].forEach((det, d) => voices.push({ f: midiHz(m + (kind === "strings" ? 12 : 0)) * Math.pow(2, det / 12 / 4), p: (j * 0.31 + d * 0.17) % 1, pan: (d - 1) * 0.5 })));
    const stL = filt(), stR = filt();
    const cutoff = kind === "dark" ? 700 : kind === "strings" ? 2400 : 1200 + 2400 * bright;
    const k = biquad("lp", cutoff, 0.6);
    const atk = kind === "strings" ? 0.35 : 0.25;
    for (let i = 0; i < n; i++) {
      const u = i / SR;
      let l = 0, r = 0;
      for (const v of voices) {
        v.p = (v.p + v.f / SR) % 1;
        const s = kind === "dark" ? Math.sin(2 * Math.PI * v.p) * 0.6 + (2 * v.p - 1) * 0.3 : 2 * v.p - 1;
        l += s * (0.5 - v.pan * 0.5); r += s * (0.5 + v.pan * 0.5);
      }
      const env = adsr(u, len, atk, 0.3, 0.85, 0.5) * g / voices.length;
      b.L[s0 + i] = (b.L[s0 + i] || 0) + run(stL, k, l) * env;
      b.R[s0 + i] = (b.R[s0 + i] || 0) + run(stR, k, r) * env;
    }
  },
  // Electric-piano-like FM keys.
  keys(b, t, len, note, g, pan) {
    const n = Math.round((len + 0.8) * SR), s0 = Math.round(t * SR), f = midiHz(note);
    for (let i = 0; i < n; i++) {
      const u = i / SR;
      const mod = Math.sin(2 * Math.PI * f * u) * 1.6 * Math.exp(-u / 0.25);
      const v = Math.sin(2 * Math.PI * f * u + mod) * 0.7 + Math.sin(2 * Math.PI * f * 2 * u) * 0.12 * Math.exp(-u / 0.4);
      put(b, s0 + i, v * adsr(u, len, 0.004, 0.9, 0.35, 0.4) * g, pan);
    }
  },
  // Karplus-Strong pluck (guitar/harp-like); marimba variant uses a sine with fast decay.
  pluck(b, t, len, note, g, pan, r) {
    const f = midiHz(note), period = Math.max(2, Math.round(SR / f));
    const line = new Float32Array(period);
    for (let i = 0; i < period; i++) line[i] = r() * 2 - 1;
    const n = Math.round(Math.min(1.6, len + 0.9) * SR), s0 = Math.round(t * SR);
    let idx = 0, prev = 0;
    for (let i = 0; i < n; i++) {
      const cur = line[idx];
      const nv = 0.996 * 0.5 * (cur + prev);
      prev = cur; line[idx] = nv; idx = (idx + 1) % period;
      put(b, s0 + i, cur * g * 0.8 * Math.min(1, i / 40), pan);
    }
  },
  marimba(b, t, note, g, pan) {
    const f = midiHz(note), n = Math.round(0.7 * SR), s0 = Math.round(t * SR);
    for (let i = 0; i < n; i++) {
      const u = i / SR;
      const v = Math.sin(2 * Math.PI * f * u) * Math.exp(-u / 0.18) + Math.sin(2 * Math.PI * f * 4 * u) * 0.25 * Math.exp(-u / 0.03);
      put(b, s0 + i, v * g * Math.min(1, u / 0.002), pan);
    }
  },
  brass(b, t, len, note, g) {
    const n = Math.round((len + 0.3) * SR), s0 = Math.round(t * SR), st = filt(), f = midiHz(note);
    let p = 0;
    for (let i = 0; i < n; i++) {
      const u = i / SR;
      p = (p + f / SR) % 1;
      const env = adsr(u, len, 0.08, 0.2, 0.8, 0.25);
      const k = biquad("lp", 400 + 2200 * env, 0.8);
      put(b, s0 + i, run(st, k, 2 * p - 1) * env * g, -0.1);
    }
  },
  // Soft hit at the end or on a reveal: low boom + filtered noise.
  hit(b, t, g, r) {
    const n = Math.round(2.2 * SR), s0 = Math.round(t * SR), st = filt(), k = biquad("lp", 900, 0.7);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const u = i / SR, f = 42 + 40 * Math.exp(-u / 0.08);
      ph += (2 * Math.PI * f) / SR;
      const v = Math.sin(ph) * Math.exp(-u / 0.5) * 0.9 + run(st, k, r() * 2 - 1) * Math.exp(-u / 0.35) * 0.5;
      put(b, s0 + i, v * g, 0);
    }
  },
};

// Freeverb-lite: 4 combs + 2 allpasses per side.
function reverb(b, wet, size) {
  const n = b.L.length;
  const combs = [1116, 1188, 1277, 1356], alls = [556, 441];
  const side = (x, spread) => {
    const out = new Float32Array(n);
    combs.forEach((len0) => {
      const len = len0 + spread, buf = new Float32Array(len);
      let i = 0, lp = 0;
      for (let s = 0; s < n; s++) {
        const y = buf[i];
        lp = y * 0.8 + lp * 0.2;
        buf[i] = x[s] * 0.015 + lp * size;
        out[s] += y; i = (i + 1) % len;
      }
    });
    alls.forEach((len0) => {
      const len = len0 + spread, buf = new Float32Array(len);
      let i = 0;
      for (let s = 0; s < n; s++) {
        const bv = buf[i], y = -out[s] + bv;
        buf[i] = out[s] + bv * 0.5; out[s] = y; i = (i + 1) % len;
      }
    });
    return out;
  };
  const rl = side(b.L, 0), rr = side(b.R, 23);
  for (let s = 0; s < n; s++) { b.L[s] += rl[s] * wet; b.R[s] += rr[s] * wet; }
}

/** Beat grid for a duration: what the kit and the storyboard snap cuts to. */
export function beatGrid(mood, duration, bpm) {
  const m = MOODS[mood] || MOODS.upbeat;
  const B = bpm || m.bpm, beat = 60 / B;
  const beats = [], downbeats = [];
  for (let t = 0, i = 0; t < duration + 1e-6; t = ++i * beat) {
    beats.push(+t.toFixed(3));
    if (i % 4 === 0) downbeats.push(+t.toFixed(3));
  }
  return { bpm: B, beat: +beat.toFixed(4), bar: +(beat * 4).toFixed(4), beats, downbeats };
}

/**
 * Render a music bed. Structure: a 1-bar soft intro, full groove, a lift (drop-out + fill) at
 * `hits` near the middle if any, and an ending that resolves on the tonic with a final hit that
 * rings to the end of the video.
 */
export function renderMusic(o) {
  const m = MOODS[o.mood];
  if (!m) throw new Error(`unknown mood "${o.mood}" (use ${MOOD_NAMES.join(", ")})`);
  const duration = o.duration, seed = o.seed || 11, r = rng(seed);
  const bpm = o.bpm || m.bpm, beat = 60 / bpm, bar = beat * 4, step = beat / 4;
  const mm = Object.assign({}, m, { key: o.key != null ? o.key : m.key });
  const prog = m.progs[Math.floor(r() * m.progs.length)];
  const n = Math.ceil((duration + 0.05) * SR);
  const drums = bus(n), music = bus(n), bassB = bus(n);
  const endAt = duration - Math.min(2.2, bar * 0.75); // final resolution
  const bars = Math.ceil(endAt / bar);
  const g = { kick: 0.9, snare: 0.4, hat: 0.18, bass: 0.42, pad: 0.42, lead: 0.2 };
  const lift = (o.hits || []).filter((x) => x > bar * 2 && x < endAt - bar)[0];
  const sw = (i) => (i % 2 === 1 ? m.swing * step : 0);

  for (let bi = 0; bi < bars; bi++) {
    const t0 = bi * bar;
    if (t0 >= endAt) break;
    const deg = prog[bi % prog.length];
    const notes = chord(mm, deg, m.seventh);
    const intro = bi === 0;
    const inLift = lift != null && t0 + bar > lift - bar && t0 < lift;
    const len = Math.min(bar, endAt - t0);
    // Pad / chords
    if (m.pad === "keys") notes.forEach((nn, j) => INST.keys(music, t0 + j * 0.012, len * 0.9, nn, g.pad * 0.5, (j - 1) * 0.3));
    else if (m.pad !== "none") INST.pad(music, t0, len, notes, g.pad * (m.pad === "strings" ? 0.8 : 1), m.bright, m.pad);
    // Bass
    const root = notes[0] - 24;
    if (!intro) {
      if (m.bass === "eighths") for (let s = 0; s < 8; s++) { const tt = t0 + s * beat / 2; if (tt < endAt) INST.bass(bassB, tt, beat * 0.42, root + (s === 7 ? 7 : 0), g.bass, m.bright); }
      else if (m.bass === "offbeat") for (let s = 0; s < 4; s++) { const tt = t0 + s * beat + beat / 2; if (tt < endAt) INST.bass(bassB, tt, beat * 0.4, root, g.bass, m.bright); }
      else if (m.bass === "pulse16") for (let s = 0; s < 16; s++) { const tt = t0 + s * step; if (tt < endAt) INST.bass(bassB, tt, step * 0.6, root, g.bass * 0.8, m.bright); }
      else if (m.bass === "bouncy") [0, 3, 6, 8, 11, 14].forEach((s, j) => { const tt = t0 + s * step; if (tt < endAt) INST.bass(bassB, tt, step * 1.5, root + [0, 12, 7, 0, 12, 7][j], g.bass * 0.8, m.bright); });
      else if (m.bass === "long") INST.bass(bassB, t0, len * 0.95, root, g.bass, m.bright);
      else [0, 2].forEach((b2) => { const tt = t0 + b2 * beat; if (tt < endAt) INST.bass(bassB, tt, beat * 1.6, root, g.bass, m.bright); });
    }
    // Drums
    if (!intro && !inLift) {
      ["k", "s", "h", "o"].forEach((kname) => {
        const pat = m.drums[kname] || "";
        for (let s = 0; s < pat.length; s++) {
          if (pat[s] !== "x") continue;
          const tt = t0 + s * step + sw(s);
          if (tt >= endAt) continue;
          const vel = 0.85 + r() * 0.15;
          if (kname === "k") INST.kick(drums, tt, g.kick * vel);
          else if (kname === "s") INST.snare(drums, tt, g.snare * vel, r, m.scale === "major");
          else INST.hat(drums, tt, g.hat * vel * (s % 4 === 0 ? 1 : 0.7), r, kname === "o");
        }
      });
      if (m.toms && bi % 2 === 1) [12, 13, 14, 15].forEach((s, j) => INST.tom(drums, t0 + s * step, 0.5, 110 - j * 12));
    } else if (inLift && t0 + bar >= lift - 0.01) {
      // Snare roll into the lift point.
      for (let s = 8; s < 16; s++) INST.snare(drums, t0 + s * step, g.snare * (0.3 + (s - 8) * 0.08), r, false);
    } else if (intro && m.drums.h) {
      for (let s = 0; s < 16; s += 4) INST.hat(drums, t0 + s * step, g.hat * 0.6, r, false);
    }
    // Lead / arp from chord tones
    if (!intro && m.lead !== "none") {
      const tones = notes.map((x) => x + 12);
      if (m.lead === "arp") for (let s = 0; s < 16; s++) { const tt = t0 + s * step; if (tt < endAt) INST.pluck(music, tt, step, tones[[0, 1, 2, 1][s % 4]] + (s >= 8 ? 12 : 0), g.lead, (s % 2 ? 0.4 : -0.4), r); }
      else if (m.lead === "pluck") [0, 3, 6, 10, 12].forEach((s, j) => { const tt = t0 + s * step; if (tt < endAt && r() < 0.85) INST.pluck(music, tt, step * 2, tones[j % tones.length], g.lead, j % 2 ? 0.35 : -0.35, r); });
      else if (m.lead === "marimba") [0, 2, 4, 7, 8, 10, 12, 14].forEach((s, j) => { const tt = t0 + s * step + sw(s); if (tt < endAt && r() < 0.8) INST.marimba(music, tt, tones[(j * 2) % tones.length] + (j > 4 ? 12 : 0), g.lead * 1.1, j % 2 ? 0.4 : -0.3); });
      else if (m.lead === "keys") [0, 6, 10].forEach((s, j) => { const tt = t0 + s * step; if (tt < endAt && r() < 0.7) INST.keys(music, tt, beat, tones[(j + bi) % tones.length] + 12, g.lead * 0.9, 0.3); });
      else if (m.lead === "brass" && bi % 2 === 0 && bi > 0) INST.brass(music, t0, bar * 0.9, tones[0], g.lead * 1.2);
      else if (m.lead === "pulse") for (let s = 0; s < 16; s += 2) { const tt = t0 + s * step; if (tt < endAt) INST.pluck(music, tt, step, tones[0] + (s % 8 === 6 ? 1 : 0), g.lead * 0.7, 0.2, r); }
    }
  }
  // Ending: tonic chord + hit, ringing out.
  const tonic = chord(mm, 0, false);
  if (m.pad !== "none" && m.pad !== "keys") INST.pad(music, endAt, duration - endAt, tonic, g.pad, m.bright, m.pad);
  tonic.forEach((nn, j) => INST.keys(music, endAt + j * 0.015, duration - endAt, nn + 12, g.lead, (j - 1) * 0.3));
  INST.bass(bassB, endAt, Math.max(0.3, duration - endAt - 0.4), tonic[0] - 24, g.bass, m.bright);
  INST.hit(drums, endAt, 0.5, r);
  // Optional extra soft hits (big reveals).
  (o.hits || []).forEach((t) => { if (t > 0.2 && t < endAt) INST.hit(drums, t, 0.25, r); });

  // Sidechain: duck music and bass under each kick.
  const kicks = [];
  for (let bi = 1; bi < bars; bi++) for (let s = 0; s < 16; s++) if ((m.drums.k || "")[s] === "x") kicks.push(bi * bar + s * step);
  const duck = new Float32Array(n).fill(1);
  kicks.forEach((t) => { const s0 = Math.round(t * SR); for (let i = 0; i < 0.18 * SR && s0 + i < n; i++) duck[s0 + i] = Math.min(duck[s0 + i], 1 - 0.45 * Math.exp(-(i / SR) / 0.07)); });
  reverb(music, m.scale === "minor" && m.pad === "strings" ? 0.5 : 0.32, 0.84);

  const L = new Float32Array(n), R = new Float32Array(n);
  const lofi = m.lofi ? { st: filt(), st2: filt(), k: biquad("lp", 5200, 0.7) } : null;
  for (let i = 0; i < n; i++) {
    let l = drums.L[i] + (music.L[i] + bassB.L[i]) * duck[i];
    let rr = drums.R[i] + (music.R[i] + bassB.R[i]) * duck[i];
    if (lofi) { l = run(lofi.st, lofi.k, l) + (r() < 0.0004 ? (r() - 0.5) * 0.3 : 0); rr = run(lofi.st2, lofi.k, rr); }
    // Fade in the first 40 ms, fade out the last 0.4 s.
    const u = i / SR;
    const f = Math.min(1, u / 0.04) * Math.min(1, Math.max(0, (duration - u) / 0.4));
    L[i] = l * f; R[i] = rr * f;
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const norm = peak > 0 ? 0.85 / peak : 1;
  const data = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.tanh(L[i] * norm) * 32767), i * 4);
    data.writeInt16LE(Math.round(Math.tanh(R[i] * norm) * 32767), i * 4 + 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  if (o.out) writeFileSync(o.out, Buffer.concat([h, data]));
  return Object.assign(beatGrid(o.mood, duration, bpm), { endAt: +endAt.toFixed(3), prog });
}
