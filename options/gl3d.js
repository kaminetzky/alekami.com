// Minimal WebGL helpers for the free-camera 3D options: shaders, camera matrices and dynamic buffers.
window.GL3D = (function () {
  function program(gl, vs, fs) {
    const p = gl.createProgram();
    for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(o));
      gl.attachShader(p, o);
    }
    gl.linkProgram(p); return p;
  }
  // Column-major 4x4 matrices.
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  // A camera at eye looking at target. roll banks it around the view axis (radians, positive banks right).
  function lookAt(eye, target, roll) {
    const f = norm(sub(target, eye));
    let r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
    if (roll) { const c = Math.cos(roll), s = Math.sin(roll); [r, u] = [[r[0] * c - u[0] * s, r[1] * c - u[1] * s, r[2] * c - u[2] * s], [u[0] * c + r[0] * s, u[1] * c + r[1] * s, u[2] * c + r[2] * s]]; }
    const d = a => -(a[0] * eye[0] + a[1] * eye[1] + a[2] * eye[2]);
    return new Float32Array([r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, d(r), d(u), -d(f), 1]);
  }
  function mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; }
    return o;
  }
  // Draw interleaved float data with named attributes, e.g. [["aP", 3], ["aC", 4]].
  function draw(gl, prog, buf, data, layout, mode, count, uniforms) {
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    const stride = layout.reduce((s, l) => s + l[1], 0) * 4, locs = [];
    let off = 0;
    for (const [name, size] of layout) {
      const loc = gl.getAttribLocation(prog, name);
      if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off); locs.push(loc); }
      off += size * 4;
    }
    for (const k in uniforms || {}) {
      const v = uniforms[k], loc = gl.getUniformLocation(prog, k);
      if (v.length === 16) gl.uniformMatrix4fv(loc, false, v); else if (v.length === 3) gl.uniform3fv(loc, v); else if (v.length === 2) gl.uniform2fv(loc, v); else gl.uniform1f(loc, v);
    }
    gl.drawArrays(mode, 0, count);
    locs.forEach(l => gl.disableVertexAttribArray(l));
  }
  return { program, perspective, lookAt, mul, draw, norm, cross, sub };
})();
