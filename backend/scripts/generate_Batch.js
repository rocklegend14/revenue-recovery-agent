require('dotenv').config();
const pool = require('../db/pool');

// Real Razorpay error taxonomy, weighted roughly by real-world frequency
const FAILURE_PROFILES = [
  {
    error_reason: 'otp_incorrect',
    error_code: 'BAD_REQUEST_ERROR',
    error_description: 'Payment failed due to incorrect OTP',
    weight: 18
  },
  {
    error_reason: 'timeout',
    error_code: 'GATEWAY_ERROR',
    error_description: 'The payment could not be completed as the customer exceeded the time limit for payment processing',
    weight: 10
  },
  {
    error_reason: 'bank_downtime',
    error_code: 'GATEWAY_ERROR',
    error_description: 'There was a downtime on our partner bank due to which the payment has failed',
    weight: 8
  },
  {
    error_reason: 'customer_bank_downtime',
    error_code: 'GATEWAY_ERROR',
    error_description: "There was a downtime on the customer's bank due to which the payment has failed",
    weight: 6
  },
  {
    error_reason: 'payment_declined',
    error_code: 'BAD_REQUEST_ERROR',
    error_description: 'The payment was declined by the customer bank',
    weight: 8
  },
  {
    error_reason: 'user_cancelled',
    error_code: 'BAD_REQUEST_ERROR',
    error_description: 'The customer cancelled the transaction or pressed the back button',
    weight: 5
  }
];

// Expand weights into a flat pool to sample from, so frequency roughly matches real distribution
const WEIGHTED_POOL = FAILURE_PROFILES.flatMap(p => Array(p.weight).fill(p));

const SAMPLE_NAMES = ['Aarav', 'Vivaan', 'Ishaan', 'Diya', 'Ananya', 'Kabir', 'Meera', 'Rohan', 'Priya', 'Aditi'];
const CUSTOMER_COUNT = 35; // fewer customers than records, so some customers appear multiple times (repeat failures)

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

function generateCustomerId(index) {
  return `cust_synthetic_${String(index).padStart(4, '0')}`;
}

function generateContact() {
  return `+91${randomInt(7000000000, 9999999999)}`;
}

function generatePaymentId() {
  return `pay_synthetic_${Math.random().toString(36).substring(2, 15)}`;
}

// Amounts in paise. Spread across realistic ranges: small (₹100-500), medium (₹500-5000), large (₹5000-25000)
function generateAmount() {
  const tier = randomChoice(['small', 'medium', 'large']);
  if (tier === 'small') return randomInt(10000, 50000);
  if (tier === 'medium') return randomInt(50000, 500000);
  return randomInt(500000, 2500000);
}

function randomPastTimestamp(daysBack) {
  const now = Date.now();
  const past = now - randomInt(0, daysBack * 24 * 60 * 60 * 1000);
  return new Date(past);
}

async function generateBatch(recordCount = 50) {
  console.log(`Generating ${recordCount} synthetic failed-payment records...`);

  const records = [];

  for (let i = 0; i < recordCount; i++) {
    const profile = randomChoice(WEIGHTED_POOL);
    const customerIndex = randomInt(1, CUSTOMER_COUNT);

    records.push({
      payment_id: generatePaymentId(),
      event_type: 'payment.failed',
      amount_paise: generateAmount(),
      currency: 'INR',
      error_code: profile.error_code,
      error_reason: profile.error_reason,
      error_description: profile.error_description,
      customer_contact: generateContact(),
      customer_email: `${randomChoice(SAMPLE_NAMES).toLowerCase()}${customerIndex}@example.com`,
      customer_id: generateCustomerId(customerIndex),
      received_at: randomPastTimestamp(14) // spread across the last 14 days
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const r of records) {
      await client.query(
        `INSERT INTO payment_events
          (payment_id, event_type, amount_paise, currency, error_code, error_reason, error_description, customer_contact, customer_email, raw_payload, received_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          r.payment_id,
          r.event_type,
          r.amount_paise,
          r.currency,
          r.error_code,
          r.error_reason,
          r.error_description,
          r.customer_contact,
          r.customer_email,
          JSON.stringify({ synthetic: true, customer_id: r.customer_id }),
          r.received_at
        ]
      );
    }

    await client.query('COMMIT');
    console.log(`Inserted ${records.length} synthetic records into payment_events.`);

    // Quick breakdown summary for sanity check
    const breakdown = {};
    let totalAmount = 0;
    for (const r of records) {
      breakdown[r.error_reason] = (breakdown[r.error_reason] || 0) + 1;
      totalAmount += r.amount_paise;
    }
    console.log('\nBreakdown by failure cause:');
    Object.entries(breakdown).forEach(([cause, count]) => {
      console.log(`  ${cause}: ${count}`);
    });
    console.log(`\nTotal amount at risk: ₹${(totalAmount / 100).toFixed(2)}`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Batch generation failed, rolled back:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

// Allow running with a custom count: node scripts/generate_batch.js 75
const countArg = parseInt(process.argv[2], 10);
generateBatch(Number.isFinite(countArg) ? countArg : 50);