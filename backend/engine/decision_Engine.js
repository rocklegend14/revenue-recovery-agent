const pool = require('../db/pool');
const { getRetryPolicy, ESCALATE_AFTER_ATTEMPTS } = require('./guardrails');
const { getActiveCommitment } = require('./commitmentEngine');

// Maps a diagnosis's recommended_action to a delivery channel.
const ACTION_CHANNEL_MAP = {
  immediate_retry_link: 'sms',
  delayed_retry_link: 'sms',
  suggest_alternate_method: 'email',
  gentle_nudge_only: 'email',
  escalate_to_human: null
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

// Takes a diagnosis object and the payment_id it belongs to.
// Returns a decision object and writes it to the `decisions` table.
async function decideRecoveryAction(paymentId, diagnosis, optOutFlag = false) {
  const history = await getAttemptHistory(paymentId);
  const policy = getRetryPolicy(diagnosis.cause);
  const commitment = await getActiveCommitment(paymentId);
  let decision;

  if (optOutFlag || history.optedOut || (commitment && commitment.intent === 'opt_out')) {
    decision = {
      decision: 'blocked',
      action: 'none',
      channel: null,
      attempt_number: history.attemptsSoFar,
      reasoning: 'Customer opted out. No further automated contact permitted, per compliance policy.'
    };
  } else if (commitment && commitment.intent === 'already_paid') {
    decision = {
      decision: 'blocked',
      action: 'verify_payment',
      channel: null,
      attempt_number: history.attemptsSoFar,
      reasoning: `Customer stated they already paid ("${commitment.raw_text}"). Pausing automated recovery pending manual verification, since our records still show this as unrecovered.`
    };
  } else if (commitment && commitment.intent === 'promised_to_pay' && commitment.status === 'active') {
    decision = {
      decision: 'blocked',
      action: 'awaiting_promise',
      channel: null,
      attempt_number: history.attemptsSoFar,
      reasoning: `Customer committed to paying by ${commitment.promised_date} ("${commitment.raw_text}"). Pausing automated retries until that date, to respect the stated intent rather than over-messaging.`
    };
  } else if (diagnosis.recommended_action === 'escalate_to_human') {
    decision = {
      decision: 'blocked',
      action: 'escalate_to_human',
      channel: null,
      attempt_number: history.attemptsSoFar,
      reasoning: `Diagnosis engine directly recommended escalation. Reason: ${diagnosis.reasoning}`
    };
  } else if (!policy.retryable && history.attemptsSoFar >= policy.max_attempts) {
    decision = {
      decision: 'blocked',
      action: 'escalate_to_human',
      channel: null,
      attempt_number: history.attemptsSoFar,
      reasoning: `Cause "${diagnosis.cause}" is policy-marked non-retryable after ${policy.max_attempts} attempt(s) — repeated retries on this failure type rarely succeed and risk annoying the customer (mirrors real card-network guidance against retrying certain hard declines). Escalating instead.`
    };
  } else if (history.attemptsSoFar >= policy.max_attempts) {
    decision = {
      decision: 'blocked',
      action: 'escalate_to_human',
      channel: null,
      attempt_number: history.attemptsSoFar,
      reasoning: `Max retry attempts (${policy.max_attempts}) for cause "${diagnosis.cause}" reached with no successful recovery. Stopping automated retries and escalating to human review per policy.`
    };
  } else if (hoursSince(history.lastAttemptAt) < policy.cooldown_hours) {
    decision = {
      decision: 'blocked',
      action: 'none',
      channel: null,
      attempt_number: history.attemptsSoFar,
      reasoning: `Cooldown for cause "${diagnosis.cause}" is ${policy.cooldown_hours}h and has not yet elapsed since the last attempt. Waiting before next contact — timing is tuned per failure type, not flat, since e.g. an OTP mistake is worth retrying almost immediately while a hard decline is not.`
    };
  } else {
    const nextAttemptNumber = history.attemptsSoFar + 1;
    const channel = ACTION_CHANNEL_MAP[diagnosis.recommended_action] || 'sms';
    decision = {
      decision: 'proceed',
      action: diagnosis.recommended_action,
      channel,
      attempt_number: nextAttemptNumber,
      reasoning: `Attempt ${nextAttemptNumber} of ${policy.max_attempts} (cause-specific cooldown: ${policy.cooldown_hours}h). No opt-out, no active commitment blocking this. Proceeding with "${diagnosis.recommended_action}" based on diagnosed cause: ${diagnosis.cause}.`
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

// Runs decisions for every payment that has a diagnosis but no decision yet.
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