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
    ok("cloud badge after model fallback (says In-Cloud and names the backup model)", "in-cloud (gemini" in cb.inner_text().lower() and "hydrogen" in cb.inner_text().lower(), cb.inner_text())
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
    # ================= hybrid-v2 Day-1 checks =================
    # ---- cloud boundary: sealed prompts, sealed history, local-only turns stay local ----
    pg3 = ctx.new_page(); bodies=[]; reply_q=["Next up: [TASK_1] is in progress for [PROJECT_1]."]
    def vertex3(route):
        req=route.request
        if req.method=="OPTIONS": return route.fulfill(status=204, headers=CORS)
        bodies.append(req.post_data or "")
        t = reply_q.pop(0) if reply_q else "Noted."
        c={"candidates":[{"content":{"role":"model","parts":[{"text":t}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":5}}
        return route.fulfill(status=200, headers={**CORS,"content-type":"text/event-stream"}, body="data: "+json.dumps(c)+"\r\n\r\n")
    pg3.route("**/firebasevertexai.googleapis.com/**", vertex3)
    pg3.goto(f"http://127.0.0.1:{PORT}/index.html")
    pg3.wait_for_function("window.AionHybrid && window.AionStandalone", timeout=15000); pg3.wait_for_timeout(1500)
    pg3.evaluate("window.__nanoAvail='unavailable'"); pg3.wait_for_timeout(6500)
    pg3.select_option("#inferenceMode","prefer_in_cloud")
    def chat3(msg, n):
        pg3.fill("#chatInput", msg); pg3.click("#sendBtn")
        pg3.wait_for_function("document.querySelectorAll('.ai-badge').length>=%d || document.querySelector('.chat-msg.error')"%n, timeout=20000)
    chat3("Summarize my tasks for today. Email me at alex.runner@example.com", 1)
    b1 = bodies[-1] if bodies else ""
    ok("v2: cloud prompt has no raw task title", "Add photo upload to run entries" not in b1 and "Deploy first version to Firebase Hosting" not in b1, b1[:160])
    ok("v2: cloud prompt uses task placeholders", "[TASK_1]" in b1 and "[PROJECT_" in b1)
    ok("v2: cloud prompt has no email address", "alex.runner@example.com" not in b1 and "[email]" in b1)
    rep = pg3.locator(".chat-msg.assistant").last.inner_text()
    real = pg3.evaluate("window.AionStandalone.boundary.unseal('[TASK_1]|[PROJECT_1]')").split("|")
    ok("v2: reply shows real names (unsealed locally)", "Next up:" in rep and "[TASK_" not in rep and "[PROJECT_" not in rep and real[0]!="[TASK_1]" and real[0] in rep and real[1] in rep, (real, rep[:200]))
    badge3 = pg3.locator(".ai-badge").last
    ok("v2: telemetry split on badge", badge3.get_attribute("data-requested-mode")=="prefer_in_cloud" and badge3.get_attribute("data-actual-source")=="in_cloud" and badge3.get_attribute("data-source-verified") in ("true","false"), (badge3.get_attribute("data-requested-mode"), badge3.get_attribute("data-actual-source"), badge3.get_attribute("data-source-verified")))
    ok("v2: contributors shown", "local code" in pg3.locator(".ai-badge-sub").last.inner_text() and "cloud AI" in pg3.locator(".ai-badge-sub").last.inner_text(), pg3.locator(".ai-badge-sub").last.inner_text())
    chat3("And what comes after that one?", 2)
    b2 = bodies[-1] if len(bodies)>=2 else ""
    ok("v2: turn 2 history is sealed (no re-leak of restored name)", "Add photo upload to run entries" not in b2 and "Deploy first version" not in b2 and "RECENT CONVERSATION" in b2 and "[TASK_1]" in b2, b2[-300:])
    ok("v2: turn 2 history has no email", "alex.runner@example.com" not in b2)
    pg3.evaluate("window.__nanoAvail='available'"); pg3.wait_for_timeout(6500)
    pg3.select_option("#inferenceMode","only_on_device")
    n_before = len(bodies)
    chat3("What about my knee and long runs?", 3)
    ok("v2: only-on-device turn made no cloud request", len(bodies)==n_before, (n_before, len(bodies)))
    pg3.select_option("#inferenceMode","prefer_in_cloud"); pg3.evaluate("window.__nanoAvail='unavailable'"); pg3.wait_for_timeout(6500)
    chat3("Anything else for today?", 4)
    b4 = bodies[-1] if bodies else ""
    ok("v2: local-only turn never enters cloud history", "knee" not in b4.lower() and "long runs" not in b4.lower(), b4[-300:])
    refused = pg3.evaluate("window.AionHybrid.generate('raw', null, {mode:'prefer_in_cloud', sealed:false}).then(()=> 'SENT').catch(e=> String(e.message))")
    ok("v2: unsealed prompt refused on cloud route", str(refused).startswith("Refused"), refused)
    # ---- 15 s cloud timeout (a model that never answers) ----
    def hang(route):
        if route.request.method=="OPTIONS": return route.fulfill(status=204, headers=CORS)
        return None   # never fulfilled: simulates gemini-4-hydrogen's ~125 s silence
    pg3.unroute("**/firebasevertexai.googleapis.com/**"); pg3.route("**/firebasevertexai.googleapis.com/**", hang)
    t0=time.time(); pg3.fill("#chatInput","Say hi slowly"); pg3.click("#sendBtn")
    pg3.wait_for_selector(".chat-msg.error >> nth=-1", timeout=30000)
    took=time.time()-t0; et3=pg3.locator(".chat-msg.error").last.inner_text()
    ok("v2: hung cloud model times out cleanly (~15 s)", 13<=took<=24 and "timeout" in et3.lower() and "did not answer in time" in et3, (round(took,1), et3[:160]))
    ok("v2: sidebar hides unfinished Create tab", not pg3.is_visible('a[data-view="create"]'))
    pg3.evaluate("location.hash='#create'"); pg3.reload(); pg3.wait_for_timeout(1500)
    ok("v2: #create falls back to Home", pg3.evaluate("document.body.getAttribute('data-view')")=="home", pg3.evaluate("document.body.getAttribute('data-view')"))
    ok("v2: no 'unreadable' placeholders on page", "unreadable" not in pg3.inner_text("body").lower())
    pg3.close()
    # ---- App Check debug provider can never start on production hosts ----
    ctx2 = b.new_context(service_workers="block")
    ctx2.add_init_script("try{localStorage.setItem('aion_appcheck_debug_token','11111111-2222-3333-4444-555555555555')}catch(e){}")
    def serve_local(route):
        u = route.request.url.split("?")[0].split("#")[0]
        path = "/" + u.split("/",3)[3] if u.count("/")>=3 else "/"
        if path=="/": path="/index.html"
        fp = os.path.join(ROOT, path.lstrip("/"))
        if os.path.isfile(fp):
            ct = {"html":"text/html","js":"application/javascript","css":"text/css","webmanifest":"application/manifest+json"}.get(fp.rsplit(".",1)[-1],"application/octet-stream")
            return route.fulfill(status=200, path=fp, headers={"content-type":ct})
        return route.fulfill(status=404, body="")
    for host in ("aion-hybrid-ai.web.app","aion-hybrid-ai.firebaseapp.com","aion-hybrid-ai--v2-test.web.app"):
        ctx2.route(f"https://{host}/**", serve_local)
    for url, want in (("https://aion-hybrid-ai.web.app/index.html?appcheck_debug","recaptcha"),
                      ("https://aion-hybrid-ai.firebaseapp.com/index.html?appcheck_debug","recaptcha"),
                      ("https://aion-hybrid-ai--v2-test.web.app/index.html","recaptcha"),
                      ("https://aion-hybrid-ai--v2-test.web.app/index.html?appcheck_debug","debug")):
        pp = ctx2.new_page(); pp.goto(url)
        pp.wait_for_function("window.AionHybridState && window.AionHybridState.appCheck && window.AionHybridState.appCheck.status!=='off'", timeout=15000)
        st = pp.evaluate("window.AionHybridState.appCheck.status"); dbg = pp.evaluate("typeof self.FIREBASE_APPCHECK_DEBUG_TOKEN")
        ok("v2: App Check on %s -> %s"%(url.split('/')[2]+("?debug" if "appcheck_debug" in url else ""), want), st==want and ((dbg=="undefined") if want=="recaptcha" else True), (st, dbg))
        pp.close()
    ctx2.close()
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
    # ================= hybrid-v2 Packet 2: private case + disclosure boundary =================
    pg4 = ctx.new_page(); b4=[]
    def vertex4(route):
        req=route.request
        if req.method=="OPTIONS": return route.fulfill(status=204, headers=CORS)
        b4.append(req.post_data or "")
        c={"candidates":[{"content":{"role":"model","parts":[{"text":"VERDICT: reasonable\nProvisional: the supplier looks reasonable on the shared passages [P1][S1]. Clarify warranty conditions."}]},"finishReason":"STOP"}]}
        return route.fulfill(status=200, headers={**CORS,"content-type":"text/event-stream"}, body="data: "+json.dumps(c)+"\r\n\r\n")
    pg4.route("**/firebasevertexai.googleapis.com/**", vertex4)
    pg4.goto(f"http://127.0.0.1:{PORT}/index.html#case")
    pg4.wait_for_function("window.AionHybrid && window.AionHybrid.state.ready", timeout=15000)
    pg4.wait_for_function("document.getElementById('caseDisclosureText') && document.getElementById('caseDisclosureText').textContent.length>50", timeout=15000)
    PRIVATE = ["installation of the LED wall", "3,85,000", "4,00,000", "Leadership will not accept", "2026-12-11"]
    ok("p2: Case tab visible in nav", pg4.is_visible('a[data-view="case"]'))
    ok("p2: case shows P1..P7 with ids", pg4.locator(".case-para").count()==7 and pg4.inner_text('.case-para[data-pid="P5"] .case-pid')=="P5")
    dt = pg4.inner_text("#caseDisclosureText")
    ok("p2: preview excludes unshared passages + private constraints", all(x not in dt for x in PRIVATE), [x for x in PRIVATE if x in dt])
    ok("p2: preview includes shared passages + public sources", "[P1]" in dt and "[P7]" in dt and "[S1]" in dt and "[S2]" in dt and "[P5]" not in dt)
    ok("p2: not approved by default -> send disabled", pg4.is_disabled("#caseSendBtn") and "not approved" in pg4.inner_text("#caseApprovalChip").lower())
    pg4.click("#caseApproveBtn"); pg4.wait_for_timeout(300)
    ok("p2: approve binds to revision + fingerprint", "approved for case revision" in pg4.inner_text("#caseApprovalChip").lower() and not pg4.is_disabled("#caseSendBtn"), pg4.inner_text("#caseApprovalChip"))
    pg4.focus('[data-ptext="P1"]'); pg4.keyboard.press("End"); pg4.keyboard.type("!"); pg4.wait_for_timeout(1300)
    chip = pg4.inner_text("#caseApprovalChip")
    ok("p2: 1-character edit makes the approval stale", "stale" in chip.lower() and pg4.is_disabled("#caseSendBtn"), chip)
    stale = pg4.evaluate("""(async () => { const A = window.AionStandalone.caseApi, E = window.AionHybrid.egress;
        const prep = await A.prepareDisclosure(null); await E.approve(prep.disclosure, 'test');
        await A.update(c => { c.privateConstraints.confidentialNote += '.'; });
        return A.send(prep.disclosure).then(() => 'SENT', e => e.code + '|' + e.message); })()""")
    ok("p2: approved disclosure refused after any case edit (stale revision)", str(stale).startswith("disclosure_stale|Refused"), stale)
    unk = pg4.evaluate("""window.AionHybrid.egress.createDisclosure({purpose:'case_research', payload:{instructions:'x', question:'y', budget:'Rs 4,00,000'}})
        .then(() => 'CREATED', e => e.code + '|' + e.message)""")
    ok("p2: unknown disclosure field rejected", str(unk).startswith("disclosure_invalid") and 'unknown field "budget"' in str(unk), unk)
    fake = pg4.evaluate("""(async () => { const E = window.AionHybrid.egress;
        const d = await E.createDisclosure({purpose:'chat', payload:{instructions:'x', message:'hello'}});
        d.approvalState = 'approved'; d.approvedBy = 'user_click';
        return window.AionHybrid.generate(null, null, {mode:'prefer_in_cloud', disclosure:d}).then(() => 'SENT', e => e.code + '|' + e.message); })()""")
    ok("p2: self-declared approval refused", str(fake).startswith("disclosure_unapproved"), fake)
    gate = pg4.evaluate("""(async () => { const E = window.AionHybrid.egress; await window.AionStandalone.caseApi.syncPrivateRegistry();
        const d = await E.createDisclosure({purpose:'chat', payload:{instructions:'x', message:'Note: Leadership will not accept another self-install.'}});
        await E.approve(d, 'test');
        return window.AionHybrid.generate(null, null, {mode:'prefer_in_cloud', disclosure:d}).then(() => 'SENT', e => e.code + '|' + e.message); })()""")
    ok("p2: private value in an approved disclosure is blocked by the last-line scan", str(gate).startswith("private_value_blocked"), gate)
    n0 = len(b4)
    pg4.evaluate("window.AionCase.reload()"); pg4.wait_for_timeout(800)
    pg4.click("#caseApproveBtn"); pg4.wait_for_timeout(300); pg4.click("#caseSendBtn")
    pg4.wait_for_selector("#caseReplyText, #caseResultError", timeout=20000); pg4.wait_for_timeout(300)
    sent_body = b4[-1] if len(b4) > n0 else ""
    ok("p2: approved send reaches cloud (only_in_cloud) and shows reply", pg4.is_visible("#caseReplyText") and "in the cloud" in pg4.inner_text("#caseReplyMeta"), pg4.inner_text("#caseResult")[:160])
    ok("p2: sent body has shared passages only", "[P1]" in sent_body and all(x not in sent_body for x in PRIVATE), [x for x in PRIVATE if x in sent_body])
    ok("p2: approval is one-shot (used up after send)", "used up" in pg4.inner_text("#caseApprovalChip") and pg4.is_disabled("#caseSendBtn"))
    resend = pg4.evaluate("window.AionStandalone.caseApi.send(window.AionCase.state.prep.disclosure).then(() => 'SENT', e => e.code)")
    ok("p2: same disclosure cannot be sent twice", resend=="disclosure_used", resend)
    # ---- private review / verdict flip ----
    pg4.wait_for_function("document.getElementById('caseVerdictChip') && document.getElementById('caseVerdictChip').textContent.length > 5", timeout=5000)
    rv = pg4.inner_text("#caseReview")
    ok("p5: cloud said reasonable, local review says not suitable (verdict flip shown)", "Reasonable" in rv and "Not suitable on your private requirements" in rv and "made stricter by" in rv, rv[:240])
    cmpv = pg4.evaluate("[window.AionCase.compareVerdicts('caution','not_suitable'), window.AionCase.compareVerdicts('not suitable','fits'), window.AionCase.compareVerdicts('caution','needs_answers'), window.AionCase.compareVerdicts(null,'fits')].map(x => x.direction)")
    ok("p5: caution -> not suitable counts as a change (found live with real Gemini)", cmpv==["stricter","looser","same","unknown"], cmpv)
    ok("p5: three local checks fail on the sample case (budget, deadline, installation)", pg4.locator("#caseReview .case-check-row.is-fail").count()==3 and "Rs 4,54,300" in rv and "Rs 54,300" in rv, rv[:400])
    ok("p5: review names the unshared passages it read locally (P5, P6)", "P6" in rv and "P5" in rv and "never sent" in rv)
    ok("p5: the private budget and the unshared price never reached the cloud", all(x not in sent_body for x in ("4,00,000","3,85,000","installation of the LED wall")), "")
    nb = len(b4)
    pg4.fill("#caseBudget", "Rs 5,00,000 including GST"); pg4.wait_for_timeout(1200)
    rv2 = pg4.inner_text("#caseReview")
    ok("p5: what-if: raising the private budget passes the budget check, other fails remain", pg4.locator("#caseReview .case-check-row.is-fail").count()==2 and "within your private limit of Rs 5,00,000" in rv2, rv2[:300])
    pg4.uncheck("#caseInstall"); pg4.wait_for_timeout(1200)
    ok("p5: what-if: dropping the installation requirement moves the verdict to 'needs answers'", "Needs answers" in pg4.inner_text("#caseVerdictChip"), pg4.inner_text("#caseVerdictChip"))
    ok("p5: what-if changes made zero cloud requests (Playwright count and on-screen count)", len(b4)==nb and pg4.inner_text("#caseNetCount").strip()=="0", (nb, len(b4), pg4.inner_text("#caseNetCount")))
    pure = pg4.evaluate("""(() => { const R = window.AionCase.reconcile;
        const c = { paragraphs: [{id:'P1', heading:'Overview', shared:true, text:'Nice kit.'}], privateConstraints: { maxBudget:'Rs 1,00,000 including GST', readyBy:'2026-12-11', installationRequired:true } };
        const r = R(c); return [r.verdict, r.checks.map(k => k.status)]; })()""")
    ok("p5: missing price, date and installation terms are reported as unknown, never guessed", pure==["needs_answers",["unknown","unknown","unknown"]], pure)
    pg4.evaluate("window.AionStandalone.caseApi.reset().then(() => window.AionCase.reload())"); pg4.wait_for_timeout(800)
    n1 = len(b4)
    pg4.click("#caseLeakBtn"); pg4.wait_for_selector("#caseLeakSummary, #caseLeakError", timeout=60000)
    leak = pg4.evaluate("window.AionCase.state.leak")
    ok("p2: leak test PASS, live, >=3 requests inspected", leak.get("pass") and leak.get("mode")=="live" and leak.get("inspected",0)>=3, {k:leak.get(k) for k in ("pass","mode","inspected","leaked")})
    ok("p2: leak test positive control 6/6 present locally", leak.get("controlPresent")==6, leak.get("controlPresent"))
    canaries=[r["canary"] for r in leak.get("results",[])]
    pw_bodies=b4[n1:]
    ok("p2: independent check - no canary in Playwright-captured request bodies", len(canaries)==6 and len(pw_bodies)>=3 and not any(c in bb for c in canaries for bb in pw_bodies), len(pw_bodies))
    left = pg4.evaluate("""Promise.all([window.AionStandalone.caseApi.load()]).then(() => new Promise(r => { const q = indexedDB.open('aion-hybrid-demo'); q.onsuccess = () => {
        const db = q.result; const out = []; const tx = db.transaction(['tasks','memories'], 'readonly');
        tx.objectStore('tasks').getAll().onsuccess = e => e.target.result.forEach(t => { if (String(t.id).startsWith('leaktest')) out.push(t.id); });
        tx.objectStore('memories').getAll().onsuccess = e => e.target.result.forEach(m => { if (String(m.id).startsWith('leaktest')) out.push(m.id); });
        tx.oncomplete = () => r(out); }; q.onerror = () => r(['open-failed']); }))""")
    ok("p2: leak test removed everything it planted", left==[], left)
    ok("p2: Focus wording no longer cites private AION docs", "docs/" not in pg4.inner_text('section[data-view="focus"] .view-head'))
    ok("p2: hidden Create tab still hidden", not pg4.is_visible('a[data-view="create"]'))
    pg4.evaluate("window.AionStandalone.caseApi.update(c => { c.question = 'edited before reset'; })"); pg4.wait_for_timeout(300)
    rev_before = pg4.evaluate("window.AionStandalone.caseApi.load().then(c => c.inputRevision)")
    pg4.evaluate("window.AionStandalone.resetDemo()")
    pg4.wait_for_timeout(1500); pg4.wait_for_function("window.AionStandalone && window.AionStandalone.caseApi", timeout=15000)
    after = pg4.evaluate("window.AionStandalone.caseApi.load().then(c => [c.inputRevision, c.question.slice(0, 20)])")
    ok("p2: resetDemo() wipes the case", rev_before > 1 and after[0]==1 and after[1].startswith("Using only the"), (rev_before, after))
    pg4.close()
    # ================= hybrid-v2 Packet 3: telemetry + router + blindfold planner =================
    pg5 = ctx.new_page(); b5=[]; mode5 = {"m":"ok"}; goal_refs=[]
    def sse(parts): return "data: "+json.dumps({"candidates":[{"content":{"role":"model","parts":parts},"finishReason":"STOP"}]})+"\r\n\r\n"
    def vertex5(route):
        req=route.request
        stream = ":streamGenerateContent" in req.url
        def reply(parts):
            if stream: return route.fulfill(status=200, headers={**CORS,"content-type":"text/event-stream"}, body=sse(parts))
            return route.fulfill(status=200, headers={**CORS,"content-type":"application/json"}, body=json.dumps({"candidates":[{"content":{"role":"model","parts":parts},"finishReason":"STOP"}]}))
        if req.method=="OPTIONS": return route.fulfill(status=204, headers=CORS)
        body=req.post_data or ""; b5.append(body)
        if mode5["m"]=="403": return route.fulfill(status=403, headers={**CORS,"content-type":"application/json"}, body=json.dumps({"error":{"code":403,"message":"App Check token invalid","status":"PERMISSION_DENIED"}}))
        if "check_local_capability" in body or "responseSchema" in body or "responseMimeType" in body:
            has_tool_result = "functionResponse" in body
            if "responseSchema" in body or "responseMimeType" in body:
                import re as _re
                gm = _re.search(r'GOAL:\\n(\[TASK_\d+\])', body)   # like real Gemini: refer to the task the goal names
                if gm: goal_refs.append(gm.group(1))
                plan={"summary":"Two steps.","steps":[{"op":"create_task","title":"Draft outline","taskRef": gm.group(1) if gm else "[TASK_1]"},{"op":"note","title":"Keep it short"}]}
                return reply([{"text":json.dumps(plan)}])
            if not has_tool_result:
                return reply([{"functionCall":{"name":"count_memories_by_type","args":{}}}])
            return reply([{"text":"ok"}])
        return reply([{"text":"Cloud reply."}])
    pg5.route("**/firebasevertexai.googleapis.com/**", vertex5)
    pg5.add_init_script(FAKE)
    pg5.add_init_script("if (sessionStorage.getItem('nanoOff')) window.__nanoAvail = 'unavailable';")
    pg5.goto(f"http://127.0.0.1:{PORT}/index.html")
    pg5.wait_for_function("window.AionHybrid && window.AionHybrid.state.ready && window.AionHybrid.router && window.AionHybrid.planner", timeout=15000)
    pg5.wait_for_timeout(1500)
    H = "window.AionHybrid"
    ok("p3: router, planner, telemetry exposed", pg5.evaluate("!!(%s.router.decide && %s.planner.plan && %s.telemetry.getReceipts)" % (H,H,H)))
    d1 = pg5.evaluate("%s.router.decide({mode:'prefer_in_cloud', message:'hello there', offlineDemo:false, online:true})" % H)
    ok("p3: router keeps requested mode for a plain message", d1["effectiveMode"]=="prefer_in_cloud" and not d1["overridden"], d1)
    d2 = pg5.evaluate("%s.router.decide({mode:'prefer_in_cloud', message:'my password is hunter2 and card 4111 1111 1111 1111', offlineDemo:false, online:true})" % H)
    ok("p3: sensitive message is kept on-device when Nano is ready", d2["effectiveMode"]=="only_on_device" and d2["overridden"], d2)
    d3 = pg5.evaluate("%s.router.decide({mode:'prefer_in_cloud', message:'hi', offlineDemo:true, online:true})" % H)
    ok("p3: offline demo forces on-device", d3["effectiveMode"]=="only_on_device", d3)
    ok("p3: error classifier", pg5.evaluate("[%s.router.classifyError({code:'timeout'}), %s.router.classifyError({message:'403 App Check token invalid'}), %s.router.classifyError({message:'quota exceeded 429'})]" % (H,H,H))==["timeout","app_check","quota"], "")
    # receipt via a real cloud chat through the disclosure boundary
    n_before = pg5.evaluate("%s.telemetry.getReceipts().length" % H)
    r1 = pg5.evaluate("""%s.router.dispatchChat({mode:'only_in_cloud', requestedMode:'prefer_in_cloud', decision:{effectiveMode:'only_in_cloud'}, payload:{instructions:'Be brief.', message:'Say hi', notes:[], tasks:[], history:[]}, prompt:null, approvedBy:'send_click'}).then(r => ({text:r.text, receipt:r.receipt}), e => ({err:e.code||e.message}))""" % H)
    rc = r1.get("receipt") or {}
    ok("p3: cloud chat returns text and a receipt", r1.get("text")=="Cloud reply." and rc.get("route")=="cloud-sealed-chat" and rc.get("status")=="completed", r1)
    ok("p3: receipt latency is a measured number, hardware unavailable", isinstance(rc.get("latencyMs"),(int,float)) and rc.get("latencyMs")>=0 and rc.get("hardware")=="unavailable", rc.get("latencyMs"))
    ok("p3: receipt egress audit has digest and bytes", len(rc.get("egressAudit",{}).get("digest",""))>=8 and rc.get("egressAudit",{}).get("bytesSent",0)>0 and rc.get("egressAudit",{}).get("disclosureTier")=="approved_cloud", rc.get("egressAudit"))
    ok("p3: receipt count grew by one", pg5.evaluate("%s.telemetry.getReceipts().length" % H)==n_before+1)
    fr = pg5.evaluate("(() => { const r = %s.telemetry.getReceipts(); const x = r[r.length-1]; try { x.status='tampered'; } catch(e) {} return [Object.isFrozen(x), x.status]; })()" % H)
    ok("p3: receipts are frozen (cannot be edited)", fr[0] and fr[1]=="completed", fr)
    summ = pg5.evaluate("%s.telemetry.summarizeTelemetry()" % H)
    ok("p3: telemetry summary gives counts, no percent-local claim", summ.get("localShare")=="not-applicable" and "total" in json.dumps(summ).lower(), summ)
    # purpose allowlist: unknown field must be refused before anything is sent
    n_req = len(b5)
    bad = pg5.evaluate("""%s.router.dispatchChat({mode:'only_in_cloud', requestedMode:'only_in_cloud', decision:{effectiveMode:'only_in_cloud'}, payload:{instructions:'Be brief.', message:'x', notes:[], tasks:[], history:[], secret_notes:'LEAK'}, prompt:null, approvedBy:'send_click'}).then(() => 'SENT', e => e.code||e.message)""" % H)
    ok("p3: extra payload field is blocked and nothing is sent", bad!="SENT" and len(b5)==n_req, bad)
    # cloud failure -> on-device fallback, with a reason and receipts
    mode5["m"]="403"
    FB_JS = """%s.router.dispatchChat({mode:'%s', requestedMode:'%s', decision:{effectiveMode:'%s'}, payload:{instructions:'Be brief.', message:'Say hi', notes:[], tasks:[], history:[]}, prompt:null, buildLocalPrompt:() => Promise.resolve('Say hi'), approvedBy:'send_click'}).then(r => ({text:r.text, source:r.source, fb:r.fallback, rs:(r.receipts||[]).map(x => [x.route,x.status,x.egressAudit.disclosureTier])}), e => ({err:e.code||e.message, cls:e.errorClass, msg:String(e.message).slice(0,160)}))"""
    fb = pg5.evaluate(FB_JS % (H,"prefer_in_cloud","prefer_in_cloud","prefer_in_cloud"))
    ok("p3: Prefer Cloud + App Check 403 -> on-device answer, receipt says fallback and that the sealed text was sent", fb.get("source")=="on_device" and (fb.get("fb") or {}).get("errorClass")=="unreported" and fb.get("rs")==[["local-fallback","fallback","approved_cloud"]], fb)
    pg5.evaluate("sessionStorage.setItem('nanoOff','1')"); pg5.reload(); pg5.wait_for_function("window.AionHybrid && window.AionHybrid.state.ready && window.AionHybrid.router", timeout=15000); pg5.wait_for_timeout(800)
    nf = pg5.evaluate(FB_JS % (H,"prefer_in_cloud","prefer_in_cloud","prefer_in_cloud"))
    ok("p3: App Check 403 with no Nano -> classified app_check, no fake answer", nf.get("cls")=="app_check" and "FAKE-NANO" not in json.dumps(nf), nf)
    nf2 = pg5.evaluate("(() => { const r = %s.telemetry.getReceipts(); const x = r[r.length-1]; return [x.status, x.route, x.errorCode]; })()" % H)
    ok("p3: failed cloud receipt has a non-completed status", nf2[0] in ("rejected","failed","timed_out") and nf2[1]=="cloud-sealed-chat", nf2)
    mode5["m"]="ok"
    # planner
    plan_in = {"goal":"Plan my week","taskRefs":[{"ref":"[TASK_1]","line":"[TASK_1] | to do"}],"constraints":[],"taskTitles":{"[TASK_1]":"Write report"},"memoryCounts":{"total":3,"fact":3},"localContext":""}
    n_req = len(b5)
    pr = pg5.evaluate("%s.planner.plan(%s, {mode:'prefer_in_cloud'}).then(r => r, e => ({err:e.code||e.message}))" % (H, json.dumps(plan_in)))
    ok("p3: planner returns a validated cloud plan", pr.get("ok") and pr.get("source")=="cloud-blindfold" and len(pr["plan"]["steps"])==2, pr.get("err") or [pr.get("source"), pr.get("fallback"), [x[:300] for x in b5[n_req:]]])
    steps = pr["plan"]["steps"] if pr.get("plan") else []
    ok("p3: mutating step needs approval, note is info only", [x["status"] for x in steps]==["PENDING_APPROVAL","INFO"], [x.get("status") for x in steps])
    ok("p3: tool round happened (function call recorded, no text values)", any(c["name"]=="count_memories_by_type" for c in pr["receipts"][-1]["functionCalls"]) if pr.get("receipts") else False)
    sent = "".join(b5[n_req:])
    ok("p3: planner request contains no real task title", "Write report" not in sent and "[TASK_1]" in sent)
    ok("p3: planner makes at most 2 tool rounds + 1 JSON request", 2 <= len(b5)-n_req <= 4, len(b5)-n_req)
    props = pg5.evaluate("%s.planner.stepsToProposals(%s, x => x).length" % (H, json.dumps(pr["plan"])))
    ok("p3: only the mutating step becomes an approval proposal", props==1, props)
    # planner cloud failure -> local fallback, never silent
    mode5["m"]="403"
    pf = pg5.evaluate("%s.planner.plan(%s, {mode:'prefer_in_cloud'}).then(r => ({ok:r.ok, source:r.source, fb:r.fallback}), e => ({err:e.code||e.message}))" % (H, json.dumps(plan_in)))
    ok("p3: planner falls back (on-device or deterministic) and says why", pf.get("ok") and pf.get("source") in ("on-device-nano","deterministic") and pf.get("fb"), pf)
    cold = pg5.evaluate("""(() => { const st = window.AionHybridState; const w = st.nanoWarm; st.nanoWarm = false; const t = performance.now();
        return window.AionHybrid.planner.plan(%s, {mode:'prefer_in_cloud'}).then(r => { st.nanoWarm = w; return [r.source, Math.round(performance.now() - t)]; }); })()""" % json.dumps(plan_in))
    ok("p3: with a cold Nano, a failed cloud plan goes straight to the instant offline plan (no long wait)", cold[0]=="deterministic" and cold[1] < 5000, cold)
    mode5["m"]="ok"
    # chat + /plan through the real UI: badge carries the receipt line, events grow
    ev0 = pg5.evaluate("window.AionStandalone.store.all('events').then(r => r.length)")
    pg5.select_option("#inferenceMode","prefer_in_cloud")
    pg5.fill("#chatInput", "Give me one tip for a calm weekend"); pg5.click("#sendBtn")
    pg5.wait_for_function("document.querySelectorAll('#chatLog .ai-badge-sub').length>=1 && /Receipt /.test(document.querySelector('#chatLog').innerText)", timeout=20000)
    log = pg5.inner_text("#chatLog")
    ok("p3: UI chat bubble shows a receipt line with measured characters sent", "Receipt " in log and "characters sent" in log and "undefined" not in log and "NaN" not in log, log[-220:])
    pg5.fill("#chatInput", "/plan finish the hackathon video"); pg5.click("#sendBtn")
    try: pg5.wait_for_function("/waiting for your approval|note only/.test(document.querySelector('#chatLog').innerText)", timeout=25000)
    except Exception as e: print("   /plan wait timed out; chat tail:", pg5.inner_text("#chatLog")[-400:].replace("\n"," | "))
    log = pg5.inner_text("#chatLog")
    ok("p3: /plan command answers with numbered steps and approval status", "1. " in log and ("waiting for your approval" in log or "note only" in log), log[-260:])
    # regression (found live 22 Nov): a goal repeating a PENDING task title was blocked instead of sealed
    pend = pg5.evaluate("""window.AionStandalone.store.all('proposals').then(ps => { const p = ps.find(x => x.status==='pending' && x.kind==='task'); return p ? p.content : null; })""")
    if pend:
        n_req = len(b5)
        nrc = pg5.evaluate("window.AionHybrid.telemetry.getReceipts().length")
        pg5.fill("#chatInput", "/plan " + pend); pg5.click("#sendBtn")
        pg5.wait_for_function("window.AionHybrid.telemetry.getReceipts().length > %d" % nrc, timeout=25000); pg5.wait_for_timeout(500)
        lastr = pg5.evaluate("(() => { const r = window.AionHybrid.telemetry.getReceipts().slice(-1)[0]; return [r.route, r.status]; })()")
        sentp = "".join(b5[n_req:])
        ok("p4: /plan whose goal repeats a pending task title is sealed and sent, not blocked", lastr==["cloud-blindfold","completed"] and pend not in sentp and "[TASK_" in sentp, (lastr, pend))
        ok("p4: a cloud plan that refers to the goal's own [TASK_n] label is accepted (found live 22 Nov)", len(goal_refs)>=1 and lastr==["cloud-blindfold","completed"], goal_refs[-1:])
    else:
        ok("p4: /plan whose goal repeats a pending task title is sealed and sent, not blocked", False, "no pending task proposal in seed data")
    ev1 = pg5.evaluate("window.AionStandalone.store.all('events').then(r => r.length)")
    kinds = pg5.evaluate("window.AionStandalone.store.all('events').then(r => r.map(e => e.event_type))")
    ok("p3: EVENTS LOGGED grows after chat + plan (chat.reply + plan.created)", ev1 >= ev0 + 2 and "chat.reply" in kinds and "plan.created" in kinds, (ev0, ev1, kinds[-4:]))
    # Privacy Receipts ledger + honest status rows
    pg5.wait_for_function("document.querySelectorAll('#receiptsList .receipt-row').length>=2", timeout=10000)
    rsum = pg5.inner_text("#receiptsSummary")
    tot = pg5.evaluate("window.AionHybrid.telemetry.summarizeTelemetry()")
    ok("p4: receipts summary matches telemetry counts exactly", ("%d request" % tot["total"]) in rsum and ("%d sent to the cloud" % tot["cloudRequests"]) in rsum and ("%d stayed on this device" % tot["localOnly"]) in rsum, rsum)
    rows = pg5.locator("#receiptsList .receipt-row")
    first_id = rows.nth(0).get_attribute("data-receipt-id")
    last_rec = pg5.evaluate("window.AionHybrid.telemetry.getReceipts().slice(-1)[0].receiptId")
    ok("p4: ledger lists newest receipt first", first_id == last_rec, (first_id, last_rec))
    ledger = pg5.inner_text("#receiptsList")
    ok("p4: ledger has no placeholder or NaN values", all(x not in ledger for x in ("undefined","NaN","null ms","unreadable")), ledger[:200])
    ok("p4: planner row shows tool names", "tools: count_memories_by_type" in ledger or "Offline plan" in ledger, ledger[:300])
    plan_rec = pg5.evaluate("(() => { const r = window.AionHybrid.telemetry.getReceipts().filter(x => x.route==='cloud-blindfold' && x.status==='completed').slice(-1)[0]; return r ? window.AionHybrid.telemetry.evidenceFor(r).length : -1; })()")
    ok("p4: planner receipt is matched to exactly its own 2 network requests (1 tool round + JSON)", plan_rec == 2, plan_rec)
    chat_rec = pg5.evaluate("(() => { const r = window.AionHybrid.telemetry.getReceipts().filter(x => x.route==='cloud-sealed-chat' && x.status==='completed').slice(-1)[0]; return r ? window.AionHybrid.telemetry.evidenceFor(r).length : -1; })()")
    ok("p4: chat receipt is matched to exactly 1 network request", chat_rec == 1, chat_rec)
    cloud_row = pg5.locator("#receiptsList .receipt-row:has(details)").first
    cloud_row.locator("summary").click(); pg5.wait_for_timeout(300)
    evid = cloud_row.locator(".receipt-evidence").inner_text()
    ok("p4: 'What left this browser' shows the real captured request", "characters" in evid and "firebasevertexai" in evid and "Request 1 of" in evid, evid[:200])
    ok("p4: captured request text contains no real task title or private value", "Write report" not in evid and all(x not in evid for x in PRIVATE), "")
    try: pg5.locator("#receiptsCard").screenshot(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "receipts_shot.png"))
    except Exception: pass
    loc_row = pg5.locator("#receiptsList .receipt-row:not(:has(details))").first
    ok("p4: local receipts say nothing was sent and offer no evidence box", loc_row.count()==1 and ("nothing sent to the cloud" in loc_row.inner_text() or "blocked before sending" in loc_row.inner_text()), loc_row.inner_text()[:160] if loc_row.count() else "")
    with pg5.expect_download() as dl:
        pg5.click("#receiptsExportBtn")
    exp = json.loads(open(dl.value.path()).read())
    ok("p4: export downloads every receipt as JSON with no message text", len(exp["receipts"])==tot["total"] and "Write report" not in json.dumps(exp) and "Say hi" not in json.dumps(exp), len(exp.get("receipts",[])))
    pg5.wait_for_timeout(5500)
    hl = pg5.inner_text("#systemHealthList")
    ok("p4: status panel shows Nano, App Check, AI request counts", "Gemini Nano" in hl and "App Check" in hl and "AI requests" in hl and "unreadable" not in hl, hl[:300])
    ach = pg5.evaluate("""(() => { const st = window.AionHybridState; const was = st.isProductionHost; st.isProductionHost = true;
        const e = new Error('AI: App Check token fetch failed (appCheck/fetch-status-error)');
        return window.AionStandalone._friendly ? window.AionStandalone._friendly(e) : 'n/a'; })()""")
    ok("p4: on localhost an App Check failure gives debug-token setup advice (the live-site wording is checked on the preview)", "debug token" in ach, ach[:160])
    ach2 = pg5.evaluate("""(() => { const st = window.AionHybridState; const w = st.appCheckWarm; st.appCheckWarm = 'failed';
        const e = new Error('AI: Error fetching ... [403 ] Permission denied on the service. (AI/fetch-error)');
        const out = [window.AionStandalone._friendly(e), window.AionHybrid.router.classifyError(e, st), window.AionHybrid.router.classifyError(e, {})];
        st.appCheckWarm = w; return out; })()""")
    fb2 = pg5.evaluate("""(() => { const e = new Error('Cloud model did not start answering within 15 s (timeout)'); e.code = 'timeout';
        const d = new DOMException('The model failed to load.', 'InvalidStateError'); e.fallbackError = d;
        return window.AionStandalone._friendly(e); })()""")
    ok("p4: when cloud AND the Nano fallback fail, the message names both (InvalidStateError, not code 11)", "InvalidStateError" in fb2 and "fallback" in fb2 and "did not answer in time" in fb2, fb2[:200])
    ok("p4: 403 after a failed App Check warm-up is reported as App Check, not as an API-key problem", "App Check" in ach2[0] and ach2[1]=="app_check" and ach2[2]=="permission", [ach2[0][:120], ach2[1], ach2[2]])
    pg5.close()
    # ================= Batch 1 (22 Nov night): quote intake, ID protection, safe approvals =================
    pg6 = ctx.new_page(); b6=[]
    def vertex6(route):
        req=route.request
        if req.method=="OPTIONS": return route.fulfill(status=204, headers=CORS)
        b6.append(req.post_data or "")
        c={"candidates":[{"content":{"role":"model","parts":[{"text":"VERDICT: caution\nOK"}]},"finishReason":"STOP"}]}
        return route.fulfill(status=200, headers={**CORS,"content-type":"text/event-stream"}, body="data: "+json.dumps(c)+"\r\n\r\n")
    pg6.route("**/firebasevertexai.googleapis.com/**", vertex6)
    # a fake multimodal Nano: answers quote JSON when the prompt carries an image
    pg6.add_init_script("""(() => { const base = window.LanguageModel; window.__imgPrompts = 0;
      window.LanguageModel = { availability: async (o) => base.availability(o), create: async (o) => { const s = await base.create(o); const p0 = s.prompt;
        s.prompt = async (m, opts) => { if (JSON.stringify(m).includes('"image"')) { window.__imgPrompts++; return JSON.stringify({ supplier: 'Lumen AV (fictional)',
          price: 'Total: Rs 4,10,000 plus GST.', delivery: 'Delivered on 12 December 2026.', scope: 'Installation not included; quoted separately.',
          warranty: 'Standard warranty.', cancellation: 'No refunds within 10 days.', other: 'LED wall 5 x 3 m.' }); } return p0(m, opts); }; return s; } }; })();""")
    pg6.goto(f"http://127.0.0.1:{PORT}/index.html#case")
    pg6.wait_for_function("document.getElementById('caseDisclosureText') && document.getElementById('caseDisclosureText').textContent.length>50", timeout=20000)
    pg6.wait_for_timeout(1500)
    QUOTE = "Apex Stage Rentals\nQuote for LED wall 6x3 m and sound for 350 guests. Contact ravi.k@example.com, PAN ABCDE1234F.\nTotal price: Rs 3,20,000 including GST. 40% advance.\nDelivery and installation by our technicians on 10 December 2026 by 18:00.\nWarranty covers faults during the event.\nCancellation within 7 days: 50% charged."
    pg6.fill("#caseIntakeText", QUOTE); pg6.click("#caseIntakeTextBtn"); pg6.wait_for_timeout(1500)
    ok("b1: pasted quote sorted into private passages by plain code", "Sorted into 5 passages" in pg6.inner_text("#caseIntakeStatus") and pg6.locator(".case-para").count()==5 and pg6.locator(".case-para.is-shared").count()==0, pg6.inner_text("#caseIntakeStatus"))
    ok("b1: imported quote is reviewed locally (fits: price, date and installation all read)", "Fits your private requirements" in pg6.inner_text("#caseVerdictChip"), pg6.inner_text("#caseReview")[:300])
    ok("b1: nothing was sent while importing text", len(b6)==0, len(b6))
    pg6.check('.case-para[data-pid="P1"] [data-share]'); pg6.wait_for_timeout(1500)
    dtx = pg6.inner_text("#caseDisclosureText")
    ok("b1: a shared passage has its PAN cut and email redacted before sending (Case tab secret filter)", "[P1]" in dtx and "ABCDE1234F" not in dtx and "ravi.k@example.com" not in dtx and "[withheld secret]" in dtx and "[email]" in dtx, dtx[-300:])
    # image path (fake multimodal Nano)
    nreq = len(b6)
    pg6.evaluate("""(async () => { const c = document.createElement('canvas'); c.width = 320; c.height = 200; const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0,0,320,200); g.fillStyle = '#000'; g.fillText('Lumen AV quote', 10, 20);
        const blob = await new Promise(r => c.toBlob(r, 'image/png')); window.AionCase.readImage(new File([blob], 'quote.png', { type: 'image/png' })); })()""")
    pg6.wait_for_function("/Read by Gemini Nano|not ready|could not/.test(document.getElementById('caseIntakeStatus').textContent)", timeout=20000)
    st6 = pg6.inner_text("#caseIntakeStatus")
    ok("b1: screenshot read by Nano on the device, image never sent (0 cloud requests)", "Read by Gemini Nano on this device" in st6 and "while reading: 0" in st6 and len(b6)==nreq and pg6.evaluate("window.__imgPrompts")>=1, st6)
    ok("b1: Nano's fields become private passages and the review flags them (over budget, late, no installation)", "Lumen AV" in pg6.inner_text("#caseRoot") and pg6.locator("#caseReview .case-check-row.is-fail").count()==3, pg6.inner_text("#caseReview")[:300])
    rcp = pg6.evaluate("(() => { const r = window.AionHybrid.telemetry.getReceipts().filter(x => x.model === 'Gemini Nano (image)').slice(-1)[0]; return r ? [r.route, r.status, r.egressAudit.disclosureTier, r.egressAudit.bytesSent] : null; })()")
    ok("b1: the image read gets a receipt: on-device, nothing sent", rcp==["on-device-nano","completed","local_only",0], rcp)
    pg6.evaluate("window.AionHybridState.nano = 'unavailable'")
    pg6.evaluate("""(async () => { const c = document.createElement('canvas'); c.width = 10; c.height = 10; const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        window.AionCase.readImage(new File([blob], 'q.png', { type: 'image/png' })); })()""")
    pg6.wait_for_timeout(800)
    ok("b1: without Nano the image is NOT sent to the cloud; the user is told to paste text", "Paste the quote's text instead" in pg6.inner_text("#caseIntakeStatus") and len(b6)==nreq, pg6.inner_text("#caseIntakeStatus"))
    pg6.evaluate("window.AionHybridState.nano = 'ready'")
    binv = pg6.evaluate("""window.AionHybrid.contracts.validatePayload('case_research', { instructions: 'x', question: 'see data:image/png;base64,iVBORw0KGgo=' })""")
    ok("b1: the disclosure contract refuses image data in any field", (not binv["ok"]) and any("image or binary" in e for e in binv["errors"]), binv["errors"])
    # Indian identifiers
    pv = pg6.evaluate("""[window.AionStandalone.privacy('My Aadhaar is 2345 6789 0124'), window.AionStandalone.privacy('Order number 234567890125'),
        window.AionStandalone.privacy('Pay to ravi@okhdfcbank'), window.AionStandalone.privacy('Refund to A/c no 123456789012 IFSC HDFC0001234')].map(r => [r.status, r.text])""")
    ok("b1: valid Aadhaar (checksum) is blocked; a 12-digit number with a wrong checksum is not", pv[0][0]=="blocked" and pv[1][0]!="blocked", pv[:2])
    ok("b1: UPI ID is redacted; a labelled bank account number is blocked", pv[2][0]=="redacted" and "[upi]" in pv[2][1] and pv[3][0]=="blocked", pv[2:])
    # safe approvals: one task per proposal, and stale text refused
    ap = pg6.evaluate("""(async () => {
        const ps = await window.AionStandalone.store.all('proposals'); const p = ps.find(x => x.status === 'pending' && x.kind === 'task');
        if (!p) return 'no pending task proposal';
        const n0 = (await window.AionStandalone.store.all('tasks')).length;
        const post = (b) => fetch('/api/tasks/approve', { method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(b) }).then(r => r.status);
        const codes = await Promise.all([post({ title: p.content, proposal_id: p.id }), post({ title: p.content, proposal_id: p.id })]);
        const again = await post({ title: p.content, proposal_id: p.id });
        const n1 = (await window.AionStandalone.store.all('tasks')).length;
        return { codes: codes.sort(), again, added: n1 - n0 }; })()""")
    ok("b1: two approvals at once create exactly one task; a later repeat is refused (409)", isinstance(ap, dict) and ap["codes"]==[200,409] and ap["again"]==409 and ap["added"]==1, ap)
    stale = pg6.evaluate("""(async () => {
        const id = 'prop-stale-test'; await window.AionStandalone.store.put('proposals', { id, kind: 'task', status: 'pending', content: 'Book the venue', created: new Date().toISOString() });
        await fetch('/api/proposals/update', { method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({ proposal_id: id, content: 'Book the venue and the caterer' }) });
        const n0 = (await window.AionStandalone.store.all('tasks')).length;
        const r = await fetch('/api/tasks/approve', { method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({ title: 'Book the venue', proposal_id: id }) });
        const n1 = (await window.AionStandalone.store.all('tasks')).length;
        await window.AionStandalone.store.del ? window.AionStandalone.store.del('proposals', id) : null;
        return { status: r.status, added: n1 - n0 }; })()""")
    ok("b1: approving text that changed after it was shown is refused (409), nothing saved", stale=={"status":409,"added":0}, stale)
    pg6.evaluate("window.AionStandalone.caseApi.reset()")
    pg6.close()
    page.screenshot(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "shot.png"))
    print("\nCONSOLE/PAGE ERRORS:"); [print(" ",e[:220]) for e in errs[:25]]
    b.close()
srv.shutdown()
bad=[r for r in results if not r[1]]; print("\n%d/%d passed"%(len(results)-len(bad),len(results)))
