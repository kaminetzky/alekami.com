// Shared page for the Formation variants: scene, aircraft, fleet, HUD, sizing and the frame loop.
// A page passes options and hooks, and each hook gets the shared state K.
//   tagline   text under the name
//   train     true trains the brain live in this browser (worker: its URL); otherwise the offline brain flies from the start
//   N         drones per fleet by device: [minimal, reduced, full phone, full desktop]
//   task      a harder training preset from drone-sim.js, trained flat out (implies train and learn); population also flies every candidate
//   learn     the live training view: drones glow red off their slot, and the training curve sits above the links
//   turbulence  light wind on the drones when the task has none (default 1, 0 is calm)
//   fleets    how many fleets (default 1); speed, dist, turn, size, vRef, nameOnly, scale; tint false leaves colours to the page
//   setup, start, simulate, onAnchor, update, render, mode, hud: hooks, all optional
window.FORMKIT = (function () {
  const FL = FLIGHT, S = SITE, $ = id => document.getElementById(id);

  function start(o) {
    $("name").textContent = S.full; $("gh").href = S.github; $("li").href = S.linkedin;
    // No tagline, no line under the name.
    if (o.tagline) $("role").textContent = o.tagline; else $("role").remove();
    const c = $("c"), gl = c.getContext("webgl", { antialias: true, alpha: false, powerPreference: "high-performance" });
    if (!gl) { S.noWebGL(); throw new Error("WebGL unavailable"); }
    // The world fades in once its first frame is drawn, rather than snapping on.
    c.style.opacity = 0; c.style.transition = "opacity 1.2s ease-out";
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const RES = [.55, .8, 1], tier = S.tier(gl), small = Math.min(innerWidth, innerHeight) < 600;
    let level = tier;
    // Frame budget: 60 fps, unless frames actually run slow (the governor) or it's the weakest tier; then 30.
    // Not by tier alone: phones report few cores and would be capped needlessly, which makes the terrain judder.
    let fps = tier === 0 ? 30 : 60;
    const govern = S.governor(level, l => { level = l; fps = 30; size(); });
    // Terrain grid size per device. The fog ends just inside its edge, so a bigger grid sees further.
    const world = FL.scene(gl, [100, 140, small ? 150 : 170][tier]);
    const F = FL.aircraft();
    if (o.vRef) F.vRef = F.v = o.vRef;
    // The weakest devices skip live training and fly the brain trained offline, on the original task.
    if (tier === 0) o.task = o.train = o.learn = o.population = false;
    if (o.task) {
      DRONE.configure(DRONE.PRESETS[o.task]);
      Object.assign(o, { train: true, learn: true, worker: "drone-sim.js?task=" + o.task + (o.population ? "&pop=1" : "") });
    }
    const counts = o.N || [300, 700, 900, 1400], N = counts[tier === 2 ? (small ? 2 : 3) : tier];
    const fleets = Array.from({ length: o.fleets || 1 }, () => FLEET.create(gl, world, N)), fleet = fleets[0];
    fleets.forEach(f => { f.speed = o.speed || 1; });
    const hud = $("hud"), h = hud.getContext("2d"), st = FL.stick(hud, F);
    const K = { gl, world, F, fleet, fleets, st, hud, h, small, tier, still, N, clock: 0, dist: o.dist || 3000, narrow: false, W: 0, H: 0, aspect: 1 };

    // One brain flies every fleet: trained here in a worker, or the one trained offline (brain.js).
    if (o.train && !still) fleet.train(o.worker); else fleets.forEach(f => f.pretrained());
    if (o.setup) o.setup(K);
    // Wind that matches what the brain trained in: a slow steady drift plus gusts that ripple across the formation.
    // Otherwise light turbulence, so a settled formation still breathes: a soft gust rolling across it, and a little
    // flutter per drone, like slightly uneven motors. turbulence scales it (0 is calm air).
    const C = DRONE.C, T = o.turbulence === undefined ? 1 : o.turbulence;
    fleets.forEach(f => {
      f.wind = C.wind || C.gust ? (d, out) => {
        const t = K.clock;
        out[0] = C.wind * Math.sin(t * .11 + 1) + C.gust * 1.6 * Math.sin(d.x * .5 - t * 1.3) * (.6 + .4 * Math.sin(t * .37));
        out[1] = C.gust * .6 * Math.sin(d.x * .8 + d.y * .4 + t * 1.1);
      } : T ? (d, out) => {
        const t = K.clock, k = d.seed * 40;
        out[0] = T * (.14 * Math.sin(d.x * .45 - t * 1.1) + .11 * Math.sin(t * 2.3 + k));
        out[1] = T * (.07 * Math.sin(d.x * .7 + t * .8) + .08 * Math.sin(t * 1.9 + k * 1.3));
      } : null;
    });

    // The notch or status bar at the top of a phone, from the CSS safe area.
    const notch = document.createElement("div");
    notch.style.cssText = "position:fixed;top:0;height:0;padding-top:env(safe-area-inset-top);visibility:hidden;pointer-events:none";
    document.body.append(notch);
    function size() {
      K.W = innerWidth; K.H = innerHeight; K.aspect = K.W / K.H;
      K.inset = parseFloat(getComputedStyle(notch).paddingTop) || 0;
      const dpr = Math.min(devicePixelRatio || 1, small ? 1.5 : 1.75) * RES[level];
      c.width = K.W * dpr; c.height = K.H * dpr; gl.viewport(0, 0, c.width, c.height);
      hud.width = K.W * Math.min(devicePixelRatio || 1, 2); hud.height = K.H * Math.min(devicePixelRatio || 1, 2);
    }
    function build() {
      K.narrow = innerWidth / innerHeight < 1;
      fleets.forEach(f => f.build(K.narrow, o.scale || 1, o.nameOnly));
    }

    function simulate(dt) {
      for (const f of fleets) if (f !== fleet) f.brain = fleet.brain;
      if (o.simulate) o.simulate(K, dt);
      else {
        const aim = fleet.aim(F);
        FL.fly(F, dt, st.hand ? st.want(dt) : FL.autopilot(F, dt, aim.psi, aim.alt));
        if (fleet.flythrough(F, dt, K.clock, K.dist, o.turn === undefined ? .9 : o.turn, st.hand) && o.onAnchor) o.onAnchor(K, fleet);
        fleet.step(dt, F, o.tint === false || o.learn ? null : fleet.shape().hue);
      }
      if (o.learn) learnColours(K);
      if (o.update) o.update(K, dt);
    }

    function mode() {
      const tight = K.W < 560, f = fleet;
      if (st.hand) return ["HAND FLYING", FL.AMBER];
      if (!o.train) return [tight ? "AUTOPILOT" : "AUTOPILOT · " + FL.FLY, FL.GREEN];
      if (!f.brain) return ["AUTOPILOT · FLEET BRAIN BOOTING", FL.AMBER];
      if (f.trained && o.task) return [(tight ? "" : "AUTOPILOT · ") + "TRAINED HERE IN " + f.secs.toFixed(1) + " S", FL.GREEN];
      if (f.trained) return [tight ? "AUTOPILOT · FLEET TRAINED HERE" : "AUTOPILOT · FLEET TRAINED ON THIS DEVICE · " + FL.FLY, FL.GREEN];
      return [(tight ? "" : "FLEET BRAIN ") + "LEARNING · " + rounds(f.gen) + " · " + (f.err > 50 ? "CRASHING" : f.err.toFixed(2) + " M"), FL.AMBER];
    }
    function draw() {
      const cam = FL.basis(F), R = world.render(F, cam, K.aspect);
      const ctx = { R, P: F, aspect: K.aspect, height: c.height, size: o.size || 9 };
      K.cam = cam;
      fleets.forEach(f => f.render(ctx));
      if (o.render) o.render(K, ctx);
      const [text, colour] = o.mode ? o.mode(K, mode) : mode();
      // Phones drop the speed, altitude and heading tapes, which crowd a small screen, and keep the mode line clear of any notch.
      const roomy = K.W >= 600 && K.H >= 500;
      FL.hud(hud, h, K.W, K.H, F, text, colour, st, { tapes: roomy, heading: roomy, bank: roomy, inset: K.inset });
      // Tag each formation still ahead like a waypoint.
      for (const f of fleets) {
        const O = f.O, sh = f.shape(), tag = FL.project(cam, F, O.x, O.y + sh.h / 2 * f.K + 70, O.z, K.W, K.H);
        if (O.passed || !(tag.z > 300 && tag.x > 20 && tag.x < K.W - 20 && tag.y > 70 && tag.y < K.H - 20)) continue;
        const dist = Math.hypot(O.x - F.x, O.z - F.z);
        h.fillStyle = "#ff77d0"; h.font = "bold 12px ui-monospace,Menlo,monospace"; h.textAlign = "center"; h.textBaseline = "alphabetic";
        h.fillText((sh.cap ? sh.cap + " · " : "") + (dist / 1852).toFixed(1) + " NM", tag.x, tag.y);
      }
      if (o.learn) curve(K);
      if (o.hud) o.hud(K);
      if (c.style.opacity === "0") requestAnimationFrame(() => { c.style.opacity = 1; });
    }

    let last = 0;
    function frame(t) {
      requestAnimationFrame(frame);
      if (document.hidden) { last = t; return; }
      govern(t);
      // Skip display refreshes beyond the frame budget (with a little slack for timer jitter).
      if (t - last < 1000 / fps - 4) return;
      const dt = Math.min(.05, (t - last) / 1000); last = t; K.clock += dt;
      simulate(dt); draw();
    }
    let rt, bw = innerWidth;
    // On a portrait phone the name under the display spans the width: measure the text as rendered and scale it to fit.
    function fitName() {
      const h1 = $("name"), r = document.createRange();
      h1.style.fontSize = h1.style.whiteSpace = "";
      if (!(innerHeight > innerWidth && innerWidth <= 700)) return;
      h1.style.whiteSpace = "nowrap"; h1.style.fontSize = "100px";
      r.selectNodeContents(h1);
      h1.style.fontSize = Math.floor(100 * (innerWidth - 28) / r.getBoundingClientRect().width * 10) / 10 + "px";
    }
    fitName();
    addEventListener("resize", () => {
      size(); fitName(); if (still) draw();
      if (innerWidth === bw) return;
      bw = innerWidth; clearTimeout(rt);
      rt = setTimeout(() => { build(); fleets.forEach(f => f.assign(f.shape())); }, 150);
    });
    S.ready(() => {
      bw = innerWidth; size(); build();
      if (o.start) o.start(K); else fleet.anchorAhead(F, K.dist, 0);
      // Start level with the first formation, so the page doesn't open in a climb.
      F.alt = fleet.O.y;
      // Each fleet waits on the ground under its first formation.
      fleets.forEach(f => f.drones.forEach(f.park));
      if (o.onAnchor) fleets.forEach(f => o.onAnchor(K, f));
      if (still) {
        // Reduced motion: show the finished name, no flight.
        fleets.forEach(f => f.drones.forEach(d => { d.x = d.tx; d.y = d.ty; d.s = d.ts; d.wait = 0; }));
        F.x = fleet.O.x - fleet.O.ax * 1500; F.z = fleet.O.z - fleet.O.az * 1500; F.alt = fleet.O.y;
        draw();
      } else requestAnimationFrame(frame);
    });
    return K;
  }

  // How the trainer names its rounds: generations for evolution, steps or iterations for the others (per updates a round).
  const UNITS = { GEN: "GENERATIONS", STEP: "STEPS", ITER: "ITERATIONS" };
  function rounds(n, long) {
    const C = DRONE.C, unit = C.unit || "GEN", count = n * (C.per || 1);
    return long ? count + " " + UNITS[unit] : unit + " " + count;
  }
  // Learning view colours: red while a drone is off its slot. With a population, drone i flies candidate i (ranked best first),
  // so the worst brains glow red and crash while the best hold the name.
  const RED = [1, .18, .22];
  function learnColours(K) {
    const f = K.fleet, hue = f.shape().hue, pop = !f.trained && f.pop;
    f.drones.forEach((d, i) => {
      let e;
      if (pop) { const j = i % pop.length; d.brain = pop[j]; e = Math.min(1, j / (pop.length * .6)); }
      else { d.brain = null; e = Math.min(1, Math.hypot(d.x - d.tx, d.y - d.ty) / 1.5); }
      d.r += (RED[0] * e + hue[0] * (1 - e) - d.r) * .1; d.g += (RED[1] * e + hue[1] * (1 - e) - d.g) * .1; d.b += (RED[2] * e + hue[2] * (1 - e) - d.b) * .1;
    });
  }
  // The training curve above the links: error per generation on a log scale, from 5 m down to 5 cm.
  // It shows while the brain trains, stays 3 seconds once trained, then fades out over 1.5 seconds.
  function curve(K) {
    const f = K.fleet;
    if (f.trained && K.trainedAt === undefined) K.trainedAt = K.clock;
    const fade = f.trained ? 1 - Math.min(1, Math.max(0, (K.clock - K.trainedAt - 3) / 1.5)) : 1;
    if (fade <= 0) return;
    K.h.save(); K.h.globalAlpha = fade;
    drawCurve(K);
    K.h.restore();
  }
  function drawCurve(K) {
    // As wide as the links under it.
    const panel = document.querySelector(".panel").getBoundingClientRect();
    const f = K.fleet, h = K.h, w = panel.width, ht = 50, x = panel.left, y = panel.top - ht - 26;
    // Short screens (a phone on its side) have no room for it.
    if (K.H < 500 || y < K.H * .55) return;
    h.fillStyle = "#04080acc"; h.fillRect(x, y, w, ht); h.strokeStyle = "#7dff9b55"; h.lineWidth = 1; h.strokeRect(x + .5, y + .5, w - 1, ht - 1);
    h.font = "10px ui-monospace,Menlo,monospace"; h.textBaseline = "alphabetic"; h.textAlign = "left"; h.fillStyle = FL.GREEN;
    const C = DRONE.C, heldOut = C.heldOut || !/^(ga|es)$/.test(C.algo);
    h.fillText(f.trained ? "TRAINED · " + rounds(f.gen, true) : (heldOut ? "HELD-OUT ERROR" : "HOVER ERROR") + " · " + rounds(f.gen), x, y - 6);
    h.textAlign = "right";
    if (f.errs.length) h.fillText((f.secs ? f.secs.toFixed(1) + " S · " : "") + (f.err > 50 ? "CRASHING" : f.err.toFixed(2) + " M"), x + w, y - 6);
    if (f.errs.length < 2) return;
    const lo = Math.log(.05), hi = Math.log(5), n = Math.max(80, f.errs.length);
    h.strokeStyle = f.trained ? FL.GREEN : FL.AMBER; h.lineWidth = 1.5; h.beginPath();
    f.errs.forEach((e, i) => {
      const v = Math.max(0, Math.min(1, (Math.log(Math.max(e, .05)) - lo) / (hi - lo)));
      const px = x + 4 + i / (n - 1) * (w - 8), py = y + ht - 4 - v * (ht - 8);
      i ? h.lineTo(px, py) : h.moveTo(px, py);
    });
    h.stroke();
  }

  // Quadcopter airframes: X arms that bank with each drone's learned attitude, rotors lit by their thrust.
  // pick chooses which drones get one; led > 0 also draws a centre light of that size in the drone's colour.
  function quads(K, f, ctx, opt) {
    const arm = opt.arm || 8, pick = opt.pick, list = pick ? f.drones.filter(pick) : f.drones, n = list.length;
    const st = f._quad && f._quad.n === n ? f._quad : (f._quad = { n, lines: new Float32Array(n * 28), rotors: new Float32Array(n * 28), leds: new Float32Array(n * 7) });
    const O = f.O, P = [0, 0, 0], k = Math.SQRT1_2 * arm;
    list.forEach((d, i) => {
      f.toWorld(d, P);
      const ca = Math.cos(d.a), sa = Math.sin(d.a);
      // Body right axis: the lateral axis rolled by the drone's bank. Forward is the frame's along axis.
      const bx = O.lx * ca, by = sa, bz = O.lz * ca;
      const e1 = [(bx + O.ax) * k, by * k, (bz + O.az) * k], e2 = [(bx - O.ax) * k, by * k, (bz - O.az) * k];
      const tips = [[1, e1, d.t1], [-1, e1, d.t0], [1, e2, d.t1], [-1, e2, d.t0]];
      tips.forEach(([sg, e, thrust], j) => {
        const x = P[0] + e[0] * sg, y = P[1] + e[1] * sg, z = P[2] + e[2] * sg, t = thrust || 0;
        // Each arm runs tip to tip, written once from its positive end.
        if (sg > 0) st.lines.set([P[0] - e[0], P[1] - e[1], P[2] - e[2], .5, .55, .6, .55, x, y, z, .5, .55, .6, .55], i * 28 + j * 7);
        st.rotors.set([x, y, z, .55 + .45 * t, .7 + .3 * t, 1, .25 + .75 * t], (i * 4 + j) * 7);
      });
      st.leds.set([P[0], P[1], P[2], d.r, d.g, d.b, 1], i * 7);
    });
    f.extra(ctx, st.lines, true);
    f.extra(Object.assign({}, ctx, { size: opt.rotor || 3 }), st.rotors);
    if (opt.led) f.extra(Object.assign({}, ctx, { size: opt.led }), st.leds);
  }

  const hsv = (h, s, v) => {
    const f = n => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return [f(5), f(3), f(1)];
  };
  return { start, quads, hsv };
})();
