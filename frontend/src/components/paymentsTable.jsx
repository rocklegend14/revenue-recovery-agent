import { useMemo, useState } from 'react';
import { toRupees } from '../api';

const OUTCOME_STYLES = {
  recovered: 'bg-recovered/15 text-recovered border-recovered/30',
  pending: 'bg-pending/15 text-pending border-pending/30',
  no_response: 'bg-textMuted/15 text-textMuted border-textMuted/30',
  failed_to_send: 'bg-escalated/15 text-escalated border-escalated/30'
};

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'recovered', label: 'Recovered' },
  { key: 'pending', label: 'Pending' },
  { key: 'escalated', label: 'Escalated' },
  { key: 'promised', label: 'Promised' },
  { key: 'opted_out', label: 'Opted out' },
  { key: 'no_response', label: 'No response' }
];

// Single source of truth for "what category is this row in" — used by both
// the filter chips and the pill so they never disagree with each other.
function getStatus({ decision, action, outcome, commitment_intent }) {
  if (commitment_intent === 'promised_to_pay') return 'promised';
  if (commitment_intent === 'opt_out') return 'opted_out';
  if (decision === 'blocked' && action === 'escalate_to_human') return 'escalated';
  return outcome || 'no_action';
}

function OutcomePill({ status, commitmentDate }) {
  if (status === 'promised') {
    return (
      <span className="font-mono text-xs px-2 py-1 rounded-full border bg-pending/15 text-pending border-pending/30">
        promised {commitmentDate ? `· ${commitmentDate}` : ''}
      </span>
    );
  }
  if (status === 'opted_out') {
    return (
      <span className="font-mono text-xs px-2 py-1 rounded-full border bg-textMuted/15 text-textMuted border-textMuted/30">
        opted out
      </span>
    );
  }
  if (status === 'escalated') {
    return (
      <span className="font-mono text-xs px-2 py-1 rounded-full border bg-escalated/15 text-escalated border-escalated/30">
        escalated
      </span>
    );
  }
  const style = OUTCOME_STYLES[status] || OUTCOME_STYLES.no_response;
  return (
    <span className={`font-mono text-xs px-2 py-1 rounded-full border ${style}`}>
      {status === 'no_action' ? 'no action' : status}
    </span>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`font-mono text-xs px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${
        active
          ? 'bg-recovered/15 text-recovered border-recovered/40'
          : 'bg-surface text-textMuted border-line hover:border-textMuted'
      }`}
    >
      {children}
    </button>
  );
}

export default function PaymentsTable({ payments, onSelect }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [causeFilter, setCauseFilter] = useState('all');

  // Causes present in the current data — chips are built from real data,
  // not a hardcoded list, so they never show a category with zero rows.
  const causes = useMemo(() => {
    const set = new Set(payments.map((p) => p.cause).filter(Boolean));
    return Array.from(set).sort();
  }, [payments]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return payments.filter((p) => {
      const status = getStatus(p);
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (causeFilter !== 'all' && p.cause !== causeFilter) return false;
      if (term && !p.payment_id.toLowerCase().includes(term) && !(p.cause || '').toLowerCase().includes(term)) {
        return false;
      }
      return true;
    });
  }, [payments, search, statusFilter, causeFilter]);

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h2 className="font-display text-sm uppercase tracking-widest text-textMuted">
          All payments ({filtered.length}{filtered.length !== payments.length ? ` of ${payments.length}` : ''})
        </h2>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by payment ID or cause…"
          className="font-mono text-xs bg-surface border border-line rounded-lg px-3 py-2 text-textPrimary placeholder:text-textMuted w-64 focus:outline-none focus:border-textMuted"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-2">
        {STATUS_FILTERS.map((f) => (
          <Chip key={f.key} active={statusFilter === f.key} onClick={() => setStatusFilter(f.key)}>
            {f.label}
          </Chip>
        ))}
      </div>

      {causes.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <Chip active={causeFilter === 'all'} onClick={() => setCauseFilter('all')}>
            All causes
          </Chip>
          {causes.map((cause) => (
            <Chip key={cause} active={causeFilter === cause} onClick={() => setCauseFilter(cause)}>
              {cause}
            </Chip>
          ))}
        </div>
      )}

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
            {filtered.map((p) => (
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
                  <OutcomePill status={getStatus(p)} commitmentDate={p.commitment_promised_date} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center font-body text-sm text-textMuted">
                  No payments match your search or filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}