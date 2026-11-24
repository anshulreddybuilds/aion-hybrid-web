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
var MONTHS = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };
function rupees(n) { return "Rs " + Math.round(n).toLocaleString("en-IN"); }
function readAmount(text) {
  var m = String(text || "").match(/(?:\brs\b\.?|\binr\b|\u20b9)\s*([\d][\d,]*(?:\.\d+)?)/i);
  if (!m) return null;
  var n = parseFloat(m[1].replace(/,/g, ""));
  return isFinite(n) && n > 0 ? n : null;
}
function gstIncluded(text) {
  var t = String(text || "").toLowerCase();
  if (/(incl\.?|including|inclusive of)\s*(of\s*)?gst/.test(t)) return true;
  if (/(plus|\+|excluding|excl\.?|exclusive of)\s*gst/.test(t)) return false;
  return null;
}
function readDate(text) {
  var t = String(text || "");
  var iso = t.match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (iso) return { day: Date.UTC(+iso[1], +iso[2] - 1, +iso[3]), time: iso[4] ? (+iso[4]) * 60 + (+iso[5]) : null, label: iso[0] };
  var dm = t.match(/(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i);
  if (dm) {
    var tm = t.match(/\b(\d{1,2}):(\d{2})\b/);
    return { day: Date.UTC(+dm[3], MONTHS[dm[2].toLowerCase()], +dm[1]), time: tm ? (+tm[1]) * 60 + (+tm[2]) : null, label: dm[0],
      vague: !tm && /morning|afternoon|evening|during the day/i.test(t) };
  }
  return null;
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

function reconcile(c) {
  var pc = c.privateConstraints || {};
  var checks = [];
  var rate = parseFloat(String(pc.gstRate == null || pc.gstRate === "" ? "18" : pc.gstRate).replace(/[^\d.]/g, ""));
  if (!isFinite(rate) || rate < 0 || rate > 50) rate = 18;

  /* 1. Budget */
  var priceP = findPara(c, /price|cost|fee|commercial/i, /(\brs\b\.?|\binr\b|\u20b9)\s*\d/i);
  var quote = priceP ? readAmount(priceP.text) : null;
  var budget = readAmount(pc.maxBudget);
  if (!budget) {
    checks.push({ id: "budget", label: "Budget", status: "unknown", detail: "No maximum budget entered.", from: [] });
  } else if (!quote) {
    checks.push({ id: "budget", label: "Budget", status: "unknown", detail: "The proposal does not state a price AION can read. Ask the supplier for a total.", from: [] });
  } else {
    var qInc = gstIncluded(priceP.text), bInc = gstIncluded(pc.maxBudget);
    var qTotal = qInc === false ? quote * (1 + rate / 100) : quote;
    var bTotal = bInc === false ? budget * (1 + rate / 100) : budget;
    var how = rupees(quote) + (qInc === false ? " + " + rate + "% GST = " + rupees(qTotal) : (qInc ? " including GST" : " (GST not stated)"));
    if (qTotal > bTotal) {
      checks.push({ id: "budget", label: "Budget", status: "fail", detail: how + " is over your private limit of " + rupees(bTotal) +
        " by " + rupees(qTotal - bTotal) + ".", from: [priceP.id], assumption: qInc === false ? rate + "% GST assumed (change it in Private requirements)" : "" });
    } else {
      checks.push({ id: "budget", label: "Budget", status: qInc === null ? "unknown" : "pass", detail: how + " is within your private limit of " + rupees(bTotal) +
        (qInc === null ? ", but the proposal does not say whether GST is included." : "."), from: [priceP.id] });
    }
  }

  /* 2. Ready-by deadline */
  var ready = readDate(pc.readyBy);
  var delP = findPara(c, /deliver/i, /deliver/i);
  var del = delP ? readDate(delP.text) : null;
  var inst = installStatus(c);
  if (!ready) {
    checks.push({ id: "deadline", label: "Deadline", status: "unknown", detail: "No ready-by date entered.", from: [] });
  } else if (!del) {
    checks.push({ id: "deadline", label: "Deadline", status: "unknown", detail: "The proposal does not give a delivery date AION can read. Ask for one.", from: delP ? [delP.id] : [] });
  } else if (del.day > ready.day) {
    checks.push({ id: "deadline", label: "Deadline", status: "fail", detail: "Delivery (" + del.label + ") is after the date it must already be working (" + ready.label + ").", from: [delP.id] });
  } else if (del.day === ready.day) {
    var noSetup = pc.installationRequired && inst.state !== "included";
    var late = del.time != null && ready.time != null && del.time >= ready.time;
    checks.push({ id: "deadline", label: "Deadline", status: noSetup || late ? "fail" : "risk",
      detail: "Delivery is on " + del.label + (del.vague ? " (\"morning\", no time given)" : "") + ", the same day it must be working by " +
        (ready.time != null ? String(Math.floor(ready.time / 60)).padStart(2, "0") + ":" + String(ready.time % 60).padStart(2, "0") : "the start") +
        (noSetup ? ", with no installation included, so there is no time to set it up." : late ? ", but after that time." : ". Same-day delivery leaves little margin."),
      from: [delP.id].concat(noSetup && inst.from ? [inst.from] : []) });
  } else {
    checks.push({ id: "deadline", label: "Deadline", status: "pass", detail: "Delivery (" + del.label + ") is before your ready-by date (" + ready.label + ").", from: [delP.id] });
  }

  /* 3. Installation */
  if (!pc.installationRequired) {
    checks.push({ id: "install", label: "Installation", status: "pass", detail: "You did not require installation.", from: [] });
  } else if (inst.state === "excluded") {
    checks.push({ id: "install", label: "Installation", status: "fail", detail: "You require installation, but the proposal excludes it.", from: [inst.from] });
  } else if (inst.state === "included") {
    checks.push({ id: "install", label: "Installation", status: "pass", detail: "Installation is included.", from: [inst.from] });
  } else {
    checks.push({ id: "install", label: "Installation", status: "unknown", detail: "You require installation, and the proposal does not say whether it is included. Ask the supplier.", from: [] });
  }

  var fails = checks.filter(function (k) { return k.status === "fail"; });
  var open = checks.filter(function (k) { return k.status === "unknown" || k.status === "risk"; });
  var verdict = fails.length ? "not_suitable" : open.length ? "needs_answers" : "fits";
  /* "Shared" means really shareable: ticked AND not held by an injection flag
   * (unless the user overrode it). A ticked-but-held passage was never sent,
   * so a check that used it used private material. */
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

var BUCKETS = [
  { key: "price", heading: "Price and payment", re: /(\brs\b\.?|\binr\b|\u20b9|\bprice|\bcost|\btotal\b|\bpayment|\badvance\b|\bgst\b|\btax)/i },
  { key: "delivery", heading: "Delivery", re: /(deliver|dispatch|arriv|ship|lead time)/i },
  { key: "scope", heading: "Scope and exclusions", re: /(install|setup|set-up|rigging|exclud|not included|includes|technician|scope)/i },
  { key: "warranty", heading: "Warranty and support", re: /(warrant|guarantee|support|maintenance)/i },
  { key: "cancellation", heading: "Cancellation", re: /(cancel|refund|termination)/i },
];
function quoteFromText(text) {
  var lines = String(text || "").replace(/\r/g, "").split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
  var supplier = "";
  if (lines.length && lines[0].length <= 60 && !/\d/.test(lines[0]) && !/[.:]$/.test(lines[0])) supplier = lines.shift();
  var sentences = [];
  lines.forEach(function (l) { l.split(/(?<=[.!?])\s+(?=[A-Z\u20b9])/).forEach(function (x) { if (x.trim()) sentences.push(x.trim()); }); });
  var bins = { other: [] };
  BUCKETS.forEach(function (b) { bins[b.key] = []; });
  sentences.forEach(function (x) {
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

export { reconcile, compareVerdicts, cloudVerdict, quoteFromText, fieldsToQuote, BUCKETS, CLOUD_SEV, LOCAL_SEV };
export const caseRules = { reconcile, compareVerdicts, cloudVerdict, quoteFromText };
