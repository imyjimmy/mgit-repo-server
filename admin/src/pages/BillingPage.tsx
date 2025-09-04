// File: mgit-repo-server/admin/src/pages/BillingPage.tsx

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

interface PastAppointment {
  id: number;
  start_datetime: string;
  end_datetime: string;
  id_services: number;
  id_users_customer: number;
  id_users_provider: number;
  customer_name: string;
  customer_email: string;
  service_name: string;
  service_price: number;
  service_duration: number;
  has_invoice: boolean;
}

export const BillingPage: React.FC<BillingPageProps> = ({ token }) => {
  const [stats, setStats] = useState<BillingStats | null>(null);
  const [currentProviderId, setCurrentProviderId] = useState<number | null>(null);
  const [pastAppointments, setPastAppointments] = useState<PastAppointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | null, text: string }>({ type: null, text: '' });

  const fetchBillingStats = async () => {
    try {
      const response = await fetch('/api/admin/billing/stats', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          setStats(data.stats);
        }
      }
    } catch (err) {
      console.error('Failed to fetch billing stats:', err);
    }
  };

  const fetchCurrentProvider = async () => {
    try {
      // Get current user's pubkey from localStorage
      const pubkey = localStorage.getItem('admin_pubkey');
      if (!pubkey) {
        setError('No user pubkey found');
        return;
      }

      const response = await fetch(`/api/admin/user-lookup/${pubkey}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success' && data.userFound && data.user) {
          setCurrentProviderId(data.user.id);
        } else {
          setError('Current user is not a provider');
        }
      } else {
        setError('Failed to fetch user information');
      }
    } catch (err) {
      console.error('Failed to fetch current provider info:', err);
      setError('Network error fetching user info');
    }
  };

  const fetchPastAppointments = async (providerId: number) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/appointments/completed/${providerId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          setPastAppointments(data.appointments);
        }
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to fetch appointments');
      }
    } catch (err) {
      console.error('Failed to fetch past appointments:', err);
      setError('Network error fetching appointments');
    } finally {
      setLoading(false);
    }
  };

  const createInvoiceForAppointment = async (appointment: PastAppointment) => {
    setCreatingInvoice(appointment.id);
    setMessage({ type: null, text: '' });

    try {
      const response = await fetch(`/api/admin/billing/appointments/${appointment.id}/invoice`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amountSats: appointment.service_price,
          description: `${appointment.service_name} - ${appointment.customer_name}`
        })
      });

      const data = await response.json();

      if (response.ok && data.status === 'success') {
        setMessage({
          type: 'success',
          text: `Invoice created for ${appointment.customer_name} - ${appointment.service_price} sats`
        });

        // Refresh the appointments list
        if (currentProviderId) {
          fetchPastAppointments(currentProviderId);
        }
        fetchBillingStats();
      } else {
        setMessage({
          type: 'error',
          text: data.message || 'Failed to create invoice'
        });
      }
    } catch (err) {
      console.error('Failed to create invoice:', err);
      setMessage({
        type: 'error',
        text: 'Network error creating invoice'
      });
    } finally {
      setCreatingInvoice(null);
    }
  };

  useEffect(() => {
    if (token) {
      fetchBillingStats();
      fetchCurrentProvider();
    }
  }, [token]);

  useEffect(() => {
    if (currentProviderId) {
      fetchPastAppointments(currentProviderId);
    }
  }, [currentProviderId]);

  const unbilledAppointments = pastAppointments.filter(apt => !apt.has_invoice);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h2 className="text-2xl font-bold text-white mb-2">My Billing Dashboard</h2>
        <p className="text-gray-400">Create Lightning invoices for your completed appointments</p>
      </div>

      {/* Message Display */}
      {message.type && (
        <div className={`p-4 rounded-lg ${
          message.type === 'success' 
            ? 'bg-green-900 border border-green-700 text-green-400' 
            : 'bg-red-900 border border-red-700 text-red-400'
        }`}>
          {message.text}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="p-4 rounded-lg bg-red-900 border border-red-700">
          <p className="text-red-400">Error: {error}</p>
        </div>
      )}

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h3 className="text-gray-400 text-sm">Total Appointments</h3>
            <p className="text-white text-2xl font-bold">{stats.total_appointments}</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h3 className="text-gray-400 text-sm">Pending Invoices</h3>
            <p className="text-yellow-400 text-2xl font-bold">{stats.pending_invoices}</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h3 className="text-gray-400 text-sm">Paid Invoices</h3>
            <p className="text-green-400 text-2xl font-bold">{stats.paid_invoices}</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h3 className="text-gray-400 text-sm">Revenue (Sats)</h3>
            <p className="text-purple-400 text-2xl font-bold">{stats.total_revenue_sats}</p>
          </div>
        </div>
      )}

      {/* Past Appointments - Unbilled */}
      {currentProviderId && (
        <div className="bg-gray-800 rounded-xl border border-gray-700">
          <div className="p-6 border-b border-gray-700">
            <h3 className="text-xl font-semibold text-white">Unbilled Past Appointments</h3>
            <p className="text-gray-400 text-sm mt-1">Your completed appointments ready for billing</p>
          </div>
          
          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
                <span className="ml-3 text-gray-400">Loading appointments...</span>
              </div>
            ) : unbilledAppointments.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-400">No unbilled appointments found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {unbilledAppointments.map((appointment) => (
                  <div key={appointment.id} className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="text-white font-medium">
                            {appointment.customer_name}
                          </h4>
                          <span className="px-2 py-1 bg-blue-600 text-blue-100 text-xs rounded-full">
                            {appointment.service_name}
                          </span>
                        </div>
                        
                        <div className="text-sm text-gray-400 space-y-1">
                          <div>Date: {new Date(appointment.start_datetime).toLocaleString()}</div>
                          <div>Duration: {appointment.service_duration} minutes</div>
                          <div>Amount: {appointment.service_price} sats</div>
                          <div>Customer: {appointment.customer_email}</div>
                        </div>
                      </div>
                      
                      <div className="ml-4">
                        <button
                          onClick={() => createInvoiceForAppointment(appointment)}
                          disabled={creatingInvoice === appointment.id}
                          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                            creatingInvoice !== appointment.id
                              ? 'bg-green-600 hover:bg-green-700 text-white'
                              : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          {creatingInvoice === appointment.id ? (
                            <div className="flex items-center gap-2">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              Creating...
                            </div>
                          ) : (
                            'Create Invoice'
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recently Billed Appointments */}
      {currentProviderId && (
        <div className="bg-gray-800 rounded-xl border border-gray-700">
          <div className="p-6 border-b border-gray-700">
            <h3 className="text-xl font-semibold text-white">Recently Billed</h3>
            <p className="text-gray-400 text-sm mt-1">Your appointments that have been invoiced</p>
          </div>
          
          <div className="p-6">
            {pastAppointments.filter(apt => apt.has_invoice).length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-400">No billed appointments yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pastAppointments
                  .filter(apt => apt.has_invoice)
                  .slice(0, 10)
                  .map((appointment) => (
                    <div key={appointment.id} className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-white font-medium mb-1">
                            {appointment.customer_name}
                          </h4>
                          <div className="text-sm text-gray-400">
                            {appointment.service_name} • {new Date(appointment.start_datetime).toLocaleDateString()} • {appointment.service_price} sats
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 bg-green-900 text-green-400 text-xs rounded-full">
                            Invoiced
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};