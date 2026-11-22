/* AION Hybrid Web - Blindfold Planner (hybrid-v2).
 *
 * The cloud model plans; it never sees your data.
 *   A. Egress gate     the request is a "plan" disclosure: goal + task
 *                      REFERENCES ("[TASK_3] | in progress | [PROJECT_1]") +
 *                      constraints. validatePayload allowlists it, you approve
 *                      it, the digest is checked, registered private values are
 *                      scanned for, and only then does text leave.
 *   B. Bounded tools   the model may ask for up to 2 rounds of local lookups.
 *                      Each tool answers with booleans, small counts or a fixed
 *                      word (low / medium / high) - never text from your notes -
 *                      and every answer is validated again before it is sent.
 *   C. Structured plan a separate request returns JSON that must match a
 *                      schema (Gemini cannot combine function calling and a
 *                      JSON response schema in one request, so they are two).
 *   D. Guardian gate   the JSON is validated against contracts.validatePlan.
 *                      Every step that would change anything is
 *                      PENDING_APPROVAL; nothing is applied here.
 * The whole cloud sequence has one 15 s budget. On timeout, App Check or any
 * other failure, or invalid JSON, the planner falls back to on-device Gemini
 * Nano when it is ready, and otherwise to a deterministic offline plan built
 * from the user's own words. Both say that they are fallbacks.
 *
 * Tools are named for what they really do: count_memories_by_type returns
 * counts per note type (not tag text), estimate_task_effort is a word-count
 * heuristic, not an AI judgement.
 */
import { Schema } from "firebase/ai";
import { DISCLOSURE_TIERS, PLAN_OPS, PLAN_MUTATING_OPS, validatePlan } from "./contracts.js";
import { classifyError, FALLBACK_TEXT } from "./router.js";

export const PLAN_TIMEOUT_MS = 15000;
export const MAX_TOOL_ROUNDS = 2;
const MAX_CALLS_PER_ROUND = 3;

export const PLAN_INSTRUCTIONS =
  "You are the planning step of a personal assistant. You are given a GOAL and TASK REFERENCES. " +
  "Task references look like [TASK_3] or [PROJECT_1]; they stand for private items you cannot see. " +
  "Never guess or describe what a reference means; when you need to point at one, write it exactly. " +
  "You may call the local tools to learn simple facts (counts, availability, effort level). " +
  "Then propose at most 6 concrete steps. Use op create_task for a new to-do, propose_memory for a fact worth " +
  "remembering, and note for advice that changes nothing. Dates are YYYY-MM-DD or empty. " +
  "Everything you propose is only a suggestion: the user approves each step.";

const FINAL_INSTRUCTION = "Using only the information above, return the plan now as JSON.";

/* ------------------------------ schemas ------------------------------ */

export function planResponseSchema() {
  return Schema.object({
    properties: {
      summary: Schema.string(),
      steps: Schema.array({
        items: Schema.object({
          properties: {
            op: Schema.enumString({ enum: PLAN_OPS.slice() }),
            title: Schema.string(),
            taskRef: Schema.string(),
            due: Schema.string(),
            reason: Schema.string(),
          },
          optionalProperties: ["taskRef", "due", "reason"],
        }),
      }),
    },
  });
}

/* Same shape as plain JSON Schema, for Gemini Nano's responseConstraint. */
export const PLAN_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    steps: {
      type: "array", maxItems: 8,
      items: {
        type: "object",
        properties: {
          op: { type: "string", enum: PLAN_OPS.slice() },
          title: { type: "string" }, taskRef: { type: "string" }, due: { type: "string" }, reason: { type: "string" },
        },
        required: ["op", "title"],
      },
    },
  },
  required: ["summary", "steps"],
};

export function toolDeclarations() {
  return [{
    functionDeclarations: [
      {
        name: "check_local_capability",
        description: "Ask whether this browser can do something locally. Returns only true or false.",
        parameters: Schema.object({ properties: { capability: Schema.enumString({ enum: ["nano", "task_store", "offline_queue"] }) } }),
      },
      {
        name: "count_memories_by_type",
        description: "How many saved notes exist per type. Returns counts only, never note text.",
        parameters: Schema.object({ properties: { scope: Schema.enumString({ enum: ["all"] }) } }),
      },
      {
        name: "estimate_task_effort",
        description: "Rough effort for one task reference, from a local word-count heuristic: low, medium, high or unknown.",
        parameters: Schema.object({ properties: { taskRef: Schema.string() } }),
      },
    ],
  }];
}
export const TOOL_NAMES = ["check_local_capability", "count_memories_by_type", "estimate_task_effort"];

/* ----------------------- local tools + their gate ----------------------- */

function toolError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

const MEMORY_TYPES = ["fact", "preference", "experience", "capability", "total"];
const CAPABILITIES = ["nano", "task_store", "offline_queue"];
const LEVELS = ["low", "medium", "high", "unknown"];

/** Runs one local tool. `facts` never leaves this function except through the
 * validated, metadata-only result. */
export function runLocalTool(name, args, facts) {
  const f = facts || {};
  const a = args && typeof args === "object" ? args : {};
  if (name === "check_local_capability") {
    const caps = { nano: !!f.nanoReady, task_store: true, offline_queue: false /* not built */ };
    return { available: CAPABILITIES.includes(a.capability) ? !!caps[a.capability] : false };
  }
  if (name === "count_memories_by_type") {
    const out = {};
    MEMORY_TYPES.forEach((t) => { const n = f.memoryCounts && f.memoryCounts[t]; out[t] = Number.isInteger(n) && n >= 0 ? Math.min(n, 9999) : 0; });
    return out;
  }
  if (name === "estimate_task_effort") {
    const title = f.taskTitles && Object.prototype.hasOwnProperty.call(f.taskTitles, a.taskRef) ? String(f.taskTitles[a.taskRef]) : null;
    if (title === null) return { level: "unknown" };
    const words = title.trim().split(/\s+/).filter(Boolean).length;
    return { level: words <= 3 ? "low" : words <= 7 ? "medium" : "high" };
  }
  throw toolError("tool_unknown", "Unknown tool \"" + String(name).slice(0, 30) + "\".");
}

/** Whatever a tool returns must be only booleans, small integers or a fixed
 * word from a short list. Anything else is refused before it can be sent. */
export function validateToolResult(name, result) {
  const bad = (why) => toolError("tool_result_invalid", "Tool \"" + name + "\" result refused: " + why + ".");
  if (!result || typeof result !== "object" || Array.isArray(result)) throw bad("not an object");
  const keys = Object.keys(result);
  if (name === "check_local_capability") {
    if (keys.length !== 1 || keys[0] !== "available" || typeof result.available !== "boolean") throw bad("expected { available: boolean }");
  } else if (name === "count_memories_by_type") {
    keys.forEach((k) => {
      if (!MEMORY_TYPES.includes(k)) throw bad("unexpected field \"" + String(k).slice(0, 20) + "\"");
      if (!Number.isInteger(result[k]) || result[k] < 0 || result[k] > 9999) throw bad("\"" + k + "\" is not a small count");
    });
  } else if (name === "estimate_task_effort") {
    if (keys.length !== 1 || keys[0] !== "level" || !LEVELS.includes(result.level)) throw bad("expected { level: low|medium|high|unknown }");
  } else {
    throw bad("unknown tool");
  }
  return result;
}

/* ------------------------- deterministic fallback ------------------------- */

const clip = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

/** A plan built from the user's own sentences. No AI, no network. */
export function deterministicPlan(goal) {
  const parts = String(goal || "").split(/[.;\n]+|\band then\b|\bthen\b|\band\b/i)
    .map((p) => clip(p.replace(/^(?:please|i need to|i have to|i should|i want to|help me|plan my|plan)\b\s*/i, ""), 110))
    .filter((p) => p.length >= 4).slice(0, 5);
  const steps = parts.length
    ? parts.map((p) => ({ op: "create_task", title: p.charAt(0).toUpperCase() + p.slice(1), taskRef: "", due: "",
        reason: "Taken from your own request (offline plan, no AI used)." }))
    : [{ op: "note", title: "Add a few details about what you want to get done, then try again.", taskRef: "", due: "", reason: "" }];
  const v = validatePlan({ summary: "Offline plan built from your own words (no AI used).", steps });
  return v.ok ? v.plan : { schemaVersion: "aion.plan.v1", summary: "No plan could be built.", steps: [] };
}

/** Turns plan steps into the proposals the existing approval cards understand. */
export function stepsToProposals(plan, unseal) {
  const un = typeof unseal === "function" ? unseal : (s) => s;
  const out = [];
  ((plan && plan.steps) || []).forEach((st) => {
    if (st.status !== "PENDING_APPROVAL") return;
    if (st.op === "create_task") out.push({ kind: "task", content: clip(un(st.title), 160), type: "task", importance: 3, tags: [], source: "planner" });
    else if (st.op === "propose_memory") out.push({ kind: "memory", content: clip(un(st.title), 200), type: "fact", importance: 3, tags: [], source: "planner" });
  });
  return out;
}

/* ------------------------------- the planner ------------------------------- */

function parseJson(text) {
  const t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(t); } catch (e) { return undefined; }
}

/**
 * @param {Object} deps
 * @param {Function} deps.cloudCall    ({tools?, generationConfig?, contents, signal}) => Promise<{response, model}>
 * @param {Function} [deps.localCall]  (prompt, jsonSchema) => Promise<{text, model}>   (Gemini Nano)
 * @param {Object} deps.egress         the egress.js module
 * @param {Function} deps.recordReceipt
 * @param {Function} deps.getState     () => AionHybridState
 * @param {number} [deps.timeoutMs]
 */
export function createPlanner(deps) {
  const { cloudCall, localCall, egress, recordReceipt, getState } = deps;
  const budgetMs = deps.timeoutMs || PLAN_TIMEOUT_MS;
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const st = () => (typeof getState === "function" ? getState() : {}) || {};

  /** @param {{goal: string, taskRefs?: {ref: string, line: string}[], constraints?: string[], taskTitles?: Object,
   *   memoryCounts?: Object, localContext?: string}} input  (taskTitles / localContext stay in this browser)
   *  @param {{mode?: string, approvedBy?: string, forceLocal?: boolean}} [options] */
  async function plan(input, options) {
    const opt = options || {};
    const state = st();
    const mode = opt.mode || state.mode || "prefer_in_cloud";
    const requestedMode = mode;
    const taskRefs = Array.isArray(input.taskRefs) ? input.taskRefs : [];
    const knownRefs = taskRefs.map((r) => r.ref);
    const facts = { nanoReady: state.nano === "ready", memoryCounts: input.memoryCounts, taskTitles: input.taskTitles };
    const receipts = [];
    const online = typeof navigator === "undefined" || navigator.onLine !== false;
    const cloudAllowed = !opt.forceLocal && mode !== "only_on_device" && !state.offlineDemo && online;
    const t0 = now();

    /* ---- local paths: Nano, then deterministic ---- */
    async function localPath(reason, cls, byDesign) {
      const t1 = now();
      if (state.nano === "ready" && typeof localCall === "function") {
        try {
          const prompt = "You plan tasks for the user. Return JSON only, matching the schema. Use op create_task for a to-do, " +
            "propose_memory for a fact worth keeping, note for advice. Keep titles short.\nGOAL: " + clip(input.localGoal || input.goal, 800) +
            (input.localContext ? "\nCONTEXT:\n" + clip(input.localContext, 1500) : "");
          const out = await localCall(prompt, PLAN_JSON_SCHEMA);
          const v = validatePlan(parseJson(out && out.text), { knownRefs: [] });
          if (v.ok) {
            const receipt = recordReceipt({ route: byDesign ? "on-device-nano" : "local-fallback", status: byDesign ? "completed" : "fallback",
              model: (out && out.model) || "Gemini Nano", requestedMode, latencyMs: now() - t1, fallbackReason: byDesign ? null : reason,
              approvalState: v.plan.steps.some((s) => s.status === "PENDING_APPROVAL") ? "pending" : "not-applicable",
              egress: { tier: DISCLOSURE_TIERS.LOCAL_ONLY }, contributors: { local_deterministic: true, local_ai: true } });
            receipts.push(receipt);
            return { ok: true, source: "on-device-nano", plan: v.plan, receipts,
              fallback: byDesign ? null : { from: "cloud", errorClass: cls, reason } };
          }
        } catch (e) { /* Nano failed or returned something invalid: use the deterministic plan */ }
      }
      const p = deterministicPlan(input.localGoal || input.goal);
      const receipt = recordReceipt({ route: "local-deterministic", status: byDesign ? "completed" : "fallback", requestedMode,
        latencyMs: now() - t1, fallbackReason: byDesign ? null : reason,
        approvalState: p.steps.some((s) => s.status === "PENDING_APPROVAL") ? "pending" : "not-applicable",
        egress: { tier: DISCLOSURE_TIERS.LOCAL_ONLY }, contributors: { local_deterministic: true } });
      receipts.push(receipt);
      return { ok: true, source: "deterministic", plan: p, receipts, fallback: byDesign ? null : { from: "cloud", errorClass: cls, reason } };
    }

    if (!cloudAllowed) {
      return localPath(mode === "only_on_device" || state.offlineDemo ? "local-only route" : "offline", "offline", true);
    }

    /* ---- cloud path ---- */
    let disclosure = null;
    const calls = [];
    let bytes = 0;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timer = null;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        try { if (controller) controller.abort(); } catch (e) { /* ignore */ }
        const e = new Error("The planner did not finish within " + Math.round(budgetMs / 1000) + " s (timeout).");
        e.code = "timeout";
        reject(e);
      }, budgetMs);
    });
    const guarded = (p) => Promise.race([p, deadline]);

    try {
      /* A. Egress gate */
      disclosure = await egress.createDisclosure({ purpose: "plan", payload: {
        instructions: PLAN_INSTRUCTIONS, goal: clip(input.goal, 800),
        task_refs: taskRefs.map((r) => clip(r.line, 200)).slice(0, 24),
        constraints: (input.constraints || []).map((c) => clip(c, 200)).slice(0, 8) } });
      await egress.approve(disclosure, opt.approvedBy || "plan_click");
      const verdict = await egress.verify(disclosure);
      if (!verdict.ok) { const e = new Error("Refused: the disclosure is not valid to send: " + verdict.reason + "."); e.code = verdict.code; throw e; }
      const text = egress.serialize(disclosure);
      if (egress.scanPrivate(text).length) { const e = new Error("Refused: the outbound text contains values registered as private."); e.code = "private_value_blocked"; throw e; }
      egress.markSent(disclosure, { route: "cloud-blindfold", bytes: text.length, purpose: "plan" });
      bytes += text.length;

      /* B. Bounded function calling */
      const contents = [{ role: "user", parts: [{ text }] }];
      let rounds = 0;
      let model = null;
      for (;;) {
        const r = await guarded(cloudCall({ tools: toolDeclarations(), contents, signal: controller && controller.signal }));
        model = r.model || model;
        const fcs = (r.response && typeof r.response.functionCalls === "function" && r.response.functionCalls()) || [];
        if (!fcs.length || rounds >= MAX_TOOL_ROUNDS) break;
        const modelTurn = (r.response.candidates && r.response.candidates[0] && r.response.candidates[0].content) ||
          { role: "model", parts: fcs.map((fc) => ({ functionCall: fc })) };
        const answers = [];
        fcs.slice(0, MAX_CALLS_PER_ROUND).forEach((fc) => {
          const c0 = now();
          let result;
          try { result = validateToolResult(fc.name, runLocalTool(fc.name, fc.args, facts)); }
          catch (e) { if (e.code === "tool_result_invalid") throw e; result = { error: "unknown_tool" }; }
          if (result.error) { answers.push({ functionResponse: { name: String(fc.name).slice(0, 40), response: result } }); return; }
          const json = JSON.stringify(result);
          if (egress.scanPrivate(json).length) { const e = new Error("Refused: a tool result contained a registered private value."); e.code = "private_value_blocked"; throw e; }
          bytes += json.length;
          calls.push({ name: fc.name, durationMs: now() - c0 });
          answers.push({ functionResponse: { name: fc.name, response: result } });
        });
        contents.push(modelTurn, { role: "user", parts: answers });
        rounds += 1;
      }

      /* C. Structured JSON plan (separate request, no tools) */
      contents[contents.length - 1].parts.push({ text: FINAL_INSTRUCTION });
      const fin = await guarded(cloudCall({
        generationConfig: { responseMimeType: "application/json", responseSchema: planResponseSchema() },
        contents, signal: controller && controller.signal }));
      model = fin.model || model;
      let raw = "";
      try { raw = fin.response.text(); } catch (e) { raw = ""; }
      const parsed = parseJson(raw);
      if (parsed === undefined) { const e = new Error("The model's plan was not valid JSON."); e.code = "invalid_plan"; throw e; }

      /* D. Guardian gate */
      const v = validatePlan(parsed, { knownRefs });
      if (!v.ok) { const e = new Error("The model's plan failed validation: " + v.errors.slice(0, 3).join("; ")); e.code = "invalid_plan"; throw e; }
      clearTimeout(timer);
      const receipt = recordReceipt({ route: "cloud-blindfold", status: "completed", model: model || "cloud model", requestedMode,
        latencyMs: now() - t0, functionCalls: calls,
        approvalState: v.plan.steps.some((s) => s.status === "PENDING_APPROVAL") ? "pending" : "not-applicable",
        egress: { tier: DISCLOSURE_TIERS.APPROVED_CLOUD, purpose: "plan", digest: disclosure.contentDigest, bytes,
          fields: Object.keys(disclosure.payload) },
        contributors: { local_deterministic: true, cloud_ai: true } });
      receipts.push(receipt);
      return { ok: true, source: "cloud-blindfold", plan: v.plan, receipts, fallback: null, rounds, model };
    } catch (err) {
      clearTimeout(timer);
      try { if (controller) controller.abort(); } catch (e) { /* ignore */ }
      let cls = err && err.code === "invalid_plan" ? "other" : err && err.code === "tool_result_invalid" ? "blocked" : classifyError(err);
      const sent = !!(disclosure && disclosure.approvalState === "sent");
      const status = cls === "timeout" ? "timed_out" : (cls === "blocked" || cls === "private_value_blocked") ? "blocked_egress"
        : err && err.code === "invalid_plan" ? "rejected" : "failed";
      receipts.push(recordReceipt({ route: "cloud-blindfold", status, requestedMode, latencyMs: now() - t0, functionCalls: calls,
        approvalState: disclosure ? "approved" : "not-applicable", errorCode: (err && err.code) || cls,
        egress: sent ? { tier: DISCLOSURE_TIERS.APPROVED_CLOUD, purpose: "plan", digest: disclosure.contentDigest, bytes,
            fields: Object.keys(disclosure.payload) }
          : { tier: DISCLOSURE_TIERS.BLOCKED, purpose: disclosure ? "plan" : null, blockedCode: (err && err.code) || cls } }));
      const reason = err && err.code === "invalid_plan" ? "the cloud returned a plan that failed validation"
        : err && err.code === "tool_result_invalid" ? "a local tool result was refused before sending"
        : FALLBACK_TEXT[cls] || FALLBACK_TEXT.other;
      return localPath(reason, cls, false);
    }
  }

  return { plan, stepsToProposals, deterministicPlan, validateToolResult, runLocalTool, TOOL_NAMES };
}
