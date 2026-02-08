import React from 'react';
import { User } from 'lucide-react';
import '../pages/Dashboard.css';

export default function DashboardEntryPoints() {
  // Minimal dashboard: only a welcome message for all users.
  return (
    <section className="db-content">
      <div className="welcome">
        <div className="welcome-left">
          <User className="welcome-icon" />
          <div>
            <h1 className="welcome-title">Welcome back</h1>
            <p className="welcome-sub">Welcome to the dashboard.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
