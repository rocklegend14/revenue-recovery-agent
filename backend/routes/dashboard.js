const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

// GET /api/dashboard/summary
router.get('/dashboard/summary', async (req, res) => {
  try {
    const totalsQ = await pool.query(`
      SELECT
        COUNT(*) AS total_records,
        COALESCE(SUM(pe.amount_paise), 0) AS total_at_risk_paise,
        COALESCE(SUM(ra.amount_recovered_paise), 0) AS total_recovered_paise,
        COUNT(*) FILTER (WHERE ra.outcome = 'recovered') AS recovered_count,
        COUNT(*) FILTER (WHERE dec.action = 'escalate_to_human') AS escalated_count,
        COUNT(*) FILTER (WHERE ra.outcome = 'pending') AS pending_count
      FROM payment_events pe
      LEFT JOIN decisions dec ON dec.payment_id = pe.payment_id
      LEFT JOIN recovery_actions ra ON ra.payment_id = pe.payment_id
      WHERE pe.event_type = 'payment.failed'
    `);

    const byCauseQ = await pool.query(`
      SELECT
        dg.cause,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE ra.outcome = 'recovered') AS recovered,
        COALESCE(SUM(ra.amount_recovered_paise), 0) AS recovered_paise
      FROM diagnoses dg
      LEFT JOIN recovery_actions ra ON ra.payment_id = dg.payment_id
      GROUP BY dg.cause
      ORDER BY total DESC
    `);

    const t = totalsQ.rows[0];
    const totalRecords = parseInt(t.total_records, 10);
    const recoveredCount = parseInt(t.recovered_count, 10);

    res.json({
      total_records: totalRecords,
      total_at_risk_paise: parseInt(t.total_at_risk_paise, 10),
      total_recovered_paise: parseInt(t.total_recovered_paise, 10),
      recovery_rate: totalRecords > 0 ? +(recoveredCount / totalRecords).toFixed(4) : 0,
      escalated_count: parseInt(t.escalated_count, 10),
      pending_count: parseInt(t.pending_count, 10),
      recovered_count: recoveredCount,
      breakdown_by_cause: byCauseQ.rows.map(r => ({
        cause: r.cause,
        total: parseInt(r.total, 10),
        recovered: parseInt(r.recovered, 10),
        recovered_paise: parseInt(r.recovered_paise, 10)
      }))
    });
  } catch (err) {
    console.error('Failed to load dashboard summary:', err);
    res.status(500).json({ error: 'Failed to load summary' });
  }
});

// GET /api/payments
router.get('/payments', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        pe.payment_id,
        pe.amount_paise,
        pe.error_reason,
        pe.received_at,
        dg.cause,
        dg.confidence,
        dg.source AS diagnosis_source,
        dec.decision,
        dec.action,
        dec.channel,
        dec.attempt_number,
        ra.outcome,
        ra.amount_recovered_paise,
        ra.payment_link_url,
        ra.outcome_at,
        c.intent AS commitment_intent,
        c.promised_date AS commitment_promised_date,
        c.status AS commitment_status
      FROM payment_events pe
      LEFT JOIN diagnoses dg ON dg.payment_id = pe.payment_id
      LEFT JOIN decisions dec ON dec.payment_id = pe.payment_id
      LEFT JOIN recovery_actions ra ON ra.payment_id = pe.payment_id
      LEFT JOIN commitments c ON c.payment_id = pe.payment_id AND c.status = 'active'
      WHERE pe.event_type = 'payment.failed'
      ORDER BY pe.received_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Failed to load payments list:', err);
    res.status(500).json({ error: 'Failed to load payments' });
  }
});

// GET /api/payments/:id/audit
router.get('/payments/:id/audit', async (req, res) => {
  const { id } = req.params;
  try {
    const [events, diagnoses, decisions, actions, commitments] = await Promise.all([
      pool.query('SELECT * FROM payment_events WHERE payment_id = $1 ORDER BY received_at ASC', [id]),
      pool.query('SELECT * FROM diagnoses WHERE payment_id = $1 ORDER BY created_at ASC', [id]),
      pool.query('SELECT * FROM decisions WHERE payment_id = $1 ORDER BY created_at ASC', [id]),
      pool.query('SELECT * FROM recovery_actions WHERE payment_id = $1 ORDER BY sent_at ASC', [id]),
      pool.query('SELECT * FROM commitments WHERE payment_id = $1 ORDER BY created_at ASC', [id])
    ]);

    if (events.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const timeline = [];

    events.rows.forEach(e => timeline.push({
      step: 'failed',
      at: e.received_at,
      detail: `${e.error_reason || e.event_type} — ₹${(e.amount_paise / 100).toFixed(2)}`,
      meta: {
        error_code: e.error_code,
        error_description: e.error_description,
        customer_contact: maskContact(e.customer_contact),
        customer_email: maskEmail(e.customer_email)
      }
    }));

    diagnoses.rows.forEach(d => timeline.push({
      step: 'diagnosed',
      at: d.created_at,
      detail: `Cause: ${d.cause} (${d.confidence} confidence, via ${d.source})`,
      reasoning: d.reasoning,
      meta: { confidence: d.confidence, source: d.source, recommended_action: d.recommended_action }
    }));

    commitments.rows.forEach(c => timeline.push({
      step: 'customer_replied',
      at: c.created_at,
      detail: `"${c.raw_text}"${c.promised_date ? ' — promised by ' + c.promised_date : ''} (${c.status})`,
      meta: { intent: c.intent, promised_date: c.promised_date, status: c.status }
    }));

    decisions.rows.forEach(d => timeline.push({
      step: d.decision === 'proceed' ? 'decided' : 'blocked',
      at: d.created_at,
      detail: `${d.decision} — ${d.action}${d.channel ? ' via ' + d.channel : ''} (attempt ${d.attempt_number})`,
      reasoning: d.reasoning,
      meta: { channel: d.channel, attempt_number: d.attempt_number }
    }));

    actions.rows.forEach(a => {
      timeline.push({
        step: 'action_sent',
        at: a.sent_at,
        detail: `${a.action_type} sent via ${a.channel}`,
        meta: { channel: a.channel, payment_link_url: a.payment_link_url, payment_link_id: a.payment_link_id }
      });
      if (a.outcome_at) {
        timeline.push({
          step: 'outcome',
          at: a.outcome_at,
          detail: `${a.outcome}${a.amount_recovered_paise > 0 ? ' — ₹' + (a.amount_recovered_paise / 100).toFixed(2) + ' recovered' : ''}`,
          meta: { outcome: a.outcome, amount_recovered_paise: a.amount_recovered_paise }
        });
      }
    });

    timeline.sort((a, b) => new Date(a.at) - new Date(b.at));

    const finalAction = actions.rows[0];
    const finalDecision = decisions.rows[decisions.rows.length - 1];
    const isEscalated = finalDecision && finalDecision.decision === 'blocked' && finalDecision.action === 'escalate_to_human';
    const activeCommitment = commitments.rows.filter(c => c.status === 'active').slice(-1)[0] || null;
    let finalOutcome = isEscalated ? 'escalated' : (finalAction ? finalAction.outcome : 'no_action_taken');
    if (activeCommitment && finalOutcome !== 'recovered') {
      finalOutcome = activeCommitment.intent === 'opt_out' ? 'opted_out' : 'awaiting_promise';
    }

    const failedAt = events.rows[0].received_at;
    const resolvedAt = finalAction?.outcome_at || null;
    const durationMs = resolvedAt ? new Date(resolvedAt) - new Date(failedAt) : null;
    const timeToResolution = durationMs ? formatDuration(durationMs) : null;

    const amountStr = `₹${(events.rows[0].amount_paise / 100).toFixed(2)}`;
    const channel = finalAction?.channel;
    let summary;
    if (finalOutcome === 'recovered') {
      summary = `Recovered ${amountStr}${channel ? ' — customer paid via ' + channel : ''}${timeToResolution ? ', ' + timeToResolution + ' after the original failure' : ''}.`;
    } else if (finalOutcome === 'awaiting_promise') {
      summary = `Customer committed to paying by ${activeCommitment.promised_date} — automated retries paused until then.`;
    } else if (finalOutcome === 'opted_out') {
      summary = `Customer asked not to be contacted again — all automated recovery stopped.`;
    } else if (finalOutcome === 'pending') {
      summary = `Recovery link sent${channel ? ' via ' + channel : ''} — awaiting customer payment.`;
    } else if (finalOutcome === 'escalated') {
      summary = `Could not be auto-resolved — flagged for human review. ${finalDecision?.reasoning || ''}`;
    } else if (finalOutcome === 'no_response') {
      summary = `Recovery link sent${channel ? ' via ' + channel : ''} — customer has not responded.`;
    } else {
      summary = 'No recovery action has been taken yet.';
    }

    res.json({
      payment_id: id,
      amount_paise: events.rows[0].amount_paise,
      final_outcome: finalOutcome,
      summary,
      active_commitment: activeCommitment ? {
        intent: activeCommitment.intent,
        promised_date: activeCommitment.promised_date,
        raw_text: activeCommitment.raw_text
      } : null,
      manage_link: finalAction?.response_token ? `${(process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '')}/respond/${finalAction.response_token}` : null,
      time_to_resolution: timeToResolution,
      amount_recovered_paise: finalAction ? finalAction.amount_recovered_paise : 0,
      is_real_recovery: !!(finalAction && finalAction.payment_link_id),
      payment_link_url: finalAction ? finalAction.payment_link_url : null,
      timeline
    });
  } catch (err) {
    console.error('Failed to load audit trail:', err);
    res.status(500).json({ error: 'Failed to load audit trail' });
  }
});

// Formats a millisecond duration into a short human-readable string, e.g. "20h" or "3d 4h"
function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

// Masks a phone number for display, e.g. +919876543210 -> +91******3210
function maskContact(contact) {
  if (!contact || contact.length < 6) return contact;
  return contact.slice(0, 3) + '*'.repeat(contact.length - 7) + contact.slice(-4);
}

// Masks an email for display, e.g. name@example.com -> na***@example.com
function maskEmail(email) {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(local.length - 2, 2))}@${domain}`;
}

module.exports = router;