require('dotenv').config();
const pool = require('../db/pool');
const { detectBrokenPromises } = require('../engine/commitmentEngine');

async function run() {
  try {
    const count = await detectBrokenPromises();
    console.log(`Checked all active promises. ${count} broken promise(s) found and resumed.`);
  } catch (err) {
    console.error('Promise check failed:', err);
  } finally {
    await pool.end();
  }
}

run();