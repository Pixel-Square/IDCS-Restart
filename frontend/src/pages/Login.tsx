import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { login } from "../services/auth";
import Navbar from "../components/Navbar";
import "./Login.css";

export default function Login() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(identifier, password);
      // Redirect to dashboard after successful login
      nav("/dashboard");
    } catch (err) {
      const serverMsg = extractServerMessage(err) || "Login failed";
      setError(serverMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Navbar user={null} />
      <div className="login-container">
        <div className="login-card">
          <form className="login-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="identifier">
                Email or Register No
              </label>
              <div className="input-wrapper">
                <span className="input-icon">
                  <Mail size={20} />
                </span>
                <input
                  id="identifier"
                  type="text"
                  className="form-input"
                  placeholder="College Email or Reg. No."
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="password">
                Password
              </label>
              <div className="input-wrapper">
                <span className="input-icon">
                  <Lock size={20} />
                </span>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="form-input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <Link to="/forgot-password" className="forgot-password">
              Forgot Password?
            </Link>

            {error && <div className="error-message">{error}</div>}

            <button type="submit" className="submit-button" disabled={loading}>
              {loading ? "Signing In..." : "Sign In"}
            </button>

            <div className="back-to-home">
              <Link to="/">Back to Home</Link>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}