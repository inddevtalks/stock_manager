import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  User,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Logo } from "../components/ui";

export default function Login() {
  const { user, login, register, booting } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("staff");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!booting && user) return <Navigate to="/" replace />;

  const submit = async (event, override) => {
    event?.preventDefault();
    setError("");
    setBusy(true);
    const creds = override || { email: email.trim(), password, name: name.trim() };
    try {
      if (mode === "register") {
        if (creds.name.length < 2) throw new Error("Please enter your full name.");
        const profile = await register(creds.name, creds.email, creds.password, role);
        toast.success("Workspace ready", "Your account has been created.");
        navigate(profile.role === "staff" ? "/stock-out" : "/", { replace: true });
        return;
      } else {
        const profile = await login(creds.email, creds.password);
        toast.success("Welcome back", `Signed in as ${profile.name}.`);
        navigate(profile.role === "staff" ? "/stock-out" : "/", { replace: true });
        return;
      }
    } catch (err) {
      setError(err.message || "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <div className="auth-brand">
          <Logo />
          <strong>Stock Manager</strong>
        </div>

        <div className="auth-hero">
          <h1>
            Your stock room,
            <br />
            <em>finally under control.</em>
          </h1>
          <p>
            Add what you own, issue it to your team and keep an eye on everything pending — from one
            clean dashboard that works on desktop and mobile.
          </p>

          <div className="auth-points">
            <div className="auth-point">
              <span>
                <Boxes size={14} />
              </span>
              Track every item, category and stock value in real time
            </div>
            <div className="auth-point">
              <span>
                <ArrowRight size={14} />
              </span>
              Issue items in one tap — available stock updates automatically
            </div>
            <div className="auth-point">
              <span>
                <ShieldCheck size={14} />
              </span>
              Pending and returned items stay recorded with full history
            </div>
          </div>
        </div>

        <div className="auth-stats">
          <div className="auth-stat">
            <strong>Live</strong>
            <span>Stock levels</span>
          </div>
          <div className="auth-stat">
            <strong>100%</strong>
            <span>Issue tracking</span>
          </div>
          <div className="auth-stat">
            <strong>Mobile</strong>
            <span>Ready</span>
          </div>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <Logo />
            <strong style={{ fontSize: 15 }}>Stock Manager</strong>
          </div>

          <h2 className="auth-title">{mode === "login" ? "Sign in to your workspace" : "Create your admin account"}</h2>
          <p className="auth-sub">
            {mode === "login"
              ? "Enter your admin credentials to continue."
              : "Set up a new admin login for this workspace."}
          </p>

          <form className="auth-form" onSubmit={submit}>
            {mode === "register" && (
              <>
                <div className="field">
                  <label htmlFor="name">Full name</label>
                  <div style={{ position: "relative" }}>
                    <User
                      size={16}
                      style={{ position: "absolute", left: 13, top: 13, color: "var(--muted)" }}
                    />
                    <input
                      id="name"
                      className="input"
                      style={{ paddingLeft: 38 }}
                      placeholder="e.g. Peter Fernandes"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      autoComplete="name"
                      required
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="role">Role</label>
                  <select
                    id="role"
                    className="select"
                    value={role}
                    onChange={(event) => setRole(event.target.value)}
                  >
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </>
            )}

            <div className="field">
              <label htmlFor="email">Email address</label>
              <div style={{ position: "relative" }}>
                <Mail
                  size={16}
                  style={{ position: "absolute", left: 13, top: 13, color: "var(--muted)" }}
                />
                <input
                  id="email"
                  className="input"
                  style={{ paddingLeft: 38 }}
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <div style={{ position: "relative" }}>
                <Lock
                  size={16}
                  style={{ position: "absolute", left: 13, top: 13, color: "var(--muted)" }}
                />
                <input
                  id="password"
                  className="input"
                  style={{ paddingLeft: 38, paddingRight: 42 }}
                  type={showPassword ? "text" : "password"}
                  placeholder={mode === "login" ? "Your password" : "At least 6 characters"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute",
                    right: 6,
                    top: 6,
                    border: 0,
                    background: "transparent",
                    color: "var(--muted)",
                    width: 30,
                    height: 30,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: 8,
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && <div className="form-error">{error}</div>}

            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 size={16} className="spin" /> Please wait…
                </>
              ) : (
                <>
                  {mode === "login" ? "Sign in" : "Create account"} <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>


          <div className="auth-switch">
            {mode === "login" ? "New to this workspace?" : "Already have an account?"}
            <button
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
              }}
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </div>

          <p className="auth-foot">
            <CheckCircle2 size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />
            Your data stays on your own server.
          </p>
        </div>
      </main>
    </div>
  );
}