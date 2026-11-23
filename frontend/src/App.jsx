import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import StockIn from "./pages/StockIn";
import StockOut from "./pages/StockOut";
import Settings from "./pages/Settings";
import { Logo } from "./components/ui";

function Boot() {
  return (
    <div className="boot-screen">
      <div className="boot-mark">
        <Logo size={46} />
        Loading your workspace…
      </div>
    </div>
  );
}

function RequireAuth({ children }) {
  const { user, booting } = useAuth();
  if (booting) return <Boot />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { user } = useAuth();
  if (user?.role === "staff") return <Navigate to="/stock-out" replace />;
  return children;
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("App error:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "sans-serif", color: "#b91c1c" }}>
          <h2>Something went wrong</h2>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, background: "#fef2f2", padding: 12, borderRadius: 8 }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <button
            onClick={() => { localStorage.removeItem("sm_token"); window.location.reload(); }}
            style={{ marginTop: 12, padding: "8px 14px", background: "#4f46e5", color: "#fff", border: 0, borderRadius: 8, cursor: "pointer" }}
          >
            Clear session & reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<AdminRoute><Dashboard /></AdminRoute>} />
        <Route path="inventory" element={<AdminRoute><Inventory /></AdminRoute>} />
        <Route path="stock-in" element={<AdminRoute><StockIn /></AdminRoute>} />
        <Route path="stock-out" element={<StockOut />} />
        <Route path="stationery" element={<Navigate to="/stock-in" replace />} />
        <Route path="settings" element={<AdminRoute><Settings /></AdminRoute>} />

      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </ErrorBoundary>
  );
}
