// Planar quadcopter physics and a small neural flight controller.
// The same file runs in the page, in a Web Worker for training, and in Node for testing.
// The defaults are the original task (brain.js was trained on it). Presets make the task harder,
// so training at full speed still takes a few real seconds.
const DRONE = (function () {
  const DT = .05, G = 9.81, SPIN = 26, NO = 2;
  const DEFAULTS = { hidden: [12], tmax: 12, lag: 0, wind: 0, gust: 0, episodes: 3, pop: 70, algo: "ga", target: .11, minGen: 70, maxGen: 150, maxTime: 0, heldOut: false };
  const PRESETS = {
    // Steady wind plus gusts: the brain has to lean into the wind to hold its slot. Evolution strategies cope with the noise.
    gusts: { algo: "es", pop: 30, wind: .8, gust: .6, episodes: 4, target: .3, minGen: 40, maxGen: 600, maxTime: 9 },
    // Motors spool up over 0.15 s, so every correction has to be made early.
    motors: { algo: "es", pop: 30, lag: .15, target: .15, minGen: 40, maxGen: 900, maxTime: 9 },
    // The genetic algorithm with its whole population on show, scored on fresh flights each generation.
    population: { heldOut: true, episodes: 4, target: .18, minGen: 40, maxGen: 900, maxTime: 9 },
    // Evolution strategies on a bigger, two layer brain.
    es: { hidden: [16, 16], algo: "es", pop: 30, target: .12, minGen: 40, maxGen: 600, maxTime: 9 },
    // The methods in drone-learn.js. unit names a round on screen; per is how many updates a round makes.
    backprop: { algo: "bptt", hidden: [64], lr: .01, target: .04, minGen: 15, maxGen: 5000, maxTime: 9, unit: "STEP", per: 6 },
    imitation: { algo: "clone", hidden: [24], target: .2, minGen: 15, maxGen: 5000, maxTime: 9, unit: "STEP", per: 30 },
    cem: { algo: "cem", pop: 40, episodes: 4, target: .15, minGen: 15, maxGen: 5000, maxTime: 9 },
    swarm: { algo: "pso", hidden: [6], pop: 30, episodes: 3, inertia: .72, vmax: .2, target: .2, minGen: 15, maxGen: 5000, maxTime: 9, unit: "ITER" },
    // The training race: four methods on the same brain and task.
    raceGA: { heldOut: true, episodes: 4, target: .15, minGen: 40, maxGen: 900, maxTime: 9 },
    raceES: { algo: "es", pop: 30, target: .15, minGen: 40, maxGen: 900, maxTime: 9 },
    raceCEM: { algo: "cem", pop: 40, episodes: 4, target: .15, minGen: 15, maxGen: 5000, maxTime: 9 },
    raceBP: { algo: "bptt", target: .15, minGen: 15, maxGen: 5000, maxTime: 9, unit: "STEP", per: 6 },
  };
  const C = {}, api = { DT, G, SPIN, PRESETS, C };
  let sizes, acts;
  function configure(o) {
    Object.assign(C, DEFAULTS, o);
    sizes = [7 + (C.lag ? 2 : 0), ...C.hidden, NO];
    acts = sizes.map(n => new Float64Array(n));
    api.GENES = 0;
    for (let l = 1; l < sizes.length; l++) api.GENES += (sizes[l - 1] + 1) * sizes[l];
  }
  const clip = (v, m) => v > m ? m : v < -m ? -m : v;

  // state: x y vx vy angle spin, and motor levels m0 m1 when the motors lag. Writes two thrust commands into out.
  // Weights are stored neuron by neuron: its input weights, then its bias.
  function think(g, s, tx, ty, out) {
    const a = acts[0];
    a[0] = clip((tx - s.x) / 2, 1.5); a[1] = clip((ty - s.y) / 2, 1.5); a[2] = s.vx / 4; a[3] = s.vy / 4; a[4] = Math.sin(s.a); a[5] = Math.cos(s.a); a[6] = s.w / 4;
    if (C.lag) { a[7] = s.m0 * 2 - 1; a[8] = s.m1 * 2 - 1; }
    let o = 0;
    const L = sizes.length - 1;
    for (let l = 1; l <= L; l++) {
      const src = acts[l - 1], dst = acts[l], n = sizes[l - 1];
      for (let j = 0; j < sizes[l]; j++) {
        let v = g[o + n];
        for (let k = 0; k < n; k++) v += g[o + k] * src[k];
        dst[j] = l === L ? .5 + .5 * Math.tanh(v) : Math.tanh(v);
        o += n + 1;
      }
    }
    out[0] = acts[L][0]; out[1] = acts[L][1];
  }
  const cmd = new Float64Array(2);
  // wx, wy: wind, as an acceleration in m/s².
  function step(g, s, tx, ty, wx, wy) {
    if (C.lag && s.m0 === undefined) s.m0 = s.m1 = G / C.tmax;
    think(g, s, tx, ty, cmd);
    stepWith(s, cmd[0], cmd[1], wx, wy);
  }
  // The physics alone, for given motor commands.
  function stepWith(s, c0, c1, wx, wy) {
    if (C.lag && s.m0 === undefined) s.m0 = s.m1 = G / C.tmax;
    if (C.lag) { const k = DT / C.lag; s.m0 += (c0 - s.m0) * k; s.m1 += (c1 - s.m1) * k; c0 = s.m0; c1 = s.m1; }
    const thrust = (c0 + c1) * C.tmax * .5;
    s.vx += (-thrust * Math.sin(s.a) + (wx || 0)) * DT;
    s.vy += (thrust * Math.cos(s.a) - G + (wy || 0)) * DT;
    s.w += (c1 - c0) * SPIN * DT;
    s.vx *= .995; s.vy *= .995; s.w *= .96;
    s.a += s.w * DT; s.x += s.vx * DT; s.y += s.vy * DT;
    s.t0 = c0; s.t1 = c1;
  }
  function lcg(seed) { let x = seed >>> 0 || 1; return () => (x = (x * 48271) % 2147483647) / 2147483647; }

  // Fly to a random point, then to a second one, and score how tightly the drone settles.
  // Every brain in a generation gets the same seed, so they all face the same targets and the same weather.
  function evaluate(g, seed, episodes) {
    const r = lcg(seed), normal = () => Math.sqrt(-2 * Math.log(1 - r() * .999999)) * Math.cos(6.2832 * r());
    let cost = 0, finalErr = 0;
    for (let e = 0; e < episodes; e++) {
      const s = { x: (r() - .5) * 8, y: (r() - .5) * 6, vx: 0, vy: 0, a: (r() - .5) * .6, w: 0 };
      let tx = (r() - .5) * 12, ty = (r() - .5) * 8, wx = 0, wy = 0, gx = 0, gy = 0;
      if (C.wind) { wx = (r() - .5) * 2 * C.wind; wy = (r() - .5) * C.wind * .5; }
      for (let t = 0; t < 180; t++) {
        if (t === 90) { tx = (r() - .5) * 12; ty = (r() - .5) * 8; }
        // Gusts wander around the steady wind, changing over about a second.
        if (C.gust) { gx += -gx * DT / 1.2 + C.gust * Math.sqrt(2 * DT / 1.2) * normal(); gy += -gy * DT / 1.2 + C.gust * .5 * Math.sqrt(2 * DT / 1.2) * normal(); }
        step(g, s, tx, ty, wx + gx, wy + gy);
        const d = Math.hypot(tx - s.x, ty - s.y);
        const phase = t % 90;
        cost += Math.min(d, 15) * (phase > 45 ? 2 : .4) + .02 * Math.abs(s.w) + (phase > 60 ? .15 * Math.hypot(s.vx, s.vy) : 0);
        if (t === 179) finalErr += d;
      }
    }
    return { fit: -cost / (episodes * 180), err: finalErr / episodes };
  }
  const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(6.2832 * Math.random());
  function population(n) {
    return Array.from({ length: n }, () => { const g = new Float32Array(api.GENES); for (let i = 0; i < api.GENES; i++) g[i] = gauss() * .4; return g; });
  }
  // Genetic algorithm: the best five survive as they are, the rest are bred from the top quarter and mutated.
  function evolve(pop, scored) {
    const order = pop.map((g, i) => [scored[i].fit, g]).sort((a, b) => b[0] - a[0]).map(p => p[1]);
    const next = order.slice(0, 5), pool = order.slice(0, Math.max(12, pop.length >> 2));
    while (next.length < pop.length) {
      const a = pool[Math.random() * Math.random() * pool.length | 0], b = pool[Math.random() * Math.random() * pool.length | 0];
      const g = new Float32Array(api.GENES);
      for (let i = 0; i < api.GENES; i++) {
        g[i] = Math.random() < .75 ? a[i] : b[i];
        if (Math.random() < .1) g[i] += gauss() * .14;
      }
      next.push(g);
    }
    return { pop: next, best: order[0], order };
  }

  // One training run, a generation per call. Each call returns { gen, err, best, done } plus, for the
  // genetic algorithm, the whole population ranked best first.
  function trainer() {
    let gen = 0, smooth = null;
    const finish = err => {
      gen++; smooth = smooth === null ? err : smooth * .75 + err * .25;
      return { gen, err: smooth, done: gen >= C.maxGen || (gen > C.minGen && smooth < C.target) };
    };
    // The other methods live in drone-learn.js. Each round, their brain is re-flown on fresh flights for an honest error.
    const LEARN = typeof DRONE_LEARN !== "undefined" ? DRONE_LEARN : typeof require === "function" ? require("./drone-learn.js") : null;
    if (LEARN && LEARN[C.algo]) {
      const round = LEARN[C.algo](api);
      return () => {
        const r = round();
        // Eight fresh test flights, so training doesn't stop on a lucky round.
        return Object.assign(finish(evaluate(r.best, 1 + (Math.random() * 1e9 | 0), 8).err), r);
      };
    }
    if (C.algo === "es") {
      // Evolution strategies: score mirrored random nudges of one brain, estimate the gradient from them, take an Adam step.
      const n = api.GENES, theta = new Float32Array(n), m = new Float32Array(n), v = new Float32Array(n), grad = new Float32Array(n);
      for (let i = 0; i < n; i++) theta[i] = gauss() * .3;
      const SIG = .08, LR = .04, HALF = C.pop >> 1, eps = Array.from({ length: HALF }, () => new Float32Array(n)), tryG = new Float32Array(n);
      return () => {
        const seed = 1 + (Math.random() * 1e9 | 0), fits = [];
        for (const e of eps) for (const sign of [1, -1]) {
          if (sign > 0) for (let i = 0; i < n; i++) e[i] = gauss();
          for (let i = 0; i < n; i++) tryG[i] = theta[i] + sign * SIG * e[i];
          fits.push(evaluate(tryG, seed, C.episodes).fit);
        }
        // Rank-based utilities make the step size independent of how the score is scaled.
        const rank = fits.map((f, i) => [f, i]).sort((a, b) => a[0] - b[0]), util = new Float32Array(fits.length);
        rank.forEach(([, i], k) => { util[i] = k / (fits.length - 1) - .5; });
        grad.fill(0);
        eps.forEach((e, j) => { const u = util[2 * j] - util[2 * j + 1]; for (let i = 0; i < n; i++) grad[i] += u * e[i]; });
        const t = gen + 1, b1 = 1 - Math.pow(.9, t), b2 = 1 - Math.pow(.999, t);
        for (let i = 0; i < n; i++) {
          const gi = grad[i] / (C.pop * SIG);
          m[i] = .9 * m[i] + .1 * gi; v[i] = .999 * v[i] + .001 * gi * gi;
          theta[i] += LR * (m[i] / b1) / (Math.sqrt(v[i] / b2) + 1e-8);
        }
        return Object.assign(finish(evaluate(theta, seed, C.episodes).err), { best: theta.slice() });
      };
    }
    let pop = population(C.pop);
    return () => {
      const seed = 1 + (Math.random() * 1e9 | 0), scored = pop.map(g => evaluate(g, seed, C.episodes)), r = evolve(pop, scored);
      pop = r.pop;
      // The original task reports the generation's best score. Presets re-fly the winner on fresh flights instead,
      // so the curve is an honest held-out error and a lucky generation can't end training early.
      const err = C.heldOut ? evaluate(r.best, seed + 1, C.episodes).err : Math.min(...scored.map(s => s.err));
      return Object.assign(finish(err), { best: r.best.slice(), ranked: r.order });
    };
  }
  configure({});
  return Object.assign(api, { configure, step, stepWith, evaluate, population, evolve, trainer });
})();

// Training worker. ?task= picks a preset; ?gap= pauses between generations (the original Formation pages pause 45 ms
// so training is watchable; presets run flat out). ?pop=1 also sends every brain in the population.
// The page can post { pause: true } while it's hidden.
if (typeof importScripts === "function") {
  const q = new URLSearchParams(self.location.search), task = q.get("task");
  DRONE.configure(DRONE.PRESETS[task] || {});
  if (!/^(ga|es)$/.test(DRONE.C.algo)) importScripts("drone-learn.js");
  const GAP = q.has("gap") ? +q.get("gap") : task ? 0 : 45, sendPop = q.get("pop") === "1", next = DRONE.trainer(), t0 = Date.now();
  let paused = false, waiting = false, hidden = 0, hiddenAt = 0;
  onmessage = ({ data }) => {
    if (data.pause === paused) return;
    paused = data.pause;
    if (paused) hiddenAt = Date.now();
    else { hidden += Date.now() - hiddenAt; if (waiting) { waiting = false; burst(); } }
  };
  function burst() {
    if (paused) { waiting = true; return; }
    const r = next(), secs = (Date.now() - t0 - hidden) / 1000;
    // A time budget keeps slow devices from training for long; they get whatever brain they reached.
    if (DRONE.C.maxTime && secs > DRONE.C.maxTime) r.done = true;
    const msg = { gen: r.gen, err: r.err, done: r.done, best: r.best, secs };
    if (sendPop && r.ranked) msg.pop = r.ranked.map(g => g.slice());
    postMessage(msg);
    if (!r.done) setTimeout(burst, GAP);
  }
  burst();
}
if (typeof module !== "undefined") module.exports = DRONE;
