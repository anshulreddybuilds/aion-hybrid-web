/* AION Hybrid Web - quote reader tests on five realistic supplier quotes. Apache-2.0.
 * Created by Anshul Reddy (idea and project owner) for #BuildHybridAI 2026.
 *
 * Run: node tests/quotes.test.mjs
 * No browser, no network, no dependencies. Exit code 1 on any failure.
 * Each quote goes through BOTH copies of the rules (src/caseRules.js and
 * public/case.js) and the two must agree exactly.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import * as rules from "../src/caseRules.js";
import { QUOTES, DATES } from "./fixtures/quotes.mjs";

const here = dirname(fileURLToPath(import.meta.url));
let passed = 0, failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed += 1; console.log("PASS " + name); }
  else { failed += 1; console.log("FAIL " + name + (detail === undefined ? "" : " :: " + JSON.stringify(detail).slice(0, 400))); }
}

function loadCaseJs() {
  const src = readFileSync(join(here, "..", "public", "case.js"), "utf8");
  const win = {};
  const doc = { readyState: "complete", getElementById: () => null, addEventListener: () => {} };
  const ctx = vm.createContext({ window: win, document: doc, navigator: {}, setTimeout, clearTimeout, console, Date, Math, JSON, Promise });
  vm.runInContext(src, ctx, { filename: "case.js" });
  return win.AionCase;
}
const AC = loadCaseJs();
const isoDay = (ms) => (typeof ms === "number" ? new Date(ms).toISOString().slice(0, 10) : null);

/* ---------- single dates ---------- */
for (const d of DATES) {
  const r = rules.readDate(d.text);
  const label = "date: \"" + d.text + "\"";
  if (d.ambiguous) ok(label + " is refused as ambiguous, not guessed", !!(r && r.invalid && r.ambiguous), r);
  else if (d.invalid) ok(label + " is refused as not a real date", !!(r && r.invalid && !r.ambiguous), r);
  else if (d.day === null) ok(label + " reads no date", r === null, r);
  else ok(label + " -> " + d.day + (d.time != null ? " " + d.time + " min" : ""), !!r && !r.invalid && isoDay(r.day) === d.day && r.time === d.time, r && { day: isoDay(r.day), time: r.time, label: r.label });
  ok(label + " (case.js agrees)", JSON.stringify(AC.readDate(d.text)) === JSON.stringify(r));
}

/* ---------- five quotes, end to end ---------- */
for (const fx of QUOTES) {
  const n = fx.name.split(":")[0];
  const q = rules.quoteFromText(fx.text);
  ok(n + ": supplier read", q.supplier === fx.expect.supplier, q.supplier);
  ok(n + ": quoteFromText agrees with case.js", JSON.stringify(AC.quoteFromText(fx.text)) === JSON.stringify(q));
  if (fx.expect.headings) {
    for (const [h, re] of Object.entries(fx.expect.headings)) {
      const p = q.paragraphs.find((x) => x.heading === h);
      ok(n + ": '" + h + "' passage holds its own text", !!p && re.test(p.text), q.paragraphs);
    }
  }
  const c = { id: "fx", kind: "case", inputRevision: 1,
    paragraphs: q.paragraphs.map((p, i) => ({ id: "P" + (i + 1), heading: p.heading, text: p.text, shared: true })),
    privateConstraints: fx.privateConstraints };
  const r = rules.reconcile(c);
  ok(n + ": reconcile agrees with case.js", JSON.stringify(AC.reconcile(c)) === JSON.stringify(r));
  const byId = Object.fromEntries(r.checks.map((k) => [k.id, k]));
  const b = byId.budget || {};
  const e = fx.expect.price;
  ok(n + ": price " + e.amount + " " + e.currency, b.quoteAmount === e.amount && b.currency === e.currency, { amount: b.quoteAmount, currency: b.currency, detail: b.detail });
  ok(n + ": tax basis read as " + e.taxIncluded, b.taxIncluded === e.taxIncluded, b.taxIncluded);
  if (e.taxRate != null) ok(n + ": stated tax rate " + e.taxRate + "% used", b.taxRate === e.taxRate, b.taxRate);
  const dl = byId.deadline || {};
  if (fx.expect.delivery) {
    ok(n + ": delivery " + fx.expect.delivery.day + (fx.expect.delivery.time != null ? " at " + fx.expect.delivery.time + " min" : ""),
      !!dl.deliveryRead && dl.deliveryRead.day === fx.expect.delivery.day && dl.deliveryRead.time === fx.expect.delivery.time, dl.deliveryRead || dl.detail);
  } else {
    ok(n + ": no delivery date is invented", !dl.deliveryRead, dl.deliveryRead);
  }
  if (fx.expect.leadTime) ok(n + ": the lead time is named instead of a date", !!dl.leadTime && /lead time/i.test(dl.detail), dl.detail);
  if (fx.expect.terms) ok(n + ": delivery terms " + fx.expect.terms.join(", "), JSON.stringify(b.terms) === JSON.stringify(fx.expect.terms), b.terms);
  if (fx.expect.install) ok(n + ": installation " + fx.expect.install, rules.installStatus(c).state === fx.expect.install, rules.installStatus(c));
  for (const [id, st] of Object.entries(fx.expect.checks)) ok(n + ": " + id + " check is " + st, byId[id] && byId[id].status === st, byId[id] || r.checks.map((k) => k.id));
  ok(n + ": verdict " + fx.expect.verdict, r.verdict === fx.expect.verdict, r.checks.map((k) => k.id + "=" + k.status + ": " + k.detail));
}

/* ---------- currencies are never mixed ---------- */
{
  const fx = QUOTES[4];
  const q = rules.quoteFromText(fx.text);
  const c = { paragraphs: q.paragraphs.map((p, i) => ({ id: "P" + (i + 1), heading: p.heading, text: p.text, shared: true })),
    privateConstraints: Object.assign({}, fx.privateConstraints, { maxBudget: "Rs 7,00,000" }) };
  const b = rules.reconcile(c).checks.find((k) => k.id === "budget");
  ok("currency: a USD quote against a rupee limit is not compared", b.status === "unknown" && /USD/.test(b.detail) && /INR/.test(b.detail) && /convert/i.test(b.detail), b.detail);
}

/* ---------- the on-device provisional check reads the same dates ---------- */
{
  const B = await import("../src/border.js");
  for (const fx of QUOTES.slice(0, 4)) {
    const q = rules.quoteFromText(fx.text);
    const shared = q.paragraphs.map((p, i) => ({ id: "P" + (i + 1), heading: p.heading, text: p.text }));
    const v = await B.provisionalVerdictLocal(shared, { nanoReady: false });
    ok("provisional (" + fx.name.split(":")[0] + "): sees the delivery date and the price", !/no delivery date|no price/.test(v.why), v.why);
  }
}

console.log("QUOTE TESTS: " + passed + " passed, " + failed + " failed");
if (failed) process.exitCode = 1;
