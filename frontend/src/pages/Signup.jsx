import { useState, useContext } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { API_ORIGIN } from "../services/apiClient";
import "../styles/auth.css";

function Signup() {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const { login } = useContext(AuthContext);
  const { theme, toggleTheme } = useTheme();

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_ORIGIN}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Registration failed");
      }

      // Auto-login: store the full session returned from register
      login(data);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <button
        className="auth-theme-toggle"
        onClick={toggleTheme}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        aria-label="Toggle theme"
      >
        {theme === "dark" ? "☀️" : "🌙"}
      </button>

      <div className="auth-card">
        <div className="auth-left">
          <div className="auth-brand">
            <div className="auth-brand-icon">📦</div>
            <h1>LogBox</h1>
            <p>Monitor, filter, and analyze your application logs</p>
          </div>
        </div>

        <div className="auth-right">
          <h2>Create account</h2>
          <p className="auth-subtitle">Join LogBox to get started</p>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <input
              id="signup-name"
              className="auth-input"
              name="name"
              placeholder="Full name"
              value={form.name}
              onChange={handleChange}
              autoComplete="name"
              required
            />
            <input
              id="signup-email"
              className="auth-input"
              name="email"
              type="email"
              placeholder="Email address"
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
              required
            />
            <input
              id="signup-password"
              className="auth-input"
              name="password"
              type="password"
              placeholder="Password (min 8 characters)"
              value={form.password}
              onChange={handleChange}
              autoComplete="new-password"
              required
            />

            {error && <p className="auth-error" role="alert">{error}</p>}

            <button
              id="signup-submit"
              className="auth-btn"
              type="submit"
              disabled={loading}
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="auth-footer">
            Already have an account?{" "}
            <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Signup;