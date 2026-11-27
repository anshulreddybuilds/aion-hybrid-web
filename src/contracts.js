/* AION Hybrid Web - shared contracts (hybrid-v2, Packet 2).
 *
 * One place that says what each object looks like and checks it at runtime.
 * Plain JS + JSDoc on purpose: no framework, no build-time types.
 *
 *   Case        - the private workspace (lives only in this browser)
 *   Disclosure  - the ONLY thing that can be sent to the cloud
 *   Proposal    - an action the cloud suggests       (used from Packet 5)
 *   Execution   - an approved action actually applied (used from Packet 5)
 *   Receipt     - who contributed what, with timings  (used from Packet 6)
 */

export const SCHEMA_VERSION = "aion.disclosure.v1";
export const POLICY_VERSION = "aion.policy.2026-11-22";

/* ------------------------------------------------------------------ */
/* Disclosure payload allowlists                                        */
/* ------------------------------------------------------------------ */
/* A disclosure payload may contain ONLY the fields listed for its purpose.
 * Anything else - an extra key, a wrong type, an over-long string - is
 * rejected. The cloud text is then built from these fields alone
 * (egress.serialize), never from a raw prompt with bits stripped out. */

const str = (max) => ({ type: "string", max });
const strList = (max, maxItems) => ({ type: "string[]", max, maxItems });
const passages = (max, maxItems) => ({ type: "passages", max, maxItems });
const sources = (max, maxItems) => ({ type: "sources", max, maxItems });
const turns = (max, maxItems) => ({ type: "turns", max, maxItems });

export const PURPOSES = {
  chat: {
    label: "Chat reply",
    fields: {
      instructions: str(2400),
      notes: strList(700, 8),
      tasks: strList(400, 24),
      history: turns(400, 4),
      message: str(2000),
    },
    required: ["instructions", "message"],
  },
  /* Blindfold Planner (hybrid-v2, Packet 7). The cloud sees the goal, task
   * REFERENCES such as "[TASK_3] | in progress | [PROJECT_1]" (never real
   * titles) and the user's constraints. Nothing else. */
  plan: {
    label: "Plan (blindfold)",
    fields: {
      instructions: str(1800),
      goal: str(800),
      task_refs: strList(200, 24),
      constraints: strList(200, 8),
    },
    required: ["instructions", "goal"],
  },
  /* Ghost-Math (money lens). Each entry is one line
   * "T3 | debit | Merchant_B | food | 412": a stand-in name and a number
   * already multiplied by the session's secret factor, built on the device by
   * src/ghostMath.js. No SMS text, account number, date or real name. */
  ghost_math: {
    label: "Money lens (scaled, stand-in names)",
    fields: {
      instructions: str(2400),
      entries: strList(90, 200),
    },
    required: ["instructions", "entries"],
  },
  case_research: {
    label: "Case research (public)",
    fields: {
      instructions: str(2400),
      question: str(1000),
      shared_passages: passages(1500, 12),
      public_sources: sources(3000, 6),
      shareable_requirements: strList(300, 12),
    },
    required: ["instructions", "question"],
  },
};

const PASSAGE_ID = /^P\d{1,3}$/;
const SOURCE_ID = /^S\d{1,3}$/;
/* Caps for the small nested strings: ids look like P12 / S3; a source title is a
 * short label. (The long texts are capped by the purpose's own `max`.) */
const ID_MAX = 8;
const TITLE_MAX = 200;

/* Own-property test. `k in obj` is true for inherited names such as
 * "constructor" and "toString", so it must never be used to decide what is a
 * field. */
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function isPlainObject(v) {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/* Keys that Object.keys() does not list: symbols and non-enumerable names.
 * A payload built with those could hide a field from the loops below. */
function hiddenKeys(obj) {
  const shown = new Set(Object.keys(obj));
  return Reflect.ownKeys(obj).filter((k) => !shown.has(k));
}

function exactKeys(obj, keys, where, errors) {
  if (!isPlainObject(obj)) { errors.push(where + " must be an object"); return false; }
  Object.keys(obj).forEach((k) => { if (!keys.includes(k)) errors.push("unknown field \"" + k + "\" in " + where); });
  hiddenKeys(obj).forEach((k) => errors.push("hidden (symbol or non-enumerable) key " + String(k) + " in " + where));
  keys.forEach((k) => { if (!hasOwn(obj, k) || typeof obj[k] !== "string") errors.push(where + "." + k + " must be text"); });
  return true;
}

function checkString(v, spec, where, errors) {
  if (typeof v !== "string") { errors.push(where + " must be text"); return; }
  if (v.length > spec.max) errors.push(where + " is too long (" + v.length + " > " + spec.max + " characters)");
}

function checkList(v, spec, where, errors, itemCheck) {
  if (!Array.isArray(v)) { errors.push(where + " must be a list"); return; }
  if (v.length > spec.maxItems) errors.push(where + " has too many items (" + v.length + " > " + spec.maxItems + ")");
  v.forEach((item, i) => itemCheck(item, where + "[" + i + "]"));
}

/** Validate a disclosure payload against its purpose's allowlist.
 * @returns {{ok: boolean, errors: string[]}} */
/* Images and binary blobs can never be part of a cloud disclosure, in any
 * field: a data: URL, or a long unbroken base64 run. (Screenshots are read on
 * the device; only text the user reviews can be shared.) */
/* Every data: URI is refused, whatever its media type or encoding (base64 or
 * percent-encoded text such as data:image/svg+xml,...). Long unbroken runs of
 * base64 OR base64url (- and _ instead of + and /) are refused too: a run of
 * 300+ such characters with 100+ letters/digits in it. */
const DATA_URI_RE = /(?:^|[^a-z0-9])data:[a-z0-9.+\/-]*(?:;[a-z0-9.+=_-]+)*,/i;
const LONG_RUN_RE = /[A-Za-z0-9+\/_-]{300,}/g;
export function looksBinary(s) {
  if (typeof s !== "string") return false;
  if (DATA_URI_RE.test(s)) return true;
  const runs = s.match(LONG_RUN_RE);
  return !!runs && runs.some((r) => r.replace(/[^A-Za-z0-9]/g, "").length >= 100);
}
function findBinary(v, where, out) {
  if (typeof v === "string") { if (looksBinary(v)) out.push(where + " contains image or binary data (a data: address or a long base64 run), which can never be sent to the cloud"); }
  else if (Array.isArray(v)) v.forEach((x, i) => findBinary(x, where + "[" + i + "]", out));
  else if (v && typeof v === "object") Object.keys(v).forEach((k) => findBinary(v[k], where + "." + k, out));
}

export function validatePayload(purpose, payload) {
  const errors = [];
  const def = PURPOSES[purpose];
  if (!def) return { ok: false, errors: ["unknown purpose \"" + purpose + "\""] };
  if (!isPlainObject(payload)) return { ok: false, errors: ["payload must be an object"] };
  Object.keys(payload).forEach((k) => {
    if (!hasOwn(def.fields, k)) errors.push("unknown field \"" + k + "\" (not allowed for " + purpose + ")");
  });
  hiddenKeys(payload).forEach((k) => errors.push("hidden (symbol or non-enumerable) key " + String(k) + " is not allowed"));
  def.required.forEach((k) => { if (!hasOwn(payload, k)) errors.push("missing required field \"" + k + "\""); });
  Object.keys(def.fields).forEach((k) => {
    if (!hasOwn(payload, k)) return;
    const spec = def.fields[k];
    const v = payload[k];
    if (spec.type === "string") checkString(v, spec, k, errors);
    else if (spec.type === "string[]") checkList(v, spec, k, errors, (it, w) => checkString(it, spec, w, errors));
    else if (spec.type === "passages") checkList(v, spec, k, errors, (it, w) => {
      if (exactKeys(it, ["id", "text"], w, errors)) {
        if (typeof it.id === "string" && (it.id.length > ID_MAX || !PASSAGE_ID.test(it.id))) errors.push(w + ".id must look like P1, P2 ...");
        if (typeof it.text === "string" && it.text.length > spec.max) errors.push(w + ".text is too long");
      }
    });
    else if (spec.type === "sources") checkList(v, spec, k, errors, (it, w) => {
      if (exactKeys(it, ["id", "title", "text"], w, errors)) {
        if (typeof it.id === "string" && (it.id.length > ID_MAX || !SOURCE_ID.test(it.id))) errors.push(w + ".id must look like S1, S2 ...");
        if (typeof it.title === "string" && it.title.length > TITLE_MAX) errors.push(w + ".title is too long (" + it.title.length + " > " + TITLE_MAX + " characters)");
        if (typeof it.text === "string" && it.text.length > spec.max) errors.push(w + ".text is too long");
      }
    });
    else if (spec.type === "turns") checkList(v, spec, k, errors, (it, w) => {
      if (exactKeys(it, ["user", "assistant"], w, errors)) {
        if (typeof it.user === "string" && it.user.length > spec.max) errors.push(w + ".user is too long");
        if (typeof it.assistant === "string" && it.assistant.length > spec.max) errors.push(w + ".assistant is too long");
      }
    });
  });
  if (isPlainObject(payload)) findBinary(payload, "payload", errors);
  return { ok: errors.length === 0, errors };
}

/* ------------------------------------------------------------------ */
/* Case                                                                 */
/* ------------------------------------------------------------------ */
/**
 * @typedef {Object} CaseParagraph
 * @property {string} id        P1, P2 ... (stable source id)
 * @property {string} heading
 * @property {string} text
 * @property {boolean} shared   true = may be included in a disclosure
 *
 * @typedef {Object} PublicSource
 * @property {string} id        S1, S2 ...
 * @property {string} title
 * @property {string} label     where it comes from (bundled sample, user-provided ...)
 * @property {string} text
 *
 * @typedef {Object} PrivateConstraints  - NEVER part of any disclosure
 * @property {string} maxBudget
 * @property {string} readyBy
 * @property {boolean} installationRequired
 * @property {string} confidentialNote
 *
 * @typedef {Object} Case
 * @property {string} id
 * @property {string} title
 * @property {number} inputRevision   +1 on every saved change
 * @property {boolean} sample
 * @property {CaseParagraph[]} paragraphs
 * @property {PublicSource[]} publicSources
 * @property {string[]} shareableRequirements
 * @property {PrivateConstraints} privateConstraints
 * @property {string} question
 * @property {string} updatedAt
 */

/** Light structural check for a stored case. @returns {{ok:boolean, errors:string[]}} */
export function validateCase(c) {
  const errors = [];
  if (!isPlainObject(c)) return { ok: false, errors: ["case must be an object"] };
  if (typeof c.id !== "string") errors.push("case.id missing");
  if (!Number.isInteger(c.inputRevision) || c.inputRevision < 1) errors.push("case.inputRevision must be a positive whole number");
  const seen = {};
  (Array.isArray(c.paragraphs) ? c.paragraphs : []).forEach((p, i) => {
    if (!p || !PASSAGE_ID.test(p.id)) errors.push("paragraph " + i + " has a bad id");
    else if (seen[p.id]) errors.push("duplicate paragraph id " + p.id);
    else seen[p.id] = 1;
  });
  if (!Array.isArray(c.paragraphs)) errors.push("case.paragraphs must be a list");
  if (!isPlainObject(c.privateConstraints)) errors.push("case.privateConstraints missing");
  return { ok: errors.length === 0, errors };
}

/* ------------------------------------------------------------------ */
/* Disclosure                                                           */
/* ------------------------------------------------------------------ */
/**
 * @typedef {Object} Disclosure
 * @property {string} requestId
 * @property {string} purpose            key of PURPOSES
 * @property {string} schemaVersion
 * @property {string} policyVersion
 * @property {string|null} caseId
 * @property {number|null} inputRevision  case revision it was built from
 * @property {number} disclosureRevision  +1 per new disclosure for the same case/purpose
 * @property {Object} payload             allowlisted fields only (frozen)
 * @property {string} contentDigest       SHA-256 of the canonical payload
 * @property {"draft"|"approved"|"sent"} approvalState  display only - the
 *           real approval record lives inside egress.js, not on this object
 * @property {string|null} approvedBy     "user_click" | "send_click" | "leak_test"
 * @property {string} createdAt
 */

/* ------------------------------------------------------------------ */
/* Proposal / Execution / Receipt (decided now, used from Packet 5-6)   */
/* ------------------------------------------------------------------ */
/** Only these local actions can ever be proposed or executed. */
export const PROPOSAL_OPERATIONS = ["create_task", "reschedule_task"];
/**
 * @typedef {Object} Proposal
 * @property {string} proposalId
 * @property {string} caseId
 * @property {number} inputRevision
 * @property {number} disclosureRevision
 * @property {{op: "create_task"|"reschedule_task", args: Object}[]} operations
 * @property {string} operationsDigest
 * @property {string} expiresAt
 * @property {"pending"|"approved"|"stale"|"executed"|"rejected"|"expired"} status
 *
 * @typedef {Object} Execution
 * @property {string} proposalId   idempotency key: one proposal executes at most once
 * @property {number} inputRevision rechecked inside the same transaction
 * @property {string} executedAt
 * @property {Object[]} changes
 *
 * @typedef {Object} Receipt
 * @property {string} id
 * @property {{local_ai:boolean, local_deterministic:boolean, cloud_ai:boolean, human_confirmed:boolean}} contributors
 * @property {Object<string, number>} timingsMs  ui, model_init, local_inference, cloud_ttft, cloud_total, deterministic, execution
 */


/* ------------------------------------------------------------------ */
/* Receipts and plans (hybrid-v2: telemetry.js, router.js, planner.js)  */
/* ------------------------------------------------------------------ */
export const RECEIPT_SCHEMA_VERSION = "aion.receipt.v1";
export const PLAN_STEP_SCHEMA_VERSION = "aion.plan.v1";

/** What happened to the user's data on this request. */
export const DISCLOSURE_TIERS = Object.freeze({
  LOCAL_ONLY: "local_only",         // nothing left this browser
  APPROVED_CLOUD: "approved_cloud", // an approved, allowlisted disclosure was sent
  BLOCKED: "blocked",               // the boundary refused; nothing was sent
});

export const RECEIPT_ROUTES = Object.freeze([
  "on-device-nano", "cloud-sealed-chat", "cloud-blindfold", "local-fallback", "local-deterministic",
  "cloud-case-research",   /* Case tab: approved case_research disclosure sent only_in_cloud */
  "cloud-ghost-math",      /* Ghost-Math: scaled numbers and stand-in names sent to cloud Gemini */
]);
export const RECEIPT_STATUSES = Object.freeze([
  "completed", "timed_out", "blocked_egress", "rejected", "fallback", "failed",
]);

/** Steps a plan may contain. Only these can change anything, and only after approval. */
export const PLAN_OPS = Object.freeze(["create_task", "propose_memory", "note"]);
export const PLAN_MUTATING_OPS = Object.freeze(["create_task", "propose_memory"]);
const PLAN_STEP_KEYS = ["op", "title", "taskRef", "due", "reason"];
const TASK_REF = /^\[TASK_\d{1,3}\]$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** Checks a plan the cloud (or Nano) produced. Unknown keys / ops are errors.
 * Mutating steps come back as PENDING_APPROVAL; nothing is ever applied here.
 * @param {*} raw  parsed JSON
 * @param {{knownRefs?: string[]}} [opts]
 * @returns {{ok: boolean, errors: string[], plan?: {schemaVersion: string, summary: string, steps: Object[]}}} */
export function validatePlan(raw, opts) {
  const errors = [];
  const known = (opts && opts.knownRefs) || [];
  if (!isPlainObject(raw)) return { ok: false, errors: ["plan must be an object"] };
  Object.keys(raw).forEach((k) => { if (k !== "summary" && k !== "steps") errors.push("unknown field \"" + k + "\" in plan"); });
  if (typeof raw.summary !== "string" || !raw.summary.trim()) errors.push("summary must be text");
  if (!Array.isArray(raw.steps)) { errors.push("steps must be a list"); return { ok: false, errors }; }
  if (raw.steps.length === 0) errors.push("a plan needs at least one step");
  if (raw.steps.length > 8) errors.push("too many steps (" + raw.steps.length + " > 8)");
  const steps = [];
  raw.steps.slice(0, 8).forEach((st, i) => {
    const w = "steps[" + i + "]";
    if (!isPlainObject(st)) { errors.push(w + " must be an object"); return; }
    Object.keys(st).forEach((k) => { if (!PLAN_STEP_KEYS.includes(k)) errors.push("unknown field \"" + k + "\" in " + w); });
    if (!PLAN_OPS.includes(st.op)) { errors.push(w + ".op must be one of " + PLAN_OPS.join(", ")); return; }
    const title = clean(st.title, 120);
    if (!title) errors.push(w + ".title is empty");
    const taskRef = st.taskRef == null ? "" : String(st.taskRef);
    if (taskRef && (!TASK_REF.test(taskRef) || (known.length && !known.includes(taskRef)))) errors.push(w + ".taskRef \"" + taskRef.slice(0, 20) + "\" is not a task reference we sent");
    const due = st.due == null ? "" : String(st.due);
    if (due && !ISO_DATE.test(due)) errors.push(w + ".due must be YYYY-MM-DD or empty");
    steps.push({
      schemaVersion: PLAN_STEP_SCHEMA_VERSION, op: st.op, title, taskRef, due,
      reason: clean(st.reason, 200),
      status: PLAN_MUTATING_OPS.includes(st.op) ? "PENDING_APPROVAL" : "INFO",
    });
  });
  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], plan: { schemaVersion: PLAN_STEP_SCHEMA_VERSION, summary: clean(raw.summary, 300), steps } };
}
