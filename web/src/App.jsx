import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import TrackPage from './pages/TrackPage';
import AdminLayout from './components/admin/AdminLayout';
import DashboardHome from './pages/admin/DashboardHome';
import SosListPage from './pages/admin/SosListPage';
import SosDetailPage from './pages/admin/SosDetailPage';
import UsersPage from './pages/admin/UsersPage';
import UserDetailPage from './pages/admin/UserDetailPage';
import SettingsPage from './pages/admin/SettingsPage';
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
        <Route element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardHome />} />
          <Route path="/sos" element={<SosListPage />} />
          <Route path="/sos/:alertId" element={<SosDetailPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/users/:userId" element={<UserDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        {/* Guardian WhatsApp links: public, no admin login */}
        <Route path="/track" element={<TrackPage />} />
        <Route path="/track/:alertId" element={<TrackPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
