require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db/pool');
const webhooksRouter = require('./routes/webhooks');
const dashboardRouter = require('./routes/dashboard');
const recoveryRouter = require('./routes/recovery');
const { router: respondRouter } = require('./routes/respond');
const { startPromiseScheduler } = require('./scheduler');

const app = express();

// Webhook route needs the RAW body for signature verification,
// so it's mounted BEFORE express.json() and cors() and handles its own parsing.
app.use('/webhooks', webhooksRouter);

// Public customer-facing "manage this payment" page — no auth, no CORS needed
// since it's opened directly in a customer's browser, not called from the React app.
app.use('/respond', respondRouter);

app.use(cors()); // allows the React dev server (different port) to call this API
app.use(express.json());

app.use('/api', dashboardRouter); // exposes /api/dashboard/summary, /api/payments, /api/payments/:id/audit
app.use('/api/recovery', recoveryRouter); // exposes /api/recovery/pending, /api/recovery/run

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'Revenue recovery agent backend is running. Try /health, /health/db, or /api/dashboard/summary' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

app.get('/health/db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'ok', db_time: result.rows[0].now });
  } catch (err) {
    console.error('DB connection error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  startPromiseScheduler();
});