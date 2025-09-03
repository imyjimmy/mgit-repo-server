// File: mgit-repo-server/admin/src/services/billingApiService.ts

const BILLING_API_BASE = 'http://localhost:3004'; // plebdoc-scheduler-service URL

interface CreateInvoiceResponse {
  success: boolean;
  invoice?: {
    id: number;
    payment_request: string;
    amount_sats: number;
    description: string;
    expires_at: string;
    appointment: {
      id: number;
      service_name: string;
      customer_name: string;
    };
  };
  error?: string;
}

interface BillingStats {
  total_appointments: number;
  pending_invoices: number;
  paid_invoices: number;
  total_revenue_sats: number;
}

interface TestNwcResponse {
  success: boolean;
  walletInfo?: {
    node: {
      alias: string;
      pubkey: string;
    };
    balance: number;
  };
  error?: string;
}

class BillingApiService {

  async createInvoiceForAppointment(appointmentId: number, token: string): Promise<CreateInvoiceResponse> {
    const response = await fetch(`${BILLING_API_BASE}/api/billing/appointments/${appointmentId}/invoice`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create invoice');
    }

    return await response.json();
  }

  async testNwcConnection(nwcString: string, token: string): Promise<TestNwcResponse> {
    const response = await fetch(`${BILLING_API_BASE}/api/billing/test-nwc`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        nwc_connection_string: nwcString
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to test connection');
    }

    return await response.json();
  }

  async getBillingStats(token: string): Promise<BillingStats> {
    const response = await fetch(`${BILLING_API_BASE}/api/billing/stats`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get billing stats');
    }

    return await response.json();
  }

  async getInvoiceStatus(invoiceId: number, token: string): Promise<any> {
    const response = await fetch(`${BILLING_API_BASE}/api/billing/invoices/${invoiceId}/status`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get invoice status');
    }

    return await response.json();
  }

  // Existing methods for appointments/services (these call the existing API)
  async fetchCompletedAppointments(token: string) {
    const response = await fetch(`${BILLING_API_BASE}/api/admin/appointments/completed`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch appointments');
    }

    return await response.json();
  }

  async fetchServices(token: string) {
    const response = await fetch(`${BILLING_API_BASE}/api/admin/services`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch services');
    }

    return await response.json();
  }
}

export const billingApiService = new BillingApiService();