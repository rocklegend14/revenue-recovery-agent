const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');

const router = express.Router();

// Verifies that the webhook actually came from Razorpay, not a spoofed request
function verifySignature(body, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return expectedSignature === signature;
}

router.post('/razorpay', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  const isValid = verifySignature(req.body, signature, secret);
  if (!isValid) {
    console.warn('Webhook signature verification failed — possible spoofed request');
    return res.status(400).json({ status: 'invalid_signature' });
  }

  const payload = JSON.parse(req.body);
  const eventType = payload.event;

  // Handle payment_link.paid separately — this updates an existing recovery_actions
  // row rather than inserting a new payment_events row.
  if (eventType === 'payment_link.paid') {
    try {
      const paymentLink = payload.payload.payment_link.entity;
      const paymentEntity = payload.payload.payment?.entity;

      const result = await pool.query(
        `UPDATE recovery_actions
         SET outcome = 'recovered',
             amount_recovered_paise = $1,
             outcome_at = NOW()
         WHERE payment_link_id = $2
         RETURNING payment_id`,
        [paymentLink.amount_paid, paymentLink.id]
      );

      if (result.rows.length > 0) {
        console.log(`Recovery confirmed via payment_link.paid for ${result.rows[0].payment_id} (link ${paymentLink.id})`);
      } else {
        console.warn(`payment_link.paid received for unknown link_id ${paymentLink.id} — no matching recovery_actions row`);
      }

      return res.status(200).json({ status: 'received' });
    } catch (err) {
      console.error('Failed to process payment_link.paid:', err);
      return res.status(500).json({ status: 'error' });
    }
  }

  // We only care about payment failures and late authorizations beyond this point
  if (eventType !== 'payment.failed' && eventType !== 'payment.authorized') {
    return res.status(200).json({ status: 'ignored', event: eventType });
  }

  const payment = payload.payload.payment.entity;

  try {
    await pool.query(
      `INSERT INTO payment_events
        (payment_id, event_type, amount_paise, currency, error_code, error_reason, error_description, customer_contact, customer_email, raw_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        payment.id,
        eventType,
        payment.amount,
        payment.currency || 'INR',
        payment.error_code || null,
        payment.error_reason || null,
        payment.error_description || null,
        payment.contact || null,
        payment.email || null,
        JSON.stringify(payload)
      ]
    );

    console.log(`Logged event ${eventType} for payment ${payment.id}`);

    // Always respond 200 quickly — Razorpay retries on failure/timeout
    res.status(200).json({ status: 'received' });

    // TODO next step: trigger diagnosis engine here for payment.failed events

  } catch (err) {
    console.error('Failed to log webhook event:', err);
    res.status(500).json({ status: 'error' });
  }
});

module.exports = router;