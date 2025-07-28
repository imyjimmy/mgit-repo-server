import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { WebRTCTest } from './components/WebRTCTest';
import { authService } from './services/auth';
import { AuthState } from './types';

const App: React.FC = () => {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    token: null,
    pubkey: null,
    profile: null
  });
  
  useEffect(() => {
    // Check for existing auth in localStorage
    const token = localStorage.getItem('admin_token');
    const pubkey = localStorage.getItem('admin_pubkey');
    const profile = localStorage.getItem('admin_profile');
    
    if (token && pubkey) {
      setAuthState({
        isAuthenticated: true,
        token,
        pubkey,
        profile: profile ? JSON.parse(profile) : null
      });
    }
  }, []);
  
  const handleLogin = async () => {
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
  
  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        isAuthenticated={authState.isAuthenticated}
        profile={authState.profile}
        onLogin={handleLogin}
        onLogout={handleLogout}
      />
      
      <div className="max-w-6xl mx-auto px-6">
        {authState.isAuthenticated && authState.token ? (
          <WebRTCTest token={authState.token} />
        ) : (
          <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200 text-center">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">Administrator Login</h2>
            <p className="text-gray-600 mb-6">Use your Nostr keys to authenticate as the server administrator.</p>
            <p className="text-sm text-gray-500">Please click "Login with Nostr" in the header to continue.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;