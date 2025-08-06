import React, { useState } from 'react';
import { ProviderRegistrationForm, ProviderFormData } from './ProviderRegistration';

interface ApptProps {
  token: string;
}

interface DashboardLoginResponse {
  success: boolean;
  loginUrl?: string;
  error?: string;
  message?: string;
}

export const AppointmentsTab: React.FC<ApptProps> = ({ token }) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [showRegistration, setShowRegistration] = useState<boolean>(false);

  async function handleDashboardClick(e: React.MouseEvent<HTMLButtonElement>): Promise<void> {
    e.preventDefault();
    setLoading(true);
    
    try {
      const response = await fetch('/api/appointments/dashboard-login', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const result: DashboardLoginResponse = await response.json();
      
      if (result.success && result.loginUrl) {
        window.location.href = result.loginUrl;
      } else if (response.status === 403) {
        // Not registered as provider
        setShowRegistration(true);
      } else {
        alert(result.error || 'Failed to access dashboard');
      }
    } catch (error) {
      console.error('Dashboard access failed:', error);
      alert('Failed to access dashboard');
    } finally {
      setLoading(false);
    }
  }

  async function handleProviderRegistration(formData: ProviderFormData): Promise<void> {
    try {
      const response = await fetch('/api/appointments/register-provider', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      const result = await response.json();
      
      if (result.success) {
        alert('Successfully registered as provider!');
        setShowRegistration(false);
        // After successful registration, they can click the button again to access dashboard
      } else {
        alert(result.error || 'Registration failed');
      }
    } catch (error) {
      console.error('Registration failed:', error);
      alert('Registration failed');
    }
  }

  if (showRegistration) {
    return <ProviderRegistrationForm onSubmit={handleProviderRegistration} />;
  }

  return (
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
      <h3 className="text-xl font-semibent text-white mb-4">Provider Dashboard</h3>
      
      <div className="dashboard-access">
        <p className="text-gray-300 mb-4">Access your full appointment management dashboard:</p>
        
        <button 
          onClick={handleDashboardClick}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
        >
          {loading ? 'Opening Dashboard...' : 'Open Provider Dashboard'}
        </button>
        
        <p className="text-gray-400 text-sm mt-2">
          Opens the full EasyAppointments provider interface
        </p>
      </div>
    </div>
  );
};