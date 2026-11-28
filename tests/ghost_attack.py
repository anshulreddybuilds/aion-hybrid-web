"""Ghost-Math attack test (Playwright, headless Chrome). Apache-2.0.
Created by Anshul Reddy (idea and project owner) for #BuildHybridAI 2026.

Run: python tests/ghost_attack.py      (GHOST_ATTACK_PORT overrides the port)
MOCKED: cloud Gemini, App Check and Gemini Nano are fakes here.
Tries to break the page: messy and hostile input, every network request the page
makes checked for real names and amounts, a cloud that is down or hangs, Nano
that returns junk, and phone / tablet sizes.
"""
import sys, json, os, re, threading, http.server, socketserver, functools, random
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public")
PORT = int(os.environ.get("GHOST_ATTACK_PORT", "8143"))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), functools.partial(Q, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{PORT}/ghost.html"

results = []
def ok(name, cond, extra=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (" :: " + str(extra)[:400] if (extra != "" and not cond) else ""))

LINE = re.compile(r"(T\d+) \| (debit|credit) \| ((?:Person|Merchant|Payer|Item)_[A-Z]+) \| (\w+) \| (\d+)")
def honest(lines):
    inc = sp = ref = hous = 0; by = {}
    for _i, d, _w, c, a in lines:
        a = int(a)
        if d == "credit":
            if c == "refund": ref += a
            else: inc += a
        elif c != "savings":
            sp += a; by[c] = by.get(c, 0) + a
            if c in ("rent", "emi"): hous += a
    sp = max(0, sp - ref)
    return {"income": inc, "spend": sp, "breakdown": [{"category": c, "amount": v} for c, v in by.items()],
            "rent_emi_share": hous / inc if inc else (hous / sp if sp else 0), "savings_rate": (inc - sp) / inc if inc else 0,
            "tips": [{"text": "Cut food delivery by a third to save {amount} a month.", "amount": by.get("food", 0) / 3}]}

CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*"}
cloud = {"mode": "ok", "bodies": []}
HUNG = []
def vertex(route):
    r = route.request
    if r.method == "OPTIONS": return route.fulfill(status=204, headers=CORS)
    body = r.post_data or ""
    cloud["bodies"].append(body)
    if cloud["mode"] == "down": return route.abort("internetdisconnected")
    if cloud["mode"] == "hang":   # never answers: the page's 15 s watchdog must stop it
        HUNG.append(route); return None
    if cloud["mode"] == "junk":
        c = {"candidates": [{"content": {"role": "model", "parts": [{"text": "Sorry, here is some prose, not JSON."}]}, "finishReason": "STOP"}]}
    else:
        text = json.loads(body)["contents"][0]["parts"][0]["text"]
        c = {"candidates": [{"content": {"role": "model", "parts": [{"text": json.dumps(honest(LINE.findall(text)))}]}, "finishReason": "STOP"}]}
    return route.fulfill(status=200, headers={**CORS, "content-type": "application/json"}, body=json.dumps(c))
def appcheck(route):
    if route.request.method == "OPTIONS": return route.fulfill(status=204, headers=CORS)
    return route.fulfill(status=200, headers={**CORS, "content-type": "application/json"}, body=json.dumps({"token": "fake", "ttl": "3600s"}))

FAKE_NANO = r"""
window.__nanoAvail = 'unavailable'; window.__nanoReply = null;
window.LanguageModel = {
  availability: async () => window.__nanoAvail,
  create: async (o) => { if (o && o.monitor) { try { const t = new EventTarget(); o.monitor(t); t.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded: 1 })); } catch (e) {} }
    window.__nanoAvail = 'available';
    return { prompt: async () => window.__nanoReply || '{}', promptStreaming: () => new ReadableStream({ start(c) { c.enqueue('x'); c.close(); } }), destroy() {} }; },
};
"""

# A hostile month: HTML and script in names, Hindi, emoji, odd amounts, non-transactions, duplicates.
NAMES = ["Priya Sharma", "Kavitha Raman", "<img src=x onerror=window.__pwned=1>", "Arun <b>Bold</b>", "सीमा देवी", "Zoya 💖", "Mohammed Irfan"]
HOSTILE = "\n".join([
    "Your A/c XX7731 is credited with Rs 92,450.00 on 01-11-26 by NEFT from GLOBEX SOFTWARE PVT LTD. Avl Bal Rs 1,10,000.00",
    "Sent Rs.27,500.00 From HDFC Bank A/C *7731 To Kavitha Raman On 02/11/26 Ref 448811223344",
    "Rs.1,234.56 debited from A/c XX7731 to VPA swiggy@icici (UPI Ref 331200009999).",
    "Sent Rs.999.00 From HDFC Bank A/C *7731 To <img src=x onerror=window.__pwned=1> On 03/11/26 Ref 448811220000",
    "Sent Rs.4,321.00 From HDFC Bank A/C *7731 To Arun <b>Bold</b> On 04/11/26 Ref 448811221111",
    "आपके खाते XX7731 से ₹2,222 डेबिट हुए, UPI bigbasket@ybl को।",
    "Rs 777 bheje Zoya 💖 ko UPI se, A/c XX7731",
    "Spent Rs 13,579 on your SBI Credit Card ending 9911 at FLIPKART on 07/11/26. Avl Lmt Rs 40,000",
    "OTP for txn of Rs 50,000.00 at CROMA is 552211. Do not share it.",
    "Your txn of Rs 8,888.00 to VPA zomato@paytm has FAILED.",
    "Mohammed Irfan has requested money of Rs 6,000 from you on Google Pay.",
    "Refund of Rs 1,111.00 from FLIPKART has been credited to your A/c XX7731.",
    "Rs.1,234.56 debited from A/c XX7731 to VPA swiggy@icici (UPI Ref 331200009999).",
    "this line has no amount at all",
])
REAL_NAMES = ["GLOBEX", "Kavitha", "swiggy", "Arun", "bigbasket", "Zoya", "FLIPKART", "Mohammed", "Irfan", "CROMA", "सीमा"]
REAL_NUMBERS = ["92450", "92,450", "27500", "27,500", "1234.56", "1,234.56", "4321", "4,321", "2222", "2,222", "13579", "13,579", "7731", "9911", "448811"]

with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    def page(**kw):
        ctx = b.new_context(**kw)
        ctx.add_init_script(FAKE_NANO)
        ctx.route("**/firebasevertexai.googleapis.com/**", vertex)
        ctx.route("**/content-firebaseappcheck.googleapis.com/**", appcheck)
        ctx.route("**/www.google.com/recaptcha/**", lambda r: r.abort())
        ctx.route("**/ghost-demo-recording.json", lambda r: r.fulfill(status=404, body=""))
        pg = ctx.new_page()
        log = {"errors": [], "requests": [], "console": []}
        pg.on("console", lambda m: log["console"].append(m.text))
        pg.on("pageerror", lambda e: log["errors"].append(str(e)))
        pg.on("request", lambda r: log["requests"].append({"url": r.url, "body": r.post_data or ""}))
        pg.goto(URL); pg.wait_for_function("window.AionHybrid && window.AionHybrid.ghost", timeout=15000)
        return ctx, pg, log

    # ---------- empty and junk input ----------
    ctx, pg, log = page()
    pg.click("#gRead")
    ok("empty: reading nothing explains what to paste", "Paste some SMS alerts" in pg.text_content("#gReadMsg") and pg.is_hidden("#gLocal"))
    pg.fill("#gInput", "   \n\n   ")
    pg.click("#gRead")
    ok("empty: blank lines are treated as empty", "Paste some SMS alerts" in pg.text_content("#gReadMsg"))
    pg.fill("#gInput", "OTP for txn of Rs 500 at AMAZON is 123456.\nhello")
    pg.click("#gRead")
    m = pg.text_content("#gReadMsg")
    ok("junk: only non-transactions -> nothing counted, and it says why", "No amounts found" in m or "No transactions" in m, m)
    ok("junk: the send button stays off with nothing to send", pg.is_hidden("#gReceiptStep"))
    ctx.close()

    # ---------- the hostile month, end to end, every request inspected ----------
    ctx, pg, log = page()
    pg.select_option("#gRoute", "prefer_in_cloud")
    pg.fill("#gInput", HOSTILE)
    pg.click("#gRead"); pg.wait_for_selector("#gReceiptStep:not([hidden])")
    note = pg.text_content("#gReadMsg")
    ok("hostile: the left-out sentence names OTP, failed, request, duplicate and unreadable lines",
       all(x in note for x in ("one-time password", "failed or declined", "payment request", "repeated message", "no amount we could read")), note)
    ok("hostile: 9 transactions counted (3 non-transactions, 1 duplicate, 1 unreadable left out)", note.startswith("Read 9 transactions"), note)
    ok("hostile: HTML in the input never becomes an element and never runs (anywhere on the page)",
       not pg.evaluate("window.__pwned") and pg.locator("main img, main b").count() == 0 and "<img src=x" in pg.input_value("#gInput"))
    ok("hostile: the refund lowers spending ('after ₹1,111 refunded')", "after ₹1,111 refunded" in pg.text_content("#kSpendS"), pg.text_content("#kSpendS"))
    out = pg.text_content("#gOut")
    ok("hostile: the outgoing text has no real name", not [n for n in REAL_NAMES if n.lower() in out.lower()], [n for n in REAL_NAMES if n.lower() in out.lower()])
    ok("hostile: the outgoing text has no real amount, account or reference", not [n for n in REAL_NUMBERS if re.search(r"(?<![\d,.])" + re.escape(n) + r"(?![\d,])", out)], [n for n in REAL_NUMBERS if n in out])
    ok("hostile: no HTML, emoji or Hindi text leaves", not re.search(r"[<>]|[ऀ-ॿ]|[\U0001F300-\U0001FAFF]", out.split("ENTRIES:")[1]))
    n0 = len(cloud["bodies"])
    pg.click("#ghostSendBtn"); pg.wait_for_selector("#gAnswer:not([hidden])", timeout=20000)
    ok("hostile: one request to Gemini", len(cloud["bodies"]) == n0 + 1)
    allreq = " ".join(r["url"] + " " + r["body"] for r in log["requests"])
    leaks = [n for n in REAL_NAMES if n.lower() in allreq.lower()] + [n for n in REAL_NUMBERS if re.search(r"(?<![\d,.])" + re.escape(n) + r"(?![\d,])", allreq)]
    ok("network: across EVERY request the page made, no real name or amount appears", not leaks, leaks)
    hosts = sorted({re.sub(r"^https?://([^/]+).*$", r"\1", r["url"]) for r in log["requests"] if r["url"].startswith("http")})
    ok("network: the page only talks to itself, App Check / reCAPTCHA and the Gemini endpoint",
       all(h.startswith("127.0.0.1") or h in ("firebasevertexai.googleapis.com", "content-firebaseappcheck.googleapis.com", "www.google.com", "www.gstatic.com") for h in hosts), hosts)
    tips = pg.text_content("#aTips")
    ok("hostile: restored tips have real rupees and no stand-ins", "Merchant_" not in tips and "Person_" not in tips and "₹" in tips, tips)
    ok("hostile: the check agrees on all four figures", pg.text_content("#aAgree").count("agrees") == 4, pg.text_content("#aAgree"))
    stored = pg.evaluate("""(async () => {
      const ls = Object.keys(localStorage).map(k => k + '=' + localStorage.getItem(k)).join(' ');
      const ss = Object.keys(sessionStorage).map(k => k + '=' + sessionStorage.getItem(k)).join(' ');
      let idb = '';
      try { const dbs = indexedDB.databases ? await indexedDB.databases() : []; idb = dbs.map(d => d.name).join(' '); } catch (e) {}
      const caches_ = (self.caches ? (await caches.keys()).join(' ') : '');
      return ls + ' | ' + ss + ' | ' + idb + ' | ' + caches_; })()""")
    ok("storage: nothing about the month is stored in the browser (local/session storage, IndexedDB, caches)",
       not [n for n in REAL_NAMES + REAL_NUMBERS if n.lower() in stored.lower()], stored[:300])
    ok("console: no real name or amount is printed to the console", not [n for n in REAL_NAMES + REAL_NUMBERS if n.lower() in " ".join(log["console"]).lower()])
    ok("hostile: no page errors", not log["errors"], log["errors"])

    # ---------- cloud down, cloud hanging, junk answer ----------
    cloud["mode"] = "down"
    pg.click("#ghostSendBtn"); pg.wait_for_timeout(2500)
    msg = pg.text_content("#gSendMsg") or ""
    ok("down: a network failure is one line, the approval is kept, the rules stand", "No model answer" in msg and "approval is kept" in msg and pg.is_visible("#gLocal"), msg)
    cloud["mode"] = "junk"
    pg.click("#ghostSendBtn"); pg.wait_for_timeout(2500)
    msg = pg.text_content("#gSendMsg") or ""
    ok("junk answer: prose instead of JSON is reported, nothing is restored", "not in the JSON shape" in msg, msg)
    cloud["mode"] = "hang"
    pg.click("#ghostSendBtn")
    pg.wait_for_function("(document.getElementById('gSendMsg').textContent || '').includes('timeout')", timeout=25000)
    ok("hang: a cloud that never answers is stopped by the 15 s watchdog, with the approval kept", "approval is kept" in pg.text_content("#gSendMsg"), pg.text_content("#gSendMsg"))
    ok("hang: the send button is usable again", pg.is_enabled("#ghostSendBtn"))
    cloud["mode"] = "ok"
    for r in HUNG:
        try: r.abort()
        except Exception: pass
    ctx.close()

    # ---------- on-device: download button, junk from Nano, then a good answer ----------
    ctx, pg, log = page()
    pg.evaluate("window.__nanoAvail = 'downloadable'")
    pg.wait_for_function("AionHybrid.state.nano === 'downloadable'", timeout=10000)
    pg.wait_for_timeout(2200)
    ok("nano: when Chrome can download Nano, a Get Gemini Nano button shows", pg.is_visible("#gNanoBtn"))
    pg.click("#gNanoBtn")
    pg.wait_for_function("AionHybrid.state.nano === 'ready'", timeout=15000)
    pg.wait_for_timeout(2200)
    ok("nano: after the download the button goes away and the pill says ready", pg.is_hidden("#gNanoBtn") and "ready" in pg.text_content("#gNano"), pg.text_content("#gNano"))
    pg.select_option("#gRoute", "only_on_device")
    pg.click("#gSampleSms"); pg.wait_for_selector("#gReceiptStep:not([hidden])")
    pg.evaluate("window.__nanoReply = 'not json at all'")
    n0 = len(cloud["bodies"])
    pg.click("#ghostSendBtn"); pg.wait_for_timeout(2000)
    ok("nano junk: reported, nothing restored, nothing sent to the cloud", "not in the JSON shape" in (pg.text_content("#gSendMsg") or "") and len(cloud["bodies"]) == n0)
    good = pg.evaluate("""(() => { const t = document.getElementById('gOut').textContent; const re = /(T\\d+) \\| (debit|credit) \\| (\\w+) \\| (\\w+) \\| (\\d+)/g; let x, inc = 0, sp = 0, h = 0, by = {};
      while ((x = re.exec(t))) { const a = +x[5]; if (x[2] === 'credit') inc += a; else if (x[4] !== 'savings') { sp += a; by[x[4]] = (by[x[4]] || 0) + a; if (x[4] === 'rent' || x[4] === 'emi') h += a; } }
      return JSON.stringify({ income: inc, spend: sp, breakdown: Object.keys(by).map(c => ({ category: c, amount: by[c] })), rent_emi_share: h / inc, savings_rate: (inc - sp) / inc,
        tips: [{ text: 'Cancel Merchant_C to save {amount} a month.', amount: by.subscriptions || 0 }] }); })()""")
    pg.evaluate("r => { window.__nanoReply = r; }", good)
    pg.click("#ghostSendBtn"); pg.wait_for_selector("#gAnswer:not([hidden])", timeout=20000)
    ok("nano: answered on this device, labelled so, nothing sent", "Gemini Nano on this device" in pg.text_content("#gWho") and "nothing was sent" in pg.text_content("#gWho") and len(cloud["bodies"]) == n0, pg.text_content("#gWho"))
    ok("nano: no request body toggle (there was no request)", pg.is_hidden("#gBodyBox"))
    ok("nano: no page errors", not log["errors"], log["errors"])
    ctx.close()

    # ---------- keyboard only, reduced motion ----------
    ctx, pg, log = page(reduced_motion="reduce")
    pg.select_option("#gRoute", "prefer_in_cloud")
    pg.focus("#gSampleSms"); pg.keyboard.press("Enter")
    pg.wait_for_selector("#gReceiptStep:not([hidden])")
    n0 = len(cloud["bodies"])
    pg.focus("#ghostSendBtn"); pg.keyboard.press("Enter")
    pg.wait_for_selector("#gAnswer:not([hidden])", timeout=20000)
    ok("keyboard: Enter on the buttons reads the sample and sends it (a key press is a real click)", len(cloud["bodies"]) == n0 + 1)
    pg.focus("#gBodySum"); pg.keyboard.press("Enter")
    ok("keyboard: the request-body toggle opens with Enter", pg.evaluate("document.getElementById('gBodyBox').open"))
    pg.evaluate("window.__ghostDemoSpeed = 60")
    pg.focus("#ghostDemoBtn"); pg.keyboard.press("Enter")
    pg.wait_for_function("!document.getElementById('gCap').hidden", timeout=5000)
    pg.keyboard.press("Escape")
    pg.wait_for_function("document.getElementById('gCap').hidden && !document.getElementById('ghostDemoBtn').disabled", timeout=5000)
    ok("keyboard + reduced motion: the demo starts with Enter and Esc stops it", True)
    ok("reduced motion: no page errors", not log["errors"], log["errors"])
    ctx.close()

    # ---------- sizes ----------
    for w, h in ((320, 640), (360, 740), (412, 915), (768, 1024), (844, 390)):
        ctx, pg, log = page(viewport={"width": w, "height": h})
        pg.click("#gSampleSms"); pg.wait_for_selector("#gReceiptStep:not([hidden])")
        pg.evaluate("window.__ghostDemoSpeed = 60")
        over = pg.evaluate("document.documentElement.scrollWidth - window.innerWidth")
        small = pg.evaluate("[...document.querySelectorAll('button,select,summary')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 44).map(e => e.id || e.textContent.trim().slice(0, 20))")
        pg.click("#ghostDemoBtn"); pg.wait_for_function("!document.getElementById('gCap').hidden", timeout=5000)
        cap = pg.evaluate("(() => { const r = document.querySelector('.cap-in').getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom, h: r.height, vw: innerWidth, vh: innerHeight }; })()")
        pg.click("#gCapStop")
        ok(f"size {w}x{h}: no sideways scrolling", over <= 1, over)
        ok(f"size {w}x{h}: every button and the route menu is at least 44 px tall", not small, small)
        ok(f"size {w}x{h}: the caption fits on screen and covers under half of it", cap["left"] >= 0 and cap["right"] <= cap["vw"] + 1 and cap["bottom"] <= cap["vh"] + 1 and cap["h"] < cap["vh"] * 0.5, cap)
        ctx.close()
    b.close()
srv.shutdown()
fails = [n for n, c in results if not c]
print("GHOST ATTACK: %d passed, %d failed" % (len(results) - len(fails), len(fails)))
sys.exit(1 if fails else 0)
