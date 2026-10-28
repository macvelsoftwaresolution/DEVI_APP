import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import TrackPage from './pages/TrackPage';
import { getAdminToken } from './config/api';

// Admin-only pages: send to login when there is no admin session
function RequireAdmin({ children }) {
  return getAdminToken() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireAdmin><DashboardPage /></RequireAdmin>} />
        <Route path="/dashboard" element={<RequireAdmin><DashboardPage /></RequireAdmin>} />
        {/* Guardian WhatsApp links: public, no admin login */}
        <Route path="/track" element={<TrackPage />} />
        <Route path="/track/:alertId" element={<TrackPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
