import React, { useState } from 'react';
import { BookingData } from './BookingWorkflow';
import { NostrAuthService } from '../../services/auth';

interface Step4ConfirmationProps {
  data: BookingData;
  onPrev: () => void;
  onUpdate: (updates: Partial<BookingData>) => void;
  onComplete?: (appointmentId: number) => void;
  token: string;
}

const Step4Confirmation: React.FC<Step4ConfirmationProps> = ({
  data,
  onPrev,
  onComplete,
  token
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  console.log('Step4Confirmation render - data:', data);
  console.log('provider:', data.provider);
  console.log('service:', data.service);
  console.log('appointment:', data.appointment);
  console.log('admin:', data.admin);

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Format time for display
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Validation - ensure we have all required data
  if (!data.provider || !data.service || !data.appointment || !data.admin) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-semibold">Incomplete Booking Data</h3>
          <p className="text-red-700">Please complete all previous steps before confirming your appointment.</p>
          <button 
            onClick={onPrev}
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {

      // 2. Create the exact payload to sign
      const bookingPayload = {
        providerId: data.provider?.id,
        serviceId: data.service?.id,
        startTime: data.appointment?.datetime,
        adminInfo: {
          firstName: data.admin?.firstName,
          lastName: data.admin?.lastName,
          email: data.admin?.email,
          phone: data.admin?.phone,
          notes: data.admin?.notes
        }
      };

      console.log('Signing booking payload:', bookingPayload);

      // Use authService's existing signChallenge method
      const bookingContent = JSON.stringify(bookingPayload);
      const signedEvent = await NostrAuthService.signChallenge(bookingContent);

      console.log('Signed event:', signedEvent);

      // 4. Submit to verification endpoint
      const response = await fetch('/api/appointments/verify-booking', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          bookingData: bookingPayload,
          signedEvent
        })
      });

      const result = await response.json();
      
      if (result.status === 'OK') {
        setSuccess(true);
        // Delay before calling onComplete to show success message
        setTimeout(() => {
          onComplete?.(result.appointmentId);
        }, 2000);
      } else {
        throw new Error(result.reason || 'Booking failed');
      }

    } catch (error: any) {
      console.error('Booking error:', error);
      setError(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <div className="text-green-600 text-5xl mb-4">✓</div>
          <h2 className="text-2xl font-bold text-green-800 mb-2">
            Appointment Confirmed!
          </h2>
          <p className="text-green-700">
            Your appointment has been successfully booked and cryptographically verified.
            You should receive a confirmation shortly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="">
      <h2 className="text-2xl font-bold mb-6 text-gray-200">Confirm Your Appointment</h2>
      
      {/* Appointment Summary */}
      <div className="bg-gray-50 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Appointment Details</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Provider
            </label>
            <p className="text-gray-900">{data.provider.name}</p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Service
            </label>
            <p className="text-gray-900">{data.service.name}</p>
            <p className="text-sm text-gray-600">{data.service.duration} minutes</p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Date
            </label>
            <p className="text-gray-900">{formatDate(data.appointment.datetime)}</p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Time
            </label>
            <p className="text-gray-900">{formatTime(data.appointment.datetime)}</p>
          </div>
        </div>
      </div>

      {/* Admin Information */}
      <div className="bg-gray-50 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Admin Information</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              First Name
            </label>
            <p className="text-gray-900">{data.admin.firstName}</p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Last Name
            </label>
            <p className="text-gray-900">{data.admin.lastName}</p>
          </div>
          
          {data.admin.email && (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Email
              </label>
              <p className="text-gray-900">{data.admin.email}</p>
            </div>
          )}
          
          {data.admin.phone && (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Phone
              </label>
              <p className="text-gray-900">{data.admin.phone}</p>
            </div>
          )}
          
          {data.admin.notes && (
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Notes
              </label>
              <p className="text-gray-900">{data.admin.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Security Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-start">
          <div className="text-blue-600 text-xl mr-3">🔐</div>
          <div>
            <h4 className="font-semibold text-blue-800 mb-1">
              Cryptographic Verification Required
            </h4>
            <p className="text-blue-700 text-sm">
              To prevent spam and ensure security, you'll be asked to sign this booking 
              with your Nostr private key. This proves you control the public key provided 
              and creates a tamper-proof record of your appointment request.
            </p>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-start">
            <div className="text-red-600 text-xl mr-3">⚠️</div>
            <div>
              <h4 className="font-semibold text-red-800 mb-1">Booking Error</h4>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {/* <div className="flex gap-4">
        <button
          onClick={onPrev}
          disabled={isSubmitting}
          className="flex-1 px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          Back to Admin Info
        </button>
        
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isSubmitting ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              Creating Appointment...
            </div>
          ) : (
            'Confirm & Book Appointment'
          )}
        </button>
      </div> */}

      <div className="mt-8 flex justify-between">
        <button
          onClick={onPrev}
          className="rounded-md bg-gray-300 dark:bg-gray-600 px-3 py-2 text-sm font-semibold text-gray-900 dark:text-white shadow-sm hover:bg-gray-400 dark:hover:bg-gray-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500"
        >
          {isSubmitting ? ('Creating Appointment...'):('Back: Select Time')}
        </button>
        
        <button
          onClick={handleSubmit}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          Confirm & Book Appointment
        </button>
      </div>
    </div>
  );
};

export { Step4Confirmation };