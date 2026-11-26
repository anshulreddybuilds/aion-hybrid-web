/* AION — Border Instrument: the page controller. Apache-2.0.
 * Created by Anshul Reddy (idea and project owner) for #BuildHybridAI 2026.
 *
 * One step on screen at a time: 01 Quote, 02 Share, 03 Send, 04 Verdict,
 * 05 Proof. All logic lives in the existing engine:
 *   window.AionStandalone.caseApi  - the stored case, disclosures, send, leak test, drill
 *   window.AionCase                - reconcile / cloudVerdict / compareVerdicts / quoteFromText
 *   window.AionHybrid              - state, egress gate, telemetry, border engine
 * This file only reads their results and draws them.
 *
 * The border (right of the page) is a printed rule between two columns. Each
 * passage of the loaded case is a paper slip with its real heading and
 * character count. A slip is drawn on the cloud side ONLY after a real send
 * of an approved disclosure that included it succeeded; a slip held by the
 * injection rule carries a HELD stamp; a hostile reply blocked by the drill
 * bounces off the rule with a BLOCKED BY PLAIN CODE stamp.
 *
 * Honesty rules for this file:
 *   - every number on screen comes from one of those calls; if something was
 *     not measured it shows "—" or "not measured yet", never a made-up value;
 *   - "characters" are JavaScript string lengths, not bytes, and say so;
 *   - all text that came from a supplier, a user or a model is put on screen
 *     with textContent (never innerHTML), so markup in it is shown, not run.
 */
(function () {
  "use strict";

  var STEPS = ["quote", "share", "send", "verdict", "proof"];
  var VERDICT_TEXT = { fits: "Fits your private requirements", needs_answers: "Needs answers before signing", not_suitable: "Not suitable on your private requirements" };
  var CLOUD_TEXT = { reasonable: "Reasonable", caution: "Caution", "not suitable": "Not suitable" };
  var STATUS_TEXT = { pass: "OK", fail: "Fails", unknown: "Unknown", risk: "At risk" };
  var MODE_CONST = { prefer_on_device: "PREFER_ON_DEVICE", only_on_device: "ONLY_ON_DEVICE", prefer_in_cloud: "PREFER_IN_CLOUD", only_in_cloud: "ONLY_IN_CLOUD" };
  var MODE_WHY = {
    prefer_in_cloud: "Prefer cloud: a case is sent to the cloud only after you approve its exact text.",
    prefer_on_device: "Prefer device: Gemini Nano answers when it is ready; a case send still needs your approval.",
    only_on_device: "Only device: nothing on this page is sent to the cloud.",
  };
  var ROUTE_SHORT = { prefer_on_device: "prefer device", only_on_device: "only device", prefer_in_cloud: "prefer cloud", only_in_cloud: "only cloud" };
  var SHORT_TITLE = { brightline: "LED wall", savita: "Kirana restock", scam: "Scam call" };
  var NANO_TEXT = { checking: "checking", ready: "ready", downloadable: "needs download", downloading: "downloading", unavailable: "unavailable", unsupported: "not here" };
  var NANO_WHY = {
    checking: "Checking for Gemini Nano in this browser.",
    ready: "Gemini Nano is ready on this device.",
    downloadable: "Gemini Nano can be downloaded by this browser; plain code covers the local steps meanwhile.",
    downloading: "This browser is downloading Gemini Nano; plain code covers the local steps meanwhile.",
    unavailable: "Gemini Nano is not available here; plain code covers the local steps.",
    unsupported: "This browser has no built-in Gemini Nano; plain code covers the local steps.",
  };
  /* The private fields of the built-in sample; a scenario pack can bring its own. */
  var DEFAULT_FIELDS = [
    { key: "maxBudget", label: "Maximum budget", type: "text" },
    { key: "readyBy", label: "Ready by", type: "text" },
    { key: "gstRate", label: "GST rate, %", type: "text" },
    { key: "installationRequired", label: "Installation must be included", type: "checkbox" },
    { key: "confidentialNote", label: "Confidential note", type: "text" },
  ];

  var S = {
    step: "quote", c: null, prep: null, prepError: "", lastApproval: null,
    busy: "", result: null, lastSend: null, provisional: null, leak: null, drill: null,
    imageConfirm: false, visited: {}, sent: null, drillSeq: 0, packs: null, packId: null,
    cf: null, cfRev: -1, imageMs: null,
  };
  var pending = [], timer = null;

  /* ------------------------------------------------------------ helpers */
  function $(id) { return document.getElementById(id); }
  function api() { return window.AionStandalone && window.AionStandalone.caseApi; }
  function H() { return window.AionHybrid; }
  function HS() { return window.AionHybridState || {}; }
  function rules() { return window.AionCase; }
  function B() { return H() && H().border; }

  /** h("p", {class:"x", "data-a":"1"}, "text", node) - text children become text nodes. */
  function h(tag, attrs) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "text") n.textContent = String(v);
      else if (k === "checked" || k === "disabled" || k === "open" || k === "value") n[k] = v;
      else n.setAttribute(k, v === true ? "" : String(v));
    });
    for (var i = 2; i < arguments.length; i++) {
      var ch = arguments[i];
      if (ch == null || ch === false) continue;
      n.appendChild(typeof ch === "string" || typeof ch === "number" ? document.createTextNode(String(ch)) : ch);
    }
    return n;
  }
  function setText(id, t) { var n = $(id); if (n && n.textContent !== String(t == null ? "" : t)) n.textContent = t == null ? "" : String(t); }
  function fmt(n) { return typeof n === "number" && isFinite(n) ? n.toLocaleString("en-US") : "—"; }
  function ms(n) { return typeof n === "number" && isFinite(n) ? (n >= 10000 ? (n / 1000).toFixed(1) + " s" : Math.round(n).toLocaleString("en-US") + " ms") : "not measured yet"; }
  function short(d) { return d ? String(d).slice(0, 12) : "—"; }
  function plural(n, one, many) { return n === 1 ? one : (many || one + "s"); }
  function shareable(p) { return !!(p && p.shared) && !(p.injection && p.injection.flagged && !p.injectionOverride); }
  function heldByRule(p) { return !!(p && p.injection && p.injection.flagged && !p.injectionOverride); }
  function motion() { return document.body.getAttribute("data-motion") || "full"; }
  function say(msg) {
    var n = $("live");
    if (!n) return;
    n.textContent = "";
    setTimeout(function () { n.textContent = msg; }, 30);
  }

  /* ------------------------------------------------- dot-matrix numerals */
  /* 5x7 font, own design. Narrow glyphs for punctuation. */
  var GLYPH = {
    "0": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
    "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
    "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
    "/": ["00001", "00001", "00010", "00100", "01000", "10000", "10000"],
    "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
    ",": ["00", "00", "00", "00", "00", "01", "10"],
    ".": ["0", "0", "0", "0", "0", "0", "1"],
    " ": ["00", "00", "00", "00", "00", "00", "00"],
  };
  var SVGNS = "http://www.w3.org/2000/svg";
  /** Draws `text` as dot-matrix numerals into `el`; `label` is what a screen reader hears. */
  function dm(el, text, label) {
    if (!el) return;
    var s = String(text == null ? "—" : text).replace(/—/g, "-");
    el.setAttribute("aria-label", label || (s === "-" ? "not measured" : s));
    if (el.getAttribute("data-value") === s) return;
    var svg = document.createElementNS(SVGNS, "svg");
    var x = 0;
    for (var i = 0; i < s.length; i++) {
      var g = GLYPH[s[i]] || GLYPH["-"];
      var w = g[0].length;
      for (var r = 0; r < 7; r++) for (var col = 0; col < w; col++) {
        var on = g[r][col] === "1";
        if (!on) continue;   /* only lit dots are drawn: no ghost grid */
        var c = document.createElementNS(SVGNS, "circle");
        c.setAttribute("cx", String(x + col + 0.5)); c.setAttribute("cy", String(r + 0.5)); c.setAttribute("r", "0.4");
        c.setAttribute("class", on ? "on" : "off");
        svg.appendChild(c);
      }
      x += w + 1;
    }
    svg.setAttribute("viewBox", "0 0 " + Math.max(1, x - 1) + " 7");
    svg.setAttribute("aria-hidden", "true");
    el.replaceChildren(svg);
    el.setAttribute("data-value", s);
  }

  /* The engine may report whether a request body was actually seen leaving
     (bodyObserved / sentCharsObserved). Feature-detected: when absent, the old
     wording is kept; when present and false, say "attempted, none observed". */
  function observedOf(g) {
    if (!g) return null;
    var d = g.disclosure || {}, rc = g.receipt || {};
    var o = [g.bodyObserved, rc.bodyObserved, d.bodyObserved].filter(function (x) { return typeof x === "boolean"; })[0];
    if (typeof o !== "boolean") return null;
    var n = [g.sentCharsObserved, rc.sentCharsObserved, d.sentCharsObserved].filter(function (x) { return typeof x === "number"; })[0];
    return { observed: o, chars: typeof n === "number" ? n : null };
  }

  /* ------------------------------------------------------------- state */
  function approval() {
    var p = S.prep;
    if (!p || !S.c) return { key: "none", text: S.prepError ? "Could not prepare" : "Preparing" };
    var d = p.disclosure;
    if (d.approvalState === "sent") return { key: "sent", text: "Sent · this approval is used up" };
    if (H().egress.isApproved(d) && d.inputRevision === S.c.inputRevision) return { key: "approved", text: "Approved · revision " + d.inputRevision };
    if (S.lastApproval && S.lastApproval.rev !== S.c.inputRevision) return { key: "stale", text: "Approval went stale · the case changed" };
    return { key: "draft", text: "Not approved · nothing will be sent" };
  }
  function routeMode() { return HS().mode || "prefer_in_cloud"; }
  /* Can a case send leave this page right now? Never true while unplugged or ONLY_ON_DEVICE. */
  function cloudBlockedReason() {
    var st = HS();
    if (st.offlineDemo) return "The plug is pulled (Offline Demo Mode), so nothing can be sent.";
    if (routeMode() === "only_on_device") return "The route is ONLY_ON_DEVICE, so this page does not send the case.";
    if (navigator.onLine === false) return "This browser is offline.";
    if (!st.ready) return "The Firebase AI module is not initialised in this browser.";
    return "";
  }
  /* Derived, never hard-coded: unknown until a real request said otherwise. */
  function cloudStatus() {
    var st = HS();
    if (st.offlineDemo) return { tone: "grey", text: "unplugged", down: true, why: "The plug is pulled: this page's fetch() calls are blocked (offline demo, not a firewall)." };
    if (navigator.onLine === false) return { tone: "grey", text: "offline", down: true, why: "This browser reports no network." };
    if (!st.ready) return { tone: "grey", text: "not initialised", down: true, why: "The Firebase AI module did not start in this browser." };
    if (routeMode() === "only_on_device") return { tone: "grey", text: "off by route", down: true, why: "The route is ONLY_ON_DEVICE, so the case is not sent." };
    var ls = S.lastSend;
    if (ls && !ls.ok && ls.kind && ls.kind !== "blocked") return { tone: "red", text: ls.kind.replace(/_/g, " "), down: ls.kind === "offline" || ls.kind === "app_check", why: "The last cloud request failed (" + ls.kind.replace(/_/g, " ") + ")." };
    if (ls && ls.ok) return { tone: "amber", text: "answered", down: false, why: "The last approved send was answered in " + ms(ls.latencyMs) + "." };
    return { tone: "idle", text: "not tried", down: false, why: "No cloud request yet. It is reachable only after you approve the exact text." };
  }

  /* ------------------------------------------------------ scenario packs */
  function packList() { return Array.isArray(S.packs) ? S.packs : []; }
  /* The pack of the loaded case: the engine stores it as case.pack; a plain
     sample case is the first pack ("brightline"). An imported quote has none. */
  function packIdOf(c) { return c ? (c.pack || c.packId || (c.sample && packList().length ? packList()[0].id : null)) : null; }
  function currentPack() {
    var id = S.packId || packIdOf(S.c);
    return packList().filter(function (p) { return p.id === id; })[0] || null;
  }
  function verdictText(v) {
    var R = rules();
    if (R && typeof R.verdictLabel === "function") return R.verdictLabel(S.c, v);
    var a = api(), L = a && typeof a.labelsFor === "function" ? a.labelsFor(S.c) : (currentPack() || {}).labels;
    return (L && L[v]) || VERDICT_TEXT[v] || v;
  }
  function privateFields() {
    var a = api(), pk = currentPack();
    var pc = (S.c && S.c.privateConstraints) || {};
    var given = a && typeof a.privateFieldsFor === "function" ? a.privateFieldsFor(S.c) : pk && pk.privateFields;
    var base = Array.isArray(given) && given.length ? given : DEFAULT_FIELDS.filter(function (f) { return f.key in pc; });
    var keys = {};
    base.forEach(function (f) { keys[f.key] = true; });
    /* With the engine's own field list, show exactly that; otherwise also any other stored key. */
    if (Array.isArray(given) && given.length) return base;
    var extra = Object.keys(pc).filter(function (k) { return !keys[k]; }).map(function (k) { return { key: k, label: k, type: typeof pc[k] === "boolean" ? "checkbox" : "text" }; });
    return base.concat(extra);
  }
  function isCheck(f) { return f.type === "checkbox" || f.type === "boolean" || f.type === "bool"; }
  /* Characters of private requirement values (text fields; a yes/no rule has no text). */
  function privChars(c) {
    var ea = api();
    if (ea && typeof ea.privateCharCount === "function") { try { var n = ea.privateCharCount(c); if (typeof n === "number" && isFinite(n)) return n; } catch (e) { /* fall back */ } }
    var pc = (c && c.privateConstraints) || {};
    return Object.keys(pc).reduce(function (a, k) { var v = pc[k]; return a + (typeof v === "string" || typeof v === "number" ? String(v).length : 0); }, 0);
  }
  function loadPacks() {
    var a = api();
    if (!a || typeof a.packs !== "function") return Promise.resolve();
    return Promise.resolve().then(function () { return a.packs(); }).then(function (list) {
      S.packs = Array.isArray(list) ? list.filter(function (p) { return p && p.id; }) : null;
    }, function () { S.packs = []; });
  }

  /* --------------------------------------------------------- case flow */
  function newCase(c) {
    S.c = c; S.result = null; S.provisional = null; S.lastApproval = null; S.sent = null; S.cf = null; S.cfRev = -1;
  }
  function prepare() {
    return api().prepareDisclosure(null).then(function (p) { S.prep = p; S.prepError = ""; }, function (e) {
      S.prep = null; S.prepError = String((e && e.message) || e);
    }).then(refreshCounterfactual).then(renderAll);
  }
  function refreshCounterfactual() {
    var Bd = B();
    if (!Bd || typeof Bd.counterfactual !== "function" || !S.c) { S.cf = null; return; }
    if (S.cfRev === S.c.inputRevision && S.cf && S.prep && S.cf.border && S.cf.border.chars === S.prep.bytes) return;
    var rev = S.c.inputRevision;
    return Promise.resolve().then(function () { return Bd.counterfactual(S.c, { preparedChars: S.prep ? S.prep.bytes : 0 }); }).then(function (r) {
      if (S.c && S.c.inputRevision === rev) { S.cf = r || null; S.cfRev = rev; }
    }, function () { S.cf = null; });
  }
  function queueEdit(mutate, delay) {
    pending.push(mutate);
    var p = S.prep;
    if (p && H().egress.isApproved(p.disclosure)) S.lastApproval = { rev: p.disclosure.inputRevision, digest: p.disclosure.contentDigest };
    clearTimeout(timer);
    timer = setTimeout(flush, delay == null ? 300 : delay);
  }
  function flush() {
    clearTimeout(timer);
    var muts = pending.splice(0);
    if (!muts.length) return Promise.resolve();
    return api().update(function (c) { muts.forEach(function (m) { m(c); }); }).then(function (c) {
      S.c = c;
      return prepare();
    });
  }

  function msg(t, tone) {
    var n = $("quoteMsg");
    n.textContent = t || "";
    n.setAttribute("data-tone", tone || "");
    n.hidden = !t;
  }
  function importText() {
    var t = $("quoteText").value;
    if (!t.trim()) { msg("Paste the quote text first.", "note"); return; }
    var q = rules().quoteFromText(t);
    if (!q.paragraphs.length) { msg("No passages could be read from that text.", "note"); return; }
    S.busy = "import";
    api().importQuote(q).then(function (c) {
      newCase(c); S.packId = null;
      var flagged = c.paragraphs.filter(function (p) { return p.injection && p.injection.flagged; }).length;
      msg("Read on this device: " + c.paragraphs.length + " " + plural(c.paragraphs.length, "passage") + ", all private until you tick them." +
        (flagged ? " " + flagged + " " + plural(flagged, "passage looks", "passages look") + " like instructions and will be held back." : ""), "green");
      $("quoteText").value = "";
      return prepare();
    }, function (e) { msg("Could not save the quote: " + String((e && e.message) || e), "red"); })
      .then(function () { S.busy = ""; renderAll(); });
  }
  var IMAGE_HEADINGS = [["other", "Overview"], ["price", "Price and payment"], ["delivery", "Delivery"], ["scope", "Scope and exclusions"],
    ["warranty", "Warranty and support"], ["cancellation", "Cancellation"]];
  /* Called only from a real file pick by the user (see wire()). */
  function importImage(file) {
    if (!file) return;
    var small = typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 8;
    if (small && !S.imageConfirm) {
      S.imageConfirm = true;
      msg("Reading an image with Gemini Nano kept an 8 GB laptop busy for over 90 seconds in our test. Choose the file again to go ahead.", "note");
      return;
    }
    S.imageConfirm = false;
    S.busy = "import";
    msg("Gemini Nano is reading the image on this device. The image is not uploaded.", "");
    H().intake.readQuoteImage(file).then(function (r) {
      var f = r.fields || {};
      var paragraphs = [];
      IMAGE_HEADINGS.forEach(function (x) { var t = String(f[x[0]] || "").trim(); if (t) paragraphs.push({ heading: x[1], text: t }); });
      return api().importQuote({ supplier: f.supplier || "Imported supplier", paragraphs: paragraphs, by: "image" }).then(function (c) {
        newCase(c); S.packId = null; S.imageMs = r.latencyMs;
        msg("Read by Gemini Nano on this device in " + (r.latencyMs / 1000).toFixed(1) + " s: " + c.paragraphs.length + " passages, all private.", "green");
        return prepare();
      });
    }, function (e) { msg(String((e && e.message) || e), "red"); }).then(function () { S.busy = ""; renderAll(); });
  }

  function loadScenario(id, poisoned) {
    if (S.busy) return;
    var a = api();
    clearTimeout(timer); pending = [];
    if (S.prep && H().egress.isApproved(S.prep.disclosure)) S.lastApproval = { rev: S.prep.disclosure.inputRevision, digest: S.prep.disclosure.contentDigest };
    S.busy = "import"; renderAll();
    var p = id && typeof a.loadPack === "function" ? a.loadPack(id, { poisoned: !!poisoned }).then(function () { return a.load(); }) : a.reset();
    p.then(function (c) {
      newCase(c); S.packId = id || packIdOf(c);
      var pk = currentPack();
      msg((pk ? "Loaded: " + pk.title : "The sample case is loaded") + (c.poisoned ? ", with a planted instruction" : "") + " (fictional).", "green");
      return prepare();
    }, function (e) { msg("Could not load that case: " + String((e && e.message) || e), "red"); })
      .then(function () { S.busy = ""; renderAll(); });
  }

  function approve(event) {
    if (!S.prep || S.busy) return;
    S.busy = "approve";
    api().approveFromClick(S.prep.disclosure, event).then(function (d) {
      S.lastApproval = { rev: d.inputRevision, digest: d.contentDigest };
      say("Approved. Fingerprint " + short(d.contentDigest) + ", " + fmt(S.prep.bytes) + " characters.");
    }, function (e) { S.result = { error: String((e && e.message) || e), kind: "blocked" }; })
      .then(function () { S.busy = ""; renderAll(); });
  }
  function send(event) {
    if (!S.prep || S.busy || approval().key !== "approved" || cloudBlockedReason()) return;
    S.busy = "send"; renderAll();
    var rev = S.c.inputRevision;
    var seen = S.c.paragraphs.filter(shareable).length, total = S.c.paragraphs.length;
    var ids = (S.prep.included && S.prep.included.passages || []).slice(), chars = S.prep.bytes;
    flush().then(function () { return api().sendFromClick(S.prep.disclosure, event); }).then(function (g) {
      S.result = { g: g, rev: rev, seen: seen, total: total };
      S.lastSend = { ok: true, latencyMs: g.latencyMs };
      /* The only place a slip is moved to the cloud side: after a real, successful send. */
      var ob = observedOf(g);
      S.sent = { ids: ids, chars: ob && ob.observed === false ? 0 : ob && ob.chars != null ? ob.chars : g.disclosure && typeof g.disclosure.bytes === "number" ? g.disclosure.bytes : chars, rev: rev, latencyMs: g.latencyMs, unobserved: !!(ob && ob.observed === false) };
      say("The cloud answered. Plain code now checks its verdict.");
      /* On a narrow screen the border sits above the step: bring it into view to see the slips cross. */
      setFieldOpen(true);
      var inst = $("instrument"), r = inst.getBoundingClientRect();
      if (window.innerWidth <= 900 && r.bottom < 60) setTimeout(function () { inst.scrollIntoView({ block: "start", behavior: motion() === "full" ? "smooth" : "auto" }); }, 60);
    }, function (e) {
      var kind = (e && e.errorKind) || "unknown";
      S.result = { error: String((e && e.message) || e), kind: kind, kindText: e && e.border && e.border.message, rev: rev };
      S.lastSend = { ok: false, kind: kind };
      say("The send failed: " + ((e && e.border && e.border.message) || "error") + ".");
    }).then(function () { S.busy = ""; renderAll(); });
  }
  function provisional() {
    if (S.busy) return;
    S.busy = "prov"; renderAll();
    flush().then(function () { return api().provisionalLocal(); }).then(function (v) {
      S.provisional = v;
      say("Provisional verdict on this device: " + (v.verdict || "none") + ".");
    }, function (e) { S.provisional = { error: String((e && e.message) || e) }; })
      .then(function () { S.busy = ""; renderAll(); });
  }
  function leak(event) {
    if (S.busy) return;
    S.busy = "leak"; renderAll();
    flush().then(function () { return api().runLeakAuditFromClick({}, event); }).then(function (r) {
      S.leak = r;
      var a = r.audit;
      say("Leak audit " + (r.mode === "live" ? "live" : "dry run") + (r.status === "inconclusive" ? ", inconclusive" : "") + ": " + (a ? a.exact + " of " + a.planted : r.leaked + " of 6") + " seeded secrets found.");
    }, function (e) { S.leak = { error: String((e && e.message) || e) }; })
      .then(function () { S.busy = ""; renderAll(); });
  }
  function drill() {
    if (S.busy) return;
    S.busy = "drill"; renderAll();
    flush().then(function () { return api().hostileDrill(); }).then(function (d) {
      S.drill = d; S.drillSeq += 1;
      var n = d.results.filter(function (r) { return r.blocked; }).length;
      say("Drill: " + n + " of " + d.results.length + " hostile replies blocked.");
    }, function (e) { S.drill = { error: String((e && e.message) || e) }; })
      .then(function () { S.busy = ""; renderAll(); });
  }
  /* Receipt integrity challenge: edits one field of an in-memory COPY of the
     session receipt, shows the hash chain failing at that receipt, then restores
     it. Nothing is stored or sent; the real receipts are not touched. */
  function receiptChallenge() {
    var Bd = B();
    if (!Bd || typeof Bd.sessionReceipt !== "function" || typeof Bd.verifySessionReceipt !== "function" || S.busy) return;
    S.busy = "challenge"; renderAll();
    var out = "";
    Promise.resolve().then(function () { return Bd.sessionReceipt(); }).then(function (rec) {
      var n = rec && Array.isArray(rec.receipts) ? rec.receipts.length : 0;
      if (!n) { out = "There is no receipt to edit yet. Send a case or run the leak audit first, then try again."; return; }
      var copy = JSON.parse(JSON.stringify(rec)), i = Math.floor((n - 1) / 2), r = copy.receipts[i];
      var key = Object.keys(r).filter(function (k) { return k !== "hash" && k !== "prevHash" && ["number", "string", "boolean"].indexOf(typeof r[k]) >= 0; })[0];
      if (!key) { out = "This receipt has no plain field to edit."; return; }
      var orig = r[key], edited;
      return Bd.verifySessionReceipt(copy).then(function (v0) {
        edited = typeof orig === "number" ? orig + 1 : typeof orig === "boolean" ? !orig : String(orig) + "x"; r[key] = edited;
        return Bd.verifySessionReceipt(copy).then(function (v1) {
          r[key] = orig;
          return Bd.verifySessionReceipt(copy).then(function (v2) {
            var ok = function (v) { return v === true || (v && v.ok === true); };
            out = "Copy of the receipt, " + n + " " + plural(n, "receipt") + ": chain " + (ok(v0) ? "intact" : "NOT intact") + ". Changed field \"" + key + "\" of receipt #" + i + " in the copy (" + String(orig) + " to " +
              String(edited) + "): " +
              (ok(v1) ? "chain still passed, which should not happen" : "chain BROKEN" + (v1 && typeof v1.brokenAt === "number" ? " at receipt #" + v1.brokenAt : "")) + ". Restored: chain " + (ok(v2) ? "intact" : "NOT intact") +
              ". A hash chain detects accidental edits; it is not a signature (anyone can recompute it). Your real receipts were not changed.";
          });
        });
      });
    }).catch(function (e) { out = "The challenge could not run: " + String((e && e.message) || e); })
      .then(function () { S.busy = ""; setText("challengeMsg", out); say(out.split(". ").slice(0, 3).join(". ") + "."); renderAll(); });
  }
  function downloadReceipt() {
    var Bd = B();
    if (!Bd || typeof Bd.sessionReceipt !== "function" || S.busy) return;
    S.busy = "receipt"; renderAll();
    Promise.resolve().then(function () { return Bd.sessionReceipt(); }).then(function (r) {
      var blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = h("a", { href: url, download: "aion-session-receipt-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json" });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      var n = r && Array.isArray(r.receipts) ? r.receipts.length : 0;
      setText("receiptMsg", "Saved on this device: " + n + " " + plural(n, "receipt") + (r && r.chainHash ? ", chain " + short(r.chainHash) : "") + ". Nothing was uploaded.");
      say("Session receipt downloaded.");
    }, function (e) { setText("receiptMsg", "Could not build the receipt: " + String((e && e.message) || e)); })
      .then(function () { S.busy = ""; renderAll(); });
  }

  /* ------------------------------------------------------------ steps */
  function go(step, opts) {
    if (STEPS.indexOf(step) < 0) step = "quote";
    S.step = step; S.visited[step] = true;
    document.body.setAttribute("data-step", step);
    STEPS.forEach(function (s) { $("step-" + s).hidden = s !== step; });
    document.querySelectorAll(".stepper [data-go]").forEach(function (b) {
      if (b.getAttribute("data-go") === step) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
    if (location.hash !== "#" + step) { try { history.replaceState(null, "", "#" + step); } catch (e) { /* file:// */ } }
    renderAll();
    if (opts && opts.focus) {
      var hd = $("h-" + step);
      if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: motion() === "full" ? "smooth" : "auto" });
      if (hd) hd.focus({ preventScroll: true });
    }
  }

  /* --------------------------------------------------------- rendering */
  function renderAll() {
    if (!S.c) return;
    /* The scenario list can arrive after boot (it is feature-detected): pick it up once. */
    if (S.packs === null && !S.packsAsked && api() && typeof api().packs === "function") { S.packsAsked = true; loadPacks().then(renderAll); }
    renderStatus();
    renderBorder();
    renderStepper();
    if (S.step === "quote") renderQuote();
    if (S.step === "share") renderShare();
    if (S.step === "send") renderSend();
    if (S.step === "verdict") renderVerdict();
    if (S.step === "proof") renderProof();
    if ($("work").open) renderWork();
  }

  function renderStatus() {
    var st = HS();
    var nano = $("stNano");
    nano.setAttribute("data-tone", st.nano === "ready" ? "green" : st.nano === "checking" || !st.nano ? "idle" : "grey");
    setText("stNanoV", (NANO_TEXT[st.nano] || "—") + (st.nano === "downloading" && st.nanoDetail ? " " + st.nanoDetail : ""));
    setText("tipNano", (NANO_WHY[st.nano] || "Gemini Nano state unknown.") + (st.nanoDetail && st.nano !== "downloading" ? " " + st.nanoDetail : ""));
    var cs = cloudStatus();
    $("stCloud").setAttribute("data-tone", cs.tone);
    setText("stCloudV", cs.text);
    setText("tipCloud", cs.why);
    var m = routeMode();
    $("stRoute").setAttribute("data-tone", m === "only_on_device" ? "green" : "amber");
    setText("stRouteV", ROUTE_SHORT[m] || m);
    setText("tipRoute", (MODE_CONST[m] || m) + ". " + (st.offlineDemo ? "Forced by the pulled plug. " : "") + (MODE_WHY[m] || m));
  }

  /* ---------------- the border: slips on a printed rule ---------------- */
  var slipEls = {};
  function hash(s) { var x = 0; for (var i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0; return x; }
  function slipEl(key) {
    var el = slipEls[key];
    if (el) return el;
    el = h("li", { class: "slip", "data-key": key },
      h("span", { class: "s-id" }), h("span", { class: "s-h" }), h("span", { class: "s-c" }), h("span", { class: "stamp" }));
    /* a printed slip is never perfectly straight: a fixed tilt per slip, under half a degree */
    el.style.setProperty("--rot", ((hash(key) % 9) / 20).toFixed(2) + "deg");
    slipEls[key] = el;
    $("field").appendChild(el);
    return el;
  }
  function fillSlip(el, id, heading, chars, pos, stamp, extra) {
    el.querySelector(".s-id").textContent = id;
    el.querySelector(".s-h").textContent = heading;
    el.querySelector(".s-c").textContent = chars;
    el.querySelector(".stamp").textContent = stamp || "";
    el.setAttribute("data-pos", pos);
    el.setAttribute("data-stamp", stamp ? "true" : "false");
    Object.keys(extra || {}).forEach(function (k) { el.setAttribute(k, extra[k]); });
    el.setAttribute("aria-label", id + ", " + heading + (chars ? ", " + chars + (/^[\d,]+$/.test(chars) ? " characters" : "") : "") + ". " + ({ held: "Held on this device", queued: "Ticked to leave, not sent", crossed: "Crossed to the cloud in an approved send", private: "Private, has no disclosure field", reply: "Cloud reply" }[pos] || pos) + (stamp ? ". " + stamp : "") + ".");
  }

  function renderBorder() {
    var c = S.c, a = approval(), cs = cloudStatus(), blocked = !!cloudBlockedReason();
    var inst = $("instrument");
    var down = cs.down || blocked;
    inst.setAttribute("data-cloud", down ? "down" : "up");
    var phase = S.sent ? "sent" : a.key === "approved" ? "approved" : "draft";
    inst.setAttribute("data-phase", phase);

    var pk = currentPack();
    setText("caseTag", (pk ? pk.title + " · " : "") + (c.supplier || "Supplier") + (c.sample || pk ? (/fictional/i.test(c.supplier || "") ? "" : " · fictional") : " · imported " + (c.importedBy || "text")));

    var crossed = {};
    (S.sent ? S.sent.ids : []).forEach(function (id) { crossed[id] = true; });
    var pchars = privChars(c);
    var held = pchars, queued = 0, nq = 0, nh = 0;
    c.paragraphs.forEach(function (p) {
      var n = String(p.text || "").length;
      if (crossed[p.id]) return;
      held += n;
      if (shareable(p)) { queued += n; nq += 1; } else nh += 1;
    });
    dm($("heldNum"), fmt(held), fmt(held) + " characters held on this device");
    setText("heldUnit", "characters held · loaded case");
    var sentChars = S.sent ? S.sent.chars : 0;
    dm($("crossNum"), fmt(sentChars), fmt(sentChars) + " characters crossed to the cloud");
    setText("crossUnit", S.sent ? (S.sent.unobserved ? "characters observed · attempted, no outgoing body seen" : "characters crossed · the whole approved text") : "characters crossed · nothing sent yet");
    setText("cloudWord", down ? "Cloud " + (HS().offlineDemo ? "unplugged" : cs.text) + " · nothing crosses" : "");

    /* the slips */
    var keep = {};
    var dev = [], cld = [];
    var pe = slipEl("PRIV"); keep.PRIV = true;
    fillSlip(pe, "PR", "Private requirements", fmt(pchars), "private", "", { "data-pid": "" });
    dev.push(pe);
    c.paragraphs.forEach(function (p) {
      var key = "P:" + p.id; keep[key] = true;
      var el = slipEl(key);
      var len = String(p.text || "").length;
      var pos = crossed[p.id] ? "crossed" : shareable(p) ? "queued" : "held";
      fillSlip(el, p.id, p.heading || "Passage", fmt(len), pos, pos !== "crossed" && heldByRule(p) ? "Held" : "",
        { "data-pid": p.id, "data-approved": pos === "queued" && a.key === "approved" ? "true" : "false" });
      (pos === "crossed" ? cld : dev).push(el);
    });
    if (S.sent && S.result && S.result.g) {
      keep.REPLY = true;
      var re = slipEl("REPLY");
      var cv = rules().cloudVerdict(S.result.g.text);
      fillSlip(re, "Reply", cv ? "Advice: " + (CLOUD_TEXT[cv] || cv) : "Advice, no verdict line", ms(S.sent.latencyMs), "reply", "", { "data-kind": "advice", "data-pid": "" });
      cld.push(re);
    }
    if (S.drill && !S.drill.error) {
      keep.HOSTILE = true;
      var he = slipEl("HOSTILE");
      var nb = S.drill.results.filter(function (x) { return x.blocked; }).length;
      fillSlip(he, nb + "/" + S.drill.results.length, "hostile replies in the drill", "", "reply", nb ? "Blocked by plain code" : "", { "data-kind": "hostile", "data-pid": "" });
      cld.push(he);
      if (he.getAttribute("data-seq") !== String(S.drillSeq)) {
        he.setAttribute("data-seq", String(S.drillSeq));
        if (motion() === "full" && nb) { he.classList.remove("bounce"); void he.offsetWidth; he.classList.add("bounce"); }
      }
    }
    Object.keys(slipEls).forEach(function (k) { if (!keep[k]) { slipEls[k].remove(); delete slipEls[k]; } });
    layoutSlips(dev, cld);

    var bits = [];
    if (S.sent) bits.push(S.sent.ids.length + " " + plural(S.sent.ids.length, "passage") + " crossed in one approved send (revision " + S.sent.rev + ")");
    if (nq || !S.sent) bits.push(nq + " ticked to leave" + (a.key === "approved" ? ", approved" : "") + " · " + fmt(queued) + " chars waiting");
    if (nh) bits.push(nh + " kept here");
    setText("bFoot", bits.join(" · ") + ". Numbers on slips are characters.");
  }
  /* Narrow screens: the instrument is a compact numbers strip; the slips open on demand and after a send. */
  function setFieldOpen(on) {
    var inst = $("instrument"), t = $("fieldToggle");
    if (on) inst.setAttribute("data-open", "true"); else inst.removeAttribute("data-open");
    t.setAttribute("aria-expanded", on ? "true" : "false");
    t.textContent = on ? "Hide the slips" : "Show the slips";
    if (S.c) renderBorder();
  }
  function layoutSlips(dev, cld) {
    var f = $("field");
    var tray = $("tray");
    if (!tray) { tray = h("li", { class: "tray", id: "tray", "aria-hidden": "true" }); f.appendChild(tray); }
    var W = f.clientWidth || 520;
    var rule = W < 420 ? 26 : 56;
    var colW = (W - rule) / 2;
    var mini = colW < 210;
    var per = mini ? 2 : 1;
    var gap = mini ? 6 : 8, sh = mini ? 40 : 46, nudge = mini ? 0 : 14;
    var sw = mini ? (colW - gap) / 2 - 2 : colW - nudge - 2;
    function place(list, x0, right) {
      var r = 0, k = 0;
      list.forEach(function (el) {
        var pos = el.getAttribute("data-pos");
        var wide = mini && pos === "reply";                  /* a reply slip takes the whole column on a phone */
        if (wide && k) { r += 1; k = 0; }
        var x = x0 + k * (sw + gap);
        if (!right && pos === "queued") x += nudge;          /* pressed up against the rule, waiting */
        if (right && !mini) x += nudge;
        el.style.width = (wide ? colW - 2 : sw) + "px";
        el.style.height = sh + "px";
        el.style.setProperty("--x", x.toFixed(1) + "px");
        el.style.setProperty("--y", (r * (sh + gap)).toFixed(1) + "px");
        k += wide ? per : 1;
        if (k >= per) { r += 1; k = 0; }
      });
      return r + (k ? 1 : 0);
    }
    var rows = Math.max(place(dev, 0, false), place(cld, colW + rule, true), 1);
    var down = $("instrument").getAttribute("data-cloud") === "down";
    tray.hidden = cld.length > 0;
    tray.textContent = down ? "Cloud " + ($("cloudWord").textContent ? $("cloudWord").textContent.replace(/^Cloud /, "") : "down") + "." :
      "Nothing has crossed. A slip moves here only after you approve the exact text and it is sent.";
    tray.style.width = (colW - (mini ? 0 : nudge) - 2) + "px";
    tray.style.height = (Math.min(Math.max(rows, 2), 3) * (sh + gap) - gap) + "px";
    tray.style.setProperty("--x", (colW + rule + (mini ? 0 : nudge)).toFixed(1) + "px");
    f.style.height = (rows * (sh + gap) - gap) + "px";
    f.setAttribute("data-mini", mini ? "true" : "false");
  }

  function renderStepper() {
    var done = {
      quote: !!(S.c && S.c.paragraphs.length),
      share: !!S.visited.share,
      send: !!(S.result && S.result.g),
      verdict: !!(S.provisional && !S.provisional.error) || !!(S.result && S.result.g && S.visited.verdict),
      proof: !!(S.leak && !S.leak.error) || !!(S.drill && !S.drill.error),
    };
    document.querySelectorAll(".stepper [data-go]").forEach(function (b) { b.setAttribute("data-done", done[b.getAttribute("data-go")] ? "true" : "false"); });
  }

  /* 01 */
  function renderQuote() {
    var c = S.c;
    var list = packList();
    var box = $("scenarioBox");
    box.hidden = !list.length;
    if (list.length) {
      var seg = $("scenarios"), cur = currentPack();
      var shown = list.slice(0, 3);
      if (seg.getAttribute("data-ids") !== shown.map(function (p) { return p.id; }).join("|")) {
        seg.replaceChildren.apply(seg, shown.map(function (p) {
          var b = h("button", { type: "button", role: "radio", "data-pack": p.id, "aria-checked": "false", title: p.title || p.id },
            h("span", { class: "seg-t", text: SHORT_TITLE[p.id] || String(p.title || p.id).split(":")[0] }), h("span", { class: "seg-k", text: p.kind === "scam" ? "call" : "quote" }));
          b.addEventListener("click", function () { if (!S.busy && (!currentPack() || currentPack().id !== p.id)) loadScenario(p.id, false); });
          return b;
        }));
        seg.setAttribute("data-ids", shown.map(function (p) { return p.id; }).join("|"));
      }
      seg.querySelectorAll("[data-pack]").forEach(function (b) {
        var on = !!cur && cur.id === b.getAttribute("data-pack");
        b.setAttribute("aria-checked", on ? "true" : "false");
        b.tabIndex = on || (!cur && b === seg.firstChild) ? 0 : -1;
        b.disabled = !!S.busy;
      });
      setText("scenarioBlurb", cur ? (cur.title ? cur.title + ". " : "") + (cur.blurb || "") : "Pick a scenario, or use your own quote below.");
      var pz = $("poison");
      if (!S.busy) pz.checked = !!c.poisoned;
      pz.disabled = !!S.busy || !cur;
    }
    var scam = c.caseKind === "scam";
    setText("h-quote", scam ? "Bring in the call." : "Bring in a supplier quote.");
    setText("quoteLede", scam ? "The transcript is read and split into lines on this device. Nothing from this Case flow is sent until you approve the exact text."
      : "It is read and split into passages on this device. Nothing from this Case flow is sent until you approve the exact text.");
    var flagged = c.paragraphs.filter(function (p) { return p.injection && p.injection.flagged; }).length;
    var sampleBtn = h("button", { type: "button", class: "btn ghost small", id: "sampleBtn", disabled: !!S.busy, text: list.length ? "Reset" : "Reload the sample" });
    sampleBtn.addEventListener("click", function () { var pk = currentPack(); loadScenario(pk ? pk.id : null, !!S.c.poisoned); });
    $("caseNow").replaceChildren(
      h("div", { class: "loaded-main" },
        h("p", { class: "k", text: c.sample || currentPack() ? "Loaded case · sample (fictional)" + (c.poisoned ? " · planted instruction" : "") : "Loaded case · imported " + (c.importedBy || "text") }),
        h("p", { class: "title", text: c.supplier || "Supplier" }),
        h("p", { class: "meta", text: c.paragraphs.length + " " + plural(c.paragraphs.length, "passage") + " · revision " + c.inputRevision + (flagged ? " · " + flagged + " held by a rule" : "") })),
      sampleBtn);
    $("importBtn").disabled = !!S.busy;
    $("imageInput").disabled = !!S.busy;
    var nanoOk = HS().nano === "ready";
    $("imageLabel").title = nanoOk ? "Gemini Nano reads the image on this device; it is not uploaded." : "Needs Gemini Nano in this browser. Paste the text instead.";
  }

  /* 02 */
  function captureFocus() {
    var a = document.activeElement;
    if (!a || !a.getAttribute) return null;
    var f = null;
    ["data-share", "data-over", "data-edit"].forEach(function (k) { if (a.hasAttribute(k)) f = { k: k, id: a.getAttribute(k) }; });
    if (f && f.k === "data-edit") { f.s0 = a.selectionStart; f.s1 = a.selectionEnd; f.value = a.value; }
    return f;
  }
  function restoreFocus(f) {
    if (!f) return;
    var n = document.querySelector("[" + f.k + '="' + f.id + '"]');
    if (!n) return;
    if (f.k === "data-edit") { if (pending.length) n.value = f.value; n.focus({ preventScroll: true }); try { n.setSelectionRange(f.s0, f.s1); } catch (e) { /* ignore */ } }
    else n.focus({ preventScroll: true });
  }
  function renderShare() {
    var c = S.c, focus = captureFocus();
    var open = {};
    document.querySelectorAll(".plist details[open]").forEach(function (d) { open[d.getAttribute("data-pid")] = true; });
    var items = [], sc = 0, lc = 0, ns = 0, nl = 0;
    c.paragraphs.forEach(function (p) {
      items.push(passageItem(p, open[p.id]));
      var n = String(p.text || "").length;
      if (shareable(p)) { lc += n; nl += 1; } else { sc += n; ns += 1; }
    });
    $("plist").replaceChildren.apply($("plist"), items.length ? items : [h("li", { class: "empty", text: "This case has no passages." })]);
    setText("leavesCount", nl + " " + plural(nl, "passage") + " leave · " + fmt(lc) + " chars");
    setText("staysCount", ns + " stay · " + fmt(sc) + " chars");
    var pc = c.privateConstraints || {};
    var fields = privateFields();
    setText("privateFixed", "Your private requirements stay here: " + fields.length + " " + plural(fields.length, "field") + ", " + fmt(privChars(c)) +
      " characters. A disclosure has no field for them.");
    renderPrivateFields(fields, pc);
    var line = $("sizeLine");
    if (S.prep) {
      var hits = S.prep.privateHits || [];
      line.replaceChildren("Exact disclosure text: ", h("b", { text: fmt(S.prep.bytes) + " characters" }),
        " (instructions, question, ticked passages, sources and stated requirements). Private-value scan: ",
        h("b", { text: hits.length ? "FOUND " + hits.map(function (x) { return x.kind.replace(/_/g, " "); }).join(", ") : "none found" }), ".");
    } else line.textContent = S.prepError ? "The disclosure could not be prepared: " + S.prepError : "Preparing the disclosure…";
    renderCounterfactual();
    restoreFocus(focus);
  }
  function renderPrivateFields(fields, pc) {
    var grid = $("pgrid");
    var sig = fields.map(function (f) { return f.key + ":" + f.type; }).join("|");
    if (grid.getAttribute("data-sig") !== sig) {
      grid.replaceChildren.apply(grid, fields.map(function (f) {
        var id = "pv_" + String(f.key).replace(/[^A-Za-z0-9_]/g, "");
        var inp;
        if (isCheck(f)) {
          inp = h("input", { type: "checkbox", id: id, "data-pv": f.key });
          inp.addEventListener("change", function () { var v = inp.checked; queueEdit(function (c) { c.privateConstraints = c.privateConstraints || {}; c.privateConstraints[f.key] = v; }, 60); });
          return h("label", { class: "inline wide" }, inp, h("span", { text: f.label }));
        }
        inp = h("input", { type: "text", id: id, "data-pv": f.key, autocomplete: "off" });
        inp.addEventListener("input", function () { var v = inp.value; queueEdit(function (c) { c.privateConstraints = c.privateConstraints || {}; c.privateConstraints[f.key] = v; }, 450); });
        return h("label", { class: /note|confidential/i.test(f.key) ? "wide" : null }, h("span", { text: f.label }), inp);
      }));
      grid.setAttribute("data-sig", sig);
    }
    grid.querySelectorAll("[data-pv]").forEach(function (n) {
      var k = n.getAttribute("data-pv");
      if (n.type === "checkbox") n.checked = !!pc[k];
      else if (document.activeElement !== n) n.value = pc[k] == null ? "" : String(pc[k]);
    });
  }
  /* Honest comparison: which private values each text contains. The border's
     text can be LONGER than a naive paste (it carries instructions), so this
     never claims "fewer characters"; savedChars is shown only when positive. */
  function renderCounterfactual() {
    var r = S.cf, panel = $("cfPanel");
    panel.hidden = !r || !r.naive || !S.prep;
    if (panel.hidden) return;
    var found = Array.isArray(r.naive.privateFound) ? r.naive.privateFound : [];
    var text = S.prep.text || "";
    var inBorder = found.filter(function (x) { return x.value && text.indexOf(String(x.value)) !== -1; });
    setText("cfNaive", fmt(found.length));
    setText("cfNaiveUnit", "private " + plural(found.length, "value") + " inside a naive paste of everything (" + fmt(r.naive.chars) + " characters):");
    var list = $("cfPrivate");
    list.replaceChildren.apply(list, found.length ? found.map(function (x) {
      return h("li", null, h("span", { class: "cf-l", text: x.label }), h("span", { class: "cf-v", text: x.value }));
    }) : [h("li", { class: "empty", text: "none found" })]);
    setText("cfBorder", fmt(inBorder.length));
    panel.setAttribute("data-border-hits", String(inBorder.length));
    setText("cfBorderUnit", "of those values inside the text the border would send (" + fmt(S.prep.bytes) + " characters, exact-match check on this device)." +
      (inBorder.length ? " Found: " + inBorder.map(function (x) { return x.label; }).join(", ") + "." : "") +
      (typeof r.savedChars === "number" && r.savedChars > 0 ? " It is also " + fmt(r.savedChars) + " characters shorter." : ""));
  }
  function passageItem(p, isOpen) {
    var flagged = !!(p.injection && p.injection.flagged);
    var len = String(p.text || "").length;
    var li = h("li", { class: "psg", "data-pid": p.id, "data-flagged": flagged ? "true" : "false", "data-leaves": shareable(p) ? "true" : "false" });
    var cb = h("input", { type: "checkbox", "data-share": p.id, id: "share-" + p.id, checked: !!p.shared });
    cb.addEventListener("change", function () {
      var on = cb.checked;
      queueEdit(function (c) { c.paragraphs.forEach(function (x) { if (x.id === p.id) x.shared = on; }); }, 60);
    });
    li.appendChild(h("label", { class: "tick", for: "share-" + p.id }, cb, h("span", { class: "pid", text: p.id }), h("span", { class: "ph", text: p.heading || "Passage" }),
      h("span", { class: "chars", text: fmt(len) + " chars" }), h("span", { class: "where", text: shareable(p) ? "leaves" : flagged && !p.injectionOverride ? "held" : "stays" })));
    if (flagged) {
      var ov = h("input", { type: "checkbox", "data-over": p.id, id: "over-" + p.id, checked: !!p.injectionOverride });
      ov.addEventListener("change", function () {
        var on = ov.checked;
        queueEdit(function (c) { c.paragraphs.forEach(function (x) { if (x.id === p.id && x.injection) x.injectionOverride = on; }); }, 60);
      });
      li.appendChild(h("div", { class: "flag", role: "note" },
        h("span", { text: "A simple rule flagged this as instructions or hidden characters, so it is held back even if ticked" + (p.injectionOverride ? "; you allowed it, so it leaves if ticked." : ".") }),
        h("br"), h("span", { class: "rules", text: (p.injection.rules || []).join(" · ") }),
        h("label", { class: "override", for: "over-" + p.id }, ov, h("span", { text: "I read it: allow sharing anyway" }))));
    }
    var det = h("details", { "data-pid": p.id, open: !!isOpen });
    var ta = h("textarea", { "data-edit": p.id, rows: "3", "aria-label": "Edit the text of " + p.id, spellcheck: "false" });
    ta.value = String(p.text || "");
    ta.addEventListener("input", function () {
      var v = ta.value;
      queueEdit(function (c) { c.paragraphs.forEach(function (x) { if (x.id === p.id) x.text = v; }); }, 450);
    });
    det.appendChild(h("summary", { text: "Read", "aria-label": "Read or edit the text of " + p.id }));
    det.appendChild(h("p", { class: "ptext", text: p.text || "" }));
    det.appendChild(ta);
    li.appendChild(det);
    return li;
  }

  /* 03 */
  function renderSend() {
    var st = HS(), m = routeMode();
    setText("modeName", MODE_CONST[m] || m);
    $("modeBanner").setAttribute("data-policy", m === "only_on_device" ? "local" : "cloud");
    setText("modeSub", m === "only_on_device"
      ? (st.offlineDemo ? "Forced by the pulled plug. " : "") + "The case is not sent. Step 04 can still give a provisional verdict made on this device."
      : "A case send always runs ONLY_IN_CLOUD with the approved text, so it never silently falls back to the device.");
    document.querySelectorAll('#routeSet input[name="route"]').forEach(function (r) { r.checked = r.value === m; r.disabled = !!st.offlineDemo; });
    $("plug").checked = !!st.offlineDemo;
    setText("plugSub", st.offlineDemo ? "On: fetch() calls made by this page's code are blocked. Not a firewall; use airplane mode to test the network." : "Off. Turn on to block fetch() calls made by this page's code. Not a firewall.");
    var a = approval(), p = S.prep;
    var chip = $("gateChip");
    chip.setAttribute("data-state", a.key);
    chip.textContent = a.text;
    setText("gateDigest", p ? short(p.disclosure.contentDigest) : "—");
    setText("gateChars", p ? fmt(p.bytes) : "—");
    setText("gateRev", p ? String(p.disclosure.inputRevision) : "—");
    setText("gatePassages", p ? (p.included.passages.join(" ") || "none") : "—");
    setText("gateText", p ? p.text : S.prepError);
    var why = cloudBlockedReason();
    var hits = p ? (p.privateHits || []) : [];
    $("approveBtn").disabled = !p || !!S.busy || a.key === "approved" || a.key === "sent" || hits.length > 0;
    $("approveBtn").textContent = a.key === "approved" ? "Approved" : "Approve this exact text";
    $("sendBtn").disabled = a.key !== "approved" || !!why || !!S.busy;
    $("sendBtn").textContent = S.busy === "send" ? "Sending…" : "Send to the cloud";
    $("prepBtn").hidden = a.key !== "sent";
    $("approveBtn").hidden = a.key === "sent";
    $("sendBtn").hidden = a.key === "sent";
    setText("gateWhy", hits.length ? "The private-value scan found registered private values in this text, so it cannot be approved." :
      why ? why + (a.key === "approved" ? " The approval stays valid for when you plug back in." : "") :
      a.key === "draft" ? "Send stays off until this exact text is approved." :
      a.key === "stale" ? "The case changed after you approved. Read the new text and approve again." : "");
    var line = $("engineLine"), r = S.result;
    line.removeAttribute("data-tone");
    if (S.busy === "send") line.textContent = "Sending the approved disclosure…";
    else if (r && r.g) {
      var g = r.g;
      line.replaceChildren(h("span", { class: "badge", text: ms(g.latencyMs) }),
        " Ran " + (g.actual_source === "in_cloud" ? "in the cloud" : "on this device") + " · " + (g.model || "model not reported") + " · " +
        (g.source_verified ? "reported by the SDK (inferenceSource: " + g.actual_source + ")" : "inferred: the SDK did not report inferenceSource") +
        (g.disclosure ? (function () {
          var ob = observedOf(g);
          if (!ob) return " · " + fmt(g.disclosure.bytes) + " characters in the approved text";
          return ob.observed ? " · " + fmt(ob.chars != null ? ob.chars : g.disclosure.bytes) + " characters seen in the request body"
            : " · attempted; no outgoing body observed (" + fmt(g.disclosure.bytes) + " characters were approved)";
        })() : ""));
    } else if (r && r.error) {
      line.setAttribute("data-tone", "red");
      line.textContent = (r.kindText ? r.kindText + " (" + r.kind + ") " : "") + String(r.error).split("\n")[0].slice(0, 300);
    } else line.textContent = "Nothing sent yet.";
  }

  /* 04 */
  function renderVerdict() {
    var R = rules(), c = S.c;
    var local = R.reconcile(c);
    $("finalCard").setAttribute("data-verdict", local.verdict);
    setText("finalV", verdictText(local.verdict));
    var hid = (local.privatePassagesUsed || []).slice().sort();
    setText("finalSub", "Plain code in this browser read all " + c.paragraphs.length + " passages and your private requirements" +
      (hid.length ? ", including " + hid.join(", ") + ", which are not part of the Case disclosure." : "."));
    function checkRow(k) {
      return h("li", { "data-s": k.status, "data-check": k.id }, h("span", { class: "cl", text: k.label }), h("span", { class: "cs", text: STATUS_TEXT[k.status] || k.status }),
        h("span", { class: "cd", text: k.detail + (k.assumption ? " (" + k.assumption.replace(/ \(change it in Private requirements\)/, "; change it in step 02") + ")" : "") }));
    }
    var bad = local.checks.filter(function (k) { return k.status !== "pass"; }), good = local.checks.filter(function (k) { return k.status === "pass"; });
    $("checksList").replaceChildren.apply($("checksList"), bad.map(checkRow));
    $("passList").replaceChildren.apply($("passList"), good.map(checkRow));
    $("issuesHead").hidden = !bad.length;
    $("noIssues").hidden = !!bad.length;
    $("passedChecks").hidden = !good.length;
    setText("passedSummary", "Checks that passed (" + good.length + " of " + local.checks.length + ")");
    var r = S.result, cl = $("cloudLine"), cv = null;
    if (r && r.g) {
      cv = R.cloudVerdict(r.g.text);
      var cmp = R.compareVerdicts(cv, local.verdict);
      var dir = { stricter: "The final decision is stricter than the cloud's.", looser: "The final decision is looser than the cloud's.", same: "The final decision matches the cloud's level." }[cmp.direction] || "";
      cl.replaceChildren("Cloud said: ", h("b", { text: cv ? CLOUD_TEXT[cv] : "no valid VERDICT line" }),
        cv ? " (its \"VERDICT:\" line, read by plain code). " : " so the cloud's view counts as none. ",
        "It was sent " + r.seen + " of " + r.total + " passages; the Case disclosure has no field for your private requirements. " + dir +
        (r.rev !== c.inputRevision ? " This reply was for revision " + r.rev + "; the case is now at revision " + c.inputRevision + "." : ""));
      $("replyDetails").hidden = false;
      setText("replyText", r.g.text);
    } else if (r && r.error) {
      cl.textContent = "The cloud request failed: " + (r.kindText || "error") + " (" + r.kind + "). A provisional verdict on this device is still available.";
      $("replyDetails").hidden = true;
    } else {
      cl.textContent = "No cloud reply yet. Send in step 03, or ask this device.";
      $("replyDetails").hidden = true;
    }
    var v = S.provisional, sl = $("secondLine"), ag = $("agreeLine");
    $("provBtn").disabled = !!S.busy;
    $("provBtn").textContent = S.busy === "prov" ? "Working on this device…" : v ? "Ask again" : "Get a provisional verdict";
    ag.setAttribute("data-state", "");
    ag.textContent = "";
    if (v && v.error) sl.textContent = "Could not make a provisional verdict here: " + v.error;
    else if (v) {
      sl.replaceChildren("Made on this device by ", h("b", { text: v.engine }), ": ",
        h("b", { text: v.verdict ? CLOUD_TEXT[v.verdict] || v.verdict : "no verdict" }), ". " + v.why +
        " Read only " + (v.passages.length ? v.passages.join(", ") : "no passages") + ". Not from the cloud." +
        (v.nanoError ? " (Gemini Nano: " + v.nanoError + ".)" : ""));
      var nanoV = /nano/i.test(v.engine) ? v.verdict : null;
      var e = B().engineAgreement(nanoV, cv);
      ag.setAttribute("data-state", e.state);
      ag.textContent = (e.state === "agree" ? "Engines agree. " : e.state === "disagree" ? "Engines disagree. " : "One engine only. ") + e.note +
        (e.state === "one-sided" && !nanoV ? " Gemini Nano gave no verdict here." : "") + (e.state === "one-sided" && !cv ? " There is no cloud verdict yet." : "");
    } else sl.textContent = "Ask Gemini Nano (or plain code, if Nano is not ready) for a provisional verdict from the shared passages only. Nothing is sent.";
  }

  /* 05 */
  function timings() {
    var rc = H().telemetry.getReceipts();
    var nano = rc.filter(function (x) { return x.route === "on-device-nano" && x.status === "completed" && typeof x.latencyMs === "number"; });
    var cloud = rc.filter(function (x) { return x.route === "cloud-case-research" && x.status === "completed" && typeof x.latencyMs === "number"; });
    var st = HS();
    return [
      { k: "Nano · first call this page", v: nano.length ? nano[0].latencyMs : null },
      { k: "Nano · latest call", v: nano.length > 1 ? nano[nano.length - 1].latencyMs : null },
      { k: "Nano · warm-up", v: typeof st.nanoWarmMs === "number" ? st.nanoWarmMs : null },
      { k: "Cloud · latest case send", v: cloud.length ? cloud[cloud.length - 1].latencyMs : null },
      { k: "Nano · image read", v: S.imageMs },
    ];
  }
  function nb2(D) { return D.results.filter(function (x) { return x.blocked; }).length + "/" + D.results.length; }
  function renderProof() {
    var c = S.c, R = rules(), Bd = B();
    var L = S.leak, lu = $("leakUnit");
    $("leakBtn").disabled = !!S.busy;
    $("leakBtn").textContent = S.busy === "leak" ? "Running…" : L ? "Run again" : "Run the leak audit";
    var inconclusive = !!(L && !L.error && L.status === "inconclusive");
    $("leakTile").setAttribute("data-state", L && !L.error ? (inconclusive ? "inconclusive" : ((L.audit ? L.audit.exact : L.leaked) > 0 || L.status === "fail" ? "leak" : "clean")) : "");
    if (L && L.error) { dm($("leakNum"), "—", "failed"); lu.textContent = "The leak audit failed: " + L.error; }
    else if (L) {
      var a = L.audit;
      var found = a ? a.exact : L.leaked, planted = a ? a.planted : L.results.length;
      dm($("leakNum"), found + "/" + planted, found + " of " + planted + " seeded secrets found");
      lu.textContent = (inconclusive ? "INCONCLUSIVE, not a pass · " + (typeof L.statusNote === "string" ? L.statusNote + " " : typeof L.reason === "string" ? L.reason + " " : "Not every expected request body was observed. ") : "") +
        (L.mode === "live" ? "LIVE · " : "DRY RUN · ") + found + " of " + planted + " seeded secrets found verbatim in " + L.inspected + " " +
        (L.mode === "live" ? plural(L.inspected, "Firebase AI request body", "Firebase AI request bodies") + " observed during this run (" + fmt(L.bytes) + " characters, read from fetch)."
          : "prepared request " + plural(L.inspected, "text") + " (the cloud was not reachable, so nothing was sent).") +
        (a ? " Partial hints: " + a.partial + "." : "") + " Control: " + L.controlPresent + " of " + planted + " present in the local data.";
    } else { dm($("leakNum"), "—", "not run yet"); lu.textContent = "seeded secrets found in the Firebase AI request bodies observed during this run. Not run yet."; }

    var D = S.drill, du = $("drillUnit");
    $("drillBtn").disabled = !!S.busy;
    $("drillBtn").textContent = S.busy === "drill" ? "Running…" : D ? "Run again" : "Run the drill";
    if (D && D.error) { dm($("drillNum"), "—", "failed"); du.textContent = "The drill failed: " + D.error; }
    else if (D) {
      var nb = D.results.filter(function (x) { return x.blocked; }).length;
      dm($("drillNum"), nb + "/" + D.results.length, nb + " of " + D.results.length + " hostile replies blocked");
      du.textContent = (D.allBlocked ? "All hostile replies blocked. " : "NOT all blocked: see the lines below. ") + "The final verdict stayed \"" +
        verdictText(D.localFinal) + "\". " + D.label.charAt(0).toUpperCase() + D.label.slice(1) + ".";
    } else { dm($("drillNum"), "—", "not run yet"); du.textContent = "hostile replies blocked. Not run yet."; }

    var local = R.reconcile(c);
    var cv = S.result && S.result.g ? R.cloudVerdict(S.result.g.text) : null;
    var G = Bd.gauges({ leak: L && L.audit ? L.audit : null, caseObj: c, cloudVerdict: cv, localVerdict: local.verdict });
    $("gaugeFill").style.width = Math.round(G.useful.sharedFraction * 100) + "%";
    $("gaugeTile").setAttribute("data-gamed", G.gamed ? "true" : "false");
    setText("gaugeUnit", "Shared " + G.useful.sharedPassages + " of " + G.useful.totalPassages + " passages (" + Math.round(G.useful.sharedFraction * 100) + "%). " +
      (G.leak.score === null ? "Leak score: — (run the leak audit). " : G.gamed ? "GAMED: almost nothing was shared, so a clean leak score proves little. " : "Leak score " + G.leak.score + " with real sharing. ") +
      "The tick marks the 15% line." + (cv ? " Cloud direction: " + G.useful.cloudDirection + "." : ""));
    var m = Bd.meter.snapshot();
    setText("meterUnit", "Sent this session: " + m.sends + " " + plural(m.sends, "send") + ", " + fmt(m.charsSent) + " characters, " + m.passagesShared + " distinct " +
      plural(m.passagesShared, "passage") + "." + (m.combinationWarning ? " " + m.combinationWarning.message : ""));

    var shared = G.useful.sharedPassages + " of " + G.useful.totalPassages + " passages shared";
    setText("moreNote", shared + " · " + (D && !D.error ? nb2(D) + " drill blocked" : "drill not run") + " · timings · risky three · line by line");
    var tl = $("timings");
    tl.replaceChildren.apply(tl, timings().map(function (t) {
      return h("li", { "data-measured": t.v == null ? "false" : "true" }, h("span", { class: "bk", text: t.k }), h("span", { class: "bv", text: ms(t.v) }));
    }));

    var counts = H().egress.privateCounts(), priv = 0;
    Object.keys(counts).forEach(function (k) { priv += counts[k]; });
    var flagged = c.paragraphs.filter(function (p) { return p.injection && p.injection.flagged; }).length;
    var why = cloudBlockedReason();
    var lit = { private: priv > 0, untrusted: c.paragraphs.length > 0, external: m.sends > 0 };
    setText("lampPrivate", priv ? fmt(priv) + " values" : "none");
    setText("lampUntrusted", c.paragraphs.length + " " + plural(c.paragraphs.length, "passage") + (flagged ? " · " + flagged + " held by a rule" : ""));
    setText("lampExternal", m.sends ? m.sends + " " + plural(m.sends, "send") + " this session" : why ? "blocked now" : "possible, none yet");
    document.querySelectorAll("#lamps li").forEach(function (li) { li.setAttribute("data-lit", lit[li.getAttribute("data-lamp")] ? "true" : "false"); });
    var all = lit.private && lit.untrusted && lit.external;
    $("trifectaTile").setAttribute("data-all", all ? "true" : "false");
    setText("trifectaNote", all
      ? "All three are present: the risky mix for prompt injection. The border's answer: the Case disclosure has no field for private requirements, rule-flagged passages are held, and nothing leaves without your approval of the exact text."
      : "A lit lamp means it is present right now. These are simple rules, not a detector.");

    var rc = H().telemetry.getReceipts();
    var caseR = rc.filter(function (x) { return x.route === "cloud-case-research"; }).length;
    setText("receiptLine", rc.length + " " + plural(rc.length, "receipt") + " recorded this session (" + caseR + " for case sends).");
    var rb = $("receiptBtn");
    rb.hidden = !(Bd && typeof Bd.sessionReceipt === "function");
    rb.disabled = !!S.busy;
    rb.textContent = S.busy === "receipt" ? "Building…" : "Download session receipt (JSON)";
    var cb = $("challengeBtn");
    cb.hidden = !(Bd && typeof Bd.sessionReceipt === "function" && typeof Bd.verifySessionReceipt === "function");
    cb.disabled = !!S.busy;
    var lines = [];
    if (L && !L.error) {
      lines.push("LEAK AUDIT (" + L.mode + ", " + L.at + ")");
      L.results.forEach(function (x) { lines.push("  " + (x.found ? "LEAKED   " : "not found ") + x.where + ": " + x.canary + " · in local data: " + (x.presentLocally ? "yes" : "NO") + " · found in " + x.found + " of " + L.inspected); });
      if (L.audit) L.audit.hits.forEach(function (x) { lines.push("  hint: " + x.secretId + " " + x.kind + " in " + x.where); });
      lines.push("  " + (L.audit ? L.audit.measures : "") + "");
    }
    if (D && !D.error) {
      lines.push("HOSTILE-CLOUD DRILL (" + D.label + ")");
      D.results.forEach(function (x) { lines.push("  " + (x.blocked ? "BLOCKED  " : x.finalChangedByCloud ? "CHANGED  " : "no attempt ") + x.replyId + " · claimed " + (x.cloudClaimed || "no verdict") + " · final " + x.localFinal + (x.ruleViolationsAttempted.length ? " · attempted: " + x.ruleViolationsAttempted.join(", ") : "")); });
    }
    setText("proofText", lines.length ? lines.join("\n") : "Run the leak audit or the drill to see each line here.");
  }

  function renderWork() {
    var p = S.prep, c = S.c;
    setText("wDisclosure", p ? JSON.stringify({ requestId: p.disclosure.requestId, purpose: p.disclosure.purpose, caseId: p.disclosure.caseId,
      inputRevision: p.disclosure.inputRevision, contentDigest: p.disclosure.contentDigest, approvalState: p.disclosure.approvalState,
      payload: p.disclosure.payload, excluded: p.excluded }, null, 2) : (S.prepError || "—"));
    setText("wText", p ? p.text : "—");
    setText("wReceipts", JSON.stringify(H().telemetry.getReceipts(), null, 2));
    setText("wInjection", JSON.stringify(B().injectionReport(c), null, 2));
    setText("wRules", JSON.stringify(rules().reconcile(c), null, 2));
    setText("wMeter", JSON.stringify(B().meter.snapshot(), null, 2));
  }

  /* ------------------------------------------------------------ motion */
  function setupMotion() {
    var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    var conn = navigator.connection || {};
    var low = conn.saveData === true || (typeof navigator.deviceMemory === "number" && navigator.deviceMemory < 4) ||
      (typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 2);
    function apply() { document.body.setAttribute("data-motion", mq && mq.matches ? "reduced" : low ? "static" : "full"); }
    apply();
    if (mq && mq.addEventListener) mq.addEventListener("change", function () { apply(); tiltReset(); });
    /* A very small pointer parallax on the border (at most 3 degrees), fine pointers only. */
    var body = $("bBody"), inst = $("instrument");
    function tiltReset() { body.style.removeProperty("--rx"); body.style.removeProperty("--ry"); inst.removeAttribute("data-tilt"); }
    if (window.matchMedia && window.matchMedia("(pointer: fine)").matches) {
      inst.addEventListener("pointermove", function (e) {
        if (motion() !== "full") return;
        var r = inst.getBoundingClientRect();
        var nx = Math.max(-1, Math.min(1, (e.clientX - r.left - r.width / 2) / (r.width / 2)));
        var ny = Math.max(-1, Math.min(1, (e.clientY - r.top - r.height / 2) / (r.height / 2)));
        inst.setAttribute("data-tilt", "true");
        body.style.setProperty("--rx", (nx * 3).toFixed(2) + "deg");
        body.style.setProperty("--ry", (-ny * 2).toFixed(2) + "deg");
      });
      inst.addEventListener("pointerleave", tiltReset);
    }
    if (typeof ResizeObserver === "function") new ResizeObserver(function () { if (S.c) renderBorder(); }).observe($("field"));
    else window.addEventListener("resize", function () { if (S.c) renderBorder(); });
  }

  /* ------------------------------------------------------------ wiring */
  function wire() {
    document.querySelectorAll("[data-go]").forEach(function (b) {
      b.addEventListener("click", function () { go(b.getAttribute("data-go"), { focus: true }); });
    });
    window.addEventListener("hashchange", function () { var s = location.hash.slice(1); if (STEPS.indexOf(s) >= 0 && s !== S.step) go(s, { focus: true }); });
    $("importBtn").addEventListener("click", function () { if (!S.busy) importText(); });
    /* Only a real pick by the user reads an image; a restored or scripted event does nothing. */
    $("imageInput").addEventListener("change", function (ev) {
      var f = ev.target.files && ev.target.files[0]; ev.target.value = "";
      if (f && ev.isTrusted && !S.busy) importImage(f);
    });
    $("scenarios").addEventListener("keydown", function (e) {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].indexOf(e.key) < 0) return;
      var bs = Array.prototype.slice.call(this.querySelectorAll("[data-pack]"));
      var i = bs.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      var n = bs[(i + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? bs.length - 1 : 1)) % bs.length];
      n.focus(); n.click();
    });
    $("poison").addEventListener("change", function (e) { var pk = currentPack(); if (pk && !S.busy) loadScenario(pk.id, e.target.checked); else e.target.checked = !e.target.checked; });
    /* Another view (or the engine) swapped the case for a pack: redraw from the stored case. */
    window.addEventListener("aion:case-pack", function () {
      if (S.busy === "import") return;
      api().load().then(function (c) { if (S.c && c.inputRevision === S.c.inputRevision) return; newCase(c); S.packId = packIdOf(c); return prepare(); });
    });
    $("fieldToggle").addEventListener("click", function () { setFieldOpen($("instrument").getAttribute("data-open") !== "true"); });
    $("approveBtn").addEventListener("click", approve);
    $("sendBtn").addEventListener("click", send);
    $("prepBtn").addEventListener("click", function () { S.lastApproval = null; prepare(); });
    $("plug").addEventListener("change", function (e) {
      H().setOfflineDemo(e.target.checked);
      renderAll();
    });
    document.querySelectorAll('#routeSet input[name="route"]').forEach(function (r) {
      r.addEventListener("change", function () { if (r.checked) { H().setMode(r.value); renderAll(); } });
    });
    $("provBtn").addEventListener("click", provisional);
    $("leakBtn").addEventListener("click", leak);
    $("drillBtn").addEventListener("click", drill);
    $("receiptBtn").addEventListener("click", downloadReceipt);
    $("challengeBtn").addEventListener("click", receiptChallenge);
    var dlg = $("work");
    var workTrigger = null;
    $("workBtn").addEventListener("click", function () { workTrigger = document.activeElement; renderWork(); if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", ""); });
    dlg.addEventListener("close", function () { var t = workTrigger || $("workBtn"); workTrigger = null; if (t && t.focus) t.focus({ preventScroll: true }); });
    $("workClose").addEventListener("click", function () { dlg.close ? dlg.close() : dlg.removeAttribute("open"); });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
    window.addEventListener("aion:receipt", function () { if (S.step === "proof") renderProof(); if (dlg.open) renderWork(); });
    window.addEventListener("online", renderAll);
    window.addEventListener("offline", renderAll);
    /* Nano readiness and App Check change on their own: refresh the status line. */
    setInterval(function () { if (S.c) { renderStatus(); renderBorder(); } }, 1500);
  }

  function ready() {
    return new Promise(function (resolve, reject) {
      var t0 = Date.now();
      (function poll() {
        if (api() && rules() && H() && B() && window.AionHybridState) return resolve();
        if (Date.now() - t0 > 12000) return reject(new Error("The AI module did not load (is hybrid.bundle.js missing?)."));
        setTimeout(poll, 80);
      })();
    });
  }

  function boot() {
    msg("", "");
    dm($("heldNum"), "—", "not measured yet"); dm($("crossNum"), "—", "not measured yet");
    dm($("leakNum"), "—", "not run yet"); dm($("drillNum"), "—", "not run yet");
    setupMotion();
    wire();
    var first = location.hash.slice(1);
    ready().then(loadPacks).then(function () { return api().load(); }).then(function (c) {
      S.c = c;
      S.packId = packIdOf(c);
      document.body.setAttribute("data-ready", "true");
      go(STEPS.indexOf(first) >= 0 ? first : "quote");
      return prepare();
    }).catch(function (e) {
      $("caseNow").replaceChildren(h("p", { class: "k", text: "Could not start" }), h("p", { class: "sub", text: String((e && e.message) || e) }));
    });
  }

  window.AionStage = {
    state: S, go: go, flush: flush, render: renderAll, dm: dm,
    /* tests: where each slip is drawn */
    debug: function () {
      var out = { held: [], queued: [], crossed: [], stamps: [], motion: motion() };
      document.querySelectorAll("#field .slip[data-pid]").forEach(function (el) {
        var pid = el.getAttribute("data-pid"); if (!pid) return;
        var pos = el.getAttribute("data-pos");
        if (out[pos]) out[pos].push(pid);
        if (el.getAttribute("data-stamp") === "true") out.stamps.push(pid);
      });
      return out;
    },
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
