// Single source of truth for every option. Change a value here and all pages follow.
window.SITE = {
  first: "Alex",
  last: "Kaminetzky",
  alias: "alekami",
  role: "Machine Learning Engineer",
  roles: ["Machine Learning Engineer", "Entrepreneur", "Developer"],
  github: "https://github.com/kaminetzky",
  linkedin: "https://www.linkedin.com/in/kaminetzky/",
  get full() { return this.first + " " + this.last; },
  // Starting quality for this device: 2 is full, 1 reduced, 0 minimal.
  tier(gl) {
    // Add ?tier=0 to a URL to preview how a page looks on a slow device.
    const forced = new URLSearchParams(location.search).get("tier");
    if (forced !== null) return +forced;
    const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 8;
    let t = cores <= 2 || mem <= 2 ? 0 : cores <= 4 || mem <= 4 ? 1 : 2;
    if (gl) {
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      if (info && /swiftshader|llvmpipe|software|basic render/i.test(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))) t = 0;
    }
    return t;
  },
  // Call the returned function once per frame. It lowers quality if frames stay slow, and never raises it again.
  governor(level, onDrop) {
    let n = 0, acc = 0, prev = 0;
    return t => {
      const d = t - prev; prev = t;
      if (d > 0 && d < 250) { acc += d; n++; }
      if (n >= 45) {
        const ms = acc / n; acc = n = 0;
        if (ms > 24 && level > 0) { level--; onDrop(level); }
      }
    };
  },
  // Without WebGL, the page still shows the name and links.
  noWebGL() {
    const h = document.createElement("div");
    h.textContent = this.full;
    h.style.cssText = "position:fixed;inset:0;display:grid;place-items:center;text-align:center;padding:16px;color:#fff;font:900 clamp(32px,8vw,96px)/1 Arial,sans-serif;pointer-events:none";
    document.body.append(h);
  },
  // Runs fn once the page has a real size. Hidden frames report a width of 0 at load.
  ready(fn) {
    if (innerWidth > 0 && innerHeight > 0) return fn();
    addEventListener("resize", function wait() {
      if (innerWidth > 0 && innerHeight > 0) { removeEventListener("resize", wait); fn(); }
    });
  },
  // Lines for big display type. Narrow screens put the surname on its own line; it is never split.
  lines(narrow) {
    const f = this.first.toUpperCase(), l = this.last.toUpperCase();
    return narrow ? [f, l] : [f + " " + l];
  },
};
document.title = window.SITE.full;
