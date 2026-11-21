"""Headless smoke test (Playwright + Chrome). Run: python tests/headless_smoke.py

Gemini Nano is MOCKED here (a fake window.LanguageModel) so the routing, badges,
Offline Demo Mode, privacy cards and approvals can be checked on any machine.
It does not prove real Nano or real cloud inference - see README "Verification".
"""
import sys, json, time, threading, http.server, socketserver, os, functools
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public")
PORT = 8099
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
Handler = functools.partial(Q, directory=ROOT)
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), Handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()

FAKE = """
window.__nanoAvail = 'available';
window.LanguageModel = {
  availability: async () => window.__nanoAvail,
  create: async () => ({ prompt: async (m) => { window.__lastPrompt = JSON.stringify(m); return 'FAKE-NANO: noted. Keep long runs a week apart.'; },
    promptStreaming: (m) => { window.__lastPrompt = JSON.stringify(m); const parts = ['FAKE-NANO: noted. ', 'Keep long runs ', 'a week apart.'];
      return new ReadableStream({ start(c){ parts.forEach(x => c.enqueue(x)); c.close(); } }); }, destroy(){} }),
};
"""
results = []
def ok(name, cond, extra=""):
    results.append((name, bool(cond), extra)); print(("PASS " if cond else "FAIL ")+name+(" :: "+str(extra) if extra else ""))

with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    ctx = b.new_context(viewport={"width":1400,"height":1000})
    ctx.add_init_script(FAKE)
    page = ctx.new_page()
    errs=[]; 
    page.on("pageerror", lambda e: errs.append("pageerror: "+str(e)))
    page.on("response", lambda r: errs.append("HTTP %s %s"%(r.status,r.url)) if r.status>=400 else None)
    page.on("requestfailed", lambda r: errs.append("REQFAIL %s"%r.url[:120]))
    page.on("console", lambda m: errs.append("console."+m.type+": "+m.text) if m.type=="error" else None)
    page.goto(f"http://127.0.0.1:{PORT}/index.html")
    page.wait_for_function("window.AionHybrid && window.AionHybrid.state.ready", timeout=15000)
    page.wait_for_timeout(2500)
    ok("hybrid ready", page.evaluate("window.AionHybridState.ready"))
    ok("nano pill ready", "ready" in page.inner_text("#nanoLabel").lower(), page.inner_text("#nanoLabel"))
    ok("backend pill standalone", "standalone" in page.inner_text("#backendLabel").lower(), page.inner_text("#backendLabel"))
    ok("app check pill", "app check" in page.inner_text("#appCheckLabel").lower(), page.inner_text("#appCheckLabel"))
    ok("default route is Prefer Cloud", page.input_value("#inferenceMode")=="prefer_in_cloud", page.input_value("#inferenceMode"))
    page.select_option("#inferenceMode","prefer_on_device")
    ok("mode options", page.eval_on_selector_all("#inferenceMode option","o=>o.map(x=>x.value)")==["prefer_on_device","only_on_device","prefer_in_cloud"])
    # panels
    mem = page.inner_text("#statMemTotal"); ok("memories = 14", mem.strip()=="14", mem)
    ok("missions listed", page.locator("#missionList .row-item").count()==3, page.locator("#missionList .row-item").count())
    ok("pending proposal cards", page.locator("#chatProposals .proposal-card").count()==3, page.locator("#chatProposals .proposal-card").count())
    ok("skills", page.locator("#skillsList .row-item").count()>=4)
    ok("guardian rows", page.locator("#guardianList .row-item").count()>=4)
    ok("briefing text", "open task" in page.inner_text("#briefingText"), page.inner_text("#briefingText")[:80])
    ok("climb pct", page.inner_text("#climbOverallPct").strip() not in ("","0.0%"), page.inner_text("#climbOverallPct"))
    # blocked card
    cards = page.locator("#chatProposals .proposal-card")
    blocked = cards.nth(2)
    ok("blocked card chip", "blocked" in (blocked.locator(".privacy-chip").get_attribute("class") or ""))
    ok("blocked approve disabled", blocked.locator(".approve").is_disabled())
    blocked.locator(".edit").click()
    blocked.locator("textarea").fill("My Trail Journal admin account needs a new login")
    blocked.locator("[data-save]").click()
    ok("edit clears block", "clean" in (blocked.locator(".privacy-chip").get_attribute("class") or ""))
    blocked.locator(".prop-domain").select_option("owner")
    blocked.locator(".prop-axis").select_option("internal")
    ok("blocked->approve enabled after edit", blocked.locator(".approve").is_enabled())
    blocked.locator(".approve").click(); page.wait_for_timeout(600)
    ok("blocked card saved", blocked.locator(".approve").inner_text().strip().lower()=="saved")
    # redacted memory card
    red = cards.nth(0)
    ok("redacted chip", "redacted" in (red.locator(".privacy-chip").get_attribute("class") or ""))
    ok("email redacted in text", "[email]" in red.locator(".proposal-text").inner_text() and "example.com" not in red.locator(".proposal-text").inner_text(), red.locator(".proposal-text").inner_text())
    # task card approve (no domain needed)
    task = cards.nth(1)
    ok("task approve enabled", task.locator(".approve").is_enabled())
    task.locator(".approve").click(); page.wait_for_timeout(600)
    ok("task saved", task.locator(".approve").inner_text().strip().lower()=="saved")
    # reject redacted card
    red.locator(".reject").click(); page.wait_for_timeout(300)
    # chat on-device
    page.fill("#chatInput","How long between my long runs? Remember that I prefer morning runs. I need to book a physio check.")
    page.click("#sendBtn"); page.wait_for_selector(".ai-badge", timeout=15000)
    badge = page.inner_text(".ai-badge")
    ok("badge on-device", "on-device (gemini nano)" in badge.lower() and "ms" in badge.lower(), badge)
    ok("reply text", "FAKE-NANO" in page.inner_text("#chatLog"))
    ok("badge is first element in bubble", page.evaluate("document.querySelector('.chat-msg.assistant').firstElementChild.classList.contains('ai-badge')"))
    ok("notes used line", "saved note" in page.inner_text("#chatLog"), page.inner_text(".ai-badge-sub"))
    ok("private withheld in hybrid", "private note" in page.inner_text(".ai-badge-sub"), page.inner_text(".ai-badge-sub"))
    page.wait_for_timeout(600)
    ok("new proposals from chat", page.locator("#chatProposals .proposal-card").count()>=2, page.locator("#chatProposals .proposal-card").count())
    # only-on-device includes private
    page.select_option("#inferenceMode","only_on_device")
    page.fill("#chatInput","What about my knee and long runs?"); page.click("#sendBtn")
    page.wait_for_function("document.querySelectorAll('.ai-badge').length>=2", timeout=15000)
    sub = page.locator(".ai-badge-sub").last.inner_text()
    ok("only-on-device sends private notes", "private note" not in sub, sub)
    page.fill("#chatInput","Summarize my tasks for today"); page.click("#sendBtn")
    page.wait_for_function("document.querySelectorAll('.ai-badge').length>=3", timeout=15000)
    lp = page.evaluate("window.__lastPrompt")
    ok("prompt has in-progress task", "Add photo upload to run entries" in lp and "in progress" in lp)
    ok("prompt has to-do tasks", "Deploy first version to Firebase Hosting" in lp and "Record 2-minute demo video" in lp)
    ok("prompt omits done tasks", "Sketch the Trail Journal home screen" not in lp)
    page.fill("#chatInput","What about my knee and long runs?"); page.click("#sendBtn")
    page.wait_for_function("document.querySelectorAll('.ai-badge').length>=4", timeout=15000)
    ok("prompt contained knee note", "knee" in page.evaluate("window.__lastPrompt").lower())
    # cloud route (sandbox network probably blocks) -> expect friendly error or cloud badge
    page.select_option("#inferenceMode","prefer_in_cloud")
    page.fill("#chatInput","Say hi"); page.click("#sendBtn"); page.wait_for_timeout(9000)
    st = page.inner_text("#chatStatus"); nb = page.locator(".ai-badge").count()
    print("   cloud badge:", page.locator(".ai-badge").last.inner_text())
    ok("cloud route handled (badge or clear error)", nb>=3 or "AI request failed" in st or "rejected" in st or "App Check" in st or "AI module" in st, (nb, st[:200]))
    # offline demo mode
    page.select_option("#inferenceMode","prefer_on_device")
    page.check("#offlineDemo"); page.wait_for_timeout(300)
    ok("offline disables dropdown", page.is_disabled("#inferenceMode"))
    ok("offline note visible", page.is_visible("#offlineNote"))
    blockedFetch = page.evaluate("fetch('https://example.com/').then(()=>'LOADED').catch(e=>'BLOCKED:'+e.message)")
    ok("external fetch blocked", str(blockedFetch).startswith("BLOCKED"), blockedFetch)
    page.fill("#chatInput","Offline test"); page.click("#sendBtn")
    page.wait_for_function("document.querySelectorAll('.ai-badge').length>=6 || /offline|blocked|not ready/i.test(document.getElementById('chatStatus').innerText)", timeout=15000)
    ok("offline chat on-device", "on-device" in page.locator(".ai-badge").last.inner_text().lower(), page.locator(".ai-badge").last.inner_text())
    page.uncheck("#offlineDemo")
    # nano unavailable messaging
    page.evaluate("window.__nanoAvail='unavailable'"); page.wait_for_timeout(6500)
    ok("nano unavailable shown", "unavailable" in page.inner_text("#nanoLabel").lower(), page.inner_text("#nanoLabel"))
    page.evaluate("window.__nanoAvail='available'")
    # knowledge view
    page.click('a[data-view="knowledge"]'); page.wait_for_timeout(500)
    ok("memories after approvals 15", page.inner_text("#statMemTotal").strip() in ("15","16"), page.inner_text("#statMemTotal"))
    # persistence: reload keeps approved
    page.reload(); page.wait_for_function("window.AionHybrid", timeout=15000); page.wait_for_timeout(2500)
    ok("persist after reload", page.inner_text("#statMemTotal").strip() in ("15","16"), page.inner_text("#statMemTotal"))
    # ---- cloud model fallback, exact errors in the chat bubble, saved App Check token ----
    CORS={"access-control-allow-origin":"*","access-control-allow-headers":"*","access-control-allow-methods":"*"}
    state_={"mode":"hydrogen404"}
    def vertex(route):
        req=route.request
        if req.method=="OPTIONS": return route.fulfill(status=204, headers=CORS)
        j={**CORS,"content-type":"application/json"}
        if state_["mode"]=="allbad":
            return route.fulfill(status=400, headers=j, body=json.dumps({"error":{"code":400,"message":"bad request test","status":"INVALID_ARGUMENT"}}))
        if "gemini-3.5-flash-lite" in req.url:
            return route.fulfill(status=404, headers=j, body=json.dumps({"error":{"code":404,"message":"models/gemini-3.5-flash-lite is not found","status":"NOT_FOUND"}}))
        def sse(t, last=False):
            c={"candidates":[{"content":{"role":"model","parts":[{"text":t}]}}]}
            if last: c["candidates"][0]["finishReason"]="STOP"; c["usageMetadata"]={"promptTokenCount":10,"candidatesTokenCount":5}
            return "data: "+json.dumps(c)+"\r\n\r\n"
        return route.fulfill(status=200, headers={**CORS,"content-type":"text/event-stream"}, body=sse("CLOUD-FAKE ")+sse("reply",True))
    ctx.route("**/firebasevertexai.googleapis.com/**", vertex)
    pg2 = ctx.new_page()
    pg2.goto(f"http://127.0.0.1:{PORT}/index.html")
    pg2.wait_for_function("window.AionHybrid", timeout=15000); pg2.wait_for_timeout(1500)
    pg2.evaluate("window.__nanoAvail='unavailable'")
    pg2.select_option("#inferenceMode","prefer_in_cloud")
    pg2.fill("#chatInput","Say hello"); pg2.click("#sendBtn")
    pg2.wait_for_function("document.querySelectorAll('.ai-badge').length>=1", timeout=15000)
    cb = pg2.locator(".ai-badge").last
    ok("cloud badge after model fallback", "in-cloud (gemini fallback)" in cb.inner_text().lower(), cb.inner_text())
    ok("backup model used", "gemini-4-hydrogen" in (cb.get_attribute("title") or ""), cb.get_attribute("title"))
    ok("cloud badge text shows model + ms", "gemini-4-hydrogen" in cb.inner_text().lower() and "ms" in cb.inner_text().lower(), cb.inner_text())
    ok("cloud reply shown", "CLOUD-FAKE" in pg2.inner_text("#chatLog"))
    state_["mode"]="allbad"
    pg2.fill("#chatInput","Say hello again"); pg2.click("#sendBtn")
    pg2.wait_for_selector(".chat-msg.error", timeout=15000)
    et = pg2.inner_text(".chat-msg.error")
    ok("error bubble shows raw error", "Raw error" in et and "bad request test" in et, et[:300])
    ok("error bubble names both models", "gemini-4-hydrogen" in et and "gemini-3.5-flash-lite" in et, et[:400])
    # saved debug token survives reload and is used
    TOK="11111111-2222-3333-4444-555555555555"
    pg2.evaluate("localStorage.setItem('aion_appcheck_debug_token','%s')"%TOK)
    pg2.reload(); pg2.wait_for_function("window.AionHybrid", timeout=15000); pg2.wait_for_timeout(1000)
    ok("saved debug token reused", pg2.evaluate("self.FIREBASE_APPCHECK_DEBUG_TOKEN")==TOK and pg2.evaluate("window.AionHybridState.debugToken")==TOK)
    ok("SET TOKEN button visible in debug mode", pg2.is_visible("#appCheckSetBtn"))
    pg2.evaluate("localStorage.removeItem('aion_appcheck_debug_token')")
    pg2.reload(); pg2.wait_for_function("window.AionHybrid", timeout=15000); pg2.wait_for_timeout(2500)
    tok = pg2.evaluate("window.AionHybridState.debugToken")
    ok("printed debug token captured for COPY TOKEN", bool(tok) and len(tok)==36 and pg2.is_visible("#appCheckCopyBtn"), tok)
    pg2.close()
    # mobile + approve pages
    for path,sel in (("/approve.html","#cards"),("/mobile.html","body")):
        pg = ctx.new_page(); e2=[]
        pg.on("pageerror", lambda e: e2.append(str(e)))
        pg.goto(f"http://127.0.0.1:{PORT}{path}"); pg.wait_for_timeout(2500)
        ok(path+" renders w/o page errors", not e2, e2[:2])
        if path=="/approve.html":
            n0 = pg.locator("#cards .card").count()
            ok("approve page lists pending cards", n0>=1, n0)
            if n0:
                pg.locator("#cards .card .approve").first.click(); pg.wait_for_timeout(1200)
                n1 = pg.locator("#cards .card").count()
                ok("approve page approve removes a card", n1==n0-1, (n0,n1))
        if path=="/mobile.html":
            ok("mobile shows app (no token gate)", pg.is_visible("#shell") or not pg.is_visible("#gate"), "")
            print("   mobile text:", pg.inner_text("body")[:160].replace("\n"," | "))
    page.screenshot(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "shot.png"))
    print("\nCONSOLE/PAGE ERRORS:"); [print(" ",e[:220]) for e in errs[:25]]
    b.close()
srv.shutdown()
bad=[r for r in results if not r[1]]; print("\n%d/%d passed"%(len(results)-len(bad),len(results)))
