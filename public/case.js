/* AION Hybrid Web - Case view (hybrid-v2, Packet 2).
 *
 * The private case workspace and its disclosure boundary:
 *   - every paragraph of the supplier proposal has an id (P1, P2 ...) and a
 *     "share with cloud" switch; private constraints have no switch at all;
 *   - "What the cloud will see" is the exact text, built from allowlisted
 *     fields, with its SHA-256 fingerprint;
 *   - Approve binds to that fingerprint and case revision; any edit, even one
 *     character, makes the approval stale; each approval is good for ONE send;
 *   - the 6-canary leak test plants fake secrets and searches what left.
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
    return api().update(function (c) { muts.forEach(function (m) { m(c); }); }).then(function (c) {
      st.c = c;
      renderRevision();
      return prepare();
    });
  }
  function markDirty() {
    var chip = el("caseApprovalChip");
    if (chip) { chip.className = "case-chip is-stale"; chip.textContent = "Changed — saving and rebuilding the disclosure…"; }
    ["caseApproveBtn", "caseSendBtn"].forEach(function (id) { var b = el(id); if (b) b.disabled = true; });
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
        '<div class="card-sub">Buyer: ' + esc(c.buyer) + ' · Supplier: ' + esc(c.supplier) +
        ' · Sample case — every name and number is fictional. Stored only in this browser.</div>' +
        '<div class="case-actions"><button type="button" class="pill hy-btn" id="caseResetBtn">RESET SAMPLE CASE</button></div>' +
      '</section>' +
      '<section class="card case-card">' +
        '<div class="card-title">Supplier proposal</div>' +
        '<div class="card-sub">Private by default. Tick "share with cloud" only for passages the cloud may read.</div>' +
        paras +
      '</section>' +
      '<section class="card case-card">' +
        '<div class="card-title">Private requirements</div>' +
        '<div class="card-sub">Never sent. There is no field for these in any disclosure; they are for the local review.</div>' +
        '<label class="case-field"><span>Maximum budget</span><input type="text" id="caseBudget" value="' + esc(pc.maxBudget) + '"></label>' +
        '<label class="case-field"><span>Must be working by</span><input type="text" id="caseReadyBy" value="' + esc(pc.readyBy) + '"></label>' +
        '<label class="case-field case-check"><input type="checkbox" id="caseInstall"' + (pc.installationRequired ? " checked" : "") +
          '><span>Installation and setup must be included</span></label>' +
        '<label class="case-field"><span>Confidential note</span><textarea class="case-ta" rows="3" id="caseNote">' + esc(pc.confidentialNote) + '</textarea></label>' +
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
        '</div>' +
        '<div id="caseResult"></div>' +
      '</section>' +
      '<section class="card wide case-card">' +
        '<div class="card-head"><div class="card-title">Leak test — 6 canaries</div>' +
        '<button type="button" class="pill hy-btn" id="caseLeakBtn">RUN LEAK TEST</button></div>' +
        '<div class="card-sub">Plants six unique fake secrets (task title, private note, on-screen chat history, an unshared case passage, ' +
        'a reply with a real name restored, a private constraint), runs two chat turns and one case request through the normal paths, ' +
        'then searches what left. Everything planted is removed afterwards.</div>' +
        '<div id="caseLeakResult"></div>' +
      '</section>';
    wire();
    renderRevision();
    renderDisclosure();
    renderResult();
    renderLeak();
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
    if (r.error) { box.innerHTML = '<div class="case-warn" id="caseResultError"></div>'; el("caseResultError").textContent = r.error; return; }
    var g = r.g;
    box.innerHTML = '<div class="case-reply"><div class="case-reply-meta" id="caseReplyMeta"></div><div class="case-reply-text" id="caseReplyText"></div></div>';
    el("caseReplyMeta").textContent = "Ran " + (g.actual_source === "in_cloud" ? "in the cloud" : "on device") +
      (g.source_verified ? " (reported by the SDK)" : " (inferred)") + " · " + g.model + " · " + g.latencyMs + " ms" +
      (g.disclosure ? " · disclosure " + short(g.disclosure.digest) + "… · " + g.disclosure.bytes + " characters" : "") +
      " · provisional: the private review comes in a later step";
    el("caseReplyText").textContent = g.text;
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
      '<div class="case-leak-summary ' + (r.pass ? "is-good" : "is-bad") + '" id="caseLeakSummary"></div>' +
      '<table class="case-leak-table"><thead><tr><th>Planted in</th><th>Fake secret</th><th>In local data</th><th>Found in outbound</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="case-hint" id="caseLeakNote"></div>';
    el("caseLeakSummary").textContent = (r.pass ? "PASS — " : "FAIL — ") + r.leaked + " of 6 fake secrets found in " + r.inspected +
      (r.mode === "live" ? " real outbound requests (" + r.bytes + " characters, read from what fetch actually sent)."
        : " prepared request texts (dry run: the cloud was not reachable, so nothing was sent).");
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
    bind("caseNote", function (c, v) { c.privateConstraints.confidentialNote = v; });
    bind("caseReqs", function (c, v) { c.shareableRequirements = v.split("\n").map(function (x) { return x.trim(); }).filter(Boolean); });
    bind("caseQuestion", function (c, v) { c.question = v; });

    el("caseApproveBtn").addEventListener("click", function () {
      if (!st.prep) return;
      st.busy = "approve";
      eg().approve(st.prep.disclosure, "user_click").then(function (d) {
        st.lastApproval = { rev: d.inputRevision, digest: d.contentDigest };
      }, function (e) { st.result = { error: String(e && e.message || e) }; })
        .then(function () { st.busy = ""; renderDisclosure(); renderResult(); });
    });
    el("caseSendBtn").addEventListener("click", function () {
      if (!st.prep || st.busy) return;
      st.busy = "send";
      renderDisclosure();
      flushEdits().then(function () {
        return api().send(st.prep.disclosure);
      }).then(function (g) { st.result = { g: g }; }, function (e) { st.result = { error: String(e && e.message || e) }; })
        .then(function () { st.busy = ""; renderDisclosure(); renderResult(); });
    });
    el("caseLeakBtn").addEventListener("click", function () {
      if (st.busy) return;
      st.busy = "leak";
      renderLeak();
      api().leakTest().then(function (r) { st.leak = r; }, function (e) { st.leak = { error: String(e && e.message || e) }; })
        .then(function () { st.busy = ""; renderLeak(); return prepare(); });
    });
    el("caseResetBtn").addEventListener("click", function () {
      if (st.busy) return;
      clearTimeout(saveTimer); pendingMutations = [];
      if (st.prep && eg().isApproved(st.prep.disclosure)) st.lastApproval = { rev: st.prep.disclosure.inputRevision, digest: st.prep.disclosure.contentDigest };
      api().reset().then(function (c) { st.c = c; st.result = null; renderAll(); return prepare(); });
    });
  }

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
    flush: function () { return flushEdits(); },
    reload: function () { return api().load().then(function (c) { st.c = c; renderAll(); return prepare(); }); },
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
