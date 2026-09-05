#!/usr/bin/env node
/**
 * setup-wizard.js
 *
 * A guided, question-by-question setup for merchants who should never
 * have to open a .env file or a terminal command reference.
 *
 * Run it with:   node scripts/setup-wizard.js
 * (or via `npm run setup`, if that alias is added to package.json)
 *
 * It asks a handful of plain-English questions and writes backend/.env
 * for you. If a .env already exists, it shows current values as
 * defaults so re-running this to update one thing is painless.
 *
 * Assumes: run from the backend/ folder, with a .env.example present
 * (used to know which keys the app expects). If your actual .env
 * doesn't match these key names, edit ENV_QUESTIONS below to match.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ENV_PATH = path.join(__dirname, '..', '.env');

// One entry per .env variable this wizard manages.
// `secret: true` masks the input as the merchant types it.
const ENV_QUESTIONS = [
  {
    key: 'DATABASE_URL',
    prompt: 'Paste your Neon/Postgres connection string',
    help: 'Found in your Neon dashboard under "Connection Details".',
    secret: true,
  },
  {
    key: 'RAZORPAY_KEY_ID',
    prompt: 'Your Razorpay Key ID',
    help: 'Razorpay Dashboard → Settings → API Keys.',
  },
  {
    key: 'RAZORPAY_KEY_SECRET',
    prompt: 'Your Razorpay Key Secret',
    help: 'Shown once when you generate the API key — same screen as above.',
    secret: true,
  },
  {
    key: 'RAZORPAY_WEBHOOK_SECRET',
    prompt: 'Your Razorpay Webhook Secret',
    help: 'Razorpay Dashboard → Settings → Webhooks → (your webhook) → Secret.',
    secret: true,
  },
  {
    key: 'GEMINI_API_KEY',
    prompt: 'Your Gemini API key',
    help: 'From Google AI Studio (aistudio.google.com/apikey). Free tier is fine.',
    secret: true,
  },
  {
    key: 'RESEND_API_KEY',
    prompt: 'Your Resend API key',
    help: 'From resend.com/api-keys — used to send recovery emails.',
    secret: true,
  },
  {
    key: 'RESEND_FROM_EMAIL',
    prompt: 'The "from" email address recovery messages should be sent from',
    help: 'Must be a verified sender/domain in your Resend account.',
  },
  {
    key: 'PUBLIC_BASE_URL',
    prompt: 'Your public server URL (the ngrok URL, or your deployed backend URL)',
    help: 'No trailing slash. Example: https://abcd1234.ngrok-free.app',
  },
];

function loadExistingEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const text = fs.readFileSync(ENV_PATH, 'utf8');
  const values = {};
  for (const line of text.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

function maskValue(value) {
  if (!value) return '';
  if (value.length <= 6) return '••••••';
  return value.slice(0, 3) + '••••••' + value.slice(-3);
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  const existing = loadExistingEnv();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n=== Recoup — Setup ===');
  console.log("Answer the questions below. Press Enter to keep the current value shown in [brackets].\n");

  const answers = { ...existing };

  for (const q of ENV_QUESTIONS) {
    const current = existing[q.key];
    const shown = current ? (q.secret ? maskValue(current) : current) : '';
    const suffix = shown ? ` [${shown}]` : '';
    if (q.help) console.log(`  ${q.help}`);
    const input = await ask(rl, `${q.prompt}${suffix}: `);
    if (input.trim() !== '') {
      answers[q.key] = input.trim().replace(/\/$/, ''); // strip trailing slash defensively
    } else if (current) {
      answers[q.key] = current;
    } else {
      console.log(`  (left blank — you can re-run this wizard later to fill it in)`);
      answers[q.key] = '';
    }
    console.log('');
  }

  rl.close();

  const lines = ENV_QUESTIONS.map((q) => `${q.key}=${answers[q.key] || ''}`);
  fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n');

  console.log('Saved to .env. You will not need to edit that file by hand.');
  console.log('Next: run "./start.sh" (Mac/Linux) or double-click "start.bat" (Windows) to launch the server.\n');
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});