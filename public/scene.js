/* AION "The Line": the scene behind the page.
 *
 * Decoration only. It reads the page (which step is open, where the border's
 * rule is, whether a real send has happened) and never the case text. It
 * changes nothing in the app:
 *   - places the night picture so its wall of light sits exactly on the
 *     instrument's rule, on any screen size;
 *   - moves the camera a little for each step (zoom and tilt, never past the
 *     light), and dims the picture as the page scrolls;
 *   - draws stars, a little dust drifting in the light, and, only after a
 *     real approved send, a stream of motes that cross the line and turn
 *     signal orange.
 * Full motion only when body[data-motion="full"] (set by stage.js from
 * prefers-reduced-motion and the device); otherwise the picture is placed and
 * the stars are drawn once, with no animation. Paused while the tab is hidden.
 */
(function () {
  "use strict";
  var BEAM = 0.5;        /* the light's x in the picture, measured from the render */
  var HORIZON = 0.26;    /* stars stay above this fraction of the picture height */
  var CAM = {            /* zoom and vertical anchor per step */
    quote: { z: 1.00, y: 0.50 },
    share: { z: 1.07, y: 0.44 },
    send: { z: 1.15, y: 0.36 },
    verdict: { z: 1.05, y: 0.60 },
    proof: { z: 1.00, y: 0.52 },
  };

  var sky = document.getElementById("sky");
  var img = document.getElementById("skyImg");
  var cv = document.getElementById("skyFx");
  var body = document.body;
  if (!sky || !img || !cv || !cv.getContext) return;
  var ctx = cv.getContext("2d");

  function motion() { return body.getAttribute("data-motion") || "full"; }
  function full() { return motion() === "full"; }

  /* ------------------------------------------------------------ picture */
  if (!(img.complete && img.naturalWidth)) {
    sky.setAttribute("data-wait", "");
    var lit = function () { sky.removeAttribute("data-wait"); layout(true); };
    img.addEventListener("load", lit, { once: true });
    img.addEventListener("error", function () { sky.removeAttribute("data-wait"); }, { once: true });
  }

  var W = 0, H = 0, dpr = 1, beamX = 0;
  var cam = null, goal = { x: 0, y: 0, s: 1 };

  function ruleX(skyRect) {
    var r = document.querySelector("#instrument .rule");
    var rr = r && r.getBoundingClientRect();
    if (!rr || !rr.height) return W / 2;
    return rr.left + rr.width / 2 - skyRect.left;
  }

  function layout(snap) {
    var rect = sky.getBoundingClientRect();
    W = Math.max(1, rect.width); H = Math.max(1, rect.height);
    var iw = img.naturalWidth || 1800, ih = img.naturalHeight || 820;
    var c = CAM[body.getAttribute("data-step")] || CAM.quote;
    beamX = Math.min(W, Math.max(0, ruleX(rect)));
    var s = Math.max(W / iw, H / ih) * c.z;
    s = Math.max(s, beamX / (BEAM * iw), (W - beamX) / ((1 - BEAM) * iw));
    var left = Math.min(0, Math.max(W - iw * s, beamX - BEAM * iw * s));
    var top = (H - ih * s) * c.y;
    goal = { x: left, y: top, s: s };
    if (!cam || snap || !full()) cam = { x: left, y: top, s: s };
    sky.setAttribute("data-placed", "");
    img.style.width = iw + "px";
    img.style.height = ih + "px";
    sky.style.setProperty("--bxp", (beamX / W * 100).toFixed(2) + "%");

    var d = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(W * d) || cv.height !== Math.round(H * d)) {
      dpr = d; cv.width = Math.round(W * d); cv.height = Math.round(H * d);
    }
    apply();
    kick();
  }

  function apply() {
    img.style.transform = "translate3d(" + cam.x.toFixed(2) + "px," + cam.y.toFixed(2) + "px,0) scale(" + cam.s.toFixed(5) + ")";
  }

  /* ------------------------------------------------------------ particles */
  function rnd(a, b) { return a + Math.random() * (b - a); }
  var stars = [];
  for (var i = 0; i < 170; i++) {
    var v = Math.pow(Math.random(), 1.35) * HORIZON;
    stars.push({ u: Math.random(), v: v, r: rnd(.35, 1.15), a: rnd(.18, .75) * (1 - v / HORIZON * .7), p: rnd(0, 6.28), f: rnd(.4, 1.4) });
  }
  var dust = [];
  for (var j = 0; j < 34; j++) dust.push({ o: gauss() * 16, y: Math.random(), vy: rnd(.006, .018), r: rnd(.5, 1.4), a: rnd(.15, .55), p: rnd(0, 6.28) });
  var motes = [];
  function gauss() { var u = 1 - Math.random(), w = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * w); }

  /* A real send happened: motes stream from the device side across the line. */
  function burst() {
    if (!full()) return;
    var f = document.getElementById("field") || document.getElementById("instrument");
    var sr = sky.getBoundingClientRect(), fr = f.getBoundingClientRect();
    var y0 = Math.max(0, fr.top - sr.top), y1 = Math.min(H, fr.top - sr.top + Math.max(80, Math.min(fr.height, 360)));
    if (y1 - y0 < 40) { y0 = H * .35; y1 = H * .7; }
    for (var k = 0; k < 90; k++) {
      motes.push({ x: beamX - rnd(30, Math.min(320, beamX)), y: rnd(y0, y1), vx: rnd(140, 300), vy: rnd(-14, 14), t: -rnd(0, .9), life: rnd(1.6, 2.6), r: rnd(.6, 1.7) });
    }
    kick();
  }

  /* ------------------------------------------------------------ drawing */
  var raf = 0, last = 0, clock = 0;
  function kick() { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    var dt = last ? Math.min(.05, (now - last) / 1000) : .016;
    last = now; clock += dt;
    var moving = false;
    if (full()) {
      var k = 1 - Math.exp(-dt / .55);
      cam.x += (goal.x - cam.x) * k; cam.y += (goal.y - cam.y) * k; cam.s += (goal.s - cam.s) * k;
      moving = Math.abs(goal.x - cam.x) > .3 || Math.abs(goal.y - cam.y) > .3 || Math.abs(goal.s - cam.s) > .0002;
      if (!moving) cam = { x: goal.x, y: goal.y, s: goal.s };
      apply();
    }
    draw(dt);
    if (full() && !document.hidden) raf = requestAnimationFrame(moving || motes.length ? frame : idle);
  }
  /* idle: twinkle and dust at about 24 frames a second */
  function idle(now) { raf = 0; if (now - last < 41) { raf = requestAnimationFrame(idle); return; } frame(now); }

  function draw(dt) {
    var iw = img.naturalWidth || 1800, ih = img.naturalHeight || 820;
    var animate = full();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    /* stars, fixed to the picture so they move with the camera */
    ctx.fillStyle = "#ece6da";
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var x = cam.x + s.u * iw * cam.s, y = cam.y + s.v * ih * cam.s;
      if (x < -2 || x > W + 2 || y < -2 || y > H + 2) continue;
      if (Math.abs(x - beamX) < 10) continue;
      var a = s.a * (animate ? (.72 + .28 * Math.sin(clock * s.f + s.p)) : .9);
      ctx.globalAlpha = a;
      ctx.fillRect(x - s.r / 2, y - s.r / 2, s.r, s.r);
    }
    /* dust drifting up inside the light */
    for (var d = 0; d < dust.length; d++) {
      var m = dust[d];
      if (animate) { m.y -= m.vy * dt; if (m.y < -.02) { m.y = 1.02; m.o = gauss() * 16; } }
      var dy = m.y * H;
      ctx.globalAlpha = m.a * (animate ? (.6 + .4 * Math.sin(clock * 1.7 + m.p)) : .7);
      ctx.beginPath(); ctx.arc(beamX + m.o, dy, m.r, 0, 6.2832); ctx.fill();
    }
    /* the crossing, after a real send */
    for (var n = motes.length - 1; n >= 0; n--) {
      var p = motes[n];
      p.t += dt;
      if (p.t < 0) continue;
      if (p.t > p.life) { motes.splice(n, 1); continue; }
      var px = p.x + p.vx * p.t, py = p.y + p.vy * p.t;
      var over = px > beamX;
      var fade = Math.min(1, p.t / .25) * (1 - Math.max(0, (p.t - p.life * .55) / (p.life * .45)));
      ctx.globalAlpha = Math.max(0, fade) * (over ? .95 : .7);
      ctx.fillStyle = over ? "#ff6a2b" : "#ece6da";
      ctx.fillRect(px - p.r, py - p.r * .5, p.r * (over ? 3.2 : 2), p.r);
    }
    ctx.fillStyle = "#ece6da";
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------ wiring */
  var inst = document.getElementById("instrument");
  var crossed = 0;
  function mirror() {
    if (!inst) return;
    ["data-phase", "data-cloud"].forEach(function (k) {
      var v = inst.getAttribute(k);
      if (v) body.setAttribute(k, v); else body.removeAttribute(k);
    });
    var cn = document.getElementById("crossNum");
    var n = cn ? parseInt(String(cn.getAttribute("data-value") || "0").replace(/[^\d]/g, ""), 10) || 0 : 0;
    if (n > crossed && inst.getAttribute("data-phase") === "sent") burst();
    crossed = n;
  }
  if (inst && typeof MutationObserver === "function") {
    new MutationObserver(mirror).observe(inst, { attributes: true, attributeFilter: ["data-phase", "data-cloud"] });
    var cn = document.getElementById("crossNum");
    if (cn) new MutationObserver(mirror).observe(cn, { attributes: true, attributeFilter: ["data-value"] });
  }
  if (typeof MutationObserver === "function") {
    new MutationObserver(function () { layout(false); }).observe(body, { attributes: true, attributeFilter: ["data-step", "data-motion"] });
  }
  if (typeof ResizeObserver === "function" && inst) new ResizeObserver(function () { layout(false); }).observe(inst);
  window.addEventListener("resize", function () { layout(true); });

  var ticking = false;
  window.addEventListener("scroll", function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var dim = Math.max(0, Math.min(1, window.scrollY / (window.innerHeight * .9)));
      sky.style.setProperty("--dim", dim.toFixed(3));
    });
  }, { passive: true });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { last = 0; kick(); } });

  layout(true);
  mirror();
  /* stage.js boots asynchronously: line up again once the instrument has its numbers */
  setTimeout(function () { layout(false); }, 400);
})();
