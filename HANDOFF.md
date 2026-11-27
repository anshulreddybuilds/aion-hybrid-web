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
- **Second real check (Anshul's Chrome):** gemini-3.5-flash-lite answered in 2.7 s, 0 of 12 names were sent, and rent showed ₹24,000. Three fixes followed:
  - Tip figures now say "a month".
  - A model figure that matches no rules figure shows "about …" with "rules: …" beside it.
  - The check uses one limit (3.5%), rounds each gap to 0.1 before comparing, and prints the limit and every gap, so the wording can't contradict the result.

  Tests: ghost 90/90, ghost smoke 37/37 (mocked). Known gap: with no income line, the income gap is printed in rupees but labelled "%".
- **Third real check found a bug: fixed.** Gemini wrote tip figures as bare numbers ("save 551 a month"), which were never divided by k.
  - Every money figure in tip text is now restored to real rupees with ₹, ignoring percentages, counts like "3 months", and ids.
  - A figure snaps to a rules figure only when exactly one fits. The payee the tip names is tried first, so two close real figures (a ₹1,180 bill and a ₹1,200 transfer) give "about" rather than the wrong person's amount.
  - New test: no scaled or bare amount reaches the screen across 30 sessions and 5 writing styles. It fails on the old code.

  Tests: ghost 95/95, ghost smoke 40/40 (mocked).
- **Automated browsers can't pass App Check** (reCAPTCHA gives them a low score), so the real-cloud check after this fix needs a person to click Send.

## Round 2 started (28 Nov): side-by-side view
- **Step 03 is now "What you see, what Gemini gets":** one row per entry, with your real name, category and ₹ amount on the left and, across a bright dividing line, exactly what Gemini receives (stand-in, category, scaled number) on the right. A test checks every right-hand side is literally a line of the text that's sent. On a phone each row stacks as "You see" over "Gemini gets".
- **"Why the maths still works":** a short plain-English paragraph, plus one live comparison worked out from the data on screen: rent + EMI ÷ income from your numbers beside the same sum on Gemini's numbers (e.g. 43% vs 43%). If per-line noise makes them differ by a point, a line says so and why. It ends with what Gemini can't learn: how much you earn or spend, or who you pay.
- **Tips now start with a capital letter** (Gemini sometimes sent "cancel …").
- The receipt facts are cut to two lines; the outgoing text's size is in its expander title.
- Tests: ghost 97/97, ghost smoke 51/51 (mocked), plus a visual check at 1280 px and 390 px.
- Still to do in round 2: optionally highlight a row on both sides on hover/focus for presenting, and a "show the live request body" toggle.

## Round 3 started (28 Nov): demo mode for the judges' video
- **Play the demo** (top of the page) runs the whole flow on the invented sample, with captions numbered 1–6 at the bottom: the alerts typed in → rules on the device → the disguise (three rows light up on both sides) → why the maths survives → send to Gemini → back in real rupees, ending with the privacy receipt open. It takes about a minute at full pace, which leaves room in a 2:30 video. **Stop** or Esc ends it.
- **The demo click is the approval** to send the sample's disguised lines (the button says so), and only for the bundled sample.
- **If no model answers:** the demo replays a **recorded real Gemini answer** and labels it on screen and in the caption. The caption says it's recorded, a dashed banner gives the model and the recording date, the source line reads "Recorded Gemini answer", and the receipt shows the request as it was sent then. If no recording is bundled, the caption says the rules' figures are the answer. Nothing is made up.
- **⚠ No recording is bundled yet.** I couldn't make one: my automated browser can't pass App Check, and calling Gemini directly might have cost money, which you asked me not to do without your yes. **To add one (1 minute, your Chrome):** run the demo (or a normal send with the sample) on *Prefer cloud*. When Gemini answers, click **Save this answer as the demo recording**, put the downloaded `ghost-demo-recording.json` in `public/`, then commit and redeploy the preview. The recording holds only the sample's disguised request, Gemini's reply, and that run's k (stored because the data is invented).
- **Tips suggest believable partial cuts** ("Cut online shopping by a third to save about ₹1,166 a month", "Switch your subscription to a cheaper plan…"). A model tip whose saving equals a whole category or payment is left out (cancelling one subscription is allowed). Gemini is asked for partial cuts too.
- **Round-2 extras:**
  - Click or keyboard-focus a row to light both sides; the demo uses the same highlight.
  - After a send, **Show the request Gemini actually received** opens the real request body captured from the page's own network call.
- **Bug found and fixed:** a figure in a tip that names a payee now only snaps to that payee's own amounts. Before, a ₹2,400 rent saving could become the ₹2,340 grocery bill.
- Tests: ghost 108/108, ghost smoke 77/77 (mocked), with visual checks at 1280 px and 390 px.

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
