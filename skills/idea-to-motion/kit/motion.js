/* idea-to-motion kit (MO). Motion helpers for HyperFrames scenes, for any topic.
 * Every helper adds tweens to a paused GSAP timeline at an absolute (scene-local) time and
 * returns the time its motion ends, so beats chain:
 *   let t = MO.reveal(tl, "#s1-title", 0, { kind: "slam" });
 *   t = MO.words(tl, "#s1-sub", t + 0.2);
 * Helpers read the style's motion character from CSS (--mo-speed, --mo-ease-in, --mo-overshoot,
 * --mo-step, --mo-reveal), so the same scene code moves like the chosen style.
 * Deterministic: no Date, no Math.random (seeded rng), no rAF, no timers.
 */
(function (g) {
  "use strict";

  const q = (s, root) => (typeof s === "string" ? (root || document).querySelector(s) : s);
  const qa = (s, root) => {
    if (typeof s === "string") return Array.from((root || document).querySelectorAll(s));
    if (Array.isArray(s)) return s.map((x) => q(x, root)).filter(Boolean);
    if (s && typeof s.length === "number" && !s.tagName) return Array.from(s);
    return s ? [s] : [];
  };
  function need(els, name, target) {
    if (!els.length) throw new Error(`MO.${name}: no element matches ${typeof target === "string" ? target : "the target"}`);
    return els;
  }

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function cssVar(el, name) { return getComputedStyle(el || document.body).getPropertyValue(name).trim(); }
  /** "--accent" -> the style's colour; "#hex" unchanged. */
  function color(c, el) {
    if (typeof c === "string" && c.indexOf("--") === 0) return cssVar(el || document.body, c) || c;
    return c;
  }
  function alpha(hex, a) {
    const m = /^#?([0-9a-f]{6})/i.exec(String(hex).trim());
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  function px(name, def) { const v = parseFloat(cssVar(document.body, name)); return isNaN(v) ? def : v; }

  /* ---------- style motion character ---------- */
  let ST = null;
  function style() {
    if (ST) return ST;
    const n = (k, d) => { const v = parseFloat(cssVar(document.body, k)); return isNaN(v) ? d : v; };
    ST = {
      speed: n("--mo-speed", 1), easeIn: cssVar(document.body, "--mo-ease-in") || "power3.out",
      easeOut: cssVar(document.body, "--mo-ease-out") || "power2.in", over: n("--mo-overshoot", 1.6),
      stagger: n("--mo-stagger", 0.08), step: n("--mo-step", 0), reveal: cssVar(document.body, "--mo-reveal") || "rise",
      enter: cssVar(document.body, "--mo-enter") || "push", drift: n("--mo-drift", 1),
    };
    return ST;
  }
  const D = (d) => +(d * style().speed).toFixed(3);
  // "On twos" for hand-made styles: quantise the eased progress to N frames per second.
  function ez(name, dur) {
    const s = style();
    const base = gsap.parseEase(name);
    if (!s.step || !dur) return base;
    const n = Math.max(1, Math.round(dur * s.step));
    return (p) => (p >= 1 ? 1 : base(Math.floor(p * n) / n));
  }
  const popEase = () => (style().over > 0 ? `back.out(${style().over})` : "expo.out");
  const EASE = { in: "power3.out", out: "power2.in", move: "power3.inOut", cam: "expo.inOut", snap: "expo.out", lin: "none" };

  /* ---------- sound cues (read by `motion sfx`) ---------- */
  const CUES = [];
  function cue(o, t, sfx, extra) {
    if (o && o.sfx === false) return;
    if (o && typeof o.sfx === "string") sfx = o.sfx;
    CUES.push(Object.assign({ t: Math.max(0, +t.toFixed(3)), sfx: sfx }, extra || {}));
  }
  const REVEAL_SFX = { slam: ["impact", -2], settle: ["impact", -4], pop: ["pop", 0], card: ["pop", -6], stamp: ["impact", -6], drop: ["pop", -8] };

  /* ---------- beat grid (written by `motion sync` when music is on) ---------- */
  /** Nearest beat to scene-local time t in scene `id` (or t itself when there is no music). */
  function snap(id, t, o) {
    const B = g.MO_BEATS;
    if (!B || !B.beat || !B.starts || B.starts[id] == null) return t;
    const sub = (o && o.sub) || 1;
    const step = B.beat / sub;
    const abs = B.starts[id] + t;
    return +(Math.round(abs / step) * step - B.starts[id]).toFixed(3);
  }
  function beatLen() { return g.MO_BEATS && g.MO_BEATS.beat ? g.MO_BEATS.beat : 0.5; }

  /* ---------- entrances and exits ---------- */
  function kinds() {
    const ei = style().easeIn;
    return {
      rise:   { from: { opacity: 0, y: 40 }, to: { opacity: 1, y: 0 }, dur: 0.55, ease: ei },
      drop:   { from: { opacity: 0, y: -60 }, to: { opacity: 1, y: 0 }, dur: 0.6, ease: popEase() },
      fromL:  { from: { opacity: 0, x: -60 }, to: { opacity: 1, x: 0 }, dur: 0.55, ease: ei },
      fromR:  { from: { opacity: 0, x: 60 }, to: { opacity: 1, x: 0 }, dur: 0.55, ease: ei },
      card:   { from: { opacity: 0, y: 30, scale: 0.9 }, to: { opacity: 1, y: 0, scale: 1 }, dur: 0.6, ease: ei },
      pop:    { from: { opacity: 0, scale: 0.4 }, to: { opacity: 1, scale: 1 }, dur: 0.42, ease: popEase() },
      settle: { from: { opacity: 1, scale: 1.1 }, to: { opacity: 1, scale: 1 }, dur: 1.0, ease: "power2.out" },
      slam:   { from: { opacity: 0, scale: 1.45 }, to: { opacity: 1, scale: 1 }, dur: 0.3, ease: "expo.out" },
      stamp:  { from: { opacity: 0, scale: 2.2, rotation: -8 }, to: { opacity: 1, scale: 1, rotation: 0 }, dur: 0.32, ease: "power4.out" },
      blur:   { from: { opacity: 0, filter: "blur(16px)", scale: 1.06 }, to: { opacity: 1, filter: "blur(0px)", scale: 1 }, dur: 0.7, ease: ei },
      fade:   { from: { opacity: 0 }, to: { opacity: 1 }, dur: 0.5, ease: "power1.out" },
      mask:   { from: { opacity: 1, clipPath: "inset(0% 0% 100% 0%)", y: 30 }, to: { clipPath: "inset(0% 0% 0% 0%)", y: 0 }, dur: 0.7, ease: "power3.out" },
      wipe:   { from: { opacity: 1, clipPath: "inset(0% 100% 0% 0%)" }, to: { clipPath: "inset(0% 0% 0% 0%)" }, dur: 0.6, ease: "power3.inOut" },
      flip:   { from: { opacity: 0, rotationX: -90, transformPerspective: 900, transformOrigin: "50% 100%" }, to: { opacity: 1, rotationX: 0 }, dur: 0.6, ease: ei },
      spin:   { from: { opacity: 0, rotation: -120, scale: 0.3 }, to: { opacity: 1, rotation: 0, scale: 1 }, dur: 0.6, ease: popEase() },
      grow:   { from: { scaleX: 0, transformOrigin: "0% 50%" }, to: { scaleX: 1 }, dur: 0.6, ease: "power3.inOut" },
      line:   { from: { opacity: 0 }, to: { opacity: 1 }, dur: 0.06, ease: "none" },
    };
  }

  /** First appearance of one or more elements (fromTo: call once per element). kind defaults to the style's. */
  function reveal(tl, target, at, o) {
    o = o || {};
    const K = kinds();
    const kind = o.kind || style().reveal;
    const k = K[{ left: "fromL", right: "fromR" }[kind] || kind] || K.rise;
    const els = need(qa(target), "reveal", target);
    const dur = o.dur != null ? o.dur : D(k.dur);
    const stagger = o.stagger != null ? o.stagger : els.length > 1 ? style().stagger : 0;
    const from = Object.assign({}, k.from), to = Object.assign({}, k.to);
    if (o.from) Object.assign(from, o.from);
    // Scaling kinds grow from the text's anchor, so left-aligned text never leaves the safe area.
    if ((kind === "settle" || kind === "slam" || kind === "stamp") && !o.from) {
      const ta = getComputedStyle(els[0]).textAlign;
      if (ta === "left" || ta === "start") from.transformOrigin = to.transformOrigin = "0% 50%";
      else if (ta === "right" || ta === "end") from.transformOrigin = to.transformOrigin = "100% 50%";
    }
    tl.fromTo(els, from, Object.assign(to, { duration: dur, ease: ez(o.ease || k.ease, dur), stagger: stagger }), at);
    els.forEach((e, i) => { const t0 = at + i * stagger; if (e._moShown == null || t0 < e._moShown) e._moShown = t0; });
    const fx = REVEAL_SFX[kind];
    // One impact per call (a group landing together is one hit); pops follow the stagger.
    if (fx) els.forEach((e, i) => { if (i < (fx[0] === "impact" || !stagger ? 1 : 6)) cue(o, at + i * stagger + (fx[0] === "pop" ? dur * 0.15 : 0), fx[0], { gain: fx[1] - (i ? 3 : 0) }); });
    else if (o.sfx) cue(o, at, o.sfx);
    return +(at + dur + stagger * (els.length - 1)).toFixed(3);
  }

  /** Exit (to tween). kind: fade | drop | shrink | up | left | blur */
  function hide(tl, target, at, o) {
    o = o || {};
    const els = need(qa(target), "hide", target);
    const dur = o.dur != null ? o.dur : D(0.3);
    const props = { opacity: 0, duration: dur, ease: style().easeOut, stagger: o.stagger || 0 };
    if (o.kind === "drop") props.y = 30;
    if (o.kind === "up") props.y = -40;
    if (o.kind === "left") props.x = -60;
    if (o.kind === "shrink") props.scale = 0.85;
    if (o.kind === "blur") props.filter = "blur(12px)";
    els.forEach((e) => { e._moHidden = at; });
    tl.to(els, props, at);
    return +(at + dur + (o.stagger || 0) * (els.length - 1)).toFixed(3);
  }

  /* ---------- text ---------- */
  function split(el, unit) {
    if (el.dataset.moSplit === unit) return Array.from(el.querySelectorAll(unit === "chars" ? ".mo-char" : ".mo-word"));
    const parts = [];
    Array.from(el.childNodes).forEach((n) => {
      if (n.nodeType === 3) n.textContent.split(/(\s+)/).forEach((w) => { if (w) parts.push(w); });
      else parts.push(n);
    });
    el.textContent = "";
    parts.forEach((p) => {
      if (typeof p === "string") {
        if (/^\s+$/.test(p)) { el.appendChild(document.createTextNode(" ")); return; }
        const w = document.createElement("span"); w.className = "mo-word";
        if (unit === "chars") {
          w.style.whiteSpace = "nowrap";
          Array.from(p).forEach((ch) => { const c = document.createElement("span"); c.className = "mo-char"; c.textContent = ch; w.appendChild(c); });
        } else w.textContent = p;
        el.appendChild(w);
      } else { p.classList.add("mo-word"); el.appendChild(p); }
    });
    el.dataset.moSplit = unit;
    return Array.from(el.querySelectorAll(unit === "chars" ? ".mo-char" : ".mo-word"));
  }
  /** Reveal text word by word. Child elements (e.g. <span class="mo-mark">) count as one word. */
  function words(tl, target, at, o) {
    o = o || {};
    const el = need(qa(target), "words", target)[0];
    const ws = split(el, "words");
    return reveal(tl, ws, at, { kind: o.kind || "rise", stagger: o.stagger != null ? o.stagger : D(0.07), dur: o.dur, sfx: o.sfx != null ? o.sfx : false });
  }
  /** Reveal text letter by letter (titles, logos). */
  function chars(tl, target, at, o) {
    o = o || {};
    const el = need(qa(target), "chars", target)[0];
    const cs = split(el, "chars");
    const st = o.stagger != null ? o.stagger : Math.min(0.05, 0.9 / Math.max(1, cs.length));
    return reveal(tl, cs, at, { kind: o.kind || "rise", stagger: st, dur: o.dur || D(0.45), sfx: o.sfx != null ? o.sfx : false });
  }
  /** Masked line reveal. Markup: <h1 id="x"><span class="mo-line-mask"><span>Line one</span></span>...</h1> */
  function lines(tl, target, at, o) {
    o = o || {};
    const el = need(qa(target), "lines", target)[0];
    const inner = Array.from(el.querySelectorAll(".mo-line-mask > span"));
    if (!inner.length) throw new Error("MO.lines: wrap each line as <span class=\"mo-line-mask\"><span>…</span></span>");
    const dur = o.dur || D(0.75);
    const st = o.stagger != null ? o.stagger : D(0.12);
    tl.fromTo(inner, { yPercent: 110 }, { yPercent: 0, duration: dur, ease: ez("power4.out", dur), stagger: st }, at);
    inner.forEach((e, i) => { e._moShown = at + i * st; });
    el._moShown = at;
    return +(at + dur + st * (inner.length - 1)).toFixed(3);
  }
  /** Kinetic punch: show the children one at a time in the same spot (one word per beat).
   *  Markup: <div id="k" class="mo-mid"><span class="mo-hook">Stop</span><span class="mo-hook">scrolling</span>...</div>
   *  Children are stacked by the helper. beat: seconds per item (default: the music beat). */
  function punch(tl, target, at, o) {
    o = o || {};
    const box = need(qa(target), "punch", target)[0];
    const items = Array.from(box.children);
    box.style.display = "grid"; box.style.placeItems = "center";
    items.forEach((e) => { e.style.gridArea = "1 / 1"; });
    const beat = o.beat || Math.max(0.35, beatLen());
    let t = at;
    items.forEach((e, i) => {
      // At the very start of a video the first word must already be readable (frame 0 is the thumbnail).
      const kind = i === 0 && at < 0.05 ? "settle" : o.kind || "slam";
      reveal(tl, e, t, { kind, dur: kind === "settle" ? Math.min(0.6, beat) : Math.min(D(0.28), beat * 0.6), sfx: i === 0 || o.everyHit ? undefined : false });
      if (i < items.length - 1 || o.hideLast) tl.set(e, { opacity: 0 }, t + beat);
      t += beat;
    });
    return +t.toFixed(3);
  }
  /** Seeded text scramble that resolves to `text` (tech, mystery, reveals). */
  function scramble(tl, target, text, at, o) {
    o = o || {};
    const el = need(qa(target), "scramble", target)[0];
    const chars = o.chars || "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*";
    const dur = o.dur || D(0.9);
    const r = rng(o.seed || 3);
    const frames = Math.max(4, Math.round(dur * 30));
    const table = [];
    for (let f = 0; f < frames; f++) table.push(Array.from(text).map((ch) => (ch === " " ? " " : chars[Math.floor(r() * chars.length)])).join(""));
    const p = { v: 0 };
    el.textContent = "";
    tl.set(el, { opacity: 1 }, at);
    tl.fromTo(p, { v: 0 }, { v: 1, duration: dur, ease: "none", immediateRender: false, onUpdate: () => {
      if (p.v <= 0) { el.textContent = ""; return; }
      const f = Math.min(frames - 1, Math.floor(p.v * frames));
      const done = Math.floor(p.v * text.length);
      el.textContent = text.slice(0, done) + table[f].slice(done);
      if (p.v >= 1) el.textContent = text;
    } }, at);
    cue(o, at, "typing", { dur: +dur.toFixed(3), cps: 30 });
    return +(at + dur).toFixed(3);
  }
  /** Marker highlight behind a .mo-mark element (draws left to right; text turns --on-accent). */
  function mark(tl, target, at, o) {
    o = o || {};
    const els = need(qa(target), "mark", target);
    if (o.color) els.forEach((e) => e.style.setProperty("--mark-c", color(o.color, e)));
    const dur = o.dur || D(0.45);
    tl.fromTo(els, { "--mark": 0 }, { "--mark": 1, duration: dur, ease: "power2.inOut", stagger: o.stagger || 0.15 }, at);
    // Text colour flips when the marker passes under it (default: the style's on-accent colour).
    const tc = o.textColor || (o.keepColor ? null : "--on-accent");
    // Once the sweep has covered the word, a solid background (what contrast checkers read)
    // replaces the gradient and the text flips to the on-accent colour.
    if (tc) tl.set(els, { color: color(tc, els[0]), backgroundColor: o.color ? color(o.color, els[0]) : color("--accent", els[0]) }, at + dur);
    cue(o, at, "swish", { gain: -8 });
    return +(at + dur).toFixed(3);
  }

  // Hand-drawn strokes around/under an element: seeded wobble, drawn with stroke-dashoffset.
  // Geometry that depends on text layout (an underline under a word, a circle around a number,
  // a burst around a title, a camera target) is computed at render time, not at build time:
  // web fonts may not be loaded when the scene script runs, and a scene can be display:none
  // until its turn. These jobs run on every render of the scene timeline (each frame seek), and
  // compute their geometry the first time the element is laid out. Layout boxes ignore
  // transforms, so the result does not depend on which frame a render worker draws first.
  const JOBS = new WeakMap();
  function onFrame(tl, job) {
    let list = JOBS.get(tl);
    if (!list) {
      list = [];
      JOBS.set(tl, list);
      tl.eventCallback("onUpdate", () => { const t = tl.time(); list.forEach((j) => j(t)); });
    }
    list.push(job);
  }
  const laidOut = (el) => el.offsetWidth > 0 || el.offsetHeight > 0;
  function lazyOverlay(el, pad, make) {
    let built = null, svg = null;
    return () => {
      if (built) return built;
      if (!laidOut(el)) return null;
      const host = el.offsetParent || el.parentElement;
      let x = 0, y = 0, n = el;
      while (n && n !== host) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
      const w = el.offsetWidth, h = el.offsetHeight;
      svg = svgEl("svg", { class: "mo-svg-layer", width: w + pad * 2, height: h + pad * 2, viewBox: `0 0 ${w + pad * 2} ${h + pad * 2}` });
      svg.style.left = x - pad + "px"; svg.style.top = y - pad + "px";
      host.appendChild(svg);
      built = make(svg, w, h);
      return built;
    };
  }
  // Stroke animation of a lazily built path; hidden before `at` (round caps would otherwise
  // paint a dot on a fully hidden dash).
  function lazyStroke(tl, get, at, dur) {
    const e = ez("power2.inOut", dur);
    onFrame(tl, (t) => {
      const g2 = get();
      if (!g2) return;
      const p = Math.min(1, Math.max(0, (t - at) / dur));
      g2.path.style.opacity = t > at ? 1 : 0;
      g2.path.style.strokeDashoffset = g2.L * (1 - e(p));
    });
    // A tween so the timeline lasts at least until the stroke is drawn.
    tl.to({}, { duration: dur }, at);
  }
  /** kind: underline | circle | strike | box. Works on any element, including inline words. */
  function scribble(tl, target, at, o) {
    o = o || {};
    const el = need(qa(target), "scribble", target)[0];
    const kind = o.kind || "underline";
    const pad = 30;
    const stroke = color(o.color || "--accent", el);
    const get = lazyOverlay(el, pad, (svg, w, h) => {
      const r = rng(o.seed || 5), j = (a) => (r() - 0.5) * a;
      const sw = o.width || Math.max(6, Math.round(h * 0.07));
      let d;
      if (kind === "underline") d = `M ${pad - 6} ${pad + h + 8 + j(6)} Q ${pad + w / 2} ${pad + h + 18 + j(8)} ${pad + w + 8} ${pad + h + 4 + j(6)}`;
      else if (kind === "strike") d = `M ${pad - 8} ${pad + h * 0.55 + j(6)} L ${pad + w + 8} ${pad + h * 0.48 + j(6)}`;
      else if (kind === "box") d = `M ${pad - 10} ${pad - 8} L ${pad + w + 12} ${pad - 12 + j(6)} L ${pad + w + 8} ${pad + h + 10} L ${pad - 12} ${pad + h + 8 + j(6)} Z`;
      else {
        // circle: an ellipse that overshoots its start, like a pen.
        const cx = pad + w / 2, cy = pad + h / 2, rx = w / 2 + 22, ry = h / 2 + 18, pts = [];
        for (let i = 0; i <= 28; i++) {
          const a = -Math.PI * 0.6 + (i / 28) * Math.PI * 2.15, k = 1 + j(0.06);
          pts.push(`${(cx + Math.cos(a) * rx * k).toFixed(1)} ${(cy + Math.sin(a) * ry * k).toFixed(1)}`);
        }
        d = "M " + pts.join(" L ");
      }
      const path = svgEl("path", { d, fill: "none", stroke, "stroke-width": sw, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);
      const L = path.getTotalLength();
      path.style.strokeDasharray = L; path.style.strokeDashoffset = L; path.style.opacity = 0;
      return { path, L };
    });
    const dur = o.dur || D(kind === "circle" ? 0.7 : 0.45);
    lazyStroke(tl, get, at, dur);
    cue(o, at, "scribble", { dur: dur, gain: -6 });
    return +(at + dur).toFixed(3);
  }

  /** Type text into an element with a caret. Human rhythm, seeded. Returns the end of typing. */
  function type(tl, target, text, at, o) {
    o = o || {};
    const el = need(qa(target), "type", target)[0];
    const cps = o.cps || 26;
    const r = rng(o.seed || 7);
    let typed = el.querySelector(".mo-typed"), caret = el.querySelector(".mo-caret");
    if (!typed) {
      el.textContent = "";
      typed = document.createElement("span"); typed.className = "mo-typed"; el.appendChild(typed);
      caret = document.createElement("span"); caret.className = "mo-caret"; el.appendChild(caret);
    }
    const marks = [0];
    let acc = 0;
    for (let i = 0; i < text.length; i++) {
      let d = (1 / cps) * (0.75 + r() * 0.5);
      if (/[\s,.;:]/.test(text[i])) d += 0.06 + r() * 0.06;
      acc += d; marks.push(acc);
    }
    const maxDur = o.maxDur || 1.8;
    if (acc > maxDur) {
      const cut = Math.floor(text.length * 0.7), scale = (maxDur - 0.08) / marks[cut];
      for (let i = 0; i <= text.length; i++) marks[i] = i <= cut ? marks[i] * scale : maxDur;
      acc = maxDur;
    }
    const total = acc, prog = { t: 0 };
    typed.textContent = "";
    tl.set(caret, { opacity: 1 }, Math.max(0, at - 0.001));
    tl.fromTo(prog, { t: 0 }, { t: total, duration: total, ease: "none", onUpdate: () => {
      let lo = 0, hi = marks.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (marks[mid] <= prog.t) lo = mid; else hi = mid - 1; }
      typed.textContent = text.slice(0, lo);
    } }, at);
    const end = at + total;
    const keys = [];
    for (let i = 1; i < marks.length; i++) if (marks[i] > marks[i - 1] + 1e-4 && text[i - 1] !== " ") keys.push(+marks[i - 1].toFixed(3));
    cue(o, at, "typing", { dur: +total.toFixed(3), cps: cps, keys: keys });
    const blinkUntil = o.blinkUntil != null ? o.blinkUntil : end + 1.2, half = 0.265;
    const n = Math.max(0, Math.floor((blinkUntil - end) / half));
    if (n > 0) tl.to(caret, { opacity: 0, duration: half, ease: "steps(1)", repeat: n - 1, yoyo: true }, end + 0.2);
    if (o.hideCaret !== false) tl.set(caret, { opacity: 0 }, blinkUntil + 0.2);
    return +end.toFixed(3);
  }
  /** Terminal output streaming: show lines one after another. */
  function stream(tl, target, at, o) {
    o = o || {};
    const st = o.stagger != null ? o.stagger : 0.11;
    const n = qa(target).length;
    for (let i = 0; i < n; i++) cue(o, at + i * st, "click", { gain: -4 });
    return reveal(tl, target, at, { kind: "line", stagger: st, sfx: false });
  }
  /** Karaoke captions from voice-over word timings: words = [{ w, t0, t1 }] in scene-local seconds.
   *  Groups up to `max` words per caption line; highlights the spoken word. */
  function captions(tl, target, wordsList, o) {
    o = o || {};
    const box = need(qa(target), "captions", target)[0];
    const max = o.max || 6;
    // Lone punctuation ("!" after a French space) sticks to the previous word.
    const ws = [];
    wordsList.forEach((w) => { if (ws.length && /^[!?:;.,»%]+$/.test(w.w)) { ws[ws.length - 1] = Object.assign({}, ws[ws.length - 1], { w: ws[ws.length - 1].w + "\u00a0" + w.w, t1: w.t1 }); } else ws.push(Object.assign({}, w)); });
    let groups = [], cur = [];
    ws.forEach((w, i) => {
      cur.push(w);
      const gap = ws[i + 1] ? ws[i + 1].t0 - w.t1 : 1;
      if (cur.length >= max || /[.!?]$/.test(w.w) || (/[,;:]$/.test(w.w) && cur.length >= 3) || gap > 0.45) { groups.push(cur); cur = []; }
    });
    if (cur.length) groups.push(cur);
    // A group of 1-2 words joins its neighbour when the result stays short.
    groups = groups.reduce((acc, g2) => {
      const prev = acc[acc.length - 1];
      if (prev && (g2.length <= 2 || prev.length <= 2) && prev.length + g2.length <= max + 2) acc[acc.length - 1] = prev.concat(g2); else acc.push(g2);
      return acc;
    }, []);
    box.textContent = "";
    // Highlight: the style colour that reads best on the dark caption pill.
    const lum = (c) => { const m = /^#?([0-9a-f]{6})/i.exec(String(c).trim()); return m ? luminance("#" + m[1]) : 0; };
    const hi = o.highlight ? color(o.highlight, box) : ["--accent", "--accent-2", "--accent-3"].map((v) => color(v, box)).sort((a, b) => lum(b) - lum(a))[0];
    const lines = groups.map((grp, gi) => {
      const line = document.createElement("div");
      line.style.opacity = 0;
      const pill = document.createElement("span"); pill.className = "mo-cap-pill"; line.appendChild(pill);
      const spans = grp.map((w, k) => {
        const sp = document.createElement("span"); sp.className = "mo-word"; sp.textContent = w.w; pill.appendChild(sp);
        if (k < grp.length - 1) pill.appendChild(document.createTextNode(" "));
        return sp;
      });
      box.appendChild(line);
      const t0 = Math.max(0, grp[0].t0 - 0.05);
      const t1 = groups[gi + 1] ? Math.max(t0 + 0.2, groups[gi + 1][0].t0 - 0.05) : grp[grp.length - 1].t1 + 0.5;
      return { line, spans, grp, t0, t1 };
    });
    // One group visible at a time, decided per frame (no crossfade ghosting).
    onFrame(tl, (t) => {
      lines.forEach((L) => {
        const on = t >= L.t0 && t < L.t1;
        const k = on ? Math.min(1, (t - L.t0) / 0.1) : 0;
        L.line.style.opacity = k;
        L.line.style.transform = `translateY(${(1 - k) * 12}px)`;
        if (on) L.spans.forEach((sp, i) => { const w = L.grp[i]; sp.style.color = t >= w.t0 && t < w.t1 + 0.02 ? hi : "#FFFFFF"; });
      });
    });
    const end = lines.length ? lines[lines.length - 1].t1 : 0;
    tl.to({}, { duration: 0.01 }, Math.max(0, end - 0.01));
    return wordsList.length ? wordsList[wordsList.length - 1].t1 : 0;
  }
  /** Scene-local time when the voice-over says a word: MO.atWord("s3", "free") or ("s3", 4) (index). */
  function atWord(id, which, o) {
    const list = (g.MO_VO && g.MO_VO[id]) || [];
    const norm = (x) => String(x).toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    const w = typeof which === "number" ? list[which] : list.find((x) => norm(x.w) === norm(which)) || list.find((x) => norm(x.w).indexOf(norm(which)) === 0);
    if (!w) return o && o.fallback != null ? o.fallback : 0;
    return o && o.end ? w.t1 : w.t0;
  }

  /* ---------- emphasis and state ---------- */
  function pulse(tl, target, at, o) {
    o = o || {};
    tl.to(qa(target), { scale: o.scale || 1.07, duration: 0.16, ease: "power2.out", yoyo: true, repeat: 1 }, at);
    return at + 0.32;
  }
  /** Small idle motion while the viewer reads: scale 1 -> 1.03 (no frame is ever frozen). */
  function breathe(tl, target, at, dur, o) {
    o = o || {};
    tl.fromTo(qa(target), { scale: 1 }, { scale: o.scale || 1.03, duration: dur, ease: "sine.inOut", immediateRender: false }, at);
    return at + dur;
  }
  /** Seeded gentle floating (background shapes, icons). */
  function float(tl, target, at, dur, o) {
    o = o || {};
    const r = rng(o.seed || 9), amp = (o.amp || 18) * style().drift;
    qa(target).forEach((e) => {
      tl.fromTo(e, { x: 0, y: 0, rotation: 0 }, { x: (r() - 0.5) * amp * 2, y: (r() - 0.5) * amp * 2, rotation: (r() - 0.5) * (o.rot || 6),
        duration: dur, ease: "sine.inOut", immediateRender: false }, at);
    });
    return at + dur;
  }
  const onScreen = (e, at) => (e._moShown == null || e._moShown <= at) && !(e._moHidden != null && e._moHidden <= at);
  /** Dim everything except the focus elements (only those on screen at `at`). */
  function focus(tl, keep, all, at, o) {
    o = o || {};
    const keepAll = qa(keep), keepEls = keepAll.filter((e) => onScreen(e, at));
    const others = qa(all).filter((e) => keepAll.indexOf(e) < 0 && onScreen(e, at));
    tl.to(others, { opacity: o.dim != null ? o.dim : 0.25, duration: 0.3, ease: "power2.out" }, at);
    if (keepEls.length) tl.to(keepEls, { opacity: 1, duration: 0.3, ease: "power2.out" }, at);
    return at + 0.3;
  }
  function unfocus(tl, all, at) {
    const els = qa(all).filter((e) => onScreen(e, at));
    if (els.length) tl.to(els, { opacity: 1, duration: 0.3, ease: "power2.out" }, at);
    return at + 0.3;
  }
  function glitch(tl, target, at, o) {
    o = o || {};
    const els = qa(target);
    const a = color("--err", els[0]) || "#FF5C6C", b = color("--accent", els[0]) || "#4FC3F7";
    const f = (x) => `drop-shadow(${x}px 0px 0px ${a}) drop-shadow(${-x}px 0px 0px ${b})`;
    const step = (fx, x) => (o.noShift ? { filter: fx } : { filter: fx, x: x });
    tl.set(els, step(f(10), 6), at).set(els, step(f(-6), -8), at + 0.05).set(els, step(f(4), 3), at + 0.1).set(els, step("none", 0), at + 0.17);
    if (!o.quiet) cue(o, at, "glitch");
    return at + 0.17;
  }
  /** Something goes wrong: colour to --err in 2 frames, shake, glitch, error sound. */
  function fail(tl, target, at, o) {
    o = o || {};
    const els = qa(target);
    const err = cssVar(els[0], "--err") || "#FF5C6C";
    const st = { "--state": err, duration: 0.07, ease: "none" };
    if (o.colorText) st.color = err;
    tl.to(els, st, at);
    tl.to(els, { keyframes: { x: [0, -10, 9, -7, 5, -2, 0] }, duration: 0.36, ease: "none" }, at + 0.02);
    if (o.glitch !== false) glitch(tl, els, at + 0.02, { quiet: true, noShift: true });
    cue(o, at, "error");
    return at + 0.4;
  }
  /** Success: colour to --ok, pulse, ding. */
  function ok(tl, target, at, o) {
    const els = qa(target);
    cue(o, at + 0.05, "ding");
    tl.to(els, { "--state": cssVar(els[0], "--ok") || "#3DDC97", duration: 0.25, ease: "power2.out" }, at);
    pulse(tl, els, at + 0.05, { scale: 1.06 });
    return at + 0.37;
  }
  /** Replace one element by another in place. Markup: <span class="mo-swap"><span id="a">old</span><span id="b">new</span></span> */
  function swap(tl, from, to, at, o) {
    o = o || {};
    const a = q(from), b = q(to);
    b.style.opacity = 0;
    tl.to(a, { opacity: 0, y: -20, duration: 0.25, ease: EASE.out }, at);
    tl.fromTo(b, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.35, ease: style().easeIn, immediateRender: false }, at + 0.15);
    cue(o, at + 0.1, "tick");
    return at + 0.5;
  }
  /** Tint a background with a style colour: highlight(tl, "#line", t, "--err"). */
  function highlight(tl, target, at, c, o) {
    o = o || {};
    const els = qa(target);
    tl.to(els, { backgroundColor: alpha(color(c || "--accent", els[0]), o.alpha != null ? o.alpha : 0.2), duration: 0.25, ease: "power2.out" }, at);
    return at + 0.25;
  }
  /** Animated number. o: { decimals, prefix, suffix, sep, dur } */
  function count(tl, target, from, to, at, o) {
    o = o || {};
    const el = need(qa(target), "count", target)[0];
    const dec = o.decimals || 0, sep = o.sep != null ? o.sep : ",";
    const fmt = (v) => { const s = v.toFixed(dec).split("."); s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, sep); return (o.prefix || "") + s.join(o.point || ".") + (o.suffix || ""); };
    // A smaller unit after the number: { suffix: " km", suffixClass: "mo-title" } keeps it in one element.
    if (o.suffixClass && o.suffix) {
      const unit = document.createElement("span");
      unit.className = o.suffixClass; unit.textContent = o.suffix;
      const num = document.createElement("span");
      el.textContent = ""; el.appendChild(num); el.appendChild(unit);
      const o2 = Object.assign({}, o, { suffix: "", suffixClass: null });
      return count(tl, num, from, to, at, o2);
    }
    const p = { v: from };
    // Reserve the final width (tabular digits) so the layout never jumps while counting.
    el.style.fontVariantNumeric = "tabular-nums";
    if (getComputedStyle(el).display === "inline") el.style.display = "inline-block";
    el.style.minWidth = fmt(to).length * 0.92 + "ch";
    el.textContent = fmt(from);
    // Once the real font is laid out, reserve exactly the final width (the ch estimate is only a
    // fallback: wide or proportional digits would leave a gap or a jump).
    // Reserve exactly the final width once the real font is there (the ch estimate is only a
    // fallback: wide or proportional digits would leave a gap or a jump). The probe is measured
    // in <body> with the element's font, so it works while the scene is not displayed yet.
    // reserve: false skips it (count between numbers of the same digit count: tabular digits keep
    // the width constant anyway).
    let sized = o.reserve === false;
    if (sized) el.style.minWidth = "";
    const measure = () => {
      if (sized) return;
      const cs = getComputedStyle(el);
      if (!cs.fontFamily || !cs.fontSize) return;
      const probe = document.createElement("span");
      ["fontFamily", "fontWeight", "fontStyle", "fontSize", "letterSpacing", "fontVariantNumeric", "fontFeatureSettings", "textTransform"].forEach((k) => { probe.style[k] = cs[k]; });
      probe.style.cssText += ";position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap";
      probe.textContent = fmt(to);
      document.body.appendChild(probe);
      const w = probe.getBoundingClientRect().width;
      probe.remove();
      if (w > 0) { el.style.minWidth = Math.ceil(w) + "px"; sized = !document.fonts || document.fonts.status === "loaded"; }
    };
    measure();
    onFrame(tl, measure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    const dur = o.dur || D(1.2);
    tl.fromTo(p, { v: from }, { v: to, duration: dur, ease: o.ease || "power2.out", onUpdate: () => { el.textContent = fmt(p.v); } }, at);
    const ticks = Math.min(10, Math.round(dur * 8));
    for (let i = 0; i < ticks; i++) cue(o, at + (dur * 0.8 * i) / ticks, "tick", { gain: -12 });
    return +(at + dur).toFixed(3);
  }
  /** Full-frame flash (needs a .mo-flash element). */
  function flash(tl, target, at, o) {
    o = o || {};
    tl.fromTo(q(target), { opacity: 0 }, { opacity: o.strength || 0.7, duration: 0.04, ease: "none", yoyo: true, repeat: 1, immediateRender: false }, at);
    return at + 0.08;
  }
  /** A diagonal light sweep across an element (logos, product names, luxury). */
  function shine(tl, target, at, o) {
    o = o || {};
    const el = need(qa(target), "shine", target)[0];
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    el.style.overflow = "hidden";
    const s = document.createElement("div");
    s.style.cssText = "position:absolute;top:-20%;bottom:-20%;width:40%;left:0;pointer-events:none;" +
      `background:linear-gradient(90deg,transparent,${o.color || "rgba(255,255,255,0.55)"},transparent);mix-blend-mode:${o.blend || "overlay"}`;
    el.appendChild(s);
    const dur = o.dur || D(0.9);
    gsap.set(s, { xPercent: -160, skewX: -20 });
    tl.fromTo(s, { xPercent: -160 }, { xPercent: 330, duration: dur, ease: "power2.inOut", immediateRender: false }, at);
    cue(o, at, "shimmer", { gain: -6 });
    return +(at + dur).toFixed(3);
  }
  /** Slow ambient drift so no frame is ever dead (backgrounds). */
  function drift(tl, target, at, dur, o) {
    o = o || {};
    const k = style().drift;
    const els = qa(target);
    if (!els.length) return at + dur;
    tl.fromTo(els, { x: 0, y: 0 }, { x: (o.x != null ? o.x : -30) * k, y: (o.y != null ? o.y : -18) * k, duration: dur, ease: "none" }, at);
    return at + dur;
  }

  /* ---------- SVG: icons, drawing, morphing ---------- */
  const SVGNS = "http://www.w3.org/2000/svg";
  function svgEl(tag, attrs, parent) {
    const e = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, attrs[k]));
    if (parent) parent.appendChild(e);
    return e;
  }
  /** Icon markup by name from window.MO_ICONS (saved with `motion icon <name> --project`). */
  function icon(name) {
    const lib = g.MO_ICONS || {};
    const ic = lib[name];
    if (!ic) throw new Error(`MO.icon: "${name}" is not in assets/mo/icons.js. Run: motion icon ${name} --project <dir>`);
    return ic.svg;
  }
  /** Fill every element with data-icon="name" with its SVG. Call once at build time. */
  function icons(root) {
    qa("[data-icon]", root || document).forEach((el) => { if (!el.firstElementChild) el.innerHTML = icon(el.getAttribute("data-icon")); });
  }
  /** Draw strokes of SVG content (line icons, illustrations, logos, maps). Fills fade in after
   *  the strokes ({ fill: "now" } keeps them visible from the start, { fill: false } never). */
  function draw(tl, target, at, o) {
    o = o || {};
    const roots = need(qa(target), "draw", target);
    const shapes = [];
    roots.forEach((r) => {
      const list = r.matches && r.matches("path,line,polyline,polygon,circle,rect,ellipse") ? [r] : Array.from(r.querySelectorAll("path,line,polyline,polygon,circle,rect,ellipse"));
      list.forEach((s) => shapes.push(s));
      r._moShown = at;
      r.style.opacity = 0;
      tl.set(r, { opacity: 1 }, at);
    });
    const dur = o.dur || D(0.8);
    const st = o.stagger != null ? o.stagger : Math.min(0.12, 0.6 / Math.max(1, shapes.length));
    shapes.forEach((s, i) => {
      let L = 0;
      try { L = s.getTotalLength(); } catch (e) { L = 0; }
      if (!L) return;
      s.style.strokeDasharray = L;
      tl.fromTo(s, { strokeDashoffset: L }, { strokeDashoffset: 0, duration: dur, ease: ez("power2.inOut", dur), immediateRender: true }, at + i * st);
      const fill = s.getAttribute("fill");
      if (fill && fill !== "none" && o.fill !== false && o.fill !== "now") tl.fromTo(s, { fillOpacity: 0 }, { fillOpacity: 1, duration: 0.3, immediateRender: true }, at + i * st + dur * 0.7);
    });
    cue(o, at, "scribble", { dur: Math.min(1.2, dur + st * shapes.length), gain: -10 });
    return +(at + dur + st * Math.max(0, shapes.length - 1)).toFixed(3);
  }
  /** Morph one SVG path into another (needs MorphSVGPlugin, loaded by default). */
  function morph(tl, from, to, at, o) {
    o = o || {};
    if (!g.MorphSVGPlugin) throw new Error("MO.morph: MorphSVGPlugin is not loaded");
    const dur = o.dur || D(0.8);
    tl.to(q(from), { morphSVG: { shape: q(to), type: "rotational" }, duration: dur, ease: o.ease || "power3.inOut" }, at);
    cue(o, at, "whoosh", { dur: dur, gain: -10 });
    return +(at + dur).toFixed(3);
  }
  /** Move an element along an SVG path. The SVG must sit at the top-left of the element's
   *  positioned container with a pixel viewBox (e.g. class="mo-svg-layer" width=W height=H
   *  viewBox="0 0 W H"); the element's centre follows the path. o: { dur, ease, rotate } */
  function along(tl, target, path, at, o) {
    o = o || {};
    const el = need(qa(target), "along", target)[0], p = need(qa(path), "along", path)[0];
    const dur = o.dur || D(1.2), e = gsap.parseEase(o.ease || "power1.inOut");
    const L = p.getTotalLength();
    el.style.left = "0px"; el.style.top = "0px";
    onFrame(tl, (t) => {
      if (!laidOut(el)) return;
      const u = e(Math.min(1, Math.max(0, (t - at) / dur)));
      const pt = p.getPointAtLength(u * L), pb = p.getPointAtLength(Math.max(0, u * L - 1)), pf = p.getPointAtLength(Math.min(L, u * L + 1));
      const ang = (Math.atan2(pf.y - pb.y, pf.x - pb.x) * 180) / Math.PI;
      gsap.set(el, { x: pt.x - el.offsetWidth / 2, y: pt.y - el.offsetHeight / 2, rotation: o.rotate ? ang : 0 });
    });
    tl.to({}, { duration: dur }, at);
    return +(at + dur).toFixed(3);
  }

  /* ---------- particles (seeded, physics computed at build time) ---------- */
  /** Confetti burst from (x, y) in `container` px. o: { n, colors, spread, power, gravity, life, seed } */
  function confetti(tl, container, at, o) {
    o = o || {};
    const host = need(qa(container), "confetti", container)[0];
    const r = rng(o.seed || 21);
    const W = host.offsetWidth || 1920, H = host.offsetHeight || 1080;
    const x0 = o.x != null ? o.x : W / 2, y0 = o.y != null ? o.y : H * 0.55;
    const cols = (o.colors || ["--accent", "--accent-2", "--accent-3", "--text"]).map((c) => color(c, host));
    const n = o.n || 70, life = o.life || 2.4, grav = o.gravity || 1500, power = o.power || 1400, spread = o.spread || 1.1;
    for (let i = 0; i < n; i++) {
      const p = document.createElement("div");
      const w = 14 + r() * 16, h = r() < 0.4 ? w : w * 0.45;
      p.style.cssText = `position:absolute;left:0;top:0;width:${w}px;height:${h}px;background:${cols[i % cols.length]};border-radius:${r() < 0.3 ? "50%" : "3px"};opacity:0;pointer-events:none;z-index:40`;
      host.appendChild(p);
      const ang = -Math.PI / 2 + (r() - 0.5) * Math.PI * spread, v = power * (0.45 + r() * 0.6);
      const vx = Math.cos(ang) * v, vy = Math.sin(ang) * v, rot = (r() - 0.5) * 1400, drag = 0.9 + r() * 0.5;
      const prog = { t: 0 };
      tl.fromTo(prog, { t: 0 }, { t: life, duration: life, ease: "none", immediateRender: false, onUpdate: () => {
        const t = prog.t, k = Math.exp(-drag * t);
        const x = x0 + (vx / drag) * (1 - k), y = y0 + (vy / drag) * (1 - k) + 0.5 * grav * t * t * 0.55;
        gsap.set(p, { x: x, y: y, rotation: rot * t, rotationX: rot * t * 0.7, opacity: t <= 0.001 ? 0 : t < life * 0.75 ? 1 : 1 - (t - life * 0.75) / (life * 0.25) });
      } }, at);
    }
    cue(o, at, "pop", { gain: 0 }); cue(o, at + 0.02, "sparkle", { gain: -4 });
    return at + life;
  }
  /** Radial burst of short lines around an element (a reveal accent, use sparingly). */
  function burst(tl, target, at, o) {
    o = o || {};
    const el = need(qa(target), "burst", target)[0];
    const col = color(o.color || "--accent", el), n = o.n || 10;
    const get = lazyOverlay(el, 140, (svg, w, h) => {
      const cx = w / 2 + 140, cy = h / 2 + 140, R = Math.max(w, h) / 2 + 30, lines = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const l = svgEl("line", { x1: cx + Math.cos(a) * R, y1: cy + Math.sin(a) * R, x2: cx + Math.cos(a) * (R + 50), y2: cy + Math.sin(a) * (R + 50),
          stroke: col, "stroke-width": 8, "stroke-linecap": "round" }, svg);
        l.style.strokeDasharray = 50; l.style.opacity = 0;
        lines.push(l);
      }
      return lines;
    });
    const e1 = gsap.parseEase("power2.out"), e2 = gsap.parseEase("power2.in");
    onFrame(tl, (t) => {
      const lines = get();
      if (!lines) return;
      const p = (t - at) / 0.55;
      const off = p < 0.45 ? 50 * (1 - e1(Math.max(0, p) / 0.45)) : -50 * e2(Math.min(1, (p - 0.45) / 0.55));
      lines.forEach((l) => { l.style.opacity = p > 0 && p < 1 ? 1 : 0; l.style.strokeDashoffset = off; });
    });
    tl.to({}, { duration: 0.55 }, at);
    return at + 0.55;
  }

  /** Decorative shapes scattered in a container (use the background and the zones outside the
   *  safe area, e.g. the bottom of a 9:16). o: { n, kinds: ["circle","ring","square","tri","squiggle","plus"],
   *  colors, size: [40, 160], area: { x, y, w, h }, seed, opacity }. They pop in, then float. */
  function shapes(tl, container, at, dur, o) {
    o = o || {};
    const host = need(qa(container), "shapes", container)[0];
    const r = rng(o.seed || 31);
    const W = host.offsetWidth || document.body.clientWidth, H = host.offsetHeight || document.body.clientHeight;
    const A = o.area || { x: 0, y: 0, w: W, h: H };
    const kinds = o.kinds || ["circle", "ring", "square", "tri", "squiggle", "plus"];
    const cols = (o.colors || ["--accent", "--accent-2", "--accent-3"]).map((c) => color(c, host));
    const [s0, s1] = o.size || [40, 150];
    const els = [];
    for (let i = 0; i < (o.n || 8); i++) {
      const k = kinds[i % kinds.length], c = cols[i % cols.length], sz = s0 + r() * (s1 - s0);
      const svg = svgEl("svg", { class: "mo-svg-layer", width: sz, height: sz, viewBox: "0 0 100 100" });
      svg.style.left = A.x + r() * (A.w - sz) + "px"; svg.style.top = A.y + r() * (A.h - sz) + "px"; svg.style.opacity = o.opacity != null ? o.opacity : 0.9;
      const sw = { fill: "none", stroke: c, "stroke-width": 10, "stroke-linecap": "round", "stroke-linejoin": "round" };
      if (k === "circle") svgEl("circle", { cx: 50, cy: 50, r: 44, fill: c }, svg);
      else if (k === "ring") svgEl("circle", Object.assign({ cx: 50, cy: 50, r: 40 }, sw), svg);
      else if (k === "square") svgEl("rect", { x: 10, y: 10, width: 80, height: 80, rx: 12, fill: c }, svg);
      else if (k === "tri") svgEl("polygon", { points: "50,8 94,88 6,88", fill: c }, svg);
      else if (k === "plus") svgEl("path", Object.assign({ d: "M50 12 V88 M12 50 H88" }, sw, { "stroke-width": 16 }), svg);
      else svgEl("path", Object.assign({ d: "M6 60 Q 22 30 38 60 T 70 60 T 98 50" }, sw), svg);
      host.appendChild(svg);
      els.push(svg);
    }
    reveal(tl, els, at, { kind: "pop", stagger: 0.05, sfx: false });
    float(tl, els, at + 0.5, Math.max(0.5, dur - 0.5), { amp: 22, rot: 25, seed: (o.seed || 31) + 1 });
    return els;
  }

  /* ---------- charts and data ---------- */
  /** Bar chart. data = [{ label, value, hi? }]. o: { w, h, x, y, max, format: { prefix, suffix, decimals } } */
  function bars(container, data, o) {
    o = o || {};
    const host = need(qa(container), "bars", container)[0];
    const W = o.w || 1100, H = o.h || 520;
    const box = document.createElement("div");
    box.className = "mo-chart"; box.style.width = W + "px"; box.style.height = H + "px";
    box.style.left = (o.x != null ? o.x : (host.offsetWidth - W) / 2) + "px"; box.style.top = (o.y != null ? o.y : (host.offsetHeight - H) / 2) + "px";
    const axis = document.createElement("div"); axis.className = "mo-axis"; box.appendChild(axis);
    const max = o.max || Math.max.apply(null, data.map((d) => d.value)) * 1.08;
    const gap = W / data.length, bw = Math.min(gap * 0.62, o.barWidth || 200);
    const fs = px("--fs-label", 36);
    const items = data.map((d, i) => {
      const col = document.createElement("div");
      col.style.cssText = `position:absolute;left:${i * gap + (gap - bw) / 2}px;width:${bw}px;bottom:0;height:${H}px`;
      const fill = document.createElement("div"); fill.className = "mo-bar-fill" + (d.hi ? " mo-hi" : "");
      const hh = (d.value / max) * (H - fs * 1.6);
      fill.style.cssText = `left:0;right:0;height:${hh}px`;
      const val = document.createElement("div"); val.className = "mo-bar-val"; val.style.bottom = hh + 12 + "px";
      const lab = document.createElement("div"); lab.className = "mo-bar-lab"; lab.textContent = d.label;
      col.appendChild(fill); col.appendChild(val); col.appendChild(lab); box.appendChild(col);
      return { fill, val, lab, d };
    });
    host.appendChild(box);
    const f = o.format || {};
    return {
      el: box, items,
      build(tl, at, b) {
        b = b || {};
        const st = b.stagger != null ? b.stagger : D(0.14), dur = b.dur || D(0.8);
        tl.fromTo(axis, { scaleX: 0, transformOrigin: "0 50%" }, { scaleX: 1, duration: 0.4, ease: "power2.out" }, at);
        tl.fromTo(items.map((x) => x.lab), { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: st }, at + 0.1);
        items.forEach((x, i) => {
          const t = at + 0.2 + i * st;
          tl.fromTo(x.fill, { scaleY: 0 }, { scaleY: 1, duration: dur, ease: style().over ? "back.out(1.2)" : "power3.out" }, t);
          tl.fromTo(x.val, { opacity: 0 }, { opacity: 1, duration: 0.2 }, t + 0.1);
          count(tl, x.val, 0, x.d.value, t, Object.assign({ dur: dur, sfx: false }, f));
          cue(b, t, "pop", { gain: -8 });
        });
        return +(at + 0.2 + st * (items.length - 1) + dur).toFixed(3);
      },
    };
  }
  /** Line chart. points = [{ label, value }]. Draws the line, area and dots. */
  function lineChart(container, points, o) {
    o = o || {};
    const host = need(qa(container), "lineChart", container)[0];
    const W = o.w || 1200, H = o.h || 520;
    const box = document.createElement("div"); box.className = "mo-chart";
    box.style.width = W + "px"; box.style.height = H + "px";
    box.style.left = (o.x != null ? o.x : (host.offsetWidth - W) / 2) + "px"; box.style.top = (o.y != null ? o.y : (host.offsetHeight - H) / 2) + "px";
    host.appendChild(box);
    const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, box);
    const min = o.min != null ? o.min : 0, max = o.max || Math.max.apply(null, points.map((p) => p.value)) * 1.1;
    const pts = points.map((p, i) => ({ x: (i / Math.max(1, points.length - 1)) * W, y: H - ((p.value - min) / (max - min)) * H, p }));
    const d = pts.map((p, i) => (i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1)).join(" ");
    const area = svgEl("path", { class: "mo-line-area", d: d + ` L ${W} ${H} L 0 ${H} Z` }, svg);
    const path = svgEl("path", { class: "mo-line-path", d }, svg);
    const dots = pts.map((p) => svgEl("circle", { class: "mo-line-dot", cx: p.x, cy: p.y, r: 12 }, svg));
    const labs = pts.map((p) => {
      const l = document.createElement("div"); l.className = "mo-bar-lab"; l.textContent = p.p.label;
      l.style.cssText += `;left:${p.x - 100}px;width:200px;top:${H + 16}px`; box.appendChild(l); return l;
    });
    return {
      el: box, path, dots, points: pts,
      build(tl, at, b) {
        b = b || {};
        const dur = b.dur || D(1.4);
        const L = path.getTotalLength();
        path.style.strokeDasharray = L;
        tl.fromTo(labs, { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.05 }, at);
        tl.fromTo(path, { strokeDashoffset: L }, { strokeDashoffset: 0, duration: dur, ease: "power2.inOut" }, at + 0.1);
        tl.fromTo(area, { opacity: 0 }, { opacity: 0.16, duration: 0.6 }, at + dur * 0.6);
        dots.forEach((c, i) => tl.fromTo(c, { scale: 0, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.3, ease: "back.out(2)" }, at + 0.1 + (dur * i) / Math.max(1, dots.length - 1)));
        cue(b, at + 0.1, "swish", { gain: -8 });
        return +(at + 0.1 + dur).toFixed(3);
      },
    };
  }
  /** Ring / donut progress on an element: ring(tl, "#r", 0.72, t, { size, width, label: "#pct" }) */
  function ring(tl, target, value, at, o) {
    o = o || {};
    const host = need(qa(target), "ring", target)[0];
    const S = o.size || 420, sw = o.width || 36, R = (S - sw) / 2;
    host.classList.add("mo-chart"); host.style.width = S + "px"; host.style.height = S + "px";
    const svg = svgEl("svg", { width: S, height: S, viewBox: `0 0 ${S} ${S}` });
    host.insertBefore(svg, host.firstChild);
    svgEl("circle", { class: "mo-donut-track", cx: S / 2, cy: S / 2, r: R, "stroke-width": sw }, svg);
    const arc = svgEl("circle", { class: "mo-donut-arc", cx: S / 2, cy: S / 2, r: R, "stroke-width": sw, transform: `rotate(-90 ${S / 2} ${S / 2})` }, svg);
    if (o.color) arc.style.stroke = color(o.color, host);
    const C = 2 * Math.PI * R;
    arc.style.strokeDasharray = C;
    const dur = o.dur || D(1.3);
    tl.fromTo(arc, { strokeDashoffset: C }, { strokeDashoffset: C * (1 - value), duration: dur, ease: "power2.out" }, at);
    if (o.label) count(tl, o.label, 0, value * 100, at, { dur: dur, suffix: o.suffix != null ? o.suffix : "%", decimals: o.decimals || 0, sfx: false });
    cue(o, at, "riser", { dur: dur, gain: -12 });
    return +(at + dur).toFixed(3);
  }
  /** Horizontal timeline of dated stops. stops = [{ year, text }]. Returns { build(tl, at) }. */
  function timeline(container, stops, o) {
    o = o || {};
    const host = need(qa(container), "timeline", container)[0];
    const W = o.w || host.offsetWidth - 2 * px("--safe-l", 96) - 120, y = o.y != null ? o.y : host.offsetHeight * 0.5;
    const x0 = o.x != null ? o.x : (host.offsetWidth - W) / 2;
    const track = document.createElement("div"); track.className = "mo-tl-track";
    track.style.left = x0 + "px"; track.style.width = W + "px"; track.style.top = y + "px";
    const fill = document.createElement("div"); fill.className = "mo-tl-fill"; track.appendChild(fill);
    host.appendChild(track);
    const els = stops.map((s, i) => {
      const e = document.createElement("div"); e.className = "mo-tl-stop";
      e.style.left = x0 + (stops.length === 1 ? W / 2 : (i / (stops.length - 1)) * W) + "px"; e.style.top = y - 14 + "px";
      e.innerHTML = '<div class="mo-tl-dot"></div><div class="mo-tl-year"></div>' + (s.text ? '<div class="mo-tl-text"></div>' : "");
      e.querySelector(".mo-tl-year").textContent = s.year;
      if (s.text) e.querySelector(".mo-tl-text").textContent = s.text;
      host.appendChild(e);
      return e;
    });
    return {
      track, stops: els,
      build(tl, at, b) {
        b = b || {};
        const per = b.per || D(0.8);
        tl.fromTo(track, { opacity: 0 }, { opacity: 1, duration: 0.3 }, at);
        tl.fromTo(fill, { scaleX: 0 }, { scaleX: 1, duration: per * (els.length - 1) + 0.3, ease: "none" }, at + 0.2);
        els.forEach((e, i) => reveal(tl, e, at + 0.2 + i * per, { kind: "pop", sfx: i === 0 ? undefined : false }));
        els.forEach((e, i) => { if (i) cue(b, at + 0.2 + i * per, "tick", { gain: -4 }); });
        return +(at + 0.2 + per * (els.length - 1) + 0.45).toFixed(3);
      },
    };
  }

  /* ---------- scene transitions (on the scene's .mo-stage) ---------- */
  const ENTER = {
    push:  [{ xPercent: 100 }, { xPercent: 0, duration: 0.5, ease: EASE.move }],
    whip:  [{ xPercent: 115, filter: "blur(28px)" }, { xPercent: 0, filter: "blur(0px)", duration: 0.32, ease: EASE.snap }],
    up:    [{ yPercent: 100 }, { yPercent: 0, duration: 0.5, ease: EASE.move }],
    zoom:  [{ scale: 0.8, opacity: 0.3, filter: "blur(8px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.45, ease: EASE.snap }],
    fade:  [{ opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power1.inOut" }],
    rise:  [{ yPercent: 12, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.45, ease: EASE.in }],
    iris:  [{ clipPath: "circle(0% at 50% 50%)" }, { clipPath: "circle(75% at 50% 50%)", duration: 0.6, ease: "power3.inOut" }],
    wipe:  [{ clipPath: "inset(0% 0% 0% 100%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.55, ease: "power3.inOut" }],
    // 3D and blended kinds: give the two scenes an "overlap" (project.json) equal to the duration and
    // put enter/exit on the whole .mo-scene, so both faces are on screen together.
    // cube / cubeUp turn around the cube's centre, half a frame behind the screen (origin set in enter/exit).
    cube:   [{ rotationY: 90, transformPerspective: 2600 }, { rotationY: 0, duration: 0.8, ease: "power3.inOut" }],
    cubeUp: [{ rotationX: -90, transformPerspective: 2600 }, { rotationX: 0, duration: 0.8, ease: "power3.inOut" }],
    deck:   [{ xPercent: 70, z: -900, rotationY: -28, opacity: 0, transformPerspective: 2000 }, { xPercent: 0, z: 0, rotationY: 0, opacity: 1, duration: 0.8, ease: "expo.out" }],
    flip:   [{ rotationY: -90, transformPerspective: 2000 }, { rotationY: 0, duration: 0.35, ease: "power3.out" }],
    blur:   [{ opacity: 0, scale: 1.06, filter: "blur(24px)" }, { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.6, ease: "power2.inOut" }],
    spin:   [{ rotation: -12, scale: 1.5, opacity: 0, filter: "blur(16px)" }, { rotation: 0, scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.55, ease: "expo.out" }],
    deep:   [{ scale: 0.35, opacity: 0, filter: "blur(14px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.7, ease: "expo.out" }],
    back:   [{ scale: 2.4, opacity: 0, filter: "blur(16px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.8, ease: "expo.out" }],
    cut:   null,
  };
  const EXIT = {
    push:  { xPercent: -100, duration: 0.5, ease: EASE.move },
    whip:  { xPercent: -115, filter: "blur(28px)", duration: 0.28, ease: "expo.in" },
    up:    { yPercent: -100, duration: 0.5, ease: EASE.move },
    zoom:  { scale: 5, opacity: 0, filter: "blur(10px)", duration: 0.45, ease: "expo.in" },
    fade:  { opacity: 0, duration: 0.45, ease: "power1.inOut" },
    drop:  { yPercent: 10, opacity: 0, duration: 0.35, ease: EASE.out },
    iris:  { clipPath: "circle(0% at 50% 50%)", duration: 0.5, ease: "power3.in" },
    cube:   { rotationY: -90, transformPerspective: 2600, duration: 0.8, ease: "power3.inOut" },
    cubeUp: { rotationX: 90, transformPerspective: 2600, duration: 0.8, ease: "power3.inOut" },
    deck:   { xPercent: -45, z: -900, rotationY: 28, opacity: 0, transformPerspective: 2000, duration: 0.7, ease: "power3.in" },
    flip:   { rotationY: 90, transformPerspective: 2000, duration: 0.3, ease: "power3.in" },
    blur:   { opacity: 0, scale: 0.97, filter: "blur(24px)", duration: 0.6, ease: "power2.inOut" },
    spin:   { rotation: 10, scale: 0.6, opacity: 0, filter: "blur(16px)", duration: 0.45, ease: "power3.in" },
    deep:   { scale: 3.2, opacity: 0, filter: "blur(18px)", duration: 0.6, ease: "power3.in" },
    back:   { scale: 0.4, opacity: 0, filter: "blur(12px)", duration: 0.7, ease: "power3.in" },
    cut:   null,
  };
  /** Scene entrance at `at` (usually 0). kind defaults to the style's (--mo-enter). */
  function enter(tl, stage, at, kind, o) {
    kind = kind || style().enter;
    const k = ENTER[kind];
    if (!k) return at;
    const loud = ["whip", "push", "up", "cube", "cubeUp", "deck", "spin", "deep", "back"].indexOf(kind) >= 0;
    cue(o, Math.max(0, at - 0.06), "whoosh", { dur: 0.45, gain: loud ? -2 : -8 });
    tl.fromTo(q(stage), Object.assign(cubeOrigin(stage, kind), k[0]), Object.assign({}, k[1]), at);
    return at + k[1].duration;
  }
  /** Scene exit ending exactly at `end` (pass the scene duration). Pair kinds with the next enter. */
  function exit(tl, stage, end, kind, o) {
    kind = kind || style().enter;
    const k = EXIT[kind] || EXIT[{ wipe: "push", rise: "fade" }[kind]];
    if (!k) return end;
    // With an overlap the next scene's enter already makes the whoosh.
    if (!(o && o.overlap)) cue(o, end - k.duration - 0.05, "whoosh", { dur: k.duration + 0.15, gain: kind === "whip" ? 0 : -4 });
    tl.to(q(stage), Object.assign(cubeOrigin(stage, kind), k), end - k.duration);
    return end;
  }
  function cubeOrigin(stage, kind) {
    if (kind !== "cube" && kind !== "cubeUp") return {};
    const host = q(stage).closest("[data-width]");
    const W = host ? +host.getAttribute("data-width") : 1920, H = host ? +host.getAttribute("data-height") : 1080;
    return { transformOrigin: `50% 50% ${-(kind === "cube" ? W : H) / 2}px` };
  }
  /** Colour panel wipe across the frame, covering the cut at `end` (put it at the end of scene N with
   *  { half: "in" } and at the start of scene N+1 with { half: "out" }, same colour). */
  function panel(tl, scene, at, o) {
    o = o || {};
    const host = need(qa(scene), "panel", scene)[0];
    const p = document.createElement("div");
    p.style.cssText = `position:absolute;inset:0;z-index:45;pointer-events:none;background:${color(o.color || "--accent", host)}`;
    host.appendChild(p);
    const dur = o.dur || 0.4;
    if (o.half === "out") {
      tl.fromTo(p, { xPercent: 0 }, { xPercent: -101, duration: dur, ease: "power3.in" }, at);
      return at + dur;
    }
    tl.fromTo(p, { xPercent: 101 }, { xPercent: 0, duration: dur, ease: "power3.out" }, at - dur);
    cue(o, at - dur - 0.03, "whoosh", { dur: dur + 0.2, gain: -2 });
    return at;
  }

  /* ---------- camera ---------- */
  function offsetIn(el, ancestor) {
    let x = 0, y = 0, n = el;
    while (n && n !== ancestor) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x, y };
  }
  // Camera moves are evaluated on every frame from the list of moves (targets resolved once the
  // element is laid out), so the camera is right whatever frame is drawn first.
  function camMove(tl, cam, toFn, at, dur, ease) {
    if (!cam._moMoves) {
      const moves = (cam._moMoves = []);
      const home = () => ({ s: 1, fx: cam.offsetWidth / 2, fy: cam.offsetHeight / 2 });
      onFrame(tl, (t) => {
        if (!laidOut(cam)) return;
        let st = home();
        for (const m of moves) {
          if (t <= m.at) break;
          if (!m.to) { if (!laidOut(cam)) return; m.to = m.toFn(); }
          const e = m.ease(Math.min(1, (t - m.at) / m.dur));
          const from = st, to = m.to;
          st = { s: from.s * Math.pow(to.s / from.s, e), fx: from.fx + (to.fx - from.fx) * e, fy: from.fy + (to.fy - from.fy) * e };
          if (e < 1) break;
        }
        gsap.set(cam, { x: cam.offsetWidth / 2 - st.fx * st.s, y: cam.offsetHeight / 2 - st.fy * st.s, scale: st.s, transformOrigin: "0 0" });
      });
    }
    cam._moMoves.push({ at, dur, toFn, ease: gsap.parseEase(ease), to: null });
    cam._moMoves.sort((a, b) => a.at - b.at);
    tl.to({}, { duration: dur }, at);
  }
  /** Centre and scale the camera layer on `target` (an element inside it). */
  function zoom(tl, camera, target, at, o) {
    o = o || {};
    const cam = q(camera), el = q(target), dur = o.dur || D(1.1);
    camMove(tl, cam, () => { const p = offsetIn(el, cam); return { s: o.scale || 2, fx: p.x + el.offsetWidth / 2 + (o.dx || 0), fy: p.y + el.offsetHeight / 2 + (o.dy || 0) }; }, at, dur, o.ease || EASE.cam);
    cue(o, at + dur * 0.15, "whoosh", { dur: dur * 0.7, gain: -8 });
    return +(at + dur).toFixed(3);
  }
  /** Zoom-through: dive into `target` until it fills the frame, ending at `end`. Pair with enter "zoom". */
  function dive(tl, camera, target, end, o) {
    o = o || {};
    const dur = o.dur || 0.7, cam = q(camera);
    zoom(tl, cam, target, end - dur, { scale: o.scale || 6, dur: dur, ease: "power3.in", sfx: false });
    tl.to(cam, { opacity: 0, duration: 0.12, ease: "none" }, end - 0.12);
    cue(o, end - dur, "whoosh", { dur: dur + 0.1, gain: -2 });
    return end;
  }
  function home(tl, camera, at, o) {
    o = o || {};
    const cam = q(camera), dur = o.dur || D(0.9);
    camMove(tl, cam, () => ({ s: 1, fx: cam.offsetWidth / 2, fy: cam.offsetHeight / 2 }), at, dur, o.ease || EASE.cam);
    return +(at + dur).toFixed(3);
  }
  /** Slow push-in over the whole scene (hides static frames, adds depth). */
  function push(tl, camera, at, dur, o) {
    o = o || {};
    tl.fromTo(q(camera), { scale: 1 }, { scale: o.scale || 1.06, duration: dur, ease: "sine.inOut", transformOrigin: "50% 50%", immediateRender: false }, at);
    return at + dur;
  }
  /** Parallax: move layers at different depths by dx/dy over dur. layers = [[el, depth 0..1], ...] */
  function parallax(tl, layers, at, dur, o) {
    o = o || {};
    layers.forEach(([el, depth]) => tl.fromTo(q(el), { x: 0, y: 0 }, { x: (o.dx || -80) * depth, y: (o.dy || 0) * depth, duration: dur, ease: "sine.inOut", immediateRender: false }, at));
    return at + dur;
  }

  /* ---------- diagrams (systems, processes, flows) ---------- */
  function luminance(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return 1;
    const n = parseInt(m[1], 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function textWidth(str, size, mono) {
    if (mono) return String(str).length * size * 0.62;
    let w = 0;
    for (const ch of String(str)) w += /[MWmw@%]/.test(ch) ? 0.9 : /[A-Z0-9]/.test(ch) ? 0.7 : /[ilj.,:;|!' ]/.test(ch) ? 0.3 : 0.58;
    return w * size;
  }
  function iconMarkup(ic) {
    if (!ic) return "";
    if (typeof ic === "string") {
      if (ic.trim().startsWith("<")) return ic;
      if (g.MO_ICONS && g.MO_ICONS[ic]) return g.MO_ICONS[ic].svg;
      return `<svg viewBox="0 0 24 24"><path d="${ic}" fill="currentColor"/></svg>`;
    }
    if (ic.svg) return ic.svg;
    let c = ic.color ? (ic.color[0] === "#" ? ic.color : "#" + ic.color) : "currentColor";
    if (ic.color && luminance(c) < 0.12) c = "currentColor";
    return `<svg viewBox="${ic.viewBox || "0 0 24 24"}"><path d="${ic.path}" fill="${c}"/></svg>`;
  }
  /**
   * spec = { nodes: [{ id, label, sub?, icon?, x, y, w?, h?, ghost? }], edges: [{ from, to, label?, dashed?, axis? }] }
   * icon: a name from MO_ICONS, an SVG string, or a brand { path, color }. Coordinates are centres in px.
   */
  function diagram(container, spec, o) {
    o = o || {};
    const root = q(container);
    const pre = (o.prefix || "d") + "-";
    const W = root.offsetWidth || document.body.clientWidth || 1920, H = root.offsetHeight || document.body.clientHeight || 1080;
    const fsL = px("--fs-label", 36), fsS = px("--fs-sub", 30);
    const monoLabels = /mono/i.test(cssVar(document.body, "--font-body"));
    const defH = Math.max(104, Math.round(fsL * 1.1 + fsS * 1.2 + 40));
    const nodes = {}, edges = {};
    const svg = svgEl("svg", { class: "mo-edges", width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    root.appendChild(svg);
    spec.nodes.forEach((n) => {
      const textW = Math.max(textWidth(n.label || "", fsL, monoLabels), textWidth(n.sub || "", fsS, false));
      const need2 = Math.ceil(56 + (n.icon ? 74 : 0) + textW + 16);
      const w = Math.max(n.w || 300, need2), h = n.h || defH;
      const el = document.createElement("div");
      el.className = "mo-node" + (n.ghost ? " mo-ghost" : "");
      el.id = pre + "n-" + n.id;
      el.style.left = n.x - w / 2 + "px"; el.style.top = n.y - h / 2 + "px"; el.style.width = w + "px"; el.style.height = h + "px";
      if (n.align === "center") el.style.justifyContent = "center";
      el.innerHTML = (n.icon ? `<div class="mo-node-icon">${iconMarkup(n.icon)}</div>` : "") + `<div><div class="mo-label"></div>${n.sub ? `<div class="mo-sub"></div>` : ""}</div>`;
      el.querySelector(".mo-label").textContent = n.label;
      if (n.sub) el.querySelector(".mo-sub").textContent = n.sub;
      root.appendChild(el);
      nodes[n.id] = { el, x: n.x, y: n.y, w, h };
    });
    const HEAD = 16, sideOf = {}, slots = {};
    spec.edges.forEach((e, i) => {
      const a = nodes[e.from], b = nodes[e.to];
      if (!a || !b) return;
      const dx = b.x - a.x, dy = b.y - a.y;
      const horiz = e.axis ? e.axis === "h" : Math.abs(dx) - (a.w + b.w) / 2 >= Math.abs(dy) - (a.h + b.h) / 2;
      const outS = horiz ? (dx >= 0 ? "r" : "l") : (dy >= 0 ? "b" : "t"), inS = horiz ? (dx >= 0 ? "l" : "r") : (dy >= 0 ? "t" : "b");
      sideOf[i] = { outK: e.from + ":" + outS, inK: e.to + ":" + inS };
      (slots[e.from + ":" + outS] = slots[e.from + ":" + outS] || []).push({ i, key: horiz ? b.y : b.x });
      (slots[e.to + ":" + inS] = slots[e.to + ":" + inS] || []).push({ i, key: horiz ? a.y : a.x });
    });
    const offset = (k, i, span) => {
      const list = slots[k].slice().sort((p, q2) => p.key - q2.key), n = list.length, idx = list.findIndex((x) => x.i === i);
      return n < 2 ? 0 : (idx - (n - 1) / 2) * Math.min(34, span / (n + 1));
    };
    spec.edges.forEach((e, ei) => {
      const a = nodes[e.from], b = nodes[e.to];
      if (!a || !b) throw new Error("MO.diagram: unknown node in edge " + e.from + " -> " + e.to);
      const dx = b.x - a.x, dy = b.y - a.y;
      const horiz = e.axis ? e.axis === "h" : Math.abs(dx) - (a.w + b.w) / 2 >= Math.abs(dy) - (a.h + b.h) / 2;
      let x1, y1, x2, y2, d;
      const sd = sideOf[ei];
      if (horiz) {
        const sx = Math.sign(dx) || 1;
        x1 = a.x + sx * (a.w / 2 + 6); y1 = a.y + offset(sd.outK, ei, a.h); x2 = b.x - sx * (b.w / 2 + 6 + HEAD); y2 = b.y + offset(sd.inK, ei, b.h);
        const mx = (x1 + x2) / 2;
        d = Math.abs(y2 - y1) < 2 ? `M ${x1} ${y1} L ${x2} ${y2}` : `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
      } else {
        const sy = Math.sign(dy) || 1;
        x1 = a.x + offset(sd.outK, ei, a.w); y1 = a.y + sy * (a.h / 2 + 6); x2 = b.x + offset(sd.inK, ei, b.w); y2 = b.y - sy * (b.h / 2 + 6 + HEAD);
        const my = (y1 + y2) / 2;
        d = Math.abs(x2 - x1) < 2 ? `M ${x1} ${y1} L ${x2} ${y2}` : `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
      }
      const path = svgEl("path", { class: "mo-edge", d, id: pre + "e-" + e.from + "-" + e.to }, svg);
      const L = path.getTotalLength();
      const pe = path.getPointAtLength(L), pb = path.getPointAtLength(Math.max(0, L - 2));
      const ang = (Math.atan2(pe.y - pb.y, pe.x - pb.x) * 180) / Math.PI;
      const head = svgEl("polygon", { class: "mo-head", points: `0,${-HEAD / 1.6} ${HEAD},0 0,${HEAD / 1.6}`, transform: `translate(${x2} ${y2}) rotate(${ang})` }, svg);
      let label = null;
      if (e.label) {
        const mid = path.getPointAtLength(L / 2);
        label = svgEl("text", { class: "mo-edge-label", x: mid.x, y: mid.y - (horiz ? 18 : 0) + (horiz ? 0 : 8), "text-anchor": horiz ? "middle" : "start", dx: horiz ? 0 : 16 }, svg);
        label.textContent = e.label;
      }
      path.style.strokeDasharray = L; path.style.strokeDashoffset = L;
      head.style.opacity = 0;
      if (label) label.style.opacity = 0;
      edges[e.from + ">" + e.to] = { path, head, label, dashed: !!e.dashed, from: e.from, to: e.to };
    });
    const api = {
      el: root, svg, nodes, edges,
      node: (id) => nodes[id].el,
      edge: (a, b) => edges[a + ">" + b].path,
      allNodes: () => Object.keys(nodes).map((k) => nodes[k].el),
      build(tl, at, b) {
        b = b || {};
        const order = b.order || spec.nodes.map((n) => n.id), step = b.step != null ? b.step : D(0.32), edgeDur = b.edgeDur != null ? b.edgeDur : 0.45;
        const shown = {}, drawn = {};
        let t = at, end = at;
        order.forEach((id) => {
          end = Math.max(end, reveal(tl, nodes[id].el, t, { kind: "card", dur: 0.45, sfx: b.sfx }));
          shown[id] = true;
          Object.keys(edges).forEach((k) => {
            const E = edges[k];
            if (drawn[k] || !shown[E.from] || !shown[E.to]) return;
            drawn[k] = true;
            end = Math.max(end, api.draw(tl, E.from, E.to, t + 0.18, { dur: edgeDur }));
          });
          t += step;
        });
        return +end.toFixed(3);
      },
      draw(tl, a, b, at2, d2) {
        d2 = d2 || {};
        const E = edges[a + ">" + b], len = E.path.getTotalLength(), dur = d2.dur || 0.45;
        tl.fromTo(E.path, { strokeDasharray: len, strokeDashoffset: len }, { strokeDasharray: len, strokeDashoffset: 0, duration: dur, ease: "power2.inOut" }, at2);
        if (E.dashed) tl.set(E.path, { strokeDasharray: "10 12", strokeDashoffset: 0 }, at2 + dur);
        tl.fromTo(E.head, { opacity: 0 }, { opacity: 1, duration: dur * 0.3, ease: "none" }, at2 + dur * 0.75);
        if (E.label) tl.fromTo(E.label, { opacity: 0 }, { opacity: 1, duration: 0.25 }, at2 + dur * 0.6);
        return at2 + dur;
      },
      flow(tl, ids, at2, f) {
        f = f || {};
        let t = at2;
        for (let i = 0; i < ids.length - 1; i++) {
          const fwd = edges[ids[i] + ">" + ids[i + 1]], back = edges[ids[i + 1] + ">" + ids[i]];
          if (!fwd && !back) throw new Error("MO.flow: no edge between " + ids[i] + " and " + ids[i + 1]);
          t = packet(tl, (fwd || back).path, t, Object.assign({}, f, { reverse: !fwd, hit: nodes[ids[i + 1]].el }));
          t += f.gap != null ? f.gap : 0.05;
        }
        return +t.toFixed(3);
      },
      cascade(tl, ids, at2, c) {
        const col = color(c || "--ok", root);
        let t = at2;
        ids.forEach((id, i) => {
          if (i > 0) {
            const E = edges[ids[i - 1] + ">" + id] || edges[id + ">" + ids[i - 1]];
            if (E) { tl.to(E.path, { stroke: col, duration: 0.15 }, t - 0.1); tl.to(E.head, { fill: col, duration: 0.15 }, t - 0.05); }
          }
          tl.to(nodes[id].el, { "--state": col, duration: 0.2, ease: "power2.out" }, t);
          pulse(tl, nodes[id].el, t + 0.03, { scale: 1.05 });
          cue(null, t, i === ids.length - 1 ? "ding" : "tick", { gain: i === ids.length - 1 ? 0 : -3 });
          t += 0.18;
        });
        return +t.toFixed(3);
      },
      tint(tl, a, b, at2, c, op) {
        const E = edges[a + ">" + b], col = color(c, root);
        tl.to([E.path], { stroke: col, duration: 0.1 }, at2);
        tl.to([E.head], { fill: col, duration: 0.1 }, at2);
        if (op && op.dim) tl.to([E.path, E.head], { opacity: 0.3, duration: 0.2 }, at2 + 0.1);
        return at2 + 0.1;
      },
    };
    return api;
  }
  /** A glowing dot (short tail) along an SVG path. Returns arrival time. */
  function packet(tl, path, at, o) {
    o = o || {};
    const p = q(path), svg = p.ownerSVGElement, len = p.getTotalLength();
    const dur = o.dur || Math.max(0.35, len / (o.speed || 650));
    const r = o.size || 11, col = o.color ? color(o.color, p) : null, tail = o.tail != null ? o.tail : 3;
    const dots = [];
    for (let i = tail; i >= 0; i--) {
      const c = svgEl("circle", { class: "mo-packet", r: i === 0 ? r : r * (1 - i * 0.18), cx: -100, cy: -100 }, svg);
      if (col) c.style.fill = col;
      dots.push({ c, lag: i * 0.045, base: i === 0 ? 1 : [0, 0.6, 0.35, 0.15][i] || 0.1 });
    }
    const prog = { t: 0 };
    const place = () => dots.forEach((d) => {
      const u = Math.min(1, Math.max(0, (prog.t - d.lag) / dur));
      const pt = p.getPointAtLength((o.reverse ? 1 - u : u) * len);
      d.c.setAttribute("cx", pt.x); d.c.setAttribute("cy", pt.y);
      d.c.style.opacity = prog.t > d.lag && prog.t <= dur + 0.08 ? d.base : 0;
    });
    dots.forEach((d) => { d.c.style.opacity = 0; });
    tl.fromTo(prog, { t: 0 }, { t: dur + 0.2, duration: dur + 0.2, ease: "none", onUpdate: place, immediateRender: false }, at);
    if (o.hit) { pulse(tl, o.hit, at + dur - 0.02, { scale: 1.06 }); cue(o, at + dur - 0.02, "tick", { gain: -2 }); }
    return +(at + dur).toFixed(3);
  }

  g.MO = {
    cues: CUES, cue: (t, sfx, extra) => cue(null, t, sfx, extra), EASE, rng, q, qa, color, style, snap, beat: beatLen,
    reveal, hide, words, chars, lines, punch, scramble, mark, scribble, type, stream, captions,
    atWord, shapes, pulse, breathe, float, focus, unfocus, glitch, fail, ok, swap, highlight, count, flash, shine, drift,
    icon, icons, draw, morph, along, confetti, burst, bars, lineChart, ring, timeline,
    enter, exit, panel, zoom, dive, home, push, parallax, diagram, packet, onFrame,
  };
})(window);
