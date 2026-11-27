# Ghost-Math: Round 1 handoff (28 Nov 2026)

Branch: `ghost-math` (not merged to main, not deployed live).
Preview (expires 5 Dec 2026): **https://aion-hybrid-ai--ghost-math-mtgo9hjf.web.app/ghost**

## What it is, in one line
You paste bank/UPI SMS alerts or a monthly budget. Code on your device works out the real figures, then multiplies every rupee by a secret number (k, picked fresh for each browser tab, between 0.55 and 0.95, never shown or sent) and replaces every name with a stand-in (Person_A, Merchant_B). Only that goes to Gemini. Gemini's answer comes back as numbers, and the page divides by k and puts the real names back.

Rivals blank the amounts out, so the cloud can't do any maths. Ghost-Math keeps the maths working: shares and rates don't change when every number is multiplied by the same factor.

## What works (tested)
- **Reading input on the device:** bank and UPI SMS (credits, debits, card spends, "; X credited" EMI messages, balances and limits ignored) and budget lines ("Rent: 22,000", "6k", "2.4 lakh"). Lines it can't read are counted and left out. It never guesses.
- **The rules:** spending by category, rent + EMI share, savings rate (SIP/FD counted as saved, not spent), and 1 to 3 tips, all in real rupees. These work with no model at all.
- **Before any model call:** amounts are scaled and names swapped. That includes budget labels like "Rent to Mr Sharma". SMS wording, account numbers, UPI refs, dates and balances are never sent. The same masked text goes to Gemini Nano or cloud Gemini, so a cloud fallback never sees real rupees or names.
- **Extra protection for k:** each line also gets its own small secret wobble (±1.5%), and amounts are sent as whole numbers. Without it, a few round real prices (₹450, ₹24,000) could be enough to work k out exactly. The cost is that the model's totals can be off by up to about 1.5%, so the page compares them with the rules and says "agrees" or "differs".
- **Cloud call:** Firebase AI Logic asks for structured JSON (a response schema) with amounts as numbers. It uses the existing safety checks: a real click is needed, the payload is checked against an allowlist, it's scanned for real names, sent once per approval, stopped after 15 s, and a failed send keeps its approval.
- **Privacy receipt:** real figures on the left, the fake numbers sent on the right, the exact outgoing text, and after a cloud send what the page itself saw go out (characters) plus "real names in it: 0 of N checked".
- **Honest label:** "Answered by cloud Gemini (model)" or "Answered by Gemini Nano on this device · nothing was sent", taken from what the SDK reports. On "This device only" with no Nano, the button is disabled and the page says why.

Tests: `node tests/ghost.test.mjs` **68/68** (this includes scale/restore round trips at k = 0.55, 0.7, 0.8137 and 0.95 and 20 random sessions, a hostile model reply, a model that doubles the spend getting caught, and the allowlist). `python tests/ghost_smoke.py` **31/31** in headless Chrome. **In that browser test, the cloud, App Check and Nano are all fakes.** Older suites are still green: engine 89, live engine 277, quotes 101, send 18.

**Not verified tonight:** a real cloud Gemini answer on the preview, real App Check on the preview domain, and real Gemini Nano (skipped as agreed).

## Update, 28 Nov night
- **A real cloud answer came back on the preview** (Anshul's own browser): cloud Gemini (gemini-3.5-flash-lite) in 2.9 s, behind App Check. The page saw a 1,351-character request go out, with 0 of 12 real names in it. All four checks against the rules agreed.
- To get there: the preview domain was added to the reCAPTCHA key (done from the laptop) and to the Firebase browser key's website list (done by Anshul in the console). App Check for Firebase AI Logic was already Enforced. The API Keys API was left off.
- **Fix after that answer:** a restored amount within the wobble of a figure the rules already know is now shown exactly (rent reads ₹24,000, not ₹24,306); other figures say "about". Tips must name an action and a monthly figure. Plain statements ("your savings amount is …") are left out, and the rules' own tips fill in to make at least two. The model's maths is still checked on the raw numbers. Tests: ghost 78/78, ghost smoke 33/33 (mocked).
- **Automated browsers can't pass App Check** (reCAPTCHA gives them a low score), so the real-cloud check after this fix needs a person to click Send.

## App Check (the required rule)
App Check is already turned on in the code: reCAPTCHA Enterprise with the site key in `src/hybrid.js`. The debug provider can never run on the production domains. I couldn't see the Firebase console, so please check these yourself:
1. **Firebase console → App Check → APIs → Firebase AI Logic:** it should say **Enforced**. If it says Monitoring, click Enforce.
2. **Google Cloud console → Security → reCAPTCHA → your website key → Domains:** add `aion-hybrid-ai--ghost-math-mtgo9hjf.web.app`. If you skip this, cloud sends on the preview will fail with an App Check error. The page reports that in one line and the rules' figures still show.
3. Optional for a quick test without step 2: open the preview with `?appcheck_debug` and register the debug token (COPY TOKEN on the main page) under App Check → Manage debug tokens.

reCAPTCHA Enterprise's free tier covers 10,000 checks a month, so this needs no spending.

## Honest limits (say these, don't oversell)
- Categories and proportions are sent. Scaling hides how much money you have and who you pay, not the shape of your spending.
- Someone who knows the exact price of a categorised item (say a ₹649 subscription) can estimate k to within about the wobble. They still don't get names.
- Restored model totals are approximate (within ~1.5%). The exact figures are always the rules' figures in step 02.

## Files
`src/ghostMath.js` (engine, no network or DOM), `src/ghostSamples.js` (made-up samples), `src/hybrid.js` (`ghostPrepare` / `ghostSend`, `AionHybrid.ghost`), `src/contracts.js` + `src/egress.js` (new `ghost_math` purpose and its text format), `public/ghost.html`, `public/ghost.js`, `tests/ghost.test.mjs`, `tests/ghost_smoke.py`.

## Next rounds
- **Round 2: side-by-side screen.** A full-width "You see / The cloud sees" view: the same cards drawn twice, real on the left and fake on the right, with matching rows lit together. Add a toggle to the live request body.
- **Round 3: sample demo mode.** A "Try with a sample month" start that runs the whole flow with no typing. It should also run with no cloud (a recorded, clearly labelled reply), so judges can see it even when App Check blocks them.
- **Round 4: polish.** Make `/ghost` the home page (or swap `index.html`), match the main page's design, add a short explainer of k, mobile layout pass, accessibility pass, README and demo video script.
