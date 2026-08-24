import { toRupees } from '../api';

export default function CauseBreakdown({ breakdown }) {
  if (!breakdown || breakdown.length === 0) return null;
  const maxTotal = Math.max(...breakdown.map(b => b.total));

  return (
    <div className="mb-10">
      <h2 className="font-display text-sm uppercase tracking-widest text-textMuted mb-4">
        Breakdown by diagnosed cause
      </h2>
      <div className="space-y-3">
        {breakdown.map((b) => {
          const rate = b.total > 0 ? b.recovered / b.total : 0;
          const widthPct = (b.total / maxTotal) * 100;
          return (
            <div key={b.cause} className="bg-surface rounded-lg p-4 border border-line">
              <div className="flex justify-between items-baseline mb-2">
                <span className="font-mono text-sm text-textPrimary">{b.cause}</span>
                <span className="font-mono text-xs text-textMuted">
                  {b.recovered}/{b.total} recovered · ₹{toRupees(b.recovered_paise)}
                </span>
              </div>
              <div className="h-2 bg-line rounded-full overflow-hidden">
                <div
                  className="h-full bg-recovered rounded-full"
                  style={{ width: `${widthPct}%`, opacity: 0.3 + rate * 0.7 }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}