# Making This Usable Without a Terminal — Simplification Plan

**Problem:** right now, getting the dashboard running requires editing `.env` by hand and running several terminal commands in the right order (`ngrok http 3000`, then `node server.js`, then separately starting the frontend). That's a reasonable workflow for a developer and a non-starter for a merchant.

This plan has two tiers: a **same-day fix** (built below, ready to drop in) and a **better fix** (worth doing if there's time after the deadline, described but not built — it needs actual backend routes this session doesn't have access to).

---

## Tier 1 — same-day fix (included in this delivery)

Three files, meant to sit in your existing `backend/` folder:

| File | Goes in | What it replaces |
|---|---|---|
| `scripts/setup-wizard.js` | `backend/scripts/` | manually opening `.env` and typing keys into it |
| `start.sh` | `backend/` (repo root of the backend) | manually running `ngrok http 3000` in one terminal and `node server.js` in another |
| `start.bat` | `backend/` | same as above, Windows equivalent |

**What it does for the merchant:**
1. They run **one command**: `./start.sh` (Mac/Linux) or double-click `start.bat` (Windows).
2. If there's no `.env` yet, it runs the setup wizard automatically first — a plain-English, one-question-at-a-time prompt for each credential (Razorpay keys, Neon connection string, Gemini key, Resend key, from-address), instead of a raw `.env` file with no explanation of what each line means. Re-running it later to fix one value shows the current value so they're not retyping everything.
3. It starts ngrok, waits for it to come up, reads the live URL automatically, writes it into `.env` for them, and prints the exact webhook URL to paste into the Razorpay dashboard.
4. It starts the server.

**What this does *not* solve:** the merchant still has to (a) have Node installed, and (b) paste one URL into the Razorpay dashboard once per ngrok restart, since the free ngrok tier issues a new URL every time. That second point goes away entirely once deployment happens (see Step 13 / §6 in the dev docs) — a deployed URL is permanent, so this whole ngrok dance disappears and the webhook is registered once, ever. **Deployment, not tooling, is the real fix for this specific pain point** — treat Tier 1 as a bridge to get through the demo, not the end state.

### To install it
```bash
# from your backend/ folder
cp start.sh start.bat .
cp setup-wizard.js scripts/
chmod +x start.sh
```
Then just run `./start.sh`.

---

## Tier 2 — better fix (design only, not built this session)

The real long-term answer is an in-dashboard **Settings page** — a merchant logs into the already-built React dashboard and enters their Razorpay keys, Resend key, etc. through a form, which POSTs to a new backend endpoint that writes/updates the running config (stored encrypted in Postgres rather than a `.env` file, since a deployed server's `.env` isn't something a merchant can reach anyway).

This wasn't built in this session because it requires:
- A new `settings` table (or similar) and encryption-at-rest approach for the stored secrets
- A new authenticated route in `routes/` (the dashboard currently has no auth layer at all — every route is open, which is fine for a hackathon demo but is a prerequisite for letting someone type API keys into a web form)
- A `Settings.jsx` component wired into the existing dashboard nav

Given the deadline, **Tier 1 is the right scope for today** — it removes the "edit a raw `.env` file" problem entirely and cuts the terminal interaction down to one command. Tier 2 is the correct next step once there's time, and is worth mentioning to the judges as the identified next iteration — it shows you've thought about the real merchant, not just the demo.

---

## Verified against your actual repository

This plan was originally written from your project documentation alone. It's since been checked directly against your uploaded `revenue-recovery-agent-main.zip`, and everything above holds up:

- The seven env vars in `setup-wizard.js` (`DATABASE_URL`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `GEMINI_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `PUBLIC_BASE_URL`) match exactly what your code reads via `process.env`.
- Three more env vars exist in the code but were left out of the wizard on purpose, since they all have working defaults and a merchant shouldn't be asked about them: `PAYMENT_GATEWAY` (defaults to `razorpay`), `PORT` (defaults to `3000`), `PAYMENT_LINK_CALLBACK_URL` (optional, undefined is fine). If you ever add a second gateway adapter, `PAYMENT_GATEWAY` is worth adding to the wizard at that point.
- `start.sh` / `start.bat` call `node server.js` directly, which matches how your `backend/package.json` is set up today (it only defines a `dev` script via `nodemon`, no `start` — the launcher scripts don't depend on that).

No corrections were needed to the setup files themselves.
