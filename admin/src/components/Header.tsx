import React, { useEffect, useState } from 'react';
import { NostrProfile } from '../types';

interface HeaderProps {
  isAuthenticated: boolean;
  profile: NostrProfile | null;
  onLogin: () => Promise<void>;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({ isAuthenticated, profile, onLogin, onLogout }) => {
  const [isLoading, setIsLoading] = useState(false);
  
  const handleLogin = async () => {
    setIsLoading(true);
    try {
      await onLogin();
    } catch (error) {
      console.error('Login failed:', error);
      alert(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  const displayName = profile?.display_name || profile?.name || 'Administrator';
  
  const getInitials = (name: string) => {
    if (!name) return 'A';
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };
  
  const ProfilePicture = () => {
    if (profile?.picture) {
      return (
        <img
          className="admin-profile-pic"
          src={profile.picture}
          alt="Admin Profile"
          onError={(e) => {
            // Fallback to initials if image fails to load
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            target.nextElementSibling?.classList.remove('hidden');
          }}
        />
      );
    }
    
    return (
      <div className="admin-initials">
        {getInitials(displayName)}
      </div>
    );
  };
  
  return (
    <header className="bg-white shadow-sm border-b border-gray-200 mb-8">
      <div className="max-w-6xl mx-auto px-6 py-4">
        <div className="flex justify-between items-center">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">🏥 MGit Admin Dashboard</h1>
            <p className="text-gray-600">Medical Repository Server Administration</p>
          </div>
          
          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              <div className="admin-profile-container">
                <ProfilePicture />
              </div>
              <span className="font-medium text-gray-700">{displayName}</span>
              <button
                onClick={onLogout}
                className="btn btn-secondary"
              >
                Logout
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogin}
              disabled={isLoading}
              className="btn btn-primary"
            >
              {isLoading ? 'Connecting...' : 'Login with Nostr'}
            </button>
          )}
        </div>
      </div>
    </header>
  );
};