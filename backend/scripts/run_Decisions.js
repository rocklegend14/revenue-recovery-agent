require('dotenv').config();
const pool = require('../db/pool');
const { decideUndecidedBatch } = require('../engine/decision_Engine');

async function run() {
  try {
    await decideUndecidedBatch();
  } catch (err) {
    console.error('Batch decision run failed:', err);
  } finally {
    await pool.end();
  }
}

run();