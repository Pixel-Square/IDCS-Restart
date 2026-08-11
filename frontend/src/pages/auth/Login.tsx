import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, AlertCircle, Building2, Search, ChevronRight } from "lucide-react";
import { getMe, impersonateLogin, login } from "../../services/auth";
import { searchColleges, type CollegeOption } from "../../services/institutions";
import Navbar from "../../components/navigation/Navbar";

const COLLEGE_ID_KEY = "selectedCollegeId";
const COLLEGE_NAME_KEY = "selectedCollegeName";
const COLLEGE_CODE_KEY = "selectedCollegeCode";

function loadStoredCollege(): CollegeOption | null {
  try {
    const id = localStorage.getItem(COLLEGE_ID_KEY);
    const name = localStorage.getItem(COLLEGE_NAME_KEY);
    if (!id || !name) return null;
    return { id: Number(id), name, code: localStorage.getItem(COLLEGE_CODE_KEY) || "" };
  } catch {
    return null;
  }
}

export default function Login() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [selectedCollege, setSelectedCollege] = useState<CollegeOption | null>(() => loadStoredCollege());
  const [stage, setStage] = useState<"institution" | "credentials" | "choice" | "impersonate">(() =>
    loadStoredCollege() ? "credentials" : "institution"
  );
  const [institutionQuery, setInstitutionQuery] = useState("");
  const [institutionResults, setInstitutionResults] = useState<CollegeOption[]>([]);
  const [institutionLoading, setInstitutionLoading] = useState(false);
  const [institutionError, setInstitutionError] = useState<string | null>(null);
  const [me, setMe] = useState<any | null>(null);
  const [targetIdentifier, setTargetIdentifier] = useState("");
  const [reason, setReason] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Debounced institution lookup. Requires 3+ characters before querying.
  useEffect(() => {
    const q = institutionQuery.trim();
    if (q.length < 3) {
      setInstitutionResults([]);
      setInstitutionError(null);
      setInstitutionLoading(false);
      return;
    }
    let cancelled = false;
    setInstitutionLoading(true);
    setInstitutionError(null);
    const handle = setTimeout(async () => {
      try {
        const results = await searchColleges(q);
        if (cancelled) return;
        setInstitutionResults(results);
        setInstitutionError(
          results.length === 0 ? `We couldn't find "${q}" in our records. Check the spelling and try again.` : null
        );
      } catch {
        if (!cancelled) setInstitutionError("Something went wrong while looking that up. Please try again.");
      } finally {
        if (!cancelled) setInstitutionLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [institutionQuery]);

  function handleSelectInstitution(college: CollegeOption) {
    setSelectedCollege(college);
    try {
      localStorage.setItem(COLLEGE_ID_KEY, String(college.id));
      localStorage.setItem(COLLEGE_NAME_KEY, college.name);
      localStorage.setItem(COLLEGE_CODE_KEY, college.code || "");
    } catch {
      // ignore
    }
    setInstitutionQuery("");
    setInstitutionResults([]);
    setError(null);
    setStage("credentials");
  }

  function handleChangeInstitution() {
    setSelectedCollege(null);
    try {
      localStorage.removeItem(COLLEGE_ID_KEY);
      localStorage.removeItem(COLLEGE_NAME_KEY);
      localStorage.removeItem(COLLEGE_CODE_KEY);
    } catch {
      // ignore
    }
    setIdentifier("");
    setPassword("");
    setError(null);
    setStage("institution");
  }

  function clearStoredSession() {
    try {
      localStorage.removeItem('access');
      localStorage.removeItem('refresh');
      localStorage.removeItem('me');
      localStorage.removeItem('roles');
      localStorage.removeItem('permissions');
      localStorage.removeItem('role');
      localStorage.removeItem('impersonation_notice');
    } catch {
      // ignore
    }
  }

  function cancelSuperuserFlow(redirectTo: string) {
    clearStoredSession();
    setPassword("");
    setTargetIdentifier("");
    setReason("");
    setMe(null);
    setStage("credentials");
    setError(null);

    // Hard navigation to ensure all app auth state is reset.
    window.location.href = redirectTo;
  }

  function isImpersonationAdmin(meObj: any): boolean {
    const roles = Array.isArray(meObj?.roles) ? meObj.roles : [];
    const perms = Array.isArray(meObj?.permissions) ? meObj.permissions : [];

    const normRoles = roles.map((r: any) => String(r || "").trim().toUpperCase());
    const normPerms = perms.map((p: any) => String(p || "").trim().toLowerCase());

    // IQAC main account, IQAC role, explicit permission, SUPER_ADMIN role, or is_superuser.
    return Boolean(meObj?.is_iqac_main) || Boolean(meObj?.is_superuser) || normRoles.includes("IQAC") || normRoles.includes("SUPER_ADMIN") || normPerms.includes("admin.manage");
  }

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
    // Axios timeout
    if (code === "ECONNABORTED") return "Login request timed out. Please check server connectivity and try again.";
    // Axios network error (no response)
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
      await login(identifier, password, selectedCollege?.id);

      // Fetch profile immediately so we can decide whether to offer impersonation.
      const meRes = await getMe();
      setMe(meRes);

      if (isImpersonationAdmin(meRes)) {
        // Superuser/IQAC: ask whether to continue as self or impersonate.
        setStage("choice");
        return;
      }

      // Normal user: proceed directly.
      window.location.href = "/dashboard";
    } catch (err) {
      const serverMsg = extractServerMessage(err) || extractNetworkMessage(err) || "Login failed";
      setError(serverMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleContinueAsSelf = () => {
    // Clear password from memory once we no longer need it.
    setPassword("");
    window.location.href = "/dashboard";
  };

  const handleSubmitImpersonate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const target = String(targetIdentifier || "").trim();
      if (!target) {
        setError("Please enter a valid Target (Student Reg No / Staff ID)");
        return;
      }

      await impersonateLogin(identifier, password, target, reason);
      await getMe();
      // Clear sensitive fields
      setPassword("");
      setTargetIdentifier("");
      setReason("");

      window.location.href = "/dashboard";
    } catch (err) {
      const serverMsg = extractServerMessage(err) || extractNetworkMessage(err) || "Impersonation failed";
      setError(serverMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Navbar user={null} />
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-2xl shadow-xl p-8 sm:p-10">
            {/* Header */}
            <div className="mb-8 text-center">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">
                {stage === "institution" ? "Find Your Campus" : "Welcome Back"}
              </h2>
              <p className="text-gray-600">
                {stage === "institution"
                  ? "Look up your college below to get started"
                  : "Sign in to access your account"}
              </p>
            </div>

            {stage === "institution" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="institution">
                    College / Institute Name
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      id="institution"
                      type="text"
                      autoFocus
                      className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200"
                      placeholder="Search by college name..."
                      value={institutionQuery}
                      onChange={(e) => setInstitutionQuery(e.target.value)}
                    />
                  </div>
                </div>

                {institutionQuery.trim().length < 3 && (
                  <p className="text-xs text-gray-500 px-1">
                    Keep typing — results appear once you've entered at least 3 characters.
                  </p>
                )}

                {institutionLoading && (
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Looking up matching colleges...
                  </div>
                )}

                {institutionError && !institutionLoading && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-amber-900">Institution not found</p>
                      <p className="text-sm text-amber-800 mt-0.5">{institutionError}</p>
                    </div>
                  </div>
                )}

                {!institutionLoading && institutionResults.length > 0 && (
                  <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
                    {institutionResults.map((college) => (
                      <li key={college.id}>
                        <button
                          type="button"
                          onClick={() => handleSelectInstitution(college)}
                          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-indigo-50 transition-colors"
                        >
                          <span className="flex items-center gap-3 min-w-0">
                            <Building2 className="h-5 w-5 text-indigo-500 flex-shrink-0" />
                            <span className="min-w-0">
                              <span className="block font-medium text-gray-900 truncate">{college.name}</span>
                              {college.city && (
                                <span className="block text-xs text-gray-500 truncate">{college.city}</span>
                              )}
                            </span>
                          </span>
                          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}


            {stage === "credentials" && (
              <form className="space-y-6" onSubmit={handleSubmitCredentials}>
                {/* Selected institution */}
                {selectedCollege && (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
                    <span className="flex items-center gap-2 min-w-0 text-sm font-semibold text-blue-900">
                      <Building2 className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{selectedCollege.name}</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleChangeInstitution}
                      className="text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline flex-shrink-0"
                      disabled={loading}
                    >
                      Change
                    </button>
                  </div>
                )}

                {/* Email/Register No Field */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="identifier">
                    Email or Register No
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      id="identifier"
                      type="text"
                      className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 disabled:bg-gray-100 disabled:cursor-not-allowed"
                      placeholder="College Email or Reg. No."
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                </div>


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
                      className="block w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 disabled:bg-gray-100 disabled:cursor-not-allowed"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={loading}
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

                {/* Forgot Password Link */}
                <div className="flex items-center justify-end">
                  <Link
                    to="/forgot-password"
                    className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    Forgot Password?
                  </Link>
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
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Signing In...
                    </span>
                  ) : (
                    "Sign In"
                  )}
                </button>
              </form>
            )}

            {stage === "choice" && (
              <div className="space-y-6">
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                  <p className="text-sm text-blue-900 font-semibold">Superuser login detected</p>
                  <p className="text-sm text-blue-800 mt-1">
                    Signed in as <span className="font-semibold">{String(me?.name || me?.username || "")}</span>.
                    Choose how you want to continue.
                  </p>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                )}

                <button
                  type="button"
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]"
                  onClick={handleContinueAsSelf}
                  disabled={loading}
                >
                  Login with my account
                </button>

                <button
                  type="button"
                  className="w-full bg-white text-gray-900 py-3 px-4 rounded-lg font-semibold border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                  onClick={() => setStage("impersonate")}
                  disabled={loading}
                >
                  Super Login another user
                </button>
              </div>
            )}

            {stage === "impersonate" && (
              <form className="space-y-6" onSubmit={handleSubmitImpersonate}>
                <div className="space-y-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="target_identifier">
                      Target (Student Reg No / Staff ID)
                    </label>
                    <input
                      id="target_identifier"
                      type="text"
                      className="block w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 disabled:bg-gray-100 disabled:cursor-not-allowed"
                      placeholder="e.g. AD23CS001 or STAFF123"
                      value={targetIdentifier}
                      onChange={(e) => setTargetIdentifier(e.target.value)}
                      required
                      disabled={loading}
                    />
                    <p className="text-xs text-gray-600 mt-1">Superuser will be logged in as this user (no target password needed).</p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="reason">
                      Reason (optional)
                    </label>
                    <textarea
                      id="reason"
                      className="block w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 disabled:bg-gray-100 disabled:cursor-not-allowed"
                      placeholder="Why are you Super Login?"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      disabled={loading}
                      rows={2}
                    />
                  </div>

                  <p className="text-xs text-yellow-800">
                    Note: This action is audited and the session will show an super login notice.
                  </p>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Signing In...
                    </span>
                  ) : (
                    "Super Login & Sign In"
                  )}
                </button>
              </form>
            )}

            {/* Back to Home Link */}
            <div className="text-center pt-4">
              {stage === "institution" || stage === "credentials" ? (
                <Link
                  to="/"
                  className="text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors"
                >
                  ← Back to Home
                </Link>
              ) : (
                <button
                  type="button"
                  className="text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors"
                  onClick={() => cancelSuperuserFlow("/")}
                  disabled={loading}
                >
                  ← Back to Home
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
