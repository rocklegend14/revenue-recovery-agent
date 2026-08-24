import { toRupees } from '../api';

const STEP_LABELS = {
  failed: 'PAYMENT FAILED',
  diagnosed: 'DIAGNOSED',
  decided: 'DECISION: PROCEED',
  blocked: 'DECISION: BLOCKED',
  action_sent: 'ACTION SENT',
  outcome: 'OUTCOME'
};

const STEP_ICONS = {
  failed: '✕',
  diagnosed: '🔍',
  decided: '→',
  blocked: '⛔',
  action_sent: '✉',
  outcome: '✓'
};

const STEP_COLORS = {
  failed: 'text-escalated',
  diagnosed: 'text-textPrimary',
  decided: 'text-recovered',
  blocked: 'text-pending',
  action_sent: 'text-textPrimary',
  outcome: 'text-recovered'
};

const OUTCOME_BADGE = {
  recovered: 'bg-recovered/15 text-recovered border-recovered/30',
  pending: 'bg-pending/15 text-pending border-pending/30',
  escalated: 'bg-escalated/15 text-escalated border-escalated/30',
  no_response: 'bg-textMuted/15 text-textMuted border-textMuted/30',
  no_action_taken: 'bg-textMuted/15 text-textMuted border-textMuted/30'
};

const OUTCOME_ICON = {
  recovered: '✓',
  pending: '…',
  escalated: '⛔',
  no_response: '—',
  no_action_taken: '—'
};

function formatTime(iso) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

export default function AuditDrawer({ audit, onClose }) {
  if (!audit) return null;
  const badgeStyle = OUTCOME_BADGE[audit.final_outcome] || OUTCOME_BADGE.no_action_taken;
  const outcomeIcon = OUTCOME_ICON[audit.final_outcome] || '—';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-surface border-l border-line h-full overflow-y-auto p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="font-mono text-xs text-textMuted mb-1">{audit.payment_id}</p>
            <p className="font-display text-2xl text-textPrimary">₹{toRupees(audit.amount_paise)}</p>
          </div>
          <button
            onClick={onClose}
            className="font-mono text-xs text-textMuted hover:text-textPrimary border border-line rounded px-3 py-1"
          >
            close ✕
          </button>
        </div>

        {/* Plain-language summary — the merchant's actual question, answered immediately */}
        <div className={`rounded-lg border p-4 mb-6 ${badgeStyle}`}>
          <div className="flex items-start gap-2">
            <span className="text-lg leading-none">{outcomeIcon}</span>
            <p className="font-body text-sm leading-snug">{audit.summary}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <span className={`font-mono text-xs px-2 py-1 rounded-full border ${badgeStyle}`}>
            {audit.final_outcome.replace('_', ' ')}
          </span>
          {audit.time_to_resolution && (
            <span className="font-mono text-xs px-2 py-1 rounded-full border bg-textMuted/10 text-textMuted border-textMuted/30">
              resolved in {audit.time_to_resolution}
            </span>
          )}
          {audit.is_real_recovery && (
            <span className="font-mono text-xs px-2 py-1 rounded-full border bg-textMuted/10 text-textMuted border-textMuted/30">
              real payment link
            </span>
          )}
          {audit.payment_link_url && (
            <a
              href={audit.payment_link_url}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs text-recovered underline underline-offset-2"
            >
              view link ↗
            </a>
          )}
        </div>

        <p className="font-mono text-xs uppercase tracking-widest text-textMuted mb-4">
          Full audit trail
        </p>

        {/* Ledger-tape timeline — signature element */}
        <div className="relative pl-6 border-l border-line space-y-6">
          {audit.timeline.map((entry, i) => (
            <div key={i} className="relative">
              <div className="absolute -left-[29px] top-0 w-5 h-5 rounded-full bg-ink border border-line flex items-center justify-center text-[10px]">
                {STEP_ICONS[entry.step] || '•'}
              </div>
              <p className="font-mono text-[11px] text-textMuted mb-1">{formatTime(entry.at)}</p>
              <p className={`font-mono text-xs font-500 mb-1 ${STEP_COLORS[entry.step] || 'text-textPrimary'}`}>
                {STEP_LABELS[entry.step] || entry.step.toUpperCase()}
              </p>
              <p className="font-body text-sm text-textPrimary">{entry.detail}</p>
              {entry.reasoning && (
                <p className="font-body text-xs text-textMuted mt-1 italic">"{entry.reasoning}"</p>
              )}

              {entry.step === 'failed' && entry.meta && (
                <div className="mt-2 font-mono text-[11px] text-textMuted space-y-0.5">
                  {entry.meta.error_code && <p>error_code: {entry.meta.error_code}</p>}
                  {entry.meta.customer_contact && <p>contact: {entry.meta.customer_contact}</p>}
                  {entry.meta.customer_email && <p>email: {entry.meta.customer_email}</p>}
                </div>
              )}
              {entry.step === 'action_sent' && entry.meta?.payment_link_url && (
                <a
                  href={entry.meta.payment_link_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block mt-2 font-mono text-[11px] text-recovered underline underline-offset-2"
                >
                  {entry.meta.payment_link_url} ↗
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}