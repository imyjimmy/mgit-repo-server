// File: mgit-repo-server/admin/src/pages/BillingPage.tsx

import React, { useState, useEffect } from 'react';
import { billingApiService } from '../services/billingApiService';
import { Appointment } from '../types/billing';

interface BillingPageProps {
  token: string;
}

interface BillingStats {
  total_appointments: number;
  pending_invoices: number;
  paid_invoices: number;
  total_revenue_sats: number;
}

interface Service {
  id?: number;
  name: string;
  duration: number;
  price: number;
  currency: string;
  description: string;
  location: string;
  color: string;
  availabilities_type: 'flexible' | 'fixed';
  attendants_number: number;
  id_service_categories: number | null;
  is_private: boolean;
  create_datetime?: string;
  update_datetime?: string;
}

export const BillingPage: React.FC<BillingPageProps> = ({ token }) => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [billingStats, setBillingStats] = useState<BillingStats>();
  const [loading, setLoading] = useState(true);
  const [creatingInvoice, setCreatingInvoice] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | null, text: string }>({ type: null, text: '' });

  useEffect(() => {
    initializeData();
  }, [token]);

  const initializeData = async () => {
    setLoading(true);
    try {
      // Fetch all data from backend
      const [appointmentsData, servicesData, statsData] = await Promise.all([
        billingApiService.fetchCompletedAppointments(token),
        billingApiService.fetchServices(token),
        billingApiService.getBillingStats(token)
      ]);

      setAppointments(appointmentsData);
      setServices(servicesData);
      setBillingStats(statsData);
    } catch (error) {
      console.error('Failed to initialize billing data:', error);
      setMessage({ type: 'error', text: 'Failed to load billing data' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateInvoice = async (appointment: any) => {
    setCreatingInvoice(appointment.id);
    setMessage({ type: null, text: '' });

    try {
      const result = await billingApiService.createInvoiceForAppointment(appointment.id, token);

      if (result.success && result.invoice) {
        setMessage({ 
          type: 'success', 
          text: `Invoice created! ${result.invoice.amount_sats} sats`
        });

        // Copy payment request to clipboard
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(result.invoice.payment_request);
        }

        // Show invoice details
        alert(`Invoice Created Successfully!\n\nAmount: ${result.invoice.amount_sats} sats\nService: ${result.invoice.appointment.service_name}\nCustomer: ${result.invoice.appointment.customer_name}\n\nPayment request copied to clipboard!`);

        // Refresh data
        await initializeData();
      } else {
        throw new Error(result.error || 'Failed to create invoice');
      }
    } catch (error: any) {
      console.error('Failed to create invoice:', error);
      setMessage({ 
        type: 'error', 
        text: error.message || 'Failed to create invoice'
      });
    } finally {
      setCreatingInvoice(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
          <span className="ml-3 text-gray-400">Loading billing data...</span>
        </div>
      </div>
    );
  }

  const unbilledAppointments = appointments.filter(apt => !apt.invoiced && apt.status !== 'cancelled');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h2 className="text-2xl font-bold text-white mb-2">⚡ Lightning Billing</h2>
        <p className="text-gray-400">Create and manage Lightning invoices for completed appointments</p>
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

      {/* Statistics */}
      {billingStats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="flex items-center">
              <div className="p-2 bg-blue-600 rounded-lg">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-gray-400">Total Appointments</p>
                <p className="text-xl font-bold text-white">{billingStats.total_appointments}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="flex items-center">
              <div className="p-2 bg-yellow-600 rounded-lg">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-gray-400">Pending Invoices</p>
                <p className="text-xl font-bold text-white">{billingStats.pending_invoices}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="flex items-center">
              <div className="p-2 bg-green-600 rounded-lg">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-gray-400">Paid Invoices</p>
                <p className="text-xl font-bold text-white">{billingStats.paid_invoices}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="flex items-center">
              <div className="p-2 bg-purple-600 rounded-lg">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-gray-400">Total Revenue (Sats)</p>
                <p className="text-xl font-bold text-white">{billingStats.total_revenue_sats}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unbilled Appointments */}
      <div className="bg-gray-800 rounded-xl border border-gray-700">
        <div className="p-6 border-b border-gray-700">
          <h3 className="text-xl font-semibold text-white">Pending Invoices</h3>
          <p className="text-gray-400 text-sm mt-1">Completed appointments ready for billing</p>
        </div>
        
        <div className="p-6">
          {unbilledAppointments.length === 0 ? (
            <div className="text-center py-8">
              <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-gray-400">All caught up! No pending invoices.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {unbilledAppointments.map((appointment) => {
                const service = services.find(s => s.id === appointment.id_services);
                const amountSats = service ? Math.floor(service.price) : 0;
                
                return (
                  <div key={appointment.id} className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="text-white font-medium">
                            {appointment.customer?.first_name} {appointment.customer?.last_name}
                          </h4>
                          <span className="px-2 py-1 bg-blue-600 text-blue-100 text-xs rounded-full">
                            {service?.name || 'Unknown Service'}
                          </span>
                        </div>
                        
                        <div className="text-sm text-gray-400 space-y-1">
                          <div>📅 {new Date(appointment.start_datetime).toLocaleString()}</div>
                          <div>💰 {amountSats} sats ({service?.duration || 0} min)</div>
                          {appointment.customer?.email && (
                            <div>📧 {appointment.customer.email}</div>
                          )}
                        </div>
                      </div>
                      
                      <div className="ml-4">
                        <button
                          onClick={() => handleCreateInvoice(appointment)}
                          disabled={creatingInvoice === appointment.id}
                          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                            creatingInvoice !== appointment.id
                              ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                              : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          {creatingInvoice === appointment.id ? (
                            <div className="flex items-center gap-2">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              Creating...
                            </div>
                          ) : (
                            '⚡ Create Invoice'
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Invoice History */}
      <div className="bg-gray-800 rounded-xl border border-gray-700">
        <div className="p-6 border-b border-gray-700">
          <h3 className="text-xl font-semibold text-white">Recent Invoice History</h3>
          <p className="text-gray-400 text-sm mt-1">Previously created invoices</p>
        </div>
        
        <div className="p-6">
          {appointments.filter((apt: Appointment) => apt.invoiced).length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400">No invoices created yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {appointments
                .filter(apt => apt.invoiced)
                .slice(0, 10) // Show last 10
                .map((appointment) => {
                  const service = services.find(s => s.id === appointment.id_services);
                  const amountSats = service ? Math.floor(service.price) : 0;
                  
                  return (
                    <div key={appointment.id} className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-white font-medium mb-1">
                            {appointment.customer?.first_name} {appointment.customer?.last_name}
                          </h4>
                          <div className="text-sm text-gray-400">
                            {service?.name} • {new Date(appointment.start_datetime).toLocaleDateString()} • {amountSats} sats
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 bg-green-900 text-green-400 text-xs rounded-full">
                            ✓ Invoiced
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* Configuration Notice */}
      <div className="bg-blue-900 border border-blue-700 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="text-blue-400 text-xl">ℹ️</div>
          <div>
            <h4 className="text-blue-400 font-medium">Lightning Wallet Configuration</h4>
            <p className="text-blue-300 text-sm mt-1">
              Configure your Lightning wallet connection in Settings to enable automatic invoice creation and payment monitoring.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};