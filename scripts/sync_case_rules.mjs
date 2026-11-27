/* AION Hybrid Web - copy the Case rules from public/case.js into src/caseRules.js. Apache-2.0.
 * Created by Anshul Reddy (idea and project owner) for #BuildHybridAI 2026.
 *
 * public/case.js is a classic script and src/caseRules.js is an ES module, so
 * the pure rules live in both. Edit them in case.js, between the
 * "RULES START" and "RULES END" markers, then run:
 *
 *   node scripts/sync_case_rules.mjs          (writes src/caseRules.js)
 *   node scripts/sync_case_rules.mjs --check  (exit 1 if the two differ)
 *
 * The engine tests' parity checks fail when this has not been run.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const START = /^\s*\/\* ==== RULES START/;
const END = /^\s*\/\* ==== RULES END ==== \*\/\s*$/;

function block(lines, file) {
  const a = lines.findIndex((l) => START.test(l));
  const b = lines.findIndex((l) => END.test(l));
  if (a < 0 || b < a) throw new Error(file + ": RULES START / RULES END markers not found");
  return { a, b };
}

const caseLines = readFileSync(join(root, "public", "case.js"), "utf8").split("\n");
const src = block(caseLines, "public/case.js");
const body = caseLines.slice(src.a, src.b + 1).map((l) => (l.startsWith("  ") ? l.slice(2) : l));

const rulesPath = join(root, "src", "caseRules.js");
const rulesLines = readFileSync(rulesPath, "utf8").split("\n");
const dst = block(rulesLines, "src/caseRules.js");
const next = rulesLines.slice(0, dst.a).concat(body, rulesLines.slice(dst.b + 1)).join("\n");

if (process.argv.includes("--check")) {
  const same = next === rulesLines.join("\n");
  console.log(same ? "caseRules.js matches case.js" : "caseRules.js differs from case.js: run node scripts/sync_case_rules.mjs");
  process.exitCode = same ? 0 : 1;
} else {
  writeFileSync(rulesPath, next);
  console.log("src/caseRules.js: copied " + body.length + " lines from public/case.js");
}
