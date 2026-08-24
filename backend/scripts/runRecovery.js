require('dotenv').config();
const pool = require('../db/pool');
const { runRecoveryBatch } = require('../engine/recoveryEngine');

// EDIT THESE with your own real phone number and email before running,
// so the "real" Payment Links actually reach you for a live demo test.
const REAL_CONTACT = '+919566049217';   // <-- your real phone number
const REAL_EMAIL = 'gnaneshl1201@gmail.com';   // <-- your real email
const REAL_COUNT = 5;                   // how many records get real Payment Links

async function run() {
  try {
    if (REAL_CONTACT.includes('XXXXXXXXXX')) {
      console.error('Please edit REAL_CONTACT and REAL_EMAIL in this script before running.');
      return;
    }
    await runRecoveryBatch({ realCount: REAL_COUNT, realContact: REAL_CONTACT, realEmail: REAL_EMAIL });
  } catch (err) {
    console.error('Recovery batch failed:', err);
  } finally {
    await pool.end();
  }
}

run();