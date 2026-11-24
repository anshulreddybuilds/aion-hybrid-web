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
 * Honesty rules for this file:
 *   - every number on screen comes from one of those calls; if something was
 *     not measured it shows "—", never a made-up value;
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
  var NANO_TEXT = { checking: "checking", ready: "ready", downloadable: "needs download", downloading: "downloading", unavailable: "unavailable", unsupported: "not here" };

  var S = {
    step: "quote", c: null, prep: null, prepError: "", lastApproval: null,
    busy: "", result: null, lastSend: null, provisional: null, leak: null, drill: null,
    imageConfirm: false, visited: {},
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
  function setText(id, t) { var n = $(id); if (n) n.textContent = t == null ? "" : String(t); }
  function fmt(n) { return typeof n === "number" && isFinite(n) ? n.toLocaleString("en-US") : "—"; }
  function short(d) { return d ? String(d).slice(0, 12) : "—"; }
  function plural(n, one, many) { return n === 1 ? one : (many || one + "s"); }
  function words(t) { return String(t || "").split(/\s+/).filter(Boolean).map(function (w) { return Math.max(3, Math.min(22, Math.round(w.length * 1.6))); }); }
  function shareable(p) { return !!(p && p.shared) && !(p.injection && p.injection.flagged && !p.injectionOverride); }
  function say(msg) {
    var n = $("live");
    if (!n) return;
    n.textContent = "";
    setTimeout(function () { n.textContent = msg; }, 30);
  }

  /* ------------------------------------------------- dot-matrix numerals */
  /* 5x7 font, own design. Narrow glyphs for punctuation. */
  var GLYPH = {
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
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
    var svg = document.createElementNS(SVGNS, "svg");
    var x = 0;
    for (var i = 0; i < s.length; i++) {
      var g = GLYPH[s[i]] || GLYPH["-"];
      var w = g[0].length;
      for (var r = 0; r < 7; r++) for (var col = 0; col < w; col++) {
        var on = g[r][col] === "1";
        if (!on && w < 5) continue;
        var c = document.createElementNS(SVGNS, "circle");
        c.setAttribute("cx", String(x + col + 0.5)); c.setAttribute("cy", String(r + 0.5)); c.setAttribute("r", "0.38");
        c.setAttribute("class", on ? "on" : "off");
        svg.appendChild(c);
      }
      x += w + 1;
    }
    svg.setAttribute("viewBox", "0 0 " + Math.max(1, x - 1) + " 7");
    svg.setAttribute("aria-hidden", "true");
    el.replaceChildren(svg);
    el.setAttribute("aria-label", label || (s === "-" ? "not measured" : s));
    el.setAttribute("data-value", s);
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
    if (st.offlineDemo) return { tone: "grey", text: "unplugged", down: true };
    if (navigator.onLine === false) return { tone: "grey", text: "offline", down: true };
    if (!st.ready) return { tone: "grey", text: "not initialised", down: true };
    if (routeMode() === "only_on_device") return { tone: "grey", text: "off by route", down: true };
    var ls = S.lastSend;
    if (ls && !ls.ok && ls.kind && ls.kind !== "blocked") return { tone: "red", text: ls.kind.replace(/_/g, " "), down: ls.kind === "offline" || ls.kind === "app_check" };
    if (ls && ls.ok) return { tone: "amber", text: "answered · " + fmt(ls.latencyMs) + " ms", down: false };
    return { tone: "idle", text: "not tried yet", down: false };
  }

  /* --------------------------------------------------------- case flow */
  function prepare() {
    return api().prepareDisclosure(null).then(function (p) { S.prep = p; S.prepError = ""; }, function (e) {
      S.prep = null; S.prepError = String((e && e.message) || e);
    }).then(renderAll);
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

  function importText() {
    var t = $("quoteText").value;
    if (!t.trim()) { msg("Paste the quote text first.", "red"); return; }
    var q = rules().quoteFromText(t);
    if (!q.paragraphs.length) { msg("No passages could be read from that text.", "red"); return; }
    S.busy = "import";
    api().importQuote(q).then(function (c) {
      S.c = c; S.result = null; S.provisional = null; S.lastApproval = null;
      var flagged = c.paragraphs.filter(function (p) { return p.injection && p.injection.flagged; }).length;
      msg("Read on this device: " + c.paragraphs.length + " " + plural(c.paragraphs.length, "passage") + ", all private until you tick them." +
        (flagged ? " " + flagged + " " + plural(flagged, "passage looks", "passages look") + " like instructions and will be held back." : ""), "green");
      say("Quote read on this device. " + c.paragraphs.length + " passages, all private.");
      $("quoteText").value = "";
      return prepare();
    }, function (e) { msg("Could not save the quote: " + String((e && e.message) || e), "red"); })
      .then(function () { S.busy = ""; renderAll(); });
  }
  var IMAGE_HEADINGS = [["other", "Overview"], ["price", "Price and payment"], ["delivery", "Delivery"], ["scope", "Scope and exclusions"],
    ["warranty", "Warranty and support"], ["cancellation", "Cancellation"]];
  function importImage(file) {
    if (!file) return;
    var small = typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 8;
    if (small && !S.imageConfirm) {
      S.imageConfirm = true;
      msg("Reading an image with Gemini Nano kept an 8 GB laptop busy for over 90 seconds in our test. Choose the file again to go ahead.", "red");
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
        S.c = c; S.result = null; S.provisional = null;
        msg("Read by Gemini Nano on this device in " + (r.latencyMs / 1000).toFixed(1) + " s: " + c.paragraphs.length + " passages, all private.", "green");
        return prepare();
      });
    }, function (e) { msg(String((e && e.message) || e), "red"); }).then(function () { S.busy = ""; renderAll(); });
  }
  function msg(t, tone) { var n = $("quoteMsg"); n.textContent = t; n.setAttribute("data-tone", tone || ""); }

  function approve() {
    if (!S.prep || S.busy) return;
    S.busy = "approve";
    H().egress.approve(S.prep.disclosure, "user_click").then(function (d) {
      S.lastApproval = { rev: d.inputRevision, digest: d.contentDigest };
      say("Approved. Fingerprint " + short(d.contentDigest) + ", " + fmt(S.prep.bytes) + " characters.");
    }, function (e) { S.result = { error: String((e && e.message) || e), kind: "blocked" }; })
      .then(function () { S.busy = ""; renderAll(); });
  }
  function send() {
    if (!S.prep || S.busy || approval().key !== "approved" || cloudBlockedReason()) return;
    S.busy = "send"; renderAll();
    var rev = S.c.inputRevision;
    var seen = S.c.paragraphs.filter(shareable).length, total = S.c.paragraphs.length;
    flush().then(function () { return api().send(S.prep.disclosure); }).then(function (g) {
      S.result = { g: g, rev: rev, seen: seen, total: total };
      S.lastSend = { ok: true, latencyMs: g.latencyMs };
      say("The cloud answered. Plain code now checks its verdict.");
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
  function leak() {
    if (S.busy) return;
    S.busy = "leak"; renderAll();
    flush().then(function () { return api().leakTest(); }).then(function (r) {
      S.leak = r;
      var a = r.audit;
      say("Leak test " + (r.mode === "live" ? "live" : "dry run") + ": " + (a ? a.exact + " of " + a.planted : r.leaked + " of 6") + " seeded secrets found.");
    }, function (e) { S.leak = { error: String((e && e.message) || e) }; })
      .then(function () { S.busy = ""; renderAll(); });
  }
  function drill() {
    if (S.busy) return;
    S.busy = "drill"; renderAll();
    flush().then(function () { return api().hostileDrill(); }).then(function (d) {
      S.drill = d;
      var n = d.results.filter(function (r) { return r.blocked; }).length;
      say("Drill: " + n + " of " + d.results.length + " hostile replies blocked.");
    }, function (e) { S.drill = { error: String((e && e.message) || e) }; })
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
      /* Back to the top: the instrument and the new step's heading are both in view there. */
      if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: document.body.getAttribute("data-motion") === "full" ? "smooth" : "auto" });
      if (hd) hd.focus({ preventScroll: true });
    }
  }

  /* --------------------------------------------------------- rendering */
  function renderAll() {
    if (!S.c) return;
    renderStatus();
    renderInstrument();
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
    nano.title = st.nanoDetail || "";
    var cs = cloudStatus();
    $("stCloud").setAttribute("data-tone", cs.tone);
    setText("stCloudV", cs.text);
    var m = routeMode();
    $("stRoute").setAttribute("data-tone", m === "only_on_device" ? "green" : "amber");
    setText("stRouteV", MODE_CONST[m] || m);
  }

  function heldChars(c) {
    var pc = c.privateConstraints || {};
    var n = c.paragraphs.filter(function (p) { return !shareable(p); }).reduce(function (a, p) { return a + String(p.text || "").length; }, 0);
    [pc.maxBudget, pc.readyBy, pc.confidentialNote].forEach(function (v) { n += String(v || "").length; });
    return n;
  }
  function renderInstrument() {
    var c = S.c, pc = c.privateConstraints || {};
    var held = heldChars(c);
    var a = approval();
    var cs = cloudStatus();
    var blocked = !!cloudBlockedReason();
    dm($("heldNum"), fmt(held), fmt(held) + " characters held on this device");
    var heldP = c.paragraphs.filter(function (p) { return !shareable(p); }).length;
    setText("heldUnit", "characters held here: " + heldP + " " + plural(heldP, "passage") + " not shared, plus your private requirements");
    var inst = $("instrument");
    inst.setAttribute("data-cloud", cs.down || blocked ? "down" : "up");
    var phase = a.key === "sent" ? "sent" : a.key === "approved" ? "approved" : "draft";
    inst.setAttribute("data-phase", phase);
    if (S.prep) {
      dm($("crossNum"), fmt(S.prep.bytes), fmt(S.prep.bytes) + " characters in the disclosure");
      setText("crossUnit", "characters in the disclosure · " + (phase === "sent" ? "crossed" : phase === "approved" ? "approved, not sent" : "not approved"));
      setText("crossShort", phase === "sent" ? "chars crossed" : "chars to cross");
    } else {
      dm($("crossNum"), "—", "not measured");
      setText("crossUnit", S.prepError ? "the disclosure could not be prepared" : "characters in the disclosure");
    }
    setText("cloudWord", cs.down || blocked ? "Cloud " + (HS().offlineDemo ? "unplugged" : cs.down ? cs.text : "off by route") + " · nothing crosses" : "");
    var heldWords = [];
    c.paragraphs.forEach(function (p) { if (!shareable(p)) heldWords = heldWords.concat(words(p.text)); });
    [pc.maxBudget, pc.readyBy, pc.confidentialNote].forEach(function (v) { heldWords = heldWords.concat(words(v)); });
    var sentWords = S.prep ? words(S.prep.text) : [];
    var total = heldWords.length + sentWords.length;
    var shown = Math.min(total, (window.AionSlab && window.AionSlab.MAX) || 200);
    setText("scaleNote", "Each mark is one word: green stays here, amber is the exact disclosure text" +
      (total > shown ? " (" + shown + " of " + fmt(total) + " words drawn)." : "."));
    if (window.AionSlab) window.AionSlab.set({ held: heldWords, shared: sentWords, phase: phase, cloudDown: cs.down || blocked });
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
    var box = $("caseNow");
    var flagged = c.paragraphs.filter(function (p) { return p.injection && p.injection.flagged; }).length;
    box.replaceChildren(
      h("div", null,
        h("p", { class: "k", text: c.sample ? "Current case · sample (fictional)" : "Current case · imported " + (c.importedBy || "text") }),
        h("p", { class: "title", text: c.supplier || "Supplier" }),
        h("p", { class: "sub", text: c.title || "" })),
      h("p", { class: "meta", text: c.paragraphs.length + " " + plural(c.paragraphs.length, "passage") + " · revision " + c.inputRevision +
        (flagged ? " · " + flagged + " flagged" : "") }));
    ["importBtn", "sampleBtn"].forEach(function (id) { $(id).disabled = !!S.busy; });
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
    var stays = [], leaves = [], sc = 0, lc = 0;
    c.paragraphs.forEach(function (p) {
      var li = passageItem(p, open[p.id]);
      if (shareable(p)) { leaves.push(li); lc += String(p.text || "").length; } else { stays.push(li); sc += String(p.text || "").length; }
    });
    $("staysList").replaceChildren.apply($("staysList"), stays.length ? stays : [h("li", { class: "empty", text: "Nothing is held back. Every passage is ticked to leave." })]);
    $("leavesList").replaceChildren.apply($("leavesList"), leaves.length ? leaves : [h("li", { class: "empty", text: "Nothing is ticked yet, so the cloud would see no passage of the quote." })]);
    setText("staysCount", stays.length + " " + plural(stays.length, "passage") + " · " + fmt(sc) + " chars");
    setText("leavesCount", leaves.length + " " + plural(leaves.length, "passage") + " · " + fmt(lc) + " chars");
    var pc = c.privateConstraints || {};
    var pchars = [pc.maxBudget, pc.readyBy, pc.confidentialNote].reduce(function (a, v) { return a + String(v || "").length; }, 0);
    setText("privateFixed", "Also stays: maximum budget, ready-by deadline, installation rule (" + (pc.installationRequired ? "required" : "not required") +
      ") and the confidential note, " + fmt(pchars) + " characters. A disclosure has no field for them.");
    ["pvBudget", "pvReady", "pvGst", "pvNote"].forEach(function (id) {
      var n = $(id), k = n.getAttribute("data-pv");
      if (document.activeElement !== n) n.value = pc[k] == null ? "" : String(pc[k]);
    });
    $("pvInstall").checked = !!pc.installationRequired;
    var inc = S.prep ? S.prep.included : null;
    setText("publicFixed", inc ? "Also leaves: " + inc.sources.length + " public " + plural(inc.sources.length, "source") +
      (c.sample ? " (bundled sample sources, not a web search)" : "") + ", " + inc.requirements + " stated " + plural(inc.requirements, "requirement") + " and the question." : "—");
    var line = $("sizeLine");
    if (S.prep) {
      var hits = S.prep.privateHits || [];
      line.replaceChildren("Exact disclosure text: ", h("b", { text: fmt(S.prep.bytes) + " characters" }),
        " (instructions, question, shared passages, sources and requirements; counted as JavaScript characters, not bytes). Private-value scan of that text: ",
        h("b", { text: hits.length ? "FOUND " + hits.map(function (x) { return x.kind.replace(/_/g, " "); }).join(", ") : "none found" }), ".");
    } else line.textContent = S.prepError ? "The disclosure could not be prepared: " + S.prepError : "Preparing the disclosure…";
    restoreFocus(focus);
  }
  function passageItem(p, isOpen) {
    var flagged = !!(p.injection && p.injection.flagged);
    var len = String(p.text || "").length;
    var li = h("li", { class: "psg", "data-pid": p.id, "data-flagged": flagged ? "true" : "false" });
    var cb = h("input", { type: "checkbox", "data-share": p.id, id: "share-" + p.id, checked: !!p.shared });
    cb.addEventListener("change", function () {
      var on = cb.checked;
      queueEdit(function (c) { c.paragraphs.forEach(function (x) { if (x.id === p.id) x.shared = on; }); }, 60);
      say(p.id + (on ? " ticked to leave" : " kept on this device") + ".");
    });
    li.appendChild(h("label", { class: "tick", for: "share-" + p.id }, cb, h("span", { class: "pid", text: p.id }), h("span", { class: "ph", text: p.heading || "Passage" }),
      h("span", { class: "chars", text: fmt(len) + " chars" })));
    if (flagged) {
      if (p.shared && !p.injectionOverride) li.appendChild(h("span", { class: "held-note", text: "Ticked, but held back: see the flag below." }));
      var ov = h("input", { type: "checkbox", "data-over": p.id, id: "over-" + p.id, checked: !!p.injectionOverride });
      ov.addEventListener("change", function () {
        var on = ov.checked;
        queueEdit(function (c) { c.paragraphs.forEach(function (x) { if (x.id === p.id && x.injection) x.injectionOverride = on; }); }, 60);
      });
      li.appendChild(h("div", { class: "flag", role: "note" },
        h("span", { text: "Looks like instructions or hidden characters. Held back from the cloud even if ticked" + (p.injectionOverride ? "; you allowed it, so it leaves if ticked." : ".") }),
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
    det.appendChild(h("summary", { text: "Read or edit " + p.id }));
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
      ? (st.offlineDemo ? "Forced by the pulled plug. " : "") + "Nothing on this page goes to the cloud; the case is not sent. Step 04 can still give a provisional verdict made on this device."
      : "This route may reach the cloud. A case send always runs ONLY_IN_CLOUD with the approved disclosure, so it never silently falls back to the device.");
    document.querySelectorAll('#routeSet input[name="route"]').forEach(function (r) { r.checked = r.value === m; r.disabled = !!st.offlineDemo; });
    $("plug").checked = !!st.offlineDemo;
    setText("plugSub", st.offlineDemo
      ? "On. The page blocks every outside request; only on-device Gemini Nano can answer. Turn on airplane mode as well to prove it."
      : "Off. Turn it on to block every outside request from this page (Offline Demo Mode).");
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
    var whyEl = $("gateWhy");
    if (!whyEl) { whyEl = h("p", { class: "sub", id: "gateWhy" }); $("gateCard").insertBefore(whyEl, $("gateCard").querySelector("details")); }
    whyEl.textContent = hits.length ? "The private-value scan found registered private values in this text, so it cannot be approved." :
      why ? why + (a.key === "approved" ? " The approval stays valid for when you plug back in." : "") :
      a.key === "draft" ? "Approve first. The Send button stays off until this exact text is approved." :
      a.key === "stale" ? "The case changed after you approved. Read the new text and approve again." : "";
    var line = $("engineLine"), r = S.result;
    line.removeAttribute("data-tone");
    if (S.busy === "send") line.textContent = "Sending the approved disclosure…";
    else if (r && r.g) {
      var g = r.g;
      line.textContent = "Ran " + (g.actual_source === "in_cloud" ? "in the cloud" : "on this device") + " · " + (g.model || "model not reported") + " · " + fmt(g.latencyMs) + " ms · " +
        (g.source_verified ? "reported by the SDK (inferenceSource: " + g.actual_source + ")" : "inferred: the SDK did not report inferenceSource") +
        (g.disclosure ? " · " + fmt(g.disclosure.bytes) + " characters sent" : "");
    } else if (r && r.error) {
      line.setAttribute("data-tone", "red");
      line.textContent = (r.kindText ? r.kindText + " (" + r.kind + ") " : "") + String(r.error).split("\n")[0].slice(0, 300);
    } else line.textContent = "Nothing sent yet. Engine: —";
  }

  /* 04 */
  function renderVerdict() {
    var R = rules(), c = S.c;
    var local = R.reconcile(c);
    $("finalCard").setAttribute("data-verdict", local.verdict);
    setText("finalV", VERDICT_TEXT[local.verdict] || local.verdict);
    var hid = (local.privatePassagesUsed || []).slice().sort();
    setText("finalSub", "Plain code in this browser read all " + c.paragraphs.length + " passages and your private requirements" +
      (hid.length ? ", including " + hid.join(", ") + ", which the cloud never saw." : "."));
    $("checksList").replaceChildren.apply($("checksList"), local.checks.map(function (k) {
      return h("li", { "data-s": k.status, "data-check": k.id }, h("span", { class: "cl", text: k.label }), h("span", { class: "cs", text: STATUS_TEXT[k.status] || k.status }),
        h("span", { class: "cd", text: k.detail + (k.assumption ? " (" + k.assumption.replace(/ \(change it in Private requirements\)/, "; change it in step 02") + ")" : "") }));
    }));
    var r = S.result, cl = $("cloudLine"), cv = null;
    if (r && r.g) {
      cv = R.cloudVerdict(r.g.text);
      var cmp = R.compareVerdicts(cv, local.verdict);
      var dir = { stricter: "The final decision is stricter than the cloud's.", looser: "The final decision is looser than the cloud's.", same: "The final decision matches the cloud's level." }[cmp.direction] || "";
      cl.replaceChildren("Cloud said: ", h("b", { text: cv ? CLOUD_TEXT[cv] : "no valid VERDICT line" }),
        cv ? " (its \"VERDICT:\" line, read by plain code). " : " so the cloud's view counts as none. ",
        "It saw " + r.seen + " of " + r.total + " passages and none of your private requirements. " + dir +
        (r.rev !== c.inputRevision ? " This reply was for revision " + r.rev + "; the case is now at revision " + c.inputRevision + "." : ""));
      $("replyDetails").hidden = false;
      setText("replyText", r.g.text);
    } else if (r && r.error) {
      cl.textContent = "The cloud request failed: " + (r.kindText || "error") + " (" + r.kind + "). You can still get a provisional verdict on this device below.";
      $("replyDetails").hidden = true;
    } else {
      cl.textContent = "No cloud reply yet. Send in step 03, or get a provisional verdict on this device below.";
      $("replyDetails").hidden = true;
    }
    var v = S.provisional, sl = $("secondLine"), ag = $("agreeLine");
    $("provBtn").disabled = !!S.busy;
    $("provBtn").textContent = S.busy === "prov" ? "Working on this device…" : v ? "Ask again" : "Get a provisional verdict here";
    ag.setAttribute("data-state", "");
    ag.textContent = "";
    if (v && v.error) sl.textContent = "Could not make a provisional verdict here: " + v.error;
    else if (v) {
      sl.replaceChildren("Provisional, made on this device by ", h("b", { text: v.engine }), ": ",
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
  function renderProof() {
    var c = S.c, R = rules(), Bd = B();
    var L = S.leak, lu = $("leakUnit");
    $("leakBtn").disabled = !!S.busy;
    $("leakBtn").textContent = S.busy === "leak" ? "Running…" : L ? "Run again" : "Run the leak test";
    if (L && L.error) { dm($("leakNum"), "—", "failed"); lu.textContent = "The leak test failed: " + L.error; }
    else if (L) {
      var a = L.audit;
      var found = a ? a.exact : L.leaked, planted = a ? a.planted : L.results.length;
      dm($("leakNum"), found + "/" + planted, found + " of " + planted + " seeded secrets found");
      lu.textContent = (L.mode === "live" ? "LIVE · " : "DRY RUN · ") + found + " of " + planted + " seeded secrets found verbatim in " + L.inspected + " " +
        (L.mode === "live" ? plural(L.inspected, "request") + " this page really sent (" + fmt(L.bytes) + " characters, read from fetch)."
          : "prepared request " + plural(L.inspected, "text") + " (the cloud was not reachable, so nothing was sent).") +
        (a ? " Partial hints: " + a.partial + "." : "") + " Control: " + L.controlPresent + " of " + planted + " present in the local data. These secrets in these requests only.";
    } else { dm($("leakNum"), "—", "not run yet"); lu.textContent = "seeded secrets found in what left. Not run yet."; }

    var D = S.drill, du = $("drillUnit");
    $("drillBtn").disabled = !!S.busy;
    $("drillBtn").textContent = S.busy === "drill" ? "Running…" : D ? "Run again" : "Run the drill";
    if (D && D.error) { dm($("drillNum"), "—", "failed"); du.textContent = "The drill failed: " + D.error; }
    else if (D) {
      var nb = D.results.filter(function (x) { return x.blocked; }).length;
      dm($("drillNum"), nb + "/" + D.results.length, nb + " of " + D.results.length + " hostile replies blocked");
      du.textContent = (D.allBlocked ? "All hostile replies blocked. " : "NOT all blocked: see the lines below. ") + "The final verdict stayed \"" +
        (VERDICT_TEXT[D.localFinal] || D.localFinal) + "\". " + D.label.charAt(0).toUpperCase() + D.label.slice(1) + ".";
    } else { dm($("drillNum"), "—", "not run yet"); du.textContent = "hostile replies blocked. Not run yet."; }

    var local = R.reconcile(c);
    var cv = S.result && S.result.g ? R.cloudVerdict(S.result.g.text) : null;
    var G = Bd.gauges({ leak: L && L.audit ? L.audit : null, caseObj: c, cloudVerdict: cv, localVerdict: local.verdict });
    $("gaugeFill").style.width = Math.round(G.useful.sharedFraction * 100) + "%";
    $("gaugeTile").setAttribute("data-gamed", G.gamed ? "true" : "false");
    setText("gaugeUnit", "Shared " + G.useful.sharedPassages + " of " + G.useful.totalPassages + " passages (" + Math.round(G.useful.sharedFraction * 100) + "%). " +
      (G.leak.score === null ? "Leak score: — (run the leak test). " : G.gamed ? "GAMED: almost nothing was shared, so a clean leak score proves little. " : "Leak score " + G.leak.score + " with real sharing. ") +
      "The red tick is the 15% heuristic line." + (cv ? " Cloud direction: " + G.useful.cloudDirection + "." : ""));
    var m = Bd.meter.snapshot();
    setText("meterUnit", "Sent this session: " + m.sends + " " + plural(m.sends, "send") + ", " + fmt(m.charsSent) + " characters, " + m.passagesShared + " distinct " +
      plural(m.passagesShared, "passage") + "." + (m.combinationWarning ? " " + m.combinationWarning.message : ""));

    var counts = H().egress.privateCounts(), priv = 0;
    Object.keys(counts).forEach(function (k) { priv += counts[k]; });
    var flagged = c.paragraphs.filter(function (p) { return p.injection && p.injection.flagged; }).length;
    var why = cloudBlockedReason();
    var lit = { private: priv > 0, untrusted: c.paragraphs.length > 0, external: m.sends > 0 };
    setText("lampPrivate", priv ? fmt(priv) + " private values registered" : "none registered");
    setText("lampUntrusted", c.paragraphs.length + " supplier " + plural(c.paragraphs.length, "passage") + (flagged ? " · " + flagged + " flagged" : ""));
    setText("lampExternal", m.sends ? m.sends + " " + plural(m.sends, "send") + " this session" : why ? "blocked now" : "possible, none yet");
    document.querySelectorAll("#lamps li").forEach(function (li) { li.setAttribute("data-lit", lit[li.getAttribute("data-lamp")] ? "true" : "false"); });
    var all = lit.private && lit.untrusted && lit.external;
    $("trifectaTile").setAttribute("data-all", all ? "true" : "false");
    setText("trifectaNote", all
      ? "All three are present. The border's answer: private requirements have no disclosure field, flagged passages are held, and nothing leaves without your approval of the exact text."
      : "A lit lamp means it is present right now. All three together is the risky case for prompt injection.");

    var rc = H().telemetry.getReceipts();
    var caseR = rc.filter(function (x) { return x.route === "cloud-case-research"; }).length;
    setText("receiptLine", rc.length + " " + plural(rc.length, "receipt") + " recorded this session (" + caseR + " for case sends). Open Show the work to read each one.");
    var lines = [];
    if (L && !L.error) {
      lines.push("LEAK TEST (" + L.mode + ", " + L.at + ")");
      L.results.forEach(function (x) { lines.push("  " + (x.found ? "LEAKED   " : "not found ") + x.where + ": " + x.canary + " · in local data: " + (x.presentLocally ? "yes" : "NO") + " · found in " + x.found + " of " + L.inspected); });
      if (L.audit) L.audit.hits.forEach(function (x) { lines.push("  hint: " + x.secretId + " " + x.kind + " in " + x.where); });
      lines.push("  " + (L.audit ? L.audit.measures : "") + "");
    }
    if (D && !D.error) {
      lines.push("HOSTILE-CLOUD DRILL (" + D.label + ")");
      D.results.forEach(function (x) { lines.push("  " + (x.blocked ? "BLOCKED  " : x.finalChangedByCloud ? "CHANGED  " : "no attempt ") + x.replyId + " · claimed " + (x.cloudClaimed || "no verdict") + " · final " + x.localFinal + (x.ruleViolationsAttempted.length ? " · attempted: " + x.ruleViolationsAttempted.join(", ") : "")); });
    }
    setText("proofText", lines.length ? lines.join("\n") : "Run the leak test or the drill to see each line here.");
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

  /* ------------------------------------------------------------ wiring */
  function wire() {
    document.querySelectorAll("[data-go]").forEach(function (b) {
      b.addEventListener("click", function () { go(b.getAttribute("data-go"), { focus: true }); });
    });
    window.addEventListener("hashchange", function () { var s = location.hash.slice(1); if (STEPS.indexOf(s) >= 0 && s !== S.step) go(s, { focus: true }); });
    $("importBtn").addEventListener("click", function () { if (!S.busy) importText(); });
    $("sampleBtn").addEventListener("click", function () {
      if (S.busy) return;
      clearTimeout(timer); pending = [];
      if (S.prep && H().egress.isApproved(S.prep.disclosure)) S.lastApproval = { rev: S.prep.disclosure.inputRevision, digest: S.prep.disclosure.contentDigest };
      api().reset().then(function (c) { S.c = c; S.result = null; S.provisional = null; msg("The sample case is loaded (fictional supplier and buyer).", "green"); say("Sample case loaded."); return prepare(); });
    });
    $("imageInput").addEventListener("change", function (ev) { var f = ev.target.files && ev.target.files[0]; ev.target.value = ""; if (f && !S.busy) importImage(f); });
    $("approveBtn").addEventListener("click", approve);
    $("sendBtn").addEventListener("click", send);
    $("prepBtn").addEventListener("click", function () { S.lastApproval = null; prepare().then(function () { say("A new disclosure is ready to approve."); }); });
    $("plug").addEventListener("change", function (e) {
      H().setOfflineDemo(e.target.checked);
      say(e.target.checked ? "Plug pulled. Nothing can leave this page; the cloud side is grey." : "Plug back in. The cloud can be reached again after approval.");
      renderAll();
    });
    document.querySelectorAll('#routeSet input[name="route"]').forEach(function (r) {
      r.addEventListener("change", function () { if (r.checked) { H().setMode(r.value); say("Route set to " + MODE_CONST[r.value] + "."); renderAll(); } });
    });
    document.querySelectorAll("[data-pv]").forEach(function (n) {
      var k = n.getAttribute("data-pv");
      n.addEventListener(n.type === "checkbox" ? "change" : "input", function () {
        var v = n.type === "checkbox" ? n.checked : n.value;
        queueEdit(function (c) { c.privateConstraints = c.privateConstraints || {}; c.privateConstraints[k] = v; }, n.type === "checkbox" ? 60 : 450);
      });
    });
    $("provBtn").addEventListener("click", provisional);
    $("leakBtn").addEventListener("click", leak);
    $("drillBtn").addEventListener("click", drill);
    var dlg = $("work");
    $("workBtn").addEventListener("click", function () { renderWork(); if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", ""); });
    $("workClose").addEventListener("click", function () { dlg.close ? dlg.close() : dlg.removeAttribute("open"); });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
    window.addEventListener("aion:receipt", function () { if (S.step === "proof") renderProof(); if (dlg.open) renderWork(); });
    window.addEventListener("online", renderAll);
    window.addEventListener("offline", renderAll);
    /* Nano readiness and App Check change on their own: refresh the status line. */
    setInterval(function () { if (S.c) { renderStatus(); renderInstrument(); } }, 1500);
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
    if (window.AionSlab) window.AionSlab.mount({ canvas: $("field"), instrument: $("instrument"), slab: $("slab") });
    dm($("heldNum"), "—", "not measured yet"); dm($("crossNum"), "—", "not measured yet");
    dm($("leakNum"), "—", "not run yet"); dm($("drillNum"), "—", "not run yet");
    wire();
    var first = location.hash.slice(1);
    ready().then(function () { return api().load(); }).then(function (c) {
      S.c = c;
      document.body.setAttribute("data-ready", "true");
      go(STEPS.indexOf(first) >= 0 ? first : "quote");
      return prepare();
    }).catch(function (e) {
      var box = $("caseNow");
      box.replaceChildren(h("p", { class: "k", text: "Could not start" }), h("p", { class: "sub", text: String((e && e.message) || e) }));
    });
  }

  window.AionStage = { state: S, go: go, flush: flush, render: renderAll, dm: dm };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
