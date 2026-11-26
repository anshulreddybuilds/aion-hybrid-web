/* AION — "The Seam" ambient layer. Apache-2.0.
 * Created by Anshul Reddy (idea and project owner) for #BuildHybridAI 2026.
 *
 * Purely visual. It reads what stage.js has already drawn and never changes
 * app state, text or numbers. Three small things:
 *   1. Light inside the border: jade motes stay in the device room and bounce
 *      off the seam; ember motes appear in the cloud room only once characters
 *      have really crossed, in proportion to the measured counts on screen.
 *   2. A soft spotlight that follows the pointer over panels.
 *   3. A sliding pill behind the current step in the header.
 * Still (drawn once, no movement) under prefers-reduced-motion or when the
 * app picks reduced/static motion.
 * Every part is wrapped so a failure here can never break the app.
 */
(function () {
  "use strict";
  var doc = document, body = doc.body;
  var reduceQ = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  function motionOK() { return !reduceQ.matches && (body.getAttribute("data-motion") || "full") === "full"; }
  function safe(fn) { try { fn(); } catch (e) { /* decorative only */ } }
  function num(el) {
    if (!el) return 0;
    var v = (el.getAttribute("data-value") || "").replace(/[^\d]/g, "");
    return v ? parseInt(v, 10) : 0;
  }

  /* ---------- 1. light inside the border ---------- */
  safe(function () {
    var inst = doc.getElementById("instrument");
    if (!inst || !window.HTMLCanvasElement) return;
    var cv = doc.createElement("canvas");
    cv.className = "seam-fx"; cv.setAttribute("aria-hidden", "true");
    inst.insertBefore(cv, inst.firstChild);
    var ctx = cv.getContext("2d");
    if (!ctx) return;
    var W = 0, H = 0, dpr = 1, seamX = 0, motes = [], raf = 0, visible = true, last = 0;
    var MAX = 90;

    function measure() {
      var r = inst.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var rule = inst.querySelector(".rule");
      if (rule && rule.offsetParent !== null) {
        var rr = rule.getBoundingClientRect();
        seamX = rr.left - r.left + rr.width / 2;
      } else { seamX = W / 2; }
    }
    function mote(kind) {
      var left = kind === "jade";
      var x0 = left ? 8 : seamX + 8, x1 = left ? seamX - 8 : W - 8;
      return {
        k: kind, x: x0 + Math.random() * Math.max(1, x1 - x0), y: Math.random() * H,
        vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .25,
        r: .6 + Math.random() * 1.6, a: .25 + Math.random() * .55, p: Math.random() * 6.28
      };
    }
    function targets() {
      var held = num(doc.getElementById("heldNum")), cross = num(doc.getElementById("crossNum"));
      var tot = held + cross, area = Math.min(1, (W * H) / (540 * 520));
      var n = Math.round(MAX * Math.max(.35, area));
      if (!tot) return { jade: Math.round(n * .6), ember: 0 };
      var e = cross ? Math.max(3, Math.round(n * cross / tot)) : 0;
      return { jade: Math.max(6, n - e), ember: e };
    }
    function sync() {
      var t = targets(), j = 0, e = 0, i;
      for (i = 0; i < motes.length; i++) motes[i].k === "jade" ? j++ : e++;
      while (j < t.jade) { motes.push(mote("jade")); j++; }
      while (e < t.ember) { motes.push(mote("ember")); e++; }
      for (i = motes.length - 1; i >= 0 && (j > t.jade || e > t.ember); i--) {
        if (motes[i].k === "jade" && j > t.jade) { motes.splice(i, 1); j--; }
        else if (motes[i].k === "ember" && e > t.ember) { motes.splice(i, 1); e--; }
      }
    }
    function draw(ts, still) {
      raf = 0;
      if (!still && (!visible || doc.hidden || !motionOK())) return;
      var dt = still ? 0 : Math.min(48, ts - (last || ts)); if (!still) last = ts;
      var down = inst.getAttribute("data-cloud") === "down";
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      for (var i = 0; i < motes.length; i++) {
        var m = motes[i], s = dt / 16;
        m.x += m.vx * s; m.y += m.vy * s; m.p += .02 * s;
        var lo = m.k === "jade" ? 4 : seamX + 6, hi = m.k === "jade" ? seamX - 6 : W - 4;
        if (m.x < lo) { m.x = lo; m.vx = Math.abs(m.vx); }
        if (m.x > hi) { m.x = hi; m.vx = -Math.abs(m.vx); }
        if (m.y < -4) m.y = H + 4; if (m.y > H + 4) m.y = -4;
        var a = m.a * (.6 + .4 * Math.sin(m.p));
        var col = m.k === "jade" ? "91,227,168" : (down ? "109,115,124" : "255,122,61");
        var g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 6);
        g.addColorStop(0, "rgba(" + col + "," + a + ")");
        g.addColorStop(1, "rgba(" + col + ",0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r * 6, 0, 6.2832); ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      if (!still) schedule();
    }
    /* With full motion the light drifts; otherwise it is drawn once, still. */
    function schedule() {
      if (raf) return;
      if (!motionOK()) { draw(0, true); return; }
      if (visible && !doc.hidden) raf = requestAnimationFrame(draw);
    }
    function refresh() { measure(); sync(); schedule(); }

    refresh();
    window.addEventListener("resize", function () { refresh(); }, { passive: true });
    doc.addEventListener("visibilitychange", function () { last = 0; if (!doc.hidden) schedule(); });
    if (reduceQ.addEventListener) reduceQ.addEventListener("change", function () { schedule(); });
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; last = 0; schedule(); }).observe(inst);
    }
    if (window.ResizeObserver) new ResizeObserver(function () { measure(); if (!motionOK()) schedule(); }).observe(inst);
    if (window.MutationObserver) {
      new MutationObserver(function () { sync(); schedule(); })
        .observe(inst, { subtree: true, attributes: true, attributeFilter: ["data-value", "data-cloud", "data-open"] });
      new MutationObserver(function () { schedule(); })
        .observe(body, { attributes: true, attributeFilter: ["data-motion"] });
    }
  });

  /* ---------- 2. pointer spotlight on panels ---------- */
  safe(function () {
    if (!window.matchMedia || !window.matchMedia("(hover: hover)").matches) return;
    var pending = null, ev = null;
    doc.addEventListener("pointermove", function (e) {
      ev = e;
      if (pending) return;
      pending = requestAnimationFrame(function () {
        pending = null;
        var t = ev.target && ev.target.closest ? ev.target.closest(".panel") : null;
        if (!t) return;
        var r = t.getBoundingClientRect();
        t.style.setProperty("--mx", (ev.clientX - r.left) + "px");
        t.style.setProperty("--my", (ev.clientY - r.top) + "px");
      });
    }, { passive: true });
  });

  /* ---------- 3. sliding step indicator ---------- */
  safe(function () {
    var ol = doc.querySelector(".stepper ol");
    if (!ol) return;
    var ind = doc.createElement("span");
    ind.className = "ind"; ind.setAttribute("aria-hidden", "true");
    ol.insertBefore(ind, ol.firstChild);
    body.setAttribute("data-seam", "on");
    function place() {
      var cur = ol.querySelector('button[aria-current="step"]');
      if (!cur) { ind.style.width = "0px"; return; }
      var o = ol.getBoundingClientRect(), b = cur.getBoundingClientRect();
      ind.style.width = b.width + "px";
      ind.style.transform = "translateX(" + (b.left - o.left + ol.scrollLeft) + "px)";
    }
    place();
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(place);
    window.addEventListener("resize", place, { passive: true });
    if (window.MutationObserver) new MutationObserver(place).observe(ol, { subtree: true, attributes: true, attributeFilter: ["aria-current"] });
  });
  /* ---------- 4. headline accent: the second half in serif italic ---------- */
  safe(function () {
    var hs = doc.querySelectorAll(".step-head h2");
    function split(h) {
      if (h.querySelector("em.ser")) return;
      var t = h.textContent, i = -1, m;
      m = /^(.+?[.,])\s+(.+)$/.exec(t);            /* "What stays. What leaves." */
      if (m) i = m[1].length + 1;
      else { var w = t.split(" "); if (w.length > 3) i = t.length - w.slice(-2).join(" ").length; }
      if (i <= 0 || i >= t.length) return;
      var a = t.slice(0, i), b = t.slice(i);
      while (h.firstChild) h.removeChild(h.firstChild);
      h.appendChild(doc.createTextNode(a));
      var em = doc.createElement("em"); em.className = "ser"; em.textContent = b; h.appendChild(em);
    }
    Array.prototype.forEach.call(hs, function (h) {
      split(h);
      if (window.MutationObserver) new MutationObserver(function () { split(h); }).observe(h, { childList: true, characterData: true, subtree: true });
    });
  });

  /* ---------- 5. HUD corner marks on the border ---------- */
  safe(function () {
    var inst = doc.getElementById("instrument");
    if (!inst || inst.querySelector(".hud")) return;
    var s = doc.createElement("span"); s.className = "hud"; s.setAttribute("aria-hidden", "true");
    inst.appendChild(s);
  });
})();
