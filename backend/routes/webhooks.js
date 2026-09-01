const express = require('express');
const pool = require('../db/pool');
const gateway = require('../services/gateways');
const { diagnosePayment } = require('../engine/diagnosis_Engine');
const { decideRecoveryAction } = require('../engine/decision_Engine');

const router = express.Router();

router.post('/razorpay', express.raw({ type: 'application/json' }), async (req, res) => {
  const signatureHeader = req.headers['x-razorpay-signature'];
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  const isValid = gateway.verifyWebhookSignature(req.body, signatureHeader, secret);
  if (!isValid) {
    console.warn('Webhook signature verification failed — possible spoofed request');
    return res.status(400).json({ status: 'invalid_signature' });
  }

  const { eventType, payment, paymentLink } = gateway.parseWebhookPayload(req.body);

  // payment_link.paid: mark the matching recovery action as recovered, and
  // close out any active promise-to-pay commitment for the same payment —
  // this is where the "paid early" fix lives.
  if (eventType === 'payment_link_paid') {
    try {
      const result = await pool.query(
        `UPDATE recovery_actions
         SET outcome = 'recovered', amount_recovered_paise = $1, outcome_at = NOW()
         WHERE payment_link_id = $2
         RETURNING payment_id`,
        [paymentLink.amountPaidPaise, paymentLink.id]
      );

      if (result.rows.length > 0) {
        const paymentId = result.rows[0].payment_id;
        await pool.query(
          `UPDATE commitments SET status = 'fulfilled' WHERE payment_id = $1 AND status = 'active'`,
          [paymentId]
        );
        console.log(`Recovery confirmed via payment_link.paid for ${paymentId} (link ${paymentLink.id})`);
      } else {
        console.warn(`payment_link.paid received for unknown link_id ${paymentLink.id}`);
      }
      return res.status(200).json({ status: 'received' });
    } catch (err) {
      console.error('Failed to process payment_link.paid:', err);
      return res.status(500).json({ status: 'error' });
    }
  }

  if (eventType === 'unhandled') {
    return res.status(200).json({ status: 'ignored' });
  }

  // payment_failed / payment_authorized: log the event, then — automatically,
  // no human step — run diagnosis and decision. Nothing here contacts a
  // customer or moves money; it only produces a reasoned, logged decision.
  // The actual customer-facing send stays gated behind merchant approval
  // (see routes/recovery.js), which is the deliberate human checkpoint.
  try {
    await pool.query(
      `INSERT INTO payment_events
        (payment_id, event_type, amount_paise, currency, error_code, error_reason, error_description, customer_contact, customer_email, raw_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        payment.id,
        eventType === 'payment_failed' ? 'payment.failed' : 'payment.authorized',
        payment.amountPaise,
        payment.currency,
        payment.errorCode,
        payment.errorReason,
        payment.errorDescription,
        payment.contact,
        payment.email,
        req.body.toString()
      ]
    );

    console.log(`Logged event ${eventType} for payment ${payment.id}`);
    res.status(200).json({ status: 'received' });

    if (eventType === 'payment_failed') {
      const diagnosis = await diagnosePayment({
        payment_id: payment.id,
        error_reason: payment.errorReason,
        error_code: payment.errorCode,
        error_description: payment.errorDescription,
        amount_paise: payment.amountPaise
      });
      const decision = await decideRecoveryAction(payment.id, diagnosis);
      console.log(`Auto-diagnosed and decided for ${payment.id}: ${decision.decision} (${decision.action})`);
    }
  } catch (err) {
    console.error('Failed to process webhook event:', err);
    if (!res.headersSent) res.status(500).json({ status: 'error' });
  }
});

module.exports = router;