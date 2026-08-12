import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Lock, Eye, EyeOff, AlertCircle } from "lucide-react";
import { loginSuperAdmin } from "../../services/auth";
import Navbar from "../../components/navigation/Navbar";

export default function SuperAdminLogin() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function extractServerMessage(err: unknown): string | null {
    if (typeof err !== "object" || err === null) return null;
    const e = err as Record<string, unknown>;
    const response = e.response as Record<string, unknown> | undefined;
    if (!response) return null;
    const data = response.data as Record<string, unknown> | undefined;
    if (!data) return null;
    const nonField = data.non_field_errors as unknown;
    if (Array.isArray(nonField) && nonField.length > 0)
      return String(nonField[0]);
    if (typeof data.detail === "string") return data.detail;
    return null;
  }

  function extractNetworkMessage(err: unknown): string | null {
    if (typeof err !== "object" || err === null) return null;
    const e = err as Record<string, any>;
    const code = String(e.code || "");
    if (code === "ECONNABORTED") return "Login request timed out. Please check server connectivity and try again.";
    if (!e.response && typeof e.message === "string" && e.message.toLowerCase().includes("network")) {
      return "Network error while contacting server. Please check the API URL and network.";
    }
    return null;
  }

  const handleSubmitCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await loginSuperAdmin("admin@example.com", password);
      // Normal user: proceed directly to dashboard, app logic handles super admin status
      window.location.href = "/dashboard";
    } catch (err) {
      const serverMsg = extractServerMessage(err) || extractNetworkMessage(err) || "Login failed";
      setError(serverMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Navbar user={null} />
      <div className="min-h-screen bg-gradient-to-br from-purple-900 to-indigo-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-2xl shadow-xl p-8 sm:p-10 border-t-4 border-purple-500">
            {/* Header */}
            <div className="mb-8 text-center">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">
                Super Admin Access
              </h2>
              <p className="text-gray-600">
                Authorized personnel only
              </p>
            </div>

            <form className="space-y-6" onSubmit={handleSubmitCredentials}>
              {/* Password Field */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    className="block w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    placeholder="Enter super admin password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                className="w-full bg-purple-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Authenticating...
                  </span>
                ) : (
                  "Access System"
                )}
              </button>
            </form>

            {/* Back to Home Link */}
            <div className="text-center pt-6">
              <Link
                to="/"
                className="text-sm text-gray-500 hover:text-gray-900 font-medium transition-colors"
              >
                ← Back to Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
