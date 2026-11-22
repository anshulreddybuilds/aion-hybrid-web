const POLL_MS = 5000;

/* T-036 - surviving a network switch.
   A phone that moves from WiFi to mobile data does not tell the page.
   What it does is leave one fetch hanging on a socket that will never
   answer, and `fetch` has no default timeout, so without the abort below
   a single switch parks a poll forever while the 5s interval stacks more
   behind it. Eight seconds is longer than any of these endpoints has ever
   taken and short enough that a switch costs less than two polls. */
const FETCH_TIMEOUT_MS = 8000;

/* Three missed polls. The number matters less than the behaviour it
   turns on: after this, the page STOPS presenting what it is showing as
   current. A dashboard that keeps displaying five-minute-old numbers in
   the same styling as live ones is not a degraded dashboard, it is a
   wrong one, and this project's whole discipline is that a reading says
   how good it is. */
const STALE_AFTER_MS = 15000;

let lastSuccessAt = 0;
let refreshInFlight = false;
/* Set when the server says 401 and cleared once a token is saved, so the
   dashboard stops re-asking every 5 seconds while it sits on the lock screen. */
let authBlocked = false;
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const UPTIME_WARMUP_SECONDS = 600;
const EVENTS_GAUGE_SCALE_MAX = 100000;

/* One accent (#19d0e8). The other three appear only where something is
   being judged - a failed provider, a destructive skill, work still to
   do - never as decoration. Matches style.css; changing one without the
   other is how a dashboard ends up with two greens. */
const CHART_COLORS = {
  cyan: "#19d0e8",
  gold: "#e8b53a",
  green: "#3ddc97",
  red: "#ff4d5e",
  grid: "rgba(255,255,255,0.05)",
  text: "#7f7f7f",
};

/* Chart.js comes from a CDN, and this file's own comments say the
   dashboard should never need one to paint. It did: these two lines ran
   at module scope, so if the CDN was unreachable - offline, Tailscale-only,
   blocked - `Chart` was undefined, the script threw on line 14, and
   NOTHING below ever ran. app.js never removed `booting`, so the page
   stayed a black rectangle with a blinking cursor. Found 9 Sep 2026 in a
   headless run with no network. Charts are decoration; the boot sequence,
   the health panels and Guardian are not. */
const HAVE_CHART = typeof Chart !== "undefined";
if (HAVE_CHART) {
  Chart.defaults.color = CHART_COLORS.text;
  Chart.defaults.font.family = "Geist, ui-sans-serif, system-ui, sans-serif";
}

let missionChart, providerChart, memoryTypeChart;
let bootDone = false;
let firstRefresh = true;

/* T-212 Phase 3: the Neuron Graph panel can show either the whole graph
   ("all") or just the memory-notes subgraph ("notes"). Both snapshots are
   fetched each poll and cached here so toggling re-renders instantly without
   waiting for the next tick. */
let graphMode = "all";
let lastGraphAll = null;
let lastGraphMemory = null;

const knownEventIds = new Set();

function $(id) { return document.getElementById(id); }

function fmtUptime(seconds) {
  seconds = Math.floor(seconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

function fmtTime(iso) {
  try { return new Date(iso).toLocaleTimeString(); } catch (e) { return iso; }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

/* This dashboard has no token entry and never will (see the PHONE
   HANDOFF comment in index.html) - the one real token implementation
   lives in /mobile. If AION_API_TOKEN is configured, this desktop page
   cannot authenticate its own /api calls, so a 401 here means "point
   at /mobile", not "prompt for a token". Reuses the same handoff card
   index.html already shows narrow/touch devices. */
function notifyAuthRequired() {
  try {
    if (typeof window.__aionShowPhoneHandoff === "function") {
      window.__aionShowPhoneHandoff();
    }
  } catch (e) { /* never let the handoff break the page */ }
}

/* THE ONLY PLACE THE TOKEN IS ATTACHED (T-137).
   Same storage key as mobile.html, deliberately: entering it once on
   either surface works on both, and one key means one thing to clear.
   Header only - never a query string, never a cookie, never logged.
   A token in a URL ends up in browser history, in the referer of every
   outbound link, and in any server log that records paths. */
const AION_TOKEN_KEY = "aion_api_token";

function storedToken() {
  try { return localStorage.getItem(AION_TOKEN_KEY) || ""; } catch (e) { return ""; }
}

function storeToken(value) {
  if (value) authBlocked = false;
  try {
    if (value) localStorage.setItem(AION_TOKEN_KEY, value);
    else localStorage.removeItem(AION_TOKEN_KEY);
  } catch (e) { /* private mode - the page still works, per request */ }
}

window.__aionStoreToken = storeToken;

/* Settings > "FORGET". The Settings card must be able to clear the
   credential without knowing the key name or the header - otherwise
   index.html would hold a second copy of both, which is the drift the
   phone-handoff tests exist to prevent. */
window.__aionForgetToken = function () { storeToken(""); };

/* Every /api call goes through here for its headers - reads via getJSON,
   writes via apiPost. The first version of this attached the token in
   getJSON only, and chat and memory-approve, which call fetch directly,
   kept getting 401 while the rest of the page worked: the owner typed
   "hi" and the token card reappeared over a dashboard that had just
   unlocked. One helper, so "the only place the token is attached" is a
   fact rather than a comment. */
function authHeaders(extra) {
  const headers = Object.assign({}, extra || {});
  const token = storedToken();
  if (token) headers.Authorization = "Bearer " + token;
  return headers;
}

/* A 401 means the stored token is absent or refused. A refused token is
   worse than none - it re-prompts on every call while looking like it
   should work - so it is dropped here, once, for every caller. */
function handleUnauthorized() {
  storeToken("");
  authBlocked = true;
  notifyAuthRequired();
}

async function apiPost(path, payload) {
  const res = await fetch(path, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error(`${path} -> 401 (token required)`);
  }
  return res;
}

async function getJSON(path) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
  let res;
  try {
    res = await fetch(path, {
      cache: "no-store",
      headers: authHeaders(),
      signal: controller ? controller.signal : undefined,
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error(`${path} -> 401 (token required)`);
  }
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  const body = await res.json();
  if (!body.ok) throw new Error(`${path} responded not-ok`);
  return body.data;
}

function updateClock() {
  $("clock").textContent = new Date().toLocaleTimeString();
}

/* ------------------------------------------------------------------ */
/* Boot sequence                                                       */
/* ------------------------------------------------------------------ */

function runBootSequence() {
  const target = "AION SYSTEMS ONLINE";
  const el = $("bootTypeText");

  if (REDUCED_MOTION) {
    document.body.classList.remove("booting");
    bootDone = true;
    return;
  }

  let i = 0;
  const typer = setInterval(() => {
    el.textContent = target.slice(0, i + 1);
    i += 1;
    if (i >= target.length) clearInterval(typer);
  }, 55);

  setTimeout(() => {
    document.body.classList.remove("booting");
    bootDone = true;
  }, 2000);
}

/* ------------------------------------------------------------------ */
/* Corner brackets - decorative, added once per panel                  */
/* ------------------------------------------------------------------ */

function addCorners() {
  document.querySelectorAll(".card").forEach((card) => {
    if (card.dataset.cornered) return;
    card.dataset.cornered = "1";
    ["tl", "tr", "bl", "br"].forEach((pos) => {
      const span = document.createElement("span");
      span.className = `corner corner-${pos}`;
      card.appendChild(span);
    });
  });
}

/* ------------------------------------------------------------------ */
/* Count-up numeric animation                                          */
/* ------------------------------------------------------------------ */

const lastValues = new WeakMap();

function animateNumber(el, to, opts = {}) {
  const decimals = opts.decimals || 0;
  const suffix = opts.suffix || "";
  const from = lastValues.get(el) ?? to;
  lastValues.set(el, to);

  if (REDUCED_MOTION || from === to) {
    el.textContent = to.toFixed(decimals) + suffix;
    return;
  }

  const duration = 600;
  const start = performance.now();

  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const value = from + (to - from) * eased;
    el.textContent = value.toFixed(decimals) + suffix;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ------------------------------------------------------------------ */
/* Radial gauge component (pure SVG, built and updated in JS)          */
/* ------------------------------------------------------------------ */

const gaugeState = new Map();

function polar(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function buildGauge(container, caption) {
  const size = 108;
  const cx = size / 2;
  const cy = size / 2;
  const r = 42;
  const circumference = 2 * Math.PI * r;

  let ticks = "";
  for (let i = 0; i < 24; i++) {
    const angle = i * 15;
    const p1 = polar(cx, cy, r + 8, angle);
    const p2 = polar(cx, cy, r + 4, angle);
    ticks += `<line class="gauge-tick" x1="${p1.x.toFixed(2)}" y1="${p1.y.toFixed(2)}" x2="${p2.x.toFixed(2)}" y2="${p2.y.toFixed(2)}" />`;
  }

  container.classList.add("gauge");
  container.innerHTML = `
    <svg viewBox="0 0 ${size} ${size}">
      ${ticks}
      <circle class="gauge-track" cx="${cx}" cy="${cy}" r="${r}" />
      <circle class="gauge-arc" cx="${cx}" cy="${cy}" r="${r}"
        stroke-dasharray="${circumference.toFixed(2)}"
        stroke-dashoffset="${circumference.toFixed(2)}"
        transform="rotate(-90 ${cx} ${cy})" />
    </svg>
    <div class="gauge-value">
      <div class="gauge-num">-</div>
      <div class="gauge-label"></div>
    </div>
  `;

  const wrap = document.createElement("div");
  wrap.className = "gauge-caption";
  wrap.textContent = caption;
  container.parentElement && container.insertAdjacentElement("afterend", wrap);

  gaugeState.set(container, { circumference });
}

function updateGauge(container, value, max, opts = {}) {
  if (!gaugeState.has(container)) {
    buildGauge(container, container.dataset.label || "");
  }
  const state = gaugeState.get(container);
  const pct = Math.max(0, Math.min(value / max, 1));
  const arc = container.querySelector(".gauge-arc");
  const offset = state.circumference * (1 - pct);
  arc.style.strokeDashoffset = offset.toFixed(2);

  const num = container.querySelector(".gauge-num");
  const label = container.querySelector(".gauge-label");
  animateNumber(num, opts.rawValue ?? value, { decimals: opts.decimals || 0, suffix: opts.suffix || "" });
  label.textContent = opts.unit || "";
}

/* ------------------------------------------------------------------ */
/* Radar core centerpiece (Executive Overview)                         */
/* ------------------------------------------------------------------ */

const NODE_COLOR = { online: "#3ddc97", degraded: "#e8b53a", unavailable: "#ff4d5e" };

function renderRadarCore(architecture, safeModeOn, providers, guardianOverall) {
  const svg = $("radarCoreSvg");
  const ticksGroup = $("radarTicks");
  const nodesGroup = $("rcNodes");

  if (!ticksGroup.dataset.built) {
    let ticks = "";
    for (let i = 0; i < 60; i++) {
      const angle = i * 6;
      const major = i % 5 === 0;
      const outer = polar(150, 150, 148, angle);
      const inner = polar(150, 150, major ? 138 : 143, angle);
      ticks += `<line class="rc-tick" x1="${outer.x.toFixed(1)}" y1="${outer.y.toFixed(1)}" x2="${inner.x.toFixed(1)}" y2="${inner.y.toFixed(1)}" ${major ? 'stroke-width="1.5"' : ""} />`;
    }
    ticksGroup.innerHTML = ticks;
    ticksGroup.dataset.built = "1";
  }

  const providerRow = (providers || []).find((p) => p.provider);
  const providerHealth = (() => {
    if (!providers || providers.length === 0) return "online";
    const anyFailed = providers.some((p) => p.failed_calls > 0);
    const allFailed = providers.every((p) => p.calls > 0 && p.ok_calls === 0);
    if (allFailed) return "unavailable";
    if (anyFailed) return "degraded";
    return "online";
  })();

  // Node orbit radius must stay inside the 300x300 viewBox (max safe
  // distance from the center at 150,150 is 150) with room left over for
  // the label text above/below each dot - otherwise nodes near the top
  // or bottom (e.g. the first architecture entry, which sits at angle 0,
  // straight up) get clipped and effectively disappear.
  const n = architecture.length || 1;
  let nodes = "";
  architecture.forEach((entry, i) => {
    const angle = (360 / n) * i;
    const pos = polar(150, 150, 137, angle);
    let health = entry.status === "online" ? "online" : "unavailable";
    if (entry.name === "Provider Router") health = providerHealth;
    const color = NODE_COLOR[health];
    /* The label is centred on the dot, so a node at due east or due west
       hangs half its text outside the 300-wide viewBox and the SVG clips
       it: "Planner" rendered as "lanner". The dots stay where the maths
       puts them; only the text is pulled back inside. */
    const labelX = Math.min(276, Math.max(24, pos.x));
    nodes += `
      <circle class="rc-node" cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="4.5" fill="${color}" />
      <text class="rc-node-label" x="${labelX.toFixed(1)}" y="${(pos.y + (pos.y > 150 ? 10 : -9)).toFixed(1)}" text-anchor="middle">${escapeHtml(entry.name.split(" ")[0])}</text>
    `;
  });
  nodesGroup.innerHTML = nodes;

  // Guardian's verdict counts here. Without it this core printed
  // OPERATIONAL / all clear while Guardian's overall state was ALERT -
  // the single largest indicator on the page contradicting the one
  // subsystem whose entire job is noticing trouble.
  const guardian = String(guardianOverall || "").toUpperCase();
  const anyCritical =
    architecture.some((e) => e.status !== "online") ||
    providerHealth === "unavailable" ||
    guardian === "CRITICAL";
  const anyDegraded = providerHealth === "degraded" || guardian === "ALERT" || guardian === "WARN";

  const alertOn = safeModeOn || anyCritical;
  document.body.classList.toggle("alert", alertOn);

  const rcState = $("rcState");
  const rcSub = $("rcSub");
  if (safeModeOn) {
    rcState.textContent = "SAFE MODE";
    rcSub.textContent = "destructive actions blocked";
  } else if (anyCritical) {
    rcState.textContent = "CRITICAL";
    rcSub.textContent = guardian === "CRITICAL" ? "Guardian reports CRITICAL" : "engine unreachable";
  } else if (anyDegraded) {
    rcState.textContent = "DEGRADED";
    rcSub.textContent =
      guardian === "ALERT" || guardian === "WARN"
        ? `Guardian reports ${guardian}`
        : "provider errors detected";
  } else {
    rcState.textContent = "OPERATIONAL";
    // Says what was actually checked. "All systems nominal" was a
    // claim about systems this function has never read.
    rcSub.textContent = "engines online, providers healthy, Guardian clear";
  }
}

/* ------------------------------------------------------------------ */
/* The Climb - live roadmap progress panel                             */
/* Data: GET /api/progress (aion/interfaces/web/progress.py) - a       */
/* mechanical parse of docs/task-register.md, docs/v0.4-gate-walk.md   */
/* and docs/roadmap.md. Every live number below comes straight from    */
/* that endpoint. Only the v0.1-v0.4 entries are hardcoded here,       */
/* because those are tagged, frozen, shipped releases (v0.1.0 through  */
/* v0.4.0 in git tags) - not estimates. v0.6+ carries no percentage    */
/* because nothing has been counted for it yet.                        */
/* ------------------------------------------------------------------ */

const CLIMB_MILESTONES = [
  { id: "v0.1", sub: "Foundation", state: "frozen" },
  { id: "v0.2", sub: "Core systems", state: "frozen" },
  { id: "v0.3", sub: "Capability", state: "frozen" },
  { id: "v0.4", sub: "Gate walk", state: "shipped" },
  { id: "v0.5", sub: "In progress", state: "current" },
  { id: "v0.6+", sub: "Planned", state: "planned" },
];

function climbNodePoints(n) {
  const points = [];
  for (let i = 0; i < n; i++) {
    const x = 40 + (i / (n - 1)) * 920;
    const y = 195 - (i / (n - 1)) * 170;
    points.push({ x, y });
  }
  return points;
}

function renderGateChips(container, gates) {
  container.innerHTML = "";
  gates.forEach((g) => {
    const chip = document.createElement("span");
    chip.className = "gate-chip bucket-" + g.bucket;
    chip.textContent = g.id;
    chip.title = `${g.name}: ${g.verdict}`;
    container.appendChild(chip);
  });
}

function renderClimb(progress) {
  const overall = progress.overall || { pct_done: 0, total: 0 };
  animateNumber($("climbOverallPct"), overall.pct_done, { decimals: 1, suffix: "%" });

  const points = climbNodePoints(CLIMB_MILESTONES.length);
  $("climbPathLine").setAttribute(
    "d",
    "M " + points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ")
  );

  const nodesEl = $("climbNodes");
  nodesEl.innerHTML = "";
  CLIMB_MILESTONES.forEach((m, i) => {
    const p = points[i];
    const isCurrent = m.state === "current";
    const pct = isCurrent ? overall.pct_done : (m.state === "planned" ? null : 100);

    const node = document.createElement("div");
    node.className = "climb-node state-" + m.state;
    node.style.left = ((p.x / 1000) * 100).toFixed(2) + "%";
    node.style.top = ((p.y / 220) * 100).toFixed(2) + "%";
    node.innerHTML = `
      <div class="climb-node-dot"></div>
      <div class="climb-node-label">${escapeHtml(m.id)}</div>
      <div class="climb-node-sub">${escapeHtml(m.sub)}</div>
      ${pct != null ? `<div class="climb-node-pct">${pct.toFixed(1)}%</div>` : ""}
    `;
    nodesEl.appendChild(node);
  });

  const weeksEl = $("climbWeeks");
  weeksEl.innerHTML = "";
  const weeks = progress.weeks || [];
  // "Current" week = the earliest week that isn't fully done yet - a
  // mechanical read of the same counts already rendered, not a parsed
  // calendar date (the register's week ranges aren't ISO dates).
  const unfinished = weeks.find((w) => w.counts.done < w.counts.total);
  const currentWeekNumber = unfinished ? unfinished.number : null;

  weeks.forEach((w) => {
    const isCurrent = w.number === currentWeekNumber;
    const wrap = document.createElement("div");
    wrap.className = "climb-week" + (isCurrent ? " is-current" : "");
    wrap.title = `Week ${w.number} (${w.dates}) - ${w.title}: ${w.counts.done}/${w.counts.total} done`;
    wrap.innerHTML = `
      <div class="climb-week-bar"><div class="climb-week-bar-fill" style="width:${w.counts.pct_done}%"></div></div>
      <div class="climb-week-label">W${w.number}</div>
    `;
    weeksEl.appendChild(wrap);
  });

  renderGateChips($("gateChipsV4"), progress.gates_v0_4 || []);
  renderGateChips($("gateChipsV5"), progress.gates_v0_5 || []);
}

/* ------------------------------------------------------------------ */
/* Climb panel decoration: a small zero-dependency wireframe rotator.  */
/* Canvas 2D only - no WebGL/Three.js/CDN dependency, so it still      */
/* renders with nothing fetched over the network (AION is designed for */
/* Tailscale-only access; this dashboard should never need a CDN to    */
/* paint). Purely decorative - it carries no data of its own.          */
/* ------------------------------------------------------------------ */

function initClimb3d() {
  const canvas = $("climb3d");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");

  const verts = [
    [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
    [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
  ];
  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];

  let angleX = 0.4;
  let angleY = 0;
  let raf = null;
  let size = 220;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    size = canvas.clientWidth || 220;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function project([x, y, z]) {
    const cy = Math.cos(angleY), sy = Math.sin(angleY);
    const cx = Math.cos(angleX), sx = Math.sin(angleX);
    const x1 = x * cy - z * sy;
    const z1 = x * sy + z * cy;
    const y1 = y * cx - z1 * sx;
    const z2 = y * sx + z1 * cx;
    const scale = 300 / (300 + z2 * 60);
    return {
      x: size / 2 + x1 * 60 * scale,
      y: size / 2 + y1 * 60 * scale,
      depth: z2,
    };
  }

  function draw() {
    ctx.clearRect(0, 0, size, size);
    const projected = verts.map(project);
    ctx.lineWidth = 1;
    edges.forEach(([a, b]) => {
      const pa = projected[a], pb = projected[b];
      const t = ((pa.depth + pb.depth) / 2 + 1.7) / 3.4;
      const r = Math.round(t * 176);
      const g = Math.round(240 - t * 109);
      ctx.strokeStyle = `rgba(${r}, ${g}, 255, 0.75)`;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    });
    projected.forEach((p) => {
      ctx.fillStyle = "rgba(200, 220, 255, 0.9)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function tick() {
    angleY += 0.006;
    angleX = 0.4 + Math.sin(angleY * 0.5) * 0.15;
    draw();
    raf = requestAnimationFrame(tick);
  }

  window.addEventListener("resize", resize);
  resize();

  if (REDUCED_MOTION) {
    draw();
    return;
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
    } else if (!raf) {
      tick();
    }
  });

  tick();
}

/* ------------------------------------------------------------------ */
/* Panel renderers                                                     */
/* ------------------------------------------------------------------ */

function renderOverview(status) {
  $("statVersion").textContent = status.version;

  $("statSafeMode").textContent = status.safe_mode ? "ON" : "OFF";
  $("statSafeMode").className = "stat-value " + (status.safe_mode ? "red" : "green");

  const pill = $("safeModePill");
  pill.className = "pill " + (status.safe_mode ? "safe-on" : "safe-off");
  pill.innerHTML = `<span class="dot"></span>SAFE MODE ${status.safe_mode ? "ON" : "OFF"}`;

  // Ring fills over the first UPTIME_WARMUP_SECONDS of this run, then
  // stays full - "% of the current hour" looked broken (near-empty for
  // most of every hour, then snapping back to empty on the hour).
  updateGauge($("gaugeUptime"), Math.min(status.uptime_seconds, UPTIME_WARMUP_SECONDS), UPTIME_WARMUP_SECONDS, {
    rawValue: status.uptime_seconds,
    decimals: 0,
    unit: "UPTIME (s)",
  });

  // Log-scaled so the ring keeps moving smoothly across a huge range of
  // event counts instead of pinning at 100% forever past a fixed cap
  // (2000 events is well within a single day of normal use).
  updateGauge(
    $("gaugeEvents"),
    Math.log10(status.event_count + 1),
    Math.log10(EVENTS_GAUGE_SCALE_MAX),
    { rawValue: status.event_count, decimals: 0, unit: "LOGGED" }
  );
}

function renderMissions(missions) {
  const list = $("missionList");
  if (!missions.length) {
    list.innerHTML = '<div class="empty">No missions yet.</div>';
  } else {
    list.innerHTML = missions
      .map((m) => {
        const pct = m.task_count ? Math.round((m.done_count / m.task_count) * 100) : 0;
        return `
          <div class="row-item" style="flex-direction:column;align-items:stretch;">
            <div style="display:flex;justify-content:space-between;">
              <span class="row-title">${escapeHtml(m.title)}</span>
              <span class="badge safe">${escapeHtml(m.status)}</span>
            </div>
            <div class="row-sub">${m.done_count}/${m.task_count} tasks${Number(m.doing_count || 0) > 0 ? ` - ${m.doing_count} doing` : ""} - priority ${m.priority}</div>
            <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
          </div>`;
      })
      .join("");
  }

  const labels = missions.map((m) => m.title);
  const done = missions.map((m) => m.done_count);
  const remaining = missions.map((m) => Math.max(m.task_count - m.done_count, 0));

  if (!HAVE_CHART) {
    /* no chart library - the lists above still carry the numbers */
  } else if (!missionChart) {
    missionChart = new Chart($("missionChart"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Done", data: done, backgroundColor: CHART_COLORS.cyan, stack: "s" },
          { label: "Remaining", data: remaining, backgroundColor: "rgba(232,181,58,0.35)", stack: "s" },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: CHART_COLORS.text } } },
        scales: {
          x: { stacked: true, grid: { color: CHART_COLORS.grid }, ticks: { color: CHART_COLORS.text } },
          y: { stacked: true, grid: { color: CHART_COLORS.grid }, ticks: { color: CHART_COLORS.text, precision: 0 } },
        },
      },
    });
  } else {
    missionChart.data.labels = labels;
    missionChart.data.datasets[0].data = done;
    missionChart.data.datasets[1].data = remaining;
    missionChart.update();
  }
}

function renderArchitecture(entries) {
  $("architectureList").innerHTML = entries
    .map(
      (e) => `
      <div class="row-item">
        <div>
          <div class="row-title">${escapeHtml(e.name)}</div>
          <div class="row-sub">${escapeHtml(e.module)}</div>
        </div>
        <span class="badge ${e.status === "online" ? "online" : "unavailable"}">${e.status}</span>
      </div>`
    )
    .join("");
}

function renderProviderSelection(health) {
  // T-061 asks for "provider health + selected model". /api/providers/health
  // has served exactly that since T-033 and nothing fetched it - the
  // dashboard showed call counts and token totals but never WHICH provider
  // was chosen, which model it was running, or why. The reason line matters
  // most: it is the router explaining a decision, and a router whose choices
  // cannot be read is one nobody can correct.
  const el = $("providerSelection");
  if (!el) return;

  const status = String(health.status || "unknown").toLowerCase();
  const tone = status === "healthy" ? "is-good" : status === "degraded" ? "is-warn" : "is-bad";

  el.innerHTML =
    `<div class="row-item"><span class="row-title">Active</span>` +
    `<span class="health-value ${tone}">${escapeHtml(health.active_provider || "none")}</span></div>` +
    `<div class="row-item"><span class="row-title">Model</span>` +
    `<span class="health-value">${escapeHtml(health.selected_model || "none")}</span></div>` +
    (health.selection_reason
      ? `<div class="row-sub health-reason">${escapeHtml(health.selection_reason)}</div>`
      : "");
}

/* Capability Ladder (T-101 slice, second panel): every provider's
   current rung - REGISTERED -> CONFIGURED -> PROBED -> BENCHMARK_PENDING
   -> APPROVED -> ACTIVE -> DEGRADED -> BLOCKED -> RETIRED
   (aion/providers/registry.py's own ALLOWED_TRANSITIONS). No new
   endpoint: /api/providers/health has returned this per-provider dict
   since T-033 (router.py's get_health_status()), keyed under
   `providers` - renderProviderSelection only ever read the single
   active_provider/selected_model summary from the same payload, so
   this data has been arriving at the browser unused. */
const LADDER_TONE = {
  ACTIVE: "is-good",
  APPROVED: "is-good",
  DEGRADED: "is-warn",
  BENCHMARK_PENDING: "is-warn",
  BLOCKED: "is-bad",
  RETIRED: "is-bad",
};

function renderCapabilityLadder(health) {
  const el = $("capabilityLadderList");
  if (!el) return;

  const providers = (health && health.providers) || {};
  const names = Object.keys(providers).sort();

  if (!names.length) {
    el.innerHTML = '<div class="empty">No providers registered yet.</div>';
    return;
  }

  el.innerHTML = names
    .map((name) => {
      const p = providers[name];
      const status = String(p.status || "UNKNOWN").toUpperCase();
      const tone = LADDER_TONE[status] || "";
      const failures = p.consecutive_failures
        ? ` &middot; ${p.consecutive_failures} consecutive failure${p.consecutive_failures === 1 ? "" : "s"}`
        : "";
      const quota = p.quota_exhausted ? " &middot; quota exhausted" : "";
      return `
      <div class="row-item">
        <div>
          <div class="row-title">${escapeHtml(p.display_name || name)}</div>
          <div class="row-sub">${escapeHtml(p.model || "no model")}${failures}${quota}</div>
        </div>
        <span class="health-value ${tone}">${escapeHtml(status)}</span>
      </div>`;
    })
    .join("");
}

function renderProviders(providers) {
  $("providerList").innerHTML = providers.length
    ? providers
        .map(
          (p) => `
      <div class="row-item">
        <div>
          <div class="row-title">${escapeHtml(p.provider)}</div>
          <div class="row-sub">${p.tokens_in + p.tokens_out} tokens</div>
        </div>
        <span class="badge ${p.failed_calls > 0 ? "unavailable" : "online"}">${p.calls} calls</span>
      </div>`
        )
        .join("")
    : '<div class="empty">No provider calls yet.</div>';

  const gaugeRow = $("providerGauges");
  const existing = new Set();
  providers.forEach((p) => {
    existing.add(p.provider);
    /* buildGauge() inserts the caption as the gauge's NEXT SIBLING. With
       the slots appended straight into a flex row that put every caption
       BESIDE its dial instead of under it - three dials and three stray
       words in a line. Each gauge gets its own cell so the caption has
       somewhere to land. */
    let cell = gaugeRow.querySelector(`.gauge-cell[data-provider="${CSS.escape(p.provider)}"]`);
    if (!cell) {
      cell = document.createElement("div");
      cell.className = "gauge-cell";
      cell.dataset.provider = p.provider;
      const inner = document.createElement("div");
      inner.className = "gauge-slot";
      inner.dataset.label = p.provider.toUpperCase();
      cell.appendChild(inner);
      gaugeRow.appendChild(cell);
    }
    const slot = cell.querySelector(".gauge-slot");
    updateGauge(slot, Math.min(p.avg_latency_ms, 2000), 2000, {
      rawValue: p.avg_latency_ms,
      decimals: 0,
      unit: p.provider.toUpperCase(),
      suffix: "ms",
    });
  });
  gaugeRow.querySelectorAll(".gauge-cell[data-provider]").forEach((cell) => {
    if (!existing.has(cell.dataset.provider)) cell.remove();
  });

  const labels = providers.map((p) => p.provider);
  const calls = providers.map((p) => p.calls);

  if (!HAVE_CHART) {
    /* no chart library - the lists above still carry the numbers */
  } else if (!providerChart) {
    providerChart = new Chart($("providerChart"), {
      type: "bar",
      data: { labels, datasets: [{ label: "Calls", data: calls, backgroundColor: CHART_COLORS.gold }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: CHART_COLORS.grid }, ticks: { color: CHART_COLORS.text } },
          y: { grid: { color: CHART_COLORS.grid }, ticks: { color: CHART_COLORS.text, precision: 0 } },
        },
      },
    });
  } else {
    providerChart.data.labels = labels;
    providerChart.data.datasets[0].data = calls;
    providerChart.update();
  }
}

function renderKnowledge(memoryStats, graphStats) {
  animateNumber($("statMemTotal"), memoryStats.total);
  animateNumber($("statGraphObjects"), graphStats.total_objects);
  animateNumber($("statGraphRel"), graphStats.total_relationships);

  const byType = memoryStats.by_type || {};
  const labels = Object.keys(byType);
  const data = Object.values(byType);

  if (!HAVE_CHART) {
    /* no chart library - the lists above still carry the numbers */
  } else if (!memoryTypeChart) {
    memoryTypeChart = new Chart($("memoryTypeChart"), {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: [CHART_COLORS.cyan, CHART_COLORS.gold, CHART_COLORS.green, CHART_COLORS.red, "#8a7bff"],
            borderColor: "rgba(8,9,11,0.9)",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "right", labels: { color: CHART_COLORS.text, boxWidth: 10 } } },
      },
    });
  } else {
    memoryTypeChart.data.labels = labels;
    memoryTypeChart.data.datasets[0].data = data;
    memoryTypeChart.update();
  }
}

/* T-178 Phase 1: the read-only "graphical neuron-like memory" view over
   aion/graph/engine.py's own data (docs/design/t178-graph-memory-scope.md).
   No new dependency - this dashboard already treats its one chart library
   as optional (HAVE_CHART above), so a single panel does not get to
   require a second one; the layout below is a small, self-contained
   force simulation in plain JS. */
const GRAPH_TYPE_COLOR = {
  person: CHART_COLORS.cyan,
  project: CHART_COLORS.gold,
  company: CHART_COLORS.green,
  place: "#8a7bff",
  thing: CHART_COLORS.red,
  memory: "#ff8f3f", /* T-212 Phase 3: note nodes stand out in the memory view */
};

function _simulateGraphLayout(nodes, edges, width, height) {
  const n = nodes.length;
  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, n);
    const radius = Math.min(width, height) / 3;
    node.x = width / 2 + Math.cos(angle) * radius;
    node.y = height / 2 + Math.sin(angle) * radius;
    node.vx = 0;
    node.vy = 0;
  });

  const byId = {};
  nodes.forEach((node) => { byId[node.id] = node; });

  const REPULSION = 2200;
  const SPRING = 0.02;
  const SPRING_LENGTH = 110;
  const CENTER_PULL = 0.01;
  const ITERATIONS = 200;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy || 0.01;
        const dist = Math.sqrt(distSq);
        const force = REPULSION / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }
    }
    edges.forEach((edge) => {
      const a = byId[edge.from];
      const b = byId[edge.to];
      if (!a || !b) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const displacement = dist - SPRING_LENGTH;
      const fx = (dx / dist) * displacement * SPRING;
      const fy = (dy / dist) * displacement * SPRING;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    });
    nodes.forEach((node) => {
      node.vx += (width / 2 - node.x) * CENTER_PULL;
      node.vy += (height / 2 - node.y) * CENTER_PULL;
      node.x += node.vx * 0.05;
      node.y += node.vy * 0.05;
      node.vx *= 0.85;
      node.vy *= 0.85;
      node.x = Math.max(30, Math.min(width - 30, node.x));
      node.y = Math.max(30, Math.min(height - 30, node.y));
    });
  }
  return nodes;
}

function renderMemoryGraph(snapshot, opts) {
  const svg = $("memoryGraphSvg");
  const wrap = $("memoryGraphWrap");
  if (!svg) return;

  const emptyText = (opts && opts.emptyText) || "";
  if (emptyText) {
    const emptyEl = wrap && wrap.querySelector(".graph-empty");
    if (emptyEl) emptyEl.textContent = emptyText;
  }

  const objects = (snapshot && snapshot.objects) || [];
  const relationships = (snapshot && snapshot.relationships) || [];

  if (!objects.length) {
    svg.innerHTML = "";
    if (wrap) wrap.setAttribute("data-empty", "true");
    return;
  }
  if (wrap) wrap.removeAttribute("data-empty");

  const WIDTH = 600;
  const HEIGHT = 400;
  /* Prefer a content-preview label when the snapshot carries one (the
     memory-notes view labels each note by its text, not its memory:<id>
     name); fall back to the object name for the general graph. */
  const nodes = objects.map((o) => ({
    id: o.id, name: o.label || o.name, type: o.type,
  }));
  const edges = relationships.map((r) => ({
    from: r.from_object, to: r.to_object, relation: r.relation,
  }));

  _simulateGraphLayout(nodes, edges, WIDTH, HEIGHT);
  const byId = {};
  nodes.forEach((node) => { byId[node.id] = node; });

  const edgeSvg = edges
    .map((edge) => {
      const a = byId[edge.from];
      const b = byId[edge.to];
      if (!a || !b) return "";
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      return (
        `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" class="graph-edge" />` +
        `<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" class="graph-edge-label">${escapeHtml(edge.relation)}</text>`
      );
    })
    .join("");

  const nodeSvg = nodes
    .map((node) => {
      const color = GRAPH_TYPE_COLOR[node.type] || CHART_COLORS.text;
      return (
        `<g class="graph-node">` +
        `<circle cx="${node.x.toFixed(1)}" cy="${node.y.toFixed(1)}" r="10" fill="${color}" />` +
        `<text x="${node.x.toFixed(1)}" y="${(node.y - 14).toFixed(1)}" class="graph-node-label">${escapeHtml(node.name)}</text>` +
        `</g>`
      );
    })
    .join("");

  svg.setAttribute("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);
  svg.innerHTML = edgeSvg + nodeSvg;
}

/* T-212 Phase 3: render whichever graph the toggle selects, from the cached
   snapshots. "notes" shows only memory nodes and their approved note->note
   links (labelled by content), with an empty state that points at the
   approval command; "all" is the original whole-graph view. */
function renderActiveGraph() {
  if (graphMode === "notes") {
    renderMemoryGraph(lastGraphMemory, {
      emptyText:
        "No linked notes yet. Approve link suggestions with " +
        "`aion memory link-approve` (or link-approve-all) to draw edges here.",
    });
  } else {
    renderMemoryGraph(lastGraphAll, {
      emptyText: "No graph objects recorded yet.",
    });
  }
}

function initGraphToggle() {
  const toggle = $("graphToggle");
  if (!toggle) return;
  toggle.querySelectorAll("[data-graph-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-graph-mode");
      if (mode === graphMode) return;
      graphMode = mode;
      toggle.querySelectorAll("[data-graph-mode]").forEach((b) => {
        b.classList.toggle("active", b === btn);
        b.setAttribute("aria-pressed", b === btn ? "true" : "false");
      });
      renderActiveGraph();
    });
  });
}

function renderSkills(skills) {
  $("skillsList").innerHTML = skills.length
    ? skills
        .map(
          (s) => `
      <div class="row-item">
        <div>
          <div class="row-title">${escapeHtml(s.name)}</div>
          <div class="row-sub">${escapeHtml(s.description)}</div>
        </div>
        ${s.destructive ? '<span class="badge destructive">destructive</span>' : '<span class="badge safe">safe</span>'}
      </div>`
        )
        .join("")
    : '<div class="empty">No skills registered.</div>';
}

function renderEvents(events) {
  const list = $("eventsList");
  if (!events.length) {
    list.innerHTML = '<div class="empty">No events recorded yet.</div>';
    return;
  }

  list.innerHTML = events
    .map((e) => {
      const isNew = firstRefresh ? false : !knownEventIds.has(e.event_id);
      return `
      <div class="event-row${isNew ? " event-new" : ""}">
        <span class="event-time">${fmtTime(e.timestamp)}</span>
        <span class="event-type">${escapeHtml(e.event_type)}</span>
        <span class="event-source">${escapeHtml(e.source_engine)}</span>
      </div>`;
    })
    .join("");

  events.forEach((e) => knownEventIds.add(e.event_id));
}

/* Evolution Observatory (T-101 slice): every recorded self-change,
   newest first. Each row already carries a commit hash and a test
   result by construction - EvolutionObservatory.record() refuses
   anything missing either (aion/evolution/observatory.py) - so this
   renderer trusts the data rather than re-validating it. */
function renderObservatory(changes) {
  const list = $("observatoryList");
  if (!changes.length) {
    list.innerHTML = '<div class="empty">No changes recorded yet.</div>';
    return;
  }

  list.innerHTML = changes
    .map((ch) => {
      const shortSha = escapeHtml(String(ch.commit_sha || "").slice(0, 7));
      return `
      <div class="row-item">
        <div>
          <div class="row-title">${escapeHtml(ch.title)}</div>
          <div class="row-sub">${shortSha} &middot; ${escapeHtml(ch.tests)} &middot; ${fmtTime(ch.timestamp)}</div>
        </div>
      </div>`;
    })
    .join("");
}

/* ------------------------------------------------------------------ */
/* Morning briefing - loaded once, not part of the 5s poll loop        */
/* ------------------------------------------------------------------ */

async function loadBriefing() {
  const el = $("briefingText");
  try {
    const data = await getJSON("/api/briefing");
    el.textContent = data.text;
  } catch (err) {
    el.textContent = "Could not load today's briefing: " + err.message;
  }
}

/* ------------------------------------------------------------------ */
/* Poll loop                                                            */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* System health + Guardian (T-061)                                    */
/*                                                                     */
/* Every value on these two panels comes from a live read. A domain     */
/* that cannot be read says so, with the reason, rather than showing a  */
/* plausible number - "CPU: OK" printed by something that measured      */
/* nothing is indistinguishable from a working reading, which is the    */
/* exact failure "values change with no human edit" is meant to rule    */
/* out.                                                                */
/* ------------------------------------------------------------------ */

function healthRow(label, value, tone) {
  // Reuses .row-item, the shape every other list on this dashboard
  // already uses, so a new panel does not arrive looking like a
  // different application.
  return (
    `<div class="row-item"><span class="row-title">${label}</span>` +
    `<span class="health-value ${tone || ""}">${value}</span></div>`
  );
}

function toneForPct(pct) {
  if (pct >= 90) return "is-bad";
  if (pct >= 75) return "is-warn";
  return "is-good";
}

function renderSystemHealth(health) {
  const el = $("systemHealthList");
  if (!el) return;
  const rows = [];

  /* hybrid-v2: no "unreadable" placeholders. A metric is shown only when there
     is a real value; in a browser that is the reported core count and the
     browser's rounded device memory, labelled as exactly that. */
  const omitted = [];
  const cpu = health.cpu || {};
  if (cpu.available) rows.push(healthRow("CPU", `${cpu.percent}% across ${cpu.cores} cores`, toneForPct(cpu.percent)));
  else if (cpu.cores) rows.push(healthRow("CPU cores", `${cpu.cores} logical (browser-reported; load not readable)`, ""));
  else omitted.push(cpu);

  const ram = health.ram || {};
  if (ram.available) rows.push(healthRow("RAM", `${ram.used_pct}% of ${ram.total_gb} GB`, toneForPct(ram.used_pct)));
  else if (ram.device_memory_gb) rows.push(healthRow("Device memory", `about ${ram.device_memory_gb} GB (browser-rounded; usage not readable)`, ""));
  else omitted.push(ram);

  const disk = health.disk || {};
  if (disk.available) rows.push(healthRow("Disk", `${disk.free_gb} GB free of ${disk.total_gb} GB`, toneForPct(disk.used_pct)));
  else omitted.push(disk);

  /* AI route status: read from the live hybrid state and the receipts, so
     every value is something this page actually observed. */
  const hy = window.AionHybridState;
  if (hy) {
    const nanoTxt = { ready: "ready on this device", downloadable: "can be downloaded", downloading: "downloading " + (hy.nanoDetail || ""),
      unavailable: "not available on this device", unsupported: "not supported in this browser", checking: "checking" }[hy.nano] || hy.nano;
    rows.push(healthRow("Gemini Nano", nanoTxt, hy.nano === "ready" ? "is-good" : "is-warn"));
    const ac = hy.appCheck || {};
    const acTxt = ac.status === "error" ? "failed to start"
      : hy.appCheckWarm === "ready" ? "verified" + (hy.appCheckWarmMs ? " in " + hy.appCheckWarmMs.toLocaleString() + " ms" : "")
      : hy.appCheckWarm === "failed" ? "could not verify this browser (cloud may refuse)"
      : hy.appCheckWarm === "warming" ? "verifying..." : hy.offlineDemo ? "skipped (Offline Demo Mode)" : (ac.status || "off");
    rows.push(healthRow("App Check", acTxt, hy.appCheckWarm === "ready" ? "is-good" : "is-warn"));
    const H = window.AionHybrid;
    const sumT = H && H.telemetry ? H.telemetry.summarizeTelemetry() : null;
    const last = H && H.telemetry ? H.telemetry.getReceipts().slice(-1)[0] : null;
    if (last) {
      const lastCloud = H.telemetry.getReceipts().filter((r) => /^cloud-/.test(r.route)).slice(-1)[0];
      if (lastCloud) rows.push(healthRow("Last cloud call", (RECEIPT_STATUS[lastCloud.status] || [lastCloud.status])[0] +
        (lastCloud.latencyMs !== null ? " · " + lastCloud.latencyMs.toLocaleString() + " ms" : ""),
        lastCloud.status === "completed" ? "is-good" : "is-warn"));
      rows.push(healthRow("AI requests", sumT.total + " (" + sumT.cloudRequests + " cloud, " + sumT.localOnly + " local, " + sumT.blocked + " blocked)", ""));
    }
  }

  const net = health.network || {};
  if (net.available) {
    const age = net.age_minutes === null || net.age_minutes === undefined
      ? "age unknown"
      : `${net.age_minutes} min ago`;
    rows.push(healthRow("Network", `${net.verdict || "recorded"} (${age})`, "is-good"));
  } else {
    rows.push(healthRow("Network", "never checked", "is-warn"));
  }

  // The reasons matter more than the dashes. Someone looking at an
  // unreadable panel needs to know it is a missing package, not a
  // broken machine.
  const reasons = omitted.concat(net.available ? [] : [net])
    .filter((d) => d && d.available === false && d.reason)
    .map((d) => `<div class="row-sub health-reason">${d.reason}</div>`);

  el.innerHTML = rows.join("") + reasons.join("");
}

function renderGuardian(guardian) {
  const el = $("guardianList");
  if (!el) return;
  const report = guardian.report || {};
  const checks = Array.isArray(report.checks) ? report.checks : [];
  const overall = report.overall || "UNKNOWN";

  const toneFor = (sev) => {
    const s = String(sev || "").toUpperCase();
    if (s === "CRITICAL" || s === "ALERT") return "is-bad";
    if (s === "WARN") return "is-warn";
    return "is-good";
  };

  const head = healthRow("Overall", overall, toneFor(overall));
  const body = checks.map((c) =>
    healthRow(c.name, c.severity, toneFor(c.severity)) +
    `<div class="row-sub health-reason">${c.message || ""}</div>`
  );

  el.innerHTML = head + body.join("");
}

/* One entry per panel. Named rather than positional because the old
   destructured array meant that adding an endpoint in the middle
   silently re-pointed every renderer after it. */
const ENDPOINTS = [
  ["status", "/api/status"],
  ["missions", "/api/planner/missions"],
  ["architecture", "/api/architecture"],
  ["providers", "/api/providers/usage"],
  ["providerHealth", "/api/providers/health"],
  ["memoryStats", "/api/memory/stats"],
  ["graphStats", "/api/graph/stats"],
  ["skills", "/api/skills"],
  ["events", "/api/events/recent?limit=25"],
  ["observatory", "/api/observatory/timeline?limit=20"],
  ["graphSnapshot", "/api/graph/snapshot?limit=150"],
  ["graphMemory", "/api/graph/memory-subgraph?limit=150"],
  ["progress", "/api/progress"],
  ["health", "/api/system/health"],
  ["guardian", "/api/guardian/status"],
];

function describeAge(ms) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 90) return `${seconds}s`;
  return `${Math.round(seconds / 60)} min`;
}

/* Runs once a second, not once a poll, so the page starts admitting it
   is stale on time rather than at the next successful fetch - which,
   when the network has gone, is never. */
function markStaleness() {
  const stale = !lastSuccessAt || Date.now() - lastSuccessAt > STALE_AFTER_MS;
  document.body.classList.toggle("stale", stale);
  if (stale && lastSuccessAt) {
    $("footerStatus").textContent =
      `Not connected - showing data from ${describeAge(Date.now() - lastSuccessAt)} ago`;
  }
  return stale;
}

async function refresh() {
  /* A network switch used to leave polls overlapping: the hung one never
     resolved and the interval kept adding more. */
  if (refreshInFlight || authBlocked) return;
  refreshInFlight = true;
  try {
    /* allSettled, not all. One endpoint timing out on a weak link used to
       discard the eleven that answered, so a single slow panel blanked
       the whole dashboard. Now a dead endpoint costs its own panel. */
    const settled = await Promise.allSettled(ENDPOINTS.map(([, path]) => getJSON(path)));
    const data = {};
    let failed = 0;
    settled.forEach((outcome, i) => {
      if (outcome.status === "fulfilled") data[ENDPOINTS[i][0]] = outcome.value;
      else failed += 1;
    });

    if (failed === ENDPOINTS.length) {
      const why = (settled[0] && settled[0].reason && settled[0].reason.message) || "no response";
      if (!markStaleness()) $("footerStatus").textContent = "Connection error: " + why;
      return;
    }

    lastSuccessAt = Date.now();
    document.body.classList.remove("stale");

    if (data.status) renderOverview(data.status);
    if (data.missions) renderMissions(data.missions);
    if (data.architecture) renderArchitecture(data.architecture);
    if (data.providers) renderProviders(data.providers);
    if (data.providerHealth) renderProviderSelection(data.providerHealth);
    if (data.providerHealth) renderCapabilityLadder(data.providerHealth);
    if (data.memoryStats && data.graphStats) renderKnowledge(data.memoryStats, data.graphStats);
    if (data.skills) renderSkills(data.skills);
    if (data.events) renderEvents(data.events);
    if (data.observatory) renderObservatory(data.observatory);
    if (data.graphSnapshot) lastGraphAll = data.graphSnapshot;
    if (data.graphMemory) lastGraphMemory = data.graphMemory;
    if (data.graphSnapshot || data.graphMemory) renderActiveGraph();
    if (data.progress) renderClimb(data.progress);
    if (data.health) renderSystemHealth(data.health);
    if (data.guardian) renderGuardian(data.guardian);
    if (data.architecture && data.status && data.providers && data.guardian) {
      renderRadarCore(
        data.architecture,
        data.status.safe_mode,
        data.providers,
        (data.guardian.report || {}).overall
      );
    }
    addCorners();

    // The footer used to declare everything fine whenever the fetches
    // succeeded - it said so while Guardian's overall state was ALERT,
    // which made it a decoration rather than a reading. It now says
    // what Guardian actually reports, whatever that is.
    if (!data.guardian) {
      $("footerStatus").textContent =
        `Connected - ${failed} of ${ENDPOINTS.length} panels did not answer, Guardian among them`;
    } else {
      const overall = String((data.guardian.report || {}).overall || "UNKNOWN").toUpperCase();
      const alerts = data.guardian.alert_count || 0;
      const partial = failed ? ` (${failed} panel${failed === 1 ? "" : "s"} not answering)` : "";
      $("footerStatus").textContent =
        (overall === "OK" || overall === "INFO"
          ? "Connected - Guardian reports all checks clear"
          : `Connected - Guardian reports ${overall}` + (alerts ? ` (${alerts} to look at)` : "")) +
        partial;
    }
    firstRefresh = false;
  } catch (err) {
    if (!markStaleness()) $("footerStatus").textContent = "Connection error: " + err.message;
  } finally {
    refreshInFlight = false;
  }
}

/* ------------------------------------------------------------------ */
/* Chat panel - voice input, voice output, memory approval             */
/* ------------------------------------------------------------------ */

const chatHistory = [];
let voiceMuted = false;
let ttsVoice = null;
let recognition = null;
let listening = false;

function pickDefaultVoice() {
  const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  if (!voices.length) return null;
  return (
    voices.find((v) => /en-US/i.test(v.lang) && /female|zira|samantha|google us english/i.test(v.name)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    voices[0]
  );
}

function initVoiceOutput() {
  if (!("speechSynthesis" in window)) {
    $("muteBtn").disabled = true;
    $("muteBtn").title = "Voice output not supported in this browser";
    return;
  }
  ttsVoice = pickDefaultVoice();
  window.speechSynthesis.onvoiceschanged = () => {
    ttsVoice = pickDefaultVoice();
  };
}

// Strip the markdown the model slips in despite being asked not to, so neither
// TTS nor a plain-text surface shows literal *asterisks* / _underscores_ / `backticks`.
// Kept in sync with mobile.html's cleanMarkdown (T-200) and with
// renderMarkdownLite below, which turns the same markers into real HTML instead.
// Order matters: double markers (**bold**, __bold__) before single ones, so a
// pair isn't mistaken for two singles.
function cleanMarkdown(text) {
  return String(text == null ? "" : text)
    .replace(/`{3,}/g, "")                                         // ``` fences
    .replace(/`([^`]+)`/g, "$1")                                   // `inline code`
    .replace(/\*\*([^\n]+?)\*\*/g, "$1")                           // **bold**
    .replace(/__([^\n]+?)__/g, "$1")                               // __bold__
    .replace(/(^|[^*])\*(?=\S)([^*\n]*?\S)\*/g, "$1$2")            // *italic*
    .replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?=[^\w]|$)/g, "$1$2")  // _italic_ (not snake_case)
    .replace(/~~([^\n]+?)~~/g, "$1")                               // ~~strike~~
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")                       // [text](url) -> text
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")                            // # heading
    .replace(/^\s{0,3}>\s?/gm, "")                                 // > blockquote
    .replace(/^\s{0,3}[-*+]\s+/gm, "");                            // - * + bullet
}

// Emoji render fine on screen but the browser's TTS reads them by NAME
// ("musical note"), so strip them for SPEECH ONLY. This is deliberately NOT in
// cleanMarkdown (which also feeds mobile.html's on-screen bubble) or
// renderMarkdownLite (the on-screen desktop HTML) - both keep emoji. Proper
// Unicode ranges, not a fixed list: Extended_Pictographic covers the pictographs,
// and the extra ranges cover what builds multi-codepoint emoji - regional
// indicators (flags), skin-tone modifiers, VS16, the enclosing keycap, and the
// zero-width joiner - so flags / skin tones / ZWJ sequences go too. Then tidy the
// whitespace the removals leave behind. Kept in sync with mobile.html's stripEmoji.
function stripEmoji(text) {
  return String(text == null ? "" : text)
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{20E3}\u{200D}]/gu, "")
    .replace(/ {2,}/g, " ")
    .replace(/ +([,.!?;:])/g, "$1")
    .trim();
}

function speakableText(text) {
  // Markdown first (shared with the screen), then emoji (speech only).
  return stripEmoji(cleanMarkdown(text));
}

/* ------------------------------------------------------------------ */
/* M1 / T-250 - voice conversation logic. PURE functions only: no DOM,  */
/* no window, no network, no timers. Everything that touches the mic or */
/* the speaker lives elsewhere and calls these, so the decisions can be */
/* run for real in node (tests/interfaces/web/test_voice_barge_in.py)   */
/* instead of being asserted as source text. Design:                    */
/* docs/design/voice-interruption.md. Nothing calls these yet; wiring   */
/* them to the microphone is the next session.                          */
/* ------------------------------------------------------------------ */

// Lowercase words with punctuation removed. Letters, marks and digits are
// kept, so a Devanagari word is not cut through its vowel signs.
function echoWords(text) {
  const cleaned = String(text == null ? "" : text)
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
  return cleaned ? cleaned.split(" ") : [];
}

// How much of what the mic heard is AION's own voice coming back, 0 to 1.
// Single words are matched as words. Longer phrases are matched as
// neighbouring word PAIRS, so a new question that merely reuses common
// words from a long reply is not mistaken for an echo. The last word may be
// a partial word, because speech recognition reports unfinished words.
function echoScore(heard, spoken) {
  const h = echoWords(heard);
  const s = echoWords(spoken);
  if (!h.length || !s.length) return 0;
  if (h.length === 1) {
    const w = h[0];
    const hit = s.includes(w) || (w.length >= 3 && s.some((x) => x.startsWith(w)));
    return hit ? 1 : 0;
  }
  const pairs = [];
  for (let i = 0; i + 1 < s.length; i++) pairs.push(s[i] + " " + s[i + 1]);
  const known = new Set(pairs);
  let hits = 0;
  let total = 0;
  for (let i = 0; i + 1 < h.length; i++) {
    total += 1;
    const pair = h[i] + " " + h[i + 1];
    const isLastPair = i + 2 === h.length;
    if (known.has(pair)) hits += 1;
    else if (isLastPair && h[i + 1].length >= 3 && pairs.some((p) => p.startsWith(pair))) hits += 1;
  }
  return total ? hits / total : 0;
}

function isEchoOfSpeech(heard, spoken, threshold) {
  const limit = typeof threshold === "number" ? threshold : 0.6;
  return echoScore(heard, spoken) >= limit;
}

// Should what the mic just heard cut AION's voice off? First rough cut: the
// numbers below are tuned against the owner's real voice and room in the
// live session, not guessed to be final.
function shouldBargeIn(heard, spoken, msSinceSpeechStart) {
  const words = echoWords(heard);
  if (!words.length) return { interrupt: false, reason: "nothing-heard" };
  if (typeof msSinceSpeechStart === "number" && msSinceSpeechStart < 400) {
    return { interrupt: false, reason: "too-soon" };
  }
  // A lone command word wins BEFORE the echo check. AION's replies often
  // contain these very words ("stopped", "wait", "no"), and a single word is
  // matched against the reply by word or word-start, so the echo check used to
  // swallow a real "stop" whenever the reply happened to use one. Cutting AION
  // off by mistake is cheap; being unable to stop it is not. Several heard
  // words are still tested for echo below, so a PHRASE that merely repeats
  // the reply (even one containing a command word) does not interrupt.
  const commands = ["stop", "wait", "no", "cancel", "enough", "pause"];
  if (words.length === 1 && commands.indexOf(words[0]) !== -1) {
    return { interrupt: true, reason: "command-word" };
  }
  if (isEchoOfSpeech(heard, spoken)) return { interrupt: false, reason: "echo" };
  if (words.length >= 2) return { interrupt: true, reason: "speech" };
  return { interrupt: false, reason: "too-short" };
}

// The conversation state machine. An event that does not apply in the
// current state changes nothing, which is how a late reply to a request the
// owner already interrupted is ignored instead of being spoken.
function voiceNextState(state, event) {
  const table = {
    off: { start: "listening" },
    listening: { utterance: "thinking", stop: "off", fatal: "off" },
    thinking: {
      reply: "speaking",
      "reply-silent": "listening",
      "interrupt-thinking": "listening",
      stop: "off",
      fatal: "off",
    },
    speaking: {
      "speech-end": "listening",
      interrupt: "listening",
      utterance: "thinking",
      stop: "off",
      fatal: "off",
    },
  };
  const row = table[state];
  if (!row) return "off";
  return Object.prototype.hasOwnProperty.call(row, event) ? row[event] : state;
}

function voiceAcceptsReply(state) {
  return state === "thinking";
}

// The voice conversation switches itself off after this much silence.
function voiceIdleExpired(lastActivityMs, nowMs, limitMs) {
  const limit = typeof limitMs === "number" ? limitMs : 300000;
  return nowMs - lastActivityMs >= limit;
}

/* ------------------------------------------------------------------ */
/* TALK - the continuous voice conversation controller (M1 / T-250).    */
/*                                                                      */
/* This is the ONLY place the conversation's behaviour lives, and it    */
/* has NO access to the page: no element lookups, no browser speech     */
/* objects, no timers of its own. Everything it needs is handed in as   */
/* `deps`, so the whole controller can be run for real in node (see     */
/* tests/interfaces/web/test_voice_talk_controller.py) with fakes. The  */
/* thin wiring that connects it to real buttons, the real microphone    */
/* and the real /api/chat call is initTalk() much further down.         */
/*                                                                      */
/* It reuses the four pure decisions above - voiceNextState (the state  */
/* machine), shouldBargeIn (may a new sound cut AION off), and          */
/* voiceAcceptsReply / voiceIdleExpired - and never reimplements them.  */
/*                                                                      */
/* deps:                                                                */
/*   makeRecognition()            -> a fresh recogniser, or null        */
/*   speak(text, {onstart,onend}) -> start speaking a reply             */
/*   cancelSpeech()               -> stop speaking at once              */
/*   send(text, turnId)           -> Promise of the reply text          */
/*   now()                        -> current time in ms                 */
/*   setTimeout(fn, ms) / clearTimeout(h)                               */
/*   isMuted()                    -> true when voice output is muted     */
/*   onState(state)   onStatus(msg)   onUserText(t)   onReply(t)        */
/* ------------------------------------------------------------------ */
function createTalkController(deps) {
  const IDLE_CHECK_MS = 10000; // how often we look for silence
  const IDLE_LIMIT_MS = 300000; // 5 minutes of silence turns TALK off
  const RESTART_DELAY_MS = 300; // pause before restarting a dropped recogniser
  const RESTART_WINDOW_MS = 10000; // the span the restart-storm guard watches
  const RESTART_MAX = 5; // more restarts than this in that span = give up
  const LEFTOVER_MS = 2000; // after AION stops, a late 1-2 word echo of its reply is dropped
  const LEFTOVER_MAX_WORDS = 2; // a longer final is a real question, never a leftover

  let state = "off";
  let turnId = 0; // bumped for every request; a reply with a stale id is dropped
  let recognition = null;
  let speechStartedAt = null; // when AION's own voice actually began
  let speechEndedAt = null; // when AION's voice last finished by itself (not when cut off)
  let spokenText = ""; // what AION is currently saying (to filter its echo)
  let lastActivityAt = 0; // last time anything happened, for the idle timer
  let idleTimer = null;
  let restartTimer = null;
  let restartTimes = []; // timestamps of recent auto-restarts

  function isMuted() {
    return typeof deps.isMuted === "function" ? Boolean(deps.isMuted()) : false;
  }

  function transition(event) {
    const next = voiceNextState(state, event);
    if (next === state) return false;
    state = next;
    deps.onState(state);
    return true;
  }

  // Pull the best transcript out of a recognition result. interimResults is on,
  // so a result that is not yet final is an interim guess; a final result wins
  // over any interim in the same event.
  function readTranscript(event) {
    const results = event && event.results ? event.results : [];
    const start = typeof event.resultIndex === "number" ? event.resultIndex : 0;
    let interim = "";
    let final = "";
    for (let i = start; i < results.length; i++) {
      const r = results[i];
      const alt = r && r[0] ? r[0].transcript : "";
      if (r && r.isFinal) final += alt;
      else interim += alt;
    }
    return { interim: interim.trim(), final: final.trim() };
  }

  function armIdle() {
    idleTimer = deps.setTimeout(idleTick, IDLE_CHECK_MS);
  }

  function idleTick() {
    idleTimer = null;
    if (state === "off") return;
    if (voiceIdleExpired(lastActivityAt, deps.now(), IDLE_LIMIT_MS)) {
      giveUp("TALK turned off after 5 minutes of silence.");
      return;
    }
    armIdle();
  }

  // Begin a new request from something the owner just said.
  function startTurn(text) {
    transition("utterance"); // listening|speaking -> thinking
    turnId += 1;
    const myTurn = turnId;
    lastActivityAt = deps.now();
    deps.onUserText(text);
    Promise.resolve(deps.send(text, myTurn)).then(
      function (reply) {
        deliverReply(reply, myTurn);
      },
      function () {
        failTurn(myTurn);
      }
    );
  }

  function deliverReply(reply, myTurn) {
    // A reply is heard only if it is still the current request and the
    // conversation is still waiting for one. Anything else - the owner
    // interrupted, or TALK was switched off - is dropped in silence.
    if (myTurn !== turnId) return;
    if (!voiceAcceptsReply(state)) return;
    const text = String(reply == null ? "" : reply);
    deps.onReply(text);
    lastActivityAt = deps.now();
    if (isMuted()) {
      transition("reply-silent"); // thinking -> listening, nothing spoken
      return;
    }
    transition("reply"); // thinking -> speaking
    speechStartedAt = null;
    speechEndedAt = null;
    spokenText = text;
    deps.speak(text, {
      onstart: function () {
        speechStartedAt = deps.now();
        spokenText = text;
      },
      onend: function () {
        lastActivityAt = deps.now();
        if (state === "speaking") {
          speechEndedAt = deps.now();
          transition("speech-end"); // -> listening
        }
      },
    });
  }

  function failTurn(myTurn) {
    if (myTurn !== turnId) return;
    if (!voiceAcceptsReply(state)) return;
    deps.onStatus("Something went wrong reaching AION. Still listening.");
    transition("reply-silent"); // back to listening
  }

  function heard(text, isFinal) {
    const trimmed = String(text == null ? "" : text).trim();
    if (!trimmed) return;
    lastActivityAt = deps.now();

    if (state === "listening") {
      if (isFinal) {
        // The recogniser can deliver the tail of AION's own voice a moment
        // after it stopped. A short final that matches the reply, inside the
        // leftover period, is that tail - not a new question.
        const words = echoWords(trimmed);
        const justEnded = speechEndedAt != null && deps.now() - speechEndedAt < LEFTOVER_MS;
        if (justEnded && words.length <= LEFTOVER_MAX_WORDS && isEchoOfSpeech(trimmed, spokenText)) {
          return;
        }
        startTurn(trimmed);
      }
      return; // an interim guess while listening is left to settle
    }

    if (state === "thinking") {
      // No speech is playing yet, so there is no echo to filter and no
      // just-started grace period: spoken text is empty and timing is null.
      const decision = shouldBargeIn(trimmed, "", null);
      if (decision.interrupt) {
        turnId += 1; // the in-flight reply is now stale and will be dropped
        transition("interrupt-thinking"); // -> listening
        if (isFinal) startTurn(trimmed); // the same words become the next ask
      }
      return;
    }

    if (state === "speaking") {
      const since = speechStartedAt == null ? null : deps.now() - speechStartedAt;
      const decision = shouldBargeIn(trimmed, spokenText, since);
      if (decision.interrupt) {
        deps.cancelSpeech();
        transition("interrupt"); // -> listening
        if (isFinal) startTurn(trimmed);
      }
      // echo / too-soon / too-short: ignore it completely, keep speaking
      return;
    }
    // off: nothing to do
  }

  function onRecognitionResult(event) {
    const parsed = readTranscript(event);
    if (parsed.final) heard(parsed.final, true);
    else if (parsed.interim) heard(parsed.interim, false);
  }

  function onRecognitionEnd() {
    if (state === "off") return; // an expected stop
    scheduleRestart();
  }

  function scheduleRestart() {
    const t = deps.now();
    restartTimes.push(t);
    restartTimes = restartTimes.filter(function (x) {
      return t - x < RESTART_WINDOW_MS;
    });
    if (restartTimes.length > RESTART_MAX) {
      giveUp("TALK kept losing the microphone, so it turned off. Press TALK to try again.");
      return;
    }
    restartTimer = deps.setTimeout(function () {
      restartTimer = null;
      if (state === "off" || !recognition) return;
      try {
        recognition.start();
      } catch (e) {
        /* already running - ignore */
      }
    }, RESTART_DELAY_MS);
  }

  function onRecognitionError(event) {
    const err = event && event.error;
    if (err === "no-speech" || err === "aborted") {
      return; // ordinary silence; the end handler restarts us
    }
    if (err === "not-allowed" || err === "service-not-allowed") {
      giveUp("Microphone blocked. Allow it in the browser address bar, then press TALK again.");
      return;
    }
    if (err === "network") {
      giveUp("Speech recognition needs internet. TALK is off.");
      return;
    }
    giveUp("TALK hit a problem and turned off. Press TALK to try again.");
  }

  function start() {
    if (state !== "off") return;
    recognition = deps.makeRecognition();
    if (!recognition) {
      deps.onStatus("TALK needs Chrome or Edge for speech recognition.");
      return;
    }
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = onRecognitionResult;
    recognition.onend = onRecognitionEnd;
    recognition.onerror = onRecognitionError;
    restartTimes = [];
    speechStartedAt = null;
    speechEndedAt = null;
    spokenText = "";
    lastActivityAt = deps.now();
    transition("start"); // off -> listening
    try {
      recognition.start();
    } catch (e) {
      /* already running - ignore */
    }
    armIdle();
  }

  function clearTimers() {
    if (restartTimer != null) {
      deps.clearTimeout(restartTimer);
      restartTimer = null;
    }
    if (idleTimer != null) {
      deps.clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function shutDown() {
    clearTimers();
    turnId += 1; // drop any in-flight reply
    const rec = recognition;
    recognition = null;
    if (rec) {
      try {
        rec.stop();
      } catch (e) {
        /* already stopped - ignore */
      }
    }
    deps.cancelSpeech();
    speechStartedAt = null;
    speechEndedAt = null;
    spokenText = "";
    restartTimes = [];
    transition("stop"); // -> off (a no-op, harmlessly, if already off)
  }

  // Owner-initiated off (button, Escape, leaving the page).
  function stop() {
    shutDown();
  }

  // System-initiated off, with a plain line saying why.
  function giveUp(message) {
    shutDown();
    deps.onStatus(message);
  }

  return {
    start: start,
    stop: stop,
    getState: function () {
      return state;
    },
  };
}

function speak(text, opts) {
  if (voiceMuted || !("speechSynthesis" in window) || !text) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(speakableText(text));
  if (ttsVoice) utter.voice = ttsVoice;
  utter.rate = 1.02;
  utter.pitch = 1.0;
  // TALK needs to know when the voice really starts and ends; a plain call
  // with no second argument behaves exactly as it always has.
  if (opts && typeof opts.onstart === "function") utter.onstart = opts.onstart;
  if (opts && typeof opts.onend === "function") utter.onend = opts.onend;
  window.speechSynthesis.speak(utter);
}

function toggleMute() {
  voiceMuted = !voiceMuted;
  const btn = $("muteBtn");
  btn.textContent = voiceMuted ? "VOICE OFF" : "VOICE ON";
  btn.classList.toggle("muted", voiceMuted);
  if (voiceMuted && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

function initVoiceInput() {
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micBtn = $("micBtn");

  if (!SpeechRecognitionCtor) {
    micBtn.classList.add("unsupported");
    micBtn.title = "Voice input not supported in this browser - try Chrome or Edge";
    micBtn.addEventListener("click", () => {
      setChatStatus("Voice input isn't supported in this browser. Type your message instead.");
    });
    return;
  }

  recognition = new SpeechRecognitionCtor();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    listening = true;
    micBtn.classList.add("listening");
    setChatStatus("Listening...");
  };
  recognition.onend = () => {
    listening = false;
    micBtn.classList.remove("listening");
  };
  recognition.onerror = (event) => {
    listening = false;
    micBtn.classList.remove("listening");
    setChatStatus("Voice input error: " + event.error);
  };
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    $("chatInput").value = transcript;
    setChatStatus("Heard: \"" + transcript + "\"");
    sendChatMessage(transcript);
  };

  micBtn.addEventListener("click", () => {
    if (listening) {
      recognition.stop();
      return;
    }
    try {
      recognition.start();
    } catch (e) {
      /* already started - ignore */
    }
  });
}

function setChatStatus(text) {
  $("chatStatus").textContent = text || "";
}

function renderMarkdownLite(text) {
  // The persona asks the model to avoid markdown in chat/voice replies,
  // but that's a nudge, not a guarantee - if any slips through, render it
  // instead of showing literal markers. Escape FIRST so this never
  // introduces real HTML/XSS from model output; the markdown markers all
  // survive escaping untouched. Same marker set as cleanMarkdown above, but
  // turned into tags rather than stripped. Double before single; links keep
  // their text only (no anchor built from model output).
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")                                  // `code`
    .replace(/\*\*([^\n]+?)\*\*/g, "<strong>$1</strong>")                      // **bold**
    .replace(/__([^\n]+?)__/g, "<strong>$1</strong>")                         // __bold__
    .replace(/(^|[^*])\*(?=\S)([^*\n]*?\S)\*/g, "$1<em>$2</em>")               // *italic*
    .replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?=[^\w]|$)/g, "$1<em>$2</em>")     // _italic_
    .replace(/~~([^\n]+?)~~/g, "<del>$1</del>")                                // ~~strike~~
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")                                   // [text](url) -> text
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")                                        // # heading
    .replace(/^\s{0,3}>\s?/gm, "")                                             // > blockquote
    .replace(/^\s{0,3}[-*+]\s+/gm, "")                                         // bullet marker
    .replace(/\n/g, "<br>");
}

function appendChatMessage(role, text) {
  const log = $("chatLog");
  const empty = log.querySelector(".empty");
  if (empty) empty.remove();

  const bubble = document.createElement("div");
  bubble.className = "chat-msg " + (role === "user" ? "user" : "assistant");
  bubble.innerHTML =
    `<span class="chat-msg-label">${role === "user" ? "You" : "AION"}</span>` + renderMarkdownLite(text);
  log.appendChild(bubble);
  log.scrollTop = log.scrollHeight;
  return bubble;
}

/* Hybrid build: every proposal card carries a privacy-check chip and an Edit
   button next to Approve / Reject. The check itself lives in standalone.js
   (window.AionPrivacy) so mobile.html and the console can reuse it.
   BLOCKED proposals (secrets, ID numbers) cannot be approved at all - the only
   way forward is Edit (remove the secret) or Reject. */
function privacyOf(text) {
  if (window.AionPrivacy) return window.AionPrivacy.check(text);
  return { status: "clean", flags: [], text: String(text), message: "Privacy guard not loaded." };
}

function renderPrivacyChip(el, chk) {
  const icon = chk.status === "clean" ? "✓" : chk.status === "redacted" ? "◐" : "✕";
  el.className = "privacy-chip " + chk.status;
  el.textContent = icon + " Privacy check: " + chk.message;
}

function renderProposals(proposals) {
  const wrap = $("chatProposals");
  /* Cards with an id are saved proposals (they survive a reload) and stay put
     when a new reply arrives; cards without one belong to a single reply. */
  wrap.querySelectorAll(".proposal-card:not([data-pid])").forEach((c) => c.remove());

  const AXIS_BY_DOMAIN = {
    owner: { field: "sensitivity", label: "sensitivity",
             options: ["public", "internal", "owner_private"] },
    world: { field: "volatility", label: "volatility",
             options: ["static", "slow", "fast", "ephemeral"] },
    capability: { field: "failure_history", label: "failure history",
                  options: ["none", "known_failure", "unverified"] },
  };

  proposals.forEach((p) => {
    if (p.id && wrap.querySelector('.proposal-card[data-pid="' + CSS.escape(p.id) + '"]')) return;
    const isTask = p.kind === "task";
    let chk = p.privacy || privacyOf(p.content || "");
    if (chk.status === "redacted" && !p.privacy) p.content = chk.text;

    const card = document.createElement("div");
    card.className = "proposal-card";
    if (p.id) card.dataset.pid = p.id;
    card.innerHTML = `
      <div style="flex:1;min-width:0">
        <div class="proposal-body">
          <div class="proposal-text"><span class="proposal-kind">${isTask ? "task" : "memory"}</span>${escapeHtml(p.content || "")}</div>
        </div>
        <div class="proposal-meta">${isTask ? "to-do" : escapeHtml(p.type || "fact")} - importance ${p.importance ?? 3}</div>
        <div class="privacy-chip"></div>
        ${isTask ? "" : `
        <div class="proposal-classify">
          <select class="prop-domain" aria-label="Memory domain">
            <option value="">choose a domain...</option>
            <option value="owner">owner - about you</option>
            <option value="world">world - about the world</option>
            <option value="capability">capability - about what AION can do</option>
          </select>
          <select class="prop-axis" aria-label="Domain axis" disabled>
            <option value="">-</option>
          </select>
        </div>
        <div class="proposal-hint">A memory saved without a domain is quarantined and never recalled.</div>`}
      </div>
      <div class="proposal-actions">
        <button class="hud-btn approve" disabled>Approve</button>
        <button class="hud-btn edit">Edit</button>
        <button class="hud-btn reject">Reject</button>
      </div>
    `;
    wrap.appendChild(card);

    const chipEl = card.querySelector(".privacy-chip");
    const approveBtn = card.querySelector(".approve");
    const domainSel = card.querySelector(".prop-domain");
    const axisSel = card.querySelector(".prop-axis");
    let editing = false;

    const refresh = () => {
      renderPrivacyChip(chipEl, chk);
      const classified = isTask || (domainSel.value && axisSel.value);
      approveBtn.disabled = editing || chk.status === "blocked" || !classified;
    };
    refresh();

    /* The approve card used to send content, type, importance and tags - and no
       domain. remember() accepts that and quarantines the result, so every
       memory approved from this dashboard was excluded from recall. The UI now
       asks for a domain and its ONE axis before Approve unlocks (see
       aion/memory/domains.py: each domain owns exactly one axis). */
    if (!isTask) {
      domainSel.addEventListener("change", () => {
        const spec = AXIS_BY_DOMAIN[domainSel.value];
        if (!spec) {
          axisSel.innerHTML = '<option value="">-</option>';
          axisSel.disabled = true;
        } else {
          axisSel.innerHTML =
            `<option value="">${spec.label}...</option>` +
            spec.options.map((o) => `<option value="${o}">${o}</option>`).join("");
          axisSel.disabled = false;
        }
        refresh();
      });
      axisSel.addEventListener("change", refresh);
    }

    approveBtn.addEventListener("click", async () => {
      const btns = card.querySelectorAll("button");
      btns.forEach((b) => (b.disabled = true));
      try {
        let res;
        if (isTask) {
          res = await apiPost("/api/tasks/approve", { title: p.content, proposal_id: p.id });
        } else {
          const spec = AXIS_BY_DOMAIN[domainSel.value];
          const payload = {
            content: p.content,
            type: p.type || "fact",
            importance: p.importance ?? 3,
            tags: p.tags || [],
            domain: domainSel.value,
          };
          if (p.id) payload.proposal_id = p.id;
          // Exactly one axis is sent. Sending another domain's axis is a
          // CrossDomainWriteError by construction, not a validation nicety.
          payload[spec.field] = axisSel.value;
          res = await apiPost("/api/memory/approve", payload);
        }
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.detail || "save failed (" + res.status + ")");
        }
        approveBtn.textContent = "Saved";
        approveBtn.classList.add("saved");
        card.querySelector(".reject").remove();
        card.querySelector(".edit").remove();
        if (p.id) card.removeAttribute("data-pid"); /* resolved: next reply may sweep it */
        loadPendingBadge();
      } catch (err) {
        setChatStatus("Could not save: " + err.message);
        btns.forEach((b) => (b.disabled = false));
        refresh();
      }
    });

    card.querySelector(".reject").addEventListener("click", () => {
      if (p.id) apiPost("/api/proposals/reject", { proposal_id: p.id }).catch(() => {});
      card.remove();
    });

    card.querySelector(".edit").addEventListener("click", () => {
      if (editing) return;
      editing = true;
      refresh();
      const body = card.querySelector(".proposal-body");
      const original = body.innerHTML;
      body.innerHTML =
        '<div class="proposal-edit"><textarea aria-label="Edit proposal text"></textarea>' +
        '<div class="proposal-edit-actions"><button class="hud-btn approve" data-save>Save edit</button>' +
        '<button class="hud-btn reject" data-cancel>Cancel</button></div></div>';
      const ta = body.querySelector("textarea");
      ta.value = p.content || "";
      ta.focus();
      body.querySelector("[data-cancel]").addEventListener("click", () => {
        body.innerHTML = original;
        editing = false;
        refresh();
      });
      body.querySelector("[data-save]").addEventListener("click", () => {
        const text = ta.value.trim();
        if (!text) return;
        chk = privacyOf(text);
        p.content = chk.status === "redacted" ? chk.text : text;
        p.privacy = chk;
        body.innerHTML =
          `<div class="proposal-text"><span class="proposal-kind">${isTask ? "task" : "memory"}</span>${escapeHtml(p.content)}</div>`;
        editing = false;
        if (p.id) apiPost("/api/proposals/update", { proposal_id: p.id, content: p.content }).catch(() => {});
        refresh();
      });
    });
  });
}

/* Pending proposals are saved in this browser (standalone mode), so they come
   back after a reload. Against the real backend this route does not exist and
   the call quietly does nothing. */
async function loadPendingProposals() {
  try {
    const rows = await getJSON("/api/proposals/pending");
    if (rows && rows.length) renderProposals(rows);
  } catch (err) { /* no standalone store - nothing to restore */ }
}
function loadPendingBadge() { /* reserved: keeps the call site stable if a counter is added */ }

/* The badge under every AI reply: where it ran and how long it took. */
function attachAiBadge(bubble, meta) {
  /* The pill goes at the TOP of the bubble, above the reply text. */
  const badge = document.createElement("div");
  badge.className = "ai-badge";
  badge.setAttribute("role", "status");
  if (!meta) {
    badge.textContent = "Local AION backend";
    bubble.insertBefore(badge, bubble.firstChild);
    return;
  }
  const onDevice = meta.source === "on_device";
  const offlinePlan = meta.source === "local_deterministic";
  badge.classList.add(onDevice || offlinePlan ? "on-device" : "in-cloud");
  const ms = Number(meta.latency_ms || 0).toLocaleString() + " ms";
  badge.textContent = offlinePlan
    ? "Offline plan (no AI, made in this browser) \u00B7 " + ms
    : onDevice
    ? "On-Device (Gemini Nano) \u00B7 " + ms
    : (meta.requested_mode === "prefer_on_device" ? "In-Cloud (Gemini, Nano not used) \u00B7 " : "In-Cloud (Gemini) \u00B7 ") + (meta.model || "cloud model") + " \u00B7 " + ms;
  if (meta.fallback) badge.classList.add("fell-back");
  /* Telemetry split (hybrid-v2): requested route vs what actually ran, whether
     the SDK reported the source itself, and who contributed to this reply. */
  const c = meta.contributors || {};
  const who = [c.local_deterministic && "local code", c.local_ai && "on-device AI",
    c.cloud_ai && "cloud AI", c.human_confirmed && "you (approved)"].filter(Boolean);
  badge.title = "Requested route: " + String(meta.requested_mode || meta.mode || "").replace(/_/g, " ") +
    " \u00B7 Actually ran: " + (onDevice ? "on device" : "in cloud") +
    (meta.source_verified ? " (reported by the SDK)" : " (inferred - the SDK did not report it)") +
    " \u00B7 Model: " + (meta.model || "?") + (who.length ? " \u00B7 Contributors: " + who.join(", ") : "");
  badge.dataset.requestedMode = meta.requested_mode || meta.mode || "";
  badge.dataset.actualSource = meta.actual_source || meta.source || "";
  badge.dataset.sourceVerified = meta.source_verified ? "true" : "false";
  bubble.insertBefore(badge, bubble.firstChild);

  const bits = [];
  bits.push(meta.notes_used ? "Used " + meta.notes_used + " saved note" + (meta.notes_used === 1 ? "" : "s") : "No saved notes matched");
  if (meta.tasks_used) bits.push(meta.tasks_used + " task" + (meta.tasks_used === 1 ? "" : "s") + " in context");
  if (meta.private_withheld) {
    bits.push(meta.private_withheld + " private note" + (meta.private_withheld === 1 ? "" : "s") +
      " kept out of this request (use Only On-Device to include them)");
  }
  if (meta.sealed && meta.sealed_items) {
    bits.push(meta.sealed_items + " private item" + (meta.sealed_items === 1 ? "" : "s") + " sent as placeholders, names restored here");
  }
  if (who.length) bits.push("By: " + who.join(" + "));
  if (meta.disclosure && meta.disclosure.digest) {
    bits.push("Sent as disclosure " + String(meta.disclosure.digest).slice(0, 8) + "\u2026 (" + meta.disclosure.bytes + " characters)");
  }
  /* Routing receipt (hybrid-v2 router): why this route, what happened, and
     how much left the browser. Every number here was measured, never guessed. */
  if (meta.routing && meta.routing.overridden) {
    const why = (meta.routing.reasons || []).map((r) => r === "sensitive_kept_local" ? "message looked sensitive, kept on this device"
      : r === "offline_demo" ? "Offline Demo Mode" : r === "offline" ? "browser is offline" : r.replace(/_/g, " "));
    bits.push("Route changed: " + why.join(", "));
  }
  if (meta.fallback) bits.push("Fallback: " + meta.fallback.reason);
  if (meta.receipt) {
    const r = meta.receipt;
    bits.push("Receipt " + String(r.id || "").slice(0, 8) + " \u00B7 " + String(r.route || "").replace(/-/g, " ") + " \u00B7 " +
      (r.bytes_sent ? r.bytes_sent + " characters sent" : "nothing sent to the cloud") +
      (r.function_calls && r.function_calls.length ? " \u00B7 tools: " + r.function_calls.join(", ") : ""));
  }
  const sub = document.createElement("span");
  sub.className = "ai-badge-sub";
  sub.textContent = bits.join(" \u00B7 ");
  bubble.appendChild(sub);
}

async function sendChatMessage(text) {
  const message = (text ?? $("chatInput").value).trim();
  if (!message) return;

  $("chatInput").value = "";
  $("sendBtn").disabled = true;
  appendChatMessage("user", message);
  setChatStatus("AION is thinking...");

  /* Live bubble: shows "Thinking..." the instant Send is clicked, then turns
     into the streaming reply as tokens arrive. If the first reply is slow (App
     Check / reCAPTCHA can take a while on a fresh page) it keeps counting. */
  const hy = window.AionHybridState || {};
  const routeWord = hy.mode === "only_on_device" ? "Routing to on-device Gemini Nano..."
    : hy.mode === "prefer_on_device" ? "Thinking... routing to Gemini Nano / cloud"
    : "Thinking... routing to Cloud Gemini";
  const pending = appendChatMessage("assistant", routeWord);
  pending.classList.add("pending");
  let streaming = false;
  const pendingStart = Date.now();
  const labelHtml = '<span class="chat-msg-label">AION</span>';
  const pendingTimer = setInterval(() => {
    if (streaming) return;
    const sec = Math.floor((Date.now() - pendingStart) / 1000);
    const stage = sec < 4 ? routeWord
      : sec < 15 ? "Verifying App Check & routing..."
      : "Still working - waiting on the first token";
    pending.innerHTML = labelHtml + stage + " (" + sec + " s)";
    setChatStatus(stage);
  }, 500);
  window.AionOnChunk = (textSoFar) => {
    if (!streaming) { streaming = true; pending.classList.remove("pending"); pending.classList.add("streaming"); }
    pending.innerHTML = labelHtml + renderMarkdownLite(textSoFar);
    const log = $("chatLog"); if (log) log.scrollTop = log.scrollHeight;
  };
  const stopLive = () => { clearInterval(pendingTimer); window.AionOnChunk = null; };

  try {
    const res = await apiPost("/api/chat", { message, history: chatHistory });
    stopLive();
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail.detail || "request failed (" + res.status + ")");
    }
    const body = await res.json();
    const reply = body.data.reply;
    const proposed = body.data.proposed_memories || [];

    /* Reuse the live bubble as the final one (no flicker), then add the badge. */
    const bubble = pending;
    bubble.classList.remove("pending", "streaming");
    bubble.innerHTML = labelHtml + renderMarkdownLite(reply);
    attachAiBadge(bubble, body.data.meta);
    chatHistory.push({ role: "user", content: message });
    chatHistory.push({ role: "assistant", content: reply });

    if (proposed.length) renderProposals(proposed);
    setChatStatus("");

    if (!voiceMuted) {
      bubble.classList.add("speaking");
      speak(reply);
      setTimeout(() => bubble.classList.remove("speaking"), 2500);
    }
  } catch (err) {
    stopLive();
    pending.remove();
    /* Show the exact error in the chat itself, not only in the status line,
       so a failed request can be read (and copied) without opening DevTools. */
    setChatStatus("Error: " + err.message);
    const bubble = appendChatMessage("assistant", "Request failed. Exact error:\n\n" + err.message);
    bubble.classList.add("error");
  } finally {
    $("sendBtn").disabled = false;
  }
}

/* The thin bridge between the pure TALK controller and the real page:
   the microphone, the browser's speech, the /api/chat call, and the two
   new elements (#talkBtn, #talkIndicator). The controller holds all the
   behaviour; this function only moves values across the boundary. */
function initTalk() {
  const talkBtn = $("talkBtn");
  const indicator = $("talkIndicator");
  const micBtn = $("micBtn");
  if (!talkBtn) return;

  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) {
    talkBtn.disabled = true;
    talkBtn.title = "TALK works in Chrome or Edge";
    return;
  }

  // Chrome's speech recognition sends the audio to Google to turn into text;
  // the owner should know that before switching it on.
  talkBtn.title = "Hands-free conversation. Chrome sends the audio to Google to turn it into text.";

  // Remembered so an accepted reply can be stored against the right question;
  // a reply that is interrupted is never shown, so it is never stored.
  let pendingUserText = "";

  const labels = { listening: "LISTENING", thinking: "THINKING", speaking: "SPEAKING" };

  function paint(state) {
    const on = state !== "off";
    talkBtn.textContent = on ? "STOP TALKING" : "TALK";
    talkBtn.classList.toggle("on", on);
    indicator.hidden = !on;
    indicator.className = "talk-indicator" + (on ? " state-" + state : "");
    indicator.textContent = on ? labels[state] || "" : "";
    // Never two recognisers at once: the old mic button is disabled while
    // TALK owns the microphone, and handed back the moment TALK stops.
    if (micBtn) micBtn.disabled = on;
  }

  const controller = createTalkController({
    makeRecognition: () => new SpeechRecognitionCtor(),
    speak: (text, handlers) => speak(text, handlers),
    cancelSpeech: () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    send: async (text) => {
      const res = await apiPost("/api/chat", { message: text, history: chatHistory });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail || "request failed (" + res.status + ")");
      }
      const body = await res.json();
      return body.data.reply;
    },
    now: () => Date.now(),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (h) => window.clearTimeout(h),
    isMuted: () => voiceMuted,
    onState: (state) => paint(state),
    onStatus: (message) => setChatStatus(message),
    onUserText: (text) => {
      pendingUserText = text;
      appendChatMessage("user", text);
      setChatStatus("");
    },
    onReply: (text) => {
      appendChatMessage("assistant", text);
      chatHistory.push({ role: "user", content: pendingUserText });
      chatHistory.push({ role: "assistant", content: text });
    },
  });

  talkBtn.addEventListener("click", () => {
    if (controller.getState() === "off") controller.start();
    else controller.stop();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") controller.stop();
  });
  window.addEventListener("pagehide", () => controller.stop());

  paint("off");
}

function initChatPanel() {
  initVoiceOutput();
  initVoiceInput();
  initTalk();

  $("chatForm").addEventListener("submit", (e) => {
    e.preventDefault();
    sendChatMessage();
  });
  $("muteBtn").addEventListener("click", toggleMute);
}

/* ------------------------------------------------------------------ */
/* Boot                                                                 */
/* ------------------------------------------------------------------ */

runBootSequence();
addCorners();
initGraphToggle();
initChatPanel();
initClimb3d();
loadBriefing();
loadPendingProposals();
updateClock();
setInterval(updateClock, 1000);
/* ---------------------- Privacy Receipts ledger (hybrid-v2) ---------------------- */
/* One row per AI request, newest first, read from the frozen receipts in
   telemetry.js. Every number is measured or absent - never estimated. For a
   request that went to the cloud, "What left this browser" shows the request
   body this page's own fetch() really sent, captured at the network call. */
const RECEIPT_ROUTE_LABEL = {
  "on-device-nano": ["On-device (Gemini Nano)", "local"],
  "cloud-sealed-chat": ["Cloud chat (sealed)", "cloud"],
  "cloud-blindfold": ["Cloud planner (blindfold)", "cloud"],
  "local-fallback": ["Fallback on this device", "local"],
  "local-deterministic": ["Offline plan (no AI)", "local"],
};
const RECEIPT_STATUS = {
  completed: ["completed", "ok"], fallback: ["fell back", "warn"], timed_out: ["timed out", "bad"],
  blocked_egress: ["blocked before sending", "warn"], rejected: ["rejected", "bad"], failed: ["failed", "bad"],
};

function receiptTextParts(body) {
  /* The text the model actually reads: every text part (and tool reply) in the
     request JSON, in order. */
  try {
    const j = JSON.parse(body);
    const out = [];
    (j.contents || []).forEach((c) => (c.parts || []).forEach((p) => {
      if (typeof p.text === "string") out.push("[" + (c.role || "user") + "] " + p.text);
      else if (p.functionResponse) out.push("[tool reply " + p.functionResponse.name + "] " + JSON.stringify(p.functionResponse.response));
      else if (p.functionCall) out.push("[model asked for tool " + p.functionCall.name + "]");
    }));
    return out.join("\n\n");
  } catch (e) { return null; }
}

function fillReceiptEvidence(det, receipt) {
  const hy = window.AionHybrid;
  const ev = hy && hy.telemetry && hy.telemetry.evidenceFor ? hy.telemetry.evidenceFor(receipt) : [];
  const box = det.querySelector(".receipt-evidence");
  if (!ev.length) {
    box.textContent = "No captured network request matched this receipt's time window, so nothing is shown rather than a guess.";
    return;
  }
  box.innerHTML = ev.map((o, i) => {
    const text = receiptTextParts(o.body);
    return `<div class="row-sub">Request ${i + 1} of ${ev.length} · full request ${o.bytes.toLocaleString()} characters (content plus model settings and tool list) · ${escapeHtml(o.url.replace(/^https:\/\//, ""))}</div>` +
      `<pre class="receipt-sent-text">${escapeHtml((text === null ? o.body : text).slice(0, 6000))}</pre>`;
  }).join("");
}

/* Receipts from earlier visits: kept in this browser (localStorage, max 200),
   without any request text - receipts never hold message content, and the
   "What left this browser" bodies stay in memory for the open tab only.
   The user can clear them at any time. */
const RECEIPT_HISTORY_KEY = "aion_receipts_history_v1";
const RECEIPT_SESSION = Math.random().toString(36).slice(2);
function receiptHistory() {
  try { const v = JSON.parse(localStorage.getItem(RECEIPT_HISTORY_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}
function rememberReceipt(r) {
  try {
    const h = receiptHistory();
    h.push(Object.assign({ session: RECEIPT_SESSION }, r));
    localStorage.setItem(RECEIPT_HISTORY_KEY, JSON.stringify(h.slice(-200)));
  } catch (e) { /* storage full or blocked: history is a convenience only */ }
}
function earlierReceipts() { return receiptHistory().filter((r) => r.session !== RECEIPT_SESSION); }
function renderEarlier() {
  const box = $("receiptsEarlier");
  if (!box) return;
  const old = earlierReceipts();
  if (!old.length) { box.innerHTML = ""; return; }
  const rows = old.slice(-8).reverse().map((r) => {
    const [label] = RECEIPT_ROUTE_LABEL[r.route] || [r.route];
    const [st] = RECEIPT_STATUS[r.status] || [r.status];
    const sent = r.egressAudit && r.egressAudit.disclosureTier === "approved_cloud" ? (r.egressAudit.bytesSent || 0).toLocaleString() + " characters of content sent" : "nothing sent to the cloud";
    return `<div class="receipt-meta">${escapeHtml(new Date(r.timestamp).toLocaleString())} · ${escapeHtml(label)} · ${escapeHtml(st)} · ${escapeHtml(sent)}</div>`;
  }).join("");
  box.innerHTML = `<details class="receipt-earlier"><summary>${old.length} receipt${old.length === 1 ? "" : "s"} from earlier visits (kept in this browser, no request text)</summary>${rows}` +
    `<button type="button" class="hud-btn" id="receiptsClearBtn">CLEAR HISTORY</button></details>`;
  $("receiptsClearBtn").addEventListener("click", () => {
    try { localStorage.setItem(RECEIPT_HISTORY_KEY, JSON.stringify(receiptHistory().filter((r) => r.session === RECEIPT_SESSION))); } catch (e) { /* ignore */ }
    renderEarlier();
  });
}

function renderReceipts() {
  const list = $("receiptsList"), sum = $("receiptsSummary");
  const hy = window.AionHybrid;
  renderEarlier();
  if (!list || !sum || !hy || !hy.telemetry) return;
  const all = hy.telemetry.getReceipts();
  if (!all.length) return;
  const t = hy.telemetry.summarizeTelemetry();
  const med = t.latency.medianMs;
  const failedN = (t.byStatus.failed || 0) + (t.byStatus.timed_out || 0) + (t.byStatus.rejected || 0);
  sum.innerHTML = `<b>${t.total}</b> request${t.total === 1 ? "" : "s"} · <b>${t.cloudRequests}</b> sent to the cloud ` +
    `(<b>${t.cloudBytesSent.toLocaleString()}</b> characters) · <b>${t.localOnly}</b> stayed on this device · ` +
    `<b>${t.blocked}</b> blocked before sending` +
    (failedN ? ` \u00B7 <b>${failedN}</b> failed or timed out` : "") +
    (med !== null ? ` · median <b>${med.toLocaleString()} ms</b> (measured)` : "") +
    (t.functionCalls ? ` · <b>${t.functionCalls}</b> local tool answer${t.functionCalls === 1 ? "" : "s"}` : "");
  /* Rebuild only when a receipt was added, so an open "What left" box stays open. */
  if (list.dataset.count === String(all.length)) return;
  list.dataset.count = String(all.length);
  list.innerHTML = "";
  all.slice(-12).reverse().forEach((r) => {
    const [label, kind0] = RECEIPT_ROUTE_LABEL[r.route] || [r.route, "local"];
    const tier = r.egressAudit.disclosureTier;
    const kind = tier === "blocked" ? "blocked" : kind0;
    const [stLabel, stTone] = RECEIPT_STATUS[r.status] || [r.status, ""];
    const bits = [new Date(r.timestamp).toLocaleTimeString()];
    bits.push(r.latencyMs === null ? "time not measured" : r.latencyMs.toLocaleString() + " ms");
    if (tier === "approved_cloud") bits.push(r.egressAudit.bytesSent.toLocaleString() + " characters of content sent · digest " + String(r.egressAudit.digest || "").slice(0, 8));
    else if (tier === "local_only") bits.push("nothing sent to the cloud");
    else bits.push("blocked before sending" + (r.egressAudit.blockedCode ? " (" + r.egressAudit.blockedCode + ")" : ""));
    if (r.functionCalls.length) bits.push("tools: " + r.functionCalls.map((c) => c.name).join(", "));
    if (r.egressAudit.privateValueHits) bits.push(r.egressAudit.privateValueHits + " private value caught");
    const row = document.createElement("div");
    row.className = "receipt-row";
    row.dataset.receiptId = r.receiptId;
    row.innerHTML =
      `<div class="receipt-top"><span class="receipt-route ${kind}">${escapeHtml(label)}</span>` +
      `<span class="receipt-status ${stTone}">${escapeHtml(stLabel)}</span></div>` +
      `<div class="receipt-meta">${escapeHtml(bits.join(" · "))}</div>` +
      (r.fallbackReason ? `<div class="receipt-meta">Why: ${escapeHtml(r.fallbackReason)}</div>` : "") +
      (r.errorCode && r.status !== "completed" && r.status !== "fallback" ? `<div class="receipt-meta">Error: ${escapeHtml(r.errorCode)}</div>` : "") +
      (tier === "approved_cloud" ? `<details><summary>What left this browser</summary><div class="receipt-evidence"></div></details>` : "");
    const det = row.querySelector("details");
    if (det) det.addEventListener("toggle", () => { if (det.open) fillReceiptEvidence(det, r); });
    list.appendChild(row);
  });
}

function exportReceiptsFile() {
  const hy = window.AionHybrid;
  if (!hy || !hy.telemetry || !hy.telemetry.exportReceipts) return;
  const live = JSON.parse(hy.telemetry.exportReceipts());
  live.earlierVisits = earlierReceipts().map((r) => { const c = Object.assign({}, r); delete c.session; return c; });
  const blob = new Blob([JSON.stringify(live, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "aion-receipts-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

window.addEventListener("aion:receipt", (ev) => { if (ev && ev.detail) rememberReceipt(ev.detail); renderReceipts(); refresh(); });
renderEarlier();

/* Settings: reset all demo data (two clicks, no browser dialog). */
(function wireReset() {
  const b = $("resetDemoBtn");
  if (!b) return;
  let armed = 0;
  b.addEventListener("click", () => {
    if (!window.AionStandalone || !window.AionStandalone.resetDemo) { setChatStatus("Reset is only available with the in-browser demo data."); return; }
    if (Date.now() - armed > 4000) { armed = Date.now(); b.textContent = "CLICK AGAIN TO RESET"; setTimeout(() => { if (Date.now() - armed >= 4000) b.textContent = "RESET"; }, 4100); return; }
    try { localStorage.removeItem(RECEIPT_HISTORY_KEY); localStorage.removeItem(TOUR_KEY); } catch (e) { /* ignore */ }
    b.textContent = "RESETTING…"; b.disabled = true;
    window.AionStandalone.resetDemo();
  });
})();

/* ---------------------------- two-minute tour ---------------------------- */
const TOUR_KEY = "aion_tour_hidden";
function tourSend(text) {
  location.hash = "#home";
  const input = $("chatInput");
  input.value = text;
  $("chatForm").requestSubmit ? $("chatForm").requestSubmit() : $("sendBtn").click();
}
(function wireTour() {
  const tour = $("tour");
  if (!tour) return;
  try { if (localStorage.getItem(TOUR_KEY) === "1") tour.hidden = true; } catch (e) { /* ignore */ }
  $("tourHide").addEventListener("click", () => { tour.hidden = true; try { localStorage.setItem(TOUR_KEY, "1"); } catch (e) { /* ignore */ } });
  tour.querySelectorAll("[data-tour]").forEach((b) => b.addEventListener("click", () => {
    const step = b.dataset.tour;
    if (step === "chat") tourSend("Summarize my tasks for today");
    else if (step === "plan") tourSend("/plan prepare my hackathon demo video");
    else if (step === "case") location.hash = "#case";
    else if (step === "proof") {
      location.hash = "#home";
      const card = $("receiptsCard");
      if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
      const det = document.querySelector("#receiptsList .receipt-row details");
      if (det) det.open = true;
      else setChatStatus("No cloud request yet in this visit: try step 1 first.");
    }
  }));
})();
if ($("receiptsExportBtn")) $("receiptsExportBtn").addEventListener("click", exportReceiptsFile);

refresh();
setInterval(refresh, POLL_MS);
setInterval(markStaleness, 1000);

/* T-036 - the three moments a phone comes back.
   Waiting for the next 5s tick after any of them is the difference
   between a dashboard that looks broken when you pick the phone up and
   one that does not. `online` fires on the switch itself; the other two
   cover the far commoner case where the browser suspended the timer
   while the screen was off and no `online` event was ever raised. */
window.addEventListener("online", refresh);
window.addEventListener("focus", refresh);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refresh();
});

