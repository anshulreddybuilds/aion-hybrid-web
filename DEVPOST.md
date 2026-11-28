# Ghost-Math: Devpost write-up (#BuildHybridAI 2026)

> Copy each section into the matching Devpost field. Fill in the two links marked **TODO** after the final deploy and the YouTube upload.

**Project name:** Ghost-Math

**Tagline (up to 200 characters):** Gemini does your money maths and never sees your money: every rupee is scaled by a secret number and every name swapped for a stand-in, on your device, before any model is asked.

**Links**
- Live app: **TODO** https://aion-hybrid-ai.web.app/ghost (after the final deploy; until then the preview https://aion-hybrid-ai--ghost-math-mtgo9hjf.web.app/ghost)
- Video: **TODO** YouTube link
- Code: https://github.com/anshulreddybuilds/aion-hybrid-web

## Inspiration

In India most of our money arrives as SMS: "Rs.450.00 debited from A/c XX4821 to VPA swiggy@icici". A month of those alerts is the most honest budget most people have, and the most private thing on their phone: names, amounts, landlords, salaries.

Cloud AI is good at turning that into advice, but sending it means sending your whole financial life. The privacy tools we looked at blank the amounts out first, and then the model can't do the one thing you wanted, which is the maths. We wanted the cloud's brain without the cloud ever seeing the money.

## What it does

Ghost-Math is a private money lens that runs in the browser.

1. You paste a month of bank or UPI SMS alerts (Hindi and Hinglish too) or a simple budget.
2. **Plain code on your device** reads them and works out spending by category, the rent + EMI share of income, the savings rate and a few tips, in real rupees. One-time passwords, failed payments, payment requests and card-bill confirmations are left out, and it tells you why.
3. Before any model sees anything, the same code **multiplies every amount by a secret number k** (picked per tab, between 0.55 and 0.95, kept only in memory) **and swaps every name for a stand-in** like `Person_A` or `Merchant_B`. Only lines like `T2 | debit | Person_A | rent | 16585` can leave the device.
4. Gemini does the maths and writes tips on those disguised lines. **Gemini Nano** in Chrome answers on the device when it's available; otherwise **cloud Gemini through Firebase AI Logic** does.
5. Back on the device, Ghost-Math divides Gemini's numbers by k, puts the names back, and checks every figure against its own rules.

It works because **proportions survive scaling**: your rent is 43% of your income on your numbers, and 43% on Gemini's.

The screen is built to be verifiable. A side-by-side view shows every entry as you see it next to exactly what Gemini gets. After a send, you can open the actual request body captured from the page's own network call. The answer is labelled honestly: "Answered by Gemini Nano on this device · nothing was sent", or "Answered by cloud Gemini · real names in it: 0 of 12".

A captioned **demo mode** plays the whole flow in about a minute.

## How we built it

- **Firebase AI Logic hybrid inference.** One `getGenerativeModel` call with `InferenceMode` (prefer on-device, prefer cloud, on-device only). The cloud gets a JSON `responseSchema`; Gemini Nano gets the same shape as a `responseConstraint`. Both receive the identical disguised prompt, so a cloud fallback can never see more than Nano does. The answer label comes from the SDK's `inferenceSource`.
- **Firebase App Check** with reCAPTCHA Enterprise, **enforced**, so only this app can call the model. The debug provider can never switch on for production hosts.
- **A rules engine** (`src/ghostMath.js`, plain JavaScript with no network, DOM, clock or `Math.random`). It covers the SMS and budget parser (English, Hindi, Hinglish, lakh/crore), the rules, the disguise (k, a ±1.5% per-line secret wobble, stand-ins), the restore and the checks.
- **A disclosure boundary** reused from our earlier AION work: per-purpose field allowlists, one approval per send by a real click, a real-name scanner as the last line of defence, and an outbound monitor that records the exact request bodies for the on-screen proof.
- **No framework:** plain HTML, CSS and JS, bundled with esbuild, hosted on Firebase Hosting.

## Challenges we ran into

- **Making k hard to recover.** Multiplying by a single k sounds safe, until you notice that round real prices (₹450, ₹24,000) sent to the paisa let a few lines pin down the exact k. We added a secret per-line wobble and send whole rupees. Shares still survive to within the noise, and the exact figures on screen always come from the rules.
- **The model doesn't always follow the format.** In a real run Gemini wrote "save 551 a month" straight into a tip instead of using the placeholder, so a scaled number reached the screen. Now every figure the model writes is treated as scaled until divided back, and a test checks that no scaled number ever reaches the screen.
- **Restoring without lying.** Scaling noise turned ₹24,000 rent into "₹24,306". So a figure that matches one the rules already know is shown exactly, anything else is marked *about*, and the check against the rules prints its own gap.
- **Real SMS are messy.** OTP messages, failed payments, card-bill confirmations and refunds all mention money. Our first parser counted a card-bill confirmation as income. We built an edge-case suite and a fuzz test of 400 random months to find these.

## Accomplishments that we're proud of

- The cloud does real maths on your month and **we can show it never saw a real name or amount**. The page shows the exact request, and a fuzz test checks the boundary on 400 random months.
- Every claim on screen is measured by code: request characters observed, names checked, the gap to the rules.
- It works with no model at all (the rules), with Nano on the device, or with cloud Gemini, and it says which.
- Real cloud runs through App Check answered in about 3 seconds.

## What we learned

- Privacy and usefulness aren't a trade-off if you choose what to hide: hide magnitudes and identities, keep proportions.
- Hybrid AI is most useful when the device and the cloud get exactly the same disguised input, so the choice between them is about speed and availability, never about privacy.
- Treat model output as untrusted input, even from your own prompt: real runs broke three of our format assumptions.

## What's next for Ghost-Math

- A Chrome extension or Android share target, so alerts don't have to be copied by hand.
- More bank formats and Indian languages, and multi-month trends.
- Nano-only mode as the default once Gemini Nano is on more devices.

## Built with

Firebase AI Logic · Gemini (gemini-3.5-flash-lite) · Gemini Nano (Chrome Prompt API) · Firebase App Check · reCAPTCHA Enterprise · Firebase Hosting · JavaScript · esbuild · Playwright (tests)

---

**Honesty notes for the form** (keep them true):
- Gemini Nano answering on this page has been tested only with a mocked Nano so far; a real test on another PC is planned before submission (`FRIEND_PC_TEST.md`). Update this note after that test.
- The dashboard front end in the repo predates the hackathon (copied from the author's private AION project); Ghost-Math and the hybrid layer were built for #BuildHybridAI. See `README.md`.
- Created by Anshul Reddy.
