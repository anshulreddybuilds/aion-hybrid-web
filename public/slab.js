/* AION — Border Instrument: the slab and the word field. Apache-2.0.
 * Created by Anshul Reddy (idea and project owner) for #BuildHybridAI 2026.
 *
 * A picture of real numbers, never a source of them. stage.js passes the word
 * lengths of the passages that stay on this device (green) and of the passages
 * in the current disclosure (amber), the disclosure phase and whether the
 * cloud is reachable. One mark = one word (sampled when there are more than
 * MAX marks; stage.js prints the sampling rate under the field).
 *
 *   draft / approved : amber marks wait at the border, on the device side
 *   sent             : they cross the slab and settle on the cloud side
 *   cloud down       : the cloud side goes grey and nothing crosses
 *
 * Budget: at most 200 marks, at most 30 frames a second, paused when the tab
 * is hidden. prefers-reduced-motion -> one static frame per change. If frames
 * are slow (low-power device) it drops to the same static mode by itself.
 */
(function () {
  "use strict";
  var MAX = 200;
  var FRAME_MS = 1000 / 30;
  var GREEN = "#2F6B4F", AMBER = "#C8791A", GREY = "#8A8F94";

  var cv = null, ctx = null, inst = null, slab = null;
  var W = 0, H = 0, dpr = 1;
  var parts = [];
  var model = { held: [], shared: [], phase: "draft", cloudDown: false };
  var key = "";
  var running = false, last = 0, rafId = 0;
  var reduced = false, staticMode = false;
  var perf = { n: 0, work: 0, gaps: [] };

  function sample(lens, budget) {
    if (lens.length <= budget) return lens.slice();
    var out = [], step = lens.length / budget;
    for (var i = 0; i < budget; i++) out.push(lens[Math.floor(i * step)]);
    return out;
  }

  /* Regions in CSS pixels. Marks stay in the lower band so the readouts above
   * stay legible. Amber marks are laid out like lines of a page (the
   * disclosure is one document); green marks wander loose on the device side. */
  function geo() {
    var gx = W / 2;
    var wide = W > 700;
    var top = wide ? Math.max(140, H * 0.47) : Math.max(84, H * 0.4), bot = wide ? H - 46 : H - 22;
    var pw = wide ? 190 : Math.min(96, gx - 70);
    return {
      gx: gx, gy: (top + bot) / 2, top: top, bot: bot, wide: wide,
      dev: [wide ? 22 : 14, gx - pw - (wide ? 44 : 22)],
      stage: [gx - pw - (wide ? 26 : 16), gx - (wide ? 26 : 16)],
      cloud: [gx + (wide ? 26 : 16), gx + pw + (wide ? 26 : 16)],
      drift: [gx + pw + (wide ? 50 : 22), W - 18],
    };
  }
  /* Flow the amber marks into lines inside [x0, x1], centred on the gate height. */
  function page(list, x0, x1, g) {
    var lines = [], line = [], w = 0, gap = 3;
    list.forEach(function (p) {
      if (w && w + p.len > x1 - x0) { lines.push(line); line = []; w = 0; }
      line.push(p); w += p.len + gap;
    });
    if (line.length) lines.push(line);
    var lh = Math.max(4, Math.min(7, (g.bot - g.top) / Math.max(1, lines.length)));
    var y = Math.max(g.top, g.gy - lines.length * lh / 2);
    lines.forEach(function (ln) {
      var x = x0;
      ln.forEach(function (p) { p.hx = x; p.hy = y; x += p.len + gap; });
      y += lh;
    });
  }
  function homes() {
    var g = geo();
    var amb = parts.filter(function (p) { return p.k === "a"; });
    page(amb.filter(function (p) { return p.state === "stage"; }), g.stage[0], g.stage[1], g);
    page(amb.filter(function (p) { return p.state !== "stage"; }), g.cloud[0], g.cloud[1], g);
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  function build() {
    var g = geo();
    var total = model.held.length + model.shared.length;
    var budget = Math.min(MAX, total, Math.floor(W * H / 520));
    var hb = total ? Math.round(budget * model.held.length / total) : 0;
    var held = sample(model.held, hb), shared = sample(model.shared, budget - hb);
    parts = [];
    var sc = g.wide ? 1 : 0.62;
    held = held.map(function (l) { return Math.max(3, Math.round(l * sc)); });
    shared = shared.map(function (l) { return Math.max(3, Math.round(l * sc)); });
    held.forEach(function (len) {
      parts.push({ k: "g", len: len, x: rnd(g.dev[0], g.dev[1]), y: rnd(g.top, g.bot), vx: rnd(-6, 6), vy: rnd(-4, 4), state: "dev" });
    });
    shared.forEach(function (len, i) {
      parts.push({ k: "a", len: len, i: i, x: 0, y: 0, state: "stage", t: 0 });
    });
    homes();
    parts.forEach(function (p) { if (p.k === "a") { p.x = p.hx; p.y = p.hy; } });
    place();
  }

  /* Move every amber mark to the state the model asks for. */
  function place() {
    var cross = model.phase === "sent";   /* already crossed; a later outage only greys them */
    parts.forEach(function (p) {
      if (p.k !== "a") return;
      if (cross && p.state === "stage") { p.state = "cross"; p.t = -p.i * 0.012; p.sx = p.x; p.sy = p.y; }
      else if (!cross && p.state !== "stage") p.state = "stage";
    });
    homes();
    parts.forEach(function (p) {
      if (p.k !== "a") return;
      if (p.state === "cross") { p.tx = p.hx; p.ty = p.hy; p.gy = geo().gy + rnd(-4, 4); }
      if (reduced || staticMode) { if (p.state === "cross") p.state = "cloud"; p.x = p.hx; p.y = p.hy; }
    });
  }
  function ease(t) { return 1 - Math.pow(1 - t, 3); }

  function step(dt, now) {
    var g = geo();
    parts.forEach(function (p) {
      if (p.state === "cross") {
        p.t += dt / 1.4;
        if (p.t <= 0) return;
        var t = Math.min(1, p.t);
        if (t < 0.5) { var a = ease(t / 0.5); p.x = p.sx + (g.gx - p.sx) * a; p.y = p.sy + (p.gy - p.sy) * a; }
        else { var b = ease((t - 0.5) / 0.5); p.x = g.gx + (p.tx - g.gx) * b; p.y = p.gy + (p.ty - p.gy) * b; }
        if (t >= 1) p.state = "cloud";
        return;
      }
      if (p.k === "a") {
        /* settle on the page line, with a faint breath; still when the cloud is down */
        var bob = model.cloudDown ? 0 : Math.sin(now / 900 + p.i * 0.7) * 0.6;
        p.x += (p.hx - p.x) * Math.min(1, dt * 6); p.y += (p.hy + bob - p.y) * Math.min(1, dt * 6);
        return;
      }
      var r = g.dev;
      p.vx += rnd(-14, 14) * dt; p.vy += rnd(-10, 10) * dt;
      p.vx *= 0.985; p.vy *= 0.985;
      var cap = 9; if (p.vx > cap) p.vx = cap; if (p.vx < -cap) p.vx = -cap; if (p.vy > cap) p.vy = cap; if (p.vy < -cap) p.vy = -cap;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.x < r[0]) { p.x = r[0]; p.vx = Math.abs(p.vx); } if (p.x > r[1] - p.len) { p.x = r[1] - p.len; p.vx = -Math.abs(p.vx); }
      if (p.y < g.top) { p.y = g.top; p.vy = Math.abs(p.vy); } if (p.y > g.bot) { p.y = g.bot; p.vy = -Math.abs(p.vy); }
    });
  }

  function draw() {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var g = geo();
    /* the crossing lane through the gate */
    ctx.fillStyle = model.cloudDown ? "rgba(138,143,148,.18)" : "rgba(200,121,26,.10)";
    ctx.fillRect(g.stage[0], g.gy - 1, g.cloud[0] - g.stage[0], 2);
    parts.forEach(function (p) {
      var col = p.k === "g" ? GREEN : (p.state === "cloud" && model.cloudDown ? GREY : AMBER);
      ctx.globalAlpha = p.k === "g" ? 0.78 : 0.92;
      ctx.fillStyle = col;
      var w = Math.max(3, p.len), h = 3;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), w, h);
    });
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    rafId = 0;
    if (!running) return;
    if (document.hidden) { schedule(); return; }
    var gap = now - last;
    if (gap < FRAME_MS - 1) { schedule(); return; }
    var dt = Math.min(0.1, gap / 1000);
    last = now;
    var t0 = performance.now();
    step(dt, now); draw();
    watch(performance.now() - t0, gap);
    schedule();
  }
  function schedule() { if (running && !rafId) rafId = requestAnimationFrame(frame); }

  /* Low-power fallback: if drawing costs > 8 ms a frame on average, or the
   * browser cannot keep even ~15 fps, stop animating and draw static frames. */
  function watch(work, gap) {
    if (perf.n > 90) return;
    perf.n += 1; perf.work += work;
    if (perf.n > 3) perf.gaps.push(gap);
    if (perf.n === 90) {
      var gaps = perf.gaps.slice().sort(function (a, b) { return a - b; });
      var median = gaps.length ? gaps[gaps.length >> 1] : 0;
      if (perf.work / perf.n > 8 || median > 70) goStatic("static");
    }
  }
  function goStatic(kind) {
    staticMode = true; running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    document.body.setAttribute("data-motion", kind);
    place(); settle(); draw();
  }
  /* A static frame shows the settled positions (no half-way crossings). */
  function settle() {
    var g = geo();
    parts.forEach(function (p) { if (p.state === "cross") p.state = "cloud"; if (p.k === "a") { p.x = p.hx; p.y = p.hy; } });
    void g;
  }

  function resize() {
    if (!cv || !inst) return;
    var r = inst.getBoundingClientRect();
    var ow = W, oh = H;
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    void ow; void oh;
    build();
    draw();
  }

  function tilt(e) {
    if (reduced || !slab) return;
    var r = inst.getBoundingClientRect();
    var nx = Math.max(-1, Math.min(1, (e.clientX - r.left - r.width / 2) / (r.width / 2)));
    var ny = Math.max(-1, Math.min(1, (e.clientY - r.top - r.height / 2) / (r.height / 2)));
    slab.style.setProperty("--tx", (nx * 6).toFixed(2));
    slab.style.setProperty("--ty", (-ny * 6).toFixed(2));
  }
  function untilt() { if (slab) { slab.style.setProperty("--tx", "0"); slab.style.setProperty("--ty", "0"); } }

  function mount(o) {
    cv = o.canvas; inst = o.instrument; slab = o.slab;
    if (!cv || !inst) return;
    ctx = cv.getContext("2d");
    var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    reduced = !!(mq && mq.matches);
    if (reduced) { staticMode = true; document.body.setAttribute("data-motion", "reduced"); }
    if (mq && mq.addEventListener) mq.addEventListener("change", function (ev) {
      reduced = ev.matches;
      if (reduced) { untilt(); goStatic("reduced"); }
    });
    if (typeof ResizeObserver === "function") new ResizeObserver(resize).observe(inst);
    else window.addEventListener("resize", resize);
    if (window.matchMedia && window.matchMedia("(pointer: fine)").matches) {
      inst.addEventListener("pointermove", tilt);
      inst.addEventListener("pointerleave", untilt);
    }
    resize();
    if (!staticMode) { running = true; schedule(); }
  }

  function set(m) {
    var next = {
      held: (m.held || []).slice(), shared: (m.shared || []).slice(),
      phase: m.phase || "draft", cloudDown: !!m.cloudDown,
    };
    var k = next.held.join(",") + "|" + next.shared.join(",");
    model = next;
    if (k !== key) { key = k; build(); } else place();
    if (staticMode) { settle(); draw(); }
  }

  window.AionSlab = {
    mount: mount,
    set: set,
    MAX: MAX,
    /* tests: how many marks of each colour, and where the amber ones are */
    debug: function () {
      var c = { green: 0, amber: 0, stage: 0, cross: 0, cloud: 0, motion: document.body.getAttribute("data-motion") };
      parts.forEach(function (p) { if (p.k === "g") c.green += 1; else { c.amber += 1; c[p.state] += 1; } });
      return c;
    },
  };
})();
