/* AION Hybrid Web - honest execution receipts (hybrid-v2).
 *
 * One receipt per model attempt: what route was asked for, what actually ran,
 * how long it really took (measured with performance.now() by the caller), what
 * left the browser, which local tools the cloud asked for, and who approved.
 *
 * Honesty rules, enforced here and not left to callers:
 *   - Append-only: receipts are deep-frozen and there is no edit or delete.
 *   - A number the browser could not measure is null, never a guess. Hardware
 *     use is reported as "unavailable" (browsers do not expose it) and a
 *     "percent local" figure is never produced - only counts of what happened.
 *   - functionCalls keep the tool NAME and duration only, never arguments or
 *     results, so a receipt can be shown or exported without leaking data.
 *   - Memory only. Nothing is stored or sent anywhere.
 */
import { RECEIPT_SCHEMA_VERSION, RECEIPT_ROUTES, RECEIPT_STATUSES, DISCLOSURE_TIERS } from "./contracts.js";

const MAX_RECEIPTS = 200;
const receipts = [];
const listeners = new Set();

const APPROVAL_STATES = ["not-applicable", "pending", "approved", "rejected"];
const TIERS = Object.values(DISCLOSURE_TIERS);

function uid() {
  try { return crypto.randomUUID(); } catch (e) { return "r-" + Date.now() + "-" + Math.random().toString(16).slice(2); }
}

function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    Object.keys(o).forEach((k) => deepFreeze(o[k]));
  }
  return o;
}

/* A measured number, or null. Never NaN, negative or invented. */
function measured(v) {
  return typeof v === "number" && isFinite(v) && v >= 0 ? Math.round(v) : null;
}

function tel(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/** Records one receipt and returns the frozen copy.
 * @param {Object} r
 * @param {string} r.route        one of RECEIPT_ROUTES
 * @param {string} r.status       one of RECEIPT_STATUSES
 * @param {string} [r.model]
 * @param {string} [r.requestedMode]
 * @param {number} [r.latencyMs]      total time, measured by the caller
 * @param {number} [r.firstChunkMs]   time to first text, if the call streamed
 * @param {Object} [r.egress]         { tier, purpose, digest, bytes, fields, privateValueHits, blockedCode }
 * @param {{name: string, durationMs: number}[]} [r.functionCalls]
 * @param {string} [r.approvalState]
 * @param {string} [r.fallbackReason]
 * @param {string} [r.errorCode]
 * @param {Object} [r.contributors]
 */
export function recordReceipt(r) {
  if (!r || typeof r !== "object") throw tel("receipt_invalid", "A receipt needs an object.");
  if (!RECEIPT_ROUTES.includes(r.route)) throw tel("receipt_invalid", "Unknown route \"" + r.route + "\".");
  if (!RECEIPT_STATUSES.includes(r.status)) throw tel("receipt_invalid", "Unknown status \"" + r.status + "\".");
  const approval = r.approvalState == null ? "not-applicable" : r.approvalState;
  if (!APPROVAL_STATES.includes(approval)) throw tel("receipt_invalid", "Unknown approval state \"" + approval + "\".");
  const eg = r.egress || {};
  const tier = eg.tier || (r.route === "on-device-nano" || r.route === "local-fallback" || r.route === "local-deterministic"
    ? DISCLOSURE_TIERS.LOCAL_ONLY : DISCLOSURE_TIERS.APPROVED_CLOUD);
  if (!TIERS.includes(tier)) throw tel("receipt_invalid", "Unknown disclosure tier \"" + tier + "\".");
  /* Sent semantics: approved / attempted / body-observed are separate facts.
   * eg.bodyObserved is true or false only when the caller checked the outbound
   * monitor; otherwise it stays null ("not checked") and bytesSent keeps its
   * old meaning (characters handed to the SDK). */
  const checked = typeof eg.bodyObserved === "boolean";
  const isCloud = tier === DISCLOSURE_TIERS.APPROVED_CLOUD;
  const observedChars = isCloud && checked ? (eg.bodyObserved ? measured(eg.observedChars) : 0) : null;
  const attemptedChars = isCloud ? measured(eg.attemptedChars != null ? eg.attemptedChars : eg.bytes) : 0;
  const sendState = !isCloud ? (tier === DISCLOSURE_TIERS.BLOCKED ? "not_attempted" : "not_applicable")
    : !checked ? "attempted_unchecked" : eg.bodyObserved ? "body_observed" : "attempted_no_body_observed";
  const calls = (Array.isArray(r.functionCalls) ? r.functionCalls : []).map((c) => ({
    name: String((c && c.name) || "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 40),
    durationMs: measured(c && c.durationMs),
  })).filter((c) => c.name);
  const receipt = deepFreeze({
    receiptId: uid(),
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
    route: r.route,
    status: r.status,
    model: r.model ? String(r.model).slice(0, 60) : null,
    requestedMode: r.requestedMode ? String(r.requestedMode) : null,
    latencyMs: measured(r.latencyMs),
    firstChunkMs: measured(r.firstChunkMs),
    egressAudit: {
      disclosureTier: tier,
      purpose: eg.purpose || null,
      digest: eg.digest ? String(eg.digest).slice(0, 12) : null,
      bytesSent: !isCloud ? 0 : checked ? observedChars : measured(eg.bytes),
      /* New (additive): what was handed to the SDK vs what a monitored request body showed. */
      sendState,
      bodyObserved: isCloud && checked ? !!eg.bodyObserved : null,
      observedChars,
      attemptedChars,
      sendNote: sendState === "attempted_no_body_observed" ? "attempted; no outgoing body observed" : null,
      fieldsSent: Array.isArray(eg.fields) ? eg.fields.map(String).slice(0, 12) : [],
      privateValueHits: measured(eg.privateValueHits) || 0,
      blockedCode: eg.blockedCode ? String(eg.blockedCode) : null,
    },
    functionCalls: calls,
    approvalState: approval,
    fallbackReason: r.fallbackReason ? String(r.fallbackReason).slice(0, 200) : null,
    errorCode: r.errorCode ? String(r.errorCode).slice(0, 60) : null,
    contributors: r.contributors ? {
      local_deterministic: !!r.contributors.local_deterministic, local_ai: !!r.contributors.local_ai,
      cloud_ai: !!r.contributors.cloud_ai, human_confirmed: !!r.contributors.human_confirmed,
    } : null,
    hardware: "unavailable",   // browsers do not expose CPU / RAM / GPU use
  });
  receipts.push(receipt);
  if (receipts.length > MAX_RECEIPTS) receipts.shift();
  listeners.forEach((fn) => { try { fn(receipt); } catch (e) { /* a listener must never break a request */ } });
  return receipt;
}

/** Copy of all receipts, oldest first. The receipts themselves are frozen. */
export function getReceipts() { return receipts.slice(); }

export function onReceipt(fn) {
  if (typeof fn !== "function") return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function median(sorted) {
  if (!sorted.length) return null;
  const m = sorted.length >> 1;
  return sorted.length % 2 ? sorted[m] : Math.round((sorted[m - 1] + sorted[m]) / 2);
}

/** Counts and measured timings only - no percentages, no estimates. */
export function summarizeTelemetry() {
  const byRoute = {};
  const byStatus = {};
  let cloudRequests = 0, cloudBytesSent = 0, localOnly = 0, blocked = 0, calls = 0, privateHits = 0;
  let cloudBodiesObserved = 0, cloudAttemptedNoBody = 0;
  const times = [];
  receipts.forEach((r) => {
    byRoute[r.route] = (byRoute[r.route] || 0) + 1;
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    const tier = r.egressAudit.disclosureTier;
    if (tier === DISCLOSURE_TIERS.APPROVED_CLOUD) {
      cloudRequests += 1; cloudBytesSent += r.egressAudit.bytesSent || 0;
      if (r.egressAudit.sendState === "body_observed") cloudBodiesObserved += 1;
      else if (r.egressAudit.sendState === "attempted_no_body_observed") cloudAttemptedNoBody += 1;
    }
    else if (tier === DISCLOSURE_TIERS.LOCAL_ONLY) localOnly += 1;
    else blocked += 1;
    calls += r.functionCalls.length;
    privateHits += r.egressAudit.privateValueHits;
    if (r.status === "completed" && r.latencyMs !== null) times.push(r.latencyMs);
  });
  times.sort((a, b) => a - b);
  const last = receipts.length ? receipts[receipts.length - 1] : null;
  return {
    total: receipts.length,
    byRoute, byStatus,
    cloudRequests, cloudBytesSent, cloudBodiesObserved, cloudAttemptedNoBody, localOnly, blocked,
    functionCalls: calls,
    privateValueHits: privateHits,
    latency: {
      measured: times.length,
      lastMs: last ? last.latencyMs : null,
      medianMs: median(times),
      maxMs: times.length ? times[times.length - 1] : null,
    },
    hardware: "unavailable",
    localShare: "not-applicable",   // deliberately no "% local" figure
  };
}
