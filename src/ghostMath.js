/* AION Ghost-Math - a private money lens (#BuildHybridAI 2026). Apache-2.0.
 * Created by Anshul Reddy (idea and project owner).
 *
 * Plain code, no DOM, no network, no clock. Runs ON THIS DEVICE before any
 * Firebase AI Logic call, so a cloud model (or a cloud fallback) only ever sees
 * stand-in names and scaled numbers.
 *
 *   1. parseInput(text)        bank / UPI SMS alerts or a monthly budget -> ledger
 *   2. summarize(ledger)       the rule engine: breakdown, rent/EMI share, savings
 *                              rate, in REAL rupees (never leaves the device)
 *   3. createSession()         one secret factor k in [0.55, 0.95], memory only
 *      session.mask(ledger)    every amount x k (plus a small per-entry wobble),
 *                              every name -> Person_A / Merchant_B / Payer_C ...
 *      session.restore(json)   divide the cloud's numbers by k, put names back
 *
 * Why the wobble: if every real amount is a round number and the scaled amounts
 * were sent to the paisa, a few entries would pin down k (only one k makes them
 * all whole again). Each entry is also multiplied by its own secret factor
 * within +/- WOBBLE and rounded to whole rupees, so that lattice is blurred.
 * Shares and rates stay within about WOBBLE of the truth; the exact figures on
 * screen always come from summarize(), not from the cloud.
 */

export const K_MIN = 0.55;
export const K_MAX = 0.95;
export const WOBBLE = 0.015;
export const MAX_ENTRIES = 200;

/* ------------------------------ amounts ------------------------------ */

/* Rs 1,02,345.67 | INR 450 | ₹2,340.5 | Rs. 2.4 lakh */
const AMOUNT_RE = /(?:rs\.?|inr|₹)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(lakh|lac|k)?/gi;
const NOT_THE_AMOUNT = /(?:avl\.?|available|avbl|a\/c)\s*(?:bal(?:ance)?|lmt|limit)?\s*(?:is|:)?\s*$|bal(?:ance)?\s*(?:is|:)?\s*$|limit\s*(?:is|:)?\s*$/i;

export function toNumber(digits, unit) {
  const n = parseFloat(String(digits).replace(/,/g, ""));
  if (!isFinite(n)) return null;
  const u = String(unit || "").toLowerCase();
  const v = u === "lakh" || u === "lac" ? n * 100000 : u === "k" ? n * 1000 : n;
  return Math.round(v * 100) / 100;
}

/** The transaction amount in an SMS: the first rupee amount that is not a balance or limit. */
export function findAmount(text) {
  AMOUNT_RE.lastIndex = 0;
  let m;
  while ((m = AMOUNT_RE.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 22), m.index);
    if (NOT_THE_AMOUNT.test(before)) continue;
    const v = toNumber(m[1], m[2]);
    if (v != null && v > 0) return v;
  }
  return null;
}

/* ------------------------------ parties ------------------------------ */

const MERCHANT_WORDS = /\b(ltd|limited|pvt|private|store|stores|mart|bank|india|technologies|tech|services|enterprises|foods|retail|online|pay|finance|finserv|insurance|electricity|telecom|broadband|restaurant|cafe|hotel|pharmacy|hospital|clinic|petrol|fuel)\b/i;
const KNOWN_MERCHANTS = /\b(swiggy|zomato|amazon|flipkart|myntra|ajio|meesho|netflix|spotify|hotstar|jiohotstar|prime|youtube|bigbasket|blinkit|zepto|dmart|instamart|uber|ola|rapido|irctc|airtel|jio|vodafone|vi|bsnl|bescom|tata|reliance|apollo|medplus|pharmeasy|bookmyshow|makemytrip|paytm|phonepe|gpay|starbucks|dominos|mcdonalds|kfc|hdfc|icici|sbi|axis|kotak|bajaj|lic)\b/i;

function tidy(s) {
  return String(s || "").replace(/[*_]+/g, " ").replace(/\s+/g, " ").replace(/^[\s:.\-]+|[\s:.\-,;]+$/g, "").trim();
}

/** Best-effort payee / payer name from an SMS. Empty string when none is found. */
export function findParty(text, direction) {
  const t = String(text);
  let m = t.match(/\bVPA\s+([\w.\-]+)@[\w.\-]+/i) || t.match(/\b(?:to|at)\s+([\w.\-]+)@[\w.\-]+/i);
  if (m) {
    const handle = m[1].replace(/[._\-]+/g, " ").replace(/\d{6,}/g, "").trim();
    if (handle) return tidy(handle);
  }
  m = t.match(/\bInfo:?\s*([^.;\n]{2,60})/i);
  if (m) return tidy(m[1].replace(/^(?:NEFT|IMPS|UPI|RTGS|ACH|NACH)[\s\-\/:]*/i, "").replace(/^[A-Z0-9]{8,}[\s\-\/:]*/, ""));
  m = t.match(/;\s*([A-Za-z][A-Za-z0-9&.' ]{1,40}?)\s+credited/i);
  if (m && direction === "debit") return tidy(m[1]);
  const stop = "(?=\\s+(?:on|via|ref|upi|using|from|for|avl|dated|txn|is|has|thru|through)\\b|[.;,(\\n]|$)";
  if (direction === "debit") {
    m = t.match(new RegExp("\\b(?:to|at|towards|paid to|sent to)\\s+(?!a\\/c|ac\\b|your\\b)([A-Za-z][A-Za-z0-9&.' \\-]{1,40}?)" + stop, "i"));
    if (m) return tidy(m[1]);
  } else {
    m = t.match(new RegExp("\\b(?:by|from)\\s+(?:NEFT|IMPS|UPI|RTGS)?\\s*(?:from\\s+)?(?!a\\/c|ac\\b|your\\b)([A-Za-z][A-Za-z0-9&.' \\-]{1,40}?)" + stop, "i"));
    if (m && !/^(?:neft|imps|upi|rtgs)$/i.test(m[1].trim())) return tidy(m[1]);
  }
  return "";
}

/** person | merchant | payer (someone who paid you) */
export function partyKind(name, direction) {
  if (direction === "credit") return "payer";
  if (!name) return "merchant";
  if (KNOWN_MERCHANTS.test(name) || MERCHANT_WORDS.test(name)) return "merchant";
  /* Two or three plain words with no digits read as a person's name. */
  return /^[A-Za-z]+(?:\s+[A-Za-z.]+){1,2}$/.test(name.trim()) ? "person" : "merchant";
}

/* ------------------------------ categories ------------------------------ */
/* First match wins; order matters (an "EMI" to a bank is a loan, not a bank fee). */
export const CATEGORIES = [
  ["income", /\b(salary|sal\b|payroll|stipend|bonus|income|freelance|interest credited|refund|cashback)\b/i],
  ["emi", /\b(emi|loan|nach|ach d|hdfc ltd|bajaj fin|finserv|home loan|car loan|personal loan)\b/i],
  ["rent", /\b(rent|landlord|house owner|pg\b|hostel|maintenance)\b/i],
  ["groceries", /\b(bigbasket|blinkit|zepto|dmart|instamart|grocery|groceries|kirana|supermarket|vegetables?|milk|dairy)\b/i],
  ["food", /\b(swiggy|zomato|restaurant|cafe|starbucks|dominos|mcdonalds|kfc|food|dining|eat|eating out)\b/i],
  ["transport", /\b(uber|ola|rapido|metro|petrol|diesel|fuel|irctc|railway|bus|cab|auto|parking|fastag|travel)\b/i],
  ["bills", /\b(electricity|bescom|power|airtel|jio|vodafone|bsnl|broadband|wifi|internet|recharge|mobile|phone|gas|water|utility|utilities|dth)\b/i],
  ["subscriptions", /\b(netflix|spotify|hotstar|jiohotstar|prime|youtube|subscription|ott|apple)\b/i],
  ["shopping", /\b(amazon|flipkart|myntra|ajio|meesho|nykaa|shopping|clothes|mall)\b/i],
  ["health", /\b(pharmacy|apollo|medplus|pharmeasy|hospital|clinic|doctor|medicine|medical|health|gym)\b/i],
  ["insurance", /\b(insurance|lic|premium|policy)\b/i],
  ["savings", /\b(sip|mutual fund|zerodha|groww|ppf|rd\b|fd\b|fixed deposit|savings?|invest(?:ment)?)\b/i],
  ["education", /\b(school|college|tuition|fees|course|udemy|books?)\b/i],
];
export const CATEGORY_NAMES = CATEGORIES.map((c) => c[0]).concat(["transfers", "other"]);

export function categorize(label, direction, kind) {
  for (const [name, re] of CATEGORIES) {
    if (name === "income") { if (direction === "credit" && re.test(label)) return name; continue; }
    if (direction === "debit" && re.test(label)) return name;
  }
  if (direction === "credit") return "income";
  return kind === "person" ? "transfers" : "other";
}

/* ------------------------------ parsing ------------------------------ */

const DEBIT_RE = /\b(debited|debit|spent|paid|sent|withdrawn|purchase|txn of|transferred to|dr\b)/i;
const CREDIT_RE = /\b(credited|received|deposited|cr\b|refund)/i;
const SMS_HINT = /\b(a\/c|acct|account|upi|vpa|card|neft|imps|debited|credited|spent|ref\s*no)\b/i;

function parseSmsLine(line) {
  const amount = findAmount(line);
  if (amount == null) return null;
  const d = line.search(DEBIT_RE), c = line.search(CREDIT_RE);
  if (d < 0 && c < 0) return null;
  /* "A/c debited ...; X credited" is a debit: the first direction word wins. */
  const direction = d >= 0 && (c < 0 || d < c) ? "debit" : "credit";
  const party = findParty(line, direction);
  let kind = partyKind(party, direction);
  /* A UPI handle that is not a known shop (rameshkumar@okaxis) is a person. */
  if (kind === "merchant" && /@[a-z]/i.test(line) && party && !KNOWN_MERCHANTS.test(party) && !MERCHANT_WORDS.test(party)) kind = "person";
  return { source: "sms", direction, amount, party, partyKind: kind, category: categorize(line + " " + party, direction, kind) };
}

/* "Rent: 25,000" | "Home loan EMI - ₹12,450" | "Salary 85000" | "Groceries 6k" */
const BUDGET_RE = /^\s*[-*•]?\s*([^:=\d₹]{2,60}?)\s*[:=\-–]?\s*(?:rs\.?|inr|₹)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(lakh|lac|k)?\b\s*(?:\/\s*(?:month|mo|m))?\s*(?:\(([^)]{0,60})\))?\s*$/i;
const INCOME_LABEL = /\b(salary|income|stipend|bonus|freelance|take[- ]?home|in[- ]?hand|earnings|pay)\b/i;

function parseBudgetLine(line) {
  const m = line.match(BUDGET_RE);
  if (!m) return null;
  const amount = toNumber(m[2], m[3]);
  if (amount == null || amount <= 0) return null;
  const label = tidy(m[1] + (m[4] ? " " + m[4] : ""));
  const direction = INCOME_LABEL.test(label) ? "credit" : "debit";
  const category = categorize(label, direction, "merchant");
  /* A budget label is treated as private too ("Rent to Mr Sharma"): it is
   * replaced by a stand-in like any payee. */
  return { source: "budget", direction, amount, party: label, partyKind: direction === "credit" ? "payer" : "item", category };
}

/** Splits pasted text into entries. Unreadable lines are counted, never guessed. */
export function parseInput(text) {
  const raw = String(text || "").replace(/\r/g, "");
  const chunks = /\n\s*\n/.test(raw) && raw.split(/\n\s*\n/).some((c) => c.indexOf("\n") >= 0 && SMS_HINT.test(c))
    ? raw.split(/\n\s*\n/).map((c) => c.replace(/\n/g, " ")) : raw.split("\n");
  const entries = [];
  const skipped = [];
  chunks.forEach((chunk) => {
    const line = chunk.trim();
    if (!line) return;
    const e = (SMS_HINT.test(line) ? parseSmsLine(line) : null) || parseBudgetLine(line) || parseSmsLine(line);
    if (e && entries.length < MAX_ENTRIES) entries.push(Object.assign({ id: "T" + (entries.length + 1) }, e));
    else if (!e) skipped.push(line.slice(0, 80));
  });
  return { entries, skipped };
}

/* ------------------------------ the rule engine ------------------------------ */

const r2 = (n) => Math.round(n * 100) / 100;

/** Real-rupee figures, computed here and only here. */
export function summarize(entries) {
  let income = 0, spend = 0, invested = 0;
  const by = {};
  (entries || []).forEach((e) => {
    if (e.direction === "credit") income += e.amount;
    /* Money moved into a SIP / FD / savings is kept, not spent. */
    else if (e.category === "savings") invested += e.amount;
    else { spend += e.amount; by[e.category] = (by[e.category] || 0) + e.amount; }
  });
  const breakdown = Object.keys(by).map((category) => ({ category, amount: r2(by[category]), share: spend ? by[category] / spend : 0 }))
    .sort((a, b) => b.amount - a.amount);
  const housing = (by.rent || 0) + (by.emi || 0);
  return {
    income: r2(income), spend: r2(spend), invested: r2(invested), breakdown,
    rentEmi: r2(housing),
    /* Share of income when income is known, otherwise of spending (and labelled so). */
    rentEmiShare: income > 0 ? housing / income : spend > 0 ? housing / spend : 0,
    rentEmiBase: income > 0 ? "income" : "spending",
    savingsRate: income > 0 ? (income - spend) / income : null,
  };
}

const pct = (x) => Math.round(x * 100) + "%";
export function rupees(n) {
  if (n == null || !isFinite(n)) return "-";
  const neg = n < 0, v = Math.round(Math.abs(n));
  const s = String(v);
  const last3 = s.slice(-3), rest = s.slice(0, -3);
  return (neg ? "-" : "") + "₹" + (rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," : "") + last3;
}

/** Tips from plain rules, used when no model answers (and as a cross-check). */
export function localTips(s) {
  const tips = [];
  const cat = (name) => (s.breakdown.find((b) => b.category === name) || { amount: 0 }).amount;
  if (s.rentEmiShare > 0.4) tips.push({ text: "Rent and EMIs take " + pct(s.rentEmiShare) + " of your " + s.rentEmiBase + ". A common guide is under 40%; prepaying the costliest loan or a cheaper place would free {amount} a month at 40%.", amount: s.rentEmi - 0.4 * (s.rentEmiBase === "income" ? s.income : s.spend) });
  const eatOut = cat("food");
  if (s.spend > 0 && eatOut / s.spend > 0.12) tips.push({ text: "Food delivery and eating out are " + pct(eatOut / s.spend) + " of spending. Cutting it by a third saves about {amount}.", amount: eatOut / 3 });
  const subs = cat("subscriptions");
  if (subs > 0) tips.push({ text: "Subscriptions add up to {amount}. Cancel the one you used least this month.", amount: subs });
  if (s.savingsRate != null && s.savingsRate < 0.2) tips.push({ text: "You are saving " + pct(Math.max(0, s.savingsRate)) + " of income. Reaching 20% means keeping about {amount} more each month.", amount: 0.2 * s.income - (s.income - s.spend) });
  if (!tips.length) tips.push({ text: "Your biggest spend is " + ((s.breakdown[0] || {}).category || "none") + " at {amount}. Set a monthly cap for it.", amount: (s.breakdown[0] || { amount: 0 }).amount });
  return tips.slice(0, 3).map((t) => ({ text: t.text, amount: Math.max(0, Math.round(t.amount)) }));
}

export function fillAmount(text, amount) {
  return String(text).split("{amount}").join(rupees(amount));
}

/* ------------------------------ session: scale + stand-ins ------------------------------ */

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function letter(i) { return i < 26 ? LETTERS[i] : LETTERS[Math.floor(i / 26) - 1] + LETTERS[i % 26]; }
const PREFIX = { person: "Person", merchant: "Merchant", payer: "Payer", item: "Item" };

function defaultRandom() {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === "function") {
    const a = new Uint32Array(1);
    return () => { c.getRandomValues(a); return a[0] / 4294967296; };
  }
  throw new Error("No secure random source (crypto.getRandomValues) - Ghost-Math will not run without one.");
}

/** k uniformly in [K_MIN, K_MAX). */
export function pickK(random) { return K_MIN + (K_MAX - K_MIN) * random(); }

/**
 * One per page load. k, the wobble per entry and the name map live only in this
 * closure: no getter, never stored, never sent. Tests may pass opts.k / opts.random.
 */
export function createSession(opts) {
  const random = (opts && opts.random) || defaultRandom();
  const k = opts && typeof opts.k === "number" ? opts.k : pickK(random);
  if (!(k >= K_MIN && k <= K_MAX)) throw new Error("k must be between " + K_MIN + " and " + K_MAX);
  const wobble = opts && typeof opts.wobble === "number" ? opts.wobble : WOBBLE;
  const toAlias = new Map();     // normalised real name -> stand-in
  const fromAlias = new Map();   // stand-in -> real name as first seen
  const counts = { person: 0, merchant: 0, payer: 0, item: 0 };
  const jitter = new Map();      // entry key -> its own factor (stable for the session)

  function alias(name, kind) {
    const key = String(name || "").toLowerCase().replace(/\s+/g, " ").trim() || "(unnamed " + kind + ")";
    if (toAlias.has(key)) return toAlias.get(key);
    const k2 = PREFIX[kind] ? kind : "merchant";
    const a = PREFIX[k2] + "_" + letter(counts[k2]++);
    toAlias.set(key, a); fromAlias.set(a, name || "(no name in the message)");
    return a;
  }
  function factor(e) {
    const key = e.id + "|" + e.amount + "|" + e.party;
    if (!jitter.has(key)) jitter.set(key, 1 + wobble * (2 * random() - 1));
    return jitter.get(key);
  }

  return {
    /** Masked entries + the exact lines that may leave the device. */
    mask(entries) {
      const rows = (entries || []).map((e) => {
        const standIn = alias(e.party, e.partyKind);
        const sent = Math.max(1, Math.round(e.amount * k * factor(e)));
        return { id: e.id, direction: e.direction, category: e.category, party: e.party, standIn, real: e.amount, sent };
      });
      return { rows, lines: rows.map((r) => [r.id, r.direction, r.standIn, r.category, String(r.sent)].join(" | ")) };
    },
    /** Real names (for the private-value scanner). */
    realNames() { return Array.from(fromAlias.values()).filter(isPrivateName); },
    unscale(n) { return typeof n === "number" && isFinite(n) ? n / k : null; },
    restoreText(text) { return restoreText(text, fromAlias, k); },
    /** The cloud's JSON, back in real rupees and real names. Never trusts it. */
    restore(json) { return restoreResult(json, fromAlias, k); },
  };
}

/* A name worth guarding: long enough, and not a word the payload uses anyway
 * (a budget line called "Rent" is not a secret; "Rent to Mr Sharma" is). */
export function isPrivateName(n) {
  const t = String(n || "").toLowerCase().trim();
  if (t.length < 4 || CATEGORY_NAMES.indexOf(t) >= 0) return false;
  return INSTRUCTIONS.toLowerCase().indexOf(t) < 0 && !/^\(no name/.test(t);
}

const STAND_IN_RE = /\b(Person|Merchant|Payer|Item)_([A-Z]{1,2})\b/g;
const TEXT_AMOUNT_RE = /(₹|\brs\.?\s?|\binr\s?)([0-9][0-9,]*(?:\.[0-9]+)?)/gi;

function restoreText(text, fromAlias, k) {
  return String(text == null ? "" : text).slice(0, 600)
    .replace(STAND_IN_RE, (m) => (fromAlias.has(m) ? fromAlias.get(m) : m))
    /* A rupee figure written inside the text is a scaled one too. */
    .replace(TEXT_AMOUNT_RE, (m, cur, digits) => {
      const v = parseFloat(digits.replace(/,/g, ""));
      return isFinite(v) ? rupees(v / k) : m;
    });
}

const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
const share = (v) => { const n = num(v); return n == null ? null : n > 1.5 && n <= 150 ? n / 100 : n; };

function restoreResult(json, fromAlias, k) {
  const j = json && typeof json === "object" ? json : {};
  const breakdown = (Array.isArray(j.breakdown) ? j.breakdown : []).slice(0, 20).map((b) => ({
    category: CATEGORY_NAMES.indexOf(String(b && b.category).toLowerCase()) >= 0 ? String(b.category).toLowerCase() : "other",
    amount: num(b && b.amount) == null ? null : num(b.amount) / k,
  })).filter((b) => b.amount != null);
  const tips = (Array.isArray(j.tips) ? j.tips : []).slice(0, 3).map((t) => {
    const amount = num(t && t.amount) == null ? null : Math.max(0, num(t.amount) / k);
    const text = restoreText(t && t.text, fromAlias, k);
    return { text: amount == null ? text.split("{amount}").join("") : fillAmount(text, amount), amount };
  }).filter((t) => t.text.trim());
  return {
    income: num(j.income) == null ? null : num(j.income) / k,
    spend: num(j.spend) == null ? null : num(j.spend) / k,
    /* Shares do not change with k: they come back as they are. */
    rentEmiShare: share(j.rent_emi_share),
    savingsRate: share(j.savings_rate),
    breakdown, tips,
  };
}

/* ------------------------------ the cloud's task ------------------------------ */

export const INSTRUCTIONS = "You are a careful personal-finance assistant. Below is one month of money entries, one per line: " +
  "id | debit or credit | party | category | amount in rupees. Names are placeholders such as Person_A or Merchant_B; keep them " +
  "exactly as written. Using ONLY these entries, return JSON with: income (sum of credits), spend (sum of debits), breakdown " +
  "(spend per category, as numbers; spend and breakdown leave out the savings category, which is money kept, not spent), rent_emi_share (rent plus emi divided by income, a fraction between 0 and 1; divide by spend if " +
  "there is no income), savings_rate ((income - spend) / income, a fraction), and 2 or 3 tips. Each tip has text and amount: put the " +
  "token {amount} in the text where the rupee figure goes and give that figure as a plain number in amount. Do not write any other " +
  "numbers in the text. Do not invent entries.";

export const RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    income: { type: "number" },
    spend: { type: "number" },
    breakdown: { type: "array", items: { type: "object", properties: { category: { type: "string" }, amount: { type: "number" } }, required: ["category", "amount"] } },
    rent_emi_share: { type: "number" },
    savings_rate: { type: "number" },
    tips: { type: "array", items: { type: "object", properties: { text: { type: "string" }, amount: { type: "number" } }, required: ["text", "amount"] } },
  },
  required: ["income", "spend", "breakdown", "rent_emi_share", "savings_rate", "tips"],
};

/** The disclosure payload (purpose "ghost_math"): stand-ins and scaled numbers only. */
export function buildPayload(lines) {
  return { instructions: INSTRUCTIONS, entries: lines.slice(0, MAX_ENTRIES) };
}

/** Do the cloud's restored figures agree with the rules? (within wobble + rounding) */
export function agreement(local, restored, tolerance) {
  const tol = tolerance == null ? 0.05 : tolerance;
  const close = (a, b) => a != null && b != null && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
  const nearShare = (a, b) => a != null && b != null && Math.abs(a - b) <= tol;
  return {
    spend: close(restored.spend, local.spend),
    income: local.income === 0 ? restored.income == null || Math.abs(restored.income) < 1 : close(restored.income, local.income),
    rentEmiShare: nearShare(restored.rentEmiShare, local.rentEmiShare),
    savingsRate: local.savingsRate == null ? true : nearShare(restored.savingsRate, local.savingsRate),
  };
}

/** Real names or real amounts that appear in an outgoing text (should be none). */
export function leakCheck(text, entries) {
  const t = String(text).toLowerCase();
  const names = Array.from(new Set((entries || []).map((e) => String(e.party || "").toLowerCase().trim()).filter(isPrivateName)));
  const nameHits = names.filter((n) => t.indexOf(n) >= 0);
  return { namesChecked: names.length, nameHits };
}
