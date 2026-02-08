import React from "react";
import { BookOpen, ClipboardList, Users, BarChart3 } from "lucide-react";
import "./HomePage.css";

interface HomePageProps {
  user: { username: string; email?: string; roles?: string[] } | null;
}

export default function HomePage({ user }: HomePageProps) {
  return (
    <div className="homepage">
      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">Welcome to IDCS</h1>
          <p className="hero-subtitle">
            Streamline your academic management with our comprehensive Education
            Resource Planning system
          </p>
          {user ? (
            <div className="hero-user-info">
              <p className="welcome-text">
                Hello, <strong>{user.username}</strong>!
              </p>
              {user.roles && user.roles.length > 0 && (
                <p className="role-text">Role: {user.roles.join(", ")}</p>
              )}
            </div>
          ) : (
            <div className="hero-actions">
              <a href="/login" className="cta-button primary">
                Get Started
              </a>
              <a href="#features" className="cta-button secondary">
                Learn More
              </a>
            </div>
          )}
        </div>
      </section>

      <section id="features" className="features-section">
        <div className="features-container">
          <h2 className="section-title">Key Features</h2>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                  />
                </svg>
              </div>
              <h3 className="feature-title">Academic Management</h3>
              <p className="feature-description">
                Manage courses, subjects, and teaching assignments efficiently
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
                  />
                </svg>
              </div>
              <h3 className="feature-title">Attendance Tracking</h3>
              <p className="feature-description">
                Track and monitor student attendance with ease
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
                  />
                </svg>
              </div>
              <h3 className="feature-title">User Management</h3>
              <p className="feature-description">
                Role-based access control for students, staff, and
                administrators
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                  />
                </svg>
              </div>
              <h3 className="feature-title">Reports & Analytics</h3>
              <p className="feature-description">
                Generate comprehensive reports and track performance metrics
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="info-section">
        <div className="info-container">
          <div className="info-content">
            <h2 className="info-title">Built for Modern Education</h2>
            <p className="info-text">
              Our ERP system is designed to handle the complexities of modern
              educational institutions. From student enrollment to faculty
              management, we've got you covered.
            </p>
            <ul className="info-list">
              <li>✓ Secure authentication with JWT</li>
              <li>✓ Role-based permissions</li>
              <li>✓ Real-time data synchronization</li>
              <li>✓ Responsive design for all devices</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}