# AION Hybrid Web

A personal AI dashboard that answers **on your device first** (Chrome's built-in Gemini Nano) and only goes to the **cloud** (Gemini through Firebase AI Logic) when it has to - built for **#BuildHybridAI 2026**.

It runs 100% in the browser. No server, no sign-in. Open the hosted URL and everything works: chat with local memory, privacy-checked approval cards, knowledge graph and task progress.

**Live demo: https://aion-hybrid-ai.web.app**

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
6. On Home, three proposal cards are waiting - **Approve / Edit / Reject**. One has an email address (it is redacted), one is a task, and one contains a password (it is **blocked** until you edit it).

The demo data is a **fictional person ("Alex")**. Nothing from the author's real data is in this repo. Reset it any time from the browser console: `AionStandalone.resetDemo()`.

## What existed before 11 Nov 2026 vs. what is new

### Existing before 11 Nov (copied from the author's private AION project)

The dashboard front end - static files only. Per file timestamps they were last changed 12-16 Oct 2026:

- `index.html`, `style.css`, `app.js` - the desktop "Engineering Control Center" (home, chat, Climb progress, providers, knowledge graph, skills, Guardian, settings).
- `mobile.html`, `approve.html`, `manifest.webmanifest`, `sw.js`, `scene.jpg`, `icons/` - phone control page, approvals-only page, installable-app files.

The private Python backend (FastAPI, SQLite memory, provider router) is **not** part of this repository and was not modified.

### New for #BuildHybridAI 2026

| New | What it does |
|---|---|
| `src/hybrid.js` -> `public/hybrid.bundle.js` | Firebase init (modular v12 SDK, bundled with esbuild, no CDN), App Check, Firebase AI Logic with `InferenceMode` routing, Gemini Nano readiness light, route dropdown, Offline Demo Mode. |
| `public/standalone.js` | A stand-in backend inside the browser: IndexedDB store, fictional seed data, privacy guard, memory recall, approval/task logic. It answers the dashboard's `/api/*` calls locally; if a real AION backend answers instead, it steps aside. |
| Header bar + per-reply badge | Source (on-device / cloud) and latency on every AI reply. |
| Proposal cards (changes in `app.js`) | Privacy-check chip, **Edit** button next to Approve / Reject, task cards, saved across reloads. |
| `vendor/`, `fonts/`, `fonts.css` | Chart.js and fonts are now local so the page paints with no network. |
| `firebase.json`, `.firebaserc`, `LICENSE`, `NOTICE`, `THIRD_PARTY.md`, `tests/` | Hosting config, Apache-2.0 licence, headless smoke test. |

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

Tested (headless Chrome, `python tests/headless_smoke.py`, 54 checks): page and panel loading, seeded memories/tasks/approvals, privacy redaction and blocking, Edit -> re-check -> Approve, persistence after reload, mode switching, per-reply badge, Offline Demo Mode blocking external requests, the approvals and mobile pages, the backup-model retry, the exact-error chat bubble, and the saved App Check token.

**Cloud path:** checked on the deployed site on 21 Nov 2026 - a clean browser session on https://aion-hybrid-ai.web.app, *Prefer Cloud*, "Summarize my tasks for today" returned a real cloud Gemini reply (served by `gemini-4-hydrogen`, the first-choice model at that time) (HTTP 200, no App Check error) with the In-Cloud badge and latency. The author repeated this in a Chrome Incognito window. Before the speed changes, the first reply on a fresh page took roughly 24-120 s in that test . The cause turned out to be the model, not App Check: `gemini-4-hydrogen` needed ~125 s for a trivial prompt, while `gemini-3.5-flash-lite` answers in about 1 s. Flash-lite is now the first choice; streaming, an App Check warm-up and a live "Thinking..." bubble were also added.

**Gemini Nano:** the automated tests use a **mock `LanguageModel`**. The author reports real Nano working on their own machine; this was not independently verified in the automated tests. Nano needs desktop Chrome 139+ with enough disk/RAM, and may be unavailable on low-spec machines (the page then falls back to cloud, or errors in *Only On-Device* mode).

Known limits:

- On-device inference supports single-turn text; conversation history is folded into the prompt.
- Token counts on the Providers panel are rough estimates (characters / 4).
- Browser pages cannot read CPU load or RAM use, so those rows say "unreadable" instead of showing invented numbers.
- Data lives in this browser's IndexedDB only; clearing site data erases it.
- Server-side speech transcription and the "run command" box need the original backend and are switched off in the hosted demo (browser speech recognition still works where Chrome supports it).

## License

Apache License 2.0 - see [LICENSE](LICENSE) and [NOTICE](NOTICE). Third-party components: [THIRD_PARTY.md](THIRD_PARTY.md).
