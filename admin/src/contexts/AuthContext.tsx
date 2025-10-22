import { createContext, useContext, useState, ReactNode } from 'react';
import { profileService } from '@/services/profile';
import { AuthState } from '@/types/index';

interface AuthContextType extends AuthState {
  completeOnboarding: (section: keyof AuthState['needsOnboarding']) => void;
  setSession: (
    token: string, 
    pubkey: string, 
    profile: any, 
    needsOnboarding?: Partial<AuthState['needsOnboarding']> ) => void;
  logout: () => void;
  refreshAuth: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>(() => {
    const token = localStorage.getItem('admin_token');
    const pubkey = localStorage.getItem('admin_pubkey');
    const profile = localStorage.getItem('admin_profile');
    const onboarding = localStorage.getItem('needs_onboarding');

    console.log('isAuthenticated: ', !!(token));
    return {
      isAuthenticated: !!(token),
      token: token,
      pubkey: pubkey,
      profile: profile ? JSON.parse(profile) : null,
      needsOnboarding: onboarding ? JSON.parse(onboarding) : {
        dashboard: false,
        billing: false,
        services: false,
        telehealth: false,
      }
    };
  });

  const setSession = async (
    token: string, 
    pubkey: string, 
    profile: any, 
    needsOnboarding?: Partial<AuthState['needsOnboarding']>
  ) => {
    const defaultOnboarding = {
      dashboard: false,
      billing: false,
      services: false,
      telehealth: false
    };

    // Fetch profile from existing endpoint
    let finalProfile = profile;
    try {
      const providerProfile = await profileService.getProfile(token);
      finalProfile = providerProfile;
    } catch (error) {
      console.error('Failed to fetch profile:', error);
      // Fall back to whatever profile was passed in
    }

    setAuthState({
      isAuthenticated: true,
      token,
      pubkey,
      profile: finalProfile,
      needsOnboarding: needsOnboarding 
        ? { ...defaultOnboarding, ...needsOnboarding }
        : defaultOnboarding
    });

    localStorage.setItem('admin_token', token);
    localStorage.setItem('admin_pubkey', pubkey);
    localStorage.setItem('admin_profile', JSON.stringify(finalProfile));
    localStorage.setItem('needs_onboarding', JSON.stringify(
      needsOnboarding || defaultOnboarding
    ));
  };

  const completeOnboarding = (section: keyof AuthState['needsOnboarding']) => {
    setAuthState(prev => {
      const updated = {
        ...prev,
        needsOnboarding: {
          ...prev.needsOnboarding,
          [section]: false  // ← Mark this section as completed
        }
      };
      
      // Persist to localStorage
      localStorage.setItem('needs_onboarding', JSON.stringify(updated.needsOnboarding));
      
      return updated;
    });
  };

  const logout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_pubkey');
    localStorage.removeItem('admin_profile');
    
    setAuthState({...authState,
      isAuthenticated: false,
      token: null,
      pubkey: null,
      profile: null
    });
  };

  const refreshAuth = () => {
    const token = localStorage.getItem('admin_token');
    const pubkey = localStorage.getItem('admin_pubkey');
    const profile = localStorage.getItem('admin_profile');
    
    setAuthState({ ...authState,
      isAuthenticated: !!(token && pubkey),
      token: token,
      pubkey: pubkey,
      profile: profile ? JSON.parse(profile) : null,
    });
  };

  return (
    <AuthContext.Provider value={{ ...authState, completeOnboarding, setSession, logout, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}