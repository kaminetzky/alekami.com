// Shared by Flight Deck and Formation: synthetic terrain, sky, a smooth flight model, the HUD and a drag-to-fly stick.
window.FLIGHT = (function () {
  // DATUM lifts displayed altitudes so the lowest valleys still read above sea level.
  const DEG = Math.PI / 180, FOCAL = 1.25, DATUM = 420;
  const clamp = (v, m) => v > m ? m : v < -m ? -m : v;
  const wrap = a => { while (a > Math.PI) a -= 6.2832; while (a < -Math.PI) a += 6.2832; return a; };

  // The same terrain formula runs in JS for terrain following and in GLSL for rendering.
  // AMP scales the hills. Up to two flat zones (runways) are levelled into the terrain with a smooth blend.
  const raw = (x, z) => 170 * Math.sin(x * .0031 + 1.3 * Math.sin(z * .0017)) + 110 * Math.sin(z * .0043 + x * .0011) + 46 * Math.sin((x + z) * .011) + 16 * Math.sin(x * .031) * Math.sin(z * .027);
  let AMP = 1;
  const ZONES = [null, null];
  const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const level = (zn, x, z, h) => {
    if (!zn) return h;
    const dx = x - zn.x, dz = z - zn.z, s = Math.sin(zn.psi), c = Math.cos(zn.psi), a = dx * s + dz * c, l = dx * c - dz * s;
    const da = Math.max(zn.a0 - a, a - zn.a1, 0), dl = Math.max(Math.abs(l) - zn.hw, 0);
    return zn.h + (h - zn.h) * Math.max(1 - zn.k, smooth(0, 400, Math.hypot(da, dl)));
  };
  const terrain = (x, z) => level(ZONES[1], x, z, level(ZONES[0], x, z, raw(x, z) * AMP));
  // Camera space to clip space. Pages that draw their own objects reuse it.
  const PROJECT = "vec4 project(vec3 v){ float n=2., f=7000.; return vec4(v.x*uF/uAsp, v.y*uF, v.z*(f+n)/(f-n)-2.*f*n/(f-n), v.z); }";
  const VS = `
attribute vec2 aG;
uniform vec2 uC; uniform vec3 uCam; uniform mat3 uR; uniform float uF, uAsp, uLift;
varying float vH, vD;
uniform float uAmp; uniform vec4 uZa0, uZb0, uZa1, uZb1; uniform vec2 uZh;
// Zone a: centre x, z and the sine and cosine of its heading. b: along-track start and end, half width, strength.
float level(vec2 p, vec4 a, vec4 b, float h0, float h){
  if(b.w<=0.) return h;
  vec2 d=p-a.xy; float al=dot(d,a.zw), l=d.x*a.w-d.y*a.z;
  float da=max(max(b.x-al,al-b.y),0.), dl=max(abs(l)-b.z,0.);
  return mix(h0,h,max(1.-b.w,smoothstep(0.,400.,length(vec2(da,dl)))));
}
float H(vec2 p){ float h=(170.*sin(p.x*.0031+1.3*sin(p.y*.0017))+110.*sin(p.y*.0043+p.x*.0011)+46.*sin((p.x+p.y)*.011)+16.*sin(p.x*.031)*sin(p.y*.027))*uAmp; return level(p,uZa1,uZb1,uZh.y,level(p,uZa0,uZb0,uZh.x,h)); }
${PROJECT}
void main(){
  vec2 w=aG+uC; float h=H(w);
  vec3 v=uR*(vec3(w.x,h+uLift,w.y)-uCam);
  vD=length(v); vH=h;
  gl_Position=project(v);
}`;
  const FS = `
precision mediump float; varying float vH, vD; uniform float uLine, uFog;
void main(){
  float fog=smoothstep(uFog,uFog*.2,vD);
  vec3 sky=vec3(.42,.16,.34);
  vec3 c;
  if(uLine>.5){ float t=clamp((vH+300.)/650.,0.,1.); c=mix(vec3(.1,.95,.85),vec3(1.,.42,.75),t); c=mix(sky,c*(.55+.6*fog),fog); }
  else c=mix(sky,vec3(.015,.02,.06),fog);
  gl_FragColor=vec4(c,1.);
}`;
  const SKY_VS = "attribute vec2 a; varying vec2 v; void main(){v=a;gl_Position=vec4(a,.9999,1.);}";
  const SKY_FS = `
precision mediump float; varying vec2 v; uniform mat3 uR; uniform float uF, uAsp; uniform vec3 uSun;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
void main(){
  vec3 d=normalize(vec3(v.x*uAsp/uF,v.y/uF,1.)*uR);
  float y=d.y;
  vec3 c=mix(vec3(.42,.16,.34),vec3(.13,.06,.26),smoothstep(0.,.22,y));
  c=mix(c,vec3(.02,.02,.09),smoothstep(.15,.65,y));
  float s=max(dot(d,uSun),0.);
  c+=vec3(1.,.5,.25)*pow(s,14.)*.55+vec3(1.,.85,.6)*pow(s,500.)*1.4;
  vec2 sc=vec2(atan(d.z,d.x),asin(clamp(y,-1.,1.)))*260.;
  vec2 g=floor(sc), fr=fract(sc)-.5;
  float st=h21(g);
  if(st>.985) c+=vec3(.9)*smoothstep(.05,.45,y)*smoothstep(.42,.05,length(fr))*(st-.985)*66.;
  gl_FragColor=vec4(c,1.);
}`;

  // Daylight toon style: lit by the terrain normal in soft bands, pastel by height, fogged into a pastel sky.
  const PASTEL_VS = VS.replace("varying float vH, vD;", "varying float vH, vD; varying vec3 vN;")
    .replace("  vD=length(v); vH=h;", "  vD=length(v); vH=h;\n  float e=22.; vN=normalize(vec3(H(w-vec2(e,0.))-H(w+vec2(e,0.)),2.*e,H(w-vec2(0.,e))-H(w+vec2(0.,e))));");
  const PASTEL_FS = `
precision mediump float; varying float vH, vD; varying vec3 vN; uniform float uLine, uFog;
void main(){
  float l=max(dot(normalize(vN),normalize(vec3(.45,.75,.3))),0.);
  l=floor(l*4.+.5)/4.;
  float t=clamp((vH+260.)/560.,0.,1.);
  vec3 c=t<.4?mix(vec3(.98,.80,.66),vec3(.60,.86,.76),t/.4):t<.8?mix(vec3(.60,.86,.76),vec3(.74,.68,.94),(t-.4)/.4):mix(vec3(.74,.68,.94),vec3(1.,.98,.96),(t-.8)/.2);
  c*=.5+.6*l;
  gl_FragColor=vec4(mix(vec3(.99,.87,.82),c,smoothstep(uFog,uFog*.2,vD)),1.);
}`;
  const PASTEL_SKY_FS = `
precision mediump float; varying vec2 v; uniform mat3 uR; uniform float uF, uAsp; uniform vec3 uSun;
void main(){
  vec3 d=normalize(vec3(v.x*uAsp/uF,v.y/uF,1.)*uR);
  vec3 c=mix(vec3(.99,.87,.82),vec3(.56,.76,.98),smoothstep(-.02,.5,d.y));
  float s=max(dot(d,uSun),0.);
  c+=vec3(1.,.95,.8)*(pow(s,12.)*.35+smoothstep(.9985,.9995,s));
  gl_FragColor=vec4(c,1.);
}`;

  // style: undefined for the night wireframe look, "pastel" for daylight toon shading.
  function scene(gl, G, style) {
    const pastel = style === "pastel";
    const program = (vs, fs) => {
      const p = gl.createProgram();
      for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); gl.attachShader(p, o); }
      gl.linkProgram(p); return p;
    };
    const terrainP = pastel ? program(PASTEL_VS, PASTEL_FS) : program(VS, FS), skyP = program(SKY_VS, pastel ? PASTEL_SKY_FS : SKY_FS);
    const u = n => gl.getUniformLocation(terrainP, n), us = n => gl.getUniformLocation(skyP, n);
    const STEP = 44, half = (G - 1) * STEP / 2;
    const verts = new Float32Array(G * G * 2);
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { verts[(j * G + i) * 2] = i * STEP - half; verts[(j * G + i) * 2 + 1] = j * STEP - half; }
    const tris = [], lines = [];
    for (let j = 0; j < G - 1; j++) for (let i = 0; i < G - 1; i++) {
      const a = j * G + i, b = a + 1, d = a + G, e = d + 1;
      tris.push(a, b, d, b, e, d);
      lines.push(a, b, a, d);
    }
    const vb = gl.createBuffer(), tb = gl.createBuffer(), lb = gl.createBuffer(), qb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, tb); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(tris), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lb); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(lines), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enable(gl.DEPTH_TEST); gl.clearColor(.03, .02, .1, 1);
    const sunDir = (() => { const a = 40 * DEG, y = .08; return [Math.sin(a) * Math.sqrt(1 - y * y), y, Math.cos(a) * Math.sqrt(1 - y * y)]; })();

    // Draws sky and terrain from the camera position P (x, alt, z). Returns the camera rotation so callers can draw more on top.
    function render(P, cam, aspect) {
      const R = new Float32Array([cam.right[0], cam.up[0], cam.fw[0], cam.right[1], cam.up[1], cam.fw[1], cam.right[2], cam.up[2], cam.fw[2]]);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.depthMask(false);
      gl.useProgram(skyP);
      gl.bindBuffer(gl.ARRAY_BUFFER, qb);
      const aS = gl.getAttribLocation(skyP, "a"); gl.enableVertexAttribArray(aS); gl.vertexAttribPointer(aS, 2, gl.FLOAT, false, 0, 0);
      gl.uniformMatrix3fv(us("uR"), false, R); gl.uniform1f(us("uF"), FOCAL); gl.uniform1f(us("uAsp"), aspect); gl.uniform3fv(us("uSun"), sunDir);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(aS);
      gl.depthMask(true);

      gl.useProgram(terrainP);
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      const aG = gl.getAttribLocation(terrainP, "aG"); gl.enableVertexAttribArray(aG); gl.vertexAttribPointer(aG, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(u("uC"), Math.round(P.x / STEP) * STEP, Math.round(P.z / STEP) * STEP);
      gl.uniform3f(u("uCam"), P.x, P.alt, P.z);
      gl.uniformMatrix3fv(u("uR"), false, R);
      gl.uniform1f(u("uF"), FOCAL); gl.uniform1f(u("uAsp"), aspect); gl.uniform1f(u("uAmp"), AMP);
      // The terrain melts fully into the sky just inside the grid's edge, so the edge and new rows never show.
      gl.uniform1f(u("uFog"), half * .92);
      ZONES.forEach((zn, i) => {
        gl.uniform4f(u("uZa" + i), zn ? zn.x : 0, zn ? zn.z : 0, zn ? Math.sin(zn.psi) : 0, zn ? Math.cos(zn.psi) : 1);
        gl.uniform4f(u("uZb" + i), zn ? zn.a0 : 0, zn ? zn.a1 : 0, zn ? zn.hw : 0, zn ? zn.k : 0);
      });
      gl.uniform2f(u("uZh"), ZONES[0] ? ZONES[0].h : 0, ZONES[1] ? ZONES[1].h : 0);
      // Solid fill first, then wireframe, so ridges hide what's behind them.
      gl.uniform1f(u("uLine"), 0); gl.uniform1f(u("uLift"), -1.5);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, tb); gl.drawElements(gl.TRIANGLES, tris.length, gl.UNSIGNED_SHORT, 0);
      if (!pastel) {
        gl.uniform1f(u("uLine"), 1); gl.uniform1f(u("uLift"), 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lb); gl.drawElements(gl.LINES, lines.length, gl.UNSIGNED_SHORT, 0);
      }
      gl.disableVertexAttribArray(aG);
      return R;
    }
    return { render, program };
  }

  // Flight state. Heading: 0 is north (+z), clockwise positive. Bank: positive is right wing down.
  const aircraft = () => ({ x: 0, z: 0, alt: terrain(0, 0) + 260, psi: 0, theta: 0, phi: 0, p: 0, q: 0, v: 118, vs: 0, g: 1, floor: null });

  // Autopilot: hold a heading and stay clear of the terrain ahead, or climb to minAlt if that is higher.
  // With exact set, minAlt is flown as the target altitude even below the terrain floor (for approaches); pitch0 is a feed-forward pitch.
  function autopilot(F, dt, psiTarget, minAlt, exact, pitch0) {
    const fx = Math.sin(F.psi), fz = Math.cos(F.psi);
    let highest = -1e9;
    for (const d of [0, 200, 450, 800, 1200]) highest = Math.max(highest, terrain(F.x + fx * d, F.z + fz * d));
    // The floor rises quickly for safety and sinks slowly, so the aircraft doesn't bob over every ridge.
    const floor = highest + 95;
    if (F.floor === null) F.floor = floor;
    F.floor += (floor - F.floor) * Math.min(1, dt * (floor > F.floor ? 2.5 : .5));
    const alt = exact ? minAlt : Math.max(F.floor + 40, minAlt === undefined ? -1e9 : minAlt);
    return {
      phi: clamp(wrap(psiTarget - F.psi) * 1.1, 34 * DEG),
      // Gentle limits: a cruise climb or descent, never a steep zoom.
      theta: Math.max(-6 * DEG, Math.min(7 * DEG, (pitch0 || 0) + Math.atan2(alt - F.alt, F.v * 4))),
    };
  }

  function fly(F, dt, want) {
    // Roll and pitch follow their targets like critically damped springs, so attitude changes ease in and out.
    F.p = clamp(F.p + (6 * (want.phi - F.phi) - 4.9 * F.p) * dt, 40 * DEG);
    F.q = clamp(F.q + (5 * (want.theta - F.theta) - 4.5 * F.q) * dt, 14 * DEG);
    F.phi += F.p * dt; F.theta += F.q * dt;
    const turn = Math.tan(F.phi) * .42;
    F.psi = wrap(F.psi + turn * dt);
    const units = F.v * 1.9;
    F.x += Math.sin(F.psi) * Math.cos(F.theta) * units * dt;
    F.z += Math.cos(F.psi) * Math.cos(F.theta) * units * dt;
    F.vs = Math.sin(F.theta) * units;
    F.alt += F.vs * dt;
    F.alt = Math.max(F.alt, terrain(F.x, F.z) + (F.minAGL || 24));
    F.v += ((F.vRef || 118) - Math.sin(F.theta) * 90 - F.v) * dt * .4;
    F.g = 1 / Math.max(.3, Math.cos(F.phi));
  }

  // Camera basis for the current attitude: rows are right, up and forward.
  // A right bank tilts the right axis down and the up axis toward the turn, so the horizon rises on the right.
  function basis(F) {
    const cy = Math.cos(F.psi), sy = Math.sin(F.psi), cp = Math.cos(F.theta), sp = Math.sin(F.theta), cr = Math.cos(F.phi), sr = Math.sin(F.phi);
    const fw = [sy * cp, sp, cy * cp], r0 = [cy, 0, -sy], u0 = [-sy * sp, cp, -cy * sp];
    const right = [r0[0] * cr - u0[0] * sr, r0[1] * cr - u0[1] * sr, r0[2] * cr - u0[2] * sr];
    const up = [r0[0] * sr + u0[0] * cr, r0[1] * sr + u0[1] * cr, r0[2] * sr + u0[2] * cr];
    return { right, up, fw };
  }

  // World point to screen pixels. z is the distance ahead; callers skip points with small z.
  function project(cam, F, x, y, z, W, H) {
    const rx = x - F.x, ry = y - F.alt, rz = z - F.z;
    const vz = cam.fw[0] * rx + cam.fw[1] * ry + cam.fw[2] * rz;
    const vx = cam.right[0] * rx + cam.right[1] * ry + cam.right[2] * rz, vy = cam.up[0] * rx + cam.up[1] * ry + cam.up[2] * rz;
    return { x: W / 2 + vx / vz * FOCAL * H / 2, y: H / 2 - vy / vz * FOCAL * H / 2, z: vz };
  }

  // A drag is a virtual stick centred where the finger lands. It starts at the current attitude, so taking control never jolts the aircraft.
  // Like a yoke, dragging down pulls the nose up and dragging up pushes it down.
  function stick(el, F) {
    const s = { hand: false, x: 0, y: 0, rawX: 0, rawY: 0, ox: 0, oy: 0, downX: 0, downY: 0, curX: 0, curY: 0, moved: false, onRelease: null, onTap: null };
    el.addEventListener("pointerdown", e => {
      s.downX = s.curX = e.clientX; s.downY = s.curY = e.clientY; s.moved = false; s.hand = true;
      s.ox = s.x = s.rawX = clamp(F.phi / (50 * DEG), 1); s.oy = s.y = s.rawY = clamp(-F.theta / (22 * DEG), 1);
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", e => {
      if (!s.hand) return;
      s.curX = e.clientX; s.curY = e.clientY;
      s.rawX = clamp(s.ox + (e.clientX - s.downX) / (innerWidth * .22), 1);
      s.rawY = clamp(s.oy - (e.clientY - s.downY) / (innerHeight * .22), 1);
      if (Math.hypot(e.clientX - s.downX, e.clientY - s.downY) > 8) s.moved = true;
    });
    const up = e => {
      if (!s.hand) return;
      s.hand = false;
      if (s.onRelease) s.onRelease();
      if (!s.moved && s.onTap && e.type === "pointerup") s.onTap(e);
    };
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);

    // Arrow keys or WASD fly too: left and right bank, and like a yoke, up pushes the nose down and down pulls it up.
    // Holding a key leans the stick over gradually; letting go centres it, and the autopilot takes back over after a few idle seconds.
    const KEYS = { ArrowLeft: "l", KeyA: "l", ArrowRight: "r", KeyD: "r", ArrowUp: "u", KeyW: "u", ArrowDown: "d", KeyS: "d" }, held = {};
    let keyboard = false, idle = 0;
    addEventListener("keydown", e => {
      const k = KEYS[e.code];
      if (!k || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      if (!s.hand) { s.hand = true; s.x = s.rawX = clamp(F.phi / (50 * DEG), 1); s.y = s.rawY = clamp(-F.theta / (22 * DEG), 1); }
      held[k] = true; keyboard = s.keys = true; idle = 0;
    });
    addEventListener("keyup", e => { const k = KEYS[e.code]; if (k) held[k] = false; });
    el.addEventListener("pointerdown", () => { keyboard = s.keys = false; });
    const steer = (raw, minus, plus, dt) => {
      const dir = (held[plus] ? 1 : 0) - (held[minus] ? 1 : 0);
      return dir ? clamp(raw + dir * dt * 1.6, 1) : raw - Math.sign(raw) * Math.min(Math.abs(raw), dt * 2.2);
    };

    s.want = dt => {
      if (keyboard) {
        s.rawX = steer(s.rawX, "l", "r", dt); s.rawY = steer(s.rawY, "d", "u", dt);
        idle = held.l || held.r || held.u || held.d ? 0 : idle + dt;
        if (idle > 3) { keyboard = s.keys = false; s.hand = false; if (s.onRelease) s.onRelease(); }
      }
      // Pointer events arrive in bursts; filtering them keeps the controls fluid.
      const k = Math.min(1, dt * 10);
      s.x += (s.rawX - s.x) * k; s.y += (s.rawY - s.y) * k;
      let theta = -s.y * 22 * DEG;
      if (F.alt < terrain(F.x, F.z) + 70) theta = Math.max(theta, 12 * DEG); // ground protection
      return { phi: s.x * 50 * DEG, theta };
    };
    return s;
  }

  // How to take control: a mouse or trackpad also has the arrow keys; a touch screen only has the drag.
  const FLY = typeof matchMedia === "function" && matchMedia("(pointer: fine)").matches ? "ARROWS OR DRAG TO FLY" : "DRAG TO FLY";
  const GREEN = "#7dff9b", AMBER = "#ffcf6a";
  // The HUD draws in these. A page can pass other colours in hud's options, for a daylight style.
  let INK = GREEN, ACC = AMBER, BOX = "#04080a";
  function tapeBox(h, x, y, w, ht, value, align, step) {
    h.save();
    h.beginPath(); h.rect(x, y - ht / 2, w, ht); h.clip();
    h.fillStyle = BOX + "55"; h.fillRect(x, y - ht / 2, w, ht);
    h.strokeStyle = INK; h.fillStyle = INK; h.lineWidth = 1.3; h.font = "12px ui-monospace,Menlo,monospace";
    h.textBaseline = "middle";
    const pxPer = 44 / step;
    const start = Math.floor((value - ht / 2 / pxPer) / step) * step;
    for (let v = start; v < value + ht / 2 / pxPer; v += step) {
      const py = y - (v - value) * pxPer;
      h.beginPath();
      if (align === "left") { h.moveTo(x + w, py); h.lineTo(x + w - 9, py); h.textAlign = "right"; h.fillText(Math.round(v), x + w - 13, py); }
      else { h.moveTo(x, py); h.lineTo(x + 9, py); h.textAlign = "left"; h.fillText(Math.round(v), x + 13, py); }
      h.stroke();
    }
    h.restore();
    h.strokeStyle = INK; h.lineWidth = 1.3; h.strokeRect(x, y - ht / 2, w, ht);
    // Readout box for the current value.
    h.fillStyle = BOX; h.fillRect(x + 1, y - 13, w - 2, 26);
    h.strokeStyle = ACC; h.strokeRect(x + 1, y - 13, w - 2, 26);
    h.fillStyle = ACC; h.font = "bold 14px ui-monospace,Menlo,monospace"; h.textAlign = "center"; h.textBaseline = "middle";
    h.fillText(Math.round(value), x + w / 2, y);
  }

  // Clears the HUD canvas and draws the instruments. The transform is left in CSS pixels for anything drawn after.
  function hud(canvas, h, W, H, F, mode, modeColor, st, opt) {
    INK = (opt && opt.ink) || GREEN; ACC = (opt && opt.accent) || AMBER; BOX = (opt && opt.box) || "#04080a";
    const sc = canvas.width / W;
    h.setTransform(sc, 0, 0, sc, 0, 0);
    h.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H * .44, pxDeg = FOCAL * (H / 2) * DEG;
    // The heading tape (unless opt.heading is false) and the mode line take the top, below any notch (opt.inset).
    // On short screens the ladder and bank scale stay below them.
    const heading = !opt || opt.heading !== false, hy = Math.max(18, H * .035) + ((opt && opt.inset) || 0);
    const modeY = heading ? hy + 68 : hy + 26, top = modeY + 12;

    // Pitch ladder and horizon, rotated with the aircraft. A chase camera has no use for them.
    // Like a G1000, the ladder sits inside a round window just within the bank arc, whose radius is R.
    const ladder = !opt || opt.ladder !== false, R = Math.min(W * .42, H * .42, 300, H / 2 - top - 14);
    if (ladder) {
      h.save();
      h.beginPath(); h.arc(cx, H / 2, R - 4, 0, 6.2832); h.clip();
      h.translate(cx, H / 2); h.rotate(-F.phi);
      h.translate(0, F.theta / DEG * pxDeg);
      h.strokeStyle = INK; h.fillStyle = INK; h.lineWidth = 1.5; h.font = "11px ui-monospace,Menlo,monospace";
      h.textBaseline = "middle";
      for (let a = -40; a <= 40; a += 5) {
        const y = -a * pxDeg, wide = a === 0 ? 240 : a % 10 === 0 ? 62 : 28;
        h.beginPath();
        if (a < 0) h.setLineDash([6, 5]);
        h.moveTo(-wide, y); h.lineTo(-Math.min(wide, 14), y);
        h.moveTo(wide, y); h.lineTo(Math.min(wide, 14), y);
        h.stroke(); h.setLineDash([]);
        if (a !== 0 && a % 10 === 0) { h.textAlign = "right"; h.fillText(Math.abs(a), -wide - 5, y); h.textAlign = "left"; h.fillText(Math.abs(a), wide + 5, y); }
    }
    h.restore();

    // Aircraft reference and flight path marker.
    const vx = cx, vy = H / 2 - F.theta * .65 / DEG * pxDeg * .5;
    h.strokeStyle = ACC; h.lineWidth = 2;
    h.beginPath(); h.moveTo(cx - 44, H / 2); h.lineTo(cx - 16, H / 2); h.lineTo(cx - 8, H / 2 + 8); h.lineTo(cx, H / 2); h.lineTo(cx + 8, H / 2 + 8); h.lineTo(cx + 16, H / 2); h.lineTo(cx + 44, H / 2); h.stroke();
    h.strokeStyle = INK; h.lineWidth = 1.5;
    h.beginPath(); h.arc(vx, vy, 6, 0, 6.3); h.moveTo(vx - 6, vy); h.lineTo(vx - 18, vy); h.moveTo(vx + 6, vy); h.lineTo(vx + 18, vy); h.moveTo(vx, vy - 6); h.lineTo(vx, vy - 13); h.stroke();

    // Bank scale: an arc from 60 degrees left to 60 right, with ticks and a fixed index at the top. A page can leave it out (opt.bank false).
    if (!opt || opt.bank !== false) {
    h.strokeStyle = INK; h.lineWidth = 1.3;
    h.save(); h.translate(cx, H / 2);
    h.beginPath(); h.arc(0, 0, R, -150 * DEG, -30 * DEG); h.stroke();
    for (const a of [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60]) {
      const t = (a - 90) * DEG, l = a % 30 === 0 ? 12 : 7;
      h.beginPath(); h.moveTo(Math.cos(t) * R, Math.sin(t) * R); h.lineTo(Math.cos(t) * (R + l), Math.sin(t) * (R + l)); h.stroke();
    }
    h.fillStyle = INK; h.beginPath(); h.moveTo(0, -R - 1); h.lineTo(-7, -R - 12); h.lineTo(7, -R - 12); h.fill();
    h.rotate(-F.phi);
    h.fillStyle = ACC; h.beginPath(); h.moveTo(0, -R + 2); h.lineTo(-7, -R + 13); h.lineTo(7, -R + 13); h.fill();
    h.restore();
    }
    }

    // Speed and altitude tapes. A page can leave them out (opt.tapes false), as on phones where they crowd the view.
    if (!opt || opt.tapes !== false) {
      const tw = W < 560 ? 52 : 70, th = Math.min(H * .46, 360), margin = W < 560 ? 8 : Math.max(18, W * .07), ty = H * .42;
      tapeBox(h, margin, ty, tw, th, F.v, "left", 20);
      tapeBox(h, W - margin - tw, ty, tw, th, (F.alt + DATUM) * 3.28, "right", 200);
      h.fillStyle = INK; h.font = "11px ui-monospace,Menlo,monospace"; h.textAlign = "center"; h.textBaseline = "alphabetic";
      h.fillText("KIAS", margin + tw / 2, ty - th / 2 - 7);
      h.fillText("ALT FT", W - margin - tw / 2, ty - th / 2 - 7);
      h.fillText("VS " + Math.round(F.vs * 197 / 1.9), W - margin - tw / 2, ty + th / 2 + 16);
      h.fillText("G " + F.g.toFixed(1), margin + tw / 2, ty + th / 2 + 16);
    }

    // Heading tape.
    if (heading) {
      const hw = Math.min(W * .62, 520), hx = cx - hw / 2, hd = (F.psi / DEG + 360) % 360;
      h.save(); h.beginPath(); h.rect(hx, hy, hw, 34); h.clip();
      h.strokeStyle = INK; h.fillStyle = INK; h.lineWidth = 1.2; h.font = "12px ui-monospace,Menlo,monospace"; h.textAlign = "center"; h.textBaseline = "alphabetic";
      const NAMES = { 0: "N", 90: "E", 180: "S", 270: "W" };
      for (let a = Math.floor((hd - 60) / 10) * 10; a <= hd + 60; a += 10) {
        const x = cx + (a - hd) * (hw / 90), v = (a + 360) % 360;
        h.beginPath(); h.moveTo(x, hy + 34); h.lineTo(x, hy + (a % 30 === 0 ? 21 : 28)); h.stroke();
        if (a % 30 === 0) h.fillText(NAMES[v] || String(v / 10 | 0).padStart(2, "0"), x, hy + 15);
    }
    h.restore();
    h.fillStyle = ACC; h.beginPath(); h.moveTo(cx, hy + 34); h.lineTo(cx - 6, hy + 43); h.lineTo(cx + 6, hy + 43); h.fill();
    }

    // Mode annunciator.
    h.font = "bold 12px ui-monospace,Menlo,monospace"; h.textAlign = "center"; h.textBaseline = "alphabetic";
    h.fillStyle = modeColor || INK;
    h.fillText(mode, cx, modeY);

    // The virtual stick: a ring where the finger landed and a knob that follows it.
    // The drag ring sits where the finger went down, so keyboard flying has none.
    if (st && st.hand && !st.keys) {
      const kx = st.downX + (st.x - st.ox) * innerWidth * .22, ky = st.downY - (st.y - st.oy) * innerHeight * .22;
      h.strokeStyle = ACC; h.globalAlpha = .7; h.lineWidth = 1.5;
      h.beginPath(); h.arc(st.downX, st.downY, 26, 0, 6.3); h.stroke();
      h.beginPath(); h.moveTo(st.downX, st.downY); h.lineTo(kx, ky); h.stroke();
      h.fillStyle = ACC; h.beginPath(); h.arc(kx, ky, 7, 0, 6.3); h.fill();
      h.globalAlpha = 1;
    }
  }

  // Pages that need gentler hills or a runway set these before the first frame.
  const setAmp = a => { AMP = a; };
  const setZone = (i, zn) => { ZONES[i] = zn; };
  return { FLY, DEG, FOCAL, GREEN, AMBER, PROJECT, terrain, raw, wrap, clamp, smooth, scene, aircraft, autopilot, fly, basis, project, stick, hud, setAmp, setZone };
})();
