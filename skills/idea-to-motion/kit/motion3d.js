/* idea-to-motion 3D layer (MO3D): three.js inside a kit scene, drawn from the scene timeline.
 * `motion sync` ships three.js (window.THREE), this file and the style's fonts as 3D outlines
 * (window.MO_FONTS3D) whenever a scene calls MO3D.
 *
 *   const st = MO3D.stage(tl, "#s1-gl", { D, cam: [0, 0.4, 9], bloom: 0.5 });
 *   const word = MO3D.text(st, "HONEY", { mat: "gold", size: 1.4 });
 *   MO3D.letters(tl, word, 0.2);                       // letters flip up one by one
 *   MO3D.cam(tl, st, 1.5, { pos: [2, 0.6, 7], dur: 2.5 });
 *
 * Objects are plain three.js objects: animate them with GSAP on obj.position / obj.rotation /
 * obj.scale (absolute times on the scene timeline). The stage renders after every timeline
 * update, so any frame can be drawn on its own (seek-safe). No clock, no rAF, seeded randomness.
 */
(function (g) {
  "use strict";
  const T = g.THREE;
  if (!T) { console.warn("MO3D: three.js not loaded (run motion sync)"); return; }
  const MO = g.MO;
  const DEG = Math.PI / 180;

  const cssVar = (name, el) => getComputedStyle(el || document.body).getPropertyValue(name).trim();
  function col(c, el) {
    if (c instanceof T.Color) return c;
    if (typeof c === "string" && c.indexOf("--") === 0) c = cssVar(c, el) || "#ffffff";
    return new T.Color(c == null ? "#ffffff" : c);
  }
  const v3 = (a, d) => (Array.isArray(a) ? new T.Vector3(a[0], a[1], a[2]) : a instanceof T.Vector3 ? a.clone() : d.clone());

  /* ---------- stage ---------- */
  const PMREM = new WeakMap();
  /** A three.js stage on a <canvas> (or inside a host element). o: { D (scene length), cam: [x,y,z],
   *  look: [x,y,z], fov (35), bg: null (transparent: the CSS background shows) | "--bg" | "#hex",
   *  env: "studio" | "none", envIntensity (1), exposure (1), bloom: 0 | strength (0.3–1.2, needs bg),
   *  fog: { color, near, far }, lights: true, key: "#fff4e6", rim: "--accent", shadow: false,
   *  floor: false | { y, opacity } (contact shadow) }. Returns st: { T, scene, camera, renderer,
   *  look, root, frame(fn), render() }. */
  function stage(tl, target, o) {
    o = o || {};
    let canvas = MO.q(target);
    if (!canvas) throw new Error("MO3D.stage: no element matches " + target);
    if (canvas.tagName !== "CANVAS") {
      const c = document.createElement("canvas");
      c.className = "mo-gl";
      canvas.appendChild(c);
      canvas = c;
    }
    const root = canvas.closest("[data-width]") || document.body;
    const W = +root.getAttribute("data-width") || 1920, H = +root.getAttribute("data-height") || 1080;
    canvas.width = W; canvas.height = H;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    const LITE = !!g.MO3D_HARNESS; // check harness: build everything, draw nothing
    const transparent = o.bg == null && !o.bloom;
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: transparent, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = o.exposure || 1;
    if (o.shadow || o.floor) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap; }
    const scene = new T.Scene();
    if (!transparent) scene.background = col(o.bg || "--bg", canvas);
    if (o.fog) scene.fog = new T.Fog(col(o.fog.color || o.bg || "--bg", canvas), o.fog.near || 8, o.fog.far || 40);
    if (o.env !== "none" && !LITE) {
      const pm = new T.PMREMGenerator(renderer);
      scene.environment = pm.fromScene(new T.RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = o.envIntensity != null ? o.envIntensity : 0.8;
      PMREM.set(renderer, pm);
    }
    const camera = new T.PerspectiveCamera(o.fov || 35, W / H, 0.05, 4000);
    camera.position.copy(v3(o.cam, new T.Vector3(0, 0, 10)));
    const look = v3(o.look, new T.Vector3(0, 0, 0));
    if (o.lights !== false) {
      scene.add(new T.HemisphereLight(0xffffff, 0x222233, 0.2));
      const key = new T.DirectionalLight(col(o.key || "#fff4e6", canvas), o.keyIntensity != null ? o.keyIntensity : 1.3);
      key.position.set(4, 6, 6);
      if (o.shadow || o.floor) {
        key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048);
        const s = key.shadow.camera; s.left = -10; s.right = 10; s.top = 10; s.bottom = -10; s.near = 0.5; s.far = 40;
        key.shadow.radius = 6; key.shadow.bias = -0.0004;
      }
      scene.add(key);
      const rim = new T.DirectionalLight(col(o.rim || "--accent", canvas), o.rimIntensity != null ? o.rimIntensity : 1.6);
      rim.position.set(-6, 3, -5);
      scene.add(rim);
    }
    const group = new T.Group();
    scene.add(group);
    if (o.floor) {
      const f = typeof o.floor === "object" ? o.floor : {};
      const plane = new T.Mesh(new T.PlaneGeometry(80, 80), new T.ShadowMaterial({ opacity: f.opacity != null ? f.opacity : 0.35 }));
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = f.y != null ? f.y : -1.2;
      plane.receiveShadow = true;
      scene.add(plane);
    }
    let composer = null;
    if (o.bloom && !LITE) {
      composer = new T.EffectComposer(renderer);
      composer.setPixelRatio(1);
      composer.setSize(W, H);
      composer.addPass(new T.RenderPass(scene, camera));
      composer.addPass(new T.UnrealBloomPass(new T.Vector2(W, H), o.bloom, o.bloomRadius != null ? o.bloomRadius : 0.5, o.bloomThreshold != null ? o.bloomThreshold : 0.88));
      composer.addPass(new T.OutputPass());
    }
    const each = [], after = [];
    const st = {
      T, scene, camera, renderer, look, root: group, canvas, W, H, freeLook: false,
      /** fn(t) runs on every frame before drawing (for things computed from time). */
      frame(fn) { each.push(fn); return st; },
      /** fn(t) runs after the camera is placed (screen projections: labels). */
      after(fn) { after.push(fn); return st; },
      render(t) {
        each.forEach((fn) => fn(t));
        camera.updateProjectionMatrix();
        if (!st.freeLook) camera.lookAt(look);
        camera.updateMatrixWorld();
        scene.updateMatrixWorld();
        after.forEach((fn) => fn(t));
        if (LITE) return;
        if (composer) composer.render(); else renderer.render(scene, camera);
      },
    };
    // Keep the timeline as long as the scene, so the stage is drawn on every frame.
    if (o.D) tl.to({}, { duration: o.D }, 0);
    MO.onFrame(tl, (t) => st.render(t));
    st.render(0);
    return st;
  }

  /* ---------- materials ---------- */
  /** Material presets: gold, chrome, metal, glass, plastic (glossy), satin (soft, the default for
   *  extruded emoji and logos: pale colours do not blow out under bloom), clay (matte), neon (glowing,
   *  pair with bloom; o.glow 0.5–1 keeps the colour, over 1.5 clips to white), pearl, toon, wire, basic. color: "--accent", "#hex". o: { roughness, metalness,
   *  emissive, opacity }. */
  function mat(kind, color, o) {
    if (kind && kind.isMaterial) return kind;
    o = o || {};
    const c = (d) => col(color || d);
    let m;
    switch (kind || "plastic") {
      case "gold": m = new T.MeshPhysicalMaterial({ color: c("#E9B649"), metalness: 1, roughness: 0.26, clearcoat: 0.4 }); break;
      case "chrome": m = new T.MeshPhysicalMaterial({ color: c("#FFFFFF"), metalness: 1, roughness: 0.1 }); break;
      case "metal": m = new T.MeshPhysicalMaterial({ color: c("#B8C0CC"), metalness: 1, roughness: 0.38 }); break;
      case "glass": m = new T.MeshPhysicalMaterial({ color: c("#FFFFFF"), metalness: 0, roughness: 0.03, transmission: 1, thickness: 0.35, ior: 1.25, dispersion: 6, specularIntensity: 1, envMapIntensity: 0.5 }); break;
      case "clay": m = new T.MeshStandardMaterial({ color: c("#E8E2D6"), metalness: 0, roughness: 0.92 }); break;
      case "neon": m = new T.MeshStandardMaterial({ color: c("--accent"), emissive: c("--accent"), emissiveIntensity: o.glow || 0.7, roughness: 0.4 }); break;
      case "pearl": m = new T.MeshPhysicalMaterial({ color: c("#F4F1EC"), metalness: 0, roughness: 0.25, iridescence: 1, iridescenceIOR: 1.6, sheen: 1, clearcoat: 1 }); break;
      case "toon": m = new T.MeshToonMaterial({ color: c("--accent") }); break;
      case "wire": m = new T.MeshBasicMaterial({ color: c("--accent"), wireframe: true, transparent: true, opacity: o.opacity != null ? o.opacity : 0.6 }); break;
      case "basic": m = new T.MeshBasicMaterial({ color: c("--accent") }); break;
      case "satin": m = new T.MeshStandardMaterial({ color: c("--accent"), metalness: 0, roughness: 0.55, envMapIntensity: 0.6 }); break;
      default: m = new T.MeshPhysicalMaterial({ color: c("--accent"), metalness: 0, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15 });
    }
    ["roughness", "metalness", "emissiveIntensity"].forEach((k) => { if (o[k] != null) m[k] = o[k]; });
    if (o.emissive) { m.emissive = col(o.emissive); m.emissiveIntensity = o.glow || 1.5; }
    if (o.opacity != null && kind !== "wire") { m.transparent = true; m.opacity = o.opacity; }
    return m;
  }
  function meshMat(o, def) { return o.mat && o.mat.isMaterial ? o.mat : mat(o.mat || def, o.color, o); }
  function shadowy(mesh, o) { mesh.castShadow = o.shadow !== false; mesh.receiveShadow = !!o.receive; return mesh; }

  /* ---------- 3D type ---------- */
  const FONTS = {};
  function font(name) {
    const F = g.MO_FONTS3D || {};
    const key = F[name] ? name : F.display ? "display" : Object.keys(F)[0];
    if (!key) throw new Error("MO3D.text: no 3D font (run motion sync online once)");
    return FONTS[key] || (FONTS[key] = new T.Font(F[key]));
  }
  // Half the cap height: text is centred on its capitals (valign "middle"), so y = 0 is the optical centre.
  function capMid(f, size) {
    const H = f.data.glyphs.H;
    const capH = H ? (H.o.match(/-?\d+/g) || []).filter((_, i) => i % 2 === 1).reduce((m, v) => Math.max(m, +v), 0) : f.data.resolution * 0.7;
    return (capH / f.data.resolution) * size / 2;
  }
  function textGeo(str, o) {
    const size = o.size || 1;
    const geo = new T.TextGeometry(str, {
      font: font(o.font || "display"), size, depth: o.depth != null ? o.depth : size * 0.28, curveSegments: o.curve || 10,
      bevelEnabled: o.bevel !== false, bevelThickness: size * 0.035, bevelSize: size * 0.022, bevelSegments: 5,
    });
    return geo;
  }
  /** Extruded text in the style's display font (font: "body" for the body font). One line.
   *  o: { size (cap height ~0.7×size, world units), depth, bevel, mat, color, side (material for
   *  the sides), align: "center" | "left" | "right", valign: "middle" (centred on the capitals) |
   *  "baseline", letters: true (a group of per-letter meshes, for MO3D.letters), tracking (em) }. Returns a Mesh, or a Group when letters: true. */
  function text(st, str, o) {
    o = o || {};
    str = String(str);
    const face = meshMat(o, "plastic"), side = o.side ? mat(o.side, o.sideColor || o.color) : face;
    const size = o.size || 1, f = font(o.font || "display"), scale = size / f.data.resolution;
    const track = (o.tracking || 0) * size;
    let obj;
    if (o.letters) {
      obj = new T.Group();
      let x = 0;
      for (const ch of str) {
        const gl = f.data.glyphs[ch] || f.data.glyphs["?"];
        const adv = (gl ? gl.ha : f.data.resolution * 0.5) * scale;
        if (ch.trim()) {
          const geo = textGeo(ch, o);
          geo.computeBoundingBox();
          const bb = geo.boundingBox, cx = (bb.min.x + bb.max.x) / 2;
          geo.translate(-cx, 0, -(o.depth != null ? o.depth : size * 0.28) / 2);
          const m = shadowy(new T.Mesh(geo, [face, side]), o);
          const pivot = new T.Group();
          pivot.position.x = x + cx;
          pivot.add(m);
          pivot.userData.char = ch;
          obj.add(pivot);
        }
        x += adv + track;
      }
      const w = x - track;
      const shift = o.align === "left" ? 0 : o.align === "right" ? -w : -w / 2;
      const lift = o.valign === "baseline" ? 0 : -capMid(f, size);
      obj.children.forEach((p) => { p.position.x += shift; p.position.y += lift; });
      obj.userData.width = w;
    } else {
      const geo = textGeo(str, o);
      geo.computeBoundingBox();
      const bb = geo.boundingBox, w = bb.max.x - bb.min.x;
      const dx = o.align === "left" ? -bb.min.x : o.align === "right" ? -bb.max.x : -(bb.min.x + bb.max.x) / 2;
      geo.translate(dx, o.valign === "baseline" ? 0 : -capMid(f, size), -(bb.max.z + bb.min.z) / 2);
      obj = shadowy(new T.Mesh(geo, [face, side]), o);
      obj.userData.width = w;
    }
    (o.parent || st.root).add(obj);
    return obj;
  }

  /* ---------- shapes ---------- */
  /** Primitive: sphere, box, rbox (rounded), torus, knot, icosa, octa, dodeca, ring, cylinder, cone,
   *  capsule, coin, plane, blob (organic, seeded). o: { size (≈ radius / half-width), mat, color,
   *  detail, seed, parent }. */
  function shape(st, kind, o) {
    o = o || {};
    const s = o.size || 1;
    let geo;
    switch (kind) {
      case "box": geo = new T.BoxGeometry(s * 2, s * 2, s * 2); break;
      case "rbox": geo = new T.RoundedBoxGeometry(s * 2 * (o.w || 1), s * 2 * (o.h || 1), s * 2 * (o.d || 1), 6, s * (o.radius || 0.25)); break;
      case "torus": geo = new T.TorusGeometry(s, s * (o.tube || 0.32), 48, 160); break;
      case "knot": geo = new T.TorusKnotGeometry(s * 0.8, s * (o.tube || 0.26), 320, 48, o.p || 2, o.q || 3); break;
      case "icosa": geo = new T.IcosahedronGeometry(s, o.detail || 0); break;
      case "octa": geo = new T.OctahedronGeometry(s, o.detail || 0); break;
      case "dodeca": geo = new T.DodecahedronGeometry(s, o.detail || 0); break;
      case "ring": geo = new T.TorusGeometry(s, s * 0.06, 24, 200); break;
      case "cylinder": geo = new T.CylinderGeometry(s, s, s * 2 * (o.h || 1), 96); break;
      case "cone": geo = new T.ConeGeometry(s, s * 2 * (o.h || 1), 96); break;
      case "capsule": geo = new T.CapsuleGeometry(s * 0.6, s * 1.2 * (o.h || 1), 16, 48); break;
      case "coin": geo = new T.CylinderGeometry(s, s, s * 0.16, 96); geo.rotateX(Math.PI / 2); break;
      case "plane": geo = new T.PlaneGeometry(s * 2 * (o.w || 1), s * 2 * (o.h || 1)); break;
      case "blob": {
        geo = new T.IcosahedronGeometry(s, o.detail || 24);
        const r = MO.rng(o.seed || 7), pos = geo.attributes.position, v = new T.Vector3();
        const k = [0, 1, 2, 3].map(() => ({ a: new T.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), f: 1.2 + r() * 2.2, p: r() * 6 }));
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).normalize();
          let d = 0;
          k.forEach((w) => { d += Math.sin(v.dot(w.a) * w.f * 3 + w.p) * 0.06; });
          v.multiplyScalar(s * (1 + d * (o.amp != null ? o.amp / 0.06 : 1)));
          pos.setXYZ(i, v.x, v.y, v.z);
        }
        geo.computeVertexNormals();
        break;
      }
      default: geo = new T.SphereGeometry(s, 96, 64);
    }
    const m = shadowy(new T.Mesh(geo, meshMat(o, "plastic")), o);
    (o.parent || st.root).add(m);
    return m;
  }

  /* ---------- SVG / icons extruded ---------- */
  /** Extrude a filled SVG (MO_ICONS name such as "emoji-honey-pot" or "brand-github", or an SVG
   *  string) into 3D, keeping each path's colour. Stroke-only icons (lucide) are not extruded: use
   *  emoji:, brand: or a filled set (ph: "-fill" icons). o: { size (height, world units), depth (0.12
   *  of the size), mat ("plastic"), color (one colour for all), bevel }. Returns a centred Group. */
  function svg(st, src, o) {
    o = o || {};
    let markup = src;
    if (g.MO_ICONS && g.MO_ICONS[src]) markup = g.MO_ICONS[src].svg;
    if (typeof markup !== "string" || markup.indexOf("<svg") < 0) throw new Error("MO3D.svg: unknown icon or SVG " + String(src).slice(0, 40));
    const data = new T.SVGLoader().parse(markup);
    // Gradient fills (url(#id)) become the gradient's middle stop colour.
    const grads = {};
    markup.replace(/<(linear|radial)Gradient[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/\1Gradient>/g, (m, k, id, body) => {
      const stops = [...body.matchAll(/stop-color[=:]\s*"?([#\w(),.\s%]+?)[";/>]/g)].map((x) => x[1].trim());
      if (stops.length) grads[id] = stops[Math.floor(stops.length / 2)];
      return m;
    });
    markup.replace(/<(linear|radial)Gradient[^>]*id="([^"]+)"[^>]*xlink:href="#([^"]+)"/g, (m, k, id, ref) => { if (!grads[id] && grads[ref]) grads[id] = grads[ref]; return m; });
    markup.replace(/<(linear|radial)Gradient[^>]*id="([^"]+)"[^>]*href="#([^"]+)"/g, (m, k, id, ref) => { if (!grads[id] && grads[ref]) grads[id] = grads[ref]; return m; });
    const grp = new T.Group(), inner = new T.Group();
    const vb = (/viewBox="([^"]+)"/.exec(markup) || [])[1];
    const vh = vb ? +vb.split(/[\s,]+/)[3] : 24;
    const depth = (o.depth != null ? o.depth : 0.12) * vh;
    let n = 0, z = 0;
    data.paths.forEach((path) => {
      const style = path.userData && path.userData.style ? path.userData.style : {};
      const fill = style.fill;
      if (fill === "none" || fill === "transparent") return;
      const shapes = path.toShapes(true);
      if (!shapes.length) return;
      let fc = fill;
      const gm = /url\(\s*#([^)\s]+)\s*\)/.exec(fill || "");
      if (gm) fc = grads[gm[1]] || "#cccccc";
      const c = o.color || (fc && fc !== "currentColor" ? fc : "--accent");
      const m = mat(o.mat || "satin", c, o);
      const geo = new T.ExtrudeGeometry(shapes, { depth, bevelEnabled: o.bevel !== false, bevelThickness: depth * 0.18, bevelSize: depth * 0.12, bevelSegments: 3, curveSegments: 14 });
      const mesh = shadowy(new T.Mesh(geo, m), o);
      mesh.position.z = z; z += depth * 0.04; // later paths sit on top
      inner.add(mesh); n++;
    });
    if (!n) throw new Error("MO3D.svg: nothing filled to extrude in " + String(src).slice(0, 40) + " (stroke icons cannot be extruded)");
    inner.scale.set(1, -1, 1);
    const box = new T.Box3().setFromObject(inner), size = box.getSize(new T.Vector3());
    inner.position.sub(box.getCenter(new T.Vector3()));
    // The size lives on an inner group: the returned group keeps scale 1, so MO3D.move / pop and
    // GSAP scale tweens on it work like on any other object.
    const fit = new T.Group();
    fit.add(inner);
    fit.scale.setScalar((o.size || 2) / Math.max(size.y, size.x * 0.7));
    grp.add(fit);
    (o.parent || st.root).add(grp);
    return grp;
  }

  /* ---------- particles ---------- */
  let SPRITE = null;
  function sprite() {
    if (SPRITE) return SPRITE;
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d"), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,0.8)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    SPRITE = new T.CanvasTexture(c);
    return SPRITE;
  }
  /** Point cloud: kind "stars" (shell around the camera), "field" (box), "galaxy" (spiral arms),
   *  "sphere" (surface), "ring", "dust" (slow, small, near). o: { count, size (px at 1080p), radius,
   *  colors: ["--accent", "#fff"], seed, opacity }. Returns THREE.Points (rotate it with GSAP). */
  function particles(st, kind, o) {
    o = o || {};
    const n = o.count || (kind === "galaxy" ? 24000 : kind === "stars" ? 3000 : 1500);
    const r = MO.rng(o.seed || 3), R = o.radius || (kind === "stars" ? 120 : kind === "galaxy" ? 6 : 8);
    const pos = new Float32Array(n * 3), cols = new Float32Array(n * 3);
    const palette = (o.colors || ["#FFFFFF", "--accent"]).map((c) => col(c, st.canvas));
    const tmp = new T.Color();
    for (let i = 0; i < n; i++) {
      let x, y, z;
      if (kind === "galaxy") {
        const arms = o.arms || 3, arm = i % arms, d = Math.pow(r(), 1.6) * R;
        const a = (arm / arms) * Math.PI * 2 + d * (o.twist || 0.9) + (r() - 0.5) * 0.5 * (1 - d / R + 0.3);
        x = Math.cos(a) * d + (r() - 0.5) * 0.35; z = Math.sin(a) * d + (r() - 0.5) * 0.35; y = (r() - 0.5) * 0.25 * (1 - d / R + 0.2);
        tmp.copy(palette[0]).lerp(palette[1 % palette.length], Math.min(1, d / R * 1.3));
      } else if (kind === "stars" || kind === "sphere") {
        const u = r() * 2 - 1, th = r() * Math.PI * 2, rr = kind === "stars" ? R * (0.6 + r() * 0.4) : R;
        x = Math.sqrt(1 - u * u) * Math.cos(th) * rr; y = u * rr; z = Math.sqrt(1 - u * u) * Math.sin(th) * rr;
        tmp.copy(palette[Math.floor(r() * palette.length)]);
      } else if (kind === "ring") {
        const a = r() * Math.PI * 2, d = R * (0.85 + r() * 0.3);
        x = Math.cos(a) * d; z = Math.sin(a) * d; y = (r() - 0.5) * R * 0.04;
        tmp.copy(palette[Math.floor(r() * palette.length)]);
      } else {
        x = (r() - 0.5) * R * 2; y = (r() - 0.5) * R * 2; z = (r() - 0.5) * R * 2;
        tmp.copy(palette[Math.floor(r() * palette.length)]);
      }
      pos.set([x, y, z], i * 3); cols.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(pos, 3));
    geo.setAttribute("color", new T.BufferAttribute(cols, 3));
    const pts = new T.Points(geo, new T.PointsMaterial({
      size: (o.size || (kind === "stars" ? 2.2 : kind === "galaxy" ? 2 : 3)) * (st.H / 1080), sizeAttenuation: kind !== "stars",
      map: sprite(), vertexColors: true, transparent: true, opacity: o.opacity != null ? o.opacity : 1, depthWrite: false, blending: T.AdditiveBlending,
    }));
    if (kind !== "stars") pts.material.size *= 0.02; // world units with attenuation
    (o.parent || st.root).add(pts);
    return pts;
  }

  /* ---------- planets, glow, cosmic structures ---------- */
  // Seeded 3D value noise and fBm, sampled on the sphere (no seam at the date line).
  function noise3(seed) {
    const r = MO.rng(seed || 1), P = new Uint8Array(512), V = new Float32Array(256);
    for (let i = 0; i < 256; i++) { P[i] = i; V[i] = r(); }
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = P[i]; P[i] = P[j]; P[j] = t; }
    for (let i = 0; i < 256; i++) P[i + 256] = P[i];
    const h = (x, y, z) => V[P[P[P[x & 255] + (y & 255)] + (z & 255)]];
    const sm = (t) => t * t * (3 - 2 * t), L = (a, b, t) => a + (b - a) * t;
    const n = (x, y, z) => {
      const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = sm(x - xi), yf = sm(y - yi), zf = sm(z - zi);
      return L(L(L(h(xi, yi, zi), h(xi + 1, yi, zi), xf), L(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), xf), yf),
        L(L(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), xf), L(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), xf), yf), zf);
    };
    return (x, y, z, oct) => { let a = 0, amp = 0.5, f = 1, tot = 0; for (let i = 0; i < (oct || 5); i++) { a += n(x * f, y * f, z * f) * amp; tot += amp; amp *= 0.5; f *= 2.02; } return a / tot; };
  }
  function paint(w, h, fn) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d"), img = x.createImageData(w, h), d = img.data;
    for (let j = 0; j < h; j++) {
      const lat = (0.5 - (j + 0.5) / h) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
      for (let i = 0; i < w; i++) {
        const lon = ((i + 0.5) / w) * Math.PI * 2;
        const rgba = fn(cl * Math.cos(lon), sl, cl * Math.sin(lon), lat);
        const k = (j * w + i) * 4;
        d[k] = rgba[0]; d[k + 1] = rgba[1]; d[k + 2] = rgba[2]; d[k + 3] = rgba[3] == null ? 255 : rgba[3];
      }
    }
    x.putImageData(img, 0, 0);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8;
    return t;
  }
  const hex = (c) => { const k = col(c); return [k.r, k.g, k.b].map((v) => Math.round(Math.pow(v, 1 / 2.2) * 255)); };
  const mix = (a, b, t) => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * Math.max(0, Math.min(1, t)));
  /** Atmosphere / halo: a soft fresnel rim around a sphere. o: { color, size (1.12 × radius),
   *  power (2.5), intensity (1.2) }. Returns the glow mesh (child of obj). */
  function glow(st, obj, o) {
    o = o || {};
    obj.geometry.computeBoundingSphere();
    const R = obj.geometry.boundingSphere.radius * (o.size || 1.12);
    const m = new T.ShaderMaterial({
      uniforms: { c: { value: col(o.color || "#6fb6ff") }, p: { value: o.power || 2.5 }, k: { value: o.intensity || 1.2 } },
      vertexShader: "varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }",
      fragmentShader: "uniform vec3 c; uniform float p; uniform float k; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), p); gl_FragColor = vec4(c * f * k, f * k); }",
      side: T.BackSide, transparent: true, blending: T.AdditiveBlending, depthWrite: false,
    });
    m.side = T.FrontSide;
    const g2 = new T.Mesh(new T.SphereGeometry(R, 96, 64), m);
    obj.add(g2);
    return g2;
  }
  /** Procedural planet (seeded, no image files): kind "earth" | "moon" | "mars" | "sun" | "gas"
   *  (banded giant) | "ice" | "rock". o: { size (radius), seed, color (main tint), color2, clouds
   *  (earth: true), glow (atmosphere colour or false), res (texture width, 1024) }. Returns a Group:
   *  .userData.surface (the sphere) to spin. */
  function planet(st, kind, o) {
    o = o || {};
    kind = kind || "rock";
    const R = o.size || 1, nz = noise3(o.seed || 11), W = o.res || 1024, Hh = W / 2;
    const grp = new T.Group();
    let tex, m;
    if (kind === "earth") {
      const deep = hex("#06204A"), sea = hex("#0F4C92"), shore = hex("#2F86C8"), green = hex("#2E6A2C"), dry = hex("#A8834A"), snow = [236, 241, 246];
      tex = paint(W, Hh, (x, y, z, lat) => {
        const e = nz(x * 1.8 + 7, y * 1.8, z * 1.8, 6);
        const polar = Math.abs(lat) > 1.2 + (nz(x * 6, y * 6, z * 6, 3) - 0.5) * 0.25;
        if (polar) return snow;
        if (e < 0.5) return e < 0.44 ? mix(deep, sea, (e - 0.25) / 0.19) : mix(sea, shore, (e - 0.44) / 0.06);
        const dryness = nz(x * 3 + 3, y * 3, z * 3, 4) + (1 - Math.abs(Math.sin(lat * 2.2))) * 0.15;
        return mix(mix(green, dry, (dryness - 0.45) * 2.5), [200, 200, 190], (e - 0.66) * 3);
      });
      m = new T.MeshStandardMaterial({ map: tex, roughness: 0.75, metalness: 0 });
      void sea;
    } else if (kind === "moon" || kind === "rock" || kind === "mars") {
      const base = kind === "mars" ? hex(o.color || "#B5542F") : hex(o.color || "#9C9A96"), dark = mix(base, [20, 20, 22], 0.55);
      const r = MO.rng((o.seed || 11) + 5), craters = [];
      for (let i = 0; i < (kind === "mars" ? 30 : 90); i++) {
        const u = r() * 2 - 1, th = r() * Math.PI * 2, q = Math.sqrt(1 - u * u);
        craters.push({ x: q * Math.cos(th), y: u, z: q * Math.sin(th), r: 0.02 + Math.pow(r(), 3) * 0.16 });
      }
      tex = paint(W, Hh, (x, y, z) => {
        let v = nz(x * 2.5, y * 2.5, z * 2.5, 6);
        let c = mix(dark, base, (v - 0.3) * 2.2);
        if (kind === "moon") { const mare = nz(x * 1.2 + 9, y * 1.2, z * 1.2, 3); if (mare > 0.58) c = mix(c, dark, (mare - 0.58) * 4); }
        for (const k of craters) {
          const d = Math.hypot(x - k.x, y - k.y, z - k.z);
          if (d < k.r * 1.25) c = d < k.r ? mix(c, dark, 0.35 * (1 - d / k.r)) : mix(c, [235, 230, 222], 0.25 * (1 - (d - k.r) / (k.r * 0.25)));
        }
        return c;
      });
      m = new T.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
    } else if (kind === "sun") {
      const hot = hex(o.color || "#FFC85A"), cool = hex(o.color2 || "#E8530A");
      tex = paint(W, Hh, (x, y, z) => { const v = nz(x * 9, y * 9, z * 9, 5), w = nz(x * 2.2 + 5, y * 2.2, z * 2.2, 3); return mix(cool, hot, (v - 0.32) * 2.6 + (w - 0.5) * 0.8); });
      m = new T.MeshBasicMaterial({ map: tex });
      m.color = new T.Color(1.18, 1.08, 1.0); // a little over 1: the brightest granules bloom
    } else {
      const a = hex(o.color || (kind === "ice" ? "#7FB8E8" : "#D9B38C")), b = hex(o.color2 || (kind === "ice" ? "#2F5FA8" : "#9C5B3A"));
      tex = paint(W, Hh, (x, y, z, lat) => {
        const turb = nz(x * 3, y * 3, z * 3, 5);
        const band = Math.sin(lat * (kind === "ice" ? 7 : 14) + turb * 4);
        return mix(a, b, band * 0.5 + 0.5);
      });
      m = new T.MeshStandardMaterial({ map: tex, roughness: 0.8 });
    }
    const surf = new T.Mesh(new T.SphereGeometry(R, 128, 96), m);
    grp.add(surf);
    grp.userData.surface = surf;
    if (kind === "earth" && o.clouds !== false) {
      const nc = noise3((o.seed || 11) + 3);
      const ct = paint(W, Hh, (x, y, z) => { const v = nc(x * 3, y * 3, z * 3, 6); const a = Math.max(0, (v - 0.56) * 3.2); return [255, 255, 255, Math.round(Math.min(1, a) * 210)]; });
      const clouds = new T.Mesh(new T.SphereGeometry(R * 1.012, 128, 96), new T.MeshStandardMaterial({ map: ct, transparent: true, depthWrite: false, roughness: 1 }));
      surf.add(clouds);
      grp.userData.clouds = clouds;
    }
    const gc = o.glow === false ? null : o.glow || (kind === "earth" ? "#5FA8FF" : kind === "sun" ? "#FFB347" : kind === "ice" ? "#8FD3FF" : kind === "gas" ? "#E8C9A0" : kind === "mars" ? "#E08A5A" : null);
    if (gc) grp.userData.glow = glow(st, surf, { color: gc, size: kind === "sun" ? 1.25 : 1.06, power: kind === "sun" ? 1.6 : 3, intensity: kind === "sun" ? 1.6 : 1.3 });
    (o.parent || st.root).add(grp);
    return grp;
  }
  /** Cosmic web / galaxy field: o: { count (galaxies), radius, seed, colors, size }. A Group of
   *  small spiral point clouds scattered in space with random tilts. */
  function galaxies(st, o) {
    o = o || {};
    const grp = new T.Group(), r = MO.rng(o.seed || 21), n = o.count || 60, R = o.radius || 40;
    for (let i = 0; i < n; i++) {
      const gx = particles(st, "galaxy", { count: o.per || 900, radius: 0.6 + r() * 1.4, colors: o.colors || ["#FFF1D6", r() > 0.5 ? "#8C7BFF" : "#7FC8FF"], seed: (o.seed || 21) + i, arms: 2 + Math.floor(r() * 3), parent: grp, size: o.size });
      gx.position.set((r() - 0.5) * R * 2, (r() - 0.5) * R * 1.2, -r() * R * 2);
      gx.rotation.set(r() * Math.PI, r() * Math.PI, r() * Math.PI);
    }
    (o.parent || st.root).add(grp);
    return grp;
  }
  /** Pin an HTML element to a 3D point: the element's centre follows obj (plus offset [x,y,z]) on
   *  screen every frame. o: { offset, dx, dy (px), hideBehind: true }. */
  function label(st, obj, el, o) {
    o = o || {};
    const node = MO.q(el), v = new T.Vector3(), off = v3(o.offset, new T.Vector3());
    if (!node) throw new Error("MO3D.label: no element matches " + el);
    node.style.position = "absolute"; node.style.left = "0px"; node.style.top = "0px";
    st.after(() => {
      obj.updateWorldMatrix(true, false);
      v.copy(off).applyMatrix4(obj.matrixWorld).project(st.camera);
      const x = (v.x * 0.5 + 0.5) * st.W, y = (-v.y * 0.5 + 0.5) * st.H;
      node.style.transform = `translate(${x - node.offsetWidth / 2 + (o.dx || 0)}px, ${y - node.offsetHeight / 2 + (o.dy || 0)}px)`;
      node.style.visibility = v.z > 1 ? "hidden" : "";
    });
    return node;
  }

  /* ---------- motion helpers (all on the scene timeline) ---------- */
  const xyz = (o, pre) => { const r = {}; ["x", "y", "z"].forEach((k) => { if (o[pre + k] != null) r[k] = o[pre + k]; }); return r; };
  /** Tween position (x y z), rotation (rx ry rz, degrees), scale (s) of a 3D object from `from` to
   *  `to`. o: { from: {...}, to: {...}, dur, ease }. Returns the end time. */
  function move(tl, obj, at, o) {
    const dur = o.dur || 1, ease = o.ease || "power3.out", f = o.from || {}, t = o.to || {};
    const fp = xyz(f, ""), tp = xyz(t, "");
    const fr = {}, tr = {};
    ["x", "y", "z"].forEach((k) => { if (f["r" + k] != null) fr[k] = f["r" + k] * DEG; if (t["r" + k] != null) tr[k] = t["r" + k] * DEG; });
    const pos = Object.keys(fp).length || Object.keys(tp).length, rot = Object.keys(fr).length || Object.keys(tr).length;
    const base = { duration: dur, ease, immediateRender: at <= 0.001 };
    if (pos) tl.fromTo(obj.position, Object.assign({ x: obj.position.x, y: obj.position.y, z: obj.position.z }, fp), Object.assign({}, base, tp), at);
    if (rot) tl.fromTo(obj.rotation, Object.assign({ x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z }, fr), Object.assign({}, base, tr), at);
    if (f.s != null || t.s != null) {
      const fs = f.s != null ? f.s : obj.scale.x, ts = t.s != null ? t.s : obj.scale.x;
      tl.fromTo(obj.scale, { x: fs, y: fs, z: fs }, Object.assign({}, base, { x: ts, y: ts, z: ts }), at);
    }
    if (f.opacity != null || t.opacity != null) fade(tl, obj, at, { from: f.opacity != null ? f.opacity : 1, to: t.opacity != null ? t.opacity : 1, dur, ease });
    return +(at + dur).toFixed(3);
  }
  function materialsOf(obj) {
    const out = [];
    obj.traverse((n) => { if (n.material) (Array.isArray(n.material) ? n.material : [n.material]).forEach((m) => { if (out.indexOf(m) < 0) out.push(m); }); });
    return out;
  }
  /** Opacity of every material under obj. o: { from, to, dur, ease }. */
  function fade(tl, obj, at, o) {
    const ms = materialsOf(obj);
    ms.forEach((m) => { m.transparent = true; });
    tl.fromTo(ms, { opacity: o.from != null ? o.from : 0 }, { opacity: o.to != null ? o.to : 1, duration: o.dur || 0.5, ease: o.ease || "power2.out", immediateRender: at <= 0.001 }, at);
    return +(at + (o.dur || 0.5)).toFixed(3);
  }
  /** Turn an object: o: { y: turns (1), x, z, dur, ease ("none") }. */
  function spin(tl, obj, at, o) {
    o = o || {};
    const dur = o.dur || 4, to = {};
    ["x", "y", "z"].forEach((k) => { const v = o[k] != null ? o[k] : k === "y" ? 1 : 0; if (v) to[k] = obj.rotation[k] + v * Math.PI * 2; });
    tl.fromTo(obj.rotation, { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z }, Object.assign({ duration: dur, ease: o.ease || "none", immediateRender: false }, to), at);
    return +(at + dur).toFixed(3);
  }
  /** Pop in from scale 0 with a spring and a half turn. o: { dur, turn (0.5), sfx }. */
  function pop(tl, obj, at, o) {
    o = o || {};
    const dur = o.dur || 0.9, s = obj.scale.x || 1;
    tl.fromTo(obj.scale, { x: 0.001, y: 0.001, z: 0.001 }, { x: s, y: s, z: s, duration: dur, ease: "back.out(1.6)", immediateRender: true }, at);
    if (o.turn !== 0) tl.fromTo(obj.rotation, { y: obj.rotation.y - (o.turn || 0.5) * Math.PI * 2 }, { y: obj.rotation.y, duration: dur * 1.2, ease: "expo.out", immediateRender: true }, at);
    if (MO && o.sfx !== false) MO.cue(at, "pop", { gain: -2 });
    return +(at + dur).toFixed(3);
  }
  /** Per-letter entrance of a MO3D.text(..., { letters: true }) group. o: { kind: "flip" (rotate up
   *  from below) | "drop" | "spin" | "rise", stagger (0.07), dur (0.9) }. */
  function letters(tl, group, at, o) {
    o = o || {};
    const kids = group.children, stg = o.stagger != null ? o.stagger : 0.07, dur = o.dur || 0.9, kind = o.kind || "flip";
    kids.forEach((p, i) => {
      const t = at + i * stg, y0 = p.position.y;
      if (kind === "flip") {
        tl.fromTo(p.rotation, { x: -Math.PI / 2 }, { x: 0, duration: dur, ease: "back.out(1.4)", immediateRender: true }, t);
        tl.fromTo(p.position, { y: y0 - 0.6 }, { y: y0, duration: dur, ease: "expo.out", immediateRender: true }, t);
      } else if (kind === "spin") {
        tl.fromTo(p.rotation, { y: -Math.PI }, { y: 0, duration: dur, ease: "expo.out", immediateRender: true }, t);
      } else if (kind === "drop") {
        tl.fromTo(p.position, { y: y0 + 4 }, { y: y0, duration: dur, ease: "bounce.out", immediateRender: true }, t);
      } else {
        tl.fromTo(p.position, { y: y0 - 1.2, z: -2 }, { y: y0, z: 0, duration: dur, ease: "expo.out", immediateRender: true }, t);
      }
      tl.fromTo(p.scale, { x: 0.001, y: 0.001, z: 0.001 }, { x: 1, y: 1, z: 1, duration: dur * 0.4, ease: "power2.out", immediateRender: true }, t);
    });
    if (MO && o.sfx !== false) MO.cue(at, "whoosh", { dur: 0.5, gain: -6 });
    return +(at + (kids.length - 1) * stg + dur).toFixed(3);
  }
  /** Camera move: o: { pos: [x,y,z], look: [x,y,z], fov, dur (1.6), ease ("power2.inOut") }. */
  function cam(tl, st, at, o) {
    const dur = o.dur || 1.6, ease = o.ease || "power2.inOut", c = st.camera;
    const base = { duration: dur, ease, immediateRender: false };
    if (o.pos) tl.to(c.position, Object.assign({ x: o.pos[0], y: o.pos[1], z: o.pos[2] }, base), at);
    if (o.look) tl.to(st.look, Object.assign({ x: o.look[0], y: o.look[1], z: o.look[2] }, base), at);
    if (o.fov) tl.to(c, Object.assign({ fov: o.fov }, base), at);
    if (MO && o.sfx) MO.cue(at, "whoosh", { dur: dur * 0.6, gain: -8 });
    return +(at + dur).toFixed(3);
  }
  /** Orbit the camera around `look`: o: { radius, height, from (deg), to (deg), dur, ease ("none") }. */
  function orbit(tl, st, at, o) {
    o = o || {};
    const c = st.camera, l = st.look;
    const dx = c.position.x - l.x, dz = c.position.z - l.z;
    const R = o.radius || Math.hypot(dx, dz) || 10, h = o.height != null ? o.height : c.position.y;
    const a0 = (o.from != null ? o.from : Math.atan2(dx, dz) / DEG), a1 = o.to != null ? o.to : a0 + 60;
    const p = { a: a0 }, dur = o.dur || 4;
    const place = () => { c.position.set(l.x + Math.sin(p.a * DEG) * R, h, l.z + Math.cos(p.a * DEG) * R); };
    tl.fromTo(p, { a: a0 }, { a: a1, duration: dur, ease: o.ease || "none", onUpdate: place, immediateRender: false }, at);
    return +(at + dur).toFixed(3);
  }
  /** Gentle idle bob and sway (an object floating), frame-exact. Wraps obj in a group (returned) so
   *  GSAP tweens on obj itself stay exact. o: { amp (0.12), rot (6 degrees), period (3.2 s) }. */
  function hover(st, obj, o) {
    o = o || {};
    const amp = o.amp != null ? o.amp : 0.12, rot = (o.rot != null ? o.rot : 6) * DEG, P = o.period || 3.2;
    const wrap = new T.Group();
    (obj.parent || st.root).add(wrap); wrap.add(obj);
    st.frame((t) => {
      const w = (t / P) * Math.PI * 2;
      wrap.position.y = Math.sin(w) * amp;
      wrap.rotation.z = Math.sin(w * 0.5) * rot;
      wrap.rotation.x = Math.cos(w * 0.7) * rot * 0.5;
    });
    return wrap;
  }

  g.MO3D = { stage, mat, text, shape, svg, particles, planet, glow, galaxies, label, move, fade, spin, pop, letters, cam, orbit, hover, col, noise3 };
})(window);
