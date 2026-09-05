# Recoup

**An AI agent that detects failed payments, diagnoses why they failed, and recovers the revenue — with hard guardrails and a full audit trail.**

Built for Razorpay's Buildathon, Track 03: AI Revenue Recovery.

[Live demo](#) · [Technical documentation](./DEVELOPER_DOCUMENTATION.md) · [Build journal](./BUILD_JOURNAL.md) 

---

## The problem

When a customer's payment fails — a wrong OTP, a timeout, their bank being down — most merchants have no automated way to find out *why* it failed or *win that revenue back*. The failure just sits there, silent. No diagnosis, no follow-up, no recovery.

## What Recoup does

```
Payment fails
   → Webhook received & signature-verified
   → Diagnosed automatically (rules first, LLM fallback for unknown causes)
   → Decision engine applies rule-based guardrails (retry caps, cooldowns, escalation)
   → Sits in a pending-approval queue — nothing is sent without a merchant's tap
   → Recovery link + email sent
   → Customer can pay, reply, or ignore — the system listens either way
   → Every step logged to a full audit trail
```

- **Diagnosis** — a rule table handles known Razorpay error codes instantly; a Gemini fallback reasons about unknown ones, restricted to a fixed set of allowed actions
- **Decision-making is rule-based, not LLM-controlled** — retry caps, cooldowns, and escalation are deterministic and provable, with cause-specific timing modeled on real card-network guidance (Visa/Mastercard)
- **A human approval checkpoint** — no customer is ever contacted without an explicit merchant tap
- **Promise-to-pay tracking** — customers can reply ("I'll pay Friday," "already paid," "stop contacting me") via a tokenized link; the LLM parses free text into a bounded intent, and a background scheduler automatically resumes recovery if a promise goes unfulfilled
- **A gateway adapter layer** — core logic isn't hardcoded to Razorpay
- **A full audit trail** — every event, diagnosis, decision, and outcome is logged and viewable per payment, with a plain-language summary for a merchant and the full reasoning ledger underneath for anyone verifying the "how"

See [`DEVELOPER_DOCUMENTATION.md`](./DEVELOPER_DOCUMENTATION.md) for the full architecture, and [`system-flow-diagram.svg`](./system-flow-diagram.svg) for a visual walkthrough.

## Tech stack

| Layer | Choice |
|---|---|
| Backend | Node.js + Express |
| Database | PostgreSQL (Neon) |
| Payments | Razorpay (test mode), behind a gateway adapter |
| LLM | Gemini API, Flash-Lite tier |
| Frontend | React + Vite + Tailwind CSS |
| Email | Resend |
| Local tunnel | ngrok |

## Getting started

### Prerequisites
- Node.js 18+
- A Postgres database (e.g. a free [Neon](https://neon.tech) project)
- A [Razorpay](https://razorpay.com) test-mode account
- A [Gemini API key](https://aistudio.google.com/apikey) (free tier)
- A [Resend](https://resend.com) API key

### Setup

```bash
git clone https://github.com/rocklegend14/revenue-recovery-agent.git
cd revenue-recovery-agent/backend
npm install
```

Run the guided setup wizard instead of hand-editing `.env`:

```bash
node scripts/setup-wizard.js
```

Then apply the database schema:

```bash
node db/migrate.js
```

### Running locally

```bash
./start.sh      # Mac/Linux — starts ngrok, detects the URL, starts the server
start.bat       # Windows
```

Register the printed ngrok URL (`<url>/webhooks/razorpay`) as your Razorpay webhook endpoint (Dashboard → Settings → Webhooks), for events `payment.failed`, `payment.authorized`, `payment_link.paid`.

In a separate terminal, start the dashboard:

```bash
cd frontend
npm install
npm run dev
```

See [`MERCHANT_SETUP.md`](./MERCHANT_SETUP.md) for the full setup rationale and a non-technical walkthrough.

### Generating a demo batch

```bash
cd backend
node scripts/generate_batch.js       # creates 50 synthetic failed payments
node scripts/run_diagnosis.js
node scripts/run_decisions.js
node scripts/record_batch.js "Demo batch"
```

## Deployment

Backend deploys to [Render](https://render.com) (root directory `backend`, start command `node server.js`); frontend deploys to [Vercel](https://vercel.com) (root directory `frontend`, framework preset Vite). See [`DEVELOPER_DOCUMENTATION.md` ](./DEVELOPER_DOCUMENTATION.md) for environment variable details.

## Project structure

```
revenue-recovery-agent/
├── backend/
│   ├── server.js
│   ├── scheduler.js          # continuous broken-promise sweep
│   ├── db/                   # schema + migrations
│   ├── routes/                # webhooks, dashboard API, approval queue, public respond page
│   ├── engine/                 # diagnosis, decision, guardrails, commitments
│   ├── services/gateways/    # gateway adapter layer
│   └── scripts/                # batch generation, one-off runs, batch recording
└── frontend/
    └── src/
        ├── App.jsx            # tabbed dashboard: Overview / Approvals / Payments
        └── components/
```

Full annotated layout in [`DEVELOPER_DOCUMENTATION.md` ](./DEVELOPER_DOCUMENTATION.md).

## Documentation

- [`DEVELOPER_DOCUMENTATION.md`](./DEVELOPER_DOCUMENTATION.md) — architecture, stack, and how every piece works
- [`BUILD_JOURNAL.md`](./BUILD_JOURNAL.md) — problems hit during the build and how they were solved, from planning to final product
- [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md) — step-by-step walkthrough script covering every feature and escalation path
- [`MERCHANT_SETUP.md`](./MERCHANT_SETUP.md) — non-technical setup guide

## License

MIT — see [`LICENSE`](./LICENSE).
