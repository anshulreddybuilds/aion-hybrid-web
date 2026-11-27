/* AION Hybrid Web - egress boundary (hybrid-v2, Packet 2).
 *
 * The only way text reaches a cloud model:
 *   1. createDisclosure()  - payload checked against the purpose's allowlist
 *                            (unknown fields rejected), frozen, SHA-256 digest.
 *   2. approve()           - records approval HERE, bound to that exact digest.
 *                            Setting `approvalState = "approved"` on the object
 *                            yourself does nothing.
 *   3. verify()            - digest re-computed; approval must match it; the
 *                            case must still be at the same revision; each
 *                            approval can be used for ONE send.
 *   4. serialize()         - cloud text built from the allowlisted fields only.
 *   5. scanPrivate()       - last check: the text must not contain any value
 *                            local code registered as private.
 * hybrid.js runs 3-5 for every cloud-reachable request.
 *
 * Three different facts are kept apart (never merged into one "sent"):
 *   approved       - the user cleared exactly this content (approve()).
 *   attempted      - the app handed the text to the SDK (markSent()). The SDK
 *                    can still fail before any request reaches fetch() (App
 *                    Check, API-key referrer, a preflight), so an attempt is
 *                    not proof that anything left.
 *   body-observed  - the fetch monitor below saw a request body that contains
 *                    exactly this disclosure's text (observation()). Only this
 *                    counts as characters sent.
 *
 * Honest limit: this is the app's own confirmation gate. It protects against
 * mistakes and stale or edited content, not against hostile code on the page
 * (any script running here could still call approve() itself). The monitor
 * sees fetch() bodies sent to two Firebase AI hostnames from this page's code,
 * not XHR, WebSocket, beacons, other hosts or browser extensions.
 */
import { PURPOSES, SCHEMA_VERSION, POLICY_VERSION, validatePayload } from "./contracts.js";

/* ---------- canonical JSON + SHA-256 ---------- */
export function canonical(v) {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
  }
  return JSON.stringify(v === undefined ? null : v);
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    Object.keys(o).forEach((k) => deepFreeze(o[k]));
  }
  return o;
}

function uid() {
  try { return crypto.randomUUID(); } catch (e) { return "d-" + Date.now() + "-" + Math.random().toString(16).slice(2); }
}

function boundaryError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/* ---------- disclosures ---------- */
const revisions = new Map();   // purpose|caseId -> last disclosureRevision
const approvals = new Map();   // requestId -> approved digest (the real record)
const sent = new Set();        // requestIds already dispatched (one send per approval)
const log = [];                // egress log for the UI (metadata only, no payload text)

export async function createDisclosure({ purpose, payload, caseId = null, inputRevision = null }) {
  const check = validatePayload(purpose, payload);
  if (!check.ok) throw boundaryError("disclosure_invalid", "Disclosure rejected: " + check.errors.join("; "));
  const clean = deepFreeze(JSON.parse(JSON.stringify(payload)));
  const key = purpose + "|" + (caseId || "-");
  const disclosureRevision = (revisions.get(key) || 0) + 1;
  revisions.set(key, disclosureRevision);
  return {
    requestId: uid(),
    purpose,
    schemaVersion: SCHEMA_VERSION,
    policyVersion: POLICY_VERSION,
    caseId,
    inputRevision,
    disclosureRevision,
    payload: clean,
    contentDigest: await sha256Hex(canonical(clean)),
    approvalState: "draft",
    approvedBy: null,
    createdAt: new Date().toISOString(),
  };
}

export async function approve(d, by) {
  if (!d || !d.requestId) throw boundaryError("disclosure_invalid", "Nothing to approve.");
  const check = validatePayload(d.purpose, d.payload);
  if (!check.ok) throw boundaryError("disclosure_invalid", "Disclosure rejected: " + check.errors.join("; "));
  const digest = await sha256Hex(canonical(d.payload));
  if (digest !== d.contentDigest) throw boundaryError("disclosure_tampered", "The disclosure changed after it was prepared. Prepare it again.");
  if (sent.has(d.requestId)) throw boundaryError("disclosure_used", "This disclosure was already sent. Prepare a new one.");
  approvals.set(d.requestId, digest);
  d.approvalState = "approved";
  d.approvedBy = by || "user_click";
  return d;
}

/** @returns {Promise<{ok: boolean, code?: string, reason?: string}>} */
export async function verify(d, opts) {
  if (!d || !d.requestId || !PURPOSES[d.purpose]) return { ok: false, code: "disclosure_missing", reason: "no disclosure" };
  const check = validatePayload(d.purpose, d.payload);
  if (!check.ok) return { ok: false, code: "disclosure_invalid", reason: check.errors.join("; ") };
  const digest = await sha256Hex(canonical(d.payload));
  if (digest !== d.contentDigest) return { ok: false, code: "disclosure_tampered", reason: "the content changed after it was prepared (digest mismatch)" };
  if (sent.has(d.requestId)) return { ok: false, code: "disclosure_used", reason: "this approval was already used for one send; approve again" };
  const approved = approvals.get(d.requestId);
  if (!approved) return { ok: false, code: "disclosure_unapproved", reason: "it has not been approved" };
  if (approved !== digest) return { ok: false, code: "disclosure_stale", reason: "the approval was for different content" };
  const current = opts && opts.currentInputRevision;
  if (d.caseId && current != null && d.inputRevision !== current) {
    return { ok: false, code: "disclosure_stale", reason: "the case changed after approval (approved rev " + d.inputRevision + ", now rev " + current + ")" };
  }
  return { ok: true };
}

export function isApproved(d) { return !!(d && approvals.get(d.requestId) === d.contentDigest && !sent.has(d.requestId)); }

/* Send marks: which network captures belong to which disclosure. A mark is
 * placed at the moment a disclosure is cleared to send; every captured request
 * after it, up to the next mark, was made for that disclosure. Exact, not a
 * guess by time. In memory only. */
const sendMarks = [];
let outboundSeq = 0;

/* How a disclosure's text appears inside a JSON request body: the same
 * escaping JSON.stringify applies, without the surrounding quotes. */
const escapedForBody = (text) => JSON.stringify(String(text)).slice(1, -1);

/** Records that the app is handing this disclosure to the SDK: an ATTEMPT, not
 * proof that anything reached the network (see observation()). The mark keeps
 * the escaped text (memory only) so later request bodies can be matched to
 * this disclosure exactly, even when sends overlap. */
export function markSent(d, meta) {
  let text = "";
  try { text = serialize(d); } catch (e) { text = ""; }
  sendMarks.push({ requestId: d.requestId, digest: d.contentDigest, seq: outboundSeq, at: Date.now(),
    needle: text ? escapedForBody(text) : "", textChars: text.length });
  if (sendMarks.length > 100) sendMarks.shift();
  sent.add(d.requestId);
  approvals.delete(d.requestId);
  d.approvalState = "sent";
  log.push(Object.assign({ requestId: d.requestId, purpose: d.purpose, digest: d.contentDigest,
    disclosureRevision: d.disclosureRevision, caseId: d.caseId, at: new Date().toISOString(), attempted: true }, meta || {}));
  if (log.length > 50) log.shift();
}

/** A send that FAILED (timeout, offline, App Check, quota, model error) gives
 * its approval back: the same exact text, still bound to the same fingerprint
 * and case revision, may be sent again with one more click. An approval is
 * used up only by a send that got an answer. The send mark stays, so any
 * request body the failed attempt did put on the wire is still accounted for.
 * @returns {boolean} true when the approval was kept for a retry */
export function releaseAfterFailure(d, meta) {
  if (!d || !d.requestId || !sent.has(d.requestId)) return false;
  sent.delete(d.requestId);
  approvals.set(d.requestId, d.contentDigest);
  d.approvalState = "approved";
  log.push(Object.assign({ requestId: d.requestId, purpose: d.purpose, digest: d.contentDigest,
    disclosureRevision: d.disclosureRevision, caseId: d.caseId, at: new Date().toISOString(), failed: true, approvalKept: true }, meta || {}));
  if (log.length > 50) log.shift();
  return true;
}

export function egressLog() { return log.slice(); }

/* ---------- serializer: cloud text from allowlisted fields only ---------- */
export function serialize(d) {
  /* Own properties only: a polluted Object.prototype must never add text. */
  const src = d.payload;
  const p = new Proxy(src, { get: (t, k) => (Object.prototype.hasOwnProperty.call(t, k) ? t[k] : undefined) });
  if (d.purpose === "chat") {
    const notes = (p.notes || []).length ? p.notes.map((n, i) => (i + 1) + ". " + n).join("\n") : "(no relevant notes)";
    const tasks = (p.tasks || []).length ? p.tasks.join("\n") : "(no open tasks)";
    const hist = (p.history || []).map((t) => "User: " + t.user + "\nAION: " + t.assistant).join("\n");
    return p.instructions + "\n\nNOTES:\n" + notes + "\n\nTASKS:\n" + tasks +
      (hist ? "\n\nRECENT CONVERSATION:\n" + hist : "") + "\n\nUser: " + p.message + "\nAION:";
  }
  if (d.purpose === "plan") {
    const refs = (p.task_refs || []).length ? p.task_refs.join("\n") : "(no open tasks)";
    const cons = (p.constraints || []).length ? p.constraints.map((c) => "- " + c).join("\n") : "(none stated)";
    return p.instructions + "\n\nGOAL:\n" + p.goal + "\n\nTASK REFERENCES:\n" + refs + "\n\nCONSTRAINTS:\n" + cons;
  }
  if (d.purpose === "case_research") {
    const passages = (p.shared_passages || []).map((x) => "[" + x.id + "] " + x.text).join("\n") || "(none shared)";
    const srcs = (p.public_sources || []).map((s) => "[" + s.id + "] " + s.title + "\n" + s.text).join("\n\n") || "(none)";
    const reqs = (p.shareable_requirements || []).map((r) => "- " + r).join("\n") || "(none stated)";
    return p.instructions + "\n\nQUESTION:\n" + p.question + "\n\nSHARED PROPOSAL PASSAGES:\n" + passages +
      "\n\nPUBLIC SOURCES:\n" + srcs + "\n\nSTATED REQUIREMENTS:\n" + reqs;
  }
  throw boundaryError("disclosure_invalid", "No serializer for purpose " + d.purpose);
}

/* ---------- private-value registry (last line of defence) ---------- */
const registry = new Map();   // kind -> Set(normalised values)
const norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").trim();
const MIN_LEN = 4;

const MIN_FRAGMENT = 16;
/** Replace the registered values of one kind (e.g. "task_title"). Each value
 * is registered whole AND sentence by sentence (16+ characters), so copying
 * one sentence of a private note is caught, not just the whole note. */
export function setPrivate(kind, values) {
  const set = new Set();
  (values || []).forEach((v) => {
    const n = norm(v);
    if (n.length >= MIN_LEN) set.add(n);
    n.split(/[.!?;\n]+/).forEach((f) => { const t = f.trim(); if (t.length >= MIN_FRAGMENT && t !== n) set.add(t); });
  });
  registry.set(kind, set);
}
export function clearPrivate(kind) { if (kind) registry.delete(kind); else registry.clear(); }
export function privateCounts() {
  const out = {};
  registry.forEach((set, kind) => { out[kind] = set.size; });
  return out;
}
/** @returns {{kind: string, preview: string}[]} registered values found in text */
export function scanPrivate(text) {
  const t = norm(text);
  const hits = [];
  registry.forEach((set, kind) => {
    set.forEach((v) => { if (t.includes(v)) hits.push({ kind, preview: v.slice(0, 24) + (v.length > 24 ? "..." : "") }); });
  });
  return hits;
}

/* ---------- outbound monitor (evidence for the leak test) ---------- */
/* Records the body of each fetch() this page's code makes to the two Firebase
 * AI hostnames, in memory only (never stored), so the leak test can inspect
 * those bodies. It does not see XHR, WebSocket, beacons, other hosts or
 * extensions. */
const outbound = [];
let monitorInstalled = false;
export function installOutboundMonitor() {
  if (monitorInstalled || typeof window === "undefined" || typeof window.fetch !== "function") return;
  monitorInstalled = true;
  const prev = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === "string" ? input : input && input.url;
      if (url && /firebasevertexai\.googleapis\.com|generativelanguage\.googleapis\.com/.test(url)) {
        const body = init && typeof init.body === "string" ? init.body : "";
        outbound.push({ seq: ++outboundSeq, at: Date.now(), url: String(url).replace(/\?.*$/, ""), bytes: body.length, body });
        if (outbound.length > 40) outbound.shift();
      }
    } catch (e) { /* monitoring must never break a request */ }
    return prev.apply(this, arguments);
  };
}
export function outboundSince(ts) { return outbound.filter((o) => o.at >= (ts || 0)); }

/** What the monitor saw for ONE disclosure, matched by content, not by time:
 * a captured body counts only if it contains this disclosure's exact text and
 * was captured after the disclosure was handed to the SDK. A body whose text
 * matches a later mark of another disclosure is not counted here, so two sends
 * that overlap in time are not mixed up.
 *
 *   attempted      - the disclosure was handed to the SDK (markSent ran)
 *   bodyObserved   - at least one matching request body was captured
 *   observedChars  - the disclosure's text length, counted ONLY when a
 *                    matching body was observed (otherwise 0)
 *   attemptedChars - the length handed to the SDK (0 if never attempted)
 *   bodies         - [{seq, at, url, bodyChars}] (no body text)
 *   state          - "not_attempted" | "attempted_no_body_observed" | "body_observed"
 * Characters means JavaScript string length, not bytes.
 * @param {string} requestId */
export function observation(requestId, opts) {
  /* The LATEST attempt for this request: after a failed send is retried, the
   * retry's request body belongs to the retry's mark. */
  let idx = -1;
  for (let i = sendMarks.length - 1; i >= 0 && idx < 0; i--) if (sendMarks[i].requestId === requestId) idx = i;
  if (idx < 0) return { attempted: false, bodyObserved: false, observedChars: 0, attemptedChars: 0, bodies: [], state: "not_attempted" };
  const mark = sendMarks[idx];
  const mine = !mark.needle ? [] : outbound.filter((o) => {
    if (o.seq <= mark.seq || !o.body || o.body.indexOf(mark.needle) === -1) return false;
    /* The latest mark at or before this body that also matches it owns it. */
    for (let i = sendMarks.length - 1; i >= 0; i--) {
      const m = sendMarks[i];
      if (m.seq < o.seq && m.needle && o.body.indexOf(m.needle) !== -1) return m === mark;
    }
    return false;
  });
  const bodyObserved = mine.length > 0;
  return {
    attempted: true, bodyObserved,
    observedChars: bodyObserved ? mark.textChars : 0,
    attemptedChars: mark.textChars,
    bodies: mine.map((o) => ({ seq: o.seq, at: o.at, url: o.url, bodyChars: o.bytes })),
    /* the captured text itself, only when asked for (the leak test searches it) */
    texts: opts && opts.withBodies ? mine.map((o) => o.body) : undefined,
    state: bodyObserved ? "body_observed" : "attempted_no_body_observed",
  };
}

/** Test and harness helper: forget captured bodies and marks. */
export function _resetObservations() { outbound.length = 0; sendMarks.length = 0; }

/** The captured requests sent for the disclosure with this digest (a prefix is
 * enough) that was marked sent at or before `endAt`. Empty if none matched. */
export function outboundForDigest(digest, endAt) {
  if (!digest) return [];
  const limit = (endAt || Date.now()) + 50;
  let idx = -1;
  for (let i = sendMarks.length - 1; i >= 0; i--) {
    if (sendMarks[i].at <= limit && String(sendMarks[i].digest).indexOf(digest) === 0) { idx = i; break; }
  }
  if (idx < 0) return [];
  const from = sendMarks[idx].seq;
  const to = idx + 1 < sendMarks.length ? sendMarks[idx + 1].seq : Infinity;
  return outbound.filter((o) => o.seq > from && o.seq <= to && o.at <= limit);
}
