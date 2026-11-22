# AION Hybrid Web

A personal AI dashboard that answers **on your device first** (Chrome's built-in Gemini Nano) and only goes to the **cloud** (Gemini through Firebase AI Logic) when it has to - built for **#BuildHybridAI 2026**.

It runs 100% in the browser. No server, no sign-in. Open the hosted URL and everything works: chat with local memory, privacy-checked approval cards, knowledge graph and task progress.

**Live demo: https://aion-hybrid-ai.web.app**

Built by **Anshul Reddy** ([@anshulreddybuilds](https://github.com/anshulreddybuilds)).

**The idea in one line:** the cloud model is smart but should not see your private life; the on-device model is private but small. AION lets each do what it is good at, and **proves on screen what left the browser**: every AI request gets a receipt, and for cloud requests you can open the exact request body that was sent.

> Status: submission build. Read [Verification](#verification-what-was-and-was-not-tested) before judging - it says plainly what has been tested and what has not.

## Try it (judges)

1. Use **desktop Chrome 139 or newer**. Other browsers still work, but chat then uses the cloud only and the header light says Gemini Nano is not supported.
2. Open the hosted URL. The header bar shows:
   - **Gemini Nano: ready / needs download / unavailable** - live status of the on-device model.
   - **AI Route** dropdown: `Prefer Cloud` (the default, so ordinary laptops get a quick reply), `Prefer On-Device (Hybrid)` and `Only On-Device (Offline)`.
   - **Offline Demo Mode** switch.
   - **App Check** and **Standalone demo data** status.
3. If it says *needs download*, click **DOWNLOAD NANO** once (a few GB, one time). If Chrome says the Prompt API is off, enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` and restart Chrome.
4. Type a message, e.g. *"How long should I space my long runs?"* Every reply carries a badge: **On-Device (Gemini Nano)** or **In-Cloud (Gemini Fallback)**, plus the response time in milliseconds.
5. Try the **Offline Demo Mode**: tick it, switch on airplane mode, and keep chatting. The page forces on-device inference and blocks every external network request from its own code.
6. Type **`/plan finish my report this week`**. The **Blindfold Planner** asks the cloud for a plan while the cloud sees only task *labels* such as `[TASK_3]`, never the real titles. The cloud may ask this browser small questions (how many notes of each type, is Nano ready, how big is a task); the browser answers with counts and yes/no only. Steps that would change anything come back as approval cards.
7. Look at **Privacy Receipts** on the right: one row per AI request with the route, measured time, and how many characters of content left the browser. On a cloud row, open **What left this browser** to read the exact request body this page sent. **EXPORT** downloads all receipts as JSON (they hold no message text).
8. Open the **Case** tab: a private decision workspace. You tick which passages may be shared, approve the exact text, and send it once. The cloud's answer is provisional; the **Private review** card then checks the whole proposal against your private budget, deadline and installation rule in the browser and shows whether the verdict flips. Change the budget and watch it update with zero network requests. **Run leak test** plants secret canaries and checks every outgoing request for them.
9. On Home, three proposal cards are waiting - **Approve / Edit / Reject**. One has an email address (it is redacted), one is a task, and one contains a password (it is **blocked** until you edit it).

The demo data is a **fictional person ("Alex")**. Nothing from the author's real data is in this repo. Reset it any time from the browser console: `AionStandalone.resetDemo()`.

## What existed before 11 Nov 2026 vs. what is new

### Existing before 11 Nov (copied from the author's private AION project)

The dashboard front end - static files only. Per file timestamps they were last changed 12-16 Oct 2026:

- `index.html`, `style.css`, `app.js` - the desktop "Engineering Control Center" (home, chat, Climb progress, providers, knowledge graph, skills, Guardian, settings).
- `mobile.html`, `approve.html`, `manifest.webmanifest`, `sw.js`, `scene.jpg`, `icons/` - phone control page, approvals-only page, installable-app files.

The private Python backend (FastAPI, SQLite memory, provider router) is **not** part of this repository and was not modified.

### New for #BuildHybridAI 2026

Everything below was built during the contest window (November 2026). The second table is the `hybrid-v2` work (from 21 Nov).

| New | What it does |
|---|---|
| `src/hybrid.js` -> `public/hybrid.bundle.js` | Firebase init (modular v12 SDK, bundled with esbuild, no CDN), App Check, Firebase AI Logic with `InferenceMode` routing, Gemini Nano readiness light, route dropdown, Offline Demo Mode. |
| `public/standalone.js` | A stand-in backend inside the browser: IndexedDB store, fictional seed data, privacy guard, memory recall, approval/task logic. It answers the dashboard's `/api/*` calls locally; if a real AION backend answers instead, it steps aside. |
| Header bar + per-reply badge | Source (on-device / cloud) and latency on every AI reply. |
| Proposal cards (changes in `app.js`) | Privacy-check chip, **Edit** button next to Approve / Reject, task cards, saved across reloads. |
| `vendor/`, `fonts/`, `fonts.css` | Chart.js and fonts are now local so the page paints with no network. |
| `firebase.json`, `.firebaserc`, `LICENSE`, `NOTICE`, `THIRD_PARTY.md`, `tests/` | Hosting config, Apache-2.0 licence, headless smoke test. |

**hybrid-v2 (21-22 Nov 2026):**

| New | What it does |
|---|---|
| Sealed cloud prompts (`standalone.js`) | Before any request that can reach the cloud, private names (tasks, projects, people) are replaced by tokens like `[TASK_2]`. The reply is un-sealed in the browser, so you read real names; the cloud never saw them. |
| `src/contracts.js`, `src/egress.js` | The **disclosure boundary**. A cloud request must be a *disclosure*: a payload checked against a per-purpose allowlist (`validatePayload`), approved, hashed (SHA-256), sent once, and scanned for registered private values right before it leaves. Raw prompts are refused on cloud routes. |
| Case tab (`public/case.js`) | Private case workspace: choose shared passages, preview and approve the exact outgoing text, one send per approval, and a live leak test with canaries. |
| Private review in the Case tab (`public/case.js`) | **Verdict flip.** The cloud gives a provisional verdict from the shared passages only. Plain code in the browser then checks the FULL proposal against your private budget, ready-by deadline and installation rule, and shows when the answer changes (sample case: cloud says *reasonable*, local review says *not suitable* on all three). Edit a private requirement and the verdict updates with zero network requests, counted on screen. |
| `src/router.js` | Router v2. Decides the route *before* the prompt is built: messages that look sensitive (passwords, card or ID numbers, API keys) stay on-device when Nano is ready; Offline Demo forces on-device. If the cloud or App Check fails, it answers with Nano and states why. |
| `src/telemetry.js` | Receipts: one per AI request, append-only and frozen. Route, status, measured latency (`performance.now()`), characters sent, content digest, tool names. Numbers that cannot be measured are left empty, never estimated. |
| `src/planner.js` | **Blindfold Planner** (`/plan <goal>`): cloud Gemini with function calling (one round of local tool answers), then a separate structured-JSON request, validated in the browser. Each request has the same 15 s limit as chat; the whole plan is capped at 25 s. If the cloud fails it uses Nano (JSON output) when Nano has already answered in this session, otherwise an instant offline plan, so nobody waits for a cold model. |
| Quote intake in the Case tab (`public/case.js`, `src/hybrid.js`) | Paste a supplier quote (plain code sorts it into price, delivery, scope, warranty and cancellation passages) or drop a PNG/JPEG screenshot that **Gemini Nano reads on the device** (multimodal, `ONLY_ON_DEVICE`, JSON output). The image is redrawn on a canvas first (max 1600 px), which also drops hidden metadata such as GPS. There is no cloud path for images: without Nano, AION asks you to paste the text instead. Every imported passage starts private. |
| Image guard (`src/contracts.js`) | Any cloud disclosure containing a `data:` image URL or a long base64 run is refused, in any field. |
| Indian identifiers (`standalone.js`) | Aadhaar numbers (any spacing, confirmed by their Verhoeff checksum) and bank account numbers next to their label are blocked; UPI IDs are redacted to `[upi]`; PAN was already blocked. The same filter now also runs on every Case field that can be shared. |
| Safe approvals (`standalone.js`) | One approval per proposal: two approvals arriving together (double click, two tabs, the phone page) create one task, and the second gets "already answered". If the proposal's text changed after it was shown, the approval is refused and must be given again. |
| Privacy Receipts card (`app.js`, `index.html`) | The ledger described above, plus real status rows (Nano, App Check, last cloud call, request counts). |
| Safety rails | 15 s cloud timeout (no endless spinner); the App Check debug provider can never turn on on the production domains, even with `?appcheck_debug`. |

Small edits to existing files: `index.html` (hybrid bar, scripts, local assets, "DEMO USER" label), `style.css` (appended hybrid styles), `sw.js` (caches the new files), `mobile.html` / `approve.html` (use browser-local data when there is no backend; mobile chat shows the same badge), `manifest.webmanifest` (paths).

## Architecture at a glance

```
                       Browser (Chrome 139+)
  +--------------------------------------------------------------+
  |  Dashboard UI (app.js)  <->  standalone.js (in-browser backend)|
  |        |                       IndexedDB: memories, tasks,     |
  |        |                       proposals + privacy guard       |
  |        v                                                       |
  |  hybrid.js  --  Firebase AI Logic  getGenerativeModel(        |
  |                    mode: InferenceMode.*)                      |
  |        |                                                       |
  |        +--> ON-DEVICE: Gemini Nano (Chrome Prompt API)         |
  |        |        no network, private notes allowed here         |
  |        |                                                       |
  |        +--> IN-CLOUD: Gemini (gemini-3.5-flash-lite, backup   |
  |                 gemini-4-hydrogen) via Firebase AI Logic   |
  |                 |                                              |
  +-----------------|----------------------------------------------+
                    |  every request carries an App Check token
                    |  (reCAPTCHA Enterprise attestation)
                    v
          Firebase AI Logic  ->  Gemini Developer API
```

- **Speed:** replies stream into the chat bubble as they are generated, a "Thinking..." bubble appears the instant Send is pressed, and the App Check (reCAPTCHA) token is fetched in the background at page load so the first message does not wait for it.
- **Route:** the header dropdown picks the `InferenceMode` (prefer on-device, only on-device, prefer cloud). The SDK decides per request and reports where it ran; the reply badge shows that plus latency.
- **Protection:** the cloud path is guarded by **Firebase App Check** (reCAPTCHA Enterprise), so only this app can call the model. Localhost uses the debug provider instead.
- **Data:** all demo data lives in the visitor's own browser. There is no server of ours.

## How the cloud and Gemini Nano split the work

| Job | Who does it | Why not the other one |
|---|---|---|
| Private names, notes and figures | Browser code + Gemini Nano | The cloud never needs them; sealing and the allowlist keep them home. |
| Planning, wide knowledge, long reasoning | Cloud Gemini, on sealed text | Nano is small and, on an 8 GB laptop, slow (the author measured about 19 s to the first word on a CPU-only test VM). |
| Facts the cloud needs to plan well | Local tools the cloud calls (`count_memories_by_type`, `check_local_capability`, `estimate_task_effort`) | The answer is a count or yes/no; the data itself stays local. Every tool result is validated and scanned before it is sent. |
| Turning `[TASK_2]` back into the real title, and saving changes | Browser, after you approve | Only the browser knows what the tokens mean. |
| Answering when the cloud is down, blocked or slow | Gemini Nano, then a plain offline plan | The cloud cannot help when it is unreachable. |

## How the hybrid routing works

Chat builds one prompt (instructions + the most relevant saved notes + the last few turns) and calls Firebase AI Logic's `getGenerativeModel` with an `InferenceMode`:

| Dropdown | `InferenceMode` | Behaviour |
|---|---|---|
| Prefer On-Device (Hybrid) | `PREFER_ON_DEVICE` | Gemini Nano if it is ready, otherwise cloud Gemini (`gemini-3.5-flash-lite`, backup `gemini-4-hydrogen`). |
| Only On-Device (Offline) | `ONLY_ON_DEVICE` | Gemini Nano only. If it is not ready, you get a clear error - never a silent cloud call. |
| Prefer Cloud | `PREFER_IN_CLOUD` | Cloud first; falls back to Gemini Nano if the cloud call fails. |

The badge reads `result.response.inferenceSource` from the SDK, so it reports what actually ran, not what was requested.

**Private notes stay on-device.** Saved notes marked `owner_private` are only added to the prompt in *Only On-Device* mode. In the other two modes a request might leave the device, so those notes are withheld, and the badge says how many were kept out.

**Offline Demo Mode** switches to *Only On-Device* and wraps `fetch` so that any cross-origin request from the page fails. The shell (app, Firebase bundle, fonts, charts) is cached by the service worker, so after one online visit the page loads and chats with no connection.

## Privacy-checked action proposals

When a message looks like "remember that..." / "I prefer..." / "I need to...", the assistant *proposes* a memory or a task. Nothing is saved until you press **Approve**.

- **Redacted** - emails and phone numbers are replaced with `[email]` / `[phone]`; you approve the redacted text.
- **Blocked** - card numbers, API keys, passwords/PINs and government ID numbers cannot be saved at all. Use **Edit** to remove the secret (it is re-checked), or **Reject**.
- Memories also need a *domain* and its one *axis* (sensitivity / volatility / failure history) before Approve unlocks - the same rule as the original AION.

The guard is a pattern check, **not** a guarantee of catching every identifier.

## Set up and deploy

```bash
npm install
npm run vendor      # copies Chart.js + fonts into public/ (already committed)
npm run build       # bundles src/hybrid.js -> public/hybrid.bundle.js
npm run serve       # http://localhost:8080
firebase deploy --only hosting   # or: npm run deploy
```

Firebase console, project `aion-hybrid-ai`:

1. **AI Logic** -> Get started -> choose the *Gemini Developer API* provider.
2. **App Check** -> register the web app with the **reCAPTCHA Enterprise** provider. Create a reCAPTCHA Enterprise *website* key (score-based, checkbox challenge off) whose allowed domains include your hosting domains (`<project>.web.app`, `<project>.firebaseapp.com`), save it in App Check, put the public site key into `RECAPTCHA_SITE_KEY` in `src/hybrid.js`, rebuild, and enforce App Check. The `appId` in the Firebase config must match the registered web app exactly - a mismatch gives `App not registered`. On `localhost` the page uses the **debug provider** instead: click **COPY TOKEN** in the header bar, add it under *Manage debug tokens*, then **SET TOKEN** to keep it across reloads. Never ship debug tokens to production.
3. The web API key in `src/hybrid.js` is not a secret, but restrict it to your hosting domains in Google Cloud console, and keep App Check enforcement on so only this app can call the model.
4. Cloud models are listed in `CLOUD_MODELS` in `src/hybrid.js` (first `gemini-3.5-flash-lite`, then `gemini-4-hydrogen`). If the first is rejected as unknown, the second is tried and both errors are shown. Model names change - check Firebase's models page.

## Verification: what was and was not tested

**hybrid-v2, 22 Nov 2026:** `python tests/headless_smoke.py` passes **160 / 160** checks. The new ones cover quote intake (pasted text and a screenshot read by a mocked multimodal Nano with 0 cloud requests), the image guard, Aadhaar/UPI/bank-account rules, one-task-per-approval and stale-text refusal, the Case tab's private review (verdict flip, what-if edits with zero network requests, unknowns reported instead of guessed), sealing of pending task titles in `/plan`, the router decisions, receipts (measured latency, frozen, counts), the allowlist refusing an extra field before anything is sent, App Check 403 handling with and without Nano, the planner's tool round and JSON phase, approval gating, the `/plan` command in the real chat box, the receipts ledger matching each receipt to exactly its own network requests, the export, and the production App Check error wording. **In these tests the cloud model and Nano are mocked** (fake network replies and a fake `LanguageModel`).

**Live check, 22 Nov 2026** (preview channel of this build, the author's real Chrome, Windows laptop with 8 GB RAM and no GPU; numbers read from the app's own receipts and the browser's network log):

| What | Result |
|---|---|
| App Check (reCAPTCHA Enterprise) | verified in 1.8 s |
| Cloud chat (`gemini-3.5-flash-lite`, sealed) | first attempt stopped at the 15 s limit; next attempt HTTP 200 in 8.1 s |
| Blindfold Planner, real Gemini | worked: the model called the local tool `estimate_task_effort` twice, then returned a JSON plan that passed validation; 12.5 s; 4 steps, 3 waiting for approval; the ledger matched the receipt to its own requests |
| Gemini Nano, real (not mocked) | cold, tiny prompt: 21.5 s to first word. Warm, full chat prompt: 2.9 s to first word, 8.3 s total, nothing sent to the cloud. One cold fallback right after a cloud timeout failed after 40 s (the error message now says so) |
| Automated test browser | App Check failed there (reCAPTCHA does not trust automated browsers), and the app showed the App Check message instead of hanging |

These are single runs on one machine, not averages. Cloud speed varied a lot on this day. A later run on the live site showed the planner's 3 cloud requests going past 15 s and a cold Nano fallback taking about 60 s before the offline plan; the planner was then changed to 2 requests, a 25 s plan cap, and no fallback to a cold Nano.

Earlier (main branch, 54 checks): page and panel loading, seeded memories/tasks/approvals, privacy redaction and blocking, Edit -> re-check -> Approve, persistence after reload, mode switching, per-reply badge, Offline Demo Mode blocking external requests, the approvals and mobile pages, the backup-model retry, the exact-error chat bubble, and the saved App Check token.

**Cloud path:** checked on the deployed site on 21 Nov 2026 - a clean browser session on https://aion-hybrid-ai.web.app, *Prefer Cloud*, "Summarize my tasks for today" returned a real cloud Gemini reply (served by `gemini-4-hydrogen`, the first-choice model at that time) (HTTP 200, no App Check error) with the In-Cloud badge and latency. The author repeated this in a Chrome Incognito window. Before the speed changes, the first reply on a fresh page took roughly 24-120 s in that test . The cause turned out to be the model, not App Check: `gemini-4-hydrogen` needed ~125 s for a trivial prompt, while `gemini-3.5-flash-lite` answers in about 1 s. Flash-lite is now the first choice; streaming, an App Check warm-up and a live "Thinking..." bubble were also added.

**Gemini Nano:** the automated tests use a **mock `LanguageModel`**. The author reports real Nano working on their own machine; this was not independently verified in the automated tests. Nano needs desktop Chrome 139+ with enough disk/RAM, and may be unavailable on low-spec machines (the page then falls back to cloud, or errors in *Only On-Device* mode).

Known limits:

- On-device inference supports single-turn text; conversation history is folded into the prompt.
- Token counts on the Providers panel are rough estimates (characters / 4).
- Browser pages cannot read CPU load or RAM use, so the status panel shows only what the browser reports (core count, rounded device memory) and says load and usage are not readable. No invented numbers.
- Receipts and their network evidence live in memory for the open tab only; reloading clears them (use EXPORT first).
- The sensitive-message check in the router is a pattern check, like the privacy guard; it can miss things.
- Data lives in this browser's IndexedDB only; clearing site data erases it.
- Server-side speech transcription and the "run command" box need the original backend and are switched off in the hosted demo (browser speech recognition still works where Chrome supports it).

## License

Apache License 2.0 - see [LICENSE](LICENSE) and [NOTICE](NOTICE). Third-party components: [THIRD_PARTY.md](THIRD_PARTY.md).
