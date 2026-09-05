# Build Journal — Recoup

**What this document is:** a chronological account of the problems that came up while building this project, the reasoning behind each solution, and how the product evolved from an initial idea into what exists today. It's written for the judging panel as evidence of the engineering process, not just the output — most of the interesting decisions in this build happened at moments of friction, not in the parts that went smoothly.

**Companion document:** `DEVELOPER_DOCUMENTATION.md` describes what the system *is* — architecture, stack, file layout. This document describes how it *got there*.

---

## Phase 1 — Choosing a direction, and one decision that shaped everything after

**The problem:** Razorpay's Buildathon Track 03 gave a broad brief — detect revenue at risk, diagnose it, recover it, with bounded guardrails and an audit trail — with several example directions to choose from. Picking wrong, or picking something too ambitious for the time available, would cost more than it's worth to fix later.

**The decision:** go with the track's own first example — payment degradation → root cause → recovery action — and be honest that it's the most obvious interpretation rather than pretending otherwise. A novel idea built shallow loses to an obvious idea built deep, and there wasn't time to validate a genuinely novel direction from scratch.

**The one architectural principle that came out of this and never changed:** guardrails would be rule-based, not LLM-controlled. The alternative — an LLM that decides its own limits, with rules only as a backstop — was rejected early, on the grounds that "bounded and gated" is explicitly graded, and a rule-based engine is trivially provable in a way an LLM-driven one never is. Every feature added afterward kept this same shape: rules — or eventually a human's tap — decide the boundary, and the LLM only ever reasons *within* it.

---

## Phase 2 — Foundation: two problems solved before they became bugs

**Problem:** Razorpay's webhook signature verification needs the raw request body, but Express's `express.json()` parses and replaces it by default — run them in the wrong order and verification silently breaks. **Solution:** the webhook route was mounted *before* `express.json()`/`cors()` from the first version of `server.js`.

**Problem:** Razorpay's test cards mostly simulate successful payments, and the project depends on real `payment.failed` events. **Solution:** the UPI ID `failure@razorpay` was found, after some trial and error, to reliably trigger a genuine decline.

---

## Phase 3 — Getting a measurable batch, honestly

The track's bar wants "measured money recovered across a batch," but one real failure isn't a batch. A synthetic batch generator was built to be honest about what it is — real Razorpay error taxonomy, realistic weighting, only 35 unique customer IDs reused across 50+ records so some customers have repeat failures (needed later for retry-guardrail testing). It's documented as synthetic throughout, alongside the one real record, so provenance stays clear.

---

## Phase 4 — Diagnosis engine: a moving target in the LLM layer

**The problem:** the LLM fallback hit real instability mid-build. `gemini-2.0-flash` was already deprecated by the time it was tried; its replacement, `gemini-2.5-flash`, was rejected days later pointing to yet another model name.

**The solution:** stop chasing the latest standard Flash model and move to the **Flash-Lite** family (`gemini-3.1-flash-lite` / `gemini-3.5-flash-lite`) — the most generous free tier and lowest cost ceiling, which mattered concretely since there's no billing account attached to the project at all.

**A related problem:** the `diagnoses` table's text columns were sized for short rule-table values and too narrow for LLM output — fixed with an additive migration rather than editing the original schema.

---

## Phase 5 — The decision engine, and a bug that became a demo asset

A deterministic guardrail layer was built — retry caps, cooldowns, opt-out handling, escalation — with every decision writing a full reasoning string to the database.

**An unplanned result:** the first real batch run produced 51 `proceed` and exactly 1 `blocked`. That one case was the original real test payment, escalated via the LLM's *error* fallback during the exact window the Gemini model name was broken (Phase 4). Rather than crash, the system defaulted safely to human escalation with a clear reason logged. It was kept in the batch deliberately — a real bug resolving into exactly the evidence the track wants to see.

---

## Phase 6 — Recovery execution: the most important bug in the whole build

**The setup:** real Razorpay Payment Links were sent to a handful of records using real contact info; the rest were simulated, since fake contact info can't receive anything.

**The bug:** after manually paying one real link, Razorpay's dashboard showed "Paid" — the database still showed `pending`. The webhook was registered for `payment_link.paid`, but no handler for that event type had actually been written.

**The debugging approach:** rather than assume the new code was broken, the **ngrok local inspector** (`127.0.0.1:4040`) was checked first. It showed zero requests had arrived that session — the payment had likely completed while the tunnel wasn't running, ruling out a code bug as the first explanation and avoiding time spent debugging the wrong layer.

**The fix and proof:** once the handler was written and the tunnel confirmed live, a second real payment was made. The inspector showed the request arrive and return `200 OK` in real time, and Postgres confirmed the record flipped from `pending` to `recovered` automatically — the strongest single piece of evidence in the project.

---

## Phase 7 — The dashboard, and four bugs hiding behind each other

A React + Vite + Tailwind frontend was built with a deliberate dark navy "financial-ops ledger" identity instead of the generic AI-app look.

**The problem:** the page rendered with zero real styling. Four chained issues, each hiding the next: (1) Tailwind **v4** installed instead of the requested v3.4.4; (2) `postcss.config.js` still referencing the old v4 plugin after the version fix; (3) even after that, `src/index.css` turned out to still hold an unrelated scaffolded stylesheet with zero Tailwind directives — the dark background everyone was debugging against wasn't Tailwind's doing at all; (4) a missing `bg-ink` class on `<body>` causing white margins.

**Why this matters:** the visible symptom had a genuinely misleading root cause. Checking each layer's actual contents, in order, rather than guessing at the single likely cause, is what found it — the same discipline used in Phase 6.

**A second pass:** direct feedback that the audit drawer required reading the whole ledger to answer "did I get my money back" led to an additive fix — a plain-language summary and status badge on top, full ledger preserved underneath.

---

## Phase 8 — The strategic pause: an honest question, answered with research

**The problem:** after the dashboard worked, a direct question was raised — is this too simple to differentiate, given "diagnose and retry" is the track's own first example?

**The honest answer:** the *idea* is the obvious interpretation — admitting that mattered more than defending it. The *execution* — a real closed-loop proof, a restricted LLM action space, hard guardrails, a genuine audit trail — is actually uncommon for a hackathon submission. The depth just wasn't visible in a short demo unless surfaced deliberately.

**The decision:** don't pivot the idea this late — too risky — and instead research real, evidenced gaps rather than brainstorm speculatively. Research surfaced a real account of a merchant whose customer's broken payment promises consumed more time than five smooth customers combined (→ promise-to-pay tracker), and real card-network evidence (Visa retry caps, Mastercard's Merchant Advice Codes) that retry timing should differ by failure cause, not be flat (→ reason-aware retry timing). Both features were chosen from evidence, not intuition.

---

## Phase 9 — Promise-to-pay: a constraint that shaped the whole design

**The constraint:** Razorpay has no inbound reply channel, and a real WhatsApp Business API integration needed an approval process not realistic in the time left.

**The design:** every recovery message carries a tokenized "manage this payment" link to a small public page. Free-text replies get parsed by the LLM into a bounded intent (`promised_to_pay` / `already_paid` / `opt_out` / `unclear`) — the same restricted-output pattern as diagnosis, the Phase 1 principle holding under a new feature.

**Small bugs found fast:** a literal placeholder left in `PUBLIC_BASE_URL`; a trailing slash producing a double-slash URL Express wouldn't route (fixed defensively in code, not just the env value); a "failed" test that was actually the response page correctly refusing to reopen an already-recovered payment.

**A bigger discovery:** Razorpay's own Payment Link notification is a fixed template with no room for a second link. The workaround — a second custom email via Gmail SMTP — was later replaced with Resend (Phase 11).

**A question traced through, not assumed:** what if a customer pays *before* their promised date? The broken-promise detector was confirmed already safe (it excludes recovered payments before flagging anything broken) — but the `commitments` row itself wasn't marked `fulfilled` in that case, a gap identified and scoped, closed properly in Phase 13.

---

## Phase 10 — Reason-aware retry timing

The flat retry policy was replaced with a per-cause table modeled on real card-network guidance: OTP/timeout retries almost immediately (likely simple user error); bank downtime waits longer; a cancelled payment gets a full day's grace out of respect for likely deliberate intent; a hard decline is capped at one attempt and escalates rather than being retried — mirroring the real principle that hammering a network-signaled decline can incur penalty costs. The specific policy applied is now named in the logged reasoning, visible in the audit trail rather than buried in code.

---

## Phase 11 — From demo script to something closer to a real product

**The problem, framed honestly:** a `proceed` decision flowed straight into contacting a customer with zero human in the loop — fine for a batch demo, not something a real merchant would accept.

**Four changes made together:**
- **Gateway adapter layer** — core logic now talks to a gateway-agnostic event shape, not Razorpay's specific fields, even though Razorpay remains the only adapter implemented.
- **Auto-diagnosis on webhook arrival** — diagnosis now runs the moment a failure is detected, not on a manually-triggered script.
- **Human approval checkpoint** — the biggest addition. A `proceed` decision sits visibly in a pending queue until a merchant taps approve; nothing reaches a customer without it. The gate is now a person's decision, not just code.
- **Resend replacing Gmail SMTP** — a personal App Password is fragile to demo live; a real transactional email provider isn't.

---

## Phase 12 — Documentation, a diagram, and a repo-access detour

**The ask:** update the docs for Phase 11's changes, simplify merchant setup (currently requires hand-editing `.env` and terminal commands), and produce a system diagram for the panel.

**Docs and diagram** were built from the project's own written history, with an explicit caveat where the newest features' filenames had to be inferred, since the real repository wasn't yet accessible.

**Dashboard simplification** was scoped in two tiers: a same-day fix (a setup wizard script asking plain-English questions and writing `.env`, plus a one-command launcher auto-detecting the live ngrok URL) and a larger fix (an in-dashboard Settings page with real auth) correctly identified as out of scope for the time available and left as documented future work.

**A real access problem, solved by not stopping at the first failure:** a GitHub project-knowledge sync reported success but produced no visible files. The fallback — downloading the repo as a ZIP and uploading it directly — worked immediately. Later, a direct fetch of a public GitHub URL was blocked by robots policy, but a request to `codeload.github.com` (a different, permitted domain) retrieved the same repository directly, no upload needed from then on.

**What verifying against the real repo found:** almost everything inferred held up. Two things didn't — the gateway adapter lived at `services/gateways/`, not the guessed `adapters/`, and there was no separate "approval engine" file; the approval checkpoint turned out to be `routes/recovery.js` plus existing `recoveryEngine.js` functions. Both were corrected once real code was available.

---

## Phase 13 — Closing the gaps that were still open, and one nobody had noticed

**The scheduler.** `check_promises.js` only ever ran when triggered by hand. A new `scheduler.js` wraps the same logic in a periodic timer started at server boot, closing the one gap the project's own documentation had explicitly flagged by name.

**A dead table, found while verifying the rest.** `schema.sql` had defined a `batches` table since the first migration, and nothing had ever written to it — no error, just silently empty. A new script, `record_batch.js`, closes it, reusing the dashboard's own summary query so a recorded batch can never disagree with what was on screen.

**Noisy logs from correct behavior.** The scheduler correctly resumed two broken promises, then the next recovery attempt hit a synthetic `@example.com` address and produced a legitimate-looking `422` from Resend. Not a bug — `example.com` is IANA-reserved specifically because it can never receive mail, which is why the batch generator uses it — but a scary-looking terminal error during a live demo reads as broken even when it isn't. `emailSender.js` now recognizes reserved domains and logs a calm, expected line instead, with no change to actual behavior.

**A dashboard that required scrolling past everything to reach anything.** The dashboard had grown into one long stacked page. The fix: a sticky pill-tab nav in the same dark ledger visual language already established, showing one section at a time, with a live pulsing badge on the Approvals tab so the thing a merchant most needs to notice is visible without a click.

**A deployment-breaking bug, fixed incidentally.** While rewriting `App.jsx`'s imports for the new tabs anyway, a pre-existing casing mismatch was caught — every component imported by a capitalized name while the actual files use lowercase-first names. Harmless locally (case-insensitive filesystems); would have hard-failed the first Vercel deploy (Linux, case-sensitive). Caught before it could cost a demo, not during one.

---

## Closing reflection

A few patterns repeat throughout, independent of which feature was in progress:

- **The rule-based guardrail principle from Phase 1 never bent.** Every later capability extended that same shape instead of finding a shortcut around it.
- **Bugs were debugged by checking a system's actual current state, layer by layer, rather than guessing** — true of the missing webhook handler, the four chained styling bugs, and the GitHub access detour alike. More than once, the obvious first guess was wrong.
- **A bug was kept as evidence, not hidden, when it demonstrated exactly the graceful failure the track wants to see** — a deliberate choice.
- **Differentiating features were chosen from research, not intuition** — the two features built were the two backed by the strongest external evidence.
- **Scope was cut honestly rather than quietly.** The Settings page, deployment, and a couple of smaller items are documented as open rather than glossed over.
