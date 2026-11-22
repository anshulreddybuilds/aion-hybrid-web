/* AION Hybrid Web - standalone data layer (classic script, loaded BEFORE app.js).
 *
 * WHY THIS EXISTS
 * ---------------
 * The original dashboard talks to a private Python backend through /api/*.
 * This hosted build has no backend, so this file stands in for it, entirely in
 * the browser:
 *
 *   - It installs a thin wrapper around window.fetch. A request to /api/* is
 *     first checked against a real backend (only if one answers with the AION
 *     status envelope); if none does, the request is answered from IndexedDB
 *     below. app.js, mobile.html and approve.html are unchanged in how they
 *     call the API - they just get answers from the browser.
 *   - It owns the local store: memories, tasks, pending approval proposals,
 *     an event log. First visit pre-seeds a FICTIONAL demo persona so judges
 *     can try every panel immediately. Nothing real from the author's private
 *     AION database is in here.
 *   - It holds the privacy guard that every proposed memory/task must pass
 *     before it can be saved.
 *
 * What it does NOT do: call any AI. Chat answers come from hybrid.js
 * (Firebase AI Logic), which resolves window.AionHybridReady when loaded.
 *
 * Honesty rule inherited from the original dashboard: a panel that cannot
 * measure something says so, it never shows a comfortable invented number.
 * (See systemHealth() - CPU % is reported unavailable because a browser page
 * cannot read it.)
 */
(function () {
  "use strict";

  var VERSION = "0.5.0-hybrid";
  var START = Date.now();
  var DB_NAME = "aion-hybrid-demo";
  var DB_VERSION = 1;
  var STORES = ["memories", "tasks", "proposals", "events", "meta"];

  var realFetch = window.fetch.bind(window);

  /* Resolved by hybrid.js once Firebase AI Logic is initialised. */
  window.AionHybridReady = new Promise(function (resolve) {
    window.__resolveAionHybrid = resolve;
  });

  /* ------------------------------------------------------------------ */
  /* Tiny store: IndexedDB, with an in-memory fallback (private mode)     */
  /* ------------------------------------------------------------------ */

  var memoryOnly = false;
  var mem = {};
  STORES.forEach(function (s) { mem[s] = {}; });
  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve) {
      if (!("indexedDB" in window)) { memoryOnly = true; return resolve(null); }
      var req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { memoryOnly = true; return resolve(null); }
      req.onupgradeneeded = function () {
        var db = req.result;
        STORES.forEach(function (s) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: "id" });
        });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { memoryOnly = true; resolve(null); };
      req.onblocked = function () { memoryOnly = true; resolve(null); };
    });
    return dbPromise;
  }

  function idbDo(store, mode, fn) {
    return openDb().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(store, mode);
        var os = tx.objectStore(store);
        var out = fn(os);
        tx.oncomplete = function () { resolve(out && "result" in out ? out.result : out); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
    });
  }

  var store = {
    all: function (name) {
      return openDb().then(function (db) {
        if (!db) return Object.keys(mem[name]).map(function (k) { return mem[name][k]; });
        return new Promise(function (resolve, reject) {
          var req = db.transaction(name, "readonly").objectStore(name).getAll();
          req.onsuccess = function () { resolve(req.result || []); };
          req.onerror = function () { reject(req.error); };
        });
      });
    },
    get: function (name, id) {
      return openDb().then(function (db) {
        if (!db) return mem[name][id] || null;
        return new Promise(function (resolve, reject) {
          var req = db.transaction(name, "readonly").objectStore(name).get(id);
          req.onsuccess = function () { resolve(req.result || null); };
          req.onerror = function () { reject(req.error); };
        });
      });
    },
    put: function (name, row) {
      return openDb().then(function (db) {
        if (!db) { mem[name][row.id] = row; return row; }
        return idbDo(name, "readwrite", function (os) { os.put(row); }).then(function () { return row; });
      });
    },
    del: function (name, id) {
      return openDb().then(function (db) {
        if (!db) { delete mem[name][id]; return; }
        return idbDo(name, "readwrite", function (os) { os["delete"](id); });
      });
    },
    clear: function () {
      return openDb().then(function (db) {
        STORES.forEach(function (s) { mem[s] = {}; });
        if (!db) return;
        return Promise.all(STORES.map(function (s) {
          return idbDo(s, "readwrite", function (os) { os.clear(); });
        }));
      });
    },
  };

  function uid(prefix) {
    var r = (window.crypto && crypto.randomUUID) ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(16).slice(2, 10);
    return prefix + "-" + r;
  }
  function nowIso() { return new Date().toISOString(); }
  function inDays(n) { return new Date(Date.now() + n * 86400000).toISOString(); }

  /* ------------------------------------------------------------------ */
  /* Privacy guard                                                        */
  /* ------------------------------------------------------------------ */
  /* Every proposed memory or task passes through check() before it can be
   * approved. Two outcomes matter:
   *   redacted - contact details are replaced with [email] / [phone]
   *              placeholders; the user can still approve the redacted text.
   *   blocked  - credentials and ID numbers. These are never saved, even if
   *              the user wants them: the card shows why and the only way
   *              forward is Edit (remove the secret) or Reject.
   * It is a pattern check, not a promise of perfect detection - the README
   * says so plainly. */

  function luhnOk(digits) {
    var sum = 0, alt = false;
    for (var i = digits.length - 1; i >= 0; i--) {
      var n = digits.charCodeAt(i) - 48;
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n; alt = !alt;
    }
    return sum % 10 === 0;
  }

  var BLOCK_RULES = [
    { name: "payment card number", re: /\b(?:\d[ -]?){13,19}\b/g,
      test: function (m) { var d = m.replace(/\D/g, ""); return d.length >= 13 && d.length <= 19 && luhnOk(d); } },
    { name: "API key or token", re: /\b(?:AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{12,})\b/g },
    { name: "password or secret", re: /\b(?:password|passcode|passwd|pwd|pin|secret|api[ _-]?key|token)\b\s*(?:is|=|:)\s*\S+/gi },
    { name: "government ID number", re: /\b(?:\d{3}-\d{2}-\d{4}|\d{4}\s\d{4}\s\d{4}|[A-Z]{5}\d{4}[A-Z])\b/g },
    /* Aadhaar in any spacing (12 digits, first 2-9), confirmed by its Verhoeff
       checksum so ordinary 12-digit numbers are not blocked. */
    { name: "Aadhaar number", re: /\b[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}\b/g,
      test: function (m) { return verhoeffOk(m.replace(/\D/g, "")); } },
    /* A bank account number written next to its label (9-18 digits). */
    { name: "bank account number", re: /\b(?:a\/c|acct|account)(?:\s*(?:no|number|num))?\.?\s*[:#-]?\s*\d[\d -]{7,20}\d\b/gi },
  ];
  var REDACT_RULES = [
    { name: "email address", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, token: "[email]" },
    /* UPI ID: name@handle with no dot after the @ (an email has one). */
    { name: "UPI ID", re: /\b[A-Za-z0-9._-]{2,256}@(?:ok)?[A-Za-z]{2,64}\b(?!\.[A-Za-z])/g, token: "[upi]" },
    { name: "phone number", re: /(?:\+\d{1,3}[ -]?)?(?:\(\d{2,4}\)[ -]?)?\d{3,5}[ -]\d{3,5}(?:[ -]\d{2,5})?|\+\d{8,14}\b/g, token: "[phone]" },
  ];

  /* Verhoeff checksum (used by Aadhaar). */
  var VD = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],
            [5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
  var VP = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],
            [4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
  function verhoeffOk(num) {
    if (!/^\d{12}$/.test(num)) return false;
    var c = 0, d = num.split("").reverse();
    for (var i = 0; i < d.length; i++) c = VD[c][VP[i % 8][+d[i]]];
    return c === 0;
  }

  function privacyCheck(text) {
    var src = String(text == null ? "" : text);
    var flags = [];
    var blocked = false;
    BLOCK_RULES.forEach(function (rule) {
      var hit = false;
      src.replace(rule.re, function (m) {
        if (!rule.test || rule.test(m)) hit = true;
        return m;
      });
      if (hit) { blocked = true; flags.push(rule.name); }
    });
    var out = src;
    var redacted = false;
    REDACT_RULES.forEach(function (rule) {
      var hit = false;
      out = out.replace(rule.re, function () { hit = true; return rule.token; });
      if (hit) { redacted = true; flags.push(rule.name); }
    });
    return {
      status: blocked ? "blocked" : (redacted ? "redacted" : "clean"),
      flags: flags,
      text: out,
      message: blocked
        ? "Blocked: looks like a " + flags.filter(function (f) { return f !== "email address" && f !== "phone number"; }).join(" / ") +
          ". AION will not store this. Edit it to remove the secret, or reject."
        : redacted
          ? "Redacted " + flags.join(" and ") + " before saving."
          : "Passed - no personal identifiers or secrets found.",
    };
  }
  window.AionPrivacy = { check: privacyCheck };

  /* ------------------------------------------------------------------ */
  /* Demo data - a FICTIONAL persona, safe to host publicly               */
  /* ------------------------------------------------------------------ */

  function seedMemories() {
    var t = Date.now();
    function m(id, content, type, importance, domain, axisField, axisValue, daysAgo, tags) {
      var row = { id: id, content: content, type: type, importance: importance, domain: domain,
        tags: tags || [], created: new Date(t - daysAgo * 86400000).toISOString(), status: "active" };
      row[axisField] = axisValue;
      return row;
    }
    return [
      m("mem-01", "Alex is a hobbyist trail runner who trains for a half marathon in March.", "fact", 4, "owner", "sensitivity", "internal", 30, ["running"]),
      m("mem-02", "Alex prefers short, bullet-point answers with the key number first.", "preference", 5, "owner", "sensitivity", "public", 28, ["style"]),
      m("mem-03", "Alex is building a small web app called Trail Journal to log runs and photos.", "fact", 4, "owner", "sensitivity", "internal", 25, ["project"]),
      m("mem-04", "Alex decided to host Trail Journal on Firebase Hosting because the free tier is enough.", "decision", 4, "owner", "sensitivity", "internal", 22, ["project", "hosting"]),
      m("mem-05", "Alex's knee gets sore after runs longer than 15 km, so long runs are spaced a week apart.", "observation", 3, "owner", "sensitivity", "owner_private", 20, ["running", "health"]),
      m("mem-06", "Alex keeps personal finance notes private and never wants them sent to a cloud model.", "preference", 5, "owner", "sensitivity", "owner_private", 18, ["privacy"]),
      m("mem-07", "Alex's laptop has 8 GB RAM and no dedicated GPU, so heavy local models are a bad fit.", "fact", 3, "owner", "sensitivity", "public", 17, ["hardware"]),
      m("mem-08", "Chrome ships Gemini Nano on-device through the Prompt API on desktop from version 139.", "fact", 4, "world", "volatility", "fast", 14, ["chrome", "ai"]),
      m("mem-09", "Firebase AI Logic can route a request on-device first and fall back to the cloud.", "fact", 4, "world", "volatility", "fast", 14, ["firebase", "ai"]),
      m("mem-10", "The hackathon demo needs to work offline, so the app must not depend on a server.", "decision", 5, "owner", "sensitivity", "internal", 10, ["hackathon"]),
      m("mem-11", "Last month Alex tried a cloud-only chatbot and found replies slow on a weak train connection.", "experience", 3, "owner", "sensitivity", "internal", 9, ["latency"]),
      m("mem-12", "This assistant can propose saving a memory or a task, but only saves after Alex approves it.", "fact", 4, "capability", "failure_history", "none", 8, ["approval"]),
      m("mem-13", "This assistant cannot browse the web or read files on its own; it only sees what is typed in.", "fact", 3, "capability", "failure_history", "none", 8, ["limits"]),
      m("mem-14", "Alex wants a weekly Sunday review of open tasks before planning the next week.", "preference", 3, "owner", "sensitivity", "internal", 6, ["routine"]),
    ];
  }

  function seedTasks() {
    var t = Date.now();
    function k(id, title, mission, status, daysAgo) {
      return { id: id, title: title, mission: mission, status: status, created: new Date(t - daysAgo * 86400000).toISOString() };
    }
    return [
      k("task-01", "Sketch the Trail Journal home screen", "Trail Journal app", "done", 20),
      k("task-02", "Set up run-log data model", "Trail Journal app", "done", 18),
      k("task-03", "Add photo upload to run entries", "Trail Journal app", "doing", 8),
      k("task-04", "Deploy first version to Firebase Hosting", "Trail Journal app", "todo", 5),
      k("task-05", "Record 2-minute demo video", "Hackathon submission", "todo", 4),
      k("task-06", "Write the README (before vs new features)", "Hackathon submission", "doing", 3),
      k("task-07", "Test offline mode with airplane mode on", "Hackathon submission", "todo", 3),
      k("task-08", "Book a physio check for the knee", "Half marathon plan", "todo", 6),
      k("task-09", "Run 12 km easy on Saturday", "Half marathon plan", "done", 2),
      k("task-10", "Buy new running shoes", "Half marathon plan", "todo", 2),
    ];
  }

  function seedProposals() {
    var t = Date.now();
    function pr(id, kind, content, type, importance, tags, hoursAgo, source) {
      var chk = privacyCheck(content);
      if (chk.status === "redacted") content = chk.text; /* the card shows exactly what would be saved */
      return { id: id, kind: kind, content: content, type: type, importance: importance, tags: tags,
        privacy: chk, status: "pending", created: new Date(t - hoursAgo * 3600000).toISOString(),
        source: source || "chat" };
    }
    return [
      pr("prop-seed-1", "memory", "Alex's physio is Dr. Rao; reach the clinic at rao.physio@example.com.", "fact", 3, ["health", "contacts"], 5, "chat"),
      pr("prop-seed-2", "task", "Send the hackathon form before Friday", "task", 4, ["hackathon"], 4, "chat"),
      pr("prop-seed-3", "memory", "My Trail Journal admin password is Tr@ilRun2026!", "fact", 2, ["project"], 3, "chat"),
    ];
  }

  function seedEntities() {
    return {
      objects: [
        { id: "ent-alex", name: "Alex", type: "person" },
        { id: "ent-trail", name: "Trail Journal", type: "project" },
        { id: "ent-hack", name: "Hackathon demo", type: "project" },
        { id: "ent-firebase", name: "Firebase", type: "company" },
        { id: "ent-chrome", name: "Chrome", type: "company" },
        { id: "ent-nano", name: "Gemini Nano", type: "thing" },
        { id: "ent-march", name: "Half marathon", type: "thing" },
        { id: "ent-home", name: "Home town", type: "place" },
      ],
      relationships: [
        { from: "ent-alex", to: "ent-trail", relation: "builds" },
        { from: "ent-alex", to: "ent-hack", relation: "builds" },
        { from: "ent-trail", to: "ent-firebase", relation: "hosted_on" },
        { from: "ent-hack", to: "ent-firebase", relation: "uses" },
        { from: "ent-hack", to: "ent-nano", relation: "uses" },
        { from: "ent-chrome", to: "ent-nano", relation: "ships" },
        { from: "ent-alex", to: "ent-march", relation: "trains_for" },
        { from: "ent-alex", to: "ent-home", relation: "lives_in" },
      ],
      links: [
        ["mem-03", "mem-04"], ["mem-04", "mem-10"], ["mem-08", "mem-09"], ["mem-09", "mem-10"],
        ["mem-01", "mem-05"], ["mem-05", "mem-14"], ["mem-06", "mem-02"], ["mem-11", "mem-10"],
        ["mem-12", "mem-13"],
      ],
      memoryEntity: {
        "mem-01": "ent-march", "mem-03": "ent-trail", "mem-04": "ent-trail", "mem-05": "ent-march",
        "mem-08": "ent-nano", "mem-09": "ent-firebase", "mem-10": "ent-hack",
      },
    };
  }

  var ready = null;
  function ensureSeeded() {
    if (ready) return ready;
    ready = openDb().then(function () { return store.get("meta", "seeded"); }).then(function (flag) {
      if (flag) return;
      var ents = seedEntities();
      var jobs = [];
      seedMemories().forEach(function (r) { jobs.push(store.put("memories", r)); });
      seedTasks().forEach(function (r) { jobs.push(store.put("tasks", r)); });
      seedProposals().forEach(function (r) { jobs.push(store.put("proposals", r)); });
      jobs.push(store.put("meta", { id: "entities", value: ents }));
      jobs.push(store.put("meta", { id: "seeded", value: nowIso() }));
      jobs.push(logEvent("system.seeded", "standalone"));
      return Promise.all(jobs);
    }).catch(function () { /* the dashboard still loads with an empty store */ });
    return ready;
  }

  function logEvent(type, engine) {
    return store.put("events", { id: Date.now() + "-" + Math.random().toString(16).slice(2, 6),
      event_id: uid("evt"), timestamp: nowIso(), event_type: type, source_engine: engine || "standalone" });
  }

  /* ------------------------------------------------------------------ */
  /* Recall (local memory context for chat)                               */
  /* ------------------------------------------------------------------ */

  var STOP = {};
  ("the a an and or but if then of to in on at for with is are was were be been it its this that these those " +
   "i you he she we they me my your our their do does did can could should would will just not no yes so as by " +
   "from about what which who how when where why please tell give show make get").split(" ")
    .forEach(function (w) { STOP[w] = 1; });

  function tokens(text) {
    return String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter(function (w) { return w.length > 2 && !STOP[w]; });
  }

  function recall(query, includePrivate, k) {
    var q = tokens(query);
    return store.all("memories").then(function (rows) {
      var withheld = 0;
      var scored = [];
      rows.forEach(function (r) {
        if (r.status !== "active" || !r.domain) return;           /* quarantined = never recalled */
        var words = tokens(r.content + " " + (r.tags || []).join(" "));
        var set = {}; words.forEach(function (w) { set[w] = 1; });
        var overlap = 0; q.forEach(function (w) { if (set[w]) overlap += 1; });
        if (!overlap) return;
        if (r.sensitivity === "owner_private" && !includePrivate) { withheld += 1; return; }
        scored.push({ row: r, score: overlap + (r.importance || 3) * 0.1 });
      });
      scored.sort(function (a, b) { return b.score - a.score; });
      return { memories: scored.slice(0, k || 4).map(function (s) { return s.row; }), withheld: withheld };
    });
  }

  /* ------------------------------------------------------------------ */
  /* Proposal extraction (what the assistant offers to save)              */
  /* ------------------------------------------------------------------ */

  function clip(s, n) { s = String(s).trim().replace(/[.\s]+$/, ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  function extractProposals(message) {
    var out = [];
    var parts = String(message).split(/(?<=[.!?])\s+|\n+/);
    parts.forEach(function (raw) {
      var s = raw.trim();
      if (!s || s.length < 8 || out.length >= 2 || /\?\s*$/.test(s)) return;
      var task = s.match(/\b(?:remind me to|i need to|i have to|i should|i must|don'?t let me forget to|add (?:a )?task:?|todo:?)\s+(.{4,160})/i);
      if (task) {
        out.push({ kind: "task", content: clip(task[1], 160), type: "task", importance: 3, tags: [] });
        return;
      }
      var rem = s.match(/\b(?:remember|note|keep in mind|fyi)\b(?:\s+that)?[:,]?\s+(.{6,220})/i);
      if (rem) {
        out.push({ kind: "memory", content: clip(rem[1], 220), type: "fact", importance: 3, tags: [] });
        return;
      }
      var pref = s.match(/\bI (?:really )?(?:like|love|prefer|hate|dislike|always|never|usually)\b.{3,180}/i);
      if (pref) {
        out.push({ kind: "memory", content: clip(pref[0].replace(/^I\b/, "Alex"), 200), type: "preference", importance: 3, tags: [] });
        return;
      }
      var fact = s.match(/\bI(?:'m| am| work| live| use| have| own| study| run| train)\b.{3,180}/i);
      if (fact) {
        out.push({ kind: "memory", content: clip(fact[0].replace(/^I'm\b/i, "Alex is").replace(/^I am\b/i, "Alex is").replace(/^I\b/, "Alex"), 200), type: "fact", importance: 3, tags: [] });
      }
    });
    return out;
  }

  function persistProposals(list) {
    return store.all("proposals").then(function (existing) {
      var seen = {};
      existing.forEach(function (p) { if (p.status === "pending") seen[p.content.toLowerCase()] = 1; });
      var saved = [];
      var jobs = [];
      list.forEach(function (p) {
        if (seen[p.content.toLowerCase()]) return;
        var chk = privacyCheck(p.content);
        var row = { id: uid("prop"), kind: p.kind, content: chk.status === "redacted" ? chk.text : p.content,
          type: p.type, importance: p.importance, tags: p.tags || [], privacy: chk, status: "pending",
          created: nowIso(), source: p.source || "chat" };
        saved.push(row);
        jobs.push(store.put("proposals", row));
      });
      return Promise.all(jobs).then(function () { return saved; });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Memory / task writes (what approving a card actually does)           */
  /* ------------------------------------------------------------------ */

  function saveMemory(p) {
    var chk = privacyCheck(p.content);
    if (chk.status === "blocked") {
      var err = new Error(chk.message); err.status = 422; throw err;
    }
    var row = { id: uid("mem"), content: chk.text, type: p.type || "fact", importance: p.importance || 3,
      tags: p.tags || [], domain: p.domain || "owner", created: nowIso(), status: "active" };
    if (p.domain === "world") row.volatility = p.volatility || "slow";
    else if (p.domain === "capability") row.failure_history = p.failure_history || "none";
    else { row.domain = "owner"; row.sensitivity = p.sensitivity || "internal"; }
    return store.put("memories", row).then(function () {
      return store.get("meta", "entities");
    }).then(function (meta) {
      /* Link the new note to the most similar existing note, if any. */
      return store.all("memories").then(function (rows) {
        var mine = tokens(row.content); var best = null, bestN = 1;
        rows.forEach(function (o) {
          if (o.id === row.id) return;
          var set = {}; tokens(o.content).forEach(function (w) { set[w] = 1; });
          var n = 0; mine.forEach(function (w) { if (set[w]) n += 1; });
          if (n > bestN) { best = o; bestN = n; }
        });
        if (best && meta) { meta.value.links.push([row.id, best.id]); return store.put("meta", meta); }
      });
    }).then(function () { return logEvent("memory.approved", "memory"); })
      .then(function () { return row; });
  }

  function saveTask(p) {
    var chk = privacyCheck(p.title || p.content);
    if (chk.status === "blocked") { var err = new Error(chk.message); err.status = 422; throw err; }
    var row = { id: uid("task"), title: chk.text, mission: p.mission || "Inbox", status: "todo", created: nowIso() };
    return store.put("tasks", row).then(function () { return logEvent("task.approved", "planner"); })
      .then(function () { return row; });
  }

  /* One approval per proposal, for exactly the text that was shown.
   * - A second approval (double click, a second tab, the phone page) gets 409
   *   instead of a second task or note.
   * - If the proposal's text changed after it was shown (edited elsewhere),
   *   the old approval is refused and must be given again. */
  var inFlight = {};
  function guardApproval(id, shownText) {
    if (!id) return Promise.resolve();
    if (inFlight[id]) { var e0 = new Error("Already being saved - nothing was saved twice."); e0.status = 409; return Promise.reject(e0); }
    inFlight[id] = true;
    return store.get("proposals", id).then(function (p) {
      var fail = function (msg) { delete inFlight[id]; var e = new Error(msg); e.status = 409; throw e; };
      if (!p) return;
      if (p.status !== "pending") fail("Already answered - nothing was saved twice.");
      if (shownText != null && String(shownText) !== String(p.content))
        fail("This proposal changed after you saw it. Review the new text and approve again.");
    });
  }
  function releaseApproval(id) { if (id) delete inFlight[id]; }

  function resolveProposal(id, status, extra) {
    return store.get("proposals", id).then(function (p) {
      if (!p) return null;
      p.status = status; p.resolved_at = nowIso(); p.resolved_by = "you";
      if (extra) Object.keys(extra).forEach(function (k) { p[k] = extra[k]; });
      return store.put("proposals", p);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Derived read models                                                  */
  /* ------------------------------------------------------------------ */

  function countBy(rows, key) {
    var o = {}; rows.forEach(function (r) { o[r[key]] = (o[r[key]] || 0) + 1; }); return o;
  }

  function memoryStats() {
    return store.all("memories").then(function (rows) {
      var live = rows.filter(function (r) { return r.status === "active"; });
      return { total: live.length, by_type: countBy(live, "type") };
    });
  }

  function graphModel() {
    return Promise.all([store.all("memories"), store.get("meta", "entities")]).then(function (res) {
      var mems = res[0].filter(function (r) { return r.status === "active"; });
      var ents = (res[1] && res[1].value) || { objects: [], relationships: [], links: [], memoryEntity: {} };
      var memObjects = mems.map(function (m) {
        return { id: m.id, name: "memory:" + m.id, label: clip(m.content, 42), type: "memory" };
      });
      var memIds = {}; mems.forEach(function (m) { memIds[m.id] = 1; });
      var links = ents.links.filter(function (l) { return memIds[l[0]] && memIds[l[1]]; })
        .map(function (l) { return { from: l[0], to: l[1], relation: "relates_to" }; });
      var mentions = Object.keys(ents.memoryEntity).filter(function (k) { return memIds[k]; })
        .map(function (k) { return { from: k, to: ents.memoryEntity[k], relation: "mentions" }; });
      return { entities: ents, memObjects: memObjects, links: links, mentions: mentions };
    });
  }

  function graphStats() {
    return graphModel().then(function (g) {
      return { total_objects: g.entities.objects.length + g.memObjects.length,
        total_relationships: g.entities.relationships.length + g.links.length + g.mentions.length };
    });
  }
  function graphSnapshot(limit) {
    return graphModel().then(function (g) {
      var objects = g.entities.objects.concat(g.memObjects).slice(0, limit);
      var ids = {}; objects.forEach(function (o) { ids[o.id] = 1; });
      var rels = g.entities.relationships.concat(g.links, g.mentions)
        .filter(function (r) { return ids[r.from] && ids[r.to]; });
      return { objects: objects, relationships: rels };
    });
  }
  function memorySubgraph(limit) {
    return graphModel().then(function (g) {
      var objects = g.memObjects.slice(0, limit);
      var ids = {}; objects.forEach(function (o) { ids[o.id] = 1; });
      return { objects: objects, relationships: g.links.filter(function (r) { return ids[r.from] && ids[r.to]; }) };
    });
  }

  function missions() {
    return store.all("tasks").then(function (tasks) {
      var by = {};
      tasks.forEach(function (t) {
        var m = by[t.mission] || (by[t.mission] = { id: "mis-" + t.mission, title: t.mission, status: "active",
          task_count: 0, done_count: 0, doing_count: 0, created: t.created });
        m.task_count += 1;
        if (t.status === "done") m.done_count += 1;
        if (t.status === "doing") m.doing_count += 1;
      });
      return Object.keys(by).map(function (k) {
        var m = by[k]; if (m.task_count && m.done_count === m.task_count) m.status = "complete"; return m;
      });
    });
  }

  function progressModel() {
    return missions().then(function (ms) {
      var total = 0, done = 0;
      var weeks = ms.map(function (m, i) {
        total += m.task_count; done += m.done_count;
        return { number: i + 1, dates: "demo", title: m.title,
          counts: { done: m.done_count, total: m.task_count,
            pct_done: m.task_count ? Math.round((m.done_count / m.task_count) * 1000) / 10 : 0 } };
      });
      var H = window.AionHybridState || {};
      var gates = [
        { id: "G1", bucket: memoryOnly ? "partial" : "met", name: "Local memory store",
          verdict: memoryOnly ? "in-memory only (IndexedDB blocked)" : "IndexedDB ready" },
        { id: "G2", bucket: H.appCheck && H.appCheck.status !== "off" && H.appCheck.status !== "error" ? "met" : "partial",
          name: "Firebase App Check", verdict: H.appCheck ? H.appCheck.status : "not started" },
        { id: "G3", bucket: H.nano === "ready" ? "met" : (H.nano === "unsupported" || H.nano === "unavailable" ? "not_started" : "partial"),
          name: "Gemini Nano on this device", verdict: H.nano || "checking" },
        { id: "G4", bucket: "met", name: "Privacy guard", verdict: "active on every proposal" },
      ];
      return { overall: { pct_done: total ? Math.round((done / total) * 1000) / 10 : 0, total: total, done: done },
        weeks: weeks, gates_v0_4: [], gates_v0_5: gates };
    });
  }

  function systemHealth() {
    /* Only what a web page can truly read. CPU % is not one of them. */
    var res = {
      /* Real values only: core count and the browser's rounded memory figure.
         Load and usage are not readable from a web page, so they are not shown. */
      cpu: navigator.hardwareConcurrency
        ? { available: false, cores: navigator.hardwareConcurrency, reason: "A web page cannot read CPU load." }
        : { available: false, reason: "CPU information is hidden by this browser." },
      ram: navigator.deviceMemory
        ? { available: false, device_memory_gb: navigator.deviceMemory, reason: "A web page cannot read memory usage." }
        : { available: false, reason: "Device memory is not exposed by this browser." },
      disk: { available: false, reason: "Storage quota unavailable." },
      network: { available: true, verdict: navigator.onLine ? "browser reports online" : "browser reports OFFLINE", age_minutes: 0 },
    };
    if (navigator.storage && navigator.storage.estimate) {
      return navigator.storage.estimate().then(function (e) {
        if (e && e.quota) {
          var gb = function (n) { return Math.round((n / 1073741824) * 10) / 10; };
          res.disk = { available: true, used_pct: Math.round(((e.usage || 0) / e.quota) * 1000) / 10,
            free_gb: gb(e.quota - (e.usage || 0)), total_gb: gb(e.quota) };
        }
        return res;
      }).catch(function () { return res; });
    }
    return Promise.resolve(res);
  }

  function guardian() {
    var H = window.AionHybridState || {};
    var checks = [
      { name: "Privacy guard", severity: "OK", message: "Secrets and ID numbers are blocked before any save." },
      { name: "Local store", severity: memoryOnly ? "WARN" : "OK",
        message: memoryOnly ? "IndexedDB unavailable - data lives only until this tab closes." : "Data is saved in this browser only." },
      { name: "App Check", severity: H.appCheck && (H.appCheck.status === "recaptcha" || H.appCheck.status === "debug") ? "OK" : "WARN",
        message: H.appCheck ? H.appCheck.detail || H.appCheck.status : "Not initialised yet." },
      { name: "Gemini Nano", severity: H.nano === "ready" ? "OK" : "WARN",
        message: "On-device model status: " + (H.nano || "checking") + "." },
      { name: "Network", severity: navigator.onLine ? "OK" : "WARN",
        message: window.AION_OFFLINE_DEMO ? "Offline Demo Mode: external requests from this page are blocked."
          : (navigator.onLine ? "Online." : "Browser is offline - only on-device AI will work.") },
    ];
    var overall = checks.some(function (c) { return c.severity === "WARN"; }) ? "WARN" : "OK";
    return Promise.resolve({ report: { overall: overall, checks: checks } });
  }

  function providerRows() {
    return store.all("events").then(function (evs) {
      var by = {};
      evs.forEach(function (e) {
        if (e.event_type !== "chat.reply" || !e.detail) return;
        var d = e.detail;
        var p = by[d.provider] || (by[d.provider] = { provider: d.provider, calls: 0, failed_calls: 0,
          tokens_in: 0, tokens_out: 0, _lat: 0 });
        p.calls += 1; p._lat += d.latency_ms || 0;
        p.tokens_in += d.tokens_in || 0; p.tokens_out += d.tokens_out || 0;
      });
      evs.forEach(function (e) {
        if (e.event_type === "chat.error" && e.detail && by[e.detail.provider]) by[e.detail.provider].failed_calls += 1;
      });
      return Object.keys(by).map(function (k) {
        var p = by[k]; p.avg_latency_ms = p.calls ? Math.round(p._lat / p.calls) : 0; delete p._lat; return p;
      });
    });
  }

  function providerHealth() {
    var H = window.AionHybridState || {};
    var nanoStatus = H.nano === "ready" ? "ACTIVE" : H.nano === "downloadable" || H.nano === "downloading" ? "BENCHMARK_PENDING" : "BLOCKED";
    var mode = H.mode || "prefer_on_device";
    var active = mode === "prefer_in_cloud" ? "firebase-ai-logic (cloud)" :
      (H.nano === "ready" ? "chrome-prompt-api (on-device)" : "firebase-ai-logic (cloud)");
    return Promise.resolve({
      status: "healthy",
      active_provider: active,
      selected_model: active.indexOf("on-device") >= 0 ? "Gemini Nano" : (H.cloudModel || "gemini-3.5-flash-lite"),
      selection_reason: "Route: " + mode.replace(/_/g, " ") + ". Gemini Nano is " + (H.nano || "being checked") + " on this device.",
      providers: {
        "chrome-prompt-api": { status: nanoStatus, display_name: "Gemini Nano (on-device)", model: "Chrome Prompt API",
          consecutive_failures: 0, quota_exhausted: false },
        "firebase-ai-logic": { status: "ACTIVE", display_name: "Gemini (Firebase AI Logic)", model: H.cloudModel || "gemini-3.5-flash-lite",
          consecutive_failures: 0, quota_exhausted: false },
      },
    });
  }

  function skillsList() {
    return Promise.resolve([
      { name: "hybrid-chat", description: "Answer on-device with Gemini Nano, fall back to the cloud only when needed.", destructive: false },
      { name: "memory-recall", description: "Pull the most relevant saved notes into each question (private notes stay on-device).", destructive: false },
      { name: "propose-memory", description: "Offer to remember a fact - saved only after you approve.", destructive: false },
      { name: "propose-task", description: "Offer to add a to-do - saved only after you approve.", destructive: false },
      { name: "privacy-guard", description: "Block secrets and ID numbers; redact emails and phone numbers.", destructive: false },
    ]);
  }

  function architecture() {
    var H = window.AionHybridState || {};
    return Promise.resolve([
      { name: "Hybrid AI Router", module: "firebase/ai - InferenceMode", status: H.ready ? "online" : "unavailable" },
      { name: "On-device model", module: "Chrome Prompt API (Gemini Nano)", status: H.nano === "ready" ? "online" : "unavailable" },
      { name: "App Check", module: "firebase/app-check", status: H.appCheck && H.appCheck.status !== "error" && H.appCheck.status !== "off" ? "online" : "unavailable" },
      { name: "Memory Engine", module: "IndexedDB - memories", status: "online" },
      { name: "Knowledge Graph", module: "IndexedDB - derived", status: "online" },
      { name: "Planner", module: "IndexedDB - tasks", status: "online" },
      { name: "Privacy Guard", module: "standalone.js", status: "online" },
    ]);
  }

  function briefing() {
    return Promise.all([store.all("tasks"), store.all("proposals"), store.all("memories")]).then(function (r) {
      var tasks = r[0], pend = r[1].filter(function (p) { return p.status === "pending"; });
      var open = tasks.filter(function (t) { return t.status !== "done"; });
      var doing = tasks.filter(function (t) { return t.status === "doing"; });
      var lines = ["You have " + open.length + " open task" + (open.length === 1 ? "" : "s") +
        (doing.length ? " (" + doing.length + " in progress: " + doing.map(function (t) { return t.title; }).join("; ") + ")" : "") + ".",
        pend.length ? pend.length + " proposal" + (pend.length === 1 ? " is" : "s are") + " waiting for your approval on the Home screen." : "Nothing is waiting for your approval.",
        r[2].filter(function (m) { return m.status === "active"; }).length + " notes are saved locally in this browser."];
      return { text: lines.join(" ") };
    });
  }

  function eventsRecent(limit) {
    return store.all("events").then(function (rows) {
      rows.sort(function (a, b) { return a.timestamp < b.timestamp ? 1 : -1; });
      return rows.slice(0, limit).map(function (e) {
        return { event_id: e.event_id, timestamp: e.timestamp, event_type: e.event_type, source_engine: e.source_engine };
      });
    });
  }

  function approvalRecord(p) {
    var memory = p.kind === "memory";
    return { id: p.id, action_kind: p.kind, action_name: memory ? "Save memory" : "Add task",
      description: p.content + (p.privacy && p.privacy.status !== "clean" ? "  [" + p.privacy.message + "]" : ""),
      payload: { kind: p.kind, content: p.content, privacy: p.privacy && p.privacy.status },
      destructive: false, requested_at: p.created, expires_at: inDays(7), status: p.status,
      resolved_at: p.resolved_at || null, resolved_by: p.resolved_by || null };
  }

  /* ------------------------------------------------------------------ */
  /* Chat (the one place an AI is involved)                               */
  /* ------------------------------------------------------------------ */

  var SYSTEM_PROMPT =
    "You are AION, a concise personal assistant running inside the user's browser. " +
    "Use the NOTES and TASKS below when they are relevant; do not invent notes or tasks. " +
    "TASKS are the user's open to-dos (doing first). When asked about tasks, today's plan or what to work on, " +
    "list them from TASKS, grouped by project, and say which are in progress. " +
    "If the answer is not in the notes or tasks, answer from general knowledge. " +
    "Keep replies short (under 150 words unless listing tasks). Never ask for passwords or ID numbers.";

  /* Open tasks + task proposals still waiting for approval, as plain lines.
     Small on purpose: on-device Gemini Nano has a small context window. */
  function taskContext() {
    return Promise.all([store.all("tasks"), store.all("proposals")]).then(function (r) {
      var rank = { doing: 0, todo: 1 };
      var openRows = r[0].filter(function (t) { return t.status !== "done"; })
        .sort(function (a, b) { return (rank[a.status] - rank[b.status]) || (a.mission < b.mission ? -1 : 1); })
        .slice(0, 14);
      var waitingRows = r[1].filter(function (p) { return p.status === "pending" && p.kind === "task"; }).slice(0, 4);
      /* items keep the raw values apart from the wording, so a cloud-bound
         prompt can swap them for placeholders (see buildPrompt). */
      var items = openRows.map(function (t) {
        return { label: t.status === "doing" ? "in progress" : "to do", title: t.title, mission: t.mission };
      }).concat(waitingRows.map(function (p) { return { label: "awaiting your approval", title: p.content, mission: null }; }));
      var lines = items.map(function (it) { return "- [" + it.label + "] " + it.title + (it.mission ? " (" + it.mission + ")" : ""); });
      /* Every open task / pending task proposal - not just the ones listed in
         the prompt - so sealing covers exactly what the private registry holds. */
      var allPrivate = r[0].filter(function (t) { return t.status !== "done"; })
        .map(function (t) { return { title: t.title, mission: t.mission }; })
        .concat(r[1].filter(function (p) { return p.status === "pending" && p.kind === "task"; })
          .map(function (p) { return { title: p.content, mission: null }; }));
      return { lines: lines, items: items, allPrivate: allPrivate, openCount: openRows.length, waitingCount: waitingRows.length };
    });
  }

  /* ------------------------------------------------------------------ */
  /* Cloud boundary (Day-1, hybrid-v2)                                     */
  /* ------------------------------------------------------------------ */
  /* Whenever a request CAN reach the cloud (Prefer Cloud and Prefer On-Device
   * both can), the prompt is sealed first:
   *   - task titles and project names become placeholders ([TASK_3], [PROJECT_1]);
   *   - secrets / ID numbers are cut, emails / phones become [email] / [phone];
   *   - conversation history comes from sealedTurns (stored sealed), never from
   *     the reply text shown on screen - that text has the real names put back
   *     in and would re-leak them on the next turn;
   *   - turns that ran in Only On-Device mode never enter cloud history at all.
   * The reply is un-sealed locally, only for display. This is a pattern- and
   * vault-based seal, not a guarantee for arbitrary free text the user types. */
  var vault = { byKey: {}, byToken: {}, counts: { TASK: 0, PROJECT: 0 } };
  function tokenFor(kind, value) {
    var v = String(value == null ? "" : value).trim();
    if (!v) return v;
    var key = kind + "|" + v.toLowerCase();
    if (vault.byKey[key]) return vault.byKey[key];
    vault.counts[kind] += 1;
    var tok = "[" + kind + "_" + vault.counts[kind] + "]";
    vault.byKey[key] = tok;
    vault.byToken[tok] = v;
    return tok;
  }
  function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function sealText(text) {
    var out = String(text == null ? "" : text);
    /* 1. Known private values -> placeholders, longest first, whole words only. */
    Object.keys(vault.byToken)
      .map(function (t) { return [t, vault.byToken[t]]; })
      .filter(function (p) { return p[1].length >= 3; })
      .sort(function (a, b) { return b[1].length - a[1].length; })
      .forEach(function (p) {
        out = out.replace(new RegExp("(?<![A-Za-z0-9])" + escRe(p[1]) + "(?![A-Za-z0-9])", "gi"), p[0]);
      });
    /* 2. Secrets / ID numbers are cut; contact details are redacted. */
    BLOCK_RULES.forEach(function (rule) {
      out = out.replace(rule.re, function (m) { return !rule.test || rule.test(m) ? "[withheld secret]" : m; });
    });
    REDACT_RULES.forEach(function (rule) { out = out.replace(rule.re, rule.token); });
    return out;
  }
  var TOKEN_RE = /\[(TASK|PROJECT)[ _](\d+)\]/g;
  function unsealText(text) {
    return String(text == null ? "" : text).replace(TOKEN_RE, function (m, kind, n) {
      var v = vault.byToken["[" + kind + "_" + n + "]"];
      return v != null ? v : m;
    });
  }
  /* Sealed transcript: the only history a cloud-reachable prompt may carry. */
  var sealedTurns = [];
  function recordTurn(cloudReachable, userMessage, modelReply) {
    if (!cloudReachable) return;              /* local-only turns stay local */
    sealedTurns.push({ user: sealText(userMessage).slice(0, 400), assistant: sealText(modelReply).slice(0, 400) });
    if (sealedTurns.length > 20) sealedTurns.shift();
  }
  var PLACEHOLDER_RULE =
    " Private items are replaced by placeholders such as [TASK_3] or [PROJECT_1]. When you refer to one, " +
    "write the placeholder exactly as given; never guess or describe what it stands for.";

  function buildPrompt(message, history, notes, tasks, sealed) {
    if (!sealed) {
      /* Only On-Device: nothing leaves this browser, so the full local context is used. */
      var ctx = notes.length ? notes.map(function (n, i) { return (i + 1) + ". " + n.content; }).join("\n") : "(no relevant notes)";
      var tctx = tasks && tasks.lines.length ? tasks.lines.join("\n") : "(no open tasks)";
      var hist = (history || []).slice(-4).map(function (h) {
        return (h.role === "user" ? "User: " : "AION: ") + String(h.content).slice(0, 400);
      }).join("\n");
      return { prompt: SYSTEM_PROMPT + "\n\nNOTES:\n" + ctx + "\n\nTASKS:\n" + tctx +
        (hist ? "\n\nRECENT CONVERSATION:\n" + hist : "") +
        "\n\nUser: " + message + "\nAION:", sealedItems: 0, historyTurns: Math.ceil(Math.min((history || []).length, 4) / 2) };
    }
    /* Cloud-reachable: register every task title / project name first so the
       vault can find them anywhere (notes, history, the message itself). */
    var items = (tasks && tasks.items) || [];
    ((tasks && tasks.allPrivate) || []).forEach(function (it) {
      tokenFor("TASK", it.title);
      if (it.mission) tokenFor("PROJECT", it.mission);
    });
    var tlines = items.map(function (it) {
      return "- [" + it.label + "] " + tokenFor("TASK", it.title) + (it.mission ? " (" + tokenFor("PROJECT", it.mission) + ")" : "");
    });
    /* Stored turns are sealed again with today's vault: words typed earlier
       that have since become a private task title are covered too. */
    var turns = sealedTurns.slice(-2).map(function (t) { return { user: sealText(t.user), assistant: sealText(t.assistant) }; });
    var smsg = sealText(message);
    /* Packet 2: a cloud-reachable request is no longer a prompt string. It is
       a "chat" disclosure whose allowlisted fields hold only sealed text;
       hybrid.js builds the cloud text from those fields. */
    var payload = {
      instructions: SYSTEM_PROMPT + PLACEHOLDER_RULE,
      notes: notes.map(function (n) { return sealText(n.content).slice(0, 700); }).slice(0, 8),
      tasks: tlines.slice(0, 24),
      history: turns.map(function (t) { return { user: t.user, assistant: t.assistant }; }),
      message: smsg.slice(0, 2000),
    };
    var all = [payload.message].concat(payload.notes, payload.tasks, turns.map(function (t) { return t.user + " " + t.assistant; })).join("\n");
    var placeholders = all.match(TOKEN_RE) || [];
    var uniq = {}; placeholders.forEach(function (p) { uniq[p.replace(" ", "_")] = 1; });
    return { payload: payload, sealedItems: Object.keys(uniq).length, historyTurns: turns.length };
  }

  /* ------------------------------------------------------------------ */
  /* Private case workspace + disclosure boundary (hybrid-v2, Packet 2)    */
  /* ------------------------------------------------------------------ */
  /* One persistent case, stored ONLY in this browser (IndexedDB "meta").
   * Everything about it is private by default. What may go to the cloud is
   * decided field by field: paragraphs the user marks "share", the bundled
   * public sources, and the shareable requirements. Private constraints have
   * no way into a disclosure at all - there is no field for them. */
  var CASE_ID = "case-sample";
  var CASE_INSTRUCTIONS =
    "You are AION's public research assistant. You see only what the user approved for disclosure: some passages " +
    "from a supplier proposal, excerpts from public sources, and the requirements the user chose to share. Base your " +
    "answer only on that material. Cite proposal passages as [P#] and sources as [S#]. In under 150 words: say whether " +
    "the supplier looks like a reasonable choice on this information, then list the questions the buyer should " +
    "clarify before signing. Do not guess anything that was not provided. Start your answer with exactly one line: " +
    "VERDICT: reasonable, VERDICT: caution, or VERDICT: not suitable.";

  function sampleCase() {
    return {
      id: CASE_ID, kind: "case", sample: true, inputRevision: 1, updatedAt: nowIso(),
      title: "Supplier evaluation — LED wall and sound for the Annual Partner Summit",
      buyer: "Northwind Events (fictional)",
      supplier: "Brightline Event Systems (fictional)",
      paragraphs: [
        { id: "P1", heading: "Overview", shared: true,
          text: "Brightline Event Systems proposes to supply a 6 m x 3 m indoor LED video wall (2.6 mm pixel pitch), a line-array sound system for up to 400 guests and two wireless presenter microphones for the Annual Partner Summit." },
        { id: "P2", heading: "Equipment", shared: true,
          text: "LED panels: Brightline BL-26 (500 x 500 mm, 2.6 mm pitch, 4,500 nits, 3,840 Hz refresh). Video processor with 4K input and redundant power. Audio: eight line-array cabinets, two subwoofers and a 16-channel digital mixer." },
        { id: "P3", heading: "Delivery", shared: true,
          text: "Equipment is delivered to the venue loading bay on the morning of 11 December 2026, packed in road cases. The client signs a delivery note on arrival." },
        { id: "P4", heading: "Warranty and support", shared: true,
          text: "All equipment is covered by Brightline's standard rental warranty (see the public warranty terms). A phone support line is available during the event from 08:00 to 22:00." },
        { id: "P5", heading: "Scope and exclusions", shared: false,
          text: "Not included in this quotation: rigging, assembly and installation of the LED wall, cabling between the stage and the control desk, and on-site technicians. These can be quoted separately on request." },
        { id: "P6", heading: "Price and payment", shared: false,
          text: "Total rental price: Rs 3,85,000 plus GST for two event days. 50% advance on signing, balance on delivery. This quotation is valid until 30 November 2026." },
        { id: "P7", heading: "Cancellation", shared: true,
          text: "Cancellations made within 14 days of the event are charged at 60% of the rental price." },
      ],
      publicSources: [
        { id: "S1", title: "Brightline BL-26 LED panel — spec sheet", label: "Sample public source (fictional), bundled with AION — not a live web search",
          text: "Panel size 500 x 500 mm. Pixel pitch 2.6 mm. Brightness 4,500 nits. Refresh rate 3,840 Hz. Weight 7.5 kg per panel. Indoor use only. Walls taller than 2 m must be rigged and assembled by certified technicians." },
        { id: "S2", title: "Brightline rental warranty terms", label: "Sample public source (fictional), bundled with AION — not a live web search",
          text: "The rental warranty covers equipment faults during the rental period when the equipment is installed and operated by Brightline-certified technicians. Damage or faults caused by third-party installation are not covered." },
      ],
      shareableRequirements: [
        "LED wall at least 5 m wide for a ballroom stage",
        "Sound coverage for about 350 guests",
        "Two wireless microphones for presenters",
      ],
      privateConstraints: {
        maxBudget: "Rs 4,00,000 including GST",
        readyBy: "2026-12-11 09:00 — fully working before doors open at 10:00",
        installationRequired: true,
        gstRate: "18",
        confidentialNote: "Internal: last year's AV vendor did not finish setup in time. Leadership will not accept another self-install.",
      },
      question: "Using only the shared proposal passages, the public sources and the stated requirements: is this supplier a reasonable choice, and what should the buyer clarify before signing?",
    };
  }

  function loadCase() {
    return store.get("meta", CASE_ID).then(function (c) {
      if (c && c.kind === "case") return c;
      var s = sampleCase();
      return store.put("meta", s).then(function () { return s; });
    });
  }

  function caseBody(c) {
    var copy = JSON.parse(JSON.stringify(c));
    delete copy.inputRevision; delete copy.updatedAt;
    return JSON.stringify(copy);
  }

  /* mutate(copy) edits a copy; the revision goes up only if something changed. */
  function updateCase(mutate) {
    return loadCase().then(function (c) {
      var next = JSON.parse(JSON.stringify(c));
      mutate(next);
      next.id = CASE_ID; next.kind = "case";
      if (caseBody(next) === caseBody(c)) return c;
      next.inputRevision = c.inputRevision + 1;
      next.updatedAt = nowIso();
      return store.put("meta", next).then(function () { return next; });
    });
  }

  function resetCase() {
    var s = sampleCase();
    return loadCase().then(function (c) {
      s.inputRevision = c.inputRevision + 1;   /* a reset is a change: old approvals go stale */
      return store.put("meta", s).then(function () { return s; });
    });
  }

  /* The ONLY fields of a case that can reach a disclosure. */
  /* Secrets and ID numbers are cut, contact details and UPI IDs redacted, in
     every Case field that can be shared - the same rules chat uses. The
     preview is built from this result, so it is exactly what would be sent. */
  function filterSecrets(text) {
    var out = String(text == null ? "" : text);
    BLOCK_RULES.forEach(function (rule) {
      out = out.replace(rule.re, function (m) { return !rule.test || rule.test(m) ? "[withheld secret]" : m; });
    });
    REDACT_RULES.forEach(function (rule) { out = out.replace(rule.re, rule.token); });
    return out;
  }
  function casePayload(c, question) {
    return {
      instructions: CASE_INSTRUCTIONS,
      question: filterSecrets(String(question == null ? c.question : question)).slice(0, 1000),
      shared_passages: c.paragraphs.filter(function (p) { return p.shared; })
        .map(function (p) { return { id: p.id, text: filterSecrets(p.text).slice(0, 1500) }; }),
      public_sources: c.publicSources.map(function (s) { return { id: s.id, title: s.title, text: filterSecrets(s.text) }; }),
      shareable_requirements: (c.shareableRequirements || [])
        .map(function (r) { return filterSecrets(String(r).trim()); }).filter(Boolean).slice(0, 12),
    };
  }

  function casePrivateValues(c) {
    var pc = c.privateConstraints || {};
    var vals = [pc.maxBudget, pc.readyBy, pc.confidentialNote];
    String(pc.maxBudget || "").replace(/\d[\d,.]{3,}\d/g, function (m) { vals.push(m); return m; });
    String(pc.readyBy || "").replace(/\d{4}-\d{2}-\d{2}/g, function (m) { vals.push(m); return m; });
    return {
      constraints: vals,
      passages: c.paragraphs.filter(function (p) { return !p.shared; }).map(function (p) { return p.text; }),
    };
  }

  /* Registers, for the last-line scan in hybrid.js, every value that must
   * never appear in cloud text: open task titles and project names (they go
   * as placeholders), private notes, the case's private constraints and its
   * unshared passages. extraCase lets the leak test register a temp case. */
  function syncPrivateRegistry(hybrid, extraCase) {
    return Promise.all([store.all("tasks"), store.all("proposals"), store.all("memories"), loadCase()]).then(function (r) {
      var E = hybrid.egress;
      var open = r[0].filter(function (t) { return t.status !== "done"; });
      E.setPrivate("task_title", open.map(function (t) { return t.title; })
        .concat(r[1].filter(function (p) { return p.status === "pending" && p.kind === "task"; }).map(function (p) { return p.content; })));
      E.setPrivate("project_name", open.map(function (t) { return t.mission; }));
      E.setPrivate("private_note", r[2].filter(function (m) { return m.sensitivity === "owner_private"; }).map(function (m) { return m.content; }));
      var cons = [], pas = [];
      [r[3]].concat(extraCase ? [extraCase] : []).forEach(function (c) {
        var v = casePrivateValues(c);
        cons = cons.concat(v.constraints); pas = pas.concat(v.passages);
      });
      E.setPrivate("case_private_constraint", cons);
      E.setPrivate("case_unshared_passage", pas);
      return E.privateCounts();
    });
  }

  /* Build a disclosure draft from the CURRENT case. Nothing is sent. */
  function prepareCaseDisclosure(question, caseOverride) {
    return waitForHybrid().then(function (hybrid) {
      var getCase = caseOverride ? Promise.resolve(caseOverride) : loadCase();
      return getCase.then(function (c) {
        return syncPrivateRegistry(hybrid, caseOverride).then(function () {
          return hybrid.egress.createDisclosure({ purpose: "case_research", payload: casePayload(c, question),
            caseId: c.id, inputRevision: c.inputRevision });
        }).then(function (d) {
          var text = hybrid.egress.serialize(d);
          var pc = c.privateConstraints || {};
          return {
            disclosure: d,
            text: text,
            bytes: text.length,
            included: {
              passages: d.payload.shared_passages.map(function (p) { return p.id; }),
              sources: d.payload.public_sources.map(function (s) { return s.id; }),
              requirements: d.payload.shareable_requirements.length,
            },
            excluded: c.paragraphs.filter(function (p) { return !p.shared; }).map(function (p) { return p.id + " " + p.heading; })
              .concat(["maximum budget", "ready-by deadline", "installation rule (" + (pc.installationRequired ? "required" : "not required") + ")", "confidential note"]),
            privateHits: hybrid.egress.scanPrivate(text),
          };
        });
      });
    });
  }

  /* Send an approved case disclosure. Cloud only - never falls back to the
   * device - and only if the case is still at the approved revision. */
  function sendCaseDisclosure(d) {
    return waitForHybrid().then(function (hybrid) {
      return loadCase().then(function (c) {
        return syncPrivateRegistry(hybrid).then(function () {
          return hybrid.generate(null, null, { mode: "only_in_cloud", disclosure: d, currentInputRevision: c.inputRevision });
        });
      }).then(function (g) {
        return store.put("events", { id: Date.now() + "-r", event_id: uid("evt"), timestamp: nowIso(),
          event_type: "case.research", source_engine: "hybrid-router",
          detail: { disclosure: g.disclosure, actual_source: g.actual_source, source_verified: g.source_verified,
            latency_ms: g.latencyMs, model: g.model } }).then(function () { return g; });
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* 6-canary leak test                                                    */
  /* ------------------------------------------------------------------ */
  /* Plants six unique fake secrets - one in each place private data lives -
   * runs two chat turns and one case research request through the normal
   * code paths, then searches what left for the secrets. Everything planted
   * is removed afterwards.
   *   live    : the requests really go to the cloud; the bodies are read from
   *             the outbound monitor in hybrid.js (what fetch actually sent).
   *   dry_run : (offline / no cloud) the exact text that WOULD be sent is
   *             built and searched instead. The report says which one ran.
   * A finite test: it shows these six secrets did not appear in these
   * inspected requests - not that nothing can ever leak. */
  function leakTest(opts) {
    opts = opts || {};
    return waitForHybrid().then(function (hybrid) {
      var E = hybrid.egress;
      var rnd = function () { return Math.random().toString(36).slice(2, 8); };
      var C = {
        task_title: "zqcanary-task-" + rnd(),
        private_note: "zqcanary-note-" + rnd(),
        chat_history: "zqcanary-hist-" + rnd(),
        source_document: "zqcanary-doc-" + rnd(),
        reconstituted_reply: "zqcanary-reply-" + rnd(),
        private_constraint: "zqcanary-cons-" + rnd(),
      };
      var WHERE = {
        task_title: "Task title", private_note: "Private note", chat_history: "Chat history on screen",
        source_document: "Unshared case passage", reconstituted_reply: "Reply with real name restored",
        private_constraint: "Private constraint",
      };
      var live = opts.live !== false && navigator.onLine !== false && !window.AION_OFFLINE_DEMO && !!hybrid.state.ready;
      var started = Date.now();
      var dryTexts = [], errors = [], gateBlocked = 0;
      var screenHistory = null, tempCase = null, controlText = "";
      var turnsBefore = sealedTurns.length;
      var t0 = nowIso();
      var taskTitle = "Renew the insurance plan " + C.task_title;
      var replyTitle = "Call the venue manager " + C.reconstituted_reply;
      var plant = Promise.all([
        store.put("tasks", { id: "leaktest-task", title: taskTitle, mission: "Leak test", status: "todo", created: t0 }),
        store.put("tasks", { id: "leaktest-reply", title: replyTitle, mission: "Leak test", status: "todo", created: t0 }),
        store.put("memories", { id: "leaktest-mem", content: "Private: my insurance renewal reference is " + C.private_note,
          type: "fact", importance: 5, domain: "owner", tags: ["insurance", "renewal"], created: t0, status: "active",
          sensitivity: "owner_private" }),
      ]);

      function send(d, extra) {
        if (!live) { dryTexts.push(E.serialize(d)); return Promise.resolve(); }
        return hybrid.generate(null, null, Object.assign({ mode: "only_in_cloud", disclosure: d }, extra || {}))
          .catch(function (e) {
            if (e && e.code === "private_value_blocked") gateBlocked += 1;
            errors.push(String(e && e.message || e).slice(0, 200));
          });
      }
      function chatTurn(message, screenHistory) {
        return Promise.all([recall(message, false, 4), taskContext()]).then(function (both) {
          /* screenHistory = what app.js shows and passes as body.history. The
             cloud path must ignore it (it holds restored names and local-only turns). */
          var built = buildPrompt(message, screenHistory || null, both[0].memories, both[1], true);
          return syncPrivateRegistry(hybrid)
            .then(function () { return E.createDisclosure({ purpose: "chat", payload: built.payload }); })
            .then(function (d) { return E.approve(d, "leak_test"); })
            .then(send);
        });
      }

      return plant
        .then(function () { return chatTurn("Leak test: what is next for my insurance renewal plan?"); })
        .then(function () {
          /* The screen now shows a restored reply naming the canary task, and the
             on-screen history holds a canary. The model's own text used the
             placeholder - that sealed form is what the next turn may carry. */
          return taskContext().then(function () {
            recordTurn(true, "What should I do after that?", "Next: " + tokenFor("TASK", replyTitle) + ".");
          });
        })
        .then(function () {
          screenHistory = [
            { role: "user", content: "(asked in Only On-Device mode) my door code is " + C.chat_history },
            { role: "assistant", content: "Noted. Next: " + replyTitle + "." },
          ];
          return chatTurn("And after that, should I call the venue?", screenHistory);
        })
        .then(function () {
          return loadCase().then(function (c) {
            var temp = tempCase = JSON.parse(JSON.stringify(c));
            temp.paragraphs.push({ id: "P99", heading: "Leak test (unshared)", text: "Internal only: " + C.source_document, shared: false });
            temp.privateConstraints.confidentialNote = (temp.privateConstraints.confidentialNote || "") + " Ref " + C.private_constraint;
            return prepareCaseDisclosure(null, temp).then(function (prep) {
              return E.approve(prep.disclosure, "leak_test").then(function (d) { return send(d, { currentInputRevision: temp.inputRevision }); });
            });
          });
        })
        .then(function () {
          /* Positive control: the same local material, WITHOUT the boundary
             (an Only On-Device prompt incl. private notes + the whole temp case).
             Every fake secret must be found here - otherwise "not found" outbound
             would prove nothing. */
          return Promise.all([recall("insurance renewal plan", true, 8), taskContext()]).then(function (r) {
            controlText = buildPrompt("control", screenHistory, r[0].memories, r[1], false).prompt + "\n" + JSON.stringify(tempCase);
          });
        })
        .then(function () {
          var bodies = live ? E.outboundSince(started).map(function (o) { return o.body || ""; }) : dryTexts;
          var ctl = controlText.toLowerCase();
          var results = Object.keys(C).map(function (k) {
            var needle = C[k].toLowerCase();
            return { where: WHERE[k], key: k, canary: C[k],
              found: bodies.filter(function (b) { return b.toLowerCase().indexOf(needle) !== -1; }).length,
              presentLocally: ctl.indexOf(needle) !== -1 };
          });
          var report = {
            mode: live ? "live" : "dry_run",
            inspected: bodies.length,
            bytes: bodies.reduce(function (n, b) { return n + b.length; }, 0),
            results: results,
            leaked: results.filter(function (r) { return r.found > 0; }).length,
            gateBlocked: gateBlocked,
            errors: errors,
            controlPresent: results.filter(function (r) { return r.presentLocally; }).length,
            pass: bodies.length >= 3 && results.every(function (r) { return r.found === 0 && r.presentLocally; }),
            at: nowIso(),
          };
          return report;
        })
        .then(function (report) {
          return cleanup().then(function () {
            return store.put("events", { id: Date.now() + "-l", event_id: uid("evt"), timestamp: nowIso(),
              event_type: "guardian.leak_test", source_engine: "egress",
              detail: { mode: report.mode, inspected: report.inspected, leaked: report.leaked, pass: report.pass } });
          }).then(function () { return report; });
        }, function (err) {
          return cleanup().then(function () { throw err; });
        });

      function cleanup() {
        sealedTurns.splice(turnsBefore);
        return Promise.all([store.del("tasks", "leaktest-task"), store.del("tasks", "leaktest-reply"), store.del("memories", "leaktest-mem")])
          .then(function () { return syncPrivateRegistry(hybrid); });
      }
    });
  }

  function waitForHybrid() {
    return Promise.race([
      window.AionHybridReady,
      new Promise(function (_, rej) { setTimeout(function () { rej(new Error("The AI module did not load (is hybrid.bundle.js missing?).")); }, 8000); }),
    ]);
  }

  function handleChat(body) {
    var message = String(body.message || "").trim();
    var planCmd = message.match(/^\/plan\s+([\s\S]{3,})$/i);
    if (planCmd) return handlePlan({ goal: planCmd[1] });
    return waitForHybrid().then(function (hybrid) {
      /* The route is decided ONCE, before anything is built: the dropdown
         choice can be overridden (offline, or a sensitive message while Nano
         is ready), and the prompt is then built for that route only, so a
         dropdown change mid-request cannot send an unsealed prompt to the
         cloud. The badge shows requested vs actual. */
      var requestedMode = hybrid.getMode();
      var decision = hybrid.router.decide({ mode: requestedMode, message: message, offlineDemo: !!window.AION_OFFLINE_DEMO });
      var mode = decision.effectiveMode;
      var includePrivate = mode === "only_on_device";
      var sealed = typeof hybrid.mayReachCloud === "function" ? hybrid.mayReachCloud(mode) : mode !== "only_on_device";
      return Promise.all([recall(message, includePrivate, 4), taskContext()]).then(function (both) {
        var rc = both[0], tasks = both[1];
        var built = buildPrompt(message, body.history, rc.memories, tasks, sealed);
        /* Live streaming text is un-sealed for display only. */
        var uiChunk = window.AionOnChunk;
        var onChunk = typeof uiChunk === "function"
          ? function (soFar) { uiChunk(sealed ? unsealText(soFar) : soFar); } : null;
        /* If the cloud fails and Nano is ready, the router answers on-device. That
           prompt may use private notes (nothing leaves the browser), so it is
           built here, only when needed. */
        var localCtx = null;
        var buildLocalPrompt = function () {
          return Promise.all([recall(message, true, 4), taskContext()]).then(function (b2) {
            localCtx = { notes: b2[0].memories.length, tasks: b2[1].lines.length };
            return buildPrompt(message, body.history, b2[0].memories, b2[1], false).prompt;
          });
        };
        /* Pressing Send is the approval for exactly this content. The router
           runs it through createDisclosure (validatePayload) -> approve ->
           generate and records a receipt for every attempt. */
        var dispatch = (sealed ? syncPrivateRegistry(hybrid) : Promise.resolve()).then(function () {
          return hybrid.router.dispatchChat({ mode: mode, requestedMode: requestedMode, decision: decision,
            payload: sealed ? built.payload : null, prompt: sealed ? null : built.prompt, onChunk: onChunk,
            buildLocalPrompt: buildLocalPrompt, approvedBy: "send_click" });
        });
        var promptChars = sealed ? 0 : built.prompt.length;
        return dispatch.then(function (g) {
          var fell = !!g.fallback;
          if (g.disclosure) promptChars = g.disclosure.bytes;
          var shown = (sealed ? unsealText(g.text) : g.text).replace(/\s+$/, "");   /* Nano often ends with blank lines */
          recordTurn(sealed && !fell, message, g.text);   /* the SEALED model text; local-fallback turns stay local */
          var proposals = extractProposals(message);
          return persistProposals(proposals).then(function (saved) {
            var contributors = {
              local_deterministic: true,                 /* recall, task context, sealing ran in this browser */
              local_ai: g.source === "on_device",
              cloud_ai: g.source === "in_cloud",
              human_confirmed: false,                    /* nothing in a chat reply is approved yet */
            };
            var rcp = g.receipt || null;
            var rcpMeta = rcp ? { id: rcp.receiptId, route: rcp.route, status: rcp.status, latency_ms: rcp.latencyMs,
              tier: rcp.egressAudit.disclosureTier, bytes_sent: rcp.egressAudit.bytesSent, attempts: (g.receipts || []).length } : null;
            var routing = { requested: requestedMode, effective: mode, overridden: !!decision.overridden, reasons: decision.reasons };
            var fbMeta = fell ? { reason: g.fallback.reason, error_class: g.fallback.errorClass } : null;
            var notesUsed = fell && localCtx ? localCtx.notes : rc.memories.length;
            var tasksUsed = fell && localCtx ? localCtx.tasks : tasks.lines.length;
            var detail = { provider: g.source === "on_device" ? "on-device (Gemini Nano)" : "in-cloud (Gemini)",
              requested_mode: g.requested_mode || requestedMode, actual_source: g.actual_source || g.source,
              source_verified: !!g.source_verified, contributors: contributors,
              sealed: sealed && !fell, sealed_items: built.sealedItems,
              disclosure: g.disclosure || null, receipt: rcpMeta, routing: routing, fallback: fbMeta,
              latency_ms: g.latencyMs, tokens_in: Math.ceil(promptChars / 4), tokens_out: Math.ceil(g.text.length / 4) };
            return store.put("events", { id: Date.now() + "-c", event_id: uid("evt"), timestamp: nowIso(),
              event_type: "chat.reply", source_engine: "hybrid-router", detail: detail }).then(function () {
              return {
                reply: shown,
                proposed_memories: saved,
                citations: rc.memories.map(function (m) { return m.id; }),
                meta: { source: g.source, latency_ms: g.latencyMs, first_chunk_ms: g.firstChunkMs, model: g.model, mode: g.mode,
                  requested_mode: g.requested_mode || requestedMode, actual_source: g.actual_source || g.source,
                  source_verified: !!g.source_verified, contributors: contributors,
                  sealed: sealed && !fell, sealed_items: built.sealedItems, history_turns_sent: built.historyTurns,
                  disclosure: g.disclosure || null, receipt: rcpMeta, routing: routing, fallback: fbMeta,
                  notes_used: notesUsed, tasks_used: tasksUsed, private_withheld: (includePrivate || fell) ? 0 : rc.withheld,
                  tokens_estimated: true },
              };
            });
          });
        });
      });
    }).catch(function (err) {
      var src = (window.AionHybridState && window.AionHybridState.mode) || "prefer_on_device";
      var last = err && err.receipts && err.receipts.length ? err.receipts[err.receipts.length - 1] : null;
      return store.put("events", { id: Date.now() + "-e", event_id: uid("evt"), timestamp: nowIso(),
        event_type: "chat.error", source_engine: "hybrid-router",
        detail: { provider: src === "only_on_device" ? "on-device (Gemini Nano)" : "in-cloud (Gemini)",
          receipt_id: last ? last.receiptId : null, status: last ? last.status : null, error_class: (err && err.errorClass) || null } }).then(function () {
        var e = new Error(friendlyAiError(err)); e.status = 502; throw e;
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Blindfold Planner (/plan <goal>)                                      */
  /* ------------------------------------------------------------------ */
  /* The cloud gets the goal and task REFERENCES only ("[TASK_3] | to do |
   * [PROJECT_1]"), may ask the browser for counts and yes/no facts, and
   * returns a plan. Each step that would change anything becomes a normal
   * approval card; nothing is applied until you approve it. */
  function handlePlan(body) {
    var goal = String(body.goal || "").trim();
    return waitForHybrid().then(function (hybrid) {
      var mode = hybrid.getMode();
      var titles = {};
      return Promise.all([taskContext(), store.all("memories"), syncPrivateRegistry(hybrid), store.all("tasks"), store.all("proposals")]).then(function (r) {
        var tasks = r[0];
        /* Mint a token for EVERY title and project on the private list (not only
           the ones shown as references), so any of them in the goal is sealed. */
        r[3].forEach(function (t) { if (t.status !== "done") { tokenFor("TASK", t.title); if (t.mission) tokenFor("PROJECT", t.mission); } });
        r[4].forEach(function (p) { if (p.status === "pending" && p.kind === "task") tokenFor("TASK", p.content); });
        var refs = [];
        tasks.items.forEach(function (it) {
          /* Every task title gets a token, pending ones included: they are on the
             private list too, so a goal that repeats one must be sealed, not blocked. */
          var tok0 = tokenFor("TASK", it.title);
          var tok = tok0;   /* pending tasks are listed too: the goal may name one, and the cloud may refer to it */
          var proj = it.mission ? tokenFor("PROJECT", it.mission) : "";
          refs.push({ ref: tok, line: tok + " | " + it.label + (proj ? " | " + proj : "") });
          titles[tok] = it.title;
        });
        var counts = { total: 0 };
        r[1].forEach(function (m) {
          if (m.status === "forgotten" || m.status === "archived") return;
          counts.total += 1;
          if (/^(fact|preference|experience|capability)$/.test(m.type)) counts[m.type] = (counts[m.type] || 0) + 1;
        });
        return hybrid.planner.plan({ goal: sealText(goal).slice(0, 800), localGoal: goal, taskRefs: refs.slice(0, 24),
          taskTitles: titles, memoryCounts: counts, localContext: tasks.lines.join("\n") }, { mode: mode });
      }).then(function (res) {
        var proposals = hybrid.planner.stepsToProposals(res.plan, unsealText);
        return persistProposals(proposals).then(function (saved) {
          var lines = res.plan.steps.map(function (st, i) {
            return (i + 1) + ". " + unsealText(st.title) + (st.due ? " (by " + st.due + ")" : "") +
              (st.status === "PENDING_APPROVAL" ? " - waiting for your approval" : " - note only");
          });
          var reply = unsealText(res.plan.summary) + "\n\n" + lines.join("\n");
          var last = res.receipts[res.receipts.length - 1];
          var fb = res.fallback ? { reason: res.fallback.reason, error_class: res.fallback.errorClass } : null;
          var src = res.source === "cloud-blindfold" ? "in_cloud" : res.source === "on-device-nano" ? "on_device" : "local_deterministic";
          var rcpMeta = { id: last.receiptId, route: last.route, status: last.status, latency_ms: last.latencyMs,
            tier: last.egressAudit.disclosureTier, bytes_sent: last.egressAudit.bytesSent, attempts: res.receipts.length,
            function_calls: last.functionCalls.map(function (c) { return c.name; }) };
          return store.put("events", { id: Date.now() + "-p", event_id: uid("evt"), timestamp: nowIso(),
            event_type: "plan.created", source_engine: "hybrid-planner",
            detail: { receipt: rcpMeta, fallback: fb, steps: res.plan.steps.length, proposals: saved.length } }).then(function () {
            return {
              reply: reply, proposed_memories: saved, citations: [], plan: res.plan,
              meta: { source: src, latency_ms: last.latencyMs, model: last.model, mode: mode, requested_mode: mode,
                actual_source: src, source_verified: false, receipt: rcpMeta, fallback: fb, planner: true,
                contributors: { local_deterministic: true, local_ai: src === "on_device", cloud_ai: src === "in_cloud", human_confirmed: false },
                notes_used: 0, tasks_used: Object.keys(titles).length, private_withheld: 0, tokens_estimated: true },
            };
          });
        });
      });
    }).catch(function (err) {
      var e = new Error(friendlyAiError(err)); e.status = 502; throw e;
    });
  }

  /* A short plain-English hint first, then the EXACT error underneath. The raw
     text is always included: the hint is a guess, the raw text is the fact. */
  function friendlyAiError(err) {
    var raw = String((err && err.message) || err || "unknown error");
    var HS = window.AionHybridState || {};
    var hint;
    if (err && err.code === "timeout" || /\(timeout\)/.test(raw))
      hint = "The AI did not answer in time, so AION stopped waiting instead of hanging. Try again, or switch route.";
    else if (err && err.code === "unsealed_refused")
      hint = "AION refused to send this request: it held private context that was not sealed for the cloud.";
    else if (/ONLY_ON_DEVICE|on-device model is not available|LanguageModel API not available/i.test(raw))
      hint = "On-device Gemini Nano is not ready in this browser (needs desktop Chrome 139+, enough disk space and the model downloaded). Switch the AI route to Prefer On-Device or Prefer Cloud.";
    else if (window.AION_OFFLINE_DEMO && /fetch|network/i.test(raw))
      hint = "Offline Demo Mode blocked a cloud call. Gemini Nano must be ready for this mode.";
    else if (/throttle/i.test(raw) && /app.?check|appcheck/i.test(raw))
      hint = "App Check is briefly paused after a failed check (Firebase waits before retrying). Wait a minute and try again; with Gemini Nano ready, Prefer On-Device keeps working meanwhile.";
    else if (/app.?check|appcheck/i.test(raw) ||
             (HS.appCheckWarm === "failed" && /403|PERMISSION_DENIED|Permission denied/i.test(raw))) {
      /* A 403 right after this page failed to get its App Check token is App
         Check refusing the request, even though the server only says "denied". */
      var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
      hint = local
        ? "App Check problem. The debug token printed in the console must be registered in Firebase console > App Check > Manage debug tokens (the app must be registered there first)."
        : "App Check could not verify this browser (reCAPTCHA), so the cloud refused the request. Ad blockers, strict privacy settings or a VPN can cause this" +
          (HS.isProductionHost ? "" : ", and so can opening the app on an address that is not in the reCAPTCHA key's allowed domains (" + location.hostname + ")") +
          ". Private names were sealed before the request, as always. Try again, allow google.com/recaptcha, or use Gemini Nano (Prefer On-Device) if it is ready.";
    }
    else if (/API_NOT_ENABLED|has not been used|PERMISSION_DENIED|403/i.test(raw))
      hint = "The cloud model rejected the request (403). Check that Firebase AI Logic is enabled for this project and the API key is allowed to call it.";
    else if (/model|not found|404/i.test(raw))
      hint = "The cloud model name may be wrong or unavailable for this project.";
    else if (/quota|429|RESOURCE_EXHAUSTED/i.test(raw))
      hint = "The free quota for the cloud model looks used up. Wait a bit or switch to on-device.";
    else
      hint = "The AI request failed.";
    if (err && err.fallbackError) {
      /* The cloud failed AND the on-device retry failed: say both. A first
         Nano answer on a low-memory laptop can fail while the model loads. */
      hint += "\n\nGemini Nano was tried on this device as a fallback and also failed (" +
        String(err.fallbackError.name || err.fallbackError.code || "error") + ": " + String(err.fallbackError.message || "").slice(0, 160) +
        "). If this was the first on-device answer since opening the page, the model may still have been loading; sending again usually works.";
    }
    return hint + "\n\nRaw error:\n" + raw;
  }

  /* ------------------------------------------------------------------ */
  /* Backend detection + the fetch wrapper                                */
  /* ------------------------------------------------------------------ */

  var modePromise = null;
  /* A real backend that answers 401 (token wall) must still count as live. */
  function detectMode() {
    if (modePromise) return modePromise;
    /* Firebase Hosting has no Python backend behind it: skip the probe so the
       console stays free of a pointless 404. */
    if (/\.(web\.app|firebaseapp\.com)$/.test(location.hostname)) {
      modePromise = Promise.resolve("standalone");
      modePromise.then(function (m) {
        window.AionBackendMode = m;
        window.dispatchEvent(new CustomEvent("aion:backend-mode", { detail: m }));
      });
      return modePromise;
    }
    modePromise = new Promise(function (resolve) {
      var done = false;
      var finish = function (v) { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
      var timer = setTimeout(function () { finish("standalone"); }, 1500);
      realFetch("/api/status", { cache: "no-store" }).then(function (res) {
        var ct = res.headers.get("content-type") || "";
        if (res.status === 401 && ct.indexOf("json") >= 0) return finish("live");
        if (!res.ok || ct.indexOf("json") < 0) return finish("standalone");
        return res.json().then(function (j) { finish(j && j.ok && j.data && j.data.version ? "live" : "standalone"); });
      }).catch(function () { finish("standalone"); });
    });
    modePromise.then(function (m) {
      window.AionBackendMode = m;
      window.dispatchEvent(new CustomEvent("aion:backend-mode", { detail: m }));
    });
    return modePromise;
  }

  function envelope(data) { return { ok: true, data: data, timestamp: nowIso() }; }
  function json(status, body) {
    return new Response(JSON.stringify(body), { status: status, headers: { "Content-Type": "application/json" } });
  }
  function readBody(init) {
    try { return init && init.body ? JSON.parse(init.body) : {}; } catch (e) { return {}; }
  }

  function route(method, path, query, body) {
    var limit = Math.max(1, Math.min(parseInt(query.get("limit") || "200", 10) || 200, 1000));
    var m;
    if (method === "GET") {
      switch (path) {
        case "/api/status":
          return store.all("events").then(function (ev) {
            return envelope({ version: VERSION, uptime_seconds: Math.round((Date.now() - START) / 10) / 100,
              safe_mode: false, event_count: ev.length });
          });
        case "/api/memory/stats": return memoryStats().then(envelope);
        case "/api/graph/stats": return graphStats().then(envelope);
        case "/api/graph/snapshot": return graphSnapshot(limit).then(envelope);
        case "/api/graph/memory-subgraph": return memorySubgraph(limit).then(envelope);
        case "/api/planner/missions": return missions().then(envelope);
        case "/api/system/health": return systemHealth().then(envelope);
        case "/api/guardian/status": return guardian().then(envelope);
        case "/api/providers/health": return providerHealth().then(envelope);
        case "/api/providers/usage": return providerRows().then(envelope);
        case "/api/skills": return skillsList().then(envelope);
        case "/api/events/recent": return eventsRecent(parseInt(query.get("limit") || "25", 10)).then(envelope);
        case "/api/observatory/timeline": return Promise.resolve(envelope([]));
        case "/api/architecture": return architecture().then(envelope);
        case "/api/progress": return progressModel().then(envelope);
        case "/api/briefing": return briefing().then(envelope);
        case "/api/proposals/pending":
          return store.all("proposals").then(function (rows) {
            return envelope(rows.filter(function (p) { return p.status === "pending"; })
              .sort(function (a, b) { return a.created < b.created ? -1 : 1; }));
          });
        case "/api/approvals/pending":
          return store.all("proposals").then(function (rows) {
            return envelope(rows.filter(function (p) { return p.status === "pending"; }).map(approvalRecord));
          });
        case "/api/approvals/recent":
          return store.all("proposals").then(function (rows) {
            return envelope(rows.filter(function (p) { return p.status !== "pending"; })
              .sort(function (a, b) { return (a.resolved_at || "") < (b.resolved_at || "") ? 1 : -1; })
              .slice(0, limit).map(function (p) {
                var r = approvalRecord(p); r.status = p.status === "approved" ? "approved" : "denied"; return r;
              }));
          });
        default: break;
      }
    }
    if (method === "POST") {
      if (path === "/api/chat") return handleChat(body).then(envelope);
      if (path === "/api/memory/approve") {
        return guardApproval(body.proposal_id, body.content).then(function () { return saveMemory(body); }).then(function (row) {
          return (body.proposal_id ? resolveProposal(body.proposal_id, "approved") : null).then(function () { return envelope({ id: row.id }); });
        }).finally(function () { releaseApproval(body.proposal_id); });
      }
      if (path === "/api/tasks/approve") {
        return guardApproval(body.proposal_id, body.title || body.content).then(function () { return saveTask(body); }).then(function (row) {
          return (body.proposal_id ? resolveProposal(body.proposal_id, "approved") : null).then(function () { return envelope({ id: row.id }); });
        }).finally(function () { releaseApproval(body.proposal_id); });
      }
      if (path === "/api/proposals/reject") {
        return resolveProposal(body.proposal_id, "rejected").then(function () { return logEvent("proposal.rejected", "approvals"); })
          .then(function () { return envelope({ ok: true }); });
      }
      if (path === "/api/proposals/update") {
        return store.get("proposals", body.proposal_id).then(function (p) {
          if (!p) { var e = new Error("proposal not found"); e.status = 404; throw e; }
          var chk = privacyCheck(body.content);
          p.content = chk.status === "redacted" ? chk.text : String(body.content);
          p.privacy = chk;
          return store.put("proposals", p).then(function () { return envelope({ proposal: p }); });
        });
      }
      if ((m = path.match(/^\/api\/approvals\/([^/]+)\/(approve|deny)$/))) {
        var id = decodeURIComponent(m[1]), act = m[2];
        return store.get("proposals", id).then(function (p) {
          if (!p) { var e = new Error("No such request."); e.status = 404; throw e; }
          if (p.status !== "pending") { var e2 = new Error("Already answered."); e2.status = 409; throw e2; }
          if (act === "deny") return resolveProposal(id, "rejected").then(function () { return envelope(approvalRecord(p)); });
          if (inFlight[id]) { var e3 = new Error("Already being saved - nothing was saved twice."); e3.status = 409; throw e3; }
          inFlight[id] = true;
          var save = p.kind === "task"
            ? saveTask({ title: p.content, proposal_id: id })
            : saveMemory({ content: p.content, type: p.type, importance: p.importance, tags: p.tags, domain: "owner", sensitivity: "internal" });
          return save.then(function () { return resolveProposal(id, "approved"); }).then(function () { return envelope(approvalRecord(p)); })
            .finally(function () { delete inFlight[id]; });
        });
      }
      if (path === "/api/command" || path === "/api/transcribe" || path === "/api/chat/audio") {
        var err = new Error("This needs the local AION backend, which is not connected in the hosted demo.");
        err.status = 501; return Promise.reject(err);
      }
    }
    var nf = new Error("Not found in standalone mode: " + path); nf.status = 404; return Promise.reject(nf);
  }

  window.fetch = function (input, init) {
    var url;
    try { url = new URL(typeof input === "string" ? input : (input && input.url) || String(input), location.href); }
    catch (e) { return realFetch(input, init); }

    /* Offline Demo Mode: nothing leaves the page. Same-origin files still load
       (they come from the service-worker cache or this host). */
    if (window.AION_OFFLINE_DEMO && url.origin !== location.origin) {
      return Promise.reject(new TypeError("Failed to fetch (blocked by Offline Demo Mode)"));
    }
    if (url.origin !== location.origin || url.pathname.indexOf("/api/") !== 0) return realFetch(input, init);

    return detectMode().then(function (mode) {
      if (mode === "live") return realFetch(input, init);
      var method = ((init && init.method) || (typeof input !== "string" && input.method) || "GET").toUpperCase();
      return ensureSeeded().then(function () { return route(method, url.pathname, url.searchParams, readBody(init)); })
        .then(function (body) { return json(200, body); })
        .catch(function (err) {
          return json(err && err.status ? err.status : 500, { error: "standalone_error", detail: String((err && err.message) || err) });
        });
    });
  };

  /* Public surface for app.js / hybrid.js / the console. */
  window.AionStandalone = {
    version: VERSION,
    store: store,
    ensureSeeded: ensureSeeded,
    detectMode: function () { return detectMode(); },
    resetDemo: function () { return store.clear().then(function () { ready = null; location.reload(); }); },
    /* Read-only window onto the cloud boundary, for tests and the console. */
    boundary: { seal: function (t) { return sealText(t); }, unseal: function (t) { return unsealText(t); },
      sealedTurnCount: function () { return sealedTurns.length; } },
    /* Private case workspace + disclosure boundary (Packet 2). */
    caseApi: {
      load: function () { return loadCase(); },
      update: function (mutate) { return updateCase(mutate); },
      reset: function () { return resetCase(); },
      /* Replace the proposal with an imported quote (read on this device).
         Private requirements, shareable requirements and the question stay;
         every imported passage starts PRIVATE (not shared). */
      importQuote: function (q) {
        return updateCase(function (c) {
          c.sample = false;
          c.title = "Supplier evaluation - imported quote";
          c.supplier = String(q.supplier || "Imported supplier").slice(0, 120);
          c.paragraphs = (q.paragraphs || []).slice(0, 12).map(function (p, i) {
            return { id: "P" + (i + 1), heading: String(p.heading || "Passage").slice(0, 60), shared: false, text: String(p.text || "").slice(0, 1400) };
          });
          c.publicSources = [];
          c.importedBy = q.by || "text";
        });
      },
      prepareDisclosure: function (question) { return prepareCaseDisclosure(question); },
      send: function (d) { return sendCaseDisclosure(d); },
      leakTest: function (opts) { return leakTest(opts); },
      syncPrivateRegistry: function () { return waitForHybrid().then(function (h) { return syncPrivateRegistry(h); }); },
    },
    privacy: privacyCheck,
    _friendly: function (e) { return friendlyAiError(e); },   /* tests only: the user-facing error wording */
  };
})();
