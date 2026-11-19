import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { initials } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { useToast } from "../context/ToastContext";
import { Logo } from "./ui";

const ADMIN_NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  {
    to: "/inventory",
    label: "Inventory",
    icon: Boxes,
    badge: true,
    children: [
      { to: "/stock-in", label: "Stock In", icon: ArrowDownToLine },
      { to: "/stock-out", label: "Stock Out", icon: ArrowUpFromLine },
    ],
  },
  { to: "/settings", label: "Settings", icon: Settings },
];

const STAFF_NAV = [
  { to: "/stock-out", label: "Stock Out", icon: ArrowUpFromLine, end: true },
];

const TITLES = {
  "/": ["Dashboard", "Your stock at a glance"],
  "/inventory": ["Inventory", "Issue, track and receive items"],
  "/stock-in": ["Stock In", "Stationery received into inventory"],
  "/stock-out": ["Stock Out", "Stationery taken out of inventory"],
  "/settings": ["Settings", "Workspace and account"],
};

export default function Layout() {
  const { user, logout } = useAuth();
  const NAV = user?.role === "staff" ? STAFF_NAV : ADMIN_NAV;
  const { companyName } = useWorkspace();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [stockOutPending, setStockOutPending] = useState(0);

  useEffect(() => {
    setDrawerOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  useEffect(() => {
    if (user?.role === "staff") return;
    let active = true;
    api
      .issues("?status=pending")
      .then((rows) => {
        if (active) setPendingCount(rows.length);
      })
      .catch(() => {});
    api
      .stockOut("?status=pending")
      .then((data) => {
        if (active) setStockOutPending(data?.summary?.pending_records || 0);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [location.pathname, user?.role]);

  const [title, subtitle] = TITLES[location.pathname] || ["Stock Manager", companyName];

  const handleLogout = () => {
    logout();
    toast.info("Signed out", "You have been logged out safely.");
    navigate("/login", { replace: true });
  };

  const sidebar = (
    <aside className={`sidebar${drawerOpen ? " open" : ""}`}>
      <div className="sidebar-brand">
        <Logo />
        <div className="brand-copy">
          <strong>Stock Manager</strong>
          <span>{companyName}</span>
        </div>
        <button
          className="icon-btn-dark mobile-only"
          onClick={() => setDrawerOpen(false)}
          aria-label="Close menu"
          style={{ marginLeft: "auto" }}
        >
          <X size={18} />
        </button>
      </div>

      <div className="sidebar-section">Workspace</div>
      <nav className="side-nav">
        {NAV.map((item) => {
          const childActive = item.children?.some(
            (child) =>
              location.pathname === child.to || location.pathname.startsWith(`${child.to}/`)
          );
          return (
            <div className="side-group" key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `side-link${isActive ? " active" : ""}${!isActive && childActive ? " trail" : ""}`
                }
              >
                <item.icon size={18} strokeWidth={2} />
                <span>{item.label}</span>
                {item.badge && pendingCount > 0 && <span className="side-count">{pendingCount}</span>}
              </NavLink>
              {item.children?.length > 0 && (
                <div className="side-sub">
                  {item.children.map((child) => (
                    <NavLink
                      key={child.to}
                      to={child.to}
                      className={({ isActive }) => `side-sublink${isActive ? " active" : ""}`}
                    >
                      <span className="sub-dot" />
                      <span>{child.label}</span>
                      {child.to === "/stock-out" && stockOutPending > 0 && user?.role !== "staff" && (
                        <span className="side-count" style={{ marginLeft: "auto", background: "var(--danger)" }}>
                          {stockOutPending}
                        </span>
                      )}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-promo">
        <div className="promo-card">
          <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Sparkles size={13} /> Pro tip
          </strong>
          Issue items from Inventory. Available stock updates instantly and every pending item stays
          tracked until it is returned.
        </div>
        <div className="sidebar-user">
          <span className="avatar">{initials(user?.name || "A")}</span>
          <div className="who">
            <strong>{user?.name || "Admin"}</strong>
            <span>{user?.email}</span>
          </div>
          <button className="icon-btn-dark" onClick={handleLogout} title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="app-shell">
      {sidebar}
      {drawerOpen && <div className="drawer-overlay" onClick={() => setDrawerOpen(false)} />}

      <div className="main-area">
        <header className="mobile-topbar">
          <button className="menu-btn" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
            <Menu size={19} />
          </button>
          <Logo size={34} />
          <div className="title">
            {title}
            <span>{subtitle}</span>
          </div>
          {user?.role !== "staff" && (
            <NavLink to="/inventory" className="icon-btn" title="Pending issues" style={{ position: "relative" }}>
              <ClipboardList size={19} />
              {pendingCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    right: 2,
                    minWidth: 15,
                    height: 15,
                    borderRadius: 99,
                    background: "var(--danger)",
                    color: "#fff",
                    fontSize: 9,
                    fontWeight: 700,
                    display: "grid",
                    placeItems: "center",
                    padding: "0 4px",
                  }}
                >
                  {pendingCount}
                </span>
              )}
            </NavLink>
          )}
          <span className="avatar" style={{ width: 34, height: 34, fontSize: 11 }}>
            {initials(user?.name || "A")}
          </span>
        </header>

        <main className="page">
          <Outlet />
        </main>

        <nav className="bottom-nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `bottom-link${isActive ? " active" : ""}`}
            >
              <item.icon size={19} />
              <span>{item.label.split(" ")[0]}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
