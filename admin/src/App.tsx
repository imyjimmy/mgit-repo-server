import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import AdminDashboard from '@/pages/AdminDashboard';
import { LandingPage } from '@/pages/LandingPage';
import { LoginPage } from '@/pages/LoginPage';
import { MeetingPage } from '@/pages/MeetingPage';
import { BillingPage } from '@/pages/BillingPage';
import { AuthState } from '@/types';

function AppRoutes() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authState ,setAuthState] = useState<AuthState>({
        isAuthenticated: false,
        token: null,
        pubkey: null,
        profile: null
      });

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    const pubkey = localStorage.getItem('admin_pubkey');
    const profile = localStorage.getItem('admin_profile');

    setIsAuthenticated(!!(token && pubkey));

    if (token && pubkey && profile) {
      // Check if user is registered in database
      // const registrationCheck = await authService.checkUserRegistration(pubkey, token);

      setAuthState({
        isAuthenticated: true,
        token,
        pubkey,
        profile: profile ? JSON.parse(profile) : null
      });
    }
  }, []);

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
    setIsAuthenticated(false)
  };

  return (
    <Router basename="/">
      <Routes>
        <Route
          path="/" 
          element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LandingPage />} 
        />
        <Route
          path="/login" 
          element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage onLogin={() => setIsAuthenticated(true)} />} 
        />
        <Route
          path="/dashboard" 
          element={isAuthenticated ? <AdminDashboard onLogout={handleLogout} /> : <Navigate to="/login" replace />} 
        />
        <Route
          path="/billing"
          element={isAuthenticated ? <BillingPage token={authState.token || ''} /> : <Navigate to="/login" replace />}
        />
        <Route path="/meeting/:roomId" element={<MeetingPage token={authState.token || ''}/>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;