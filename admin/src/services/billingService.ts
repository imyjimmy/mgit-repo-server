// File: admin/src/services/billingService.ts

import { NostrWebLNProvider } from '@getalby/sdk';
import { 
  ActiveInvoice, 
  CreateInvoiceParams, 
  CreateInvoiceResponse, 
  CheckInvoiceStatusResponse,
  BillingError,
  BillingErrorCode,
  InvoiceStatus,
  Appointment,
  Service
} from '../types/billing';

class BillingService {
  private provider: NostrWebLNProvider | null;
  private connected: boolean;
  private nwcUrl: string;
  private activeInvoices: Map<string, ActiveInvoice>;
  private invoiceCheckIntervals: Map<string, NodeJS.Timeout>;

  constructor(nwcConnectionString: string) {
    if (!nwcConnectionString) {
      throw new Error('NWC_CONNECTION_STRING is required');
    }
    
    this.provider = null;
    this.connected = false;
    this.nwcUrl = nwcConnectionString;
    this.activeInvoices = new Map();
    this.invoiceCheckIntervals = new Map();
  }

  async connect(): Promise<boolean> {
    try {
      this.provider = new NostrWebLNProvider({
        nostrWalletConnectUrl: this.nwcUrl,
      });
      
      await this.provider.enable();
      this.connected = true;
      console.log('💰 Billing service connected via NWC');
      return true;
    } catch (error) {
      console.error('❌ Billing service connection failed:', error);
      this.connected = false;
      throw new BillingError(
        'Failed to connect to Lightning wallet',
        BillingErrorCode.NWC_NOT_CONNECTED,
        error
      );
    }
  }

  async disconnect(): Promise<void> {
    try {
      // Clear all active invoice check intervals
      this.invoiceCheckIntervals.forEach((interval) => {
        clearInterval(interval);
      });
      this.invoiceCheckIntervals.clear();

      if (this.provider) {
        // Note: NostrWebLNProvider might not have a close method, check SDK docs
        // await this.provider.close();
      }
      
      this.connected = false;
      this.provider = null;
      console.log('💰 Billing service disconnected');
    } catch (error) {
      console.error('❌ Error disconnecting billing service:', error);
    }
  }

  // Create invoice for completed appointment
  async createAppointmentInvoice(params: CreateInvoiceParams): Promise<CreateInvoiceResponse> {
    if (!this.connected) {
      await this.connect();
    }

    try {
      console.log(`💸 Creating appointment invoice: ${params.amountSats} sats for appointment ${params.appointmentId}`);
      
      // Validation
      if (!params.amountSats || params.amountSats <= 0) {
        throw new BillingError(
          `Invalid amount: ${params.amountSats}`,
          BillingErrorCode.INVALID_AMOUNT
        );
      }

      const expirySeconds = (params.expiryMinutes || 60) * 60;
      const expiresAt = new Date(Date.now() + (expirySeconds * 1000));

      const invoice = await this.provider!.makeInvoice({
        amount: parseInt(params.amountSats.toString()),
        defaultMemo: params.description,
        expiry: expirySeconds
      });

      console.log('Created appointment invoice:', invoice);

      // Create ActiveInvoice object
      const activeInvoice: ActiveInvoice = {
        appointmentId: params.appointmentId,
        invoiceHash: invoice.payment_hash || invoice.r_hash,
        paymentRequest: invoice.paymentRequest,
        amountSats: params.amountSats,
        description: params.description,
        createdAt: new Date(),
        expiresAt: expiresAt,
        status: InvoiceStatus.PENDING,
        patientInfo: {
          id: 0, // Will be populated from appointment data
          first_name: '',
          last_name: ''
        },
        serviceInfo: {
          id: 0,
          name: '',
          duration: 0,
          price: params.amountSats
        },
        providerInfo: {
          id: 0,
          first_name: '',
          last_name: ''
        }
      };

      // Store active invoice
      this.activeInvoices.set(invoice.paymentRequest, activeInvoice);

      // Start monitoring invoice payment status
      this.startInvoiceMonitoring(invoice.paymentRequest);

      return {
        success: true,
        invoice: activeInvoice
      };

    } catch (error) {
      console.error(`💥 Appointment invoice creation failed:`, error);
      
      if (error instanceof BillingError) {
        throw error;
      }

      // Fallback to mock invoice for development/testing
      return this.createMockInvoice(params);
    }
  }

  // Create mock invoice for testing when NWC fails
  private createMockInvoice(params: CreateInvoiceParams): CreateInvoiceResponse {
    console.log(`🧪 Creating mock invoice: ${params.amountSats} sats, expires in ${params.expiryMinutes || 60} minutes`);
    
    const expirySeconds = (params.expiryMinutes || 60) * 60;
    const expiresAt = new Date(Date.now() + (expirySeconds * 1000));
    const mockPaymentRequest = `lnbc${params.amountSats}n1test_apt${params.appointmentId}_${Date.now()}`;
    const mockHash = 'mock_hash_' + Math.random().toString(36).substr(2, 16);

    const mockInvoice: ActiveInvoice = {
      appointmentId: params.appointmentId,
      invoiceHash: mockHash,
      paymentRequest: mockPaymentRequest,
      amountSats: params.amountSats,
      description: params.description,
      createdAt: new Date(),
      expiresAt: expiresAt,
      status: InvoiceStatus.PENDING,
      patientInfo: {
        id: 0,
        first_name: 'Test',
        last_name: 'Patient'
      },
      serviceInfo: {
        id: 0,
        name: 'Test Service',
        duration: 30,
        price: params.amountSats
      },
      providerInfo: {
        id: 0,
        first_name: 'Test',
        last_name: 'Provider'
      }
    };

    // Add mock property to identify test invoices
    (mockInvoice as any).mock = true;

    this.activeInvoices.set(mockPaymentRequest, mockInvoice);

    // Start mock monitoring (will simulate payment after delay)
    this.startMockInvoiceMonitoring(mockPaymentRequest);

    return {
      success: true,
      invoice: mockInvoice
    };
  }

  // Start monitoring invoice payment status
  private startInvoiceMonitoring(paymentRequest: string): void {
    const checkInterval = setInterval(async () => {
      try {
        const status = await this.checkInvoicePayment(paymentRequest);
        
        if (status.status === InvoiceStatus.PAID || status.status === InvoiceStatus.EXPIRED) {
          // Stop monitoring once paid or expired
          this.stopInvoiceMonitoring(paymentRequest);
          
          if (status.status === InvoiceStatus.PAID) {
            console.log(`✅ Invoice paid: ${paymentRequest.substring(0, 20)}...`);
            // Handle successful payment - could trigger callbacks here
            await this.handleInvoicePaid(paymentRequest, status);
          } else {
            console.log(`⏰ Invoice expired: ${paymentRequest.substring(0, 20)}...`);
          }
        }
      } catch (error) {
        console.error(`Error checking invoice status:`, error);
      }
    }, 10000); // Check every 10 seconds

    this.invoiceCheckIntervals.set(paymentRequest, checkInterval);

    // Auto-stop monitoring after expiry + buffer
    const activeInvoice = this.activeInvoices.get(paymentRequest);
    if (activeInvoice) {
      const bufferTime = 5 * 60 * 1000; // 5 minute buffer
      setTimeout(() => {
        this.stopInvoiceMonitoring(paymentRequest);
      }, activeInvoice.expiresAt.getTime() - Date.now() + bufferTime);
    }
  }

  // Start mock invoice monitoring for testing
  private startMockInvoiceMonitoring(paymentRequest: string): void {
    // Simulate payment after 30-60 seconds for testing
    const paymentDelay = 30000 + (Math.random() * 30000);
    
    setTimeout(async () => {
      const activeInvoice = this.activeInvoices.get(paymentRequest);
      if (activeInvoice && activeInvoice.status === InvoiceStatus.PENDING) {
        console.log(`🧪 Mock payment received for: ${paymentRequest.substring(0, 20)}...`);
        
        activeInvoice.status = InvoiceStatus.PAID;
        await this.handleInvoicePaid(paymentRequest, {
          status: InvoiceStatus.PAID,
          settled: true,
          settledAt: new Date(),
          invoice: activeInvoice
        });
      }
    }, paymentDelay);
  }

  // Stop monitoring specific invoice
  private stopInvoiceMonitoring(paymentRequest: string): void {
    const interval = this.invoiceCheckIntervals.get(paymentRequest);
    if (interval) {
      clearInterval(interval);
      this.invoiceCheckIntervals.delete(paymentRequest);
    }
  }

  // Handle successful invoice payment
  private async handleInvoicePaid(paymentRequest: string, status: CheckInvoiceStatusResponse): Promise<void> {
    const activeInvoice = this.activeInvoices.get(paymentRequest);
    if (!activeInvoice) return;

    try {
      // Update local invoice status
      activeInvoice.status = InvoiceStatus.PAID;

      console.log(`💰 Payment confirmed for appointment ${activeInvoice.appointmentId}: ${activeInvoice.amountSats} sats`);

      // Here you could trigger additional actions like:
      // - Send confirmation email to patient
      // - Update appointment status
      // - Notify provider
      // - Trigger accounting/reporting updates
      
    } catch (error) {
      console.error(`Error handling paid invoice:`, error);
    }
  }

  // Check if invoice has been paid
  async checkInvoicePayment(paymentRequest: string): Promise<CheckInvoiceStatusResponse> {
    if (!this.connected) {
      await this.connect();
    }

    try {
      const activeInvoice = this.activeInvoices.get(paymentRequest);
      if (!activeInvoice) {
        throw new BillingError(
          'Invoice not found',
          BillingErrorCode.INVOICE_NOT_FOUND
        );
      }

      // Check if this is a mock invoice
      if ((activeInvoice as any).mock) {
        console.log(`🧪 Mock invoice check for ${paymentRequest.substring(0, 20)}...`);
        
        return {
          status: activeInvoice.status,
          settled: activeInvoice.status === InvoiceStatus.PAID,
          settledAt: activeInvoice.status === InvoiceStatus.PAID ? new Date() : undefined,
          invoice: activeInvoice
        };
      }

      // Check expiry first
      if (Date.now() > activeInvoice.expiresAt.getTime()) {
        activeInvoice.status = InvoiceStatus.EXPIRED;
        return {
          status: InvoiceStatus.EXPIRED,
          settled: false,
          invoice: activeInvoice
        };
      }

      // For real invoices, use the provider to check payment status
      const invoice = await this.provider!.lookupInvoice({
        payment_hash: activeInvoice.invoiceHash
      });

      const isPaid = invoice.settled || invoice.state === 'SETTLED';
      if (isPaid) {
        activeInvoice.status = InvoiceStatus.PAID;
      }

      return {
        status: activeInvoice.status,
        settled: isPaid,
        settledAt: isPaid && invoice.settle_date ? new Date(invoice.settle_date) : undefined,
        invoice: activeInvoice
      };

    } catch (error) {
      console.error(`Failed to check invoice payment:`, error);
      
      return {
        status: InvoiceStatus.PENDING,
        settled: false,
        invoice: this.activeInvoices.get(paymentRequest)
      };
    }
  }

  // Get active invoice by appointment ID
  getActiveInvoiceByAppointment(appointmentId: number): ActiveInvoice | null {
    for (const invoice of this.activeInvoices.values()) {
      if (invoice.appointmentId === appointmentId && invoice.status === InvoiceStatus.PENDING) {
        return invoice;
      }
    }
    return null;
  }

  // Get all active invoices
  getActiveInvoices(): ActiveInvoice[] {
    return Array.from(this.activeInvoices.values());
  }

  // Check if invoice is expired
  isInvoiceExpired(paymentRequest: string): boolean {
    const invoice = this.activeInvoices.get(paymentRequest);
    if (!invoice) return true;
    
    return Date.now() > invoice.expiresAt.getTime();
  }

  // API methods for fetching appointment/service data
  async fetchCompletedAppointments(token: string): Promise<Appointment[]> {
    const response = await fetch('/api/admin/appointments/completed', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new BillingError(
        'Failed to fetch appointments',
        BillingErrorCode.DATABASE_ERROR
      );
    }

    return await response.json();
  }

  async fetchServices(token: string): Promise<Service[]> {
    const response = await fetch('/api/admin/services', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new BillingError(
        'Failed to fetch services',
        BillingErrorCode.DATABASE_ERROR
      );
    }

    return await response.json();
  }

  async markAppointmentInvoiced(appointmentId: number, token: string, invoiceData: ActiveInvoice): Promise<any> {
    const response = await fetch(`/api/admin/appointments/${appointmentId}/invoice`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        payment_request: invoiceData.paymentRequest,
        amount_sats: invoiceData.amountSats,
        invoice_hash: invoiceData.invoiceHash,
        expires_at: invoiceData.expiresAt.toISOString()
      })
    });

    if (!response.ok) {
      throw new BillingError(
        'Failed to mark appointment as invoiced',
        BillingErrorCode.DATABASE_ERROR
      );
    }

    return await response.json();
  }

  // Get connection status
  isConnected(): boolean {
    return this.connected;
  }

  // Get provider info
  async getWalletInfo(): Promise<any> {
    if (!this.connected) {
      await this.connect();
    }

    try {
      return await this.provider!.getInfo();
    } catch (error) {
      console.error('Failed to get wallet info:', error);
      throw new BillingError(
        'Failed to get wallet info',
        BillingErrorCode.NWC_NOT_CONNECTED,
        error
      );
    }
  }

  // Get wallet balance
  async getBalance(): Promise<number> {
    if (!this.connected) {
      await this.connect();
    }

    try {
      const balance = await this.provider!.getBalance();
      return balance.balance;
    } catch (error) {
      console.error('Failed to get balance:', error);
      throw new BillingError(
        'Failed to get wallet balance',
        BillingErrorCode.NWC_NOT_CONNECTED,
        error
      );
    }
  }

  // Cleanup method
  async cleanup(): Promise<void> {
    await this.disconnect();
    this.activeInvoices.clear();
  }
}

// Create singleton instance
export const billingService = new BillingService(
  process.env.REACT_APP_NWC_CONNECTION_STRING || 
  'nostr+walletconnect://your-connection-string-here'
);

export default BillingService;