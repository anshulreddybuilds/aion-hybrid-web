/* Ghost-Math page. Apache-2.0. Created by Anshul Reddy for #BuildHybridAI 2026.
 * UI only: all maths, scaling and sending live in the bundle (src/ghostMath.js,
 * src/hybrid.js). Every value from the input or a model is shown with
 * textContent, never as HTML. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var H = null;
  var prepared = null;
  var pct = function (x) { return x == null || !isFinite(x) ? "-" : Math.round(x * 100) + "%"; };
  var CAT = { rent: "Rent", emi: "EMI / loans", groceries: "Groceries", food: "Food & delivery", transport: "Transport", bills: "Bills",
    subscriptions: "Subscriptions", shopping: "Shopping", health: "Health", insurance: "Insurance", education: "Education",
    transfers: "To people", other: "Other", income: "Income", savings: "Saved / invested" };

  function el(tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function show(id, on) { $(id).hidden = !on; }
  function msg(id, text, bad) { var m = $(id); m.textContent = text || ""; m.hidden = !text; m.className = "msg" + (bad ? " bad" : ""); }

  function status() {
    var s = H.state;
    var ac = $("gAppCheck");
    ac.textContent = "App Check: " + (s.appCheck.status === "recaptcha" ? "on (reCAPTCHA)" : s.appCheck.status);
    ac.className = "pill " + (s.appCheck.status === "recaptcha" ? "ok" : s.appCheck.status === "debug" ? "warn" : "bad");
    ac.title = s.appCheck.detail || "";
    var n = $("gNano");
    var label = { ready: "ready", downloadable: "needs download", downloading: "downloading", checking: "checking…", unavailable: "unavailable", unsupported: "not on this browser" }[s.nano] || s.nano;
    n.textContent = "Gemini Nano: " + label;
    n.className = "pill " + (s.nano === "ready" ? "ok" : s.nano === "checking" || s.nano === "downloading" || s.nano === "downloadable" ? "warn" : "bad");
    n.title = s.nanoDetail || "";
    sendLabel();
  }

  /* The button says honestly where the fake numbers will go. */
  function willRunOnDevice() {
    var r = $("gRoute").value;
    return r === "only_on_device" || (r === "prefer_on_device" && H.state.nano === "ready");
  }
  function sendLabel() {
    var b = $("ghostSendBtn");
    if (!b) return;
    var dev = willRunOnDevice();
    b.textContent = dev ? "Ask Gemini Nano on this device (fake numbers)" : "Send fake numbers to cloud Gemini";
    b.classList.toggle("device", dev);
    var r = $("gRoute").value;
    $("gSendHint").textContent = r === "only_on_device" && H.state.nano !== "ready"
      ? "Gemini Nano is not ready here, so this route cannot answer. The rules above still stand."
      : dev ? "Nothing leaves this device on this route." : "Only the right-hand column leaves, through App Check.";
    b.disabled = !prepared || !prepared.count || (r === "only_on_device" && H.state.nano !== "ready");
  }

  function renderLocal(p) {
    var s = p.summary;
    $("kSpend").textContent = H.ghost.rupees(s.spend);
    $("kSpendS").textContent = s.income ? "of " + H.ghost.rupees(s.income) + " income" + (s.invested ? " · " + H.ghost.rupees(s.invested) + " invested" : "") : "no income found";
    $("kRent").textContent = pct(s.rentEmiShare);
    $("kRentS").textContent = H.ghost.rupees(s.rentEmi) + " of " + s.rentEmiBase;
    $("kSave").textContent = s.savingsRate == null ? "-" : pct(s.savingsRate);
    $("kSaveS").textContent = s.savingsRate == null ? "needs an income line" : "kept " + H.ghost.rupees(s.income - s.spend);
    var bars = $("gBars"); clear(bars);
    var max = s.breakdown.length ? s.breakdown[0].amount : 1;
    s.breakdown.forEach(function (b) {
      var row = el("div", null, "bar");
      row.appendChild(el("span", CAT[b.category] || b.category));
      var tr = el("span", null, "track"); var f = el("span", null, "fill"); f.style.display = "block"; f.style.width = Math.max(2, Math.round(b.amount / max * 100)) + "%";
      tr.appendChild(f); row.appendChild(tr);
      row.appendChild(el("span", H.ghost.rupees(b.amount), "amt"));
      bars.appendChild(row);
    });
    var tips = $("gLocalTips"); clear(tips);
    p.localTips.forEach(function (t) { tips.appendChild(el("li", t.text)); });
  }

  function renderReceipt(p) {
    var real = $("gReal"), sent = $("gSent"); clear(real); clear(sent);
    p.rows.forEach(function (r) {
      var a = el("tr"); [r.id, r.party || "(no name)", CAT[r.category] || r.category].forEach(function (t) { a.appendChild(el("td", t)); });
      a.appendChild(el("td", (r.direction === "credit" ? "+" : "") + H.ghost.rupees(r.real), "num")); real.appendChild(a);
      var b = el("tr"); [r.id, r.standIn, r.category].forEach(function (t) { b.appendChild(el("td", t)); });
      b.appendChild(el("td", (r.direction === "credit" ? "+" : "") + String(r.sent), "num")); sent.appendChild(b);
    });
    var facts = $("gFacts"); clear(facts);
    [
      p.count + " entries read on this device" + (p.skipped.length ? "; " + p.skipped.length + " line(s) not understood and left out" : "") + ".",
      "Real names checked in the outgoing text: " + p.leak.namesChecked + " · found: " + p.leak.nameHits.length + " (private-name scanner: " + p.scannerHits + ").",
      "Not sent: SMS wording, account and card numbers, UPI references, dates, balances.",
      "Sent: " + p.outgoingChars + " characters — stand-ins, categories and scaled numbers.",
    ].forEach(function (t) { facts.appendChild(el("li", t)); });
    $("gOut").textContent = p.outgoing;
  }

  async function read() {
    msg("gReadMsg", "");
    show("gAnswer", false);
    var text = $("gInput").value;
    if (!text.trim()) { msg("gReadMsg", "Paste some SMS alerts or a budget first, or use a sample."); return; }
    try {
      prepared = await H.ghost.prepare(text);
    } catch (e) { prepared = null; msg("gReadMsg", "Could not read that: " + e.message, true); return; }
    if (!prepared.count) { msg("gReadMsg", "No amounts found. Lines need a rupee amount, e.g. “Rent: 22,000” or a bank SMS."); show("gLocal", false); show("gReceiptStep", false); sendLabel(); return; }
    if (prepared.skipped.length) msg("gReadMsg", prepared.skipped.length + " line(s) had no amount we could read and were left out.");
    renderLocal(prepared); renderReceipt(prepared);
    show("gLocal", true); show("gReceiptStep", true); msg("gSendMsg", "");
    sendLabel();
  }

  async function send(event) {
    var b = $("ghostSendBtn");
    msg("gSendMsg", "");
    b.disabled = true;
    var before = b.textContent; b.textContent = "Working…";
    try {
      var r = await H.ghost.sendFromClick(event, $("gRoute").value);
      renderAnswer(r);
    } catch (e) {
      var kept = e && e.approvalKept ? " Your approval is kept; press the button to try again." : "";
      msg("gSendMsg", "No model answer: " + String(e && e.message || e).split("\n")[0] + kept + " The rules' figures above are complete without it.", true);
    } finally { b.textContent = before; sendLabel(); }
  }

  function renderAnswer(r) {
    var who = $("gWho");
    var cloud = r.source === "in_cloud";
    who.className = "answered " + (cloud ? "cloud" : "device");
    who.textContent = (cloud ? "Answered by cloud Gemini (" + r.model + ")" : "Answered by Gemini Nano on this device") +
      (r.sourceVerified ? "" : " (reported by route, not by the SDK)") + " · " + (r.latencyMs / 1000).toFixed(1) + " s" +
      (cloud ? " · request body observed: " + (r.evidence.bodyObserved ? r.evidence.observedChars + " characters" : "no") +
        " · real names in it: " + r.evidence.nameHits + " of " + r.evidence.namesChecked + " checked" : " · nothing was sent");
    if (!r.ok) { msg("gSendMsg", "The model answered but not in the JSON shape asked for, so nothing was restored. The rules' figures above stand.", true); show("gAnswer", true); return; }
    var x = r.restored;
    $("aSpend").textContent = H.ghost.rupees(x.spend);
    $("aRent").textContent = pct(x.rentEmiShare);
    $("aSave").textContent = pct(x.savingsRate);
    var tips = $("aTips"); clear(tips);
    x.tips.forEach(function (t) {
      var li = el("li", t.text);
      if (t.from === "rules") li.appendChild(el("span", " (from the rules on this device)", "src"));
      tips.appendChild(li);
    });
    if (!x.tips.length) tips.appendChild(el("li", "(No tips came back.)"));
    if (x.tipsDropped) tips.appendChild(el("li", x.tipsDropped + " model tip(s) left out: they stated a figure without saying what to do.", "src"));
    var a = r.agreement || {};
    var mark = function (k) { return a[k] ? "agrees" : "differs"; };
    $("aAgree").textContent = "Checked against the rules (within " + Math.round((H.ghost.wobble + 0.02) * 100) + "%): spend " + mark("spend") +
      " · income " + mark("income") + " · rent+EMI share " + mark("rentEmiShare") + " · savings rate " + mark("savingsRate") +
      ". Where they differ, trust step 02.";
    show("gAnswer", true);
    $("gAnswer").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }

  function start(api) {
    H = api;
    var r = H.getMode();
    $("gRoute").value = r === "prefer_in_cloud" || r === "only_on_device" ? r : "prefer_on_device";
    $("gRoute").addEventListener("change", function () { H.setMode($("gRoute").value); sendLabel(); });
    $("gSampleSms").addEventListener("click", function () { $("gInput").value = H.ghost.samples.sms; read(); });
    $("gSampleBudget").addEventListener("click", function () { $("gInput").value = H.ghost.samples.budget; read(); });
    $("gRead").addEventListener("click", read);
    $("ghostSendBtn").addEventListener("click", send);
    status();
    setInterval(status, 2000);
  }

  if (window.AionHybrid) start(window.AionHybrid);
  else window.AionHybridReady.then(start);
})();
