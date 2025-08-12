import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  profile: any;
}

interface AuthContextType {
  authState: AuthState;
  handleLogin: () => void;
  handleLogout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState] = useState<AuthState>({
    isAuthenticated: false,
    token: null,
    profile: null,
  });

  // Move your existing auth logic here from the original App.tsx
  const handleLogin = () => {
    // Your existing login logic
  };

  const handleLogout = () => {
    // Your existing logout logic
  };

  useEffect(() => {
    // Your existing auth check logic
  }, []);

  return (
    <AuthContext.Provider value={{ authState, handleLogin, handleLogout }}>
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