require('dotenv').config();
const pool = require('../db/pool');
const { diagnoseUndiagnosedBatch } = require('../engine/diagnosis_Engine');

async function run() {
  try {
    await diagnoseUndiagnosedBatch();
  } catch (err) {
    console.error('Batch diagnosis failed:', err);
  } finally {
    await pool.end();
  }
}

run();