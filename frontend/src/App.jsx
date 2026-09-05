import { useEffect, useState } from 'react';
import { api } from './api';
import Navbar from './components/navbar';
import SummaryHero from './components/summaryHero';
import RecoveryApprovalCard from './components/recoveryApprovalCard';
import CauseBreakdown from './components/causeBreakdown';
import PaymentsTable from './components/paymentsTable';
import AuditDrawer from './components/auditDrawer';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [summary, setSummary] = useState(null);
  const [payments, setPayments] = useState([]);
  const [pending, setPending] = useState(null);
  const [selectedAudit, setSelectedAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function loadAll() {
    try {
      const [summaryData, paymentsData, pendingData] = await Promise.all([
        api.getSummary(),
        api.getPayments(),
        api.getPendingRecovery()
      ]);
      setSummary(summaryData);
      setPayments(paymentsData);
      setPending(pendingData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

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
    <div className="min-h-screen bg-ink text-textPrimary">
      <Navbar
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        pendingCount={pending?.count || 0}
        paymentsCount={payments.length}
      />

      <div className="max-w-6xl mx-auto px-6 md:px-12 py-10">
        {activeTab === 'overview' && (
          <>
            <SummaryHero summary={summary} />
            <CauseBreakdown breakdown={summary?.breakdown_by_cause} />
          </>
        )}

        {activeTab === 'approvals' && (
          <RecoveryApprovalCard pending={pending} onSent={loadAll} />
        )}

        {activeTab === 'payments' && (
          <PaymentsTable payments={payments} onSelect={handleSelectPayment} />
        )}
      </div>

      {selectedAudit && (
        <AuditDrawer audit={selectedAudit} onClose={() => setSelectedAudit(null)} />
      )}
    </div>
  );
}