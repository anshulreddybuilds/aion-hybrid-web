/* AION Hybrid Web - request router (hybrid-v2).
 *
 * Sits between the chat code (standalone.js) and generate() (hybrid.js).
 *
 *   decide()        picks the route BEFORE the prompt is built, so private
 *                   context is only ever assembled for a route that can use it.
 *   dispatchChat()  sends the request through the disclosure boundary
 *                   (createDisclosure -> validatePayload -> approve -> generate),
 *                   records a receipt for every attempt, and - if the cloud
 *                   fails (timeout, App Check, quota, network, model) - answers
 *                   on-device instead when Gemini Nano is ready, saying so.
 *
 * What it does NOT do: it never fabricates a timing, never claims a request
 * stayed local when it did not, and never falls back after the boundary
 * refused a request for being unsealed.
 *
 * Simple-prompt rule: a short or simple prompt is NOT pushed to Nano. On an
 * ordinary laptop Nano is much slower than the cloud, so that rule would make
 * the app worse for most visitors. Only sensitive, offline and offline-demo
 * requests are kept local.
 */
import { DISCLOSURE_TIERS } from "./contracts.js";
import { scanPrivate } from "./egress.js";

/* Things that should not leave the machine even sealed. Patterns only - a
 * pattern miss is not a guarantee; the egress boundary is the real gate. */
const SENSITIVE = [
  { kind: "api key", re: /\bAIza[0-9A-Za-z_-]{20,}/ },
  { kind: "secret key", re: /\bsk-[A-Za-z0-9_-]{16,}/ },
  { kind: "bearer token", re: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}/i },
  { kind: "card number", re: /\b(?:\d[ -]?){13,19}\b/ },
  { kind: "national id", re: /\b\d{3}-\d{2}-\d{4}\b|\b\d{4}\s\d{4}\s\d{4}\b/ },
  { kind: "password", re: /\b(?:password|passcode|passphrase)\b\s*(?:is|:|=)/i },
];

/** Plain-English reason shown next to a fallback answer. */
export const FALLBACK_TEXT = {
  timeout: "the cloud did not answer within 15 seconds",
  app_check: "App Check could not verify this browser",
  quota: "the free cloud quota looks used up",
  permission: "the cloud rejected the request (permission)",
  network: "the cloud could not be reached",
  model: "the cloud model was unavailable",
  private_value_blocked: "the message contained a value you marked private, so it was not sent",
  other: "the cloud request failed",
};

/** @returns {"timeout"|"blocked"|"private_value_blocked"|"app_check"|"quota"|"permission"|"network"|"model"|"other"} */
export function classifyError(err) {
  const code = err && err.code;
  const msg = String((err && err.message) || err || "");
  if (code === "timeout" || /\(timeout\)/.test(msg)) return "timeout";
  if (code === "private_value_blocked") return "private_value_blocked";
  if (code === "unsealed_refused" || (typeof code === "string" && code.indexOf("disclosure_") === 0)) return "blocked";
  if (/app.?check|appcheck/i.test(msg)) return "app_check";
  if (/quota|429|RESOURCE_EXHAUSTED/i.test(msg)) return "quota";
  if (/403|permission|api.?key|API_NOT_ENABLED/i.test(msg)) return "permission";
  if (/failed to fetch|network|offline|fetch-error|ERR_/i.test(msg)) return "network";
  if (/model|not found|404/i.test(msg)) return "model";
  return "other";
}

const STATUS_FOR = { timeout: "timed_out", blocked: "blocked_egress", private_value_blocked: "blocked_egress" };

export function createRouter(deps) {
  const { generate, egress, recordReceipt, getState } = deps;
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const state = () => (typeof getState === "function" ? getState() : {}) || {};

  /** Chooses the route before anything is built.
   * @param {{mode: string, message: string, offlineDemo?: boolean, online?: boolean}} ctx
   * @returns {{requested: string, effectiveMode: string, overridden: boolean, reasons: string[], sensitive: string[]}} */
  function decide(ctx) {
    const requested = ctx.mode;
    const st = state();
    const reasons = [];
    const sensitive = [];
    let mode = requested;
    const nanoReady = st.nano === "ready";
    const online = ctx.online !== false && (typeof navigator === "undefined" || navigator.onLine !== false);

    if (ctx.offlineDemo || st.offlineDemo) { mode = "only_on_device"; reasons.push("offline_demo"); }
    else if (mode !== "only_on_device" && mode !== "only_in_cloud" && !online) { mode = "only_on_device"; reasons.push("offline"); }

    if (mode !== "only_on_device" && mode !== "only_in_cloud") {
      const text = String(ctx.message || "");
      SENSITIVE.forEach((s) => { if (s.re.test(text)) sensitive.push(s.kind); });
      let hits = [];
      try { hits = scanPrivate(text); } catch (e) { hits = []; }
      if (hits.length) sensitive.push("registered private value");
      if (sensitive.length) {
        if (nanoReady) { mode = "only_on_device"; reasons.push("sensitive_kept_local"); }
        else reasons.push("sensitive_but_nano_unavailable");
      }
    }
    return { requested, effectiveMode: mode, overridden: mode !== requested, reasons, sensitive };
  }

  function sentBytes(d) {
    try {
      const row = egress.egressLog().filter((x) => x.requestId === d.requestId).pop();
      return row && typeof row.bytes === "number" ? row.bytes : null;
    } catch (e) { return null; }
  }

  function egressFor(d, sent, extra) {
    if (!d) return Object.assign({ tier: DISCLOSURE_TIERS.BLOCKED }, extra);
    return Object.assign({
      tier: sent ? DISCLOSURE_TIERS.APPROVED_CLOUD : DISCLOSURE_TIERS.BLOCKED,
      purpose: d.purpose, digest: d.contentDigest, bytes: sent ? sentBytes(d) : 0,
      fields: Object.keys(d.payload || {}),
    }, extra);
  }

  /** Sends one chat request.
   * @param {Object} o
   * @param {string} o.mode             effective mode from decide()
   * @param {string} [o.requestedMode]  what the dropdown said
   * @param {Object} [o.payload]        "chat" disclosure payload (cloud-reachable routes)
   * @param {string} [o.prompt]         plain prompt (only_on_device only)
   * @param {Function} [o.onChunk]
   * @param {Function} [o.buildLocalPrompt]  async () => string; enables on-device fallback
   * @param {Object} [o.decision]       what decide() returned, passed through to the result */
  async function dispatchChat(o) {
    const t0 = now();
    const mode = o.mode;
    const requestedMode = o.requestedMode || mode;
    let disclosure = null;
    try {
      if (mode === "only_on_device") {
        const g = await generate(o.prompt, o.onChunk, { mode });
        const receipt = recordReceipt({ route: "on-device-nano", status: "completed", model: g.model, requestedMode,
          latencyMs: g.latencyMs, firstChunkMs: g.firstChunkMs, egress: { tier: DISCLOSURE_TIERS.LOCAL_ONLY },
          contributors: { local_deterministic: true, local_ai: true } });
        return Object.assign({}, g, { receipt, receipts: [receipt], fallback: null, decision: o.decision || null });
      }
      /* Cloud-reachable: the payload must pass validatePayload (inside
       * createDisclosure) before anything is approved or sent. */
      disclosure = await egress.createDisclosure({ purpose: "chat", payload: o.payload });
      await egress.approve(disclosure, o.approvedBy || "send_click");
      const g = await generate(null, o.onChunk, { mode, disclosure });
      const ranLocal = g.source === "on_device";
      if (ranLocal && mode === "prefer_in_cloud") {
        /* Prefer-cloud tries the cloud FIRST, so the sealed payload was sent
         * (or attempted) and the SDK then answered on this device. The SDK
         * does not say why the cloud failed, so the receipt says exactly that. */
        const reason = "the cloud did not answer, so the browser SDK answered on this device (cloud error not reported by the SDK)";
        const receipt = recordReceipt({ route: "local-fallback", status: "fallback", model: g.model, requestedMode,
          latencyMs: g.latencyMs, firstChunkMs: g.firstChunkMs, approvalState: "approved", fallbackReason: reason,
          egress: egressFor(disclosure, true), contributors: { local_deterministic: true, local_ai: true } });
        return Object.assign({}, g, { receipt, receipts: [receipt],
          fallback: { from: "cloud", errorClass: "unreported", code: null, reason }, decision: o.decision || null });
      }
      const receipt = recordReceipt({
        route: ranLocal ? "on-device-nano" : "cloud-sealed-chat", status: "completed", model: g.model, requestedMode,
        latencyMs: g.latencyMs, firstChunkMs: g.firstChunkMs, approvalState: "approved",
        /* A prefer-* request can end up running on the device: then nothing left. */
        egress: ranLocal ? { tier: DISCLOSURE_TIERS.LOCAL_ONLY, purpose: disclosure.purpose, fields: Object.keys(disclosure.payload) }
          : egressFor(disclosure, true),
        contributors: { local_deterministic: true, local_ai: ranLocal, cloud_ai: !ranLocal },
      });
      return Object.assign({}, g, { receipt, receipts: [receipt], fallback: null, decision: o.decision || null });
    } catch (err) {
      const cls = classifyError(err);
      const sent = !!(disclosure && disclosure.approvalState === "sent");
      const first = recordReceipt({
        route: mode === "only_on_device" ? "on-device-nano" : "cloud-sealed-chat",
        status: STATUS_FOR[cls] || "failed", requestedMode, latencyMs: now() - t0,
        approvalState: disclosure ? "approved" : "not-applicable",
        egress: mode === "only_on_device" ? { tier: DISCLOSURE_TIERS.LOCAL_ONLY }
          : egressFor(disclosure, sent, { blockedCode: sent ? null : (err && err.code) || cls,
            privateValueHits: cls === "private_value_blocked" ? 1 : 0 }),
        errorCode: (err && err.code) || cls,
      });
      err.receipt = first; err.receipts = [first]; err.errorClass = cls;

      const canFall = cls !== "blocked" && mode !== "only_on_device" && mode !== "only_in_cloud" &&
        typeof o.buildLocalPrompt === "function" && state().nano === "ready" && !state().offlineDemo;
      if (!canFall) throw err;

      const reason = FALLBACK_TEXT[cls] || FALLBACK_TEXT.other;
      const t1 = now();
      try {
        const localPrompt = await o.buildLocalPrompt();
        const g2 = await generate(localPrompt, o.onChunk, { mode: "only_on_device" });
        const receipt = recordReceipt({ route: "local-fallback", status: "fallback", model: g2.model, requestedMode,
          latencyMs: g2.latencyMs, firstChunkMs: g2.firstChunkMs, fallbackReason: reason,
          egress: { tier: DISCLOSURE_TIERS.LOCAL_ONLY }, contributors: { local_deterministic: true, local_ai: true } });
        return Object.assign({}, g2, { requested_mode: requestedMode, receipt, receipts: [first, receipt],
          fallback: { from: "cloud", errorClass: cls, code: (err && err.code) || null, reason }, decision: o.decision || null });
      } catch (err2) {
        const failed = recordReceipt({ route: "local-fallback", status: "failed", requestedMode, latencyMs: now() - t1,
          fallbackReason: reason, egress: { tier: DISCLOSURE_TIERS.LOCAL_ONLY }, errorCode: (err2 && err2.code) || "fallback_failed" });
        err.receipts = [first, failed]; err.fallbackError = err2;
        throw err;
      }
    }
  }

  return { decide, dispatchChat, classifyError, FALLBACK_TEXT };
}
