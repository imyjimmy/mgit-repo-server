import React, { useState, useEffect } from 'react';
import { Header } from '../components/Header';
import { WebRTCTest } from '../components/WebRTCTest';
import { AppointmentsTab } from '../components/AppointmentsTab';
import { DatabaseTest } from '../components/DatabaseTest';
import { RegistrationView } from '../components/RegistrationView';
import { ServicesManager } from '../components/ServicesManager';

import { authService } from '../services/auth';
import { AuthState, UserInfo } from '../types';

const AdminDashboard: React.FC = () => {
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
      const token = localStorage.getItem('admin_token');
      const pubkey = localStorage.getItem('admin_pubkey');
      const profile = localStorage.getItem('admin_profile');
      
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
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_pubkey');
      localStorage.removeItem('admin_profile');
    } finally {
      setLoading(false);
    }
  };
  
  const handleLogin = async () => {
    try {
      const { token, pubkey, metadata } = await authService.login();
      
      // Store credentials
      localStorage.setItem('admin_token', token);
      localStorage.setItem('admin_pubkey', pubkey);
      localStorage.setItem('admin_profile', JSON.stringify(metadata));
      
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
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_pubkey');
    localStorage.removeItem('admin_profile');
    
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
      <h1 className="text-2xl font-bold text-white mb-2">🏥 MGit Admin</h1>
      <p className="text-gray-400">Medical Repository Server Administration</p>
      </div>
      
      <div className="text-center">
      <h2 className="text-xl font-semibold text-white mb-4">Administrator Login</h2>
      <p className="text-gray-400 mb-6">Use your Nostr keys to authenticate as the server administrator.</p>
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
    <div className="flex h-screen bg-gray-900">
    {/* Sidebar */}
    <div className={`${sidebarCollapsed ? "w-16" : "w-64"} bg-gray-800 border-r border-gray-700 transition-all duration-300 fixed md:relative z-50 h-full`}>
    <div className="p-4">
    <div className="flex items-center justify-between mb-8">
    <div className={`${sidebarCollapsed ? "hidden" : "block"}`}>
    <h1 className="text-blue-400 font-bold text-lg">MGit Admin</h1>
    <p className="text-gray-500 text-xs">Server Dashboard</p>
    </div>
    <button
    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
    className="text-gray-400 hover:text-blue-400 p-1 rounded"
    >
    <svg 
    className={`w-4 h-4 transition-transform ${sidebarCollapsed ? "" : "rotate-180"}`}
    fill="none" 
    stroke="currentColor" 
    viewBox="0 0 24 24"
    >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
    </button>
    </div>
    {/* <div className="flex items-start justify-between mb-8">
      <div className={`${sidebarCollapsed ? "hidden" : "block"}`}>
      <h1 className="text-blue-400 font-bold text-lg">MGit Admin</h1>
      <p className="text-gray-500 text-xs">Server Dashboard</p>
      </div>
      <button
      onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
      className="text-gray-400 hover:text-blue-400 p-1 rounded mt-1"
      >
      <svg 
      className={`w-4 h-4 transition-transform ${sidebarCollapsed ? "" : "rotate-180"}`}
      fill="none" 
      stroke="currentColor" 
      viewBox="0 0 24 24"
      >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
      </button>
      </div> */}
      
      <nav className="space-y-2">
      {[
        { 
          id: "appointment", 
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" className="size-6">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
            
          ), 
          label: "Appointment" 
        },
        { 
          id: "webrtc", 
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" className="size-6">
              <path stroke-linecap="round" stroke-linejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          ), 
          label: "Telehealth" 
        },
        { 
          id: "settings", 
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          ), 
          label: "Settings" 
        },
        { 
          id: "database", 
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          ), 
          label: "Database" 
        },
        { 
          id: "services", 
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          ), 
          label: "Services" 
        },
      ].map((item) => (
        <button
        key={item.id}
        onClick={() => setActiveSection(item.id)}
        className={`w-full flex items-center gap-3 p-2 rounded transition-colors ${
          activeSection === item.id
          ? "bg-blue-600 text-white"
          : "text-gray-400 hover:text-white hover:bg-gray-700"
        }`}
        >
        {item.icon}
        {!sidebarCollapsed && <span className="text-sm font-medium">{item.label}</span>}
        </button>
      ))}
      </nav>
      
      {!sidebarCollapsed && (
        <div className="mt-8 p-4 bg-gray-700 border border-gray-600 rounded">
        <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 bg-green-400 rounded-full"></div>
        <span className="text-xs text-white">SERVER ONLINE</span>
        </div>
        <div className="text-xs text-gray-400">
        <div>Status: Running</div>
        <div>Port: 3003</div>
        </div>
        </div>
      )}
      </div>
      </div>
      
      {/* Mobile Overlay */}
      {!sidebarCollapsed && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarCollapsed(true)} />
      )}
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
      {/* Thinner Top Toolbar */}
      <div className="h-12 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
      <div className="text-sm text-gray-400">
      ADMIN / <span className="text-blue-400 uppercase">{activeSection}</span>
      </div>
      </div>
      
      <Header
      isAuthenticated={authState.isAuthenticated}
      profile={authState.profile}
      onLogin={handleLogin}
      onLogout={handleLogout}
      compact={true}
      />
      </div>
      
      {/* Dashboard Content */}
      <div className="flex-1 overflow-auto bg-gray-900 p-6">
      {activeSection === 'webrtc' && authState.token && (
        <WebRTCTest token={authState.token} />
      )}
      {activeSection === 'appointment' && authState.token && (
        <AppointmentsTab token={authState.token} />
      )}
      {activeSection === 'settings' && (
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-xl font-semibold text-white mb-4">Settings</h3>
        <div className="text-gray-400">
        <p>Server is running normally</p>
        <p className="text-sm mt-2">Additional system information would go here...</p>
        </div>
        </div>
      )}
      {activeSection === 'database' && <DatabaseTest />}
      {activeSection === 'services' && <ServicesManager />}
      </div>
      </div>
      </div>
    );
};

export default AdminDashboard