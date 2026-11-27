/* AION Hybrid Web - failed sends, retries and the send route. Apache-2.0.
 * Created by Anshul Reddy (idea and project owner) for #BuildHybridAI 2026.
 *
 * Run: node tests/send.test.mjs
 * No browser, no network. egress.js runs for real; hybrid.js and stage.js need
 * Firebase and a page, so for those two the checks read the source (labelled
 * "source:").
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
let passed = 0, failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed += 1; console.log("PASS " + name); }
  else { failed += 1; console.log("FAIL " + name + (detail === undefined ? "" : " :: " + JSON.stringify(detail).slice(0, 300))); }
}

/* A stand-in fetch so the outbound monitor can be installed and fed bodies. */
globalThis.window = { fetch: async () => ({ ok: true }) };
const E = await import("../src/egress.js");
E.installOutboundMonitor();
const URL_AI = "https://firebasevertexai.googleapis.com/v1beta/projects/p/models/m:streamGenerateContent";
const payload = () => ({ instructions: "Check this quote.", question: "Is it fine?", shared_passages: [{ id: "P1", text: "Delivery on 11 December 2026." }] });

{
  const d = await E.createDisclosure({ purpose: "case_research", payload: payload(), caseId: "c1", inputRevision: 3 });
  await E.approve(d, "user_click");
  ok("approve: approved before the send", E.isApproved(d) && (await E.verify(d, { currentInputRevision: 3 })).ok);

  E.markSent(d, { route: "prefer_in_cloud" });
  ok("send: the approval is held while the request is out", !E.isApproved(d) && (await E.verify(d)).code === "disclosure_used");

  const kept = E.releaseAfterFailure(d, { reason: "timeout" });
  ok("failed send: the approval is kept for a retry", kept === true && E.isApproved(d) && d.approvalState === "approved");
  ok("failed send: the retry still verifies for the same text and revision", (await E.verify(d, { currentInputRevision: 3 })).ok);
  ok("failed send: a changed case still makes it stale", (await E.verify(d, { currentInputRevision: 4 })).code === "disclosure_stale");
  ok("failed send: the log says it failed and the approval was kept", E.egressLog().some((l) => l.requestId === d.requestId && l.failed && l.approvalKept && l.reason === "timeout"));

  E.markSent(d, { route: "prefer_in_cloud" });
  ok("successful send: the approval is used up (no release)", !E.isApproved(d) && (await E.verify(d)).code === "disclosure_used");
  ok("release only after a send: releasing an unknown disclosure does nothing", E.releaseAfterFailure({ requestId: "nope" }) === false);
  let used = null; try { await E.approve(d, "user_click"); } catch (e) { used = e.code; }
  ok("successful send: approving the same disclosure again is refused", used === "disclosure_used");
}

{
  /* A retry's request body belongs to the retry, not to the failed attempt. */
  const d = await E.createDisclosure({ purpose: "case_research", payload: payload(), caseId: "c2", inputRevision: 1 });
  await E.approve(d, "user_click");
  const body = JSON.stringify({ contents: [{ parts: [{ text: E.serialize(d) }] }] });
  E.markSent(d);
  ok("observation: nothing seen before any body", E.observation(d.requestId).bodyObserved === false);
  E.releaseAfterFailure(d, { reason: "offline" });
  E.markSent(d);
  await window.fetch(URL_AI, { method: "POST", body });
  const ob = E.observation(d.requestId);
  ok("observation: the retry's body is seen once, on the latest attempt", ob.bodyObserved === true && ob.bodies.length === 1, ob);
}

/* ---------- source checks: hybrid.js, stage.js, index.html ---------- */
const hy = readFileSync(join(here, "..", "src", "hybrid.js"), "utf8");
ok("source: the default route is on this device (PREFER_ON_DEVICE)", /const DEFAULT_MODE = "prefer_on_device";/.test(hy));
ok("source: Send follows the picked route (no hard-coded ONLY_IN_CLOUD for every case send)",
  /const route = opts && SEND_ROUTES\[opts\.mode\] \? opts\.mode : state\.mode;/.test(hy) &&
  !/mode: "only_in_cloud", disclosure: d \}\)\)/.test(hy));
ok("source: ONLY_ON_DEVICE is refused for a case send", /refused\("route_on_device"/.test(hy));
ok("source: both failure exits of generate() keep the approval", (hy.match(/err\.approvalKept = keepApproval\(disclosure/g) || []).length === 2);
const stage = readFileSync(join(here, "..", "public", "stage.js"), "utf8");
ok("source: a failed send shows a short plain message, not the raw error", /line\.textContent = failText\(r\)/.test(stage) && !/String\(r\.error\)\.split/.test(stage));
ok("source: the Get Nano ready button downloads, then loads Nano", /hy\.downloadNano\(\)/.test(stage) && /hy\.local\.warm\(\)/.test(stage));
const html = readFileSync(join(here, "..", "public", "index.html"), "utf8");
ok("source: index.html has the Get Nano ready button on step 01 and step 03", (html.match(/data-nano-btn=""/g) || []).length === 2);

console.log("SEND TESTS: " + passed + " passed, " + failed + " failed");
if (failed) process.exitCode = 1;
