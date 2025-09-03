import React, { useState, useEffect } from 'react';
import { billingService } from '../services/billingService';
import { Appointment, Service } from '../types/billing';

interface BillingPageProps {
  token: string;
}

export const BillingPage: React.FC<BillingPageProps> = ({ token }) => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [albyInitialized, setAlbyInitialized] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState<number | null>(null);

  useEffect(() => {
    initializeData();
  }, [token]);

  const initializeData = async () => {
    setLoading(true);
    try {
      // Connect to Lightning wallet via NWC
      const connectionSuccess = await billingService.connect();
      setAlbyInitialized(connectionSuccess);

      // Fetch appointments and services
      const [appointmentsData, servicesData] = await Promise.all([
        billingService.fetchCompletedAppointments(token),
        billingService.fetchServices(token)
      ]);

      setAppointments(appointmentsData);
      setServices(servicesData);
      
      // Optionally fetch wallet info for display
      if (connectionSuccess) {
        try {
          const walletInfo = await billingService.getWalletInfo();
          console.log('Connected wallet:', walletInfo);
          
          const balance = await billingService.getBalance();
          console.log('Wallet balance:', balance, 'sats');
        } catch (error) {
          console.warn('Could not fetch wallet details:', error);
        }
      }
      
    } catch (error) {
      console.error('Failed to initialize billing data:', error);
      setAlbyInitialized(false);
      
      // Still try to fetch appointment data even if wallet connection fails
      try {
        const [appointmentsData, servicesData] = await Promise.all([
          billingService.fetchCompletedAppointments(token),
          billingService.fetchServices(token)
        ]);
        setAppointments(appointmentsData);
        setServices(servicesData);
      } catch (dataError) {
        console.error('Failed to fetch appointment data:', dataError);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateInvoice = async (appointment: Appointment) => {
    if (!albyInitialized) {
      alert('Lightning payment system not initialized');
      return;
    }

    setCreatingInvoice(appointment.id);
    
    try {
      const service = services.find(s => s.id === appointment.id_services);
      if (!service) {
        throw new Error('Service not found');
      }

      // Convert USD price to sats (1:1 ratio as specified)
      const amountSats = Math.floor(service.price);
      const description = `Payment for ${service.name} - ${appointment.customer?.first_name} ${appointment.customer?.last_name}`;

      // Create Lightning invoice using new BillingService
      const invoiceResponse = await billingService.createAppointmentInvoice({
        appointmentId: appointment.id,
        amountSats: amountSats,
        description: description,
        expiryMinutes: 60 // 1 hour expiry
      });

      if (!invoiceResponse.success || !invoiceResponse.invoice) {
        throw new Error('Failed to create invoice');
      }

      const activeInvoice = invoiceResponse.invoice;
      
      // Mark appointment as invoiced in database
      await billingService.markAppointmentInvoiced(appointment.id, token, activeInvoice);

      // Refresh appointments to show updated status
      const updatedAppointments = await billingService.fetchCompletedAppointments(token);
      setAppointments(updatedAppointments);

      // Show invoice details to user
      alert(`Invoice created successfully!\n\nAmount: ${amountSats} sats\nExpires: ${activeInvoice.expiresAt.toLocaleString()}\n\nPayment Request:\n${activeInvoice.paymentRequest}`);
      
      // Optional: Copy payment request to clipboard
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(activeInvoice.paymentRequest);
        console.log('Payment request copied to clipboard');
      }
      
    } catch (error) {
      console.error('Failed to create invoice:', error);
      
      let errorMessage = 'Failed to create invoice. Please try again.';
      if (error instanceof Error) {
        errorMessage = `Failed to create invoice: ${error.message}`;
      }
      
      alert(errorMessage);
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
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">⚡ Lightning Billing</h2>
            <p className="text-gray-400">Create invoices for completed appointments</p>
          </div>
          <div className="text-right">
            <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${
              albyInitialized ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'
            }`}>
              <div className={`w-2 h-2 rounded-full mr-2 ${
                albyInitialized ? 'bg-green-400' : 'bg-red-400'
              }`}></div>
              {albyInitialized ? 'Alby Connected' : 'Alby Disconnected'}
            </div>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="flex items-center">
            <div className="p-2 bg-blue-600 rounded-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-gray-400">Total Appointments</p>
              <p className="text-xl font-bold text-white">{appointments.length}</p>
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
              <p className="text-xl font-bold text-white">{unbilledAppointments.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="flex items-center">
            <div className="p-2 bg-green-600 rounded-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-gray-400">Total Revenue (Sats)</p>
              <p className="text-xl font-bold text-white">
                {services.reduce((sum, service) => {
                  const serviceAppointments = appointments.filter(apt => 
                    apt.id_services === service.id && apt.invoiced
                  );
                  return sum + (serviceAppointments.length * service.price);
                }, 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

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
                          disabled={!albyInitialized || creatingInvoice === appointment.id}
                          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                            albyInitialized && creatingInvoice !== appointment.id
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
          <h3 className="text-xl font-semibold text-white">Invoice History</h3>
          <p className="text-gray-400 text-sm mt-1">Previously invoiced appointments</p>
        </div>
        
        <div className="p-6">
          {appointments.filter(apt => apt.invoiced).length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400">No invoices created yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {appointments
                .filter(apt => apt.invoiced)
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
    </div>
  );
};