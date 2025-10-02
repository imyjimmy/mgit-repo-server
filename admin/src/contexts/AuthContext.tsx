import { createContext, useContext, useState, ReactNode } from 'react';

interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  pubkey: string | null;
  profile: any | null;
}

interface AuthContextType extends AuthState {
  login: (token: string, pubkey: string, profile: any) => void;
  logout: () => void;
  refreshAuth: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>(() => {
    const token = localStorage.getItem('admin_token');
    const pubkey = localStorage.getItem('admin_pubkey');
    const profile = localStorage.getItem('admin_profile');
    
    return {
      isAuthenticated: !!(token && pubkey),
      token: token,
      pubkey: pubkey,
      profile: profile ? JSON.parse(profile) : null
    };
  });

  const login = (token: string, pubkey: string, profile: any) => {
    localStorage.setItem('admin_token', token);
    localStorage.setItem('admin_pubkey', pubkey);
    localStorage.setItem('admin_profile', JSON.stringify(profile));
    
    setAuthState({
      isAuthenticated: true,
      token,
      pubkey,
      profile
    });
  };

  const logout = () => {
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

  const refreshAuth = () => {
    const token = localStorage.getItem('admin_token');
    const pubkey = localStorage.getItem('admin_pubkey');
    const profile = localStorage.getItem('admin_profile');
    
    setAuthState({
      isAuthenticated: !!(token && pubkey),
      token: token,
      pubkey: pubkey,
      profile: profile ? JSON.parse(profile) : null
    });
  };

  return (
    <AuthContext.Provider value={{ ...authState, login, logout, refreshAuth }}>
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