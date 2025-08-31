import React, { useState, useEffect } from 'react';
// import { Header } from '../components/Header';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/dashboard/AppSidebar';
import { Card } from '@/components/ui/card';
import { SiteHeader } from '@/components/SiteHeader';

import { WebRTCTest } from '../components/WebRTCTest';
import { AppointmentsTab } from '../components/AppointmentsTab';
import { DatabaseTest } from '../components/DatabaseTest';
import { RegistrationView } from '../components/RegistrationView';
import { ServicesManager } from '../components/ServicesManager';

import { MedicalRepos } from '@/components/MedicalRepos'
import { authService } from '../services/auth';
import { AuthState, UserInfo } from '../types';

const PatientDashboard: React.FC = () => {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    token: null,
    pubkey: null,
    profile: null
  });
  
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [needsRegistration, setNeedsRegistration] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState('webrtc');
  
  useEffect(() => {
    checkExistingAuth();
  }, []);
  
  const checkExistingAuth = async () => {
    setLoading(true);
    try {
      // Check for existing auth in localStorage
      const token = localStorage.getItem('patient_token');
      const pubkey = localStorage.getItem('patient_pubkey');
      const profile = localStorage.getItem('patient_profile');
      
      if (token && pubkey) {
        // Check if user is registered in database
        const registrationCheck = await authService.checkUserRegistration(pubkey, token);
        
        setAuthState({
          isAuthenticated: true,
          token,
          pubkey,
          profile: profile ? JSON.parse(profile) : null
        });
        
        if (registrationCheck.isRegistered) {
          setUserInfo(registrationCheck.user || null);
          setNeedsRegistration(false);
        } else {
          setNeedsRegistration(true);
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      // Clear invalid auth
      localStorage.removeItem('patient_token');
      localStorage.removeItem('patient_pubkey');
      localStorage.removeItem('patient_profile');
    } finally {
      setLoading(false);
    }
  };
  
  const handleLogin = async () => {
    try {
      const { token, pubkey, metadata } = await authService.login();
      
      // Store credentials
      localStorage.setItem('patient_token', token);
      localStorage.setItem('patient_pubkey', pubkey);
      localStorage.setItem('patient_profile', JSON.stringify(metadata));
      
      setAuthState({
        isAuthenticated: true,
        token,
        pubkey,
        profile: metadata
      });

      // Check if user is registered
      const registrationCheck = await authService.checkUserRegistration(pubkey, token);
      
      if (registrationCheck.isRegistered) {
        setUserInfo(registrationCheck.user || null);
        setNeedsRegistration(false);
      } else {
        setNeedsRegistration(true);
      }
    } catch (error) {
      console.error('Login failed:', error);
    }
  };
  
  const handleLogout = () => {
    localStorage.removeItem('patient_token');
    localStorage.removeItem('patient_pubkey');
    localStorage.removeItem('patient_profile');
    
    setAuthState({
      isAuthenticated: false,
      token: null,
      pubkey: null,
      profile: null
    });
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
        <div>{userInfo?.nostr_pubkey}</div>
      </div>
    );
  }

  if (!authState.isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="bg-gray-800 rounded-xl p-8 shadow-xl border border-gray-700 max-w-md w-full mx-4">
      <div className="text-center mb-6">
      <h1 className="text-2xl font-bold text-white mb-2">🏥 MGit patient</h1>
      <p className="text-gray-400">Medical Repository Server patientistration</p>
      </div>
      
      <div className="text-center">
      <h2 className="text-xl font-semibold text-white mb-4">patient Login</h2>
      <p className="text-gray-400 mb-6">Use your Nostr keys to authenticate as the server patient.</p>
      <button 
      onClick={handleLogin}
      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
      >
      Login with Nostr
      </button>
      </div>
      </div>
      </div>
    );
  }

  if (needsRegistration) {
    return (
      <RegistrationView 
        pubkey={authState.pubkey || ''} 
        onRegistrationComplete={() => {
          setNeedsRegistration(false);
          checkExistingAuth(); // Recheck after registration
        }}
      />
    );
  }
  
  return (
    <SidebarProvider
      style={{
        "--sidebar-width": "16rem",
        "--header-height": "3rem",
      } as React.CSSProperties}
    >
      <AppSidebar 
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />
      <SidebarInset>
        <SiteHeader 
          authState={authState}
          onLogin={handleLogin}
          onLogout={handleLogout}
          activeSection={activeSection}
        />
        
        <div className="flex-1 overflow-auto p-6">
          {activeSection === 'webrtc' && authState.token && (
            <WebRTCTest token={authState.token} />
          )}
          {activeSection === 'appointment' && authState.token && (
            <AppointmentsTab token={authState.token} />
          )}
          {activeSection === 'settings' && (
            <Card className="p-6">
              <h3 className="text-xl font-semibold mb-4">Settings</h3>
              <div className="text-muted-foreground">
                <p>Server is running normally</p>
                <p className="text-sm mt-2">Additional system information would go here...</p>
              </div>
            </Card>
          )}
          {activeSection === 'database' && <DatabaseTest />}
          {activeSection === 'services' && <ServicesManager />}
          {activeSection === 'repositories' && authState.token && (
            <MedicalRepos token={authState.token} />
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default PatientDashboard