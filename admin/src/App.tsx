import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AdminDashboard from '@/pages/AdminDashboard';
import { LandingPage } from '@/pages/LandingPage';
import { LoginPage } from '@/pages/LoginPage';
import { MeetingPage } from '@/pages/MeetingPage';
import { BillingPage } from '@/pages/BillingPage';
import { EditProfile } from '@/pages/EditProfile';
import { PublicProfile } from '@/pages/PublicProfile';
import { BookAppointment } from '@/pages/BookAppointment';

function AppRoutes() {
  const { isAuthenticated, token, logout } = useAuth();

  return (
    <Router basename="/">
      <Routes>
        <Route
          path="/" 
          element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LandingPage />} 
        />
        <Route
          path="/login" 
          element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />} 
        />
        <Route
          path="/dashboard" 
          element={isAuthenticated ? <AdminDashboard onLogout={logout} /> : <Navigate to="/login" replace />} 
        />
        <Route
          path="/billing"
          element={isAuthenticated && token ? <BillingPage token={token} /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/edit-profile"
          element={isAuthenticated && token  ? <EditProfile token={token} /> : <Navigate to="/login" replace />}
        />
        <Route path="/meeting/:roomId" element={isAuthenticated && token  ? <MeetingPage token={token}/> : <Navigate to="/login" replace />} />
        {/* Public profile route - must be last to avoid matching other routes */}
        <Route 
          path='/providers/:username'
          element={<PublicProfile />}
        />
        <Route 
          path='/providers/:username/book'
          element={<BookAppointment />}
        />
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