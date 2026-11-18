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

export default function App() {
  return (
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
  );
}
