import { toRupees } from '../api';

const OUTCOME_STYLES = {
  recovered: 'bg-recovered/15 text-recovered border-recovered/30',
  pending: 'bg-pending/15 text-pending border-pending/30',
  no_response: 'bg-textMuted/15 text-textMuted border-textMuted/30',
  failed_to_send: 'bg-escalated/15 text-escalated border-escalated/30'
};

function OutcomePill({ decision, action, outcome, commitmentIntent, commitmentDate }) {
  if (commitmentIntent === 'promised_to_pay') {
    return (
      <span className="font-mono text-xs px-2 py-1 rounded-full border bg-pending/15 text-pending border-pending/30">
        promised {commitmentDate ? `· ${commitmentDate}` : ''}
      </span>
    );
  }
  if (commitmentIntent === 'opt_out') {
    return (
      <span className="font-mono text-xs px-2 py-1 rounded-full border bg-textMuted/15 text-textMuted border-textMuted/30">
        opted out
      </span>
    );
  }
  if (decision === 'blocked' && action === 'escalate_to_human') {
    return (
      <span className="font-mono text-xs px-2 py-1 rounded-full border bg-escalated/15 text-escalated border-escalated/30">
        escalated
      </span>
    );
  }
  const style = OUTCOME_STYLES[outcome] || OUTCOME_STYLES.no_response;
  return (
    <span className={`font-mono text-xs px-2 py-1 rounded-full border ${style}`}>
      {outcome || 'no action'}
    </span>
  );
}

export default function PaymentsTable({ payments, onSelect }) {
  return (
    <div>
      <h2 className="font-display text-sm uppercase tracking-widest text-textMuted mb-4">
        All payments ({payments.length})
      </h2>
      <div className="border border-line rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface text-left font-body text-xs text-textMuted uppercase tracking-wide">
              <th className="px-4 py-3">Payment ID</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Cause</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr
                key={p.payment_id}
                onClick={() => onSelect(p.payment_id)}
                className="border-t border-line hover:bg-surfaceLight cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 font-mono text-xs text-textPrimary">{p.payment_id}</td>
                <td className="px-4 py-3 font-mono text-xs text-textPrimary">₹{toRupees(p.amount_paise)}</td>
                <td className="px-4 py-3 font-body text-textMuted">{p.cause || '—'}</td>
                <td className="px-4 py-3 font-body text-textMuted">{p.action || '—'}</td>
                <td className="px-4 py-3">
                  <OutcomePill
                    decision={p.decision}
                    action={p.action}
                    outcome={p.outcome}
                    commitmentIntent={p.commitment_intent}
                    commitmentDate={p.commitment_promised_date}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}