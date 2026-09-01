const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function get(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`Request failed: ${path} (${res.status})`);
  return res.json();
}

export const api = {
  getSummary: () => get('/api/dashboard/summary'),
  getPayments: () => get('/api/payments'),
  getAudit: (paymentId) => get(`/api/payments/${paymentId}/audit`),
  getPendingRecovery: () => get('/api/recovery/pending'),
  runRecovery: async () => {
    const res = await fetch(`${BASE_URL}/api/recovery/run`, { method: 'POST' });
    if (!res.ok) throw new Error(`Request failed: /api/recovery/run (${res.status})`);
    return res.json();
  }
};

export function toRupees(paise) {
  return (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}