const pool = require('../db/pool');
const { lookupRule } = require('./rule_Table');
const { diagnoseWithLLM } = require('./llm_Diagnosis');

// Diagnoses a single payment_events row and writes the result to `diagnoses`.
// Returns the diagnosis object so callers (e.g. the decision engine) can use it immediately.
async function diagnosePayment(paymentEvent) {
  const { payment_id, error_reason, error_code, error_description, amount_paise } = paymentEvent;

  let diagnosis;
  const rule = lookupRule(error_reason);

  if (rule) {
    diagnosis = { ...rule, source: 'rule_match' };
  } else {
    diagnosis = await diagnoseWithLLM({ error_code, error_description, amount_paise });
  }

  await pool.query(
    `INSERT INTO diagnoses (payment_id, cause, confidence, source, reasoning, recommended_action)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      payment_id,
      diagnosis.cause,
      diagnosis.confidence,
      diagnosis.source,
      diagnosis.reasoning,
      diagnosis.recommended_action
    ]
  );

  return diagnosis;
}

// Diagnoses every undiagnosed payment_events row — used to process the synthetic batch in one go.
async function diagnoseUndiagnosedBatch() {
  const { rows } = await pool.query(`
    SELECT pe.*
    FROM payment_events pe
    LEFT JOIN diagnoses d ON d.payment_id = pe.payment_id
    WHERE pe.event_type = 'payment.failed' AND d.id IS NULL
    ORDER BY pe.received_at ASC
  `);

  console.log(`Found ${rows.length} undiagnosed failed payments. Diagnosing...`);

  let ruleMatches = 0;
  let llmCalls = 0;

  for (const row of rows) {
    const diagnosis = await diagnosePayment(row);
    if (diagnosis.source === 'rule_match') ruleMatches++;
    else llmCalls++;
  }

  console.log(`Diagnosis complete. Rule matches: ${ruleMatches}, LLM inferences: ${llmCalls}`);
  return { total: rows.length, ruleMatches, llmCalls };
}

module.exports = { diagnosePayment, diagnoseUndiagnosedBatch };