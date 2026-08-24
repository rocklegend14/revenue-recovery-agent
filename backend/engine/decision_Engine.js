const pool = require('../db/pool');
const { MAX_RETRY_ATTEMPTS, COOLDOWN_HOURS, ESCALATE_AFTER_ATTEMPTS } = require('./guardrails');

// Maps a diagnosis's recommended_action to a delivery channel.
// This is a simple, deterministic mapping — not something the LLM decides.
const ACTION_CHANNEL_MAP = {
  immediate_retry_link: 'sms',
  delayed_retry_link: 'sms',
  suggest_alternate_method: 'email',
  gentle_nudge_only: 'email',
  escalate_to_human: null // no customer-facing channel, goes to internal review queue
};

async function getAttemptHistory(paymentId) {
  const { rows } = await pool.query(
    `SELECT * FROM decisions WHERE payment_id = $1 ORDER BY created_at DESC`,
    [paymentId]
  );

  const attemptsSoFar = rows.filter(r => r.decision === 'proceed').length;
  const lastAttempt = rows.find(r => r.decision === 'proceed');
  const optedOut = rows.some(r => r.reasoning && r.reasoning.includes('opted_out'));

  return {
    attemptsSoFar,
    lastAttemptAt: lastAttempt ? lastAttempt.created_at : null,
    optedOut
  };
}

function hoursSince(date) {
  if (!date) return Infinity;
  return (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60);
}

// Takes a diagnosis object (from diagnosisEngine) and the payment_id it belongs to.
// Returns a decision object and writes it to the `decisions` table.
async function decideRecoveryAction(paymentId, diagnosis, optOutFlag = false) {
  const history = await getAttemptHistory(paymentId);
  let decision;

  if (optOutFlag || history.optedOut) {
    decision = {
      decision: 'blocked',
      action: 'none',
      channel: null,
      attempt_number: history.attemptsSoFar,
      reasoning: 'Customer opted out (opted_out flag set). No further automated contact permitted, per compliance policy.'
    };
  } else if (diagnosis.recommended_action === 'escalate_to_human') {
    decision = {
      decision: 'blocked',
      action: 'escalate_to_human',
      channel: null,
      attempt_number: history.attemptsSoFar,
      reasoning: `Diagnosis engine directly recommended escalation. Reason: ${diagnosis.reasoning}`
    };
  } else if (history.attemptsSoFar >= MAX_RETRY_ATTEMPTS) {
    decision = {
      decision: 'blocked',
      action: 'escalate_to_human',
      channel: null,
      attempt_number: history.attemptsSoFar,
      reasoning: `Max retry attempts (${MAX_RETRY_ATTEMPTS}) reached with no successful recovery. Stopping automated retries and escalating to human review per policy.`
    };
  } else if (hoursSince(history.lastAttemptAt) < COOLDOWN_HOURS) {
    decision = {
      decision: 'blocked',
      action: 'none',
      channel: null,
      attempt_number: history.attemptsSoFar,
      reasoning: `Cooldown period (${COOLDOWN_HOURS}h) has not elapsed since the last attempt. Waiting before next contact to avoid over-messaging the customer.`
    };
  } else {
    const nextAttemptNumber = history.attemptsSoFar + 1;
    const channel = ACTION_CHANNEL_MAP[diagnosis.recommended_action] || 'sms';
    decision = {
      decision: 'proceed',
      action: diagnosis.recommended_action,
      channel,
      attempt_number: nextAttemptNumber,
      reasoning: `Attempt ${nextAttemptNumber} of ${MAX_RETRY_ATTEMPTS}. Cooldown elapsed, no opt-out on record. Proceeding with "${diagnosis.recommended_action}" based on diagnosed cause: ${diagnosis.cause}.`
    };

    if (nextAttemptNumber >= ESCALATE_AFTER_ATTEMPTS) {
      decision.reasoning += ` Note: this is the final permitted attempt before automatic escalation.`;
    }
  }

  await pool.query(
    `INSERT INTO decisions (payment_id, decision, action, channel, attempt_number, reasoning)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [paymentId, decision.decision, decision.action, decision.channel, decision.attempt_number, decision.reasoning]
  );

  return decision;
}

// Runs decisions for every payment that has a diagnosis but no decision yet —
// used to process the batch after diagnosis has completed.
async function decideUndecidedBatch() {
  const { rows } = await pool.query(`
    SELECT d.payment_id, d.cause, d.confidence, d.source, d.reasoning, d.recommended_action
    FROM diagnoses d
    LEFT JOIN decisions dec ON dec.payment_id = d.payment_id
    WHERE dec.id IS NULL
    ORDER BY d.created_at ASC
  `);

  console.log(`Found ${rows.length} diagnosed payments awaiting a decision.`);

  const summary = { proceed: 0, blocked: 0 };

  for (const row of rows) {
    const diagnosis = {
      cause: row.cause,
      confidence: row.confidence,
      source: row.source,
      reasoning: row.reasoning,
      recommended_action: row.recommended_action
    };
    const decision = await decideRecoveryAction(row.payment_id, diagnosis);
    summary[decision.decision] = (summary[decision.decision] || 0) + 1;
  }

  console.log(`Decisions complete. Proceed: ${summary.proceed}, Blocked: ${summary.blocked}`);
  return summary;
}

module.exports = { decideRecoveryAction, decideUndecidedBatch };