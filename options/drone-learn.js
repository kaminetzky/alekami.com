// More ways to train the same drone brain. The training worker in drone-sim.js loads this file when a preset asks for
// one of these algorithms. Every trainer returns a function that runs one round (a generation, or a batch of gradient
// steps) and returns { best, ranked? }: the brain to fly now and, for population methods, every candidate ranked best first.
// All of them use the brain layout and physics from drone-sim.js (one hidden layer, the original task).
const DRONE_LEARN = (function () {
  const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(6.2832 * Math.random());
  const randn = (n, s) => { const v = new Float32Array(n); for (let i = 0; i < n; i++) v[i] = gauss() * s; return v; };
  // Methods that compare a new brain with an old one fly both on the same fresh flights each round:
  // a fair comparison that can't be won by memorising a fixed set of flights.
  const fresh = () => 1 + (Math.random() * 1e9 | 0);
  // A random brain whose motors start near hover (output biases), so early candidates don't all drop out of the sky.
  function seedBrain(D, scale) {
    const g = randn(D.GENES, scale), H = D.C.hidden[0], OUT = H * 8;
    g[OUT + H] = g[OUT + H + 1 + H] = 1.2;
    return g;
  }

  // Cross-entropy method: sample brains around a mean, keep the best fifth, move the mean and spread to fit them.
  function cem(D) {
    const C = D.C, n = D.GENES, mean = seedBrain(D, .2), sd = new Float32Array(n).fill(.3), ELITE = Math.max(4, C.pop / 5 | 0);
    return () => {
      const seed = 1 + (Math.random() * 1e9 | 0), pop = [];
      for (let k = 0; k < C.pop; k++) { const g = new Float32Array(n); for (let i = 0; i < n; i++) g[i] = mean[i] + sd[i] * gauss(); pop.push(g); }
      const ranked = pop.map(g => [D.evaluate(g, seed, C.episodes).fit, g]).sort((a, b) => b[0] - a[0]).map(p => p[1]);
      for (let i = 0; i < n; i++) {
        let m = 0, v = 0;
        for (let k = 0; k < ELITE; k++) m += ranked[k][i];
        m /= ELITE;
        for (let k = 0; k < ELITE; k++) v += (ranked[k][i] - m) ** 2;
        // Smoothed update with a noise floor, so the spread never collapses before it has found a good brain.
        mean[i] = .7 * m + .3 * mean[i]; sd[i] = .7 * Math.sqrt(v / ELITE) + .3 * sd[i] + .01;
      }
      return { best: mean.slice(), ranked };
    };
  }

  // Particle swarm: each brain is a particle in weight space, pulled toward its own best spot and the swarm's best.
  function pso(D) {
    const C = D.C, n = D.GENES, W = C.inertia || .6, C1 = 1.4, C2 = 1.4, VMAX = C.vmax || .1;
    const xs = Array.from({ length: C.pop }, () => seedBrain(D, .25)), vs = Array.from({ length: C.pop }, () => randn(n, .02));
    const pb = xs.map(x => x.slice());
    let gi = 0;
    return () => {
      const seed = fresh(), g = pb[gi], fits = [], pf = pb.map(p => D.evaluate(p, seed, C.episodes).fit);
      xs.forEach((x, k) => {
        const v = vs[k], p = pb[k];
        for (let i = 0; i < n; i++) {
          v[i] = W * v[i] + C1 * Math.random() * (p[i] - x[i]) + C2 * Math.random() * (g[i] - x[i]);
          v[i] = v[i] > VMAX ? VMAX : v[i] < -VMAX ? -VMAX : v[i];
          x[i] += v[i];
        }
        const f = D.evaluate(x, seed, C.episodes).fit;
        fits.push(f);
        if (f > pf[k]) { pf[k] = f; pb[k].set(x); }
      });
      gi = pf.indexOf(Math.max(...pf));
      return { best: pb[gi].slice(), ranked: xs.map((x, k) => [fits[k], x]).sort((a, b) => b[0] - a[0]).map(p => p[1].slice()) };
    };
  }

  // Differential evolution: a new brain is one member plus the scaled difference of two others, crossed with its parent.
  function de(D) {
    const C = D.C, n = D.GENES, F = C.F || .6, CR = C.CR || .5;
    const pop = Array.from({ length: C.pop }, () => seedBrain(D, .25));
    return () => {
      const seed = fresh(), fit = pop.map(g => D.evaluate(g, seed, C.episodes).fit);
      for (let k = 0; k < C.pop; k++) {
        let a, b, c;
        do { a = Math.random() * C.pop | 0; } while (a === k);
        do { b = Math.random() * C.pop | 0; } while (b === k || b === a);
        do { c = Math.random() * C.pop | 0; } while (c === k || c === a || c === b);
        const t = pop[k].slice(), j0 = Math.random() * n | 0;
        for (let i = 0; i < n; i++) if (i === j0 || Math.random() < CR) t[i] = pop[a][i] + F * (pop[b][i] - pop[c][i]);
        const f = D.evaluate(t, seed, C.episodes).fit;
        if (f > fit[k]) { fit[k] = f; pop[k] = t; }
      }
      const order = fit.map((f, k) => [f, k]).sort((x, y) => y[0] - x[0]);
      return { best: pop[order[0][1]].slice(), ranked: order.map(([, k]) => pop[k].slice()) };
    };
  }

  // Hill climbing, a (1+1) evolution strategy: mutate the one brain, keep the change if it flies better,
  // and widen or narrow the mutations by the one-fifth success rule.
  function hill(D) {
    const C = D.C, n = D.GENES;
    let x = seedBrain(D, .2), sigma = .05;
    return () => {
      for (let r = 0; r < 25; r++) {
        const y = new Float32Array(n), seed = fresh(), fx = D.evaluate(x, seed, C.episodes).fit;
        for (let i = 0; i < n; i++) y[i] = x[i] + sigma * gauss();
        const fy = D.evaluate(y, seed, C.episodes).fit;
        if (fy >= fx) { x = y; sigma *= 1.5; } else sigma *= Math.pow(1.5, -.25);
        sigma = Math.min(.5, Math.max(.002, sigma));
      }
      return { best: x.slice() };
    };
  }

  // ---------- Gradients through the brain and the physics ----------
  // A one-hidden-layer brain: inputs -> tanh hidden -> two motor commands in (0, 1).
  function net(D) {
    const NI = 7, H = D.C.hidden[0], OUT = H * (NI + 1);
    const h = new Float64Array(H), o = new Float64Array(2), inp = new Float64Array(NI);
    const forward = (g, s, tx, ty) => {
      inp[0] = Math.max(-1.5, Math.min(1.5, (tx - s.x) / 2)); inp[1] = Math.max(-1.5, Math.min(1.5, (ty - s.y) / 2));
      inp[2] = s.vx / 4; inp[3] = s.vy / 4; inp[4] = Math.sin(s.a); inp[5] = Math.cos(s.a); inp[6] = s.w / 4;
      for (let j = 0; j < H; j++) { let z = g[j * 8 + 7]; for (let k = 0; k < NI; k++) z += g[j * 8 + k] * inp[k]; h[j] = Math.tanh(z); }
      for (let m = 0; m < 2; m++) { const b = OUT + m * (H + 1); let u = g[b + H]; for (let j = 0; j < H; j++) u += g[b + j] * h[j]; o[m] = .5 + .5 * Math.tanh(u); }
    };
    // Given dLoss/do for the last forward pass, add dLoss/dweights into grad and return dLoss/dinputs in gin.
    const gin = new Float64Array(NI), gh = new Float64Array(H);
    const backward = (g, go0, go1, grad, hs, os, ins) => {
      gh.fill(0); gin.fill(0);
      for (let m = 0; m < 2; m++) {
        const b = OUT + m * (H + 1), om = os[m], gu = (m ? go1 : go0) * .5 * (1 - (2 * om - 1) ** 2);
        for (let j = 0; j < H; j++) { grad[b + j] += gu * hs[j]; gh[j] += gu * g[b + j]; }
        grad[b + H] += gu;
      }
      for (let j = 0; j < H; j++) {
        const gz = gh[j] * (1 - hs[j] * hs[j]);
        for (let k = 0; k < NI; k++) { grad[j * 8 + k] += gz * ins[k]; gin[k] += gz * g[j * 8 + k]; }
        grad[j * 8 + 7] += gz;
      }
      return gin;
    };
    return { forward, backward, h, o, inp, H, NI };
  }
  function adam(n, lr) {
    const m = new Float64Array(n), v = new Float64Array(n);
    let t = 0;
    return (g, grad) => {
      t++;
      // Clip the overall gradient size, since gradients through a long flight can spike.
      let norm = 0; for (let i = 0; i < n; i++) norm += grad[i] * grad[i];
      const k = Math.min(1, 1 / (Math.sqrt(norm) + 1e-12));
      for (let i = 0; i < n; i++) {
        const gi = grad[i] * k;
        m[i] = .9 * m[i] + .1 * gi; v[i] = .999 * v[i] + .001 * gi * gi;
        g[i] -= lr * (m[i] / (1 - Math.pow(.9, t))) / (Math.sqrt(v[i] / (1 - Math.pow(.999, t))) + 1e-8);
      }
    };
  }
  const initBrain = D => seedBrain(D, .25);

  // Backpropagation through time: the physics is differentiable, so fly a batch of flights, then follow the loss back
  // through every time step, motor and neuron to get the exact gradient for each weight, and take an Adam step.
  function bptt(D) {
    const C = D.C, n = D.GENES, N = net(D), H = N.H, DT = D.DT, G = D.G, SPIN = D.SPIN, TM = C.tmax;
    const T = 70, B = C.batch || 6, g = initBrain(D), grad = new Float64Array(n), step = adam(n, C.lr || .02);
    const tape = Array.from({ length: T }, () => ({ s: {}, inp: new Float64Array(7), h: new Float64Array(H), o: new Float64Array(2) }));
    function episode(tx, ty) {
      const s = { x: tx + (Math.random() - .5) * 10, y: ty + (Math.random() - .5) * 8, vx: gauss(), vy: gauss(), a: (Math.random() - .5) * .6, w: 0 };
      for (let t = 0; t < T; t++) {
        const r = tape[t];
        Object.assign(r.s, s);
        N.forward(g, s, tx, ty); r.inp.set(N.inp); r.h.set(N.h); r.o.set(N.o);
        const o0 = N.o[0], o1 = N.o[1], thrust = (o0 + o1) * TM * .5;
        s.vx = (s.vx - thrust * Math.sin(s.a) * DT) * .995; s.vy = (s.vy + (thrust * Math.cos(s.a) - G) * DT) * .995;
        s.w = (s.w + (o1 - o0) * SPIN * DT) * .96; s.a += s.w * DT; s.x += s.vx * DT; s.y += s.vy * DT;
        r.after = { x: s.x, y: s.y, vx: s.vx, vy: s.vy, w: s.w };
      }
      // Walk back through the flight. q holds dLoss/dstate after the current step.
      let qx = 0, qy = 0, qvx = 0, qvy = 0, qa = 0, qw = 0;
      for (let t = T - 1; t >= 0; t--) {
        const r = tape[t], A = r.after, s = r.s, late = t / T;
        // Loss for being at A: distance to the target, weighted toward the end, plus leftover speed and spin late on.
        const dx = A.x - tx, dy = A.y - ty, d = Math.sqrt(dx * dx + dy * dy + .01), wd = .3 + 1.7 * late * late;
        qx += wd * dx / d; qy += wd * dy / d;
        if (late > .6) { qvx += .3 * A.vx; qvy += .3 * A.vy; }
        qw += .02 * Math.sign(A.w);
        // Through the position and angle updates, which use the new velocities and spin.
        qvx += qx * DT; qvy += qy * DT; qw += qa * DT;
        const ca = Math.cos(s.a), sa = Math.sin(s.a), o0 = r.o[0], o1 = r.o[1], thrust = (o0 + o1) * TM * .5;
        // Through the damped velocity and spin updates.
        const gvx = qvx * .995, gvy = qvy * .995, gw = qw * .96;
        let gT = -gvx * sa * DT + gvy * ca * DT;
        let pa = qa - gvx * thrust * ca * DT - gvy * thrust * sa * DT;
        const go0 = gT * TM * .5 - gw * SPIN * DT, go1 = gT * TM * .5 + gw * SPIN * DT;
        // Through the brain, back to its inputs, which are functions of the state before the step.
        const gi = N.backward(g, go0, go1, grad, r.h, r.o, r.inp);
        let px = qx, py = qy, pvx = gvx, pvy = gvy, pw = gw;
        if (Math.abs((tx - s.x) / 2) < 1.5) px -= gi[0] / 2;
        if (Math.abs((ty - s.y) / 2) < 1.5) py -= gi[1] / 2;
        pvx += gi[2] / 4; pvy += gi[3] / 4; pa += gi[4] * ca - gi[5] * sa; pw += gi[6] / 4;
        qx = px; qy = py; qvx = pvx; qvy = pvy; qa = pa; qw = pw;
      }
    }
    return () => {
      for (let it = 0; it < 6; it++) {
        grad.fill(0);
        for (let b = 0; b < B; b++) episode((Math.random() - .5) * 12, (Math.random() - .5) * 8);
        for (let i = 0; i < n; i++) grad[i] /= B * T;
        step(g, grad);
      }
      return { best: Float32Array.from(g) };
    };
  }

  // A hand-tuned flight controller (PD control of position, then of attitude), the teacher for imitation learning.
  function expert(D, s, tx, ty, out) {
    const G = D.G, TM = D.C.tmax, clip = (v, m) => v > m ? m : v < -m ? -m : v;
    const ax = clip(1.4 * (tx - s.x) - 2 * s.vx, 5), ay = clip(1.4 * (ty - s.y) - 2 * s.vy, 2);
    const want = Math.atan2(-ax, ay + G), T = Math.min(TM, (ay + G) / Math.max(.3, Math.cos(want)));
    const err = Math.atan2(Math.sin(want - s.a), Math.cos(want - s.a)), diff = clip((45 * err - 9 * s.w) / D.SPIN, 1);
    out[0] = Math.max(0, Math.min(1, T / TM - diff / 2)); out[1] = Math.max(0, Math.min(1, T / TM + diff / 2));
  }
  // Imitation learning (behaviour cloning with DAgger): fly the student, ask the teacher what it would have done in
  // every state the student visits, and fit the brain to those answers by gradient descent.
  function clone(D) {
    const C = D.C, n = D.GENES, N = net(D), g = initBrain(D), grad = new Float64Array(n), step = adam(n, .01);
    const CAP = 20000, X = [], Y = [], cmd = new Float64Array(2);
    let round = 0;
    return () => {
      // Collect: early on the teacher mostly flies; later the student flies and the teacher only labels.
      const beta = Math.max(0, 1 - round++ / 30);
      for (let e = 0; e < 4; e++) {
        const tx = (Math.random() - .5) * 12, ty = (Math.random() - .5) * 8;
        const s = { x: tx + (Math.random() - .5) * 10, y: ty + (Math.random() - .5) * 8, vx: gauss(), vy: gauss(), a: (Math.random() - .5) * .6, w: 0 };
        for (let t = 0; t < 90; t++) {
          expert(D, s, tx, ty, cmd);
          N.forward(g, s, tx, ty);
          X.push(N.inp.slice()); Y.push([cmd[0], cmd[1]]);
          if (X.length > CAP) { const k = Math.random() * CAP | 0; X[k] = X.pop(); Y[k] = Y.pop(); }
          const teacher = Math.random() < beta;
          D.stepWith(s, teacher ? cmd[0] : N.o[0], teacher ? cmd[1] : N.o[1]);
        }
      }
      // Fit: minibatches of state, teacher command pairs, mean squared error on the motor commands.
      for (let it = 0; it < 30; it++) {
        grad.fill(0);
        for (let b = 0; b < 64; b++) {
          const k = Math.random() * X.length | 0, inp = X[k];
          N.inp.set(inp);
          // Forward from stored inputs.
          for (let j = 0; j < N.H; j++) { let z = g[j * 8 + 7]; for (let q = 0; q < 7; q++) z += g[j * 8 + q] * inp[q]; N.h[j] = Math.tanh(z); }
          const OUT = N.H * 8;
          for (let m = 0; m < 2; m++) { const bb = OUT + m * (N.H + 1); let u = g[bb + N.H]; for (let j = 0; j < N.H; j++) u += g[bb + j] * N.h[j]; N.o[m] = .5 + .5 * Math.tanh(u); }
          N.backward(g, 2 * (N.o[0] - Y[k][0]), 2 * (N.o[1] - Y[k][1]), grad, N.h, N.o, inp);
        }
        for (let i = 0; i < n; i++) grad[i] /= 64;
        step(g, grad);
      }
      return { best: Float32Array.from(g) };
    };
  }

  return { cem, pso, de, hill, bptt, clone, expert };
})();
if (typeof module !== "undefined") module.exports = DRONE_LEARN;
