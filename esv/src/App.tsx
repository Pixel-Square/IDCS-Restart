import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import CodeEntryPage from './pages/CodeEntryPage';
import MarkEntryPage from './pages/MarkEntryPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<CodeEntryPage />} />
      <Route path="/mark-entry" element={<MarkEntryPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
