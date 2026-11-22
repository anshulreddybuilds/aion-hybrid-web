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
import { initializeAppCheck, getToken, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from "firebase/ai";
import * as egress from "./egress.js";
import * as contracts from "./contracts.js";
import * as telemetry from "./telemetry.js";
import { createRouter } from "./router.js";
import { createPlanner } from "./planner.js";

/* Record every request body sent to the Firebase AI endpoint (memory only),
 * installed before the SDK makes any call. Used by the leak test. */
egress.installOutboundMonitor();

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
/* Order matters. Measured on the live site (21 Nov 2026), same prompt, same
 * App Check token: gemini-3.5-flash-lite answers in ~1 s; gemini-4-hydrogen took
 * ~125 s to its first byte even for "Say hi in 3 words". So the fast model is
 * first and hydrogen is only the backup. */
const CLOUD_MODELS = ["gemini-3.5-flash-lite", "gemini-4-hydrogen"];

const MODE_KEY = "aion_hybrid_mode";
const OFFLINE_KEY = "aion_hybrid_offline_demo";
/* Default route: cloud first, so visitors on ordinary laptops get a fast reply
 * instead of slow local CPU inference. The other two routes stay selectable. */
const DEFAULT_MODE = "prefer_in_cloud";
const APPCHECK_TOKEN_KEY = "aion_appcheck_debug_token";
const MODES = {
  prefer_on_device: InferenceMode.PREFER_ON_DEVICE,
  only_on_device: InferenceMode.ONLY_ON_DEVICE,
  prefer_in_cloud: InferenceMode.PREFER_IN_CLOUD,
  /* Not in the dropdown: used by flows that must run in the cloud and must
   * never fall back to the device (case research, Packet 2+). */
  only_in_cloud: InferenceMode.ONLY_IN_CLOUD,
};

/* Shared, read-only-ish state other scripts (standalone.js) look at. */
const state = (window.AionHybridState = {
  ready: false,
  mode: DEFAULT_MODE,
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

/* Where App Check's DEBUG provider may run (Day-1 hardening, hybrid-v2).
 *   - Production hosts: NEVER. No URL flag, saved token or missing key can turn
 *     it on there; production always uses reCAPTCHA Enterprise.
 *   - localhost / 127.0.0.1 / [::1]: always (developer machines, smoke test).
 *   - Firebase preview channels (aion-hybrid-ai--<channel>.web.app) and any
 *     other host: only when the page is opened with ?appcheck_debug.
 * A debug token still has to be registered in the Firebase console to work. */
const PROD_HOSTS = ["aion-hybrid-ai.web.app", "aion-hybrid-ai.firebaseapp.com"];
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];
function appCheckDebugAllowed() {
  const host = location.hostname;
  if (PROD_HOSTS.includes(host)) return false;
  if (LOCAL_HOSTS.includes(host)) return true;
  return new URLSearchParams(location.search).has("appcheck_debug") || !RECAPTCHA_SITE_KEY;
}
state.isProductionHost = PROD_HOSTS.includes(location.hostname);

if (app) {
  try {
    const useDebug = appCheckDebugAllowed();
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
    const appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY || "recaptcha-site-key-not-configured"),
      isTokenAutoRefreshEnabled: true,
    });
    /* Warm-up: fetch the App Check token in the background right now, so the
     * reCAPTCHA step is already done (and cached) by the time the first chat
     * message is sent. Never blocks rendering; failures surface on the real call. */
    if (!window.AION_OFFLINE_DEMO && lsGet(OFFLINE_KEY) !== "1") {
      const t0 = performance.now();
      state.appCheckWarm = "warming";
      getToken(appCheck, false).then(
        (r) => {
          if (r && r.error) { state.appCheckWarm = "failed"; console.warn("[hybrid] App Check warm-up failed:", r.error && r.error.message); return; }
          state.appCheckWarm = "ready"; state.appCheckWarmMs = Math.round(performance.now() - t0);
        },
        (e) => { state.appCheckWarm = "failed"; console.warn("[hybrid] App Check warm-up failed:", e && e.message); }
      );
    }
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

/* ------------------------------ receipt evidence ------------------------------ */
/* The privacy ledger's proof: the request bodies the page's own fetch() really
 * sent to the Gemini endpoint while a receipt's request was running (captured by
 * the outbound monitor in egress.js). Shown to the user on request; never stored
 * in the frozen receipt and never sent anywhere. Only receipts whose payload was
 * cleared for the cloud can have any. */
function evidenceFor(receipt) {
  if (!receipt || !receipt.egressAudit || receipt.egressAudit.disclosureTier !== contracts.DISCLOSURE_TIERS.APPROVED_CLOUD) return [];
  const end = Date.parse(receipt.timestamp);
  return egress.outboundForDigest(receipt.egressAudit.digest, isFinite(end) ? end : Date.now())
    .map((o) => ({ at: new Date(o.at).toISOString(), url: o.url, bytes: o.bytes, body: o.body }));
}

/* A JSON export of the receipts. Receipts hold no message text by design
 * (route, timings, counts, digests, tool names), so this is safe to share. */
function exportReceipts() {
  return JSON.stringify({ exportedAt: new Date().toISOString(), app: "AION Hybrid Web", summary: telemetry.summarizeTelemetry(),
    receipts: telemetry.getReceipts() }, null, 2);
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

/* Watchdogs (Day-1, hybrid-v2). A cloud call must start answering within
 * CLOUD_TIMEOUT_MS and must not go silent for longer than that between chunks;
 * otherwise the request is aborted and a clear error is shown. This is what
 * stops gemini-4-hydrogen (measured ~125 s to first byte) from hanging the UI.
 * On-device Gemini Nano gets a longer budget: on 8 GB machines a legitimate
 * local reply takes 60-80 s, and killing it at 15 s would break that path. */
const CLOUD_TIMEOUT_MS = 15000;
const LOCAL_TIMEOUT_MS = 120000;

/* Where we expect this request to run, decided BEFORE the call. Used only to
 * pick the right watchdog; the badge always uses what the SDK reports. */
function expectedSource(modeKey) {
  if (modeKey === "only_on_device") return SOURCE.on_device;
  if (modeKey === "prefer_on_device") return state.nano === "ready" ? SOURCE.on_device : SOURCE.in_cloud;
  if (modeKey === "only_in_cloud") return SOURCE.in_cloud;
  return navigator.onLine === false ? SOURCE.on_device : SOURCE.in_cloud;
}

class InferenceTimeoutError extends Error {
  constructor(message) { super(message); this.name = "InferenceTimeoutError"; this.code = "timeout"; }
}

/* Runs one streaming call with a first-chunk + idle watchdog. Late chunks that
 * arrive after the timeout are ignored (never shown, never returned). */
function streamWithWatchdog(model, prompt, onChunk, limitMs, label) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  let settled = false;
  return new Promise((resolve, reject) => {
    let timer = null;
    const arm = (phase) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { if (controller) controller.abort(); } catch (e) { /* ignore */ }
        reject(new InferenceTimeoutError(label + " did not " + phase + " within " +
          Math.round(limitMs / 1000) + " s - stopped waiting (timeout). Nothing was retried automatically."));
      }, limitMs);
    };
    const t0 = performance.now();
    arm("start answering");
    (async () => {
      const streamed = await model.generateContentStream(prompt, controller ? { signal: controller.signal } : undefined);
      let soFar = "";
      let firstChunkMs = null;
      for await (const chunk of streamed.stream) {
        if (settled) return;
        let piece = "";
        try { piece = chunk.text(); } catch (e) { piece = ""; }
        arm("send more text");
        if (!piece) continue;
        if (firstChunkMs === null) firstChunkMs = Math.round(performance.now() - t0);
        soFar += piece;
        if (typeof onChunk === "function") { try { onChunk(soFar); } catch (e) { /* UI errors must not break the reply */ } }
      }
      const response = await streamed.response;
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ response, soFar, firstChunkMs, latencyMs: Math.round(performance.now() - t0) });
    })().catch((e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(e);
    });
  });
}

/* opts (hybrid-v2):
 *   mode       - the route the caller prepared for. Used instead of the
 *                current dropdown value, so the route cannot change mid-request.
 *   disclosure - REQUIRED on every route that can reach the cloud. Must be an
 *                approved, unchanged, unused Disclosure (see egress.js). The
 *                cloud text is built here from its allowlisted fields; the
 *                `prompt` argument is ignored on those routes.
 *   currentInputRevision - for case disclosures: the case revision right now.
 * Only On-Device takes a plain prompt: nothing leaves this browser there. */
function refused(code, why) {
  const err = new Error("Refused: " + why + " Nothing was sent.");
  err.code = code || "unsealed_refused";
  return err;
}

async function generate(prompt, onChunk, opts) {
  const modeKey = opts && MODES[opts.mode] ? opts.mode : state.mode;
  let disclosure = null;
  if (modeKey !== "only_on_device") {
    disclosure = opts && opts.disclosure;
    if (!disclosure) {
      throw refused("unsealed_refused", "the route (" + modeKey.replace(/_/g, " ") +
        ") can reach the cloud, and cloud requests accept only an approved disclosure, never a raw prompt.");
    }
    const v = await egress.verify(disclosure, { currentInputRevision: opts.currentInputRevision });
    if (!v.ok) throw refused(v.code, "the disclosure is not valid to send: " + v.reason + ".");
    const text = egress.serialize(disclosure);
    const hits = egress.scanPrivate(text);
    if (hits.length) {
      const kinds = Array.from(new Set(hits.map((h) => h.kind))).join(", ");
      throw refused("private_value_blocked", "the outbound text contains values registered as private (" + kinds + ").");
    }
    egress.markSent(disclosure, { route: modeKey, bytes: text.length });
    prompt = text;
  }
  const attempts = [];
  /* On-device-only never touches the cloud model, so there is nothing to retry. */
  const candidates = modeKey === "only_on_device" ? [CLOUD_MODELS[0]] : CLOUD_MODELS;
  const expected = expectedSource(modeKey);
  for (let i = 0; i < candidates.length; i++) {
    const cloudModel = candidates[i];
    try {
      const model = modelFor(modeKey, cloudModel);
      const limitMs = expected === SOURCE.on_device ? LOCAL_TIMEOUT_MS : CLOUD_TIMEOUT_MS;
      const label = expected === SOURCE.on_device ? "On-device Gemini Nano" : "Cloud model " + cloudModel;
      /* Stream so text can appear as it is produced. onChunk(textSoFar) is
       * optional; without it this behaves like a normal generateContent. */
      const run = await streamWithWatchdog(model, prompt, onChunk, limitMs, label);
      const text = run.soFar || run.response.text();
      /* Telemetry split: what was asked for, what actually ran, and whether the
       * SDK itself reported it (source_verified) or we had to infer it. */
      let source = run.response.inferenceSource;
      const sourceVerified = source === SOURCE.on_device || source === SOURCE.in_cloud;
      if (!sourceVerified) {
        // Older SDKs do not report it; infer conservatively.
        source = modeKey === "only_on_device" ? SOURCE.on_device
          : modeKey === "prefer_on_device" && state.nano === "ready" ? SOURCE.on_device : SOURCE.in_cloud;
      }
      if (source === SOURCE.in_cloud) state.cloudModel = cloudModel;
      return {
        text: text || "(The model returned an empty reply.)",
        source,
        latencyMs: run.latencyMs,
        firstChunkMs: run.firstChunkMs,
        mode: modeKey,
        requested_mode: modeKey,
        disclosure: disclosure ? { requestId: disclosure.requestId, digest: disclosure.contentDigest,
          purpose: disclosure.purpose, bytes: prompt.length } : null,
        actual_source: source,
        source_verified: sourceVerified,
        model: source === SOURCE.on_device ? "Gemini Nano" : cloudModel,
      };
    } catch (e) {
      if (e && e.name === "InferenceTimeoutError") {
        attempts.push(candidates.length > 1 ? cloudModel + ": " + e.message : e.message);
        const err = new Error(attempts.join("\n"));
        err.code = "timeout";
        throw err;
      }
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

/* ------------------------- planner model access ------------------------- */
/* The Blindfold Planner needs generateContent with tools / a response schema,
 * which the streaming text path above does not offer. Cloud only; the planner
 * itself enforces the egress boundary and the 15 s budget before it gets here. */
async function plannerCloudCall(req) {
  if (!ai) throw new Error("Firebase AI Logic is not initialised.");
  const attempts = [];
  for (let i = 0; i < CLOUD_MODELS.length; i++) {
    const cloudModel = CLOUD_MODELS[i];
    try {
      const inCloudParams = { model: cloudModel };
      if (req.tools) inCloudParams.tools = req.tools;
      if (req.generationConfig) inCloudParams.generationConfig = req.generationConfig;
      const model = getGenerativeModel(ai, { mode: MODES.only_in_cloud, inCloudParams });
      const result = await model.generateContent({ contents: req.contents }, req.signal ? { signal: req.signal } : undefined);
      if (result.response && result.response.inferenceSource === SOURCE.on_device) {
        throw new Error("Planner request ran on-device although it was meant for the cloud.");
      }
      state.cloudModel = cloudModel;
      return { response: result.response, model: cloudModel };
    } catch (e) {
      const msg = describeError(e);
      attempts.push(cloudModel + ": " + msg);
      const modelProblem = /model|not found|404|unsupported|not supported|invalid argument|400/i.test(msg) &&
        !/app.?check|api.?key|permission|quota|network|failed to fetch/i.test(msg);
      if (!modelProblem || i === CLOUD_MODELS.length - 1) {
        const err = new Error(attempts.join("\n"));
        err.code = e && e.code;
        throw err;
      }
    }
  }
}

/* Gemini Nano with a JSON response constraint (on-device plan fallback). */
async function plannerLocalCall(prompt, jsonSchema) {
  if (!ai) throw new Error("Firebase AI Logic is not initialised.");
  const model = getGenerativeModel(ai, {
    mode: MODES.only_on_device,
    onDeviceParams: { promptOptions: { responseConstraint: jsonSchema } },
    inCloudParams: { model: CLOUD_MODELS[0] },
  });
  const run = model.generateContent(prompt);
  const stop = new Promise((_, reject) => setTimeout(() => {
    const e = new Error("On-device Gemini Nano did not finish the plan within " + Math.round(LOCAL_TIMEOUT_MS / 1000) + " s (timeout).");
    e.code = "timeout"; reject(e);
  }, LOCAL_TIMEOUT_MS));
  const result = await Promise.race([run, stop]);
  return { text: result.response.text(), model: "Gemini Nano" };
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
    state.mode = lsGet(MODE_KEY) && MODES[lsGet(MODE_KEY)] ? lsGet(MODE_KEY) : DEFAULT_MODE;
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
  state.mode = saved && MODES[saved] ? saved : DEFAULT_MODE;
  wireBar();
  if (lsGet(OFFLINE_KEY) === "1") setOfflineDemo(true);
  renderBar();
  checkNano();
  setInterval(checkNano, 6000);
  state.ready = !!ai;

  /* Receipts: every model attempt, appended in telemetry.js. The UI hears
   * about each one through the "aion:receipt" event. */
  telemetry.onReceipt((receipt) => {
    try { window.dispatchEvent(new CustomEvent("aion:receipt", { detail: receipt })); } catch (e) { /* UI only */ }
  });
  const router = createRouter({ generate, egress, recordReceipt: telemetry.recordReceipt, getState: () => state });
  const planner = createPlanner({ cloudCall: plannerCloudCall, localCall: plannerLocalCall, egress,
    recordReceipt: telemetry.recordReceipt, getState: () => state });

  window.AionHybrid = {
    generate,
    router,
    planner,
    telemetry: { getReceipts: telemetry.getReceipts, summarizeTelemetry: telemetry.summarizeTelemetry, onReceipt: telemetry.onReceipt,
      evidenceFor, exportReceipts },
    getMode: () => state.mode,
    setMode,
    setOfflineDemo,
    downloadNano,
    state,
    modes: Object.keys(MODES),
    /* true when a request in this mode can be sent to the cloud. Callers MUST
     * seal private context whenever this is true (PREFER_* modes may go either
     * way, so they count as cloud-reachable). */
    mayReachCloud: (modeKey) => (modeKey || state.mode) !== "only_on_device",
    /* The disclosure boundary (Packet 2). */
    egress: {
      createDisclosure: egress.createDisclosure, approve: egress.approve, verify: egress.verify,
      isApproved: egress.isApproved, serialize: egress.serialize, sha256Hex: egress.sha256Hex,
      setPrivate: egress.setPrivate, clearPrivate: egress.clearPrivate, privateCounts: egress.privateCounts,
      scanPrivate: egress.scanPrivate, outboundSince: egress.outboundSince, log: egress.egressLog,
    },
    contracts: { PURPOSES: contracts.PURPOSES, validatePayload: contracts.validatePayload,
      validateCase: contracts.validateCase, PROPOSAL_OPERATIONS: contracts.PROPOSAL_OPERATIONS,
      validatePlan: contracts.validatePlan, DISCLOSURE_TIERS: contracts.DISCLOSURE_TIERS,
      RECEIPT_SCHEMA_VERSION: contracts.RECEIPT_SCHEMA_VERSION, PLAN_STEP_SCHEMA_VERSION: contracts.PLAN_STEP_SCHEMA_VERSION },
    timeouts: { cloudMs: CLOUD_TIMEOUT_MS, localMs: LOCAL_TIMEOUT_MS },
  };
  if (window.__resolveAionHybrid) window.__resolveAionHybrid(window.AionHybrid);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
