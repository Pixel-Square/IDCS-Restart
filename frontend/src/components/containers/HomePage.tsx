import React from "react";
import { BookOpen, ClipboardList, Users, BarChart3 } from "lucide-react";

interface HomePageProps {
  user: { username: string; email?: string; roles?: string[] } | null;
}

export default function HomePage({ user }: HomePageProps) {
  return (
    <div className="fixed inset-0 overflow-hidden bg-gradient-to-br from-blue-50 to-slate-100">
      {/* Hero Section */}
      <section className="relative h-full flex items-center justify-center bg-gradient-to-b from-indigo-50 to-white py-0 px-4 sm:px-6 lg:px-8">
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
            </div>
          )}
        </div>
      </section>

      {/* Features and Info sections removed per request */}
    </div>
  );
}
