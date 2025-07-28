import React, { useState } from 'react';
import { NostrProfile } from '../types';

interface HeaderProps {
  isAuthenticated: boolean;
  profile: NostrProfile | null;
  onLogin: () => Promise<void>;
  onLogout: () => void;
  compact?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ 
  isAuthenticated, 
  profile, 
  onLogin, 
  onLogout, 
  compact = true 
}) => {
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
          className={`${compact ? 'w-6 h-6' : 'w-8 h-8'} rounded-full object-cover`}
          src={profile.picture}
          alt="Admin Profile"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            target.nextElementSibling?.classList.remove('hidden');
          }}
        />
      );
    }
    
    return (
      <div className={`${compact ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm'} rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white flex items-center justify-center font-semibold`}>
        {getInitials(displayName)}
      </div>
    );
  };
  
  return (
    <div className="flex items-center gap-2 justify-end m-4">
      {isAuthenticated ? (
        <>
          <ProfilePicture />
          <span className="text-sm text-gray-300 hidden sm:inline">{displayName}</span>
          <button
            onClick={onLogout}
            className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded transition-colors"
          >
            Logout
          </button>
        </>
      ) : (
        <button
          onClick={handleLogin}
          disabled={isLoading}
          className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded transition-colors"
        >
          {isLoading ? 'Connecting...' : 'Login'}
        </button>
      )}
    </div>
  );
};