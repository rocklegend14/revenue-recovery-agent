import { toRupees } from '../api';

export default function SummaryHero({ summary }) {
  if (!summary) return null;

  const {
    total_records,
    total_at_risk_paise,
    total_recovered_paise,
    recovery_rate,
    escalated_count,
    pending_count
  } = summary;

  return (
    <div className="border-b border-line pb-8 mb-8">
      <p className="font-mono text-xs uppercase tracking-widest text-textMuted mb-2">
        Revenue Recovery Agent — Batch Result
      </p>
      <div className="flex items-baseline gap-3 mb-6">
        <span className="font-display font-700 text-6xl text-recovered tabular-nums">
          ₹{toRupees(total_recovered_paise)}
        </span>
        <span className="font-body text-textMuted text-lg">recovered</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <Stat label="Records processed" value={total_records} />
        <Stat label="Total at risk" value={`₹${toRupees(total_at_risk_paise)}`} />
        <Stat
          label="Recovery rate"
          value={`${(recovery_rate * 100).toFixed(1)}%`}
          accent="text-recovered"
        />
        <Stat
          label="Escalated / Pending"
          value={`${escalated_count} / ${pending_count}`}
          accent="text-pending"
        />
      </div>
    </div>
  );
}

function Stat({ label, value, accent = 'text-textPrimary' }) {
  return (
    <div>
      <p className={`font-mono text-2xl font-500 tabular-nums ${accent}`}>{value}</p>
      <p className="font-body text-xs text-textMuted mt-1">{label}</p>
    </div>
  );
}