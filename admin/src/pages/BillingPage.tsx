import React, { useState, useEffect } from 'react';

interface BillingPageProps {
  token: string;
}

interface BillingStats {
  total_appointments: number;
  pending_invoices: number;
  paid_invoices: number;
  total_revenue_sats: number;
}

export const BillingPage: React.FC<BillingPageProps> = ({ token }) => {
  const [stats, setStats] = useState<BillingStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBillingStats = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('Fetching billing stats...');
      
      const response = await fetch('/api/admin/billing/stats', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Response data:', data);
        
        if (data.status === 'success') {
          setStats(data.stats);
        } else {
          setError(data.message || 'API returned error status');
        }
      } else {
        const errorData = await response.json();
        setError(`HTTP ${response.status}: ${errorData.message || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError(`Network error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const testCreateInvoice = async () => {
    try {
      console.log('Testing invoice creation...');
      
      const response = await fetch('/api/admin/billing/appointments/1/invoice', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amountSats: 1000,
          description: 'Test invoice'
        })
      });
      
      const data = await response.json();
      console.log('Create invoice response:', data);
      
      if (response.ok) {
        alert('Invoice created successfully!');
        fetchBillingStats(); // Refresh stats
      } else {
        alert(`Error: ${data.message}`);
      }
    } catch (err) {
      console.error('Create invoice error:', err);
      alert('Failed to create invoice');
    }
  };

  useEffect(() => {
    if (token) {
      fetchBillingStats();
    }
  }, [token]);

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h2 className="text-2xl font-bold text-white mb-4">Billing Dashboard</h2>
        
        <div className="flex gap-4 mb-6">
          <button 
            onClick={fetchBillingStats}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh Stats'}
          </button>
          
          <button 
            onClick={testCreateInvoice}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
          >
            Test Create Invoice
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-900 border border-red-700 rounded">
            <p className="text-red-400">Error: {error}</p>
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gray-700 rounded-lg p-4">
              <h3 className="text-gray-400 text-sm">Total Appointments</h3>
              <p className="text-white text-2xl font-bold">{stats.total_appointments}</p>
            </div>
            
            <div className="bg-gray-700 rounded-lg p-4">
              <h3 className="text-gray-400 text-sm">Pending Invoices</h3>
              <p className="text-yellow-400 text-2xl font-bold">{stats.pending_invoices}</p>
            </div>
            
            <div className="bg-gray-700 rounded-lg p-4">
              <h3 className="text-gray-400 text-sm">Paid Invoices</h3>
              <p className="text-green-400 text-2xl font-bold">{stats.paid_invoices}</p>
            </div>
            
            <div className="bg-gray-700 rounded-lg p-4">
              <h3 className="text-gray-400 text-sm">Revenue (Sats)</h3>
              <p className="text-purple-400 text-2xl font-bold">{stats.total_revenue_sats}</p>
            </div>
          </div>
        )}

        <div className="mt-6 p-4 bg-gray-700 rounded">
          <h3 className="text-white font-medium mb-2">API Test Info:</h3>
          <p className="text-gray-300 text-sm">Stats Endpoint: /api/admin/billing/stats</p>
          <p className="text-gray-300 text-sm">Create Invoice: /api/admin/billing/appointments/:id/invoice</p>
          <p className="text-gray-300 text-sm">Token: {token ? 'Present' : 'Missing'}</p>
        </div>
      </div>
    </div>
  );
};