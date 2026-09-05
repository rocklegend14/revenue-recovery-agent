require('dotenv').config();
const pool = require('../db/pool');

// The `batches` table has existed in schema.sql since the start, but nothing
// ever wrote to it — this script closes that gap. It snapshots the same
// totals the dashboard summary endpoint computes (see routes/dashboard.js),
// so a recorded batch always agrees with what's on screen at the time it's run.
//
// Usage:  node scripts/record_batch.js "Demo run 1"
// The label is optional — defaults to a timestamp if omitted.

async function recordBatch(label) {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*) AS total_records,
      COALESCE(SUM(pe.amount_paise), 0) AS total_at_risk_paise,
      COALESCE(SUM(ra.amount_recovered_paise), 0) AS total_recovered_paise,
      COUNT(*) FILTER (WHERE ra.outcome = 'recovered') AS recovered_count,
      COUNT(*) FILTER (WHERE dec.action = 'escalate_to_human') AS escalated_count
    FROM payment_events pe
    LEFT JOIN decisions dec ON dec.payment_id = pe.payment_id
    LEFT JOIN recovery_actions ra ON ra.payment_id = pe.payment_id
    WHERE pe.event_type = 'payment.failed'
  `);

  const t = rows[0];
  const totalRecords = parseInt(t.total_records, 10);
  const recoveredCount = parseInt(t.recovered_count, 10);
  const recoveryRate = totalRecords > 0 ? +(recoveredCount / totalRecords).toFixed(4) : 0;

  const result = await pool.query(
    `INSERT INTO batches
      (batch_label, total_records, total_amount_at_risk_paise, total_amount_recovered_paise, recovery_rate, escalated_count)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      label,
      totalRecords,
      parseInt(t.total_at_risk_paise, 10),
      parseInt(t.total_recovered_paise, 10),
      recoveryRate,
      parseInt(t.escalated_count, 10)
    ]
  );

  const batch = result.rows[0];
  console.log(`Recorded batch "${batch.batch_label}":`);
  console.log(`  Records: ${batch.total_records}`);
  console.log(`  At risk: ₹${(batch.total_amount_at_risk_paise / 100).toFixed(2)}`);
  console.log(`  Recovered: ₹${(batch.total_amount_recovered_paise / 100).toFixed(2)}`);
  console.log(`  Recovery rate: ${(batch.recovery_rate * 100).toFixed(1)}%`);
  console.log(`  Escalated: ${batch.escalated_count}`);
  return batch;
}

async function run() {
  const label = process.argv[2] || `Batch ${new Date().toISOString()}`;
  try {
    await recordBatch(label);
  } catch (err) {
    console.error('Failed to record batch:', err);
  } finally {
    await pool.end();
  }
}

run();