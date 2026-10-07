import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import DutyPage from './pages/DutyPage';
import TrackPage from './pages/TrackPage';
import AgentsPage from './pages/AgentsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/duty" element={<DutyPage />} />
        <Route path="/duty/:agentId" element={<DutyPage />} />
        <Route path="/track" element={<TrackPage />} />
        <Route path="/track/:alertId" element={<TrackPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
