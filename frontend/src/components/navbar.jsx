const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'approvals', label: 'Approvals' },
  { key: 'payments', label: 'Payments' }
];

export default function Navbar({ activeTab, onChangeTab, pendingCount, paymentsCount }) {
  return (
    <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur border-b border-line">
      <div className="max-w-6xl mx-auto px-6 md:px-12 h-16 flex items-center justify-between gap-6">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-recovered" />
          <span className="font-display text-sm font-700 text-textPrimary tracking-tight">
            Recoup
          </span>
        </div>

        <nav className="flex items-center gap-1 bg-ink rounded-full p-1 border border-line">
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            const badgeCount = tab.key === 'approvals' ? pendingCount : tab.key === 'payments' ? paymentsCount : 0;
            const showUrgentBadge = tab.key === 'approvals' && pendingCount > 0;

            return (
              <button
                key={tab.key}
                onClick={() => onChangeTab(tab.key)}
                className={`relative font-mono text-xs px-4 py-2 rounded-full transition-colors ${
                  active ? 'bg-recovered/15 text-recovered' : 'text-textMuted hover:text-textPrimary'
                }`}
              >
                {tab.label}
                {badgeCount > 0 && (
                  <span
                    className={`ml-2 inline-flex items-center justify-center text-[10px] px-1.5 py-0.5 rounded-full ${
                      showUrgentBadge
                        ? 'bg-pending/20 text-pending'
                        : 'bg-textMuted/15 text-textMuted'
                    }`}
                  >
                    {badgeCount}
                  </span>
                )}
                {showUrgentBadge && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-pending animate-pulse" />
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}