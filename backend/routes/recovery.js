const express = require('express');
const { getPendingApprovalQueue, runApprovedBatch } = require('../engine/recoveryEngine');

const router = express.Router();

// GET /api/recovery/pending — what's waiting for the merchant's approval
router.get('/pending', async (req, res) => {
  try {
    const queue = await getPendingApprovalQueue();
    const totalAmountPaise = queue.reduce((sum, r) => sum + r.amount_paise, 0);
    res.json({
      count: queue.length,
      total_amount_paise: totalAmountPaise,
      items: queue.map(r => ({
        payment_id: r.payment_id,
        amount_paise: r.amount_paise,
        cause: r.cause,
        action: r.action,
        channel: r.channel
      }))
    });
  } catch (err) {
    console.error('Failed to load pending recovery queue:', err);
    res.status(500).json({ error: 'Failed to load pending queue' });
  }
});

// POST /api/recovery/run — the single tap. Sends everything currently pending.
router.post('/run', async (req, res) => {
  try {
    const results = await runApprovedBatch();
    res.json(results);
  } catch (err) {
    console.error('Failed to run recovery batch:', err);
    res.status(500).json({ error: 'Failed to run recovery batch' });
  }
});

module.exports = router;