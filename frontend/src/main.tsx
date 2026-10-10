import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import VerificationPage from './pages/VerificationPage.tsx';
import DashboardPage from './pages/DashboardPage.tsx';
import AppLayout from './components/AppLayout.tsx';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          {/* Verification is the first screen that must exist — nothing
              active works until a target is verified (CLAUDE.md §2.2). */}
          <Route path="/" element={<Navigate to="/settings/verification" replace />} />
          <Route path="/settings/verification" element={<VerificationPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
