import React, { useState } from 'react';
import { ProviderRegistrationForm, ProviderFormData } from './ProviderRegistration';

interface ApptProps {
  token: string;
}

/**
 * Integrate Physician with EasyAppointments
 * EasyAppointments containers created!

  🌐 EasyAppointments services available at:
    - Nginx (main app): http://localhost:8080
    - PHPMyAdmin: http://localhost:8081
    - Swagger UI: http://localhost:8082
    - Baikal CalDAV: http://localhost:8083
    - phpLDAPadmin: http://localhost:8084
    - Mailpit: http://localhost:8025
    - MySQL: localhost:3306
  ✅ Deployment complete!
  🌐 MGit server available at: http://localhost:3003 

  Go to main app (8080) and add an admin (physician)
  go to PHPMyAdmi (8081) and add the hex version of your nostr pubkey to nostr_pubkey field under users

  Then Open Provider Dashboard
 *
 */


export const AppointmentsTab: React.FC<ApptProps> = ({ token }) => {
  const [showRegistration, setShowRegistration] = useState<boolean>(false);

  async function handleDashboardClick(e: React.MouseEvent<HTMLButtonElement>): Promise<void> {    
    e.preventDefault();
    // Direct navigation - no API call needed
    window.location.href = `https://plebemr.com:8082/index.php/providers_nostr/direct_login?token=${token}`;
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