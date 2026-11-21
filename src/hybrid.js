/* AION Hybrid Web - Firebase AI Logic layer (#BuildHybridAI 2026).
 *
 * Bundled with esbuild into public/hybrid.bundle.js so the page needs no CDN
 * at runtime (important for the Offline Demo Mode: the bundle is cached by the
 * service worker and loads with no network).
 *
 * What this file does
 *   1. Initialises Firebase with the project config.
 *   2. Sets up Firebase App Check (reCAPTCHA v3 when a site key is configured,
 *      the App Check debug provider otherwise - see README).
 *   3. Creates the Firebase AI Logic client (Gemini Developer API backend) and
 *      routes each request with InferenceMode: on-device Gemini Nano first,
 *      cloud Gemini as the fallback - or either one only, user's choice.
 *   4. Drives the header bar: Nano readiness light, route dropdown, Offline
 *      Demo Mode switch, and the per-reply badge (source + latency).
 *
 * The on-device model is Chrome's built-in Gemini Nano (Prompt API). It needs
 * desktop Chrome 139+ and a one-time model download; where it is missing the
 * UI says so instead of pretending.
 */
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from "firebase/ai";

const firebaseConfig = {
  apiKey: "AIzaSyDHK53_j09cnCJfGhtdjleUBn654JJe2xM",
  authDomain: "aion-hybrid-ai.firebaseapp.com",
  projectId: "aion-hybrid-ai",
  storageBucket: "aion-hybrid-ai.firebasestorage.app",
  messagingSenderId: "55910897023",
  appId: "1:55910897023:web:cb220aba6e2da44f20f64a",
};

/* Paste a reCAPTCHA v3 site key here (Firebase console > App Check > Apps >
 * reCAPTCHA) to switch from the debug provider to real attestation. Site keys
 * are public by design. Leave empty for local/judge testing. */
const RECAPTCHA_SITE_KEY = "6LdmoCouAAAAAF9w5FhIjQOyP6q3VtKIm3aM3QeQ"; // public reCAPTCHA Enterprise site key

/* Cloud models, tried in order. `gemini-4-hydrogen` is listed as stable and
 * not billing-gated on Firebase's models page (checked 20 Nov 2026), so it
 * works on the free Spark plan; `gemini-3.5-flash-lite` is the backup. If the
 * first is rejected as unknown / unsupported, the next one is tried and BOTH
 * errors are shown to the user. Re-check https://firebase.google.com/docs/ai-logic/models
 * - model names change. */
const CLOUD_MODELS = ["gemini-4-hydrogen", "gemini-3.5-flash-lite"];

const MODE_KEY = "aion_hybrid_mode";
const OFFLINE_KEY = "aion_hybrid_offline_demo";
const APPCHECK_TOKEN_KEY = "aion_appcheck_debug_token";
const MODES = {
  prefer_on_device: InferenceMode.PREFER_ON_DEVICE,
  only_on_device: InferenceMode.ONLY_ON_DEVICE,
  prefer_in_cloud: InferenceMode.PREFER_IN_CLOUD,
};

/* Shared, read-only-ish state other scripts (standalone.js) look at. */
const state = (window.AionHybridState = {
  ready: false,
  mode: "prefer_on_device",
  nano: "checking", // checking | ready | downloadable | downloading | unavailable | unsupported
  nanoDetail: "",
  appCheck: { status: "off", detail: "" },
  offlineDemo: false,
  cloudModel: CLOUD_MODELS[0],
  debugToken: "",
});

const $ = (id) => document.getElementById(id);
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };

/* ---------------------------- Firebase + App Check ---------------------------- */

let app;
let ai = null;
try {
  app = initializeApp(firebaseConfig);
} catch (e) {
  console.error("[hybrid] Firebase init failed", e);
  state.appCheck = { status: "error", detail: "Firebase init failed: " + e.message };
}

if (app) {
  try {
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) ||
      new URLSearchParams(location.search).has("appcheck_debug");
    const useDebug = local || !RECAPTCHA_SITE_KEY;
    if (useDebug) {
      /* If you saved a debug token (SET TOKEN button), reuse exactly that one so
       * it matches what is registered in Firebase console > App Check > Manage
       * debug tokens. Otherwise the SDK makes one, keeps it in this browser's
       * IndexedDB, and prints it in the console (we also catch it for the
       * COPY TOKEN button). A new browser profile / origin makes a NEW token. */
      const saved = lsGet(APPCHECK_TOKEN_KEY);
      if (saved) {
        self.FIREBASE_APPCHECK_DEBUG_TOKEN = saved;
        state.debugToken = saved;
      } else {
        self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
        const origLog = console.log;
        const until = Date.now() + 8000;
        console.log = function (...args) {
          try {
            const m = String(args[0] || "").match(/App Check debug token:\s*([0-9a-fA-F-]{36})/);
            if (m) { state.debugToken = m[1]; renderBar(); }
          } catch (e) { /* never break logging */ }
          origLog.apply(console, args);
          if (Date.now() > until) console.log = origLog;
        };
      }
    }
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY || "recaptcha-site-key-not-configured"),
      isTokenAutoRefreshEnabled: true,
    });
    state.appCheck = useDebug
      ? { status: "debug", detail: "App Check debug provider. The debug token must be registered in Firebase console (App Check > Apps > Manage debug tokens)." }
      : { status: "recaptcha", detail: "App Check with reCAPTCHA Enterprise." };
  } catch (e) {
    console.error("[hybrid] App Check init failed", e);
    state.appCheck = { status: "error", detail: "App Check failed to start: " + e.message };
  }
  try {
    ai = getAI(app, { backend: new GoogleAIBackend() });
  } catch (e) {
    console.error("[hybrid] AI Logic init failed", e);
  }
}

/* ------------------------------ models per mode ------------------------------ */

const models = {};
function modelFor(modeKey, cloudModel) {
  if (!ai) throw new Error("Firebase AI Logic is not initialised.");
  const key = modeKey + "|" + (cloudModel || CLOUD_MODELS[0]);
  if (!models[key]) {
    models[key] = getGenerativeModel(ai, {
      mode: MODES[modeKey],
      inCloudParams: { model: cloudModel || CLOUD_MODELS[0] },
    });
  }
  return models[key];
}

/* One readable string out of whatever the SDK threw (AIError carries a code
 * and the HTTP details; plain errors only a message). */
function describeError(e) {
  const parts = [String((e && e.message) || e)];
  if (e && e.code) parts.push("code=" + e.code);
  const d = e && e.customErrorData;
  if (d) {
    if (d.status) parts.push("http=" + d.status + (d.statusText ? " " + d.statusText : ""));
    if (d.errorDetails) { try { parts.push("details=" + JSON.stringify(d.errorDetails).slice(0, 600)); } catch (x) { /* ignore */ } }
  }
  return parts.join(" | ");
}

/* ------------------------------ Gemini Nano light ------------------------------ */

const NANO_OPTS = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};

function chromeMajor() {
  const m = navigator.userAgent.match(/\bChrome\/(\d+)/);
  const isEdgeOrOpera = /\b(Edg|OPR)\//.test(navigator.userAgent);
  return m && !isEdgeOrOpera ? parseInt(m[1], 10) : null;
}

async function checkNano() {
  const major = chromeMajor();
  let next = "unsupported";
  let detail = "";
  if (typeof window.LanguageModel === "undefined") {
    if (major === null) detail = "Use desktop Chrome 139 or newer for on-device AI.";
    else if (major < 139) detail = "Chrome " + major + " is too old - on-device AI needs Chrome 139+.";
    else detail = "Chrome's Prompt API is off. See README (chrome://flags).";
  } else {
    try {
      const a = await window.LanguageModel.availability(NANO_OPTS);
      next = a === "available" ? "ready" : a === "downloadable" ? "downloadable"
        : a === "downloading" ? "downloading" : "unavailable";
      if (next === "unavailable") detail = "This device cannot run Gemini Nano (needs enough storage and a supported computer).";
    } catch (e) {
      next = "unavailable";
      detail = "Could not check Gemini Nano: " + e.message;
    }
  }
  // Keep a live download percentage if one is running.
  if (state.nano === "downloading" && next === "downloading" && state.nanoDetail.indexOf("%") >= 0) return;
  if (next !== state.nano || detail !== state.nanoDetail) {
    state.nano = next;
    state.nanoDetail = detail;
    renderBar();
  }
}

async function downloadNano() {
  if (state.nano !== "downloadable" && state.nano !== "downloading") return;
  state.nano = "downloading";
  state.nanoDetail = "0%";
  renderBar();
  try {
    // Must run from a click (user activation). initializeDeviceModel is the
    // SDK's wrapper around the Prompt API download.
    await modelFor("only_on_device").initializeDeviceModel((p) => {
      state.nanoDetail = Math.round(p * 100) + "%";
      renderBar();
    });
  } catch (e) {
    state.nanoDetail = "Download failed: " + e.message;
  }
  state.nanoDetail = "";
  await checkNano();
}

/* --------------------------------- generate --------------------------------- */

const SOURCE = { on_device: "on_device", in_cloud: "in_cloud" };

async function generate(prompt) {
  const modeKey = state.mode;
  const attempts = [];
  /* On-device-only never touches the cloud model, so there is nothing to retry. */
  const candidates = modeKey === "only_on_device" ? [CLOUD_MODELS[0]] : CLOUD_MODELS;
  for (let i = 0; i < candidates.length; i++) {
    const cloudModel = candidates[i];
    try {
      const model = modelFor(modeKey, cloudModel);
      const t0 = performance.now();
      const result = await model.generateContent(prompt);
      const latencyMs = Math.round(performance.now() - t0);
      const text = result.response.text();
      let source = result.response.inferenceSource;
      if (source !== SOURCE.on_device && source !== SOURCE.in_cloud) {
        // Older SDKs do not report it; infer conservatively.
        source = modeKey === "only_on_device" ? SOURCE.on_device
          : modeKey === "prefer_on_device" && state.nano === "ready" ? SOURCE.on_device : SOURCE.in_cloud;
      }
      if (source === SOURCE.in_cloud) state.cloudModel = cloudModel;
      return {
        text: text || "(The model returned an empty reply.)",
        source,
        latencyMs,
        mode: modeKey,
        model: source === SOURCE.on_device ? "Gemini Nano" : cloudModel,
      };
    } catch (e) {
      const msg = describeError(e);
      attempts.push(candidates.length > 1 ? cloudModel + ": " + msg : msg);
      /* Only move to the backup model when the failure looks model-specific.
       * App Check / quota / network problems would fail the same way again. */
      const modelProblem = /model|not found|404|unsupported|not supported|invalid argument|400/i.test(msg) &&
        !/app.?check|api.?key|permission|quota|network|failed to fetch/i.test(msg);
      if (!modelProblem || i === candidates.length - 1) {
        const err = new Error(attempts.join("\n"));
        err.code = e && e.code;
        throw err;
      }
    }
  }
}

/* ---------------------------------- header bar ---------------------------------- */

const NANO_LABEL = {
  checking: "Gemini Nano: checking…",
  ready: "Gemini Nano: ready",
  downloadable: "Gemini Nano: needs download",
  downloading: "Gemini Nano: downloading",
  unavailable: "Gemini Nano: unavailable",
  unsupported: "Gemini Nano: not supported here",
};
const NANO_TONE = { ready: "ok", downloading: "warn", downloadable: "warn", checking: "warn" };

function renderBar() {
  const pill = $("nanoPill");
  if (!pill) return;
  const tone = NANO_TONE[state.nano] || "bad";
  pill.className = "pill hy-nano hy-" + tone;
  pill.title = state.nanoDetail || NANO_LABEL[state.nano];
  let label = NANO_LABEL[state.nano];
  if (state.nano === "downloading" && state.nanoDetail) label += " " + state.nanoDetail;
  $("nanoLabel").textContent = label;
  const btn = $("nanoDownloadBtn");
  btn.hidden = state.nano !== "downloadable";
  const hint = $("nanoHint");
  if (hint) hint.textContent = state.nano === "ready" || state.nano === "checking" || state.nano === "downloading" ? "" : state.nanoDetail;
  const off = $("offlineDemo");
  if (off) off.checked = state.offlineDemo;
  const sel = $("inferenceMode");
  if (sel) { sel.value = state.mode; sel.disabled = state.offlineDemo; }
  const acPill = $("appCheckPill");
  if (acPill) {
    const ok = state.appCheck.status === "recaptcha" || state.appCheck.status === "debug";
    acPill.className = "pill hy-" + (ok ? (state.appCheck.status === "debug" ? "warn" : "ok") : "bad");
    $("appCheckLabel").textContent = "App Check: " + state.appCheck.status;
    acPill.title = state.appCheck.detail;
  }
  const copyBtn = $("appCheckCopyBtn");
  if (copyBtn) copyBtn.hidden = !(state.appCheck.status === "debug" && state.debugToken);
  const setBtn = $("appCheckSetBtn");
  if (setBtn) setBtn.hidden = state.appCheck.status !== "debug";
}

function renderBackendPill(mode) {
  const el = $("backendLabel");
  if (!el) return;
  el.textContent = mode === "live" ? "Local AION backend" : "Standalone demo data";
  $("backendPill").title = mode === "live"
    ? "A local AION server answered; chat goes through it, not through Firebase."
    : "No backend connected - memories, tasks and approvals live in this browser (IndexedDB).";
}

function setMode(modeKey) {
  if (!MODES[modeKey]) return;
  state.mode = modeKey;
  lsSet(MODE_KEY, modeKey);
  renderBar();
}

function setOfflineDemo(on) {
  state.offlineDemo = !!on;
  window.AION_OFFLINE_DEMO = !!on;
  lsSet(OFFLINE_KEY, on ? "1" : "0");
  if (on) {
    // Pure on-device inference: remember the route the user had, force the
    // strict one, and the fetch wrapper in standalone.js blocks every
    // cross-origin request from this page.
    state.modeBeforeOffline = state.mode;
    state.mode = "only_on_device";
  } else if (state.modeBeforeOffline) {
    state.mode = state.modeBeforeOffline;
    state.modeBeforeOffline = null;
  } else {
    state.mode = lsGet(MODE_KEY) && MODES[lsGet(MODE_KEY)] ? lsGet(MODE_KEY) : "prefer_on_device";
  }
  document.body.classList.toggle("offline-demo", !!on);
  const note = $("offlineNote");
  if (note) {
    note.hidden = !on;
    note.textContent = "Offline Demo Mode: this page blocks all external network calls and answers only with on-device Gemini Nano. Turn on airplane mode as well to prove it.";
  }
  renderBar();
}

function wireBar() {
  const sel = $("inferenceMode");
  if (!sel) return;
  sel.addEventListener("change", () => setMode(sel.value));
  $("offlineDemo").addEventListener("change", (e) => setOfflineDemo(e.target.checked));
  $("nanoDownloadBtn").addEventListener("click", downloadNano);
  const copyBtn = $("appCheckCopyBtn");
  if (copyBtn) copyBtn.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(state.debugToken); copyBtn.textContent = "COPIED"; }
    catch (e) { window.prompt("Copy this debug token:", state.debugToken); }
    setTimeout(() => { copyBtn.textContent = "COPY TOKEN"; }, 1800);
  });
  const setBtn = $("appCheckSetBtn");
  if (setBtn) setBtn.addEventListener("click", () => {
    const v = window.prompt(
      "Paste the App Check debug token that is registered in Firebase console (leave empty to forget the saved one). The page reloads to use it.",
      lsGet(APPCHECK_TOKEN_KEY) || "");
    if (v === null) return;
    const t = v.trim();
    if (t && !/^[0-9a-fA-F-]{36}$/.test(t)) { window.alert("That does not look like a debug token (36 characters, letters, digits and dashes)."); return; }
    try { if (t) localStorage.setItem(APPCHECK_TOKEN_KEY, t); else localStorage.removeItem(APPCHECK_TOKEN_KEY); } catch (e) { /* private mode */ }
    location.reload();
  });
  window.addEventListener("online", checkNano);
  window.addEventListener("offline", checkNano);
  window.addEventListener("aion:backend-mode", (e) => renderBackendPill(e.detail));
  if (window.AionBackendMode) renderBackendPill(window.AionBackendMode);
  else if (window.AionStandalone) window.AionStandalone.detectMode().then(renderBackendPill);
}

/* --------------------------------- boot --------------------------------- */

function boot() {
  const saved = lsGet(MODE_KEY);
  state.mode = saved && MODES[saved] ? saved : "prefer_on_device";
  wireBar();
  if (lsGet(OFFLINE_KEY) === "1") setOfflineDemo(true);
  renderBar();
  checkNano();
  setInterval(checkNano, 6000);
  state.ready = !!ai;

  window.AionHybrid = {
    generate,
    getMode: () => state.mode,
    setMode,
    setOfflineDemo,
    downloadNano,
    state,
    modes: Object.keys(MODES),
  };
  if (window.__resolveAionHybrid) window.__resolveAionHybrid(window.AionHybrid);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
