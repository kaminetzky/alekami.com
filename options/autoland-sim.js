// Longitudinal flight model and neural controller for the Autoland option.
// The same file runs in the page, in a Web Worker for training, and in Node for testing.
const AUTOLAND = (function () {
  const G = 9.81, DT = .1, K = .01325, GS = 3 * Math.PI / 180, DEG = Math.PI / 180;
  const START_X = -2400, AIM_X = 300, NI = 8, NH = 8, NO = 2, GENES = (NI + 1) * NH + (NH + 1) * NO;

  function start(rand) {
    const hJit = rand ? (rand() - .5) * 50 : 0, vJit = rand ? (rand() - .5) * 8 : 0, xJit = rand ? rand() * 300 : 0;
    const x = START_X + xJit;
    return { x, h: -x * Math.tan(GS) + hJit, v: 33 + vJit, gam: -GS, th: -GS + .05, thr: .35, done: false, result: null, sink: 0, errSum: 0, steps: 0, e: 0, t: 0 };
  }

  const inp = new Float64Array(NI), hid = new Float64Array(NH), out = new Float64Array(NO);
  function think(g, s) {
    const gsErr = s.h - Math.max(0, AIM_X - s.x) * Math.tan(GS);
    inp[0] = Math.min(s.h / 60, 2); inp[1] = s.x / 2400; inp[2] = Math.max(-2, Math.min(2, gsErr / 25));
    inp[3] = (s.v - 33) / 10; inp[4] = s.gam * 8; inp[5] = s.th * 8; inp[6] = s.thr; inp[7] = Math.exp(-s.h / 8);
    let o = 0;
    for (let k = 0; k < NH; k++) {
      let a = g[o + NI];
      for (let i = 0; i < NI; i++) a += g[o + i] * inp[i];
      hid[k] = Math.tanh(a); o += NI + 1;
    }
    for (let k = 0; k < NO; k++) {
      let a = g[o + NH];
      for (let i = 0; i < NH; i++) a += g[o + i] * hid[i];
      out[k] = Math.tanh(a); o += NH + 1;
    }
    s.e = out[0]; s.t = out[1] * .5 + .5;
    return gsErr;
  }

  function step(g, s) {
    const gsErr = think(g, s);
    s.errSum += Math.abs(gsErr); s.steps++;
    s.th = Math.max(-20 * DEG, Math.min(25 * DEG, s.th + s.e * 7 * DEG * DT));
    s.thr += Math.max(-.05, Math.min(.05, s.t - s.thr));
    const alpha = s.th - s.gam;
    let cl = .35 + 5.5 * alpha;
    if (alpha > 15 * DEG) cl = Math.max(.2, 1.79 - (alpha - 15 * DEG) * 12);
    const lift = K * s.v * s.v * cl, drag = K * s.v * s.v * (.035 + .05 * cl * cl), thrust = s.thr * 2.6;
    s.gam += (lift - G * Math.cos(s.gam)) / Math.max(10, s.v) * DT;
    s.v = Math.max(5, s.v + (thrust - drag - G * Math.sin(s.gam)) * DT);
    s.x += s.v * Math.cos(s.gam) * DT;
    s.h += s.v * Math.sin(s.gam) * DT;
    if (s.h <= 0) {
      s.h = 0; s.done = true; s.sink = -s.v * Math.sin(s.gam);
      // A real standard: touch down in the first third of the runway, gently, nose up, with flying speed.
      const zone = s.x >= 150 && s.x <= 550;
      s.result = s.x < 150 ? "short" : !zone ? "long" : s.sink > 1.5 || s.th < 0 ? "hard" : "landed";
    } else if (s.x > 1050 || s.steps > 900 || s.h > 400) { s.done = true; s.result = "missed"; }
    else if (s.v < 19) { s.done = true; s.result = "stall"; }
  }

  function score(s) {
    const track = s.errSum / Math.max(1, s.steps);
    let f;
    switch (s.result) {
      case "landed": f = 100 - s.sink * 12 - Math.abs(s.x - AIM_X) * .012 - (s.th < 0 ? 4 : 0); break;
      case "hard": f = 55 - s.sink * 4 - Math.abs(s.x - AIM_X) * .01; break;
      case "short": f = 28 * (1 + s.x / 2400) - s.sink; break;
      case "long": f = 40 - (s.x - 1000) * .01 - s.sink; break;
      case "stall": f = 12 * (1 + s.x / 2400); break;
      default: f = 22 - Math.min(20, s.h * .1); break;
    }
    return f - Math.min(30, track * .25);
  }

  // Simple seeded generator, so every genome in a generation meets the same conditions.
  function lcg(seed) { let x = seed >>> 0 || 1; return () => (x = (x * 48271) % 2147483647) / 2147483647; }

  function evaluate(g, seed, n) {
    const rand = lcg(seed);
    let total = 0, landed = 0, sinkSum = 0;
    for (let e = 0; e < n; e++) {
      const s = start(rand);
      while (!s.done) step(g, s);
      total += score(s);
      if (s.result === "landed") { landed++; sinkSum += s.sink; }
    }
    return { fit: total / n, landed: landed / n, sink: landed ? sinkSum / landed : 0 };
  }

  const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(6.2832 * Math.random());
  function population(size) {
    return Array.from({ length: size }, () => { const g = new Float32Array(GENES); for (let i = 0; i < GENES; i++) g[i] = gauss() * .5; return g; });
  }
  function evolve(pop, scored) {
    const order = pop.map((g, i) => [scored[i].fit, g]).sort((a, b) => b[0] - a[0]).map(p => p[1]);
    const next = order.slice(0, 6), pool = order.slice(0, Math.max(14, pop.length >> 2));
    while (next.length < pop.length) {
      const a = pool[Math.random() * Math.random() * pool.length | 0], b = pool[Math.random() * Math.random() * pool.length | 0];
      const g = new Float32Array(GENES);
      for (let i = 0; i < GENES; i++) {
        g[i] = Math.random() < .7 ? a[i] : b[i];
        if (Math.random() < .12) g[i] += gauss() * .22;
      }
      next.push(g);
    }
    return { pop: next, ranked: order };
  }
  return { start, step, score, evaluate, population, evolve, GENES, AIM_X, START_X, GS };
})();

// Training worker: evolve in bursts, publish the best pilots, and stop for good once the job is done.
if (typeof importScripts === "function") {
  const POP = 90, EPISODES = 8;
  let pop = AUTOLAND.population(POP), gen = 0, streak = 0, bestRate = 0;
  function burst() {
    const seed = 1 + (Math.random() * 1e9 | 0);
    const scored = pop.map(g => AUTOLAND.evaluate(g, seed, EPISODES));
    const { pop: next, ranked } = AUTOLAND.evolve(pop, scored);
    const elite = scored.map((s, i) => [s, i]).sort((a, b) => b[0].fit - a[0].fit).slice(0, 10);
    const rate = elite.reduce((v, e) => v + e[0].landed, 0) / elite.length, sink = elite[0][0].sink;
    bestRate = Math.max(bestRate, rate);
    streak = rate > .95 ? streak + 1 : 0;
    pop = next; gen++;
    const done = streak >= 12 || gen >= 90;
    postMessage({ gen, rate, sink, done, pilots: ranked.slice(0, 24).map(g => g.slice()) });
    if (!done) setTimeout(burst, 30);
  }
  burst();
}
if (typeof module !== "undefined") module.exports = AUTOLAND;
