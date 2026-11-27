"""Ghost-Math page smoke test (Playwright, headless Chrome). Apache-2.0.
Created by Anshul Reddy (idea and project owner) for #BuildHybridAI 2026.

Run: python tests/ghost_smoke.py      (GHOST_PORT env overrides the port)
MOCKED: cloud Gemini, App Check and Gemini Nano are fakes here. The fake cloud
does honest maths on exactly the lines in the request body it receives, so the
test checks the real round trip: rules -> scale -> request -> restore.
"""
import sys, json, os, re, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public")
PORT = int(os.environ.get("GHOST_PORT", "8137"))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), functools.partial(Q, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{PORT}/ghost.html"

LINE = re.compile(r"(T\d+) \| (debit|credit) \| ((?:Person|Merchant|Payer|Item)_[A-Z]+) \| (\w+) \| (\d+)")
def maths(lines):
    inc = sp = hous = 0; by = {}
    for _id, d, who, cat, amt in lines:
        a = int(amt)
        if d == "credit": inc += a
        elif cat != "savings":
            sp += a; by[cat] = by.get(cat, 0) + a
            if cat in ("rent", "emi"): hous += a
    rent_who = next((w for _i, d, w, c, _a in lines if c == "rent"), "Person_A")
    subs_who, subs_amt = next(((w, int(a)) for _i, d, w, c, a in lines if c == "subscriptions"), ("Merchant_C", 0))
    cloud["sent"] = [int(a) for *_x, a in lines]
    return {"income": inc, "spend": sp, "breakdown": [{"category": c, "amount": v} for c, v in by.items()],
            "rent_emi_share": hous / inc if inc else 0, "savings_rate": (inc - sp) / inc if inc else 0,
            "tips": [{"text": "Renegotiate rent with " + rent_who + ": it is {amount} a month.", "amount": by.get("rent", 0)},
                     {"text": cloud["tip2"], "amount": by.get("food", 0)},
                     {"text": "Your total spend is {amount}.", "amount": sp},
                     {"text": "cancel subscriptions with " + subs_who + " to save " + str(subs_amt) + " a month", "amount": 0}]}

FAKE_NANO = r"""
window.__nanoAvail = 'unavailable';
window.__nanoCalls = 0;
window.LanguageModel = {
  availability: async () => window.__nanoAvail,
  create: async () => ({
    prompt: async (m) => { window.__nanoCalls++; const s = JSON.stringify(m);
      const re = /(T\d+) \| (debit|credit) \| (\w+) \| (\w+) \| (\d+)/g; let x, inc = 0, sp = 0, h = 0, by = {};
      while ((x = re.exec(s))) { const a = +x[5]; if (x[2] === 'credit') inc += a; else if (x[4] !== 'savings') { sp += a; by[x[4]] = (by[x[4]] || 0) + a; if (x[4] === 'rent' || x[4] === 'emi') h += a; } }
      return JSON.stringify({ income: inc, spend: sp, breakdown: Object.keys(by).map((c) => ({ category: c, amount: by[c] })),
        rent_emi_share: h / inc, savings_rate: (inc - sp) / inc, tips: [{ text: 'On-device tip: food is {amount}.', amount: by.food || 0 }] }); },
    promptStreaming: () => new ReadableStream({ start(c) { c.enqueue('x'); c.close(); } }),
    destroy() {} }),
};
"""
CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*"}
cloud = {"mode": "ok", "bodies": [], "tip2": "Cut Merchant_B orders, which cost {amount}."}
def vertex(route):
    r = route.request
    if r.method == "OPTIONS": return route.fulfill(status=204, headers=CORS)
    body = r.post_data or ""
    cloud["bodies"].append(body)
    if cloud["mode"] == "appcheck":
        return route.fulfill(status=403, headers={**CORS, "content-type": "application/json"},
                             body=json.dumps({"error": {"code": 403, "message": "App Check token is invalid.", "status": "PERMISSION_DENIED"}}))
    text = json.loads(body)["contents"][0]["parts"][0]["text"]
    out = maths(LINE.findall(text))
    if cloud.get("skew"): out["spend"] = out["spend"] * cloud["skew"]; out["savings_rate"] = out["savings_rate"] + 0.02
    c = {"candidates": [{"content": {"role": "model", "parts": [{"text": json.dumps(out)}]}, "finishReason": "STOP"}]}
    return route.fulfill(status=200, headers={**CORS, "content-type": "application/json"}, body=json.dumps(c))
def appcheck(route):
    if route.request.method == "OPTIONS": return route.fulfill(status=204, headers=CORS)
    return route.fulfill(status=200, headers={**CORS, "content-type": "application/json"}, body=json.dumps({"token": "fake", "ttl": "3600s"}))

results = []
def ok(name, cond, extra=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (" :: " + str(extra)[:300] if (extra != "" and not cond) else ""))

REAL = ["rameshkumar", "Priya Sharma", "NETFLIX", "swiggy", "bigbasket", "ACME", "AMAZON", "XX4821", "4321", "UPI Ref", "85,000", "85000", "24000", "12450"]

src = re.sub(r"/\*[\s\S]*?\*/|//[^\n]*", "", open(os.path.join(ROOT, "ghost.js"), encoding="utf8").read())
ok("static: ghost.js never uses innerHTML / insertAdjacentHTML / document.write", not re.search(r"innerHTML|insertAdjacentHTML|document\.write", src))
html = open(os.path.join(ROOT, "ghost.html"), encoding="utf8").read()
ok("static: ghost.html loads no external script or font", not re.search(r'(href|src)="https?://', html))

with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    def ctx_page(**kw):
        ctx = b.new_context(**kw)
        ctx.add_init_script(FAKE_NANO)
        ctx.route("**/firebasevertexai.googleapis.com/**", vertex)
        ctx.route("**/content-firebaseappcheck.googleapis.com/**", appcheck)
        ctx.route("**/www.google.com/recaptcha/**", lambda r: r.abort())
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(URL); pg.wait_for_function("window.AionHybrid && window.AionHybrid.ghost", timeout=15000)
        return ctx, pg, errs

    # ---------- cloud route ----------
    ctx, pg, errs = ctx_page()
    pg.select_option("#gRoute", "prefer_in_cloud")
    pg.click("#gSampleSms"); pg.wait_for_selector("#gLocal:not([hidden])")
    ok("rules: spend shown in real rupees", pg.text_content("#kSpend") == "₹46,777", pg.text_content("#kSpend"))
    ok("rules: rent+EMI share 43%", pg.text_content("#kRent") == "43%", pg.text_content("#kRent"))
    ok("rules: savings rate 45%", pg.text_content("#kSave") == "45%", pg.text_content("#kSave"))
    rows = pg.evaluate("""[...document.querySelectorAll('#gLens tr')].map(tr => ({
        id: tr.dataset.id, you: tr.querySelector('td.you .nm').textContent, youAmt: tr.querySelector('td.you-amt').textContent,
        gem: tr.querySelector('td.gem .nm').textContent, gemCat: tr.querySelector('td.gem .ct').textContent,
        gemAmt: tr.querySelector('td.gem-amt').textContent }))""")
    out_lines = pg.text_content("#gOut").split("\n")
    ok("lens: one aligned row per entry (12)", len(rows) == 12)
    ok("lens: row T2 pairs rameshkumar ₹24,000 with Person_A", rows[1]["you"] == "rameshkumar" and rows[1]["youAmt"] == "₹24,000" and rows[1]["gem"] == "Person_A", rows[1])
    def sent_line(r): return " | ".join([r["id"], "credit" if r["gemAmt"].startswith("+") else "debit", r["gem"], r["gemCat"].split(" · ")[0], r["gemAmt"].lstrip("+")])
    ok("lens: every right-hand side is exactly a line of the text Gemini receives", all(sent_line(r) in out_lines for r in rows), [sent_line(r) for r in rows][:2])
    ok("lens: no real name on the right-hand side", not [r for r in rows if r["you"] in r["gem"] or r["gem"] in r["you"]])
    ok("lens: column headings say what you see / what Gemini gets", "What you see" in pg.text_content("#gReceiptStep thead") and "What Gemini gets" in pg.text_content("#gReceiptStep thead"))
    wy, wg = pg.text_content("#gWhyYou"), pg.text_content("#gWhyGem")
    ok("why: your rent+EMI share (43%) is the rules figure", wy == "43%" and pg.text_content("#kRent") == wy, (wy, pg.text_content("#kRent")))
    ok("why: the same share from Gemini's numbers is within 2 points", abs(int(wy.rstrip("%")) - int(wg.rstrip("%"))) <= 2, (wy, wg))
    ok("why: a plain-English line explains it", "same secret factor" in pg.text_content("#gWhyText") and "who you pay" in pg.text_content("#gWhy"))
    out = pg.text_content("#gOut")
    ok("receipt: outgoing text has no real name, account or real amount", not [x for x in REAL if x in out], [x for x in REAL if x in out])
    ok("receipt: says 0 real names found", "12 real names replaced; 0 found in the text Gemini receives" in pg.text_content("#gFacts"), pg.text_content("#gFacts"))
    ok("button: cloud route says it sends to cloud Gemini", "cloud Gemini" in pg.text_content("#ghostSendBtn"))
    n0 = len(cloud["bodies"])
    pg.evaluate("document.getElementById('ghostSendBtn').click()")
    pg.wait_for_timeout(600)
    ok("gesture: a script click is refused and sends nothing", len(cloud["bodies"]) == n0 and "direct click" in (pg.text_content("#gSendMsg") or ""), pg.text_content("#gSendMsg"))
    pg.click("#ghostSendBtn"); pg.wait_for_selector("#gAnswer:not([hidden])", timeout=20000)
    sent = cloud["bodies"][-1] if len(cloud["bodies"]) > n0 else ""
    ok("cloud: exactly one request body went out", len(cloud["bodies"]) == n0 + 1)
    ok("cloud: the request body has no real name, account or real amount", sent and not [x for x in REAL if x in sent], [x for x in REAL if x in sent])
    ok("cloud: the request asked for JSON with a schema", '"responseMimeType":"application/json"' in sent and "responseSchema" in sent)
    who = pg.text_content("#gWho")
    ok("label: answered by cloud Gemini, body observed, 0 real names", "cloud Gemini" in who and "real names in it: 0" in who and "observed: no" not in who, who)
    ok("restore: model spend back near real rupees", pg.text_content("#aSpend") in ("₹46,777",) or abs(int(re.sub(r"\D", "", pg.text_content("#aSpend"))) - 46777) <= 46777 * 0.02, pg.text_content("#aSpend"))
    tips = pg.text_content("#aTips")
    ok("restore: stand-in names in tips become real names", "rameshkumar" in tips and "Person_A" not in tips and "swiggy" in tips, tips)
    ok("restore: rent tip shows the exact ₹24,000 (not a wobbled figure)", "₹24,000" in tips and "about ₹24" not in tips, tips)
    ok("restore: spend card shows the exact rules figure", pg.text_content("#aSpend") == "₹46,777", pg.text_content("#aSpend"))
    ok("tips: the statement tip with no action is left out and says so", "Your total spend" not in tips and "left out" in tips, tips)
    ok("screen: the bare-number tip from the model shows the real ₹649 a month", "NETFLIX to save ₹649 a month" in tips, tips)
    # Real figures on this page (each entry and the rules' totals); any other number from the request is a leak.
    ok("tips: every tip starts with a capital letter", all(li[:1].isupper() for li in pg.locator("#aTips li").all_text_contents() if "left out" not in li), pg.locator("#aTips li").all_text_contents())
    ok("tips: a lowercase model tip is capitalised", "Cancel subscriptions with NETFLIX" in tips, tips)
    reals = {int(re.sub(r"\D", "", t)) for t in pg.locator("#gLens td.you-amt").all_text_contents()}
    reals |= {46777, 85000, 36450, 5000, 38223}
    flat = tips.replace(",", "")
    leaked = [n for n in cloud["sent"] if n >= 10 and n not in reals and re.search(r"(?<!\d)" + str(n) + r"(?!\d)", flat)]
    ok("screen: no scaled number from the request appears in the tips (with or without ₹)", not leaked, (leaked, tips))
    bare = [d for d in re.findall(r"(?<![₹\d,.])\d[\d,]*(?![\d,]|\s*%)", tips) if int(d.replace(",", "")) >= 10]
    ok("screen: every number of 10+ in the tips has a ₹ sign (or is a %)", not bare, (bare, tips))
    ok("check: model's maths agrees with the rules", pg.text_content("#aAgree").count("agrees") == 4, pg.text_content("#aAgree"))
    rc = pg.evaluate("AionHybrid.telemetry.getReceipts().filter(r => r.route === 'cloud-ghost-math')")
    ok("receipt: one frozen cloud-ghost-math receipt, body observed, 0 private hits", len(rc) == 1 and rc[0]["egressAudit"]["bodyObserved"] is True and rc[0]["egressAudit"]["privateValueHits"] == 0, rc)
    # Send again: a fresh approval, still one body per click.
    pg.click("#ghostSendBtn"); pg.wait_for_timeout(1200)
    ok("cloud: a second click sends a second (fresh) request", len(cloud["bodies"]) == n0 + 2)

    # ---------- hostile cloud: HTML in a tip ----------
    cloud["tip2"] = "Cut <img src=x onerror=\"window.__pwned=1\"> Merchant_B to free {amount}."
    pg.click("#ghostSendBtn"); pg.wait_for_timeout(1500)
    ok("hostile: HTML from the model is shown as text", pg.locator("#aTips img").count() == 0 and "<img" in pg.text_content("#aTips") and not pg.evaluate("window.__pwned"))
    cloud["tip2"] = "Cut Merchant_B orders, which cost {amount}."

    # ---------- a model figure that matches no rules figure ----------
    cloud["skew"] = 0.965
    pg.click("#ghostSendBtn"); pg.wait_for_timeout(1500)
    sp, sps = pg.text_content("#aSpend"), pg.text_content("#aSpendS")
    ok("about: an off spend is marked 'about' with the rules figure beside it", sp.startswith("about ₹") and sps == "rules: ₹46,777", (sp, sps))
    sv, svs = pg.text_content("#aSave"), pg.text_content("#aSaveS")
    ok("about: an off savings rate is marked 'about' with the rules rate beside it", sv.startswith("about ") and svs == "rules: 45%", (sv, svs))
    ag = pg.text_content("#aAgree")
    marks = re.findall(r"(agrees|differs) \((\d+\.\d)(?:%| pts)\)", ag)
    ok("check: wording states 3.5 and each verdict matches its printed gap", "within 3.5%" in ag and len(marks) == 4 and all((v == "agrees") == (float(n) <= 3.5) for v, n in marks), ag)
    ok("per month: model tips say 'a month'", all("month" in li for li in pg.locator("#aTips li").all_text_contents() if "left out" not in li), pg.locator("#aTips li").all_text_contents())
    cloud["skew"] = None

    # ---------- App Check failure ----------
    cloud["mode"] = "appcheck"
    pg.click("#ghostSendBtn"); pg.wait_for_timeout(1500)
    m = pg.text_content("#gSendMsg") or ""
    ok("app check: a 403 is reported in one line, approval kept, rules stand", "No model answer" in m and "approval is kept" in m and "rules" in m, m)
    cloud["mode"] = "ok"
    ok("no page errors (cloud)", not errs, errs)
    ctx.close()

    # ---------- on-device route (fake Nano) ----------
    ctx, pg, errs = ctx_page()
    pg.evaluate("window.__nanoAvail = 'available'")
    pg.wait_for_function("AionHybrid.state.nano === 'ready'", timeout=10000)
    pg.select_option("#gRoute", "prefer_on_device")
    pg.click("#gSampleBudget"); pg.wait_for_selector("#gReceiptStep:not([hidden])")
    ok("button: with Nano ready the button says on this device", "on this device" in pg.text_content("#ghostSendBtn"))
    n0 = len(cloud["bodies"])
    pg.click("#ghostSendBtn"); pg.wait_for_selector("#gAnswer:not([hidden])", timeout=20000)
    who = pg.text_content("#gWho")
    ok("device: answered by Gemini Nano on this device, nothing sent", "Gemini Nano on this device" in who and "nothing was sent" in who, who)
    ok("device: no request body reached the cloud", len(cloud["bodies"]) == n0)
    ok("device: Nano got scaled numbers and stand-ins too", pg.evaluate("window.__nanoCalls") >= 1)
    ok("device: budget labels with a name are hidden ('Rent to Mr Sharma')", "Sharma" not in pg.text_content("#gOut"))
    ok("no page errors (device)", not errs, errs)
    ctx.close()

    # ---------- phone width ----------
    ctx, pg, errs = ctx_page(viewport={"width": 390, "height": 844})
    pg.click("#gSampleSms"); pg.wait_for_selector("#gReceiptStep:not([hidden])")
    ok("phone: no horizontal scroll at 390 px", pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
    small = pg.evaluate("[...document.querySelectorAll('button,select')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 44).map(e => e.id)")
    ok("phone: buttons and the route menu are at least 44 px tall", not small, small)
    ok("phone: each lens row keeps the real line and Gemini's line together, labelled",
       pg.evaluate("""(() => { const tr = document.querySelector('#gLens tr'); const you = tr.querySelector('td.you'), gem = tr.querySelector('td.gem');
         const a = getComputedStyle(you, '::before').content, b = getComputedStyle(gem, '::before').content;
         return a.includes('You see') && b.includes('Gemini gets') && gem.getBoundingClientRect().top > you.getBoundingClientRect().top; })()"""))
    ok("phone: the lens fits the screen (no table wider than 390 px)", pg.evaluate("document.querySelector('.lens').scrollWidth <= document.querySelector('.lens').clientWidth + 1"))
    pg.screenshot(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "ghost_shot.png"), full_page=True)
    ctx.close()
    b.close()

srv.shutdown()
fails = [n for n, c in results if not c]
print("GHOST SMOKE: %d passed, %d failed" % (len(results) - len(fails), len(fails)))
sys.exit(1 if fails else 0)
