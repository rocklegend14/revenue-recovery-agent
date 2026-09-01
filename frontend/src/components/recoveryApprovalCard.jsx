import { useState } from 'react';
import { toRupees, api } from '../api';

export default function RecoveryApprovalCard({ pending, onSent }) {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  if (!pending || pending.count === 0) {
    return (
      <div className="border border-line rounded-lg p-4 mb-8 bg-surface">
        <p className="font-mono text-xs text-textMuted">No new failures awaiting your approval right now.</p>
      </div>
    );
  }

  async function handleApprove() {
    setSending(true);
    try {
      const res = await api.runRecovery();
      setResult(res);
      onSent?.();
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border border-pending/40 rounded-lg p-5 mb-8 bg-pending/5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-pending mb-1">Awaiting your approval</p>
          <p className="font-display text-xl text-textPrimary">
            ₹{toRupees(pending.total_amount_paise)} across {pending.count} customer{pending.count !== 1 ? 's' : ''}
          </p>
          <p className="font-body text-xs text-textMuted mt-1">
            Diagnosed and reasoned automatically. Nothing is sent to a customer until you approve.
          </p>
        </div>
        <button
          onClick={handleApprove}
          disabled={sending}
          className="font-mono text-sm px-5 py-2.5 rounded-lg bg-pending text-ink font-600 disabled:opacity-50"
        >
          {sending ? 'Sending…' : `Send recovery to ${pending.count} customer${pending.count !== 1 ? 's' : ''}`}
        </button>
      </div>
      {result && !result.error && (
        <p className="font-mono text-xs text-recovered mt-3">
          Sent to {result.sent}, failed {result.failed}. ₹{toRupees(result.total_amount_paise)} now pending customer action.
        </p>
      )}
      {result?.error && <p className="font-mono text-xs text-escalated mt-3">{result.error}</p>}
    </div>
  );
}