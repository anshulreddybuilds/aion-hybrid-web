# Ghost-Math: a private money lens

**Gemini does your money maths, and never sees your money.**

Paste a month of Indian bank or UPI SMS alerts, or a simple budget. Plain code on your device works out where the money went: spending by category, your rent + EMI share, your savings rate. Before any AI model sees anything, the same code **multiplies every rupee by a secret number** and **swaps every name for a stand-in** (`Person_A`, `Merchant_B`). Gemini (on-device Gemini Nano first, or cloud Gemini through Firebase AI Logic) works on those disguised lines and returns its figures as JSON. The page divides them by the secret number and puts the real names back, on your device.

Other privacy tools blank amounts out, and then the cloud can't do any maths. Ghost-Math keeps the maths working, because **every proportion survives when every number is multiplied by the same factor**: your rent share is 43% on your numbers and 43% on Gemini's.

Built by **Anshul Reddy** ([@anshulreddybuilds](https://github.com/anshulreddybuilds)) for **#BuildHybridAI 2026**. It runs entirely in the browser: no server, no sign-in, nothing stored.

- **Try it:** the Ghost-Math page is at `/ghost` (preview: https://aion-hybrid-ai--ghost-math-mtgo9hjf.web.app/ghost, until the final deploy to https://aion-hybrid-ai.web.app).
- **Fastest look:** click **Play the demo**. It runs the whole flow on an invented sample with captions, in about a minute.
- **What has and hasn't been tested:** see [Verification](#verification).

## What you see

1. **Paste your month.** SMS alerts (one per line) or budget lines like `Rent: 22,000`. Hindi and Hinglish alerts are read too. One-time passwords, failed or declined payments, payment requests and card-bill confirmations are **left out, and the page says why**.
2. **Your month, by the rules.** Plain code, no AI: spent, rent + EMI share, savings rate, a bar per category, and 1–3 tips, all in real rupees.
3. **What you see, what Gemini gets.** One row per entry: your real name and amount on the left; across a dividing line, exactly what Gemini receives for it on the right. A short "why the maths still works" panel shows the same share worked out on both sides.
4. **Back in real rupees.** Gemini's answer, divided back and with names restored. Every figure is checked against the rules ("agrees (0.6%)"); a figure the rules know is shown exactly, any other is marked *about*. You can open **the request Gemini actually received**, captured from the page's own network call.

## How the hybrid works

```
 your SMS / budget                    THIS DEVICE                                  |   CLOUD
 ───────────────►  parse + rules (src/ghostMath.js) ─ real ₹ figures, tips         |
                   │                                                               |
                   ▼  disguise: amount × k (secret, 0.55–0.95, per tab, memory      |
                      only) × a small per-line wobble; names → Person_A, Merchant_B |
                   │                                                               |
                   ▼  disclosure boundary (src/egress.js, src/contracts.js):        |
                      allowlisted fields only · a real click approves · real-name   |
                      scanner · the outbound monitor records the request body       |
                   │                                                               |
                   ▼  Firebase AI Logic, InferenceMode chosen by the user           |
        ┌──────────┴───────────┐                                                   |
        │ PREFER / ONLY ON     │ Gemini Nano (Chrome built-in, Prompt API)          |
        │ DEVICE               │ answers here; nothing leaves                       |
        └──────────┬───────────┘                                                   |
                   │ PREFER CLOUD (or no Nano) ──── App Check (reCAPTCHA Enterprise) ──► Gemini (gemini-3.5-flash-lite)
                   ▼                                                               |    JSON with numbers (response schema)
   restore: ÷ k, names back, snap to exact rules figures, check against the rules ◄──┘
```

- **One code path, two models.** `src/hybrid.js` builds a Firebase AI Logic model with `InferenceMode` (Prefer this device / Prefer cloud / This device only), a JSON `responseSchema` for the cloud and a `responseConstraint` for Nano. Either way the model receives the **same disguised text**, so a cloud fallback never sees real rupees or names. The answer is labelled from the SDK's `inferenceSource`: *Answered by Gemini Nano on this device · nothing was sent*, or *Answered by cloud Gemini (model) · request body observed: N characters · real names in it: 0 of 12*.
- **Why a wobble as well as k:** if real amounts are round (₹450, ₹24,000) and the scaled ones were sent to the paisa, a few lines would pin down k. Each line also gets its own secret factor within ±1.5% and is sent in whole rupees. Shares still survive to within that noise, and exact figures on screen always come from the rules, never from the model.
- **Never trusted:** the model's JSON is parsed defensively (non-numbers dropped, at most 3 tips, text shown with `textContent`). Bare or ₹-prefixed numbers it writes into a tip are divided back too. A figure snaps to a rules figure only when exactly one fits, and only to the amounts of the payee the tip names. Tips must name an action and suggest a believable partial cut.
- **Demo mode** sends only the invented sample's disguised lines (the click on *Play the demo* approves that one send). If no model can be reached, it replays a **recorded real Gemini answer** and labels it as recorded, on screen and in the caption; with no recording, the rules' figures are the answer.

**What is sent, exactly** (one line per entry, nothing else apart from fixed instructions):

```
T2 | debit | Person_A | rent | 16585
T5 | debit | Merchant_C | subscriptions | 427
```

Never sent: SMS wording, account or card numbers, UPI references, dates, balances, real names or real amounts.

## Set up and run

```bash
npm install
npm run build       # bundles src/hybrid.js -> public/hybrid.bundle.js
npm run serve       # http://localhost:8080/ghost
```

Firebase (project `aion-hybrid-ai`; use your own project for a fork):

1. **AI Logic** → Get started → *Gemini Developer API* provider. Cloud models are in `CLOUD_MODELS` in `src/hybrid.js` (`gemini-3.5-flash-lite` first).
2. **App Check** → web app with **reCAPTCHA Enterprise**. Allowed domains must include every host the page is served from (including preview channels). Put the public site key in `RECAPTCHA_SITE_KEY`, rebuild, and **enforce** App Check for Firebase AI Logic. On `localhost` the debug provider is used (register the token printed in the console). The debug provider can never run on the production hosts.
3. Restrict the web API key to your hosting domains (Google Cloud console → Credentials → Website restrictions), including preview channels.
4. Deploy: `npm run deploy`, or a preview with `firebase hosting:channel:deploy <name>`.

**Gemini Nano** needs desktop Chrome 139+ on a supported computer (Chrome checks storage, memory and GPU itself; see `chrome://on-device-internals`). If Chrome can download it, the page shows **Get Gemini Nano**. `FRIEND_PC_TEST.md` walks through a full on-device test.

## Tests

| Command | What it covers | Result |
|---|---|---|
| `node tests/ghost.test.mjs` | parser, rules, k range (300 real sessions), scale/restore round trips (k = 0.55…0.95 and 20 random sessions), hostile replies, snapping, partial-cut tips, no scaled amount on screen (30 sessions × 5 writing styles), the allowlist and serializer | 108/108 |
| `node tests/ghost_edge.test.mjs` | 30 real-world edge cases (OTP, failed, refunds, crore, Hindi, Hinglish, duplicates, 200+ messages, empty input) and a **fuzz test of 400 random months**: every outgoing line is exactly `T# \| debit/credit \| Stand_In \| category \| number`, with no real name, amount, account, reference, date or Hindi text | 40/40 |
| `python tests/ghost_smoke.py` | the page in headless Chrome: rules, the side-by-side view, sending, restoring, the check, the request body, the demo (live, recorded fallback, no recording), saving a recording | 77/77 |
| `python tests/ghost_attack.py` | a hostile month (HTML, emoji, Hindi in names); **every request the page makes** searched for real names and amounts; nothing in browser storage or the console; cloud down / hanging / prose; Nano download and answers; keyboard + reduced motion; 320 px to tablet sizes | 48/48 |
| `node tests/engine.test.mjs`, `live_engine.test.mjs`, `quotes.test.mjs`, `send.test.mjs` | the shared engine and the earlier quote checker | 89, 277, 101, 18 |

In the browser tests, cloud Gemini, App Check and Gemini Nano are **mocked**. The mock cloud does honest maths on exactly the lines in the request body it receives.

## Verification

**Done for real (author's Chrome, preview channel, Nov 2026):** cloud Gemini answered through App Check (gemini-3.5-flash-lite, 2.7–4.0 s, 0 of 12 real names in the request; restored figures agree with the rules; tips in real rupees). Several real checks found bugs that were then fixed (tips shown in scaled numbers; a 3.5% gap reported as "differs").

**Not yet done for real:** Gemini Nano answering on this page (the author's 8 GB laptop can't run it; a test on another PC is planned, see `FRIEND_PC_TEST.md`), and the demo's recorded-answer fallback with a bundled recording.

## Honest limits

- Ghost-Math hides **how much** money and **who** is paid, not the shape of spending: categories and proportions are sent, which is what makes the maths possible.
- Someone who already knows one exact price in your month (say a ₹649 subscription) could estimate k to within the ±1.5% wobble. They still learn no names.
- Model figures that aren't one of the rules' figures are approximate (*about*); the exact numbers always come from the rules.
- The check against the rules uses a fixed margin (3.5% / 3.5 points), tuned for ordinary months. In unusual months (rent many times income) it can say "differs" on a correct answer.
- Parsing is rule-based. Unknown SMS formats are left out and reported, never guessed.
- Not financial advice.

## Project layout

| Path | What it is |
|---|---|
| `public/ghost.html`, `public/ghost.js` | the Ghost-Math page (UI only; every value from input or a model is shown with `textContent`) |
| `src/ghostMath.js` | parser, rules, disguise (k, wobble, stand-ins), restore, checks; no network, DOM, clock or `Math.random` |
| `src/ghostSamples.js` | the invented sample SMS and budget |
| `src/hybrid.js` → `public/hybrid.bundle.js` | Firebase, App Check, Firebase AI Logic routing, the Ghost-Math send and replay |
| `src/egress.js`, `src/contracts.js`, `src/telemetry.js` | the disclosure boundary, allowlists and receipts shared with the earlier AION quote checker |
| `tests/` | the suites above |
| `docs/AION_QUOTE_CHECKER.md` | the earlier AION quote checker built in this repo, including what existed before 11 Nov 2026 |

**Before the hackathon:** the dashboard front end in `public/` (`dashboard.html`, `app.js`, `style.css`, `mobile.html`, `approve.html`) was copied from the author's private AION project (last changed Oct 2026). Ghost-Math, the hybrid layer and the disclosure engine were written for #BuildHybridAI 2026. Details are in `docs/AION_QUOTE_CHECKER.md`.

## License

Apache License 2.0, see [LICENSE](LICENSE) and [NOTICE](NOTICE). Third-party notices are in [THIRD_PARTY.md](THIRD_PARTY.md). Created by Anshul Reddy.
