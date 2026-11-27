/* AION Ghost-Math - scale / stand-in / restore tests. Apache-2.0.
 * Created by Anshul Reddy (idea and project owner) for #BuildHybridAI 2026.
 *
 * Run: node tests/ghost.test.mjs
 * No browser, no network. src/ghostMath.js, contracts.js and egress.js run for
 * real; the "cloud" here is plain code that does honest (or hostile) maths on
 * exactly the lines a real send would carry.
 */
import * as G from "../src/ghostMath.js";
import { SAMPLE_SMS, SAMPLE_BUDGET } from "../src/ghostSamples.js";
import { validatePayload, RECEIPT_ROUTES } from "../src/contracts.js";

let passed = 0, failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed += 1; console.log("PASS " + name); }
  else { failed += 1; console.log("FAIL " + name + (detail === undefined ? "" : " :: " + JSON.stringify(detail).slice(0, 400))); }
}
globalThis.window = { fetch: async () => ({ ok: true }) };
const E = await import("../src/egress.js");

/* A seeded random source so failures can be replayed. */
function seeded(seed) { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }

/* An honest cloud: reads only the sent lines and does the maths on them. */
function honestCloud(lines) {
  let income = 0, spend = 0, housing = 0; const by = {};
  lines.forEach((l) => {
    const [, dir, , cat, amt] = l.split(" | "); const a = Number(amt);
    if (dir === "credit") income += a; else if (cat !== "savings") { spend += a; by[cat] = (by[cat] || 0) + a; if (cat === "rent" || cat === "emi") housing += a; }
  });
  return { income, spend, breakdown: Object.keys(by).map((c) => ({ category: c, amount: by[c] })),
    rent_emi_share: income ? housing / income : housing / spend, savings_rate: income ? (income - spend) / income : 0,
    tips: [{ text: "Pay Person_A on time; rent is {amount}.", amount: by.rent || 0 }, { text: "Merchant_B costs you ₹" + Math.round(by.food || 0) + " a month.", amount: by.food || 0 }] };
}

/* ------------------------------ parsing ------------------------------ */
{
  const { entries, skipped } = G.parseInput(SAMPLE_SMS);
  ok("sms: 12 alerts read, none skipped", entries.length === 12 && skipped.length === 0, { n: entries.length, skipped });
  ok("sms: salary is a credit of 85,000, not the balance", entries[0].direction === "credit" && entries[0].amount === 85000 && entries[0].category === "income");
  ok("sms: card spend takes the spend, not the available limit", entries[4].amount === 649 && entries[4].category === "subscriptions");
  ok("sms: '; HDFC LTD credited' is still a debit (EMI)", entries[2].direction === "debit" && entries[2].category === "emi" && entries[2].amount === 12450);
  ok("sms: UPI rent to a person is rent, payee is a person", entries[1].category === "rent" && entries[1].partyKind === "person" && entries[1].party === "rameshkumar");
  ok("sms: P2P transfer to a named person", entries[6].party === "Priya Sharma" && entries[6].partyKind === "person" && entries[6].category === "transfers");
  ok("sms: VPA merchants get their category", entries[3].category === "food" && entries[5].category === "groceries" && entries[10].category === "transport");
  ok("sms: Info: field read as the payee (SIP is savings)", entries[11].category === "savings" && /groww/i.test(entries[11].party));
  ok("amounts: lakh and k units", G.toNumber("2.4", "lakh") === 240000 && G.toNumber("6", "k") === 6000 && G.toNumber("1,02,345.67") === 102345.67);
  ok("amounts: a line that is only a balance has no amount", G.findAmount("Avl Bal Rs 51,200.00") === null);
}
{
  const { entries } = G.parseInput(SAMPLE_BUDGET);
  ok("budget: 9 lines read", entries.length === 9);
  ok("budget: salary is income, rent and EMI found", entries[0].direction === "credit" && entries[1].category === "rent" && entries[2].category === "emi");
  ok("budget: labels are stand-in items", entries.slice(1).every((e) => e.partyKind === "item"));
  const junk = G.parseInput("hello there\nRent: 10000\nrandom words 12 abc");
  ok("budget: unreadable lines are counted as skipped, not guessed", junk.entries.length === 1 && junk.skipped.length === 2, junk);
}

/* ------------------------------ rule engine ------------------------------ */
{
  const s = G.summarize(G.parseInput(SAMPLE_SMS).entries);
  ok("rules: income, spend (SIP excluded) and invested", s.income === 85000 && s.spend === 46777 && s.invested === 5000, s);
  ok("rules: rent+EMI share of income", Math.abs(s.rentEmiShare - 36450 / 85000) < 1e-9 && s.rentEmiBase === "income");
  ok("rules: savings rate", Math.abs(s.savingsRate - (85000 - 46777) / 85000) < 1e-9);
  ok("rules: breakdown sorted, rent first", s.breakdown[0].category === "rent" && s.breakdown[0].amount === 24000);
  const tips = G.localTips(s);
  ok("rules: 1 to 3 local tips with real-rupee amounts", tips.length >= 1 && tips.length <= 3 && tips.every((t) => t.amount >= 0 && t.text.includes("{amount}")));
  const noIncome = G.summarize(G.parseInput("Rent: 10000\nFood: 5000").entries);
  ok("rules: with no income, the share is of spending and the savings rate is unknown", noIncome.rentEmiBase === "spending" && noIncome.savingsRate === null);
  ok("rupees: Indian grouping", G.rupees(102345.67) === "₹1,02,346" && G.rupees(999) === "₹999" && G.rupees(1200) === "₹1,200");
}

/* ------------------------------ k ------------------------------ */
{
  ok("k: random 0 gives the low end, random ~1 stays below the top", G.pickK(() => 0) === 0.55 && G.pickK(() => 0.999999) < 0.95);
  let inRange = true; const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const s = G.createSession(); const x = s.unscale(1); const k = 1 / x;
    if (!(k >= G.K_MIN && k < G.K_MAX)) inRange = false; seen.add(k.toFixed(6));
  }
  ok("k: 300 real sessions (crypto random) all in [0.55, 0.95)", inRange);
  ok("k: sessions pick different k", seen.size > 290, seen.size);
  const s = G.createSession({ k: 0.7 });
  const exposed = Object.keys(s).concat(Object.getOwnPropertyNames(s));
  ok("k: the session object has no k field and serializes to no number", !exposed.includes("k") && !/\d/.test(JSON.stringify(s)));
  let threw = false; try { G.createSession({ k: 1.2 }); } catch (e) { threw = true; }
  ok("k: a k outside the range is refused", threw);
}

/* ------------------------------ mask ------------------------------ */
const entries = G.parseInput(SAMPLE_SMS).entries;
{
  const s = G.createSession({ random: seeded(7) });
  const m = s.mask(entries);
  const text = m.lines.join("\n");
  ok("mask: one line per entry, 5 fields each", m.lines.length === 12 && m.lines.every((l) => l.split(" | ").length === 5));
  ok("mask: no real name in the sent lines", G.leakCheck(text, entries).nameHits.length === 0 && G.leakCheck(text, entries).namesChecked >= 10, G.leakCheck(text, entries));
  ok("mask: no account numbers, UPI refs, dates or SMS words", !/XX4821|4321|3312|UPI|Ref|\d{2}[-\/]\d{2}|Avl|debited from/i.test(text), text);
  ok("mask: no real amount sent as it is", m.rows.every((r) => r.sent !== Math.round(r.real)));
  ok("mask: sent amounts are whole numbers", m.rows.every((r) => Number.isInteger(r.sent)));
  ok("mask: the same payee keeps the same stand-in", (() => { const again = s.mask(entries); return again.lines.join() === m.lines.join(); })());
  const two = G.parseInput("Rs.100.00 debited from A/c XX1 to VPA swiggy@icici\nRs.200.00 debited from A/c XX1 to VPA swiggy@icici");
  const m2 = G.createSession({ k: 0.8 }).mask(two.entries);
  ok("mask: two payments to one merchant share one stand-in", m2.rows[0].standIn === m2.rows[1].standIn && m2.rows[0].standIn === "Merchant_A");
  ok("mask: stand-in prefixes by kind", m.rows[0].standIn === "Payer_A" && m.rows[1].standIn === "Person_A" && m.rows[2].standIn.indexOf("Merchant_") === 0);
  const ratios = m.rows.map((r) => r.sent / r.real);
  ok("mask: a known price gives only a blurred k (per-entry wobble)", Math.max(...ratios) - Math.min(...ratios) > 0.001, ratios);
  ok("mask: realNames skips category words like 'Groceries'", !G.createSession({ k: 0.6 }).realNames().length &&
    (() => { const b = G.createSession({ k: 0.6 }); b.mask(G.parseInput(SAMPLE_BUDGET).entries); return !b.realNames().includes("Groceries") && b.realNames().includes("Rent to Mr Sharma"); })());
}

/* ------------------------------ round trips ------------------------------ */
for (const k of [0.55, 0.7, 0.8137, 0.95]) {
  const s = G.createSession({ k, wobble: 0 });
  const m = s.mask(entries);
  const worst = Math.max(...m.rows.map((r) => Math.abs(s.unscale(r.sent) - r.real)));
  ok("round trip (k=" + k + ", no wobble): every amount back within 0.5/k rupee", worst <= 0.5 / k + 1e-9, worst);
}
for (let seed = 1; seed <= 20; seed++) {
  const s = G.createSession({ random: seeded(seed) });
  const m = s.mask(entries);
  const back = s.restore(honestCloud(m.lines));
  const local = G.summarize(entries);
  const a = G.agreement(local, back, G.WOBBLE + 0.005);
  if (seed <= 5 || !(a.spend && a.income && a.rentEmiShare && a.savingsRate)) {
    ok("round trip (seed " + seed + "): honest cloud's maths, restored, agrees with the rules", a.spend && a.income && a.rentEmiShare && a.savingsRate, { a, back, local });
  }
  if (seed === 20) ok("round trip: 20 random sessions all agree", true);
}
{
  const s = G.createSession({ k: 0.8, wobble: 0 });
  const m = s.mask(entries);
  const back = s.restore(honestCloud(m.lines));
  ok("restore: stand-ins in tip text become real names", back.tips[0].text.includes("rameshkumar") && !back.tips[0].text.includes("Person_A"), back.tips[0]);
  ok("restore: {amount} filled with the real rupee figure", back.tips[0].text.includes(G.rupees(24000)), back.tips[0].text);
  ok("restore: a ₹ figure written in the text is unscaled too", back.tips[1].text.includes("swiggy") && back.tips[1].text.includes(G.rupees(839)), back.tips[1].text);
  ok("restore: breakdown back in real rupees", Math.abs(back.breakdown.find((b) => b.category === "rent").amount - 24000) <= 1);
  ok("restore: shares come back unchanged (k cancels)", Math.abs(back.rentEmiShare - 36450 / 85000) < 0.001);
  ok("restoreText: unknown stand-ins are left as they are", s.restoreText("Merchant_ZZ is new") === "Merchant_ZZ is new");
  ok("restoreText: the word 'yours 5' is not read as rupees", s.restoreText("yours 5 times") === "yours 5 times");
}

/* ------------------------------ hostile cloud ------------------------------ */
{
  const s = G.createSession({ k: 0.6, wobble: 0 });
  s.mask(entries);
  const bad = s.restore({ income: "lots", spend: NaN, breakdown: [{ category: "<img src=x onerror=alert(1)>", amount: 60 }, { category: "food", amount: "9" }],
    rent_emi_share: 43, savings_rate: null, tips: Array.from({ length: 9 }, (_, i) => ({ text: "tip " + i + " {amount}", amount: -5 })) });
  ok("hostile: non-numbers become null, never NaN", bad.income === null && bad.spend === null && bad.savingsRate === null);
  ok("hostile: unknown category becomes 'other'; a string amount is dropped", bad.breakdown.length === 1 && bad.breakdown[0].category === "other" && bad.breakdown[0].amount === 100);
  ok("hostile: a percent like 43 is read as 0.43", Math.abs(bad.rentEmiShare - 0.43) < 1e-9);
  ok("hostile: negative tip amounts clamped to 0", bad.tips.every((t) => t.amount === 0));
  ok("hostile: chooseTips shows at most 3 and drops tips with no figure", G.chooseTips(bad.tips, []).tips.length === 0);
  ok("hostile: null / empty reply restores to empty", s.restore(null).breakdown.length === 0 && s.restore(null).tips.length === 0);
  const lying = honestCloud(s.mask(entries).lines); lying.spend *= 2;
  ok("hostile: a cloud that doubles spend is caught by the rules check", G.agreement(G.summarize(entries), s.restore(lying)).spend === false);
}

/* ------------------------------ exact figures and actionable tips ------------------------------ */
{
  const local = G.summarize(entries);
  const exact = G.exactFigures(entries, local);
  let allExact = true, bad = [];
  for (let seed = 1; seed <= 30; seed++) {
    const s = G.createSession({ random: seeded(seed) });
    const m = s.mask(entries);
    const back = s.restore(honestCloud(m.lines), exact);
    const rent = back.breakdown.find((b) => b.category === "rent").amount;
    if (rent !== 24000 || back.spend !== local.spend || back.income !== local.income || !back.tips[0].text.includes("₹24,000") || back.tips[0].text.includes("about")) { allExact = false; bad.push({ seed, rent, spend: back.spend, tip: back.tips[0].text }); }
  }
  ok("snap: across 30 random sessions rent reads exactly ₹24,000, spend and income exact", allExact, bad.slice(0, 2));
  const s = G.createSession({ k: 0.7 });
  s.mask(entries);
  const back = s.restore({ spend: 46777 * 0.7, tips: [{ text: "Cut Merchant_B orders by half to free {amount}.", amount: 293.65 }] }, exact);
  ok("snap: a figure the rules do not know is marked 'about'", /about ₹420/.test(back.tips[0].text) && back.tips[0].exact === false, back.tips[0]);
  ok("snap: raw numbers are kept for the maths check", Math.abs(back.raw.spend - 46777) < 1e-6);
  ok("snap: a doubled spend is not snapped and still fails the check", (() => { const b = s.restore({ spend: 2 * 46777 * 0.7 }, exact); return b.spend > 90000 && G.agreement(local, b.raw).spend === false; })());
  ok("snap: nothing to snap to leaves the value alone", G.snap(123.4, []).value === 123.4 && G.snap(null, exact).value === null);
  const rulesTips = G.localTips(local).map((t) => ({ text: G.fillAmount(t.text, t.amount), amount: t.amount }));
  const statement = [{ text: "Your savings amount this month is ₹4,989.", amount: 4989 }, { text: "Your total spend on rent is ₹24,306.", amount: 24306 }];
  const picked = G.chooseTips(statement, rulesTips);
  ok("tips: statements with no action are dropped and the rules' tips fill in", picked.dropped === 2 && picked.tips.length === 2 && picked.tips.every((t) => t.from === "rules"), picked);
  const good = [{ text: "Cancel Merchant_C to free ₹649 a month.", amount: 649 }, { text: "Cut food delivery by a third to free about ₹280.", amount: 280 }, { text: "Prepay the car loan.", amount: 2000 }, { text: "Set a cap", amount: 10 }];
  const p2 = G.chooseTips(good, rulesTips);
  ok("tips: actionable model tips are kept, at most 3, all from the model", p2.tips.length === 3 && p2.tips.every((t) => t.from === "model") && p2.dropped === 0, p2);
  ok("tips: one good model tip gets one rules tip to make two", (() => { const r = G.chooseTips(good.slice(0, 1).concat(statement), rulesTips); return r.tips.length === 2 && r.tips[0].from === "model" && r.tips[1].from === "rules"; })());
  ok("instructions: ask for one concrete action per tip", /concrete action/.test(G.INSTRUCTIONS) && /do not just restate a total/.test(G.INSTRUCTIONS));
}

/* ------------------------------ the disclosure boundary ------------------------------ */
{
  const s = G.createSession({ random: seeded(3) });
  const m = s.mask(entries);
  const payload = G.buildPayload(m.lines);
  ok("contract: ghost_math payload passes the allowlist", validatePayload("ghost_math", payload).ok, validatePayload("ghost_math", payload).errors);
  ok("contract: an extra field (raw SMS) is refused", !validatePayload("ghost_math", Object.assign({ raw: SAMPLE_SMS }, payload)).ok);
  ok("contract: an over-long entry line is refused", !validatePayload("ghost_math", { instructions: "x", entries: ["x".repeat(91)] }).ok);
  ok("contract: cloud-ghost-math is a receipt route", RECEIPT_ROUTES.includes("cloud-ghost-math"));
  const d = await E.createDisclosure({ purpose: "ghost_math", payload });
  const text = E.serialize(d);
  ok("serialize: the outgoing text is the instructions plus the lines", text.startsWith(G.INSTRUCTIONS) && m.lines.every((l) => text.includes(l)));
  E.setPrivate("ghost_party", s.realNames());
  ok("scanner: 0 real names in the outgoing text", E.scanPrivate(text).length === 0, E.scanPrivate(text));
  ok("scanner: it would catch a real name that slipped in", E.scanPrivate(text + "\nT99 | debit | Priya Sharma | other | 5").length === 1);
  ok("instructions: no real name, no real amount", G.leakCheck(G.INSTRUCTIONS, entries).nameHits.length === 0 && !/\d{3,}/.test(G.INSTRUCTIONS));
  E.clearPrivate("ghost_party");
}

/* ------------------------------ purity ------------------------------ */
{
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/ghostMath.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  ok("ghostMath.js uses no fetch, document, localStorage, Date or Math.random", !/\bfetch\(|document\.|localStorage|Date\.|Math\.random/.test(src));
}

console.log("GHOST TESTS: " + passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
