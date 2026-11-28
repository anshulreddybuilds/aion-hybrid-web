# Ghost-Math: test on a friend's PC (about 30 minutes)

**Page:** https://aion-hybrid-ai--ghost-math-mtgo9hjf.web.app/ghost (preview; expires 5 Dec 2026)

**What this checks:** the parts the 8 GB laptop can't run (Gemini Nano on the device), plus one clean run of everything else on a second machine.

**Use the built-in sample only.** Don't paste your friend's real bank messages unless they want to try it themselves.

## Before you start
- [ ] Desktop **Google Chrome**, up to date (on-device AI needs Chrome 139 or newer). Check in Chrome menu → Help → About Google Chrome.
- [ ] For Gemini Nano the PC needs, roughly: Windows 10/11, macOS 13+ or Linux; **about 22 GB free** on the drive Chrome lives on; and either a graphics card with **more than 4 GB** of video memory, or **16 GB RAM** with 4+ CPU cores. Chrome checks this itself. Its own verdict is at `chrome://on-device-internals`.
- [ ] An unmetered connection (the model download is several GB).
- [ ] Have a phone ready to time things, and take screenshots as you go.

## A. Cloud path (5 min)
1. [ ] Open the page and hard-refresh (**Ctrl+Shift+R**).
2. [ ] The top pill says **App Check: on (reCAPTCHA)**. If it says *debug* or *error*, screenshot it. Everything after this needs it.
3. [ ] Set the route menu to **Prefer cloud**. Click **Use sample SMS**.
4. [ ] Step 02 shows **Spent ₹46,777**, **Rent + EMI share 43%**, **Savings rate 45%**.
5. [ ] Step 03: 12 rows, real names on the left, stand-ins (Person_A, Merchant_B…) and other numbers on the right. Click a row and both halves light up.
6. [ ] Click **Send fake numbers to cloud Gemini**. Step 04 says **Answered by cloud Gemini (gemini-3.5-flash-lite)**, a time in seconds, and **real names in it: 0 of 12 checked**. Note the time: ______ s
7. [ ] Tips are in ₹, say "a month", start with a capital letter and suggest a *partial* cut. The check line says **agrees** four times, or shows the gap.
8. [ ] Open **Show the request Gemini actually received**. Search it (Ctrl+F) for `rameshkumar`, `NETFLIX`, `24000`, `85000`. **None should be found.**

## B. Demo, and save the recording (5 min)
1. [ ] Keep **Prefer cloud**. Click **Play the demo** and watch it through (about a minute). Six numbered captions, then "Ghost-Math: the cloud does the maths, and never sees your money."
2. [ ] When it ends, click **Save this answer as the demo recording**. A file `ghost-demo-recording.json` downloads.
3. [ ] **Bring that file back** (email it to yourself or use a USB stick) and put it in the laptop's **Downloads** folder. Claude will check it, move it into `public/` and commit it. This is the recording the demo plays when no model can be reached.

## C. Gemini Nano on this device (10–30 min, mostly the download)
1. [ ] Open `chrome://on-device-internals` in a new tab. Note what it says about the model: ______
   - If the Prompt API is unavailable, open `chrome://flags`, set **Prompt API for Gemini Nano** to *Enabled*, restart Chrome, and look again. (Only if Chrome says the device isn't eligible, and only for this test: set **Enables optimization guide on device** to *Enabled BypassPerfRequirement*. Note that you did.)
2. [ ] Back on the page, hard-refresh. The second pill reads **Gemini Nano: …**
   - **needs download:** click **Get Gemini Nano**. Keep the tab open until the pill says **ready**. Download time: ______
   - **ready:** go on.
   - **unavailable / not on this browser:** screenshot the pill and hover it for the reason. Then skip to D.
3. [ ] Set the route to **This device only**. Click **Use sample SMS**. The button now reads **Ask Gemini Nano on this device (fake numbers)**.
4. [ ] Open DevTools (**F12**) → **Network**, and type `firebasevertexai` in the filter box.
5. [ ] Click the button. The first run can take 20–90 s (Nano is loading). Expected:
   - [ ] Step 04: **Answered by Gemini Nano on this device · nothing was sent**. Time: ______ s
   - [ ] The Network tab shows **no** `firebasevertexai` request.
   - [ ] Tips are in real ₹ with real names. The check line agrees, or gives the gap.
   - [ ] If it says "*answered but not in the JSON shape asked for*", Nano wrote prose instead of JSON. Note it and try once more; it's a known on-device risk, not a privacy problem.
6. [ ] Click it a second time (Nano is now warm). Time: ______ s
7. [ ] Set the route to **Prefer this device**. The button still says *Ask Gemini Nano on this device*. Send: it answers on the device, and there's no network request.

## D. Offline proof (3 min)
1. [ ] Turn **Wi-Fi off** (or unplug).
2. [ ] With Nano ready and **This device only**: Send. It still answers on the device.
3. [ ] Switch to **Prefer cloud** and Send. Expected: a one-line "No model answer: …" message that says your approval is kept. The rules' figures in step 02 stay on screen. No spinner that never ends (the page gives up after 15 s at most).
4. [ ] **Play the demo** while still offline. Step 5's caption says no model could be reached. If the recording from B is already in the build, it plays the **recorded** answer, labelled as recorded; otherwise it says the rules' figures are the answer.
5. [ ] Wi-Fi back on.

## E. Quick extras (optional, 5 min)
- [ ] Paste one of these into the box, then **Read on this device**. The sentence under the button should say what was left out and why:
  `OTP for txn of Rs 2,500.00 at AMAZON is 482910.` · `Your txn of Rs 1,200.00 to VPA zomato@paytm has FAILED.` · `आपके खाते XX4821 से ₹500 डेबिट हुए, UPI swiggy@icici को।`
- [ ] Chrome menu → *More tools* → *Developer tools* → phone icon → iPhone/Pixel size. No sideways scrolling, and the demo captions fit.

## Send back
- Screenshots of A6, C5 and D3; the times you wrote down; what `chrome://on-device-internals` said.
- The `ghost-demo-recording.json` file from B.
- Anything that looked wrong, with a screenshot.
