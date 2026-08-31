const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');
const { parseReplyIntent } = require('../engine/replyIntentParser');
const { recordCommitment } = require('../engine/commitmentEngine');

const router = express.Router();

function generateResponseToken() {
  return crypto.randomBytes(16).toString('hex');
}

// GET /respond/:token — simple, mobile-friendly public page. No auth: the
// token itself is the access control (long, random, single-purpose).
router.get('/:token', async (req, res) => {
  const { token } = req.params;
  const { rows } = await pool.query(
    `SELECT ra.payment_id, ra.outcome, pe.amount_paise
     FROM recovery_actions ra
     JOIN payment_events pe ON pe.payment_id = ra.payment_id
     WHERE ra.response_token = $1`,
    [token]
  );

  if (rows.length === 0) {
    return res.status(404).send(renderPage('This link is no longer valid.', ''));
  }

  const { amount_paise, outcome } = rows[0];
  const amount = (amount_paise / 100).toFixed(2);

  if (outcome === 'recovered') {
    return res.send(renderPage(`This payment of ₹${amount} is already marked as paid. Thank you!`, ''));
  }

  const formHtml = `
    <p class="amt">₹${amount}</p>
    <p class="q">Let us know what's going on with this payment:</p>
    <form method="POST" action="/respond/${token}">
      <button class="opt" name="choice" value="promised_to_pay">I'll pay soon</button>
      <button class="opt" name="choice" value="already_paid">I already paid this</button>
      <button class="opt" name="choice" value="opt_out">Stop contacting me</button>
    </form>
    <p class="or">or tell us in your own words</p>
    <form method="POST" action="/respond/${token}">
      <input type="text" name="free_text" placeholder="e.g. I'll pay by Friday" />
      <button class="submit" type="submit">Send</button>
    </form>
  `;
  res.send(renderPage(null, formHtml));
});

// POST /respond/:token — handles both the quick-choice buttons and free text.
router.post('/:token', express.urlencoded({ extended: true }), async (req, res) => {
  const { token } = req.params;
  const { choice, free_text } = req.body;

  const { rows } = await pool.query(
    `SELECT payment_id FROM recovery_actions WHERE response_token = $1`,
    [token]
  );
  if (rows.length === 0) {
    return res.status(404).send(renderPage('This link is no longer valid.', ''));
  }
  const paymentId = rows[0].payment_id;

  let intent, promised_date, raw_text;

  if (choice) {
    // Structured button press — no LLM needed, fastest and most reliable path
    raw_text = choice.replace(/_/g, ' ');
    intent = choice;
    promised_date = choice === 'promised_to_pay' ? defaultPromiseDate() : null;
  } else if (free_text && free_text.trim()) {
    // Free text — parse intent with the LLM
    raw_text = free_text.trim();
    const parsed = await parseReplyIntent(raw_text);
    intent = parsed.intent;
    promised_date = parsed.promised_date;
  } else {
    return res.status(400).send(renderPage('Please choose an option or type a message.', ''));
  }

  await recordCommitment(paymentId, { intent, promised_date, raw_text });

  console.log(`Commitment recorded for ${paymentId}: ${intent}${promised_date ? ' by ' + promised_date : ''}`);

  const confirmations = {
    promised_to_pay: `Thanks — we'll wait until ${promised_date || 'then'} before reaching out again.`,
    already_paid: `Thanks — we'll check our records and follow up if there's still an issue.`,
    opt_out: `Understood — we won't contact you about this again.`,
    unclear: `Thanks for letting us know.`
  };

  res.send(renderPage(confirmations[intent] || confirmations.unclear, ''));
});

// A simple default: "soon" resolves to 3 days out when a button (not free text) is used.
function defaultPromiseDate() {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toISOString().slice(0, 10);
}

function renderPage(message, formHtml) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Manage your payment</title>
<style>
  body { font-family: -apple-system, sans-serif; background: #0B1220; color: #E8ECF4; max-width: 420px; margin: 40px auto; padding: 24px; text-align: center; }
  .amt { font-size: 28px; font-weight: 600; color: #3ECF8E; margin: 8px 0; }
  .q { color: #8B96AC; font-size: 14px; margin-bottom: 20px; }
  .msg { font-size: 16px; line-height: 1.5; margin-top: 40px; }
  .opt { display: block; width: 100%; padding: 12px; margin: 8px 0; background: #131B2E; border: 1px solid #223049; color: #E8ECF4; border-radius: 8px; font-size: 14px; cursor: pointer; }
  .opt:hover { background: #1B2540; }
  .or { color: #8B96AC; font-size: 12px; margin: 20px 0 8px; }
  input[type=text] { width: 100%; box-sizing: border-box; padding: 10px; border-radius: 8px; border: 1px solid #223049; background: #131B2E; color: #E8ECF4; margin-bottom: 8px; }
  .submit { width: 100%; padding: 10px; background: #3ECF8E; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
</style></head>
<body>
  ${message ? `<p class="msg">${message}</p>` : formHtml}
</body></html>`;
}

module.exports = { router, generateResponseToken };