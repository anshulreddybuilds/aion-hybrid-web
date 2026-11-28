/* AION Ghost-Math - edge cases and a fuzz test of the privacy boundary. Apache-2.0.
 * Created by Anshul Reddy (idea and project owner) for #BuildHybridAI 2026.
 *
 * Run: node tests/ghost_edge.test.mjs
 * Part 1: awkward real-world SMS and budget lines (OTP, failed, refunds, Hindi,
 * Hinglish, crore, no spaces, duplicates, over the limit, empty input).
 * Part 2: 400 random months of messages with random names and amounts. For each,
 * the exact text that would leave the device is checked: only stand-ins,
 * categories and scaled numbers; no real name, account number, reference, date
 * or real amount. No browser, no network.
 */
import * as G from "../src/ghostMath.js";
import { validatePayload } from "../src/contracts.js";

let passed = 0, failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed += 1; console.log("PASS " + name); }
  else { failed += 1; console.log("FAIL " + name + (detail === undefined ? "" : " :: " + JSON.stringify(detail).slice(0, 500))); }
}
globalThis.window = { fetch: async () => ({ ok: true }) };
const E = await import("../src/egress.js");
const one = (t) => G.parseInput(t).entries[0] || null;

/* ------------------------------ part 1: edge cases ------------------------------ */
{
  const e = (t) => { const x = one(t); return x ? [x.direction, x.amount, x.category].join(" ") : null; };
  const ign = (t) => (G.parseInput(t).ignored[0] || {}).reason || null;
  ok("ignore: a message carrying an OTP code is not a spend", ign("OTP for txn of Rs 2,500.00 at AMAZON is 482910. Do not share it.") === "one-time password" && ign("482910 is your OTP for txn of Rs 2,500 at AMAZON.") === "one-time password");
  ok("ignore: but a payment whose footer says 'never share your OTP' still counts", e("Rs.450.00 debited from A/c XX4821 to VPA swiggy@icici. Never share your OTP with anyone.") === "debit 450 food");
  ok("ignore: a failed or declined payment is not a spend", ign("Your txn of Rs 1,200.00 to VPA zomato@paytm has FAILED. Amount if debited will be refunded.") === "failed or declined" &&
    ign("Transaction of INR 3,000 on your card ending 4321 at FLIPKART was declined.") === "failed or declined");
  ok("ignore: a UPI collect request is not a payment", ign("Ramesh Kumar has requested money of Rs 500 from you on Google Pay.") === "payment request, not a payment");
  ok("ignore: a card-bill confirmation is not income (the bank debit already counts it)", ign("Payment of Rs 15,000.00 received towards your SBI Credit Card ending 4321.") !== null);
  ok("ignore: an ordinary bill that says 'thank you for your payment' still counts", e("Rs.1,180.00 paid to Airtel from A/c XX4821. Thank you for your payment.") === "debit 1180 bills");
  ok("ignore: a balance-only alert is not a transaction", G.parseInput("Your A/c XX4821 balance is Rs 51,200.00 as on 16-11-26.").entries.length === 0);
  ok("refund: a refund is money back, not income", e("Refund of Rs 499.00 from MYNTRA has been credited to your A/c XX4821.") === "credit 499 refund");
  ok("refund: a reversed failed payment is money back too", e("Rs 1,200 reversed to your A/c XX4821 for failed UPI txn to zomato@paytm") === "credit 1200 refund");
  const s = G.summarize(G.parseInput("Salary: 50000\nRs.3,000.00 debited from A/c XX1 to VPA amazon@apl\nRefund of Rs 1,000.00 from AMAZON has been credited to your A/c XX1").entries);
  ok("refund: income stays 50,000; spending is net (3,000 - 1,000)", s.income === 50000 && s.spend === 2000 && s.refunds === 1000 && Math.abs(s.savingsRate - 0.96) < 1e-9, s);
  ok("amount: crore and lakh", one("Rs 1.2 crore credited to your A/c XX1 by NEFT from ACME").amount === 12000000 && G.toNumber("2.4", "lakh") === 240000 && G.toNumber("3", "cr") === 30000000);
  ok("amount: Indian grouping up to a crore", one("INR 1,00,00,000.00 credited to A/c XX1 by RTGS from SALE").amount === 10000000);
  ok("amount: no space between amount and word reads 500, not 50", e("Rs500debited from A/c XX4821 to VPA swiggy@icici") === "debit 500 food");
  ok("amount: '650 rupees' is read", e("You paid 650 rupees to Uber via UPI") === "debit 650 transport");
  ok("amount: paise are kept; zero is not a transaction", one("Rs.0.50 debited from A/c XX1 to VPA test@upi").amount === 0.5 && G.parseInput("Rs.0.00 debited from A/c XX1 to VPA t@upi").entries.length === 0);
  ok("Hindi: a debit with ₹ and डेबिट, payee from the UPI handle", e("आपके खाते XX4821 से ₹500 डेबिट हुए, UPI swiggy@icici को। - SBI") === "debit 500 food" && one("आपके खाते XX4821 से ₹500 डेबिट हुए, UPI swiggy@icici को।").party === "swiggy");
  ok("Hindi: a salary credit (जमा, वेतन) is income", e("आपके खाते XX4821 में ₹25,000 जमा किए गए। वेतन NOV. - HDFC") === "credit 25000 income");
  ok("Hindi: रु is a rupee sign", one("आपके खाते से रु 750 डेबिट हुए") && one("आपके खाते से रु 750 डेबिट हुए").amount === 750);
  ok("Hinglish: 'bheje' is a debit", e("Rs 300 bheje Priya ko UPI se, A/c XX4821") === "debit 300 other");
  ok("budget: a label with digits ('flat 4B') uses the last number", e("Rent for flat 4B: 22,000") === "debit 22000 rent");
  ok("budget: '=', a dash, '/month' and a trailing dash are handled",
    e("EMI = 9800") === "debit 9800 emi" && one("- Groceries — ₹7,500").party === "Groceries" && e("Petrol 3000/month") === "debit 3000 transport");
  ok("budget: a negative figure is not guessed at", G.parseInput("Refund: -500").entries.length === 0 && G.parseInput("Refund: -500").skipped.length === 1);
  ok("budget: a line that is only a number is not a budget line", G.parseInput("98765 43210").entries.length === 0);
  ok("people: 'Sent Rs ... To Om' is a transfer to a person", one("Sent Rs.250.00 To Om On 09/11/26").partyKind === "person");
  const dup = "Rs.450.00 debited from A/c XX4821 on 06-11-26 to VPA swiggy@icici (UPI Ref 331200000111).";
  const d = G.parseInput(dup + "\n" + dup + "\n" + dup.toUpperCase());
  ok("duplicates: the same alert pasted twice (or in capitals) counts once, and is reported", d.entries.length === 1 && d.duplicates === 2);
  const many = Array.from({ length: 260 }, (_, i) => "Rs." + (100 + i) + ".00 debited from A/c XX1 to VPA shop" + i + "@upi").join("\n");
  const m = G.parseInput(many);
  ok("limit: 260 messages keep the first 200 and report the other 60", m.entries.length === 200 && m.overLimit === 60);
  ok("empty: empty or blank input gives nothing, and no error", ["", "   ", "\n\n\n", null, undefined].every((x) => { const r = G.parseInput(x); return r.entries.length === 0 && r.skipped.length === 0; }));
  ok("blank-line separated multi-line SMS are joined", G.parseInput("Rs.450.00 debited from A/c XX1\nto VPA swiggy@icici\n\nRs.200.00 debited from A/c XX1\nto VPA uber@hdfc").entries.length === 2);
  const s0 = G.summarize([]);
  ok("rules: an empty month does not divide by zero", s0.spend === 0 && s0.rentEmiShare === 0 && s0.savingsRate === null && G.localTips(s0).length >= 1);
  ok("rules: tips never show a negative or NaN figure", [G.summarize(G.parseInput("Salary: 10000\nRent: 90000").entries), s0].every((x) => G.localTips(x).every((t) => isFinite(t.amount) && t.amount >= 0)));
}

/* ------------------------------ part 2: fuzz the boundary ------------------------------ */
function seeded(seed) { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }
const PEOPLE = ["Priya Sharma", "Rahul Verma", "Anjali Nair", "Mohammed Irfan", "Sanjay Kumar Rao", "Kavya", "Om", "Fatima Begum",
  "Ravi", "Deepa Iyer", "Arjun Mehta", "Mom", "Rent Kumar", "Netflix Singh", "सीमा देवी", "राहुल"];
const SHOPS = ["swiggy", "zomato", "bigbasket", "uber", "airtel", "bescom", "netflix", "amazon", "myntra", "apollo", "dmart", "irctc", "Sharma General Store", "Gupta Medicals"];
const ACCT = () => "XX" + String(1000 + Math.floor(R() * 8999));
let R = Math.random;
function amount() {
  const kind = R();
  if (kind < 0.15) return (R() * 99 + 1).toFixed(2);
  if (kind < 0.75) return String(Math.round(R() * 9000 + 100));
  if (kind < 0.95) return String(Math.round(R() * 90000 + 10000));
  return String(Math.round(R() * 900000 + 100000));
}
const grp = (s) => { const [i, d] = String(s).split("."); const t = i.slice(-3), r = i.slice(0, -3); return (r ? r.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," : "") + t + (d ? "." + d : ""); };
const pick = (a) => a[Math.floor(R() * a.length)];
const TEMPLATES = [
  () => "Rs." + grp(amount()) + " debited from A/c " + ACCT() + " on 0" + (1 + Math.floor(R() * 9)) + "-11-26 to VPA " + pick(SHOPS).toLowerCase().replace(/\s+/g, "") + "@icici (UPI Ref 3312" + Math.floor(R() * 1e8) + ").",
  () => "Sent Rs." + grp(amount()) + " From HDFC Bank A/C *" + ACCT().slice(2) + " To " + pick(PEOPLE) + " On 1" + Math.floor(R() * 9) + "/11/26 Ref " + Math.floor(R() * 1e12),
  () => "Your A/c " + ACCT() + " is credited with Rs " + grp(amount()) + " on 01-11-26 by NEFT from " + pick(["ACME TECHNOLOGIES PVT LTD", "Kiran Rao", "Freelance Client LLP"]) + ". Avl Bal Rs " + grp(amount()),
  () => "Spent Rs " + grp(amount()) + " on your SBI Credit Card ending " + ACCT().slice(2) + " at " + pick(SHOPS).toUpperCase() + " on 07/11/26. Avl Lmt Rs " + grp(amount()),
  () => pick(["Rent to ", "Pocket money for ", "Gift to ", "Loan EMI to "]) + pick(PEOPLE) + ": " + grp(amount()),
  () => "आपके खाते " + ACCT() + " से ₹" + grp(amount()) + " डेबिट हुए, UPI " + pick(SHOPS).toLowerCase().replace(/\s+/g, "") + "@ybl को।",
  () => "Rs " + amount() + " bheje " + pick(PEOPLE) + " ko UPI se, A/c " + ACCT(),
  () => "OTP for txn of Rs " + grp(amount()) + " at " + pick(SHOPS) + " is " + Math.floor(100000 + R() * 899999) + ". Do not share.",
  () => "Your txn of Rs " + grp(amount()) + " to VPA " + pick(SHOPS).toLowerCase().replace(/\s+/g, "") + "@paytm has FAILED.",
  () => pick(PEOPLE) + " has requested money of Rs " + amount() + " from you on Google Pay.",
  () => "Refund of Rs " + grp(amount()) + " from " + pick(SHOPS).toUpperCase() + " has been credited to your A/c " + ACCT() + ".",
];
const LINE_RE = new RegExp("^T\\d{1,3} \\| (debit|credit) \\| (Person|Merchant|Payer|Item)_[A-Z]{1,2} \\| (" + G.CATEGORY_NAMES.join("|") + ") \\| \\d+$");
let mathsChecked = 0;
let badShape = [], nameLeaks = [], numberLeaks = [], otherLeaks = [], badPayload = [], scanner = [], maths = [], count = 0;
for (let seed = 1; seed <= 400; seed++) {
  R = seeded(seed);
  const n = 1 + Math.floor(R() * 40);
  const text = Array.from({ length: n }, () => pick(TEMPLATES)()).join("\n");
  const parsed = G.parseInput(text);
  if (!parsed.entries.length) continue;
  count++;
  const s = G.createSession({ random: seeded(seed * 7919) });
  const m = s.mask(parsed.entries);
  const payload = G.buildPayload(m.lines);
  const v = validatePayload("ghost_math", payload);
  if (!v.ok) badPayload.push({ seed, errors: v.errors.slice(0, 2) });
  const d = await E.createDisclosure({ purpose: "ghost_math", payload });
  const out = E.serialize(d);
  const entriesPart = out.slice(out.indexOf("ENTRIES:") + 8).trim();
  const lines = entriesPart.split("\n");
  lines.forEach((l) => { if (!LINE_RE.test(l)) badShape.push({ seed, l }); });
  /* real names: every party name from the input, not just the ones the scanner keeps */
  const low = out.toLowerCase();
  parsed.entries.forEach((e) => {
    const nm = String(e.party || "").toLowerCase().trim();
    if (nm.length >= 3 && G.CATEGORY_NAMES.indexOf(nm) < 0 && G.INSTRUCTIONS.toLowerCase().indexOf(nm) < 0 && low.indexOf(nm) >= 0) nameLeaks.push({ seed, name: e.party });
  });
  /* any person or shop name from the generator at all */
  PEOPLE.concat(SHOPS).forEach((nm) => {
    const t = nm.toLowerCase();
    if (t.length >= 4 && G.CATEGORY_NAMES.indexOf(t) < 0 && G.INSTRUCTIONS.toLowerCase().indexOf(t) < 0 && text.toLowerCase().indexOf(t) >= 0 && entriesPart.toLowerCase().indexOf(t) >= 0) nameLeaks.push({ seed, name: nm });
  });
  /* real amounts: a real amount of 100+ may only appear if it is also one of the sent numbers (coincidence) */
  const sentSet = new Set(m.rows.map((r) => String(r.sent)));
  const tokens = new Set(entriesPart.match(/\d+/g) || []);
  parsed.entries.forEach((e) => {
    const a = String(Math.round(e.amount));
    if (e.amount >= 100 && tokens.has(a) && !sentSet.has(a)) numberLeaks.push({ seed, amount: e.amount });
  });
  /* never: account numbers, references, dates, SMS words, Devanagari */
  if (/XX\d{3,}|\d{9,}|\d{2}[-\/]\d{2}[-\/]\d{2}|avl|debited|credited|upi ref|otp|[ऀ-ॿ]/i.test(entriesPart)) otherLeaks.push({ seed, sample: entriesPart.slice(0, 120) });
  E.setPrivate("ghost_party", s.realNames());
  if (E.scanPrivate(out).length) scanner.push({ seed, hits: E.scanPrivate(out) });
  /* maths still works on the fake numbers */
  let inc = 0, sp = 0, ref = 0, hous = 0;
  const by = {};
  m.lines.forEach((l) => { const [, dir, , cat, amt] = l.split(" | "); const a = +amt;
    if (dir === "credit") { if (cat === "refund") ref += a; else inc += a; } else if (cat !== "savings") { sp += a; by[cat] = (by[cat] || 0) + a; if (cat === "rent" || cat === "emi") hous += a; } });
  sp = Math.max(0, sp - ref);
  const back = s.restore({ income: inc, spend: sp, breakdown: Object.keys(by).map((c) => ({ category: c, amount: by[c] })), rent_emi_share: inc ? hous / inc : sp ? hous / sp : 0, savings_rate: inc ? (inc - sp) / inc : 0 });
  const local = G.summarize(parsed.entries);
  const a = G.agreement(local, back.raw, 0.05);
  /* The maths check is calibrated for ordinary months; a random month can be absurd
   * (spending 100x income, "income" of a few paise). Privacy is checked on every month. */
  const plausible = local.income >= 1000 && local.spend >= 500 && local.refunds < 0.5 * (local.spend + local.refunds) &&
    Math.abs(local.rentEmiShare) <= 1.5 && local.savingsRate != null && Math.abs(local.savingsRate) <= 1.5;
  if (plausible) { mathsChecked++; if (!(a.income && a.rentEmiShare && a.spend && a.savingsRate)) maths.push({ seed, gaps: a.gaps }); }
}
E.clearPrivate("ghost_party");
ok("fuzz: ran on " + count + " random months (up to 40 messages each)", count >= 350, count);
ok("fuzz: every outgoing line is exactly 'T# | debit/credit | Stand_In | category | number'", badShape.length === 0, badShape.slice(0, 3));
ok("fuzz: no real name ever appears in the outgoing text", nameLeaks.length === 0, nameLeaks.slice(0, 3));
ok("fuzz: no real amount appears in the outgoing text (except by coincidence with a scaled one)", numberLeaks.length === 0, numberLeaks.slice(0, 3));
ok("fuzz: no account number, reference, date, SMS wording or Hindi text leaves", otherLeaks.length === 0, otherLeaks.slice(0, 2));
ok("fuzz: every payload passes the allowlist", badPayload.length === 0, badPayload.slice(0, 2));
ok("fuzz: the private-name scanner finds nothing to block", scanner.length === 0, scanner.slice(0, 2));
ok("fuzz: on " + mathsChecked + " ordinary months, the maths on fake numbers restores to the rules' figures (within 5%)", mathsChecked >= 50 && maths.length === 0, { mathsChecked, maths: maths.slice(0, 3) });
{
  const s2 = G.createSession({ k: 0.8 }); s2.mask([]);
  const big = s2.restore({ income: 800, spend: 1600, breakdown: [{ category: "rent", amount: 1296 }], rent_emi_share: 1.62, savings_rate: -1 });
  ok("shares: a real share above 100% (rent 1.62x income) is not mistaken for 1.62%", Math.abs(big.rentEmiShare - 1.62) < 1e-9 && Math.abs(big.savingsRate + 1) < 1e-9, big);
  const pc = s2.restore({ income: 800, spend: 400, breakdown: [{ category: "rent", amount: 344 }], rent_emi_share: 43, savings_rate: 50 });
  ok("shares: a share sent as a percent (43) is still read as 0.43", Math.abs(pc.rentEmiShare - 0.43) < 1e-9 && Math.abs(pc.savingsRate - 0.5) < 1e-9, pc);
}

console.log("GHOST EDGE TESTS: " + passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
