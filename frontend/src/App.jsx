import { useEffect, useState } from 'react';
import { api } from './api';
import SummaryHero from './components/SummaryHero';
import CauseBreakdown from './components/CauseBreakdown';
import PaymentsTable from './components/PaymentsTable';
import AuditDrawer from './components/AuditDrawer';

export default function App() {
  const [summary, setSummary] = useState(null);
  const [payments, setPayments] = useState([]);
  const [selectedAudit, setSelectedAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [summaryData, paymentsData] = await Promise.all([
          api.getSummary(),
          api.getPayments()
        ]);
        setSummary(summaryData);
        setPayments(paymentsData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSelectPayment(paymentId) {
    try {
      const audit = await api.getAudit(paymentId);
      setSelectedAudit(audit);
    } catch (err) {
      console.error('Failed to load audit trail:', err);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <p className="font-mono text-textMuted text-sm">Loading batch data…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <p className="font-mono text-escalated text-sm">Failed to load: {error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink text-textPrimary px-6 md:px-12 py-10 max-w-5xl mx-auto">
      <SummaryHero summary={summary} />
      <CauseBreakdown breakdown={summary?.breakdown_by_cause} />
      <PaymentsTable payments={payments} onSelect={handleSelectPayment} />
      {selectedAudit && (
        <AuditDrawer audit={selectedAudit} onClose={() => setSelectedAudit(null)} />
      )}
    </div>
  );
}