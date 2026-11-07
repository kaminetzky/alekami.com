// The drone fleet shared by the Formation variants.
// The fleet brain was trained on a planar quadcopter, so each formation is a vertical plane (the frame).
// Inside it drones fly the real learned controller in metres; K turns metres into world units.
// Along the frame's axis they close in with simple kinematics.
window.FLEET = (function () {
  const FL = FLIGHT, D = DRONE, S = SITE;
  // STEPS sets how fast the drone simulation runs against real time; VMAX and AMAX cap the dash between formations.
  const K = 105, STEPS = 28, SIM = STEPS * .05, VMAX = 850, AMAX = 420;

  const words = lines => (g, w, h) => {
    const face = '900 100px "Arial Black","Helvetica Neue",Arial,sans-serif';
    g.font = face;
    const widest = Math.max(...lines.map(l => g.measureText(l).width));
    const size = Math.min(100 * w * .97 / widest, h * .94 / lines.length);
    g.font = face.replace("100px", size + "px");
    g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#fff";
    lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.03));
  };
  const art = (key, lw) => (g, w, h) => {
    const sh = SHAPES[key], s = Math.min(w / sh.w, h / sh.h) * .92;
    g.translate((w - sh.w * s) / 2, (h - sh.h * s) / 2); g.scale(s, s);
    g.strokeStyle = "#fff"; g.lineWidth = lw; g.lineCap = g.lineJoin = "round"; g.stroke(new Path2D(sh.d));
  };
  // Even grid sampling, so letters stay crisp. Points come back sorted left to right.
  function sample(N, paint, boxW, boxH) {
    const mw = 700, mh = Math.round(mw * boxH / boxW), m = document.createElement("canvas"); m.width = mw; m.height = mh;
    const g = m.getContext("2d", { willReadFrequently: true });
    paint(g, mw, mh);
    const d = g.getImageData(0, 0, mw, mh).data;
    // Pick the grid spacing with as many spots as drones without going over, so every spot gets a drone
    // (a denser grid with spots dropped at random left holes). The few spare drones double up on spots.
    const grid = step => { const list = []; for (let y = step / 2; y < mh; y += step) for (let a = step / 2; a < mw; a += step) if (d[((y | 0) * mw + (a | 0)) * 4 + 3] > 120) list.push([(a / mw - .5) * boxW, (.5 - y / mh) * boxH]); return list; };
    let lo = 1.5, hi = 24;
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (grid(mid).length > N) lo = mid; else hi = mid; }
    const list = grid(hi);
    for (let i = list.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0, t = list[i]; list[i] = list[j]; list[j] = t; }
    const out = [];
    for (let i = 0; i < N; i++) out.push(list[i % list.length]);
    return out.sort((a, b) => a[0] - b[0]);
  }
  // Name, then the four fields and drones. scale shrinks or grows every shape. With nameOnly, just the name.
  function standardShapes(N, narrow, scale, nameOnly) {
    const k = scale || 1, nw = (narrow ? 6.4 : 16) * k, nh = (narrow ? 5 : 4.4) * k, iw = (narrow ? 6 : 11) * k, ih = (narrow ? 4.6 : 5.2) * k;
    const make = (cap, paint, w, h, hue) => ({ cap, pts: sample(N, paint, w, h), w, h, hue });
    const name = make("", words(S.lines(narrow)), nw, nh, [.45, .95, 1]);
    if (nameOnly) return [name];
    return [
      name,
      make("MACHINE LEARNING", art("net", 3), iw, ih, [1, .4, .78]),
      make("SOFTWARE", words(["</>"]), iw, ih, [.55, .62, 1]),
      make("ELECTRICAL", art("chip", 5), iw, ih, [1, .82, .35]),
      make("PILOT", art("jet", 4.5), iw * 1.1, ih, [1, .62, .28]),
      make("DRONES", art("drone", 5), iw, ih, [.35, 1, .62]),
    ];
  }

  const VS = `
attribute vec3 aP; attribute vec4 aC;
uniform mat3 uR; uniform vec3 uCam; uniform float uF, uAsp, uPx;
varying vec4 vC;
${FL.PROJECT}
void main(){
  vec3 v=uR*(aP-uCam);
  gl_Position=project(v);
  gl_PointSize=clamp(uPx/max(v.z,1.),2.,26.);
  vC=aC; vC.a*=smoothstep(4.,40.,v.z)*(.55+.45*smoothstep(5200.,2600.,v.z));
}`;
  // Premultiplied colour with alpha, so the same shaders work for additive glow at night and normal blending by day.
  const DOT_FS = "precision mediump float; varying vec4 vC; void main(){ vec2 p=gl_PointCoord-.5; float d=dot(p,p)*4.; float a=min(1.,exp(-d*4.)*.75+exp(-d*30.))*vC.a; gl_FragColor=vec4(vC.rgb*a,a); }";
  const LINE_FS = "precision mediump float; varying vec4 vC; void main(){ gl_FragColor=vec4(vC.rgb*vC.a,vC.a); }";

  function create(gl, world, N) {
    const f = { N, K, SIM, drones: [], shapes: [], index: 0, brain: null, gen: 0, err: 0, trained: false, errs: [], worker: null, speed: 1 };
    // Frame: centre, along axis A and lateral axis L (both horizontal).
    const O = f.O = { x: 0, y: 0, z: 0, psi: 0, ax: 0, az: 1, lx: 1, lz: 0, passed: false, passT: 0, offT: 0 };
    for (let i = 0; i < N; i++) f.drones.push({ x: 0, y: 0, vx: 0, vy: 0, a: 0, w: 0, s: 0, sv: 0, tx: 0, ty: 0, ts: 0, r: .45, g: .95, b: 1, flash: 0, seed: Math.random() });

    f.build = (narrow, scale, nameOnly) => { f.shapes = standardShapes(N, narrow, scale, nameOnly); };
    // Fly with the controller trained offline (brain.js) instead of training live.
    f.pretrained = () => { f.brain = Float32Array.from(DRONE_BRAIN); f.trained = true; };
    // "add" glows at night; "normal" paints solid dots for daylight.
    f.blend = "add";
    f.shape = () => f.shapes[f.index];
    f.next = () => { f.index = (f.index + 1) % f.shapes.length; };
    f.toWorld = (d, out) => {
      out[0] = O.x + O.lx * d.x * K + O.ax * d.s; out[1] = O.y + d.y * K; out[2] = O.z + O.lz * d.x * K + O.az * d.s;
    };
    // speed runs the controller's clock faster: the same brain, flying quicker drones.
    f.velocity = (d, out) => {
      const k = K * SIM * f.speed;
      out[0] = O.lx * d.vx * k + O.ax * d.sv; out[1] = d.vy * k; out[2] = O.lz * d.vx * k + O.az * d.sv;
    };
    // Put a drone on the ground below its slot, ready to launch.
    f.park = d => {
      d.x = d.tx + (Math.random() - .5) * .4; d.s = d.ts + (Math.random() - .5) * 260;
      const gx = O.x + O.lx * d.x * K + O.ax * d.s, gz = O.z + O.lz * d.x * K + O.az * d.s;
      d.y = (FL.terrain(gx, gz) + 5 - O.y) / K; d.vx = d.vy = d.a = d.w = d.sv = 0;
    };
    f.assign = sh => {
      const order = f.drones.map((_, i) => i).sort((a, b) => f.drones[a].x - f.drones[b].x);
      order.forEach((di, k) => { const d = f.drones[di]; d.tx = sh.pts[k][0]; d.ty = sh.pts[k][1]; d.ts = 0; });
    };
    // The ground under the frame's approach, sampled once per move: along the axis every GS world units from SMIN to just past
    // the slots, across it every GU metres. Drones in transit read it to climb over hills on the way in instead of hitting them.
    // A frame that moves continuously (carry) has none, since drones fly with it rather than across the ground.
    const GS = 100, SMIN = -4600, NS = 50, GU = 2, NU = 31;
    let ground = null;
    function sampleGround() {
      ground = ground || new Float32Array(NS * NU);
      for (let i = 0; i < NS; i++) for (let j = 0; j < NU; j++) {
        const s = SMIN + i * GS, u = (j - (NU >> 1)) * GU * K;
        ground[i * NU + j] = (FL.terrain(O.x + O.lx * u + O.ax * s, O.z + O.lz * u + O.az * s) - O.y) / K;
      }
    }
    // Lowest safe height for a drone, in frame metres: the highest ground just under and ahead of it, plus a margin.
    const floor = d => {
      if (!ground) return -1e9;
      const i = Math.floor((d.s - SMIN) / GS), j = Math.round(d.x / GU) + (NU >> 1);
      if (i < 0 || i >= NS - 3 || j < 0 || j >= NU) return -1e9;
      return Math.max(ground[i * NU + j], ground[(i + 1) * NU + j], ground[(i + 2) * NU + j], ground[(i + 3) * NU + j]) + 1.2;
    };
    // Move the frame. With carry, drones ride along with it; otherwise they keep their place in the world.
    const P = [0, 0, 0], V = [0, 0, 0];
    f.frame = (x, y, z, psi, carry) => {
      const ax = Math.sin(psi), az = Math.cos(psi), lx = az, lz = -ax;
      if (!carry) for (const d of f.drones) {
        f.toWorld(d, P); f.velocity(d, V);
        const rx = P[0] - x, ry = P[1] - y, rz = P[2] - z;
        d.x = (rx * lx + rz * lz) / K; d.y = ry / K; d.s = rx * ax + rz * az;
        d.vx = (V[0] * lx + V[2] * lz) / (K * SIM * f.speed); d.vy = V[1] / (K * SIM * f.speed); d.sv = V[0] * ax + V[2] * az;
      }
      Object.assign(O, { x, y, z, psi, ax, az, lx, lz });
      if (carry) ground = null; else sampleGround();
    };
    // Lowest centre height at which a shape clears the terrain under it.
    f.clearance = (x, z, psi, sh) => {
      const lx = Math.cos(psi), lz = -Math.sin(psi);
      let foot = -1e9;
      for (let u = -.6; u <= .6; u += .05) foot = Math.max(foot, FL.terrain(x + lx * u * sh.w * K, z + lz * u * sh.w * K));
      return foot + sh.h / 2 * K + 90;
    };
    // Place the current shape dist ahead on heading psi, clear of the terrain under it and along the way.
    f.anchorAhead = (F, dist, psi) => {
      const ax = Math.sin(psi), az = Math.cos(psi), cx = F.x + ax * dist, cz = F.z + az * dist;
      let path = -1e9;
      for (let k = 0; k <= 1; k += .04) path = Math.max(path, FL.terrain(F.x + ax * dist * k, F.z + az * dist * k));
      f.frame(cx, Math.max(F.alt, f.clearance(cx, cz, psi, f.shape()), path + 140), cz, psi, false);
      O.passed = false; O.offT = 0;
      f.assign(f.shape());
    };
    // Where the aircraft is in frame coordinates: ps along the axis (world units), pu and pv in metres.
    f.plane = F => {
      const rx = F.x - O.x, rz = F.z - O.z;
      return { ps: rx * O.ax + rz * O.az, pu: (rx * O.lx + rz * O.lz) / K, pv: (F.alt - O.y) / K, dist: Math.hypot(rx, rz) };
    };

    // Live training in a worker. Each generation's best brain flies the whole fleet.
    // Training pauses while the page is hidden. With ?pop=1 the worker also sends the whole population, ranked (f.pop).
    f.train = url => {
      const w = f.worker = new Worker(url || "drone-sim.js"), pause = () => w.postMessage({ pause: document.hidden });
      document.addEventListener("visibilitychange", pause);
      w.onmessage = ({ data }) => {
        f.brain = data.best; f.gen = data.gen; f.err = data.err; f.errs.push(data.err); f.secs = data.secs;
        if (data.pop) f.pop = data.pop;
        if (data.done) { f.trained = true; w.terminate(); document.removeEventListener("visibilitychange", pause); }
      };
    };

    // The flythrough cycle: when the aircraft passes the formation, or turns away from it, the next shape forms ahead.
    f.flythrough = (F, dt, clock, dist, turn, hand) => {
      const p = f.plane(F);
      if (!O.passed && p.ps > 30) { O.passed = true; O.passT = clock; O.passAlt = F.alt; }
      const off = Math.abs(FL.wrap(Math.atan2(O.x - F.x, O.z - F.z) - F.psi)) > 1.4 || p.dist > dist * 1.8;
      O.offT = !O.passed && off ? O.offT + dt : 0;
      if ((O.passed && clock - O.passT > .55) || O.offT > 2.5) {
        f.next(); f.anchorAhead(F, dist, hand ? F.psi : F.psi + (Math.random() - .5) * turn); return true;
      }
      return false;
    };
    // Autopilot aim for a flythrough: the middle of the formation, holding heading once it's close,
    // then the altitude it passed at, so the nose doesn't dip while the next formation is placed.
    f.aim = F => {
      const p = f.plane(F);
      return { psi: p.ps < -350 && !O.passed ? Math.atan2(O.x - F.x, O.z - F.z) : F.psi, alt: O.passed ? O.passAlt : O.y };
    };

    // Advance the fleet. F is the aircraft (for its bow wave); hue tints the drones.
    // Per drone: wait (seconds before it moves), vk (along-axis speed factor), brain (its own controller, else the fleet's).
    // f.wind(d, out), if set, writes the wind on a drone as an acceleration in m/s².
    let stepClock = 0;
    const WIND = [0, 0];
    f.step = (dt, F, hue, wake) => {
      if (!f.brain) return;
      const p = f.plane(F), speed = F.v * 1.9;
      stepClock += dt * STEPS * f.speed;
      const steps = Math.min(Math.ceil(4 * f.speed), stepClock | 0); stepClock -= steps;
      for (let i = 0; i < N; i++) {
        const d = f.drones[i];
        if (d.wait > 0) { d.wait -= dt; continue; }
        if (f.wind) f.wind(d, WIND);
        const brain = d.brain || f.brain, low = floor(d), ty = Math.max(d.ty, low);
        for (let k = 0; k < steps; k++) D.step(brain, d, d.tx, ty, WIND[0], WIND[1]);
        // Along the axis: accelerate, cruise and brake onto the slot. A drone too close to the ground climbs first.
        const vk = f.speed * (d.vk || 1), e = d.s - d.ts, climb = d.y < low - .4 ? .1 : 1;
        const goal = -Math.sign(e) * Math.min(VMAX * vk, Math.sqrt(2 * AMAX * vk * vk * Math.abs(e))) * climb;
        d.sv += (goal - d.sv) * Math.min(1, dt * 3 * vk); d.s += d.sv * dt;
        // The aircraft's bow wave pushes drones out of its path. The controller has to recover.
        const ahead = d.s - p.ps;
        if (wake !== false && ahead > -150 && ahead < 480) {
          const dx = d.x - p.pu, dy = d.y - p.pv, q = Math.hypot(dx, dy);
          if (q < 3.4) {
            const w = (1 - q / 3.4) * (1 - Math.max(0, ahead) / 480);
            // Sideways and up; only gently down, so the lowest drones aren't driven into the ground.
            d.vx += dx / (q + .05) * w * 45 * dt; d.vy += dy / (q + .05) * w * (dy > 0 ? 45 : 12) * dt;
            d.sv += speed * w * dt * 3; d.flash = Math.max(d.flash, w * 1.6);
          }
        }
        f.toWorld(d, P);
        const gy = (FL.terrain(P[0], P[2]) + 2 - O.y) / K;
        if (!(d.x === d.x) || Math.abs(d.x) > 40 || d.y > 30) f.park(d);
        // A drone that touches the ground lands where it is, levels off and takes off again, rather than vanishing.
        else if (d.y < gy) { d.y = gy; d.vy = Math.max(0, d.vy); d.vx *= .5; d.sv *= .5; d.a *= .3; d.w = 0; d.landed = (d.landed || 0) + 1; }
        if (hue) { d.r += (hue[0] - d.r) * .04; d.g += (hue[1] - d.g) * .04; d.b += (hue[2] - d.b) * .04; }
        d.flash *= Math.max(0, 1 - dt * 2.5);
      }
    };

    // Rendering: additive glowing dots plus motion streaks. Extra lines and dots (a plane model, runway lights) share the shaders.
    const dotP = world.program(VS, DOT_FS), lineP = world.program(VS, LINE_FS);
    const dotBuf = gl.createBuffer(), lineBuf = gl.createBuffer(), extraBuf = gl.createBuffer();
    const dotData = new Float32Array(N * 7), lineData = new Float32Array(N * 14);
    gl.bindBuffer(gl.ARRAY_BUFFER, dotBuf); gl.bufferData(gl.ARRAY_BUFFER, dotData.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf); gl.bufferData(gl.ARRAY_BUFFER, lineData.byteLength, gl.DYNAMIC_DRAW);
    function draw(ctx, prog, buf, data, mode, count, upload) {
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      if (upload) gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW); else gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
      const aP = gl.getAttribLocation(prog, "aP"), aC = gl.getAttribLocation(prog, "aC");
      gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 28, 0);
      gl.enableVertexAttribArray(aC); gl.vertexAttribPointer(aC, 4, gl.FLOAT, false, 28, 12);
      const u = n => gl.getUniformLocation(prog, n);
      gl.uniformMatrix3fv(u("uR"), false, ctx.R); gl.uniform3f(u("uCam"), ctx.P.x, ctx.P.alt, ctx.P.z);
      gl.uniform1f(u("uF"), FL.FOCAL); gl.uniform1f(u("uAsp"), ctx.aspect); gl.uniform1f(u("uPx"), (ctx.size || 9) * FL.FOCAL * ctx.height / 2);
      gl.drawArrays(mode, 0, count);
      gl.disableVertexAttribArray(aP); gl.disableVertexAttribArray(aC);
    }
    const additive = on => {
      if (on) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, f.blend === "add" ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }
      else { gl.disable(gl.BLEND); gl.depthMask(true); }
    };
    // ctx: { R, P (camera position), aspect, height (drawing buffer height) }.
    // Per drone: lum scales its brightness, hide leaves it to the page to draw.
    f.render = ctx => {
      for (let i = 0; i < N; i++) {
        const d = f.drones[i];
        f.toWorld(d, P); f.velocity(d, V);
        const sp = Math.min(1, Math.hypot(V[0], V[1], V[2]) / 1200), fl = Math.min(1, d.flash);
        const lum = d.lum === undefined ? 1 : d.lum, vis = d.hide ? 0 : 1;
        const r = (d.r + (1 - d.r) * (sp * .35 + fl * .6)) * lum, g = (d.g * (1 - fl * .45) + fl * .25) * lum, b = (d.b + (1 - d.b) * fl * .4) * lum;
        let o = i * 7;
        dotData[o] = P[0]; dotData[o + 1] = P[1]; dotData[o + 2] = P[2];
        dotData[o + 3] = r; dotData[o + 4] = g; dotData[o + 5] = b; dotData[o + 6] = vis;
        o = i * 14;
        lineData[o] = P[0]; lineData[o + 1] = P[1]; lineData[o + 2] = P[2];
        lineData[o + 3] = r; lineData[o + 4] = g; lineData[o + 5] = b; lineData[o + 6] = (.8 * sp + .1) * vis;
        lineData[o + 7] = P[0] - V[0] * .07; lineData[o + 8] = P[1] - V[1] * .07; lineData[o + 9] = P[2] - V[2] * .07;
        lineData[o + 10] = r; lineData[o + 11] = g; lineData[o + 12] = b; lineData[o + 13] = 0;
      }
      additive(true);
      draw(ctx, lineP, lineBuf, lineData, gl.LINES, N * 2);
      draw(ctx, dotP, dotBuf, dotData, gl.POINTS, N);
      additive(false);
    };
    // Arbitrary extra geometry, 7 floats per vertex: x y z r g b a.
    f.extra = (ctx, data, lines) => {
      additive(true);
      draw(ctx, lines ? lineP : dotP, extraBuf, data, lines ? gl.LINES : gl.POINTS, data.length / 7, true);
      additive(false);
    };
    return f;
  }
  return { create, sample, words, art, K };
})();
