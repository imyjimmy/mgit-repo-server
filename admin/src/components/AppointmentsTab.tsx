import React, { useState } from 'react';
import { ProviderRegistrationForm, ProviderFormData } from './ProviderRegistration';

interface ApptProps {
  token: string;
}

export const AppointmentsTab: React.FC<ApptProps> = ({ token }) => {
  const [showRegistration, setShowRegistration] = useState<boolean>(false);

  async function handleDashboardClick(e: React.MouseEvent<HTMLButtonElement>): Promise<void> {    
    e.preventDefault();
    // Direct navigation - no API call needed
    window.location.href = `http://localhost:8080/index.php/providers_nostr/direct_login?token=${token}`;
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
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
        >
        Open Provider Dashboard
        </button>
        
        <p className="text-gray-400 text-sm mt-2">
          Opens the full EasyAppointments provider interface
        </p>
      </div>
    </div>
  );
};