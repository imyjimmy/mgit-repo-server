import React, { useState } from 'react';

interface DashboardLoginResponse {
  success: boolean;
  loginUrl?: string;
  error?: string;
  message?: string;
}

interface ApptProps {
  token: string;
}

export const AppointmentsTab: React.FC<ApptProps> = ({ token }) => {
  const [loading, setLoading] = useState<boolean>(false);

  async function handleDashboardClick(e: React.MouseEvent<HTMLButtonElement>): Promise<void> {
    e.preventDefault();
    setLoading(true);
    
    try {
      // const token = localStorage.getItem('authToken');
      const response = await fetch('/api/appointments/dashboard-login', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const result: DashboardLoginResponse = await response.json();
      
      if (result.success && result.loginUrl) {
        // Open the auto-login URL
        window.location.href = result.loginUrl;
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

  return (
    <div className="appointments-tab">
      <h2>Provider Dashboard</h2>
      
      <div className="dashboard-access">
        <p>Access your full appointment management dashboard:</p>
        
        <button 
          onClick={handleDashboardClick}
          disabled={loading}
          className="dashboard-btn"
        >
          {loading ? 'Opening Dashboard...' : 'Open Provider Dashboard'}
        </button>
        
        <p className="dashboard-info">
          <small>Opens the full EasyAppointments provider interface</small>
        </p>
      </div>
    </div>
  );
}