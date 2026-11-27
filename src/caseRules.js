/* AION Hybrid Web - Case rules (pure, plain code). Apache-2.0.
 * Created by Anshul Reddy (idea and project owner) for #BuildHybridAI 2026.
 *
 * The pure Case functions - reconcile, compareVerdicts, cloudVerdict,
 * quoteFromText - as an ES module, so src/border.js and the Node tests can use
 * them without a browser. No DOM, no network, no clock, no randomness.
 *
 * Source of truth note: public/case.js is a classic script (IIFE) loaded BEFORE
 * the module bundle, so it keeps its own copy of these functions and its
 * window.AionCase API is unchanged. The bodies below are copied verbatim from
 * case.js, and tests/engine.test.mjs loads case.js with a stub window and
 * checks that both copies give identical results on a set of fixtures (a
 * parity test), so the two cannot drift apart silently. In the browser the
 * border engine calls window.AionCase first (the exact code the real reply
 * goes through) and falls back to this module only when case.js is absent.
 */
/* ==== RULES START: everything down to RULES END is copied verbatim into
 * src/caseRules.js by `node scripts/sync_case_rules.mjs`. Edit it here. ==== */

/* ---- Money: amount + currency, never converted ---- */
var CUR_CODES = { rs: "INR", inr: "INR", rupees: "INR", "₹": "INR", usd: "USD", "us$": "USD", "$": "USD", gbp: "GBP", "£": "GBP",
  eur: "EUR", "€": "EUR", aud: "AUD", "a$": "AUD", cad: "CAD", "c$": "CAD", sgd: "SGD", "s$": "SGD", aed: "AED" };
var CUR_SIGN = { INR: "Rs ", USD: "$", GBP: "£", EUR: "€" };
var MULT = { lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, crore: 1e7, crores: 1e7, cr: 1e7, k: 1e3, thousand: 1e3 };
var NUM = "(\\d[\\d,]*(?:\\.\\d+)?)";
var MULT_RE = "(?:\\s*(lakhs?|lacs?|crores?|cr|k|thousand)\\b)?";
var PRE_RE = new RegExp("(?:\\b(rs|inr|usd|gbp|eur|aud|cad|sgd|aed)\\b\\.?|(us\\$|a\\$|c\\$|s\\$|\\u20b9|\\$|\\u00a3|\\u20ac))\\s*" + NUM + MULT_RE, "gi");
var POST_RE = new RegExp("\\b" + NUM + MULT_RE + "\\s*(inr|usd|gbp|eur|aud|cad|sgd|aed|rupees)\\b", "gi");
var CUR_TEST = /(\brs\b\.?|\binr\b|\busd\b|\bgbp\b|\beur\b|₹|\$|£|€)\s*\d|\d\s*(inr|usd|gbp|eur|rupees)\b/i;
function money(n, cur) {
  cur = cur || "INR";
  if (cur === "INR") return "Rs " + Math.round(n).toLocaleString("en-IN");
  var r = Math.round(n * 100) / 100;
  var s = r.toLocaleString("en-US", { minimumFractionDigits: r % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return CUR_SIGN[cur] ? CUR_SIGN[cur] + s : cur + " " + s;
}
function rupees(n) { return money(n, "INR"); }
function moneyHit(t, m, code, num, mult) {
  var amount = parseFloat(num.replace(/,/g, "")) * (mult ? MULT[mult.toLowerCase()] || 1 : 1);
  var end = m.index + m[0].length;
  var rest = t.slice(end).replace(/^\s*\/-/, "");
  var before = t.slice(Math.max(0, m.index - 40), m.index).split(/[.;]\s/).pop();
  return { amount: Math.round(amount * 100) / 100, currency: CUR_CODES[code] || code.toUpperCase(), index: m.index, end: end,
    perUnit: /^\s*(?:\/\s*[a-z]|per\b|each\b|apiece\b)/i.test(rest),
    total: /(grand total|\btotal\b|amount payable|net payable|package price|lump ?sum|all[- ]in)/i.test(before) };
}
/* Every amount in the text, in order. A rate "per carton" is marked perUnit;
 * an amount after "Total" / "Package price" is marked total. */
function readMoney(text) {
  var t = String(text || ""), out = [], m;
  PRE_RE.lastIndex = 0;
  while ((m = PRE_RE.exec(t))) out.push(moneyHit(t, m, (m[1] || m[2]).toLowerCase(), m[3], m[4]));
  POST_RE.lastIndex = 0;
  while ((m = POST_RE.exec(t))) {
    var at = m.index;
    if (out.some(function (o) { return at >= o.index && at < o.end; })) continue;
    out.push(moneyHit(t, m, m[3].toLowerCase(), m[1], m[2]));
  }
  return out.filter(function (o) { return isFinite(o.amount) && o.amount > 0; }).sort(function (a, b) { return a.index - b.index; });
}
/* The price of the whole quote: a marked total first, then the first amount
 * that is not a unit rate, then whatever amount there is. */
function pickPrice(text) {
  var hits = readMoney(text);
  return hits.filter(function (h) { return h.total && !h.perUnit; })[0] || hits.filter(function (h) { return !h.perUnit; })[0] || hits[0] || null;
}
function readAmount(text) { var p = pickPrice(text); return p ? p.amount : null; }

/* ---- Tax: GST, VAT, sales tax ---- */
var TAXW = "(?:gst|vat|sales tax|taxes|tax)";
var RATE_OPT = "(?:@?\\s*\\d+(?:\\.\\d+)?\\s*%\\s*)?";
var TAX_IN = new RegExp("\\b(?:incl\\.?|including|inclusive of|inc\\.?)\\s*(?:of\\s*)?(?:all\\s*)?(?:applicable\\s*)?" + RATE_OPT + TAXW + "\\b", "i");
var TAX_OUT = new RegExp("(?:\\bplus|\\+|\\bexcluding|\\bexcl\\.?|\\bexclusive of|\\bexc\\.?)\\s*(?:of\\s*)?(?:applicable\\s*)?" + RATE_OPT + TAXW + "\\b|\\b" + TAXW +
  "\\s*(?:@\\s*\\d+(?:\\.\\d+)?\\s*%\\s*)?(?:extra|additional|as applicable|payable extra)\\b", "i");
/* true = tax included, false = tax on top, null = not written down. */
function gstIncluded(text) {
  var t = String(text || "");
  if (TAX_IN.test(t)) return true;
  if (TAX_OUT.test(t)) return false;
  return null;
}
/* "+ 5% GST", "VAT at 20%", "GST @ 18%": the rate the quote itself states. */
function statedTaxRate(text) {
  var t = String(text || "");
  var m = t.match(new RegExp("(\\d+(?:\\.\\d+)?)\\s*%\\s*" + TAXW + "\\b", "i")) || t.match(new RegExp("\\b" + TAXW + "\\s*(?:@|at)\\s*(\\d+(?:\\.\\d+)?)\\s*%", "i"));
  if (!m) return null;
  var n = parseFloat(m[1]);
  return isFinite(n) && n >= 0 && n <= 50 ? n : null;
}
function taxWord(text, cur) {
  var t = String(text || "");
  if (/\bvat\b/i.test(t)) return "VAT";
  if (/sales tax/i.test(t)) return "sales tax";
  if (/\bgst\b/i.test(t)) return "GST";
  return cur === "INR" ? "GST" : "tax";
}

/* ---- Delivery terms: who pays to bring the goods to you ---- */
var TERMS = [
  ["FOB", /\bFOB\b|free on board/i],
  ["EXW", /\bEXW\b|ex[- ]works/i],
  ["ex-godown", /ex[- ](?:godown|warehouse|factory)/i],
  ["freight extra", /freight (?:extra|charges? extra|not included|to be paid|payable)|plus freight|transport(?:ation)? extra|shipping (?:extra|not included)/i],
  ["CIF", /\bCIF\b/],
  ["DDP", /\bDDP\b|delivered duty paid/i],
];
function readTerms(c) {
  var all = (c.paragraphs || []).map(function (p) { return p.text || ""; }).join(" \n ");
  return TERMS.filter(function (x) { return x[1].test(all); }).map(function (x) { return x[0]; });
}

/* ---- Dates ---- */
/* A real calendar day: build it and read it back. Feb 31 would roll into March
 * and must not be accepted as a date. */
function realDay(y, m, d) {
  var ms = Date.UTC(y, m - 1, d);
  var chk = new Date(ms);
  return chk.getUTCFullYear() === y && chk.getUTCMonth() === m - 1 && chk.getUTCDate() === d ? ms : null;
}
function realTime(h, mi) { return h >= 0 && h <= 23 && mi >= 0 && mi <= 59 ? h * 60 + mi : null; }
var MON = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?![a-z])\\.?";
var ORD = "(?:st|nd|rd|th)?";
function monthOf(w) { return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(String(w).slice(0, 3).toLowerCase()) + 1; }
var DATE_RES = [
  /* 2026-12-11, 2026-12-11 09:00 */
  { re: /\b(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/, ymd: function (m) { return [+m[1], +m[2], +m[3]]; }, iso: true },
  /* 11 December 2026, 11th Dec 2026, 11-Dec-2026, 11th of December, 2026 */
  { re: new RegExp("\\b(\\d{1,2})" + ORD + "(?:\\s+of)?[\\s-]+" + MON + ",?[\\s-]+(\\d{4})\\b", "i"), ymd: function (m) { return [+m[3], monthOf(m[2]), +m[1]]; } },
  /* December 11, 2026, Dec. 11th, 2026, Sept 3 2026 */
  { re: new RegExp("\\b" + MON + "\\s+(\\d{1,2})" + ORD + ",?\\s+(\\d{4})\\b", "i"), ymd: function (m) { return [+m[3], monthOf(m[1]), +m[2]]; } },
  /* 25/12/2026, 12/25/2026, 25.12.2026, 25-12-2026 */
  { re: /\b(\d{1,2})([\/.-])(\d{1,2})\2(\d{4})\b/, numeric: true },
];
/* Day-month order of a numeric date. Decided only when it is certain: one part
 * above 12, both parts equal, or the text says DD/MM or MM/DD. */
function numericYmd(m, t) {
  var a = +m[1], b = +m[3], y = +m[4];
  if (a > 12 && b > 12) return null;
  if (a > 12) return [y, b, a];
  if (b > 12 || a === b) return [y, a, b];
  if (/\bdd[\/.-]mm\b/i.test(t)) return [y, b, a];
  if (/\bmm[\/.-]dd\b/i.test(t)) return [y, a, b];
  return "ambiguous";
}
/* The first clock time in s: "14:00", "2:00 PM", "7 am", "noon". In a window
 * such as "08:00-12:00" the END is used: the latest the supplier may arrive. */
function readTime(s) {
  var t = String(s || ""), toks = [], m;
  var re = /\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\b\.?|\b(\d{1,2}):(\d{2})\b|\b(noon|midday|midnight)\b/gi;
  while ((m = re.exec(t))) {
    var hh, mi;
    if (m[3]) { hh = +m[1] > 12 || +m[1] === 0 ? -1 : +m[1] % 12 + (m[3].toLowerCase() === "p" ? 12 : 0); mi = m[2] ? +m[2] : 0; }
    else if (m[4]) { hh = +m[4]; mi = +m[5]; }
    else { hh = m[6].toLowerCase() === "midnight" ? 0 : 12; mi = 0; }
    toks.push({ v: realTime(hh, mi), raw: m[0], index: m.index, end: m.index + m[0].length });
  }
  if (!toks.length) return null;
  if (toks[1] && /^\s*(?:-|–|to|until|till)\s*$/i.test(t.slice(toks[0].end, toks[1].index))) return toks[1];
  return toks[0];
}
/* null = no date written. { invalid: true, label } = something that looks like a
 * date or time was written but is not a real one, and { invalid, ambiguous } =
 * a numeric date that could be read two ways. Both are reported as unknown,
 * never silently moved to another day. */
function readDate(text) {
  var t = String(text || "");
  var best = null;
  DATE_RES.forEach(function (d) { var m = t.match(d.re); if (m && (!best || m.index < best.m.index)) best = { d: d, m: m }; });
  if (!best) return null;
  var m = best.m, label = m[0].replace(/[\s,]+$/, "");
  var ymd = best.d.numeric ? numericYmd(m, t) : best.d.ymd(m);
  if (ymd === "ambiguous") return { invalid: true, ambiguous: true, label: label };
  var day = ymd ? realDay(ymd[0], ymd[1], ymd[2]) : null;
  var time = null, tok = null;
  if (best.d.iso && m[4]) time = realTime(+m[4], +m[5]);
  else {
    var end = m.index + m[0].length;
    tok = readTime(t.slice(end)) || readTime(t.slice(0, m.index));
    time = tok ? tok.v : null;
  }
  if (day === null || ((best.d.iso && m[4]) || tok) && time === null) return { invalid: true, label: label + (tok ? " " + tok.raw : "") };
  var out = { day: day, time: time, label: label };
  if (!best.d.iso) out.vague = time === null && /morning|afternoon|evening|during the day|\b[ap]m slot\b/i.test(t);
  return out;
}
function isoDay(ms) { return new Date(ms).toISOString().slice(0, 10); }
/* "Lead time: 25-30 working days after deposit": a duration, not a date. */
function readLeadTime(text) {
  var m = String(text || "").match(/[^.]*\b\d+(?:\s*(?:-|–|to)\s*\d+)?\s*(?:working |business |calendar )?(?:days?|weeks?|months?)\b[^.]*/i);
  return m ? m[0].trim() : null;
}
function findPara(c, headRe, textRe) {
  var ps = c.paragraphs || [];
  for (var i = 0; i < ps.length; i++) if (headRe.test(ps[i].heading || "")) return ps[i];
  for (var j = 0; j < ps.length; j++) if (textRe && textRe.test(ps[j].text || "")) return ps[j];
  return null;
}
function installStatus(c) {
  var ps = c.paragraphs || [];
  for (var i = 0; i < ps.length; i++) {
    var t = ps[i].text || "";
    if (/not included[^.]*install|install[^.]*not included|excluding[^.]*install|install[^.]*(excluded|extra cost|quoted separately)/i.test(t)) return { state: "excluded", from: ps[i].id };
  }
  for (var k = 0; k < ps.length; k++) {
    var u = ps[k].text || "";
    if (/(installation|setup|set-up)[^.]*(is |are )?included|includes?[^.]*(installation|setup)|installed by|(installation|setup|set-up)\s+(?:is\s+)?(?:done\s+|handled\s+|carried out\s+)?by\s+(?:our|the supplier|certified|brightline|its)/i.test(u)) return { state: "included", from: ps[k].id };
  }
  return { state: "unknown", from: null };
}

/* ---- Scenario packs: extra quote checks (only when the private field exists) ---- */
function readPercent(text) {
  var m = String(text == null ? "" : text).match(/(\d{1,3}(?:\.\d+)?)\s*%/) || String(text == null ? "" : text).match(/^\s*(\d{1,3}(?:\.\d+)?)\s*$/);
  if (!m) return null;
  var n = parseFloat(m[1]);
  return isFinite(n) && n >= 0 && n <= 100 ? n : null;
}
function readAdvance(text) {
  var t = String(text || "");
  if (/\bno advance\b/i.test(t)) return 0;
  var m = t.match(/(\d{1,3}(?:\.\d+)?)\s*%\s*(?:advance|in advance|upfront|up front)/i) ||
    t.match(/(?:advance|upfront|up front)[^.%]{0,30}?(\d{1,3}(?:\.\d+)?)\s*%/i);
  if (!m) return null;
  var n = parseFloat(m[1]);
  return isFinite(n) && n >= 0 && n <= 100 ? n : null;
}
function gstFlag(text) {
  var g = gstIncluded(text);
  if (g !== null) return g;
  return /(before|without|pre-?)\s*gst/i.test(String(text || "")) ? false : null;
}
function readUnitCap(text) {
  var t = String(text || "");
  var amount = readAmount(t);
  var u = t.match(/\bper\s+([a-z]+?)s?\b(?:\s+of\s+([a-z]+))?/i);
  return { amount: amount, unit: u ? u[1].toLowerCase() : null, item: u && u[2] ? u[2].toLowerCase() : null };
}
function findUnitPrice(c, priceP, unit, item) {
  var ps = (c.paragraphs || []).slice();
  if (priceP) ps = [priceP].concat(ps.filter(function (p) { return p !== priceP; }));
  var re = new RegExp("(?:\\brs\\b\\.?|\\binr\\b|\\u20b9)\\s*([\\d][\\d,]*(?:\\.\\d+)?)\\s*(?:\\/|per)\\s*" + unit + "s?\\b", "i");
  for (var i = 0; i < ps.length; i++) {
    var clauses = String(ps[i].text || "").split(/;|,(?!\d)|\.(?=\s|$)/);
    for (var j = 0; j < clauses.length; j++) {
      var cl = clauses[j];
      if (item && cl.toLowerCase().indexOf(item) < 0) continue;
      var m = cl.match(re);
      if (m) { var n = parseFloat(m[1].replace(/,/g, "")); if (isFinite(n) && n > 0) return { price: n, para: ps[i] }; }
    }
  }
  return null;
}
function extraQuoteChecks(c, pc, rate, priceP, checks) {
  var has = function (k) { return Object.prototype.hasOwnProperty.call(pc, k); };
  /* Advance payment: the % asked before delivery vs the private maximum. */
  if (has("maxAdvancePct")) {
    var maxAdv = readPercent(pc.maxAdvancePct);
    var payP = findPara(c, /payment|advance/i, /advance|upfront/i);
    var adv = payP ? readAdvance(payP.text) : null;
    if (maxAdv === null) {
      checks.push({ id: "advance", label: "Advance payment", status: "unknown", detail: "No maximum advance entered.", from: [] });
    } else if (adv === null) {
      checks.push({ id: "advance", label: "Advance payment", status: "unknown", detail: "The quote does not state an advance AION can read. Ask how much must be paid before delivery.", from: payP ? [payP.id] : [] });
    } else if (adv > maxAdv) {
      checks.push({ id: "advance", label: "Advance payment", status: "fail", detail: "The quote asks for " + adv + "% in advance; your private maximum is " + maxAdv + "%.", from: [payP.id] });
    } else {
      checks.push({ id: "advance", label: "Advance payment", status: "pass", detail: "The quote asks for " + adv + "% in advance, within your private maximum of " + maxAdv + "%.", from: [payP.id] });
    }
  }
  /* Margin: a per-unit rate in the quote vs the private highest buying price. */
  if (has("maxUnitCost")) {
    var cap = readUnitCap(pc.maxUnitCost);
    if (!cap.amount || !cap.unit) {
      checks.push({ id: "margin", label: "Margin", status: "unknown", detail: "No highest price per unit entered (for example \"Rs 1,900 per carton of oil, before GST\").", from: [] });
    } else {
      var what = (cap.item ? cap.item + " " : "") + cap.unit;
      var hit = findUnitPrice(c, priceP, cap.unit, cap.item);
      if (!hit) {
        checks.push({ id: "margin", label: "Margin", status: "unknown", detail: "The quote gives no price per " + what + " that AION can read. Ask for the per-" + cap.unit + " rate.", from: [] });
      } else {
        var qInc = gstIncluded(hit.para.text), cInc = gstFlag(pc.maxUnitCost), f = 1 + rate / 100;
        var q = hit.price, lim = cap.amount, status, basis;
        if (qInc !== null && cInc !== null) {
          if (qInc === false && cInc === true) q = q * f;
          if (qInc === true && cInc === false) lim = lim * f;
          status = q > lim ? "fail" : "pass";
          basis = qInc === cInc ? (qInc ? " (both including GST)" : " (both before GST)") : " (" + rate + "% GST added to compare like with like)";
        } else {
          var qOptions = qInc === null ? [q, q * f] : [qInc ? q : q * f];
          var capOptions = cInc === null ? [lim, lim * f] : [cInc ? lim : lim * f];
          var qMin = Math.min.apply(Math, qOptions), qMax = Math.max.apply(Math, qOptions);
          var capMin = Math.min.apply(Math, capOptions), capMax = Math.max.apply(Math, capOptions);
          status = qMax <= capMin ? "pass" : qMin > capMax ? "fail" : "unknown";
          basis = " (GST basis unclear; confirm whether both prices include GST before deciding)";
        }
        var head = cap.item ? cap.item.charAt(0).toUpperCase() + cap.item.slice(1) + " at " : "The rate of ";
        checks.push({ id: "margin", label: "Margin", status: status, detail: head + rupees(hit.price) + " per " + cap.unit + " is " +
          (status === "fail" ? "above" : status === "pass" ? "within" : "unclear against") + " your private ceiling of " + rupees(cap.amount) + " per " + cap.unit + basis + ".",
          from: [hit.para.id] });
      }
    }
  }
}

/* ---- Scenario packs: scam-call checks (c.caseKind === "scam") ---- */
var SCAM = {
  otp: /\b(otp|one[- ]time (?:password|code)|upi pin|mpin|m-pin|atm pin|pin|cvv|password|verification code)\b/i,
  money: /\b(transfer|send|pay|deposit|move)\b[^.]{0,60}(\brs\b|\binr\b|₹|\d|\bupi\b|\baccount\b|\bmoney\b|\bamount\b|\bfine\b|\bfee\b)|\b(upi|gpay|google pay|phonepe|paytm|gift cards?|google play cards?|bitcoin|crypto|safe account)\b/i,
  urgent: /\b(within \d+ (?:minutes?|mins?|hours?)|immediately|right now|urgent(?:ly)?|today itself|last chance|jaldi|turant)\b/i,
  secret: /\b(keep (?:it|this) (?:a )?secret|keep (?:it|this) confidential|do not tell|don't tell|not a word to|do not inform|don't inform|stay on (?:this|the) (?:video )?(?:call|line)|do not (?:cut|disconnect|hang up)|don't (?:cut|disconnect|hang up))\b/i,
  authority: /\b(police|inspector|cbi|cyber (?:cell|crime)|crime branch|narcotics|ncb|customs|enforcement directorate|income tax|rbi|reserve bank|court|judge|magistrate|trai|bank manager|bank officer)\b/i,
  phone: /(?:\+?91[\s-]*)?[6-9]\d(?:[\s-]?\d){8}/g,
  relation: /\byour (son|daughter|grandson|granddaughter|husband|wife|brother|sister|nephew|niece)\b(?:\s*,?\s*([A-Z][a-z]{2,}))?|\b(bete|beta|beti)\b/i,
  trouble: /\b(arrest(?:ed)?|custody|jail|accident|hospital|police station|kidnapp?ed|detained|lock-?up)\b/i,
};
function phoneDigits(text) {
  var out = [];
  String(text || "").replace(SCAM.phone, function (m) { out.push(m.replace(/\D/g, "").slice(-10)); return m; });
  return out;
}
function scamReconcile(c) {
  var pc = c.privateConstraints || {};
  var ps = c.paragraphs || [];
  var checks = [];
  var ids = function (re) { return ps.filter(function (p) { return re.test(String(p.text || "")); }).map(function (p) { return p.id; }); };
  var none = !ps.length;
  var unknownAll = "There are no conversation lines to check.";
  /* 1. OTP / PIN / password */
  var otp = ids(SCAM.otp);
  checks.push(none ? { id: "otp", label: "Asks for a code", status: "unknown", detail: unknownAll, from: [] }
    : otp.length ? { id: "otp", label: "Asks for a code", status: "fail", detail: "The caller asks for an OTP, PIN or password. Never share one: it lets someone take money from your account.", from: otp }
    : { id: "otp", label: "Asks for a code", status: "pass", detail: "No request for an OTP, PIN or password in these lines.", from: [] });
  /* 2. Money */
  var money = ids(SCAM.money);
  checks.push(none ? { id: "money", label: "Asks for money", status: "unknown", detail: unknownAll, from: [] }
    : money.length ? { id: "money", label: "Asks for money", status: "fail", detail: "The caller asks you to send money (a transfer, UPI, a \"safe account\" or gift cards) to an account you do not know.", from: money }
    : { id: "money", label: "Asks for money", status: "pass", detail: "No request to send money in these lines.", from: [] });
  /* 3. Urgency and secrecy */
  var urg = ids(SCAM.urgent), sec = ids(SCAM.secret);
  var both = urg.concat(sec.filter(function (x) { return urg.indexOf(x) < 0; }));
  checks.push(none ? { id: "pressure", label: "Urgency or secrecy", status: "unknown", detail: unknownAll, from: [] }
    : urg.length && sec.length ? { id: "pressure", label: "Urgency or secrecy", status: "fail", detail: "The caller rushes you AND tells you to keep it secret. Genuine officials give you time and let you talk to your family.", from: both }
    : both.length ? { id: "pressure", label: "Urgency or secrecy", status: "risk", detail: urg.length ? "The caller is rushing you. Take your time." : "The caller asks you to keep this secret or stay on the call.", from: both }
    : { id: "pressure", label: "Urgency or secrecy", status: "pass", detail: "No rushing or secrecy in these lines.", from: [] });
  /* 4. Claims of authority */
  var auth = ids(SCAM.authority);
  var authWords = [];
  ps.forEach(function (p) { var m = String(p.text || "").match(SCAM.authority); var w = m ? (/^(cbi|rbi|ncb|trai)$/i.test(m[1]) ? m[1].toUpperCase() : m[1].toLowerCase()) : null; if (w && authWords.indexOf(w) < 0) authWords.push(w); });
  checks.push(none ? { id: "authority", label: "Claims authority", status: "unknown", detail: unknownAll, from: [] }
    : auth.length ? { id: "authority", label: "Claims authority", status: "risk", detail: "The caller claims to be official (" + authWords.join(", ") + "). Anyone can say this on a call; police and banks do not demand payment or codes by phone.", from: auth }
    : { id: "authority", label: "Claims authority", status: "pass", detail: "No claim to be police, a bank or a court in these lines.", from: [] });
  /* 5. Caller's number vs the numbers she saved (private) */
  var idP = null;
  for (var i = 0; i < ps.length && !idP; i++) if (/caller id|number|from/i.test(ps[i].heading || "") && phoneDigits(ps[i].text).length) idP = ps[i];
  for (var j = 0; j < ps.length && !idP; j++) if (phoneDigits(ps[j].text).length) idP = ps[j];
  var callerNum = idP ? phoneDigits(idP.text)[0] : null;
  var known = phoneDigits(pc.knownNumbers);
  if (!known.length) checks.push({ id: "caller", label: "Caller's number", status: "unknown", detail: "No family numbers saved, so AION cannot compare. Call your family on a number you already have.", from: [] });
  else if (!callerNum) checks.push({ id: "caller", label: "Caller's number", status: "unknown", detail: "AION cannot read the caller's number in these lines. Do not trust a number the caller gives you.", from: [] });
  else if (known.indexOf(callerNum) >= 0) checks.push({ id: "caller", label: "Caller's number", status: "pass", detail: "The caller's number matches one you saved privately.", from: [idP.id] });
  else checks.push({ id: "caller", label: "Caller's number", status: "fail", detail: "The caller's number is not any of the family numbers you saved privately.", from: [idP.id] });
  /* 6. A claim about the family vs her private facts */
  var claims = [];
  ps.forEach(function (p) {
    var t = String(p.text || ""), m = t.match(SCAM.relation);
    if (m && SCAM.trouble.test(t)) claims.push({ id: p.id, rel: (m[1] || m[3] || "").toLowerCase(), name: m[2] || "" });
  });
  var names = String(pc.familyNames || "").split(/[,;\n]|\band\b/).map(function (x) { var w = x.trim().match(/[A-Za-z]{2,}/); return w ? w[0].toLowerCase() : ""; }).filter(Boolean);
  if (!claims.length) {
    checks.push({ id: "family", label: "Family claim", status: "pass", detail: "The caller makes no claim that someone in your family is in trouble.", from: [] });
  } else {
    var rel = { bete: "son", beta: "son", beti: "daughter" }[claims[0].rel] || claims[0].rel || "family member";
    var why = [];
    var wrongName = claims.filter(function (k) { return k.name && names.length && names.indexOf(k.name.toLowerCase()) < 0; })[0];
    if (wrongName) why.push("the caller calls your " + rel + " \"" + wrongName.name + "\", a name that is not in your private family list");
    if (pc.relativeSafe === true) why.push("you noted privately that your " + rel + " is safe right now");
    var cIds = claims.map(function (k) { return k.id; });
    if (why.length) checks.push({ id: "family", label: "Family claim", status: "fail", detail: "The caller says your " + rel + " is in trouble, but " + why.join(", and ") + ".", from: cIds });
    else checks.push({ id: "family", label: "Family claim", status: "unknown", detail: "The caller says your " + rel + " is in trouble. Call your " + rel + " on a number you already have before doing anything.", from: cIds });
  }
  var fails = checks.filter(function (k) { return k.status === "fail"; });
  var open = checks.filter(function (k) { return k.status === "unknown" || k.status === "risk"; });
  var verdict = fails.length ? "not_suitable" : open.length ? "needs_answers" : "fits";
  var sharedIds = ps.filter(function (p) { return p.shared && !(p.injection && p.injection.flagged && !p.injectionOverride); }).map(function (p) { return p.id; });
  var hiddenUsed = [];
  checks.forEach(function (k) { (k.from || []).forEach(function (id) { if (id && sharedIds.indexOf(id) < 0 && hiddenUsed.indexOf(id) < 0) hiddenUsed.push(id); }); });
  return { verdict: verdict, checks: checks, fails: fails.length, open: open.length, privatePassagesUsed: hiddenUsed };
}

function reconcile(c) {
  if (c && c.caseKind === "scam") return scamReconcile(c);
  var pc = c.privateConstraints || {};
  var checks = [];
  var rate = parseFloat(String(pc.gstRate == null || pc.gstRate === "" ? "18" : pc.gstRate).replace(/[^\d.]/g, ""));
  if (!isFinite(rate) || rate < 0 || rate > 50) rate = 18;

  /* 1. Budget */
  var priceP = findPara(c, /price|cost|fee|commercial/i, CUR_TEST);
  var qHit = priceP ? pickPrice(priceP.text) : null;
  var bHit = pickPrice(pc.maxBudget);
  var quote = qHit ? qHit.amount : null;
  var budget = bHit ? bHit.amount : null;
  var terms = readTerms(c);
  var freight = terms.filter(function (x) { return x !== "CIF" && x !== "DDP"; });
  var freightNote = freight.length ? " Freight to you is not included (" + freight.join(", ") + "), so the landed cost will be higher." : "";
  /* What plain code read from the quote, kept on the check so it can be shown and tested. */
  var bRead = function (k, qInc, r) {
    k.quoteAmount = quote; k.currency = qHit.currency; k.taxIncluded = qInc; k.taxRate = r; k.terms = terms;
    if (freightNote) k.detail += freightNote;
    return k;
  };
  if (!budget) {
    checks.push({ id: "budget", label: "Budget", status: "unknown", detail: "No maximum budget entered.", from: [] });
  } else if (!quote) {
    checks.push({ id: "budget", label: "Budget", status: "unknown", detail: "The proposal does not state a price AION can read. Ask the supplier for a total.", from: [] });
  } else if (qHit.currency !== bHit.currency) {
    checks.push(bRead({ id: "budget", label: "Budget", status: "unknown", detail: "The quote is in " + qHit.currency + " (" + money(quote, qHit.currency) +
      ") and your private limit is in " + bHit.currency + ". AION does not convert currencies: enter the limit in " + qHit.currency +
      " or ask the supplier for a price in " + bHit.currency + ".", from: [priceP.id] }, gstIncluded(priceP.text), rate));
  } else {
    var cur = qHit.currency, tw = taxWord(priceP.text + " " + pc.maxBudget, cur), mo = function (n) { return money(n, cur); };
    var qInc = gstIncluded(priceP.text), bInc = gstIncluded(pc.maxBudget);
    /* A rate the quote states ("+ 5% GST") beats the private default. */
    var stated = qInc === false ? statedTaxRate(priceP.text) : null;
    var r = stated != null ? stated : rate;
    var f = 1 + r / 100;
    /* When a tax basis is not written down, both readings are kept as a range
     * instead of guessing one: quote low/high and limit low/high. */
    var qLow = qInc === false ? quote * f : quote, qHigh = qInc === null ? quote * f : qLow;
    var bLow = bInc === false ? budget * f : budget, bHigh = bInc === null ? budget * f : bLow;
    var qTotal = qLow, bTotal = bLow;
    var how = mo(quote) + (qInc === false ? " + " + r + "% " + tw + " = " + mo(qTotal) : (qInc ? " including " + tw : " (" + tw + " not stated)"));
    if (qLow > bHigh) {
      checks.push(bRead({ id: "budget", label: "Budget", status: "fail", detail: how + " is over your private limit of " + mo(bHigh) +
        (bInc === null ? " (even if that limit also had " + tw + " added)" : "") + " by " + mo(qLow - bHigh) + ".", from: [priceP.id],
        assumption: qInc === false ? (stated != null ? r + "% " + tw + " as stated in the quote" : r + "% " + tw + " assumed (change it in Private requirements)") : "" }, qInc, r));
    } else if (qHigh > bLow) {
      /* The answer depends on a tax basis nobody wrote down: do not guess. */
      var which = (qInc === null ? "the proposal does not say whether its price includes " + tw : "") +
        (qInc === null && bInc === null ? ", and " : "") + (bInc === null ? "your private limit does not say whether it includes " + tw : "");
      checks.push(bRead({ id: "budget", label: "Budget", status: "unknown",
        detail: "Not decided: " + which + ". With " + tw + " at " + r + "%, the quote is " + (qLow === qHigh ? mo(qLow) : "between " + mo(qLow) + " and " + mo(qHigh)) +
          " against a limit of " + (bLow === bHigh ? mo(bLow) : "between " + mo(bLow) + " and " + mo(bHigh)) +
          ", so the result could go either way. Ask the supplier, or state the limit's " + tw + " basis in Private requirements.",
        from: [priceP.id], assumption: tw + " basis not stated (" + [qInc === null ? "quote" : "", bInc === null ? "limit" : ""].filter(Boolean).join(" and ") + "); not guessed" }, qInc, r));
    } else {
      checks.push(bRead({ id: "budget", label: "Budget", status: qInc === null ? "unknown" : "pass", detail: how + " is within your private limit of " + mo(bTotal) +
        (qInc === null ? ", but the proposal does not say whether " + tw + " is included." : bInc === null ? " (within it with or without " + tw + " on the limit)." : "."), from: [priceP.id] }, qInc, r));
    }
  }

  /* 2. Ready-by deadline */
  var ready = readDate(pc.readyBy);
  var dl = c.deadlineLabel ? String(c.deadlineLabel) : null;
  var delP = findPara(c, /deliver/i, /deliver/i);
  var del = delP ? readDate(delP.text) : null;
  var inst = installStatus(c);
  if (!ready) {
    checks.push({ id: "deadline", label: "Deadline", status: "unknown", detail: dl ? "No " + dl + " entered." : "No ready-by date entered.", from: [] });
  } else if (ready.invalid) {
    checks.push({ id: "deadline", label: "Deadline", status: "unknown", detail: ready.ambiguous
      ? "The ready-by date \"" + ready.label + "\" could be read as day/month or month/day, so it is not used. Write the month in words in Private requirements."
      : "The ready-by date \"" + ready.label + "\" is not a real calendar date or time, so it is not used. Correct it in Private requirements.", from: [] });
  } else if (del && del.invalid) {
    checks.push({ id: "deadline", label: "Deadline", status: "unknown", detail: del.ambiguous
      ? "The delivery date in the proposal (\"" + del.label + "\") could be read as day/month or month/day. AION does not guess: ask the supplier to write the month in words."
      : "The delivery date in the proposal (\"" + del.label + "\") is not a real calendar date or time. Ask the supplier to confirm it.", from: delP ? [delP.id] : [] });
  } else if (!del) {
    var lead = delP ? readLeadTime(delP.text) : null;
    var noDate = { id: "deadline", label: "Deadline", status: "unknown", detail: lead
      ? "The proposal gives only a lead time (\"" + lead + "\"), not a delivery date, so it cannot be checked against your " + (dl || "ready-by date") + ". Ask the supplier for a delivery date."
      : "The proposal does not give a delivery date AION can read. Ask for one.", from: delP ? [delP.id] : [] };
    if (lead) noDate.leadTime = lead;
    checks.push(noDate);
  } else if (del.day > ready.day) {
    checks.push({ id: "deadline", label: "Deadline", status: "fail", detail: "Delivery (" + del.label + ") is after " + (dl ? "your " + dl : "the date it must already be working") + " (" + ready.label + ").", from: [delP.id] });
  } else if (del.day === ready.day) {
    /* Excluded installation is a fact in the proposal. An installation the proposal
     * simply does not mention is "not confirmed": it must never be reported as excluded. */
    var noSetup = !!pc.installationRequired && inst.state === "excluded";
    var unconfirmed = !!pc.installationRequired && inst.state === "unknown";
    var late = del.time != null && ready.time != null && del.time >= ready.time;
    checks.push({ id: "deadline", label: "Deadline", status: noSetup || late ? "fail" : unconfirmed ? "unknown" : "risk",
      detail: "Delivery is on " + del.label + (del.vague ? " (\"morning\", no time given)" : "") + ", the same day it must be working by " +
        (ready.time != null ? String(Math.floor(ready.time / 60)).padStart(2, "0") + ":" + String(ready.time % 60).padStart(2, "0") : "the start") +
        (noSetup ? ", with installation excluded, so there is no time to set it up." : late ? ", but after that time." :
          unconfirmed ? ". Installation is not confirmed in the proposal, so it is not known whether there is time to set it up. Ask the supplier." : ". Same-day delivery leaves little margin."),
      from: [delP.id].concat(noSetup && inst.from ? [inst.from] : []) });
  } else {
    checks.push({ id: "deadline", label: "Deadline", status: "pass", detail: "Delivery (" + del.label + ") is before your " + (dl || "ready-by date") + " (" + ready.label + ").", from: [delP.id] });
  }

  if (del && !del.invalid) {
    var dk = checks.filter(function (k) { return k.id === "deadline"; })[0];
    if (dk) dk.deliveryRead = { day: isoDay(del.day), time: del.time, label: del.label };
  }

  /* 3. Installation (null = not applicable: no check, used by scenario packs) */
  if (pc.installationRequired === null) {
    /* not applicable */
  } else if (!pc.installationRequired) {
    checks.push({ id: "install", label: "Installation", status: "pass", detail: "You did not require installation.", from: [] });
  } else if (inst.state === "excluded") {
    checks.push({ id: "install", label: "Installation", status: "fail", detail: "You require installation, but the proposal excludes it.", from: [inst.from] });
  } else if (inst.state === "included") {
    checks.push({ id: "install", label: "Installation", status: "pass", detail: "Installation is included.", from: [inst.from] });
  } else {
    checks.push({ id: "install", label: "Installation", status: "unknown", detail: "Installation is not confirmed: you require it, and the proposal does not say whether it is included. Ask the supplier.", from: [] });
  }

  /* 4-5. Advance payment and margin: only when those private fields exist */
  extraQuoteChecks(c, pc, rate, priceP, checks);

  var fails = checks.filter(function (k) { return k.status === "fail"; });
  var open = checks.filter(function (k) { return k.status === "unknown" || k.status === "risk"; });
  var verdict = fails.length ? "not_suitable" : open.length ? "needs_answers" : "fits";
  /* "Shared" means really shareable: ticked AND not held by an injection flag
   * (unless the user overrode it). Same body as src/caseRules.js. */
  var sharedIds = (c.paragraphs || []).filter(function (p) { return p.shared && !(p.injection && p.injection.flagged && !p.injectionOverride); }).map(function (p) { return p.id; });
  var hiddenUsed = [];
  checks.forEach(function (k) { (k.from || []).forEach(function (id) { if (id && sharedIds.indexOf(id) < 0 && hiddenUsed.indexOf(id) < 0) hiddenUsed.push(id); }); });
  return { verdict: verdict, checks: checks, fails: fails.length, open: open.length, gstRate: rate, privatePassagesUsed: hiddenUsed };
}

/* How the local verdict relates to the cloud's provisional one. Severity:
 * reasonable/fits 0, caution/needs answers 1, not suitable 2. */
var CLOUD_SEV = { reasonable: 0, caution: 1, "not suitable": 2 };
var LOCAL_SEV = { fits: 0, needs_answers: 1, not_suitable: 2 };
function compareVerdicts(cloud, local) {
  if (!cloud || !(cloud in CLOUD_SEV)) return { changed: false, direction: "unknown" };
  var d = LOCAL_SEV[local] - CLOUD_SEV[cloud];
  return { changed: d !== 0, direction: d > 0 ? "stricter" : d < 0 ? "looser" : "same" };
}

/* The cloud is asked to open with "VERDICT: reasonable | caution | not suitable". */
function cloudVerdict(text) {
  var m = String(text || "").match(/VERDICT:\s*(reasonable|caution|not suitable)/i);
  return m ? m[1].toLowerCase() : null;
}

/* ---------------- quote intake ---------------- */
/* Text path: plain code sorts the quote's sentences into the passages the
 * review reads (price, delivery, scope, warranty, cancellation). Image path:
 * Gemini Nano reads the screenshot on this device and fills the same fields.
 * Either way every passage starts PRIVATE; nothing is sent until you share
 * a passage and approve the exact text. */
var BUCKETS = [
  { key: "price", heading: "Price and payment", re: /(\brs\b\.?|\binr\b|\u20b9|\$|\u00a3|\u20ac|\busd\b|\bgbp\b|\beur\b|\bprice|\bcost|\btotal\b|\bpayment|\badvance\b|\bdeposit\b|\bgst\b|\bvat\b|\btax)/i },
  { key: "delivery", heading: "Delivery", re: /(deliver|dispatch|arriv|ship|lead time)/i },
  { key: "scope", heading: "Scope and exclusions", re: /(install|setup|set-up|rigging|exclud|not included|includes|technician|scope)/i },
  { key: "warranty", heading: "Warranty and support", re: /(warrant|guarantee|support|maintenance)/i },
  { key: "cancellation", heading: "Cancellation", re: /(cancel|refund|termination)/i },
];
function quoteFromText(text) {
  var lines = String(text || "").replace(/\r/g, "").split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
  var supplier = "";
  /* A company name may end in "Ltd." or "Inc."; that dot does not make it a sentence. */
  var head = lines.length ? lines[0].replace(/\b(?:ltd|inc|co|corp|llp|llc|pvt|plc|gmbh)\.$/i, "") : "";
  if (lines.length && lines[0].length <= 60 && !/\d/.test(lines[0]) && !/[.:]$/.test(head)) supplier = lines.shift();
  var sentences = [];
  /* Split after . ! ? before a capital or a currency sign, but not after "No." / "Ref." / "Ltd." */
  var SPLIT = /(?<!\b(?:No|no|Ref|ref|Mr|Mrs|Ms|Dr|Inc|Ltd|Co|St|Qty|Approx|approx|incl|excl)\.)(?<=[.!?])\s+(?=[A-Z\u20b9$\u00a3\u20ac])/;
  lines.forEach(function (l) { l.split(SPLIT).forEach(function (x) { if (x.trim()) sentences.push(x.trim()); }); });
  var bins = { other: [] };
  BUCKETS.forEach(function (b) { bins[b.key] = []; });
  sentences.forEach(function (x) {
    /* "Cancellation: full refund before delivery" belongs to its label, not to the
     * first bucket a later word happens to match. */
    var lab = x.match(/^([A-Za-z][A-Za-z &\/-]{1,30}):\s/);
    if (lab) for (var j = 0; j < BUCKETS.length; j++) if (BUCKETS[j].re.test(lab[1])) { bins[BUCKETS[j].key].push(x); return; }
    for (var i = 0; i < BUCKETS.length; i++) if (BUCKETS[i].re.test(x)) { bins[BUCKETS[i].key].push(x); return; }
    bins.other.push(x);
  });
  return fieldsToQuote({ supplier: supplier, price: bins.price.join(" "), delivery: bins.delivery.join(" "), scope: bins.scope.join(" "),
    warranty: bins.warranty.join(" "), cancellation: bins.cancellation.join(" "), other: bins.other.join(" ") }, "text");
}
function fieldsToQuote(f, by) {
  var order = [["other", "Overview"]].concat(BUCKETS.map(function (b) { return [b.key, b.heading]; }));
  var paragraphs = [];
  order.forEach(function (o) { var t = String(f[o[0]] || "").trim(); if (t) paragraphs.push({ heading: o[1], text: t }); });
  return { supplier: String(f.supplier || "").trim() || "Imported supplier", paragraphs: paragraphs, by: by };
}
/* ==== RULES END ==== */


/* Passage class for the disclosure meter: the quote-intake bucket a passage
 * belongs to. Heading first (intake headings are exact), then the same
 * sentence regexes the intake uses; anything else is "other". */
export function passageClass(p) {
  const head = String((p && p.heading) || "");
  for (let i = 0; i < BUCKETS.length; i++) if (head === BUCKETS[i].heading) return BUCKETS[i].key;
  if (/price|cost|payment|fee|commercial/i.test(head)) return "price";
  if (/deliver/i.test(head)) return "delivery";
  if (/scope|exclu|install/i.test(head)) return "scope";
  if (/warrant|support/i.test(head)) return "warranty";
  if (/cancel/i.test(head)) return "cancellation";
  if (/overview|equipment|summary/i.test(head)) return "other";
  const text = String((p && p.text) || "");
  for (let j = 0; j < BUCKETS.length; j++) if (BUCKETS[j].re.test(text)) return BUCKETS[j].key;
  return "other";
}

export { reconcile, compareVerdicts, cloudVerdict, quoteFromText, fieldsToQuote, readDate, readMoney, installStatus, BUCKETS, CLOUD_SEV, LOCAL_SEV };
export const caseRules = { reconcile, compareVerdicts, cloudVerdict, quoteFromText };
