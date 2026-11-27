/* AION Hybrid Web - Case view (hybrid-v2, Packet 2).
 *
 * The private case workspace and its disclosure boundary:
 *   - every paragraph of the supplier proposal has an id (P1, P2 ...) and a
 *     "share with cloud" switch; private constraints have no switch at all;
 *   - "What the cloud will see" is the exact text, built from allowlisted
 *     fields, with its SHA-256 fingerprint;
 *   - Approve binds to that fingerprint and case revision; any edit, even one
 *     character, makes the approval stale; each approval is good for ONE send;
 *   - the 6-canary leak test plants fake secrets and searches the Firebase AI request bodies observed during the run.
 * Data and rules live in standalone.js (caseApi) and src/egress.js; this file
 * only draws the view. All user text is written with textContent / escaping.
 */
(function () {
  "use strict";

  var root = null;
  var st = { c: null, prep: null, lastApproval: null, result: null, leak: null, busy: "", error: "" };
  var saveTimer = null;
  var pendingMutations = [];

  function api() { return window.AionStandalone && window.AionStandalone.caseApi; }
  function eg() { return window.AionHybrid && window.AionHybrid.egress; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function short(d) { return d ? String(d).slice(0, 12) : ""; }
  function el(id) { return document.getElementById(id); }

  function whenReady() {
    return new Promise(function (resolve) {
      (function poll() {
        if (api() && eg()) return resolve();
        setTimeout(poll, 150);
      })();
    });
  }

  /* ---------------- private review (verdict flip) ---------------- */
  /* Runs ONLY in this browser, on the FULL proposal (shared and unshared
   * passages) and the private requirements. Plain code, no model, no network.
   * Every check names the passage it read and says plainly when it could not
   * read something, instead of guessing. */
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

  function renderIntake(msg, tone) {
    var box = el("caseIntakeStatus");
    if (!box) return;
    box.className = "case-intake-status" + (tone ? " is-" + tone : "");
    box.textContent = msg || "";
  }
  function applyQuote(q, note) {
    if (!q.paragraphs.length) { renderIntake("No quote details found. Check the text and try again.", "warn"); return Promise.resolve(); }
    clearTimeout(saveTimer); pendingMutations = [];
    if (st.prep && eg().isApproved(st.prep.disclosure)) st.lastApproval = { rev: st.prep.disclosure.inputRevision, digest: st.prep.disclosure.contentDigest };
    return api().importQuote(q).then(function (c) {
      st.c = c; st.result = null; st.cloudAt = null;
      renderAll();
      renderIntake(note, "ok");
      return prepare();
    });
  }
  function readPasted() {
    var t = (el("caseIntakeText") || {}).value || "";
    if (!t.trim()) { renderIntake("Paste the quote text first.", "warn"); return; }
    var q = quoteFromText(t);
    applyQuote(q, "Sorted into " + q.paragraphs.length + " passage" + (q.paragraphs.length === 1 ? "" : "s") +
      " by plain code in this browser. All passages start private. Check them below.");
  }
  /* On small machines, reading an image with Nano can keep the whole computer
   * busy for a minute or more (seen on an 8 GB laptop). Warn first and ask for
   * a second go; the pasted-text path is always the quick option. */
  var heavyArmed = null;
  function isSmallMachine() { return typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 8; }
  function readImage(file, opts) {
    var H = window.AionHybrid;
    if (!H || !H.intake) { renderIntake("The on-device reader is not loaded yet.", "warn"); return; }
    if (isSmallMachine() && !(opts && opts.confirmed) && !(heavyArmed && heavyArmed.name === file.name && Date.now() - heavyArmed.at < 30000)) {
      heavyArmed = { name: file.name, at: Date.now(), file: file };
      renderIntake("This computer reports " + navigator.deviceMemory + " GB of memory. Reading an image on the device can keep it busy for a minute or two. " +
        "Choose the same image again (or drop it again) within 30 s to go ahead, or paste the quote's text instead - that is instant.", "warn");
      return;
    }
    heavyArmed = null;
    var before = eg().outboundSince ? eg().outboundSince(0).length : 0;
    renderIntake("Gemini Nano is reading the image on this device… This can take a minute or two on an 8 GB laptop, and the page may feel slow meanwhile.", "");
    st.busy = "intake";
    H.intake.readQuoteImage(file).then(function (r) {
      var sent = eg().outboundSince ? eg().outboundSince(0).length - before : 0;
      var q = fieldsToQuote(r.fields, "nano-image");
      return applyQuote(q, "Read by Gemini Nano on this device in " + (r.latencyMs / 1000).toFixed(1) + " s from a " + r.image.width + "x" + r.image.height +
        " image. Requests to the cloud while reading: " + sent + ". All passages start private. Check every field: the model can misread.");
    }, function (e) {
      renderIntake(String(e && e.message || e), "warn");
    }).then(function () { st.busy = ""; });
  }

  /* ---------------- state ---------------- */
  function approvalStatus() {
    var p = st.prep;
    if (!p || !st.c) return { key: "none", text: "Preparing…" };
    var d = p.disclosure;
    if (d.approvalState === "sent") return { key: "sent", text: "Sent — this approval is used up. Approve again to send again." };
    if (eg().isApproved(d) && d.inputRevision === st.c.inputRevision) {
      return { key: "approved", text: "Approved for case revision " + d.inputRevision + " · fingerprint " + short(d.contentDigest) };
    }
    if (st.lastApproval && st.lastApproval.rev !== st.c.inputRevision) {
      return { key: "stale", text: "Your approval for revision " + st.lastApproval.rev + " (fingerprint " + short(st.lastApproval.digest) +
        ") is stale — the case changed. Review the new text below and approve again." };
    }
    return { key: "draft", text: "Not approved — nothing will be sent until you approve this exact text." };
  }

  function prepare() {
    return api().prepareDisclosure(null).then(function (prep) {
      st.prep = prep;
      st.error = "";
      renderDisclosure();
    }, function (e) {
      st.prep = null;
      st.error = String(e && e.message || e);
      renderDisclosure();
    });
  }

  /* Edits are batched for 350 ms, saved (revision +1), then a new draft is
   * prepared. An approval of the previous text is NOT carried over. */
  function queueEdit(mutate) {
    pendingMutations.push(mutate);
    var wasApproved = st.prep && eg().isApproved(st.prep.disclosure);
    if (wasApproved) st.lastApproval = { rev: st.prep.disclosure.inputRevision, digest: st.prep.disclosure.contentDigest };
    markDirty();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushEdits, 350);
  }
  function flushEdits() {
    var muts = pendingMutations.splice(0);
    if (!muts.length) return Promise.resolve();
    var flagsBefore = injectionKey(st.c);
    return api().update(function (c) { muts.forEach(function (m) { m(c); }); }).then(function (c) {
      st.c = c;
      /* An edit can add (or remove) an injection flag. The passage cards only
       * show the warning when they are drawn, so redraw them now - keeping the
       * caret where the user was typing. */
      if (injectionKey(c) !== flagsBefore) redrawKeepingFocus();
      renderRevision();
      renderReview();
      return prepare();
    });
  }
  function injectionKey(c) {
    return ((c && c.paragraphs) || []).map(function (p) {
      return p.id + ":" + (p.injection && p.injection.flagged ? "F" + (p.injectionOverride ? "o" : "") + (p.injection.rules || []).join(",") : "-");
    }).join("|");
  }
  function redrawKeepingFocus() {
    var a = document.activeElement, id = a && a.getAttribute && a.getAttribute("data-ptext");
    var s0 = id ? a.selectionStart : null, s1 = id ? a.selectionEnd : null;
    renderAll();
    if (!id) return;
    var ta = root.querySelector('[data-ptext="' + id + '"]');
    if (ta) { ta.focus(); try { ta.setSelectionRange(s0, s1); } catch (e) { /* not a text field */ } }
  }
  function markDirty() {
    var chip = el("caseApprovalChip");
    if (chip) { chip.className = "case-chip is-stale"; chip.textContent = "Changed — saving and rebuilding the disclosure…"; }
    ["caseApproveBtn", "caseSendBtn"].forEach(function (id) { var b = el(id); if (b) b.disabled = true; });
  }

  /* ---------------- scenario packs ---------------- */
  /* Packs store their own private field list (c.privateFields) and verdict
   * labels (c.labels); the original sample case has neither and is drawn
   * exactly as before. */
  function verdictLabel(c, v) { return ((c && c.labels) || VERDICT_TEXT)[v] || VERDICT_TEXT[v] || v; }
  function packFieldsHtml(c, pc) {
    return c.privateFields.map(function (f) {
      var k = esc(f.key), v = pc[f.key];
      if (f.type === "bool") return '<label class="case-field case-check"><input type="checkbox" data-pfield="' + k + '"' + (v ? " checked" : "") + '><span>' + esc(f.label) + '</span></label>';
      if (f.type === "text") return '<label class="case-field"><span>' + esc(f.label) + '</span><textarea class="case-ta" rows="2" data-pfield="' + k + '">' + esc(v == null ? "" : v) + '</textarea></label>';
      return '<label class="case-field"><span>' + esc(f.label) + '</span><input type="text" data-pfield="' + k + '" value="' + esc(v == null ? "" : v) + '"></label>';
    }).join("");
  }
  function loadPackHere(id, opts) {
    if (!api() || !api().loadPack) return Promise.reject(new Error("Scenario packs need standalone.js."));
    clearTimeout(saveTimer); pendingMutations = [];
    return api().loadPack(id, opts).then(function (c) { return adoptPack(c); });
  }
  function adoptPack(c) {
    st.c = c; st.result = null; st.cloudAt = null; st.lastApproval = null; st.prep = null; st.leak = null;
    if (!root) return Promise.resolve(c);
    renderAll();
    return prepare().then(function () { return c; });
  }

  /* ---------------- rendering ---------------- */
  function renderAll() {
    if (!root) return;
    var c = st.c;
    var paras = c.paragraphs.map(function (p) {
      return '<div class="case-para' + (p.shared ? " is-shared" : "") + '" data-pid="' + esc(p.id) + '">' +
        '<div class="case-para-head"><span class="case-pid">' + esc(p.id) + '</span><span class="case-ph">' + esc(p.heading) + '</span>' +
        '<label class="case-share"><input type="checkbox" data-share="' + esc(p.id) + '"' + (p.shared ? " checked" : "") +
        '> share with cloud</label></div>' +
        (p.injection && p.injection.flagged
          ? '<div class="case-warn" data-inj="' + esc(p.id) + '"></div><label class="case-share"><input type="checkbox" data-injover="' + esc(p.id) + '"' +
            (p.injectionOverride ? " checked" : "") + '> I read it: allow sharing anyway</label>' : '') +
        '<textarea class="case-ta" rows="3" data-ptext="' + esc(p.id) + '" aria-label="Paragraph ' + esc(p.id) + '">' + esc(p.text) + '</textarea></div>';
    }).join("");
    var srcs = c.publicSources.map(function (s) {
      return '<div class="case-src"><div class="case-para-head"><span class="case-pid">' + esc(s.id) + '</span><span class="case-ph">' +
        esc(s.title) + '</span></div><div class="case-src-label">' + esc(s.label) + '</div><div class="case-src-text">' + esc(s.text) + '</div></div>';
    }).join("");
    var pc = c.privateConstraints || {};
    root.innerHTML =
      '<section class="card wide case-head-card">' +
        '<div class="card-head"><div class="card-title">' + esc(c.title) + '</div>' +
        '<span class="case-chip" id="caseRevChip"></span></div>' +
        '<div class="card-sub">' + esc((c.roles && c.roles.buyer) || "Buyer") + ': ' + esc(c.buyer) + ' · ' + esc((c.roles && c.roles.supplier) || "Supplier") + ': ' + esc(c.supplier) +
        ' · Sample case — every name and number is fictional. Stored only in this browser.</div>' +
        '<div class="case-actions"><button type="button" class="pill hy-btn" id="caseResetBtn">RESET SAMPLE CASE</button></div>' +
      '</section>' +
      '<section class="card wide case-card" id="caseIntakeCard">' +
        '<div class="card-head"><div class="card-title">Add a supplier quote</div></div>' +
        '<div class="card-sub">Paste the quote text, or drop a PNG/JPEG screenshot. Text is sorted by plain code; an image is read by Gemini Nano on this device. ' +
        'Neither is uploaded. This replaces the proposal below; your private requirements stay. RESET SAMPLE CASE brings the sample back.</div>' +
        '<textarea class="case-ta" rows="3" id="caseIntakeText" placeholder="Paste a supplier quote here"></textarea>' +
        '<div class="case-actions">' +
          '<button type="button" class="pill hy-btn" id="caseIntakeTextBtn">SORT PASTED TEXT</button>' +
          '<label class="pill hy-btn case-file-btn">READ SCREENSHOT ON DEVICE<input type="file" id="caseIntakeFile" accept="image/png,image/jpeg" hidden></label>' +
        '</div>' +
        '<div class="case-intake-status" id="caseIntakeStatus"></div>' +
      '</section>' +
      '<section class="card case-card">' +
        '<div class="card-title">' + esc((c.roles && c.roles.passages) || "Supplier proposal") + '</div>' +
        '<div class="card-sub">Private by default. Tick "share with cloud" only for passages the cloud may read.</div>' +
        paras +
      '</section>' +
      '<section class="card case-card">' +
        '<div class="card-title">Private requirements</div>' +
        '<div class="card-sub">Never sent. There is no field for these in any disclosure; they are for the local review.</div>' +
        (Array.isArray(c.privateFields) ? packFieldsHtml(c, pc) :
        '<label class="case-field"><span>Maximum budget</span><input type="text" id="caseBudget" value="' + esc(pc.maxBudget) + '"></label>' +
        '<label class="case-field"><span>Must be working by</span><input type="text" id="caseReadyBy" value="' + esc(pc.readyBy) + '"></label>' +
        '<label class="case-field"><span>GST rate for the comparison (%)</span><input type="text" id="caseGst" value="' + esc(pc.gstRate == null ? "18" : pc.gstRate) + '"></label>' +
        '<label class="case-field case-check"><input type="checkbox" id="caseInstall"' + (pc.installationRequired ? " checked" : "") +
          '><span>Installation and setup must be included</span></label>' +
        '<label class="case-field"><span>Confidential note</span><textarea class="case-ta" rows="3" id="caseNote">' + esc(pc.confidentialNote) + '</textarea></label>') +
        '<div class="card-title case-sub-title">Shareable requirements</div>' +
        '<div class="card-sub">One per line. These ARE sent when you approve.</div>' +
        '<textarea class="case-ta" rows="3" id="caseReqs">' + esc((c.shareableRequirements || []).join("\n")) + '</textarea>' +
        '<div class="card-title case-sub-title">Public sources</div>' + srcs +
      '</section>' +
      '<section class="card wide case-card" id="caseDisclosureCard">' +
        '<div class="card-head"><div class="card-title">What the cloud will see</div>' +
        '<span class="case-chip" id="caseApprovalChip"></span></div>' +
        '<label class="case-field"><span>Question for the cloud</span><textarea class="case-ta" rows="2" id="caseQuestion">' + esc(c.question) + '</textarea></label>' +
        '<div id="caseDisclosureBody"></div>' +
        '<div class="case-actions">' +
          '<button type="button" class="pill hy-btn" id="caseApproveBtn" disabled>APPROVE THIS EXACT TEXT</button>' +
          '<button type="button" class="pill hy-btn" id="caseSendBtn" disabled>SEND TO CLOUD</button>' +
          '<button type="button" class="pill hy-btn" id="caseNanoReviewBtn">ASK NANO TO REVIEW THIS TEXT</button>' +
        '</div>' +
        '<div id="caseNanoReview" class="case-out"></div>' +
        '<div id="caseResult"></div>' +
      '</section>' +
      '<section class="card wide case-card" id="caseReviewCard">' +
        '<div class="card-head"><div class="card-title">Private review — checked in this browser</div>' +
        '<span class="case-chip" id="caseVerdictChip"></span></div>' +
        '<div class="card-sub">Plain code compares the FULL proposal, including passages you did not share, with your private requirements. ' +
        'No model and no network request. Change a private requirement above and the verdict updates.</div>' +
        '<div id="caseReview"></div>' +
      '</section>' +
      '<section class="card wide case-card">' +
        '<div class="card-head"><div class="card-title">Leak test — 6 canaries</div>' +
        '<button type="button" class="pill hy-btn" id="caseLeakBtn">RUN LEAK TEST</button></div>' +
        '<div class="card-sub">Plants six unique fake secrets (task title, private note, on-screen chat history, an unshared case passage, ' +
        'a reply with a real name restored, a private constraint), runs two chat turns and one case request through the normal paths, ' +
        'then searches the Firebase AI request bodies observed during this run. Everything planted is removed afterwards.</div>' +
        '<div id="caseLeakResult"></div>' +
      '</section>' +
      '<section class="card wide case-card" id="caseBorderCard">' +
        '<div class="card-head"><div class="card-title">Border instruments</div>' +
        '<button type="button" class="pill hy-btn" id="caseDrillBtn">RUN HOSTILE-CLOUD DRILL</button></div>' +
        '<div class="card-sub">Plays canned hostile replies (no network) through the same rules a real reply goes through, and shows what has been shared this session. ' +
        'Simulated replies, played by this page; plain code decided. These measure only what they test.</div>' +
        '<div id="caseMeterOut" class="case-out"></div>' +
        '<div id="caseDrillOut" class="case-out"></div>' +
      '</section>';
    wire();
    fillInjectionNotes();
    renderMeter();
    renderRevision();
    renderDisclosure();
    renderResult();
    renderReview();
    renderLeak();
  }

  /* ---------------- explanation + supplier questions ---------------- */
  /* Plain-code text first (always available); Nano may then rewrite it ON THIS
   * DEVICE. Nano gets the private details only for the explanation, which is
   * shown here and never sent. The supplier draft is built WITHOUT private
   * values, and is scanned for them before it is shown. */
  function plainExplanation(r) {
    var lead = st.c && st.c.caseKind === "scam"
      ? { fits: "Nothing in these lines looks like a scam.", needs_answers: "Be careful: verify this on a number you already have before you do anything.",
          not_suitable: "This looks like a scam. Do not send money or share any code. Hang up and call your family on a number you already have." }[r.verdict]
      : st.c && st.c.labels ? st.c.labels[r.verdict] + "." : { fits: "This supplier fits your private requirements.", needs_answers: "This supplier might work, but some answers are missing.",
      not_suitable: "This supplier does not fit your private requirements." }[r.verdict];
    return lead + " " + r.checks.filter(function (k) { return k.status !== "pass"; }).map(function (k) { return k.label + ": " + k.detail; }).join(" ");
  }
  function supplierQuestions(c, r) {
    var q = [];
    r.checks.forEach(function (k) {
      if (k.status === "pass") return;
      if (k.id === "budget") q.push(k.status === "unknown" ? "Please confirm the total price, and whether GST is included." : "Please confirm the final total including GST, and whether there is any room on price.");
      if (k.id === "deadline") q.push(c && c.deadlineLabel ? "Can the order be delivered a few days earlier than quoted?" : "Can the equipment be delivered and fully set up the day before the event, so it is working before the start?");
      if (k.id === "install") q.push(k.status === "unknown" ? "Is installation and setup by your technicians included?" : "Please quote installation and setup by your own certified technicians.");
      if (k.id === "advance") q.push(k.status === "unknown" ? "How much must be paid in advance, and when?" : "Could the advance be lower, with the balance on delivery or on credit?");
      if (k.id === "margin") q.push(k.status === "unknown" ? "Please give the rate per unit for each item, and say whether it includes GST." : "Is there any room on the per-unit rate for this quantity?");
    });
    return q;
  }
  function plainDraft(c, qs) {
    return "Hello " + (c.supplier || "there").replace(/\s*\(fictional\)/i, "") + ",\n\nThank you for the quotation. Before we decide, could you help with these points:\n" +
      qs.map(function (x, i) { return (i + 1) + ". " + x; }).join("\n") + "\n\nThank you.";
  }
  function scanDraft(text) {
    var hits = eg() && eg().scanPrivate ? eg().scanPrivate(text) : [];
    return Array.from(new Set(hits.map(function (h) { return h.kind.replace(/_/g, " "); })));
  }
  function setOut(id, text, meta, warn) {
    var box = el(id);
    if (!box) return;
    box.innerHTML = '<div class="case-out-meta"></div><pre class="case-pre case-out-text"></pre>' + (warn ? '<div class="case-warn"></div>' : "");
    box.querySelector(".case-out-meta").textContent = meta;
    box.querySelector(".case-out-text").textContent = text;
    if (warn) box.querySelector(".case-warn").textContent = warn;
  }
  function explainVerdict() {
    var r = reconcile(st.c), plain = plainExplanation(r);
    var H = window.AionHybrid;
    if (!H || !H.local || !window.AionHybridState || window.AionHybridState.nano !== "ready") {
      setOut("caseExplainOut", plain, "Written by plain code in this browser (Gemini Nano is not ready here).");
      return Promise.resolve();
    }
    setOut("caseExplainOut", "…", "Gemini Nano is writing this on your device…");
    var pc = st.c.privateConstraints || {};
    var prompt = (st.c.caseKind === "scam" ? "You help an older person decide whether a call is a scam. In at most 4 short sentences, in plain English, explain the decision below. "
      : "You help a buyer decide on a supplier. In at most 4 short sentences, in plain English, explain the decision below. ") +
      "Use only these facts; do not add any.\nDECISION: " + verdictLabel(st.c, r.verdict) + "\nCHECKS:\n" +
      r.checks.map(function (k) { return "- " + k.label + " (" + k.status + "): " + k.detail; }).join("\n") +
      (pc.confidentialNote ? "\nBUYER'S PRIVATE NOTE: " + pc.confidentialNote : "");
    return H.local.text(prompt, { label: "Gemini Nano (explain)" }).then(function (g) {
      setOut("caseExplainOut", g.text, "Written by Gemini Nano on this device in " + (g.latencyMs / 1000).toFixed(1) + " s, using your private details. Not sent anywhere.");
    }, function (e) {
      setOut("caseExplainOut", plain, "Written by plain code (Gemini Nano failed: " + String(e && e.message || e).slice(0, 120) + ").");
    });
  }
  function draftQuestions() {
    var r = reconcile(st.c), qs = supplierQuestions(st.c, r);
    if (!qs.length) { setOut("caseDraftOut", "Nothing to ask: every check passed.", "Plain code in this browser."); return Promise.resolve(); }
    var plain = plainDraft(st.c, qs);
    var H = window.AionHybrid;
    var finish = function (text, meta) {
      var hits = scanDraft(text);
      setOut("caseDraftOut", text, meta + " Checked against your private values: " + (hits.length ? "PROBLEM FOUND." : "none found in this draft."),
        hits.length ? "This draft mentions something you marked private (" + hits.join(", ") + "). Remove it before you send it, unless you mean to share it." : "");
    };
    var sync = api().syncPrivateRegistry ? api().syncPrivateRegistry() : Promise.resolve();
    return sync.then(function () {
      if (!H || !H.local || !window.AionHybridState || window.AionHybridState.nano !== "ready") {
        finish(plain, "Questions written by plain code from the failed and unknown checks (Gemini Nano is not ready here).");
        return;
      }
      setOut("caseDraftOut", "…", "Gemini Nano is polishing the wording on your device…");
      /* Nano sees ONLY the code-written draft: it has no private value to leak. */
      return H.local.text("Rewrite this short message to a supplier so it is polite and clear. Keep every question and do not add any numbers, dates or facts:\n\n" + plain,
        { label: "Gemini Nano (draft)" }).then(function (g) {
        finish(g.text, "Questions from plain code, wording polished by Gemini Nano on this device in " + (g.latencyMs / 1000).toFixed(1) + " s. Not sent anywhere; copy it if you want to use it.");
      }, function () { finish(plain, "Questions written by plain code (Gemini Nano failed)."); });
    });
  }

  /* Nano reads the exact outgoing text ON THIS DEVICE and points at phrases
   * that look private. Advice only: the pattern rules and the private-value
   * check still decide what is blocked; Nano can miss things. */
  var REVIEW_SCHEMA = { type: "object", properties: { flags: { type: "array", items: { type: "object",
    properties: { phrase: { type: "string" }, reason: { type: "string" } }, required: ["phrase", "reason"] } } }, required: ["flags"] };
  function nanoReview() {
    var box = el("caseNanoReview");
    var H = window.AionHybrid;
    if (!st.prep || !box) return Promise.resolve();
    if (!H || !H.local || !window.AionHybridState || window.AionHybridState.nano !== "ready") {
      setOut("caseNanoReview", "Gemini Nano is not ready in this browser, so there is no second opinion. The pattern rules and the private-value check above still apply.", "Nano review");
      return Promise.resolve();
    }
    var text = st.prep.text;
    var shared = (st.c.paragraphs || []).filter(function (p) { return p.shared; });
    setOut("caseNanoReview", "…", "Gemini Nano is reading the exact outgoing text on your device…");
    return H.local.json("You check text before it is sent to an outside AI service. List up to 6 short phrases in the TEXT that look private or " +
      "commercially confidential (a person's name, a money amount, an internal note, a personal detail). Copy each phrase exactly. If nothing looks private, " +
      "return an empty list.\nTEXT:\n" + text, REVIEW_SCHEMA, { label: "Gemini Nano (review)" }).then(function (g) {
      var flags = (g.data && Array.isArray(g.data.flags) ? g.data.flags : []).filter(function (f) { return f && f.phrase && text.toLowerCase().indexOf(String(f.phrase).toLowerCase()) >= 0; }).slice(0, 6);
      if (!flags.length) {
        setOut("caseNanoReview", "Nothing looked private to Gemini Nano in this text.", "Second opinion by Gemini Nano on this device in " + (g.latencyMs / 1000).toFixed(1) + " s. Nano can miss things; nothing was sent.");
        return;
      }
      var lines = flags.map(function (f) {
        var where = shared.filter(function (p) { return String(p.text).toLowerCase().indexOf(String(f.phrase).toLowerCase()) >= 0; }).map(function (p) { return p.id; });
        return "\u2022 \"" + f.phrase + "\" - " + f.reason + (where.length ? " (in " + where.join(", ") + ": untick it to keep it private)" : "");
      });
      setOut("caseNanoReview", lines.join("\n"), "Second opinion by Gemini Nano on this device in " + (g.latencyMs / 1000).toFixed(1) +
        " s. Advice only: you decide what to share. Nothing was sent.");
    }, function (e) {
      setOut("caseNanoReview", "Gemini Nano could not review the text (" + String(e && e.message || e).slice(0, 120) + "). The pattern rules above still apply.", "Nano review");
    });
  }

  var VERDICT_TEXT = { fits: "Fits your private requirements", needs_answers: "Needs answers before signing", not_suitable: "Not suitable on your private requirements" };
  var CLOUD_TEXT = { reasonable: "Reasonable", caution: "Caution", "not suitable": "Not suitable" };
  var STATUS_TEXT = { pass: "OK", fail: "FAILS", unknown: "UNKNOWN", risk: "AT RISK" };

  function renderReview() {
    var box = el("caseReview"), chip = el("caseVerdictChip");
    if (!box || !st.c) return;
    var r = reconcile(st.c);
    st.review = r;
    var cv = st.result && st.result.g ? cloudVerdict(st.result.g.text) : null;
    var shared = (st.c.paragraphs || []).filter(function (p) { return p.shared; }).length;
    var cmp = compareVerdicts(cv, r.verdict);
    var flipped = cmp.changed;
    chip.className = "case-chip is-" + (r.verdict === "fits" ? "approved" : r.verdict === "not_suitable" ? "stale" : "draft");
    chip.textContent = verdictLabel(st.c, r.verdict);
    var compare = st.result && st.result.g
      ? '<div class="case-verdict-flip' + (flipped ? " is-flipped" : "") + '">' +
          '<div><span>Cloud, provisional</span><b>' + esc(cv ? CLOUD_TEXT[cv] : "no verdict line in the reply") + '</b><small>saw ' + shared + ' of ' +
            (st.c.paragraphs || []).length + ' passages, none of your private requirements</small></div>' +
          '<div class="case-arrow">\u2192</div>' +
          '<div><span>Final, with your private requirements</span><b>' + esc(verdictLabel(st.c, r.verdict)) + '</b><small>' +
            (cmp.direction === "stricter" ? "made stricter by: " + esc(r.checks.filter(function (k) { return k.status !== "pass"; }).map(function (k) { return k.label.toLowerCase(); }).join(", "))
              : cmp.direction === "looser" ? "your private requirements raise no blocker the cloud worried about"
              : cmp.direction === "same" ? "same as the cloud, now checked against your private requirements" : "checked locally") +
          '</small></div></div>'
      : '<div class="case-hint">Send the approved text to the cloud for a provisional view; this local review then shows whether your private requirements change it.</div>';
    var rows = r.checks.map(function (k) {
      return '<div class="case-check-row is-' + k.status + '"><span class="case-check-status">' + STATUS_TEXT[k.status] + '</span><div><b>' + esc(k.label) + '</b> ' +
        esc(k.detail) + (k.from && k.from.length ? ' <span class="case-pid">' + esc(k.from.filter(Boolean).join(", ")) + '</span>' : '') +
        (k.assumption ? ' <small>' + esc(k.assumption) + '</small>' : '') + '</div></div>';
    }).join("");
    var net = "";
    if (st.result && st.result.g && st.cloudAt && eg() && eg().outboundSince) {
      var n = eg().outboundSince(st.cloudAt).length;
      net = '<div class="case-kv"><span>Requests to the cloud since it answered</span><b id="caseNetCount">' + n + '</b></div>';
    }
    var actions = '<div class="case-actions">' +
      '<button type="button" class="pill hy-btn" id="caseExplainBtn">EXPLAIN ON THIS DEVICE</button>' +
      (r.verdict !== "fits" && st.c.caseKind !== "scam" ? '<button type="button" class="pill hy-btn" id="caseDraftBtn">DRAFT QUESTIONS FOR THE SUPPLIER</button>' : '') +
      '</div><div id="caseExplainOut" class="case-out"></div><div id="caseDraftOut" class="case-out"></div>';
    box.innerHTML = compare + rows + actions +
      (r.privatePassagesUsed.length ? '<div class="case-kv"><span>Read locally, never sent</span><b>' + esc(r.privatePassagesUsed.join(", ")) + ' and your private requirements</b></div>' : '') +
      net;
    el("caseExplainBtn").addEventListener("click", function () { if (!st.busy) explainVerdict(); });
    if (el("caseDraftBtn")) el("caseDraftBtn").addEventListener("click", function () { if (!st.busy) draftQuestions(); });
  }

  function renderRevision() {
    var chip = el("caseRevChip");
    if (chip && st.c) { chip.className = "case-chip"; chip.textContent = "Case revision " + st.c.inputRevision; }
  }

  function renderDisclosure() {
    var body = el("caseDisclosureBody");
    if (!body) return;
    var chip = el("caseApprovalChip");
    var approveBtn = el("caseApproveBtn"), sendBtn = el("caseSendBtn");
    if (st.error && !st.prep) {
      body.innerHTML = '<div class="case-warn">' + esc(st.error) + '</div>';
      approveBtn.disabled = true; sendBtn.disabled = true;
      return;
    }
    var p = st.prep;
    var s = approvalStatus();
    chip.className = "case-chip is-" + s.key;
    chip.textContent = s.text;
    if (!p) { body.innerHTML = ""; approveBtn.disabled = true; sendBtn.disabled = true; return; }
    var hits = p.privateHits || [];
    body.innerHTML =
      '<div class="case-kv"><span>Will be sent</span><b>' +
        esc((p.included.passages.join(", ") || "no passages") + " · sources " + (p.included.sources.join(", ") || "none") +
        " · " + p.included.requirements + " requirement" + (p.included.requirements === 1 ? "" : "s")) + '</b></div>' +
      '<div class="case-kv"><span>Never sent</span><b>' + esc(p.excluded.join(" · ")) + '</b></div>' +
      '<div class="case-kv"><span>Size · fingerprint</span><b>' + esc(p.bytes + " characters · SHA-256 " + short(p.disclosure.contentDigest) + "…") +
        '</b></div>' +
      (hits.length ? '<div class="case-warn">This text contains a value registered as private (' +
        esc(Array.from(new Set(hits.map(function (h) { return h.kind.replace(/_/g, " "); }))).join(", ")) +
        '). AION will refuse to send it. Remove it from the shared fields.</div>' : '') +
      '<details class="case-details" open><summary>Exact text the cloud will receive</summary><pre class="case-pre" id="caseDisclosureText"></pre></details>' +
      '<div class="case-hint">Proof: open DevTools → Network, filter "generateContent", send, and compare the request body with this text.</div>';
    el("caseDisclosureText").textContent = p.text;
    approveBtn.disabled = !!st.busy || hits.length > 0 || s.key === "approved";
    sendBtn.disabled = !!st.busy || s.key !== "approved";
    sendBtn.textContent = st.busy === "send" ? "SENDING…" : "SEND TO CLOUD";
  }

  function renderResult() {
    var box = el("caseResult");
    if (!box) return;
    var r = st.result;
    if (!r) { box.innerHTML = ""; return; }
    if (r.error) {
      box.innerHTML = '<div class="case-warn" id="caseResultError"></div>' +
        (r.kind && r.kind !== "blocked" ? '<div class="case-actions"><button type="button" class="pill hy-btn" id="caseLocalVerdictBtn">GET A PROVISIONAL VIEW ON THIS DEVICE</button></div>' +
          '<div class="case-out" id="caseLocalVerdict"></div>' : '');
      el("caseResultError").textContent = (r.kindText ? r.kindText + " (" + r.kind + ") " : "") + r.error;
      if (el("caseLocalVerdictBtn")) el("caseLocalVerdictBtn").addEventListener("click", function () { if (!st.busy) provisionalHere(); });
      return;
    }
    var g = r.g;
    box.innerHTML = '<div class="case-reply"><div class="case-reply-meta" id="caseReplyMeta"></div><div class="case-reply-text" id="caseReplyText"></div></div>';
    el("caseReplyMeta").textContent = "Ran " + (g.actual_source === "in_cloud" ? "in the cloud" : "on device") +
      (g.source_verified ? " (reported by the SDK)" : " (inferred)") + " · " + g.model + " · " + g.latencyMs + " ms" +
      (g.disclosure ? " · disclosure " + short(g.disclosure.digest) + "… · " + g.disclosure.bytes + " characters" : "") +
      " · provisional: see the private review below";
    el("caseReplyText").textContent = g.text;
  }

  /* ---------------- border engine views (all text via textContent) ---------------- */
  function border() { return window.AionHybrid && window.AionHybrid.border; }
  function fillInjectionNotes() {
    if (!root || !st.c) return;
    (st.c.paragraphs || []).forEach(function (p) {
      var box = root.querySelector('[data-inj="' + p.id + '"]');
      if (!box || !p.injection) return;
      box.textContent = "This passage looks like it contains instructions or hidden characters (" + (p.injection.rules || []).join(", ") +
        "). It is held back from the cloud even if ticked" + (p.injectionOverride ? " - you allowed it, so it will be shared if ticked." : " until you allow it below.");
    });
  }
  function renderMeter() {
    var box = el("caseMeterOut"), B = border();
    if (!box) return;
    if (!B || !B.meter) { box.textContent = "Disclosure meter: the border engine is not loaded yet."; return; }
    var m = B.meter.snapshot();
    var cls = Object.keys(m.byClass).filter(function (k) { return m.byClass[k]; }).map(function (k) { return k + " " + m.byClass[k]; }).join(", ");
    box.textContent = "Shared this session: " + m.sends + " send" + (m.sends === 1 ? "" : "s") + ", " + m.passagesShared + " distinct passage" +
      (m.passagesShared === 1 ? "" : "s") + (m.totalPassages ? " of " + m.totalPassages : "") + ", " + m.charsSent.toLocaleString() + " characters" +
      (cls ? " (" + cls + ")" : "") + "." + (m.combinationWarning ? " WARNING: " + m.combinationWarning.message : "");
  }
  function runDrill() {
    var box = el("caseDrillOut"), B = border();
    if (!box || !B || !st.c) return;
    var d = B.hostileCloudDrill(st.c);
    var lines = d.results.map(function (r) {
      return (r.blocked ? "BLOCKED  " : r.finalChangedByCloud ? "CHANGED  " : "no attempt  ") + r.replyId + ": claimed " + (r.cloudClaimed || "no verdict") +
        ", final " + r.localFinal + (r.ruleViolationsAttempted.length ? " - attempted: " + r.ruleViolationsAttempted.join(", ") : "");
    });
    box.innerHTML = '<div class="case-out-meta"></div><pre class="case-pre case-out-text"></pre>';
    box.querySelector(".case-out-meta").textContent = (d.allBlocked ? "All " : "Not all ") + d.results.length + " hostile replies " +
      (d.allBlocked ? "were blocked" : "were blocked - see below") + ". Label: " + d.label + ".";
    box.querySelector(".case-out-text").textContent = lines.join("\n");
  }
  function provisionalHere() {
    var out = el("caseLocalVerdict");
    if (!out || !api().provisionalLocal) return;
    out.textContent = "Working on this device…";
    api().provisionalLocal().then(function (v) {
      out.textContent = "Provisional view made ON THIS DEVICE by " + v.engine + " - not from the cloud. Read only shared passages " +
        (v.passages.join(", ") || "(none)") + ". Verdict: " + (v.verdict || "none") + ". " + v.why +
        (v.nanoError ? " (Gemini Nano failed: " + v.nanoError + ")" : "") + " The private review below still decides.";
    }, function (e) { out.textContent = "Could not make a local provisional view: " + String(e && e.message || e).slice(0, 160); });
  }

  function renderLeak() {
    var box = el("caseLeakResult");
    if (!box) return;
    var r = st.leak;
    var btn = el("caseLeakBtn");
    if (btn) { btn.disabled = st.busy === "leak"; btn.textContent = st.busy === "leak" ? "RUNNING…" : "RUN LEAK TEST"; }
    if (!r) { box.innerHTML = ""; return; }
    if (r.error) { box.innerHTML = '<div class="case-warn" id="caseLeakError"></div>'; el("caseLeakError").textContent = r.error; return; }
    var rows = r.results.map(function (x) {
      return '<tr><td>' + esc(x.where) + '</td><td><code>' + esc(x.canary) + '</code></td><td>' +
        (x.presentLocally ? "yes" : "NO") + '</td><td>' +
        esc(x.found + " of " + r.inspected) + '</td><td class="' + (x.found ? "is-bad" : "is-good") + '">' + (x.found ? "LEAKED" : "not found") + '</td></tr>';
    }).join("");
    box.innerHTML =
      '<div class="case-leak-summary ' + (r.status === "pass" || (!r.status && r.pass) ? "is-good" : "is-bad") + '" id="caseLeakSummary"></div>' +
      '<table class="case-leak-table"><thead><tr><th>Planted in</th><th>Fake secret</th><th>In local data</th><th>Found in outbound</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="case-hint" id="caseLeakNote"></div>';
    el("caseLeakSummary").textContent = ((r.status || (r.pass ? "pass" : "fail")) === "pass" ? "PASS — " : r.status === "inconclusive" ? "INCONCLUSIVE — " : "FAIL — ") +
      r.leaked + " of 6 fake secrets found in " + r.inspected +
      (r.mode === "live" ? " Firebase AI request bodies observed during this run (" + r.bytes + " characters, read from fetch calls made by this page's code)."
        : " prepared request texts (dry run: the cloud was not reachable, so nothing was sent).") +
      (r.status === "inconclusive" && r.statusReasons && r.statusReasons.length ? " Not a pass: " + r.statusReasons.join("; ") + "." : "");
    el("caseLeakNote").textContent = "Control: " + r.controlPresent + " of 6 fake secrets were present in the local data these requests were built from. " +
      "A finite test: these six secrets did not appear in these inspected requests. It does not prove nothing can ever leak." +
      (r.errors && r.errors.length ? " Cloud replies with errors: " + r.errors.length + " (the request bodies were still inspected)." : "");
  }

  /* ---------------- events ---------------- */
  function wire() {
    root.querySelectorAll("[data-share]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var id = cb.getAttribute("data-share"), on = cb.checked;
        cb.closest(".case-para").classList.toggle("is-shared", on);
        queueEdit(function (c) { c.paragraphs.forEach(function (p) { if (p.id === id) p.shared = on; }); });
      });
    });
    root.querySelectorAll("[data-injover]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var id = cb.getAttribute("data-injover"), on = cb.checked;
        queueEdit(function (c) { c.paragraphs.forEach(function (p) { if (p.id === id && p.injection) p.injectionOverride = on; }); });
      });
    });
    root.querySelectorAll("[data-ptext]").forEach(function (ta) {
      ta.addEventListener("input", function () {
        var id = ta.getAttribute("data-ptext"), v = ta.value;
        queueEdit(function (c) { c.paragraphs.forEach(function (p) { if (p.id === id) p.text = v; }); });
      });
    });
    var bind = function (id, apply) {
      var n = el(id);
      if (!n) return;
      n.addEventListener(n.type === "checkbox" ? "change" : "input", function () {
        var v = n.type === "checkbox" ? n.checked : n.value;
        queueEdit(function (c) { apply(c, v); });
      });
    };
    bind("caseBudget", function (c, v) { c.privateConstraints.maxBudget = v; });
    bind("caseReadyBy", function (c, v) { c.privateConstraints.readyBy = v; });
    bind("caseInstall", function (c, v) { c.privateConstraints.installationRequired = v; });
    bind("caseGst", function (c, v) { c.privateConstraints.gstRate = v; });
    bind("caseNote", function (c, v) { c.privateConstraints.confidentialNote = v; });
    bind("caseReqs", function (c, v) { c.shareableRequirements = v.split("\n").map(function (x) { return x.trim(); }).filter(Boolean); });
    bind("caseQuestion", function (c, v) { c.question = v; });
    root.querySelectorAll("[data-pfield]").forEach(function (n) {
      var key = n.getAttribute("data-pfield");
      n.addEventListener(n.type === "checkbox" ? "change" : "input", function () {
        var v = n.type === "checkbox" ? n.checked : n.value;
        queueEdit(function (c) { c.privateConstraints[key] = v; });
      });
    });

    el("caseIntakeTextBtn").addEventListener("click", function () { if (!st.busy) readPasted(); });
    el("caseNanoReviewBtn").addEventListener("click", function () { if (!st.busy) nanoReview(); });
    el("caseIntakeFile").addEventListener("change", function (ev) {
      var f = ev.target.files && ev.target.files[0];
      ev.target.value = "";
      if (f && !st.busy) readImage(f);
    });
    var drop = el("caseIntakeCard");
    drop.addEventListener("dragover", function (ev) { ev.preventDefault(); drop.classList.add("is-drop"); });
    drop.addEventListener("dragleave", function () { drop.classList.remove("is-drop"); });
    drop.addEventListener("drop", function (ev) {
      ev.preventDefault(); drop.classList.remove("is-drop");
      var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (f && !st.busy) readImage(f);
    });
    el("caseApproveBtn").addEventListener("click", function (event) {
      if (!st.prep) return;
      st.busy = "approve";
      api().approveFromClick(st.prep.disclosure, event).then(function (d) {
        st.lastApproval = { rev: d.inputRevision, digest: d.contentDigest };
      }, function (e) { st.result = { error: String(e && e.message || e) }; })
        .then(function () { st.busy = ""; renderDisclosure(); renderResult(); });
    });
    el("caseSendBtn").addEventListener("click", function (event) {
      if (!st.prep || st.busy) return;
      st.busy = "send";
      renderDisclosure();
      flushEdits().then(function () {
        return api().sendFromClick(st.prep.disclosure, event);
      }).then(function (g) { st.result = { g: g }; st.cloudAt = Date.now(); }, function (e) {
        st.result = { error: String(e && e.message || e), kind: e && e.errorKind, kindText: e && e.border && e.border.message };
      }).then(function () { st.busy = ""; renderDisclosure(); renderResult(); renderReview(); renderMeter(); });
    });
    el("caseDrillBtn").addEventListener("click", function () { if (!st.busy) runDrill(); });
    el("caseLeakBtn").addEventListener("click", function (event) {
      if (st.busy) return;
      st.busy = "leak";
      renderLeak();
      api().runLeakAuditFromClick({}, event).then(function (r) { st.leak = r; }, function (e) { st.leak = { error: String(e && e.message || e) }; })
        .then(function () { st.busy = ""; renderLeak(); return prepare(); });
    });
    el("caseResetBtn").addEventListener("click", function () {
      if (st.busy) return;
      clearTimeout(saveTimer); pendingMutations = [];
      if (st.prep && eg().isApproved(st.prep.disclosure)) st.lastApproval = { rev: st.prep.disclosure.inputRevision, digest: st.prep.disclosure.contentDigest };
      api().reset().then(function (c) { st.c = c; st.result = null; st.cloudAt = null; renderAll(); return prepare(); });
    });
  }
  /* A pack loaded from another view (or the console) redraws this one. */
  if (typeof window.addEventListener === "function") window.addEventListener("aion:case-pack", function () {
    if (!root || !api()) return;
    api().load().then(function (c) { if (!st.c || c.inputRevision !== st.c.inputRevision || c.pack !== st.c.pack) adoptPack(c); });
  });

  /* ---------------- boot ---------------- */
  function boot() {
    root = el("caseRoot");
    if (!root) return;
    whenReady().then(function () { return api().load(); }).then(function (c) {
      st.c = c;
      renderAll();
      return prepare();
    }).catch(function (e) {
      root.innerHTML = '<section class="card wide"><div class="case-warn" id="caseBootError"></div></section>';
      el("caseBootError").textContent = "The case workspace could not load: " + String(e && e.message || e);
    });
  }

  window.AionCase = {
    state: st,
    reconcile: reconcile,           /* pure: (case) -> verdict + checks; no network */
    cloudVerdict: cloudVerdict,
    compareVerdicts: compareVerdicts,
    quoteFromText: quoteFromText,    /* pure: pasted text -> passages */
    readDate: readDate,              /* pure: text -> { day, time, label } | { invalid } | null */
    readMoney: readMoney,            /* pure: text -> [{ amount, currency, perUnit, total }] */
    supplierQuestions: supplierQuestions,
    explain: function () { return explainVerdict(); },
    draft: function () { return draftQuestions(); },
    nanoReview: function () { return nanoReview(); },
    readImage: function (f, o) { return readImage(f, o); },
    flush: function () { return flushEdits(); },
    reload: function () { return api().load().then(function (c) { st.c = c; renderAll(); return prepare(); }); },
    verdictLabel: verdictLabel,      /* (case, verdict) -> the case's own wording */
    loadPack: function (id, opts) { return loadPackHere(id, opts); },
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
