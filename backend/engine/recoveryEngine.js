const pool = require('../db/pool');
const { createPaymentLink } = require('../services/razorpayClient');
const { getRecoveryMessage } = require('./messageTemplates');
const { generateResponseToken } = require('../routes/respond');

// Plausible simulated outcomes, roughly weighted by real-world recovery-rate
// expectations per action type. Used ONLY for records with fake synthetic
// contact info that cannot actually receive a message.
const SIMULATED_OUTCOME_WEIGHTS = {
  immediate_retry_link: { recovered: 0.72, no_response: 0.28 },
  delayed_retry_link: { recovered: 0.55, no_response: 0.45 },
  suggest_alternate_method: { recovered: 0.40, no_response: 0.60 },
  gentle_nudge_only: { recovered: 0.30, no_response: 0.70 }
};

function weightedOutcome(action) {
  const weights = SIMULATED_OUTCOME_WEIGHTS[action] || { recovered: 0.5, no_response: 0.5 };
  return Math.random() < weights.recovered ? 'recovered' : 'no_response';
}

async function getProceedDecisionsAwaitingAction() {
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

// Executes ONE real Payment Link, overriding contact info with the builder's own,
// so delivery can actually be verified live.
async function executeRealRecovery(record, realContact, realEmail) {
  const description = getRecoveryMessage(record.cause);
  const responseToken = generateResponseToken();
  const baseUrl = (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const manageLink = `${baseUrl}/respond/${responseToken}`;

  try {
    const link = await createPaymentLink({
      amountPaise: record.amount_paise,
      contact: realContact,
      email: realEmail,
      description,
      callbackUrl: process.env.PAYMENT_LINK_CALLBACK_URL || undefined
    });

    await pool.query(
      `INSERT INTO recovery_actions
        (payment_id, action_type, channel, payment_link_id, payment_link_url, outcome, response_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [record.payment_id, record.action, record.channel, link.payment_link_id, link.payment_link_url, 'pending', responseToken]
    );

    console.log(`[REAL] Payment Link created for ${record.payment_id}: ${link.payment_link_url}`);
    console.log(`[REAL] Manage-payment link for ${record.payment_id}: ${manageLink}`);
    return { ...record, mode: 'real', payment_link_url: link.payment_link_url, manage_link: manageLink, outcome: 'pending' };
  } catch (err) {
    console.error(`[REAL] Failed to create Payment Link for ${record.payment_id}:`, err.message);
    await pool.query(
      `INSERT INTO recovery_actions (payment_id, action_type, channel, outcome, response_token)
       VALUES ($1, $2, $3, $4, $5)`,
      [record.payment_id, record.action, record.channel, 'failed_to_send', responseToken]
    );
    return { ...record, mode: 'real', outcome: 'failed_to_send' };
  }
}

// Logs a simulated recovery action — no real API call, since synthetic contact
// info cannot actually receive anything.
async function executeSimulatedRecovery(record) {
  const outcome = weightedOutcome(record.action);
  const amountRecovered = outcome === 'recovered' ? record.amount_paise : 0;
  const responseToken = generateResponseToken();

  await pool.query(
    `INSERT INTO recovery_actions
      (payment_id, action_type, channel, outcome, amount_recovered_paise, outcome_at, response_token)
     VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
    [record.payment_id, record.action, record.channel, outcome, amountRecovered, responseToken]
  );

  return { ...record, mode: 'simulated', outcome, amount_recovered_paise: amountRecovered };
}

// Main entry point: runs recovery for all pending proceed-decisions.
// `realCount` records (in order) get real Payment Links using realContact/realEmail;
// the rest are simulated.
async function runRecoveryBatch({ realCount = 5, realContact, realEmail } = {}) {
  const records = await getProceedDecisionsAwaitingAction();
  console.log(`Found ${records.length} proceed-decisions awaiting recovery action.`);

  if (realCount > 0 && (!realContact || !realEmail)) {
    throw new Error('realContact and realEmail are required when realCount > 0');
  }

  const results = { real: 0, simulated: 0, recovered: 0, failed: 0 };

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    let outcome;

    if (i < realCount) {
      outcome = await executeRealRecovery(record, realContact, realEmail);
      results.real++;
    } else {
      outcome = await executeSimulatedRecovery(record);
      results.simulated++;
      if (outcome.outcome === 'recovered') results.recovered++;
    }
  }

  console.log(`Recovery batch complete. Real: ${results.real}, Simulated: ${results.simulated}, Simulated-recovered: ${results.recovered}`);
  return results;
}

module.exports = { runRecoveryBatch };