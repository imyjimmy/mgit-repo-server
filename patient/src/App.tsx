import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import PatientDashboard from './pages/PatientDashboard';
import BookingPage from './pages/BookingPage';

function AppRoutes() {
  return (
    <Router basename="/patient">
      <Routes>
        <Route path="/" element={<PatientDashboard />} />
        <Route path="/booking" element={<BookingPage />} />
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