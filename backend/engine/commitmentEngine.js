const pool = require('../db/pool');

// Records a new commitment for a payment, superseding any prior active one
// (a customer's latest stated intent always wins).
async function recordCommitment(paymentId, { intent, promised_date, raw_text }) {
  await pool.query(
    `UPDATE commitments SET status = 'superseded' WHERE payment_id = $1 AND status = 'active'`,
    [paymentId]
  );

  const { rows } = await pool.query(
    `INSERT INTO commitments (payment_id, intent, promised_date, raw_text, status)
     VALUES ($1, $2, $3, $4, 'active')
     RETURNING *`,
    [paymentId, intent, promised_date || null, raw_text || null]
  );

  return rows[0];
}

// Returns the currently active commitment for a payment, if any.
async function getActiveCommitment(paymentId) {
  const { rows } = await pool.query(
    `SELECT * FROM commitments WHERE payment_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
    [paymentId]
  );
  return rows[0] || null;
}

// Checks all active promised_to_pay commitments and marks any whose promised_date
// has passed (with no recovery) as 'broken' — used to resume normal retry logic.
async function detectBrokenPromises() {
  const { rows } = await pool.query(`
    SELECT c.*
    FROM commitments c
    LEFT JOIN recovery_actions ra ON ra.payment_id = c.payment_id AND ra.outcome = 'recovered'
    WHERE c.status = 'active'
      AND c.intent = 'promised_to_pay'
      AND c.promised_date IS NOT NULL
      AND c.promised_date < CURRENT_DATE
      AND ra.id IS NULL
  `);

  for (const c of rows) {
    await pool.query(`UPDATE commitments SET status = 'broken' WHERE id = $1`, [c.id]);
    console.log(`Promise broken: payment ${c.payment_id} promised ${c.promised_date}, not paid. Resuming normal recovery.`);
  }

  return rows.length;
}

module.exports = { recordCommitment, getActiveCommitment, detectBrokenPromises };