const pool = require('../db/pool');
const gateway = require('../services/gateways');
const { sendRecoveryEmail } = require('../services/emailSender');
const { getRecoveryMessage } = require('./messageTemplates');
const { generateResponseToken } = require('../routes/respond');

function baseUrl() {
  return (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

// Returns every decision that's ready to be sent: decision = 'proceed' and
// no recovery_actions row yet. This is the merchant's "approval queue".
async function getPendingApprovalQueue() {
  const { rows } = await pool.query(`
    SELECT dec.payment_id, dec.action, dec.channel, dec.attempt_number,
           pe.amount_paise, pe.customer_contact, pe.customer_email,
           dg.cause
    FROM decisions dec
    JOIN payment_events pe ON pe.payment_id = dec.payment_id
    JOIN diagnoses dg ON dg.payment_id = dec.payment_id
    LEFT JOIN recovery_actions ra ON ra.payment_id = dec.payment_id
    WHERE dec.decision = 'proceed' AND ra.id IS NULL
    ORDER BY dec.created_at ASC
  `);
  return rows;
}

// Executes one recovery action, sending to the REAL customer contact
// captured from the webhook by default. overrideContact/overrideEmail
// exist only for demo/testing against synthetic records with fake contacts.
async function executeRecoveryAction(record, options = {}) {
  const contact = options.overrideContact || record.customer_contact;
  const email = options.overrideEmail || record.customer_email;
  const description = getRecoveryMessage(record.cause);
  const responseToken = generateResponseToken();
  const manageLink = `${baseUrl()}/respond/${responseToken}`;

  try {
    const link = await gateway.createPaymentLink({
      amountPaise: record.amount_paise,
      contact,
      email,
      description,
      callbackUrl: process.env.PAYMENT_LINK_CALLBACK_URL || undefined
    });

    await pool.query(
      `INSERT INTO recovery_actions
        (payment_id, action_type, channel, payment_link_id, payment_link_url, outcome, response_token)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
      [record.payment_id, record.action, record.channel, link.linkId, link.linkUrl, responseToken]
    );

    if (email) {
      await sendRecoveryEmail({
        to: email,
        amountRupees: (record.amount_paise / 100).toFixed(2),
        paymentLinkUrl: link.linkUrl,
        manageLink,
        cause: record.cause
      });
    }

    console.log(`Recovery sent for ${record.payment_id}: ${link.linkUrl}`);
    return { payment_id: record.payment_id, status: 'sent', linkUrl: link.linkUrl };
  } catch (err) {
    console.error(`Failed to send recovery for ${record.payment_id}:`, err.message);
    await pool.query(
      `INSERT INTO recovery_actions (payment_id, action_type, channel, outcome, response_token)
       VALUES ($1, $2, $3, 'failed_to_send', $4)`,
      [record.payment_id, record.action, record.channel, responseToken]
    );
    return { payment_id: record.payment_id, status: 'failed', error: err.message };
  }
}

// The "single tap" — merchant approves, this sends everything currently queued.
async function runApprovedBatch(options = {}) {
  const queue = await getPendingApprovalQueue();
  console.log(`Sending recovery to ${queue.length} customer(s)...`);

  const results = { sent: 0, failed: 0, total_amount_paise: 0 };
  for (const record of queue) {
    const outcome = await executeRecoveryAction(record, options);
    if (outcome.status === 'sent') {
      results.sent++;
      results.total_amount_paise += record.amount_paise;
    } else {
      results.failed++;
    }
  }
  return results;
}

module.exports = { getPendingApprovalQueue, executeRecoveryAction, runApprovedBatch };