/* ==================================================================
   Living Glass - motion (Nov 2026). Design and direction: Anshul Reddy.
   Plain JavaScript, no libraries. Everything here is decoration on top
   of the working app: if this file is removed, nothing else changes.

   What moves, and why it should feel physical rather than generated:
   - living light: a slow, domain-warped noise field (WebGL) rendered at
     low resolution and blended as light into the sky;
   - depth: the artwork drifts a few pixels toward the pointer with a
     damped spring, like a camera on a slider;
   - springs: panels rise in and the nav light glides with real spring
     physics (stiffness/damping), sampled into CSS linear() easing;
   - HUD: one ring of real values (Nano, cloud, App Check, receipts) that
     changes state with the real work: idle, working on this device
     (lavender), asking the cloud (blue), done (mint) or failed (red);
   It all stops when the tab is hidden, while Gemini Nano is working,
   and for "reduce motion".
   ================================================================== */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (id) { return document.getElementById(id); };

  /* ---------------- pause / resume ---------------- */
  var busy = 0;
  function paused() { return document.hidden || busy > 0 || reduce; }
  function syncPaused() { document.body.classList.toggle("motion-paused", paused()); }
  window.addEventListener("aion:busy", function (e) { busy = Math.max(0, (e.detail && e.detail.count) || 0); syncPaused(); });
  document.addEventListener("visibilitychange", syncPaused);

  /* ---------------- spring easing ---------------- */
  /* Simulates a damped spring 0 -> 1 and returns a CSS linear() easing and
     the time it needs to settle. */
  function spring(stiffness, damping, mass) {
    var k = stiffness || 170, c = damping || 22, m = mass || 1, x = 0, v = 0, dt = 1 / 120, t = 0, pts = [];
    while (t < 3) {
      var a = (-k * (x - 1) - c * v) / m;
      v += a * dt; x += v * dt; t += dt;
      pts.push(x);
      if (t > .2 && Math.abs(x - 1) < .0008 && Math.abs(v) < .002) break;
    }
    var step = Math.max(1, Math.floor(pts.length / 48)), out = ["0"];
    for (var i = step; i < pts.length; i += step) out.push(pts[i].toFixed(4));
    out.push("1");
    return { easing: "linear(" + out.join(",") + ")", ms: Math.round(t * 1000) };
  }
  var SOFT = spring(150, 20), GLIDE = spring(210, 26);
  var supportsLinear = (function () { try { return CSS.supports("transition-timing-function", "linear(0, 1)"); } catch (e) { return false; } })();
  if (supportsLinear) document.documentElement.style.setProperty("--spring", SOFT.easing);

  /* ---------------- depth: pointer drift with a damped follow ---------------- */
  var target = { x: 0, y: 0 }, cur = { x: 0, y: 0 }, vel = { x: 0, y: 0 };
  window.addEventListener("pointermove", function (e) {
    target.x = (e.clientX / window.innerWidth) * 2 - 1;
    target.y = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  /* light follows the pointer inside each glass panel */
  document.addEventListener("pointermove", function (e) {
    var card = e.target && e.target.closest ? e.target.closest(".card") : null;
    if (!card) return;
    var r = card.getBoundingClientRect();
    card.style.setProperty("--mx", (e.clientX - r.left) + "px");
    card.style.setProperty("--my", (e.clientY - r.top) + "px");
  }, { passive: true });

  /* ---------------- living light (WebGL) ---------------- */
  var gl = null, prog = null, uT = null, uR = null, canvas = null, scale = 0.33;
  function initLight() {
    if (reduce) return;
    if (typeof navigator.deviceMemory === "number" && navigator.deviceMemory < 4) return;
    canvas = document.createElement("canvas");
    canvas.id = "livingLight";
    canvas.setAttribute("aria-hidden", "true");
    var stage = document.querySelector(".stage") || document.body;
    stage.insertBefore(canvas, stage.firstChild);
    gl = canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: "low-power" });
    if (!gl) { canvas.remove(); canvas = null; return; }
    var vs = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
    var fs = [
      "precision mediump float;uniform float t;uniform vec2 r;",
      "float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}",
      "float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);",
      " return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}",
      "float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}",
      "void main(){vec2 uv=gl_FragCoord.xy/r;vec2 p=vec2(uv.x*r.x/r.y,uv.y)*1.6;float s=t*.018;",
      " vec2 q=vec2(fbm(p+vec2(0.,s)),fbm(p+vec2(5.2,1.3)-s));",
      " vec2 w=vec2(fbm(p+3.*q+vec2(1.7,9.2)+s*.7),fbm(p+3.*q+vec2(8.3,2.8)-s*.5));",
      " float f=fbm(p+2.6*w);",
      /* curtains: brighter in thin bands, like aurora through fog */
      " float band=smoothstep(.40,.92,f)*(.55+.45*sin(p.x*2.2+w.y*4.+s*6.));",
      /* only in the sky: fades out toward the horizon so the artwork below stays as it is */
      " float sky=smoothstep(.30,.95,uv.y)*(.65+.35*smoothstep(.0,.6,abs(uv.x-.55)));",
      " vec3 teal=vec3(.10,.82,.91),amber=vec3(.91,.71,.23);",
      " vec3 c=mix(teal,amber,smoothstep(.35,.85,w.x))*band*sky;",
      " gl_FragColor=vec4(c*.78,1.);}"
    ].join("\n");
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; }
    var v = sh(gl.VERTEX_SHADER, vs), f = sh(gl.FRAGMENT_SHADER, fs);
    if (!v || !f) { canvas.remove(); canvas = null; gl = null; return; }
    prog = gl.createProgram(); gl.attachShader(prog, v); gl.attachShader(prog, f); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); canvas = null; gl = null; return; }
    gl.useProgram(prog);
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    uT = gl.getUniformLocation(prog, "t"); uR = gl.getUniformLocation(prog, "r");
    resize(); window.addEventListener("resize", resize);
    setTimeout(function () { if (canvas) canvas.classList.add("is-on"); }, 400);
  }
  function resize() {
    if (!canvas || !gl) return;
    var w = Math.max(64, Math.round(window.innerWidth * scale)), h = Math.max(64, Math.round(window.innerHeight * scale));
    canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h);
  }

  /* ---------------- one loop for everything ---------------- */
  var last = 0, lightT = Math.random() * 400, frameGap = 1000 / 30;
  function loop(now) {
    requestAnimationFrame(loop);
    if (paused()) { last = now; return; }
    var dt = Math.min(64, now - (last || now)); last = now;
    /* damped spring follow for depth (critically damped, k=40) */
    ["x", "y"].forEach(function (k) {
      var a = 40 * (target[k] - cur[k]) - 2 * Math.sqrt(40) * vel[k];
      vel[k] += a * dt / 1000; cur[k] += vel[k] * dt / 1000;
    });
    var root = document.documentElement.style;
    root.setProperty("--px", cur.x.toFixed(4));
    root.setProperty("--py", cur.y.toFixed(4));
    if (gl && now - (loop.lastDraw || 0) >= frameGap) {
      loop.lastDraw = now;
      lightT += dt / 1000 * 30 / 30;
      gl.uniform1f(uT, lightT); gl.uniform2f(uR, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  /* ---------------- panels rise in when a view opens ---------------- */
  function enter(view) {
    if (reduce || !view || !view.animate) return;
    var cards = view.querySelectorAll(".card, .tour");
    cards.forEach(function (c, i) {
      if (c.offsetParent === null) return;
      c.animate([{ opacity: 0, transform: "translateY(18px) scale(.985)" }, { opacity: 1, transform: "none" }],
        { duration: Math.min(1200, SOFT.ms), delay: 40 + i * 45, easing: supportsLinear ? SOFT.easing : "cubic-bezier(.2,.9,.25,1)", fill: "backwards" });
    });
  }
  function activeView() { return document.querySelector(".view.is-active"); }

  /* ---------------- nav light ---------------- */
  var glow = null;
  function placeGlow(animate) {
    var nav = document.querySelector(".nav"), a = nav && nav.querySelector("a[aria-current]");
    if (!nav || !a) return;
    if (!glow) { glow = document.createElement("div"); glow.className = "nav-glow"; glow.setAttribute("aria-hidden", "true"); nav.insertBefore(glow, nav.firstChild); document.body.classList.add("has-nav-glow"); }
    var y = a.offsetTop, h = a.offsetHeight;
    if (!animate) glow.style.transition = "none";
    glow.style.setProperty("--glow-y", y + "px");
    glow.style.height = h + "px";
    glow.style.top = "0px";
    if (supportsLinear) glow.style.transitionTimingFunction = GLIDE.easing;
    if (!animate) { void glow.offsetHeight; glow.style.transition = ""; }
  }

  /* ---------------- HUD: core ring + receipt ticker ---------------- */
  var R = 15, C = 2 * Math.PI * R;
  function arc(cls, startFrac, lenFrac) {
    return '<circle class="arc ' + cls + '" cx="19" cy="19" r="' + R + '" stroke-dasharray="' + (C * lenFrac).toFixed(2) + ' ' + C.toFixed(2) +
      '" stroke-dashoffset="' + (C * lenFrac).toFixed(2) + '" transform="rotate(' + (startFrac * 360 - 90) + ' 19 19)"/>';
  }
  function buildCore() {
    var bar = $("hybridBar");
    var top = document.querySelector(".topright");
    if (!bar || $("coreRing")) return;
    var core = document.createElement("div");
    core.className = "core"; core.id = "coreRing";
    core.setAttribute("role", "status");
    core.innerHTML = '<svg viewBox="0 0 38 38" aria-hidden="true"><circle class="ticks" cx="19" cy="19" r="18.6"/><circle class="wave" cx="19" cy="19" r="15"/><circle class="trk" cx="19" cy="19" r="' + R + '"/>' +
      arc("nano", 0.01, 0.31) + arc("cloud", 0.345, 0.31) + arc("ac", 0.68, 0.31) +
      '<circle class="heart" cx="19" cy="19" r="9" fill="rgba(25,208,232,.10)"/><text class="num" x="19" y="19.5" id="coreNum">0</text></svg>' +
      '<div class="legend"><span id="coreLine1">AI requests</span><span id="coreLine2"></span></div>';
    if (top) top.insertBefore(core, top.firstChild); else bar.insertBefore(core, bar.firstChild);
    var t = document.createElement("div");
    t.className = "ticker"; t.id = "receiptTicker"; t.setAttribute("aria-live", "polite");
    t.innerHTML = "<span>No AI request yet in this visit</span>";
    bar.appendChild(t);
  }
  function setArc(cls, frac, state) {
    var el = document.querySelector("#coreRing .arc." + cls);
    if (!el) return;
    var len = parseFloat(el.getAttribute("stroke-dasharray"));
    el.setAttribute("stroke-dashoffset", (len * (1 - Math.max(0, Math.min(1, frac)))).toFixed(2));
    el.classList.toggle("is-bad", state === "bad");
    el.classList.toggle("is-off", state === "off");
  }
  var shownCount = 0;
  function countTo(n) {
    var el = $("coreNum");
    if (!el || n === shownCount) return;
    var from = shownCount, t0 = performance.now();
    shownCount = n;
    (function step(now) {
      var p = Math.min(1, (now - t0) / 700), e = 1 - Math.pow(1 - p, 3);
      el.textContent = String(Math.round(from + (n - from) * e));
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }
  var LABEL = { "on-device-nano": "on-device Nano", "cloud-sealed-chat": "cloud chat (sealed)", "cloud-blindfold": "cloud planner",
    "local-fallback": "fallback on device", "local-deterministic": "offline plan" };
  function updateCore() {
    var S = window.AionHybridState, H = window.AionHybrid;
    if (!S || !$("coreRing")) return;
    var nano = S.nano === "ready" ? (S.nanoWarm ? 1 : .7) : S.nano === "downloading" ? .35 : 0;
    setArc("nano", nano || 1, S.nano === "ready" || S.nano === "downloading" ? "" : "off");
    var rs = H && H.telemetry ? H.telemetry.getReceipts() : [];
    var lastCloud = rs.filter(function (r) { return /^cloud-/.test(r.route); }).slice(-1)[0];
    setArc("cloud", 1, !lastCloud ? "off" : lastCloud.status === "completed" ? "" : "bad");
    setArc("ac", 1, S.appCheckWarm === "ready" ? "" : S.appCheckWarm === "failed" ? "bad" : "off");
    countTo(rs.length);
    var cloudN = rs.filter(function (r) { return r.egressAudit && r.egressAudit.disclosureTier === "approved_cloud"; }).length;
    $("coreLine1").innerHTML = "<b>" + rs.length + "</b> AI request" + (rs.length === 1 ? "" : "s");
    $("coreLine2").dataset.counts = cloudN + " cloud · " + (rs.length - cloudN) + " on device";
    setState();
    var core = $("coreRing");
    core.title = "Nano: " + S.nano + (S.nanoWarm ? " (warm)" : "") + " · App Check: " + (S.appCheckWarm || "-") +
      " · last cloud call: " + (lastCloud ? lastCloud.status : "none yet");
  }
  /* ---------------- ring states: idle / on device / cloud / done ----------------
     Driven only by real events from hybrid.js (aion:activity, aion:receipt). */
  var act = { local: 0, cloud: 0 }, doneTimer = 0, lastDone = null;
  function setState() {
    var core = $("coreRing");
    if (!core) return;
    var st = act.local > 0 ? "local" : act.cloud > 0 ? "cloud" : lastDone ? lastDone.st : "idle";
    ["idle", "local", "cloud", "done", "failed"].forEach(function (k) { core.classList.toggle("st-" + k, k === st); });
    var l2 = $("coreLine2");
    if (!l2) return;
    if (st === "local") l2.textContent = "working on this device…";
    else if (st === "cloud") l2.textContent = "asking the cloud…";
    else if (st === "done" || st === "failed") l2.textContent = lastDone.text;
    else l2.textContent = l2.dataset.counts || "";
  }
  window.addEventListener("aion:activity", function (e) {
    var d = e.detail || {};
    act.local = Math.max(0, d.local || 0); act.cloud = Math.max(0, d.cloud || 0);
    if (act.local || act.cloud) { clearTimeout(doneTimer); lastDone = null; }
    setState();
  });
  function markDone(r) {
    if (!r) return;
    var ok = r.status === "completed";
    lastDone = { st: ok ? "done" : "failed", text: (ok ? "done" : String(r.status).replace(/_/g, " ")) + (r.latencyMs != null ? " · " + (r.latencyMs / 1000).toFixed(1) + " s" : "") };
    clearTimeout(doneTimer);
    var core = $("coreRing");
    if (core) { core.classList.remove("st-done", "st-failed"); void core.getBoundingClientRect(); } /* replay the ping */
    doneTimer = setTimeout(function () { lastDone = null; setState(); }, 4200);
    setState();
  }

  function tick(r) {
    var t = $("receiptTicker");
    if (!t || !r) return;
    var sent = r.egressAudit && r.egressAudit.disclosureTier === "approved_cloud" ? (r.egressAudit.bytesSent || 0).toLocaleString() + " chars sent" : "nothing sent";
    var line = document.createElement("span");
    line.className = "in";
    line.innerHTML = "<b>" + (LABEL[r.route] || r.route) + "</b> · " + (r.latencyMs != null ? (r.latencyMs / 1000).toFixed(1) + " s" : "time n/a") +
      " · " + sent + " · " + String(r.status).replace(/_/g, " ");
    var old = t.querySelector("span:not(.out)");
    t.appendChild(line);
    requestAnimationFrame(function () {
      line.classList.remove("in");
      if (old) { old.classList.add("out"); setTimeout(function () { old.remove(); }, 800); }
    });
  }

  /* ---------------- start ---------------- */
  function start() {
    var grain = document.createElement("div");
    grain.className = "grain"; grain.setAttribute("aria-hidden", "true");
    document.body.appendChild(grain);
    initLight();
    buildCore();
    placeGlow(false);
    requestAnimationFrame(loop);
    syncPaused();
    /* views: animate on switch, glide the nav light */
    var mo = new MutationObserver(function () { placeGlow(true); enter(activeView()); });
    mo.observe(document.body, { attributes: true, attributeFilter: ["data-view"] });
    window.addEventListener("resize", function () { placeGlow(false); });
    /* the page reveals after boot: animate the first view then */
    var boot = new MutationObserver(function () {
      if (!document.body.classList.contains("booting")) { boot.disconnect(); enter(activeView()); placeGlow(false); }
    });
    boot.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("aion:receipt", function (e) { tick(e.detail); markDone(e.detail); updateCore(); });
    setInterval(updateCore, 1500);
    updateCore();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  window.AionMotion = { spring: spring, paused: paused, get busy() { return busy; }, get ringState() { var c = $("coreRing"); return c ? (c.className.match(/st-(\w+)/) || [])[1] : null; } };
})();
