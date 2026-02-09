import React from "react";
import { BookOpen, ClipboardList, Users, BarChart3 } from "lucide-react";

interface HomePageProps {
  user: { username: string; email?: string; roles?: string[] } | null;
}

export default function HomePage({ user }: HomePageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100">
      {/* Hero Section */}
      <section className="relative min-h-[70vh] flex items-center justify-center bg-gradient-to-b from-indigo-50 to-white py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6">
            Welcome to IDCS
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Streamline your academic management with our comprehensive Education
            Resource Planning system
          </p>
          {user ? (
            <div className="bg-white rounded-lg shadow-md p-6 max-w-md mx-auto">
              <p className="text-lg text-gray-700 mb-2">
                Hello, <strong className="text-blue-600">{user.username}</strong>!
              </p>
              {user.roles && user.roles.length > 0 && (
                <p className="text-sm text-gray-500">
                  Role: <span className="font-semibold text-indigo-600">{user.roles.join(", ")}</span>
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <a
                href="/login"
                className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105"
              >
                Get Started
              </a>
              <a
                href="#features"
                className="px-8 py-3 bg-white text-blue-600 border-2 border-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition-all duration-200"
              >
                Learn More
              </a>
            </div>
          )}
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center text-gray-900 mb-12">
            Key Features
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Academic Management Card */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 shadow-md hover:shadow-xl transition-all duration-300 transform hover:scale-105">
              <div className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center mb-4">
                <BookOpen className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Academic Management
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Manage courses, subjects, and teaching assignments efficiently
              </p>
            </div>

            {/* Attendance Tracking Card */}
            <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-6 shadow-md hover:shadow-xl transition-all duration-300 transform hover:scale-105">
              <div className="w-14 h-14 bg-emerald-600 rounded-full flex items-center justify-center mb-4">
                <ClipboardList className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Attendance Tracking
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Track and monitor student attendance with ease
              </p>
            </div>

            {/* User Management Card */}
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 shadow-md hover:shadow-xl transition-all duration-300 transform hover:scale-105">
              <div className="w-14 h-14 bg-purple-600 rounded-full flex items-center justify-center mb-4">
                <Users className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                User Management
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Role-based access control for students, staff, and
                administrators
              </p>
            </div>

            {/* Reports & Analytics Card */}
            <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-6 shadow-md hover:shadow-xl transition-all duration-300 transform hover:scale-105">
              <div className="w-14 h-14 bg-orange-600 rounded-full flex items-center justify-center mb-4">
                <BarChart3 className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Reports & Analytics
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Generate comprehensive reports and track performance metrics
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Info Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-indigo-100 to-purple-100">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-8 sm:p-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6">
              Built for Modern Education
            </h2>
            <p className="text-lg text-gray-600 mb-8 leading-relaxed">
              Our ERP system is designed to handle the complexities of modern
              educational institutions. From student enrollment to faculty
              management, we've got you covered.
            </p>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <span className="text-green-600 text-xl font-bold">✓</span>
                <span className="text-gray-700">Secure authentication with JWT</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-600 text-xl font-bold">✓</span>
                <span className="text-gray-700">Role-based permissions</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-600 text-xl font-bold">✓</span>
                <span className="text-gray-700">Real-time data synchronization</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-600 text-xl font-bold">✓</span>
                <span className="text-gray-700">Responsive design for all devices</span>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}