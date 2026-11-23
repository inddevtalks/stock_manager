import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Boxes,
  ClipboardList,
  IndianRupee,
  Package,
  PackagePlus,
  SlidersHorizontal,
  TrendingUp,
  Undo2,
  Wallet,
} from "lucide-react";
import { api } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { useAuth } from "../context/AuthContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { compactMoney, dateShort, daysUntil, initials, money, num, timeAgo } from "../lib/format";
import { EmptyState, ErrorState, IssueBadge, StockBadge, LoadingRows } from "../components/ui";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const KIND_META = {
  in: { label: "Stock received", icon: ArrowDownToLine, sign: "+" },
  out: { label: "Issued", icon: ArrowUpFromLine, sign: "-" },
  return: { label: "Returned", icon: Undo2, sign: "+" },
  adjust: { label: "Adjusted", icon: SlidersHorizontal, sign: "" },
};

export default function Dashboard() {
  const { user } = useAuth();
  const { currencySymbol } = useWorkspace();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useFetch(() => api.dashboard(), []);

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  if (loading) {
    return (
      <>
        <div className="page-head">
          <div>
            <div className="skeleton" style={{ width: 120, height: 14, marginBottom: 10 }} />
            <div className="skeleton" style={{ width: 320, height: 28 }} />
          </div>
        </div>
        <div className="stat-grid">
          {[0, 1, 2, 3].map((key) => (
            <div className="stat-card" key={key}>
              <div className="skeleton" style={{ width: "60%", height: 12, marginBottom: 16 }} />
              <div className="skeleton" style={{ width: "45%", height: 26 }} />
            </div>
          ))}
        </div>
        <div className="grid-2">
          <div className="card">
            <LoadingRows rows={4} />
          </div>
          <div className="card">
            <LoadingRows rows={4} />
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <div className="card">
        <ErrorState message={error} onRetry={reload} />
      </div>
    );
  }

  const stats = data?.stats || {};
  const stationery = data?.stationery || {};
  const categories = data?.categories || [];
  const trend = data?.trend || [];
  const pending = data?.pending || [];
  const activity = data?.activity || [];
  const lowStock = data?.low_stock || [];
  const maxTrend = Math.max(1, ...trend.flatMap((day) => [day.issued, day.received]));
  const maxCategory = Math.max(1, ...categories.map((cat) => cat.value || 0));
  const firstName = (user?.name || "Admin").split(" ")[0];
  const attention = (stats.low_stock || 0) + (stats.out_of_stock || 0);

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">
            <TrendingUp size={12} /> {today}
          </span>
          <h1 className="page-title">
            {greeting()}, {firstName}
          </h1>
          <p className="page-sub">Here is the latest snapshot of your stock and pending items.</p>
        </div>
        <div className="head-actions">
          <button className="btn btn-outline" onClick={() => navigate("/stock-in")}>
            <PackagePlus size={16} /> Add stock
          </button>
          <button className="btn btn-primary" onClick={() => navigate("/inventory?issue=1")}>
            <ArrowUpFromLine size={16} /> Issue item
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Stock items</span>
            <span className="stat-icon">
              <Package size={18} />
            </span>
          </div>
          <div className="stat-value">{num(stats.total_items)}</div>
          <div className="stat-foot">
            Across <strong>{num(stats.categories)}</strong> categories
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Stock value</span>
            <span className="stat-icon green">
              <Wallet size={18} />
            </span>
          </div>
          <div className="stat-value">{compactMoney(stats.stock_value, currencySymbol)}</div>
          <div className="stat-foot">
            {num(stats.total_units)} units currently on hand
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Pending issues</span>
            <span className="stat-icon amber">
              <ClipboardList size={18} />
            </span>
          </div>
          <div className="stat-value">{num(stats.pending_issues)}</div>
          <div className="stat-foot">
            <strong>{num(stats.pending_units)}</strong> units with your team
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Needs attention</span>
            <span className="stat-icon rose">
              <AlertTriangle size={18} />
            </span>
          </div>
          <div className="stat-value">{num(attention)}</div>
          <div className="stat-foot">
            {num(stats.low_stock)} low · {num(stats.out_of_stock)} out of stock
          </div>
        </div>
      </div>

      <div className="stationery-hub" style={{ marginBottom: 20 }}>
        <Link to="/stock-in" className="hub-card">
          <span className="stat-icon blue">
            <ClipboardList size={18} />
          </span>
          <div className="hub-card-copy">
            <strong>Stock In</strong>
            <span>
              {num(stationery.items || 0)} items · {num(stationery.units || 0)} units available
            </span>
          </div>
          <ChevronRight size={16} className="hub-arrow" />
        </Link>
        <Link to="/stock-out" className="hub-card">
          <span className="stat-icon amber">
            <ArrowUpFromLine size={18} />
          </span>
          <div className="hub-card-copy">
            <strong>Stock Out</strong>
            <span>
              {num(stationery.pending_requests || 0)} pending · {num(stationery.taken_out || 0)} units taken
            </span>
          </div>
          <ChevronRight size={16} className="hub-arrow" />
        </Link>
      </div>

      {lowStock.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-head">
            <div>
              <div className="card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <AlertTriangle size={15} color="var(--warn)" /> Restock soon
              </div>
              <div className="card-sub">Items at or below their minimum level</div>
            </div>
            <Link to="/stock" className="card-link">
              View stock <ArrowRight size={13} />
            </Link>
          </div>
          <div className="card-body" style={{ paddingTop: 14 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                gap: 10,
              }}
            >
              {lowStock.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    border: "1px solid var(--line)",
                    borderRadius: 11,
                    background: "var(--surface-2)",
                  }}
                >
                  <span className="item-glyph" style={{ width: 32, height: 32, fontSize: 11 }}>
                    {initials(item.name)}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {item.name}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                      {num(item.quantity)} {item.unit} left · min {num(item.min_level)}
                    </div>
                  </div>
                  <StockBadge status={item.status} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Stock movement</div>
              <div className="card-sub">Issued vs received over the last 7 days</div>
            </div>
            <div className="chart-legend">
              <span>
                <i className="legend-dot" style={{ background: "#4f46e5" }} />
                Issued
              </span>
              <span>
                <i className="legend-dot" style={{ background: "#059669" }} />
                Received
              </span>
            </div>
          </div>
          <div className="card-body">
            <div className="chart">
              {trend.map((day) => (
                <div className="chart-col" key={day.date}>
                  <div className="chart-bars">
                    <div
                      className="chart-bar issued"
                      style={{ height: `${Math.max(3, (day.issued / maxTrend) * 100)}%` }}
                      title={`${day.label}: ${day.issued} issued`}
                    />
                    <div
                      className="chart-bar received"
                      style={{ height: `${Math.max(3, (day.received / maxTrend) * 100)}%` }}
                      title={`${day.label}: ${day.received} received`}
                    />
                  </div>
                  <span className="chart-label">{day.label}</span>
                </div>
              ))}
            </div>
            <div
              style={{
                display: "flex",
                gap: 22,
                marginTop: 18,
                paddingTop: 16,
                borderTop: "1px solid var(--line)",
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>
                  ISSUED TODAY
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>
                  {num(stats.issued_today)} <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>units</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>
                  RETURNED TODAY
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>
                  {num(stats.returned_today)} <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>units</span>
                </div>
              </div>
              <div style={{ marginLeft: "auto", alignSelf: "flex-end" }}>
                <Link to="/inventory" className="card-link">
                  Open inventory <ArrowRight size={13} />
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Stock by category</div>
              <div className="card-sub">Value distribution</div>
            </div>
            <Link to="/stock" className="card-link">
              All items <ArrowRight size={13} />
            </Link>
          </div>
          <div className="card-body">
            {categories.length === 0 ? (
              <EmptyState
                icon={<Boxes size={22} />}
                title="No categories yet"
                message="Add your first stock item to see the breakdown here."
              />
            ) : (
              <div className="cat-list">
                {categories.slice(0, 6).map((cat) => (
                  <div className="cat-row" key={cat.name}>
                    <div className="cat-top">
                      <span className="cat-name">{cat.name}</span>
                      <span className="cat-meta">
                        {money(cat.value, currencySymbol)} · {num(cat.items)} items
                      </span>
                    </div>
                    <div className="progress">
                      <span style={{ width: `${Math.max(4, (cat.value / maxCategory) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid-2 equal">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Pending issues</div>
              <div className="card-sub">Items currently out with people</div>
            </div>
            <Link to="/inventory" className="card-link">
              View all <ArrowRight size={13} />
            </Link>
          </div>
          {pending.length === 0 ? (
            <EmptyState
              icon={<ClipboardList size={22} />}
              title="Nothing pending"
              message="When you issue an item, it will show up here until it is returned."
            />
          ) : (
            <div className="activity">
              {pending.map((issue) => {
                const overdue = issue.expected_return && daysUntil(issue.expected_return) < 0;
                return (
                  <div className="activity-row" key={issue.id}>
                    <span className="avatar" style={{ width: 32, height: 32, fontSize: 11 }}>
                      {initials(issue.issued_to)}
                    </span>
                    <div className="activity-body">
                      <strong>{issue.issued_to}</strong>
                      <span>
                        {issue.item_name} · {num(issue.pending_quantity)} {issue.item_unit} ·{" "}
                        {issue.reference}
                      </span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <IssueBadge status={issue.status} overdue={overdue} />
                      <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4 }}>
                        {issue.expected_return
                          ? `Due ${dateShort(issue.expected_return)}`
                          : `Issued ${timeAgo(issue.issued_at)}`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Recent activity</div>
              <div className="card-sub">Every stock movement, logged</div>
            </div>
            <Link to="/inventory?tab=history" className="card-link">
              History <ArrowRight size={13} />
            </Link>
          </div>
          {activity.length === 0 ? (
            <EmptyState
              icon={<IndianRupee size={22} />}
              title="No activity yet"
              message="Stock received, issued and returned will appear here."
            />
          ) : (
            <div className="activity">
              {activity.map((row) => {
                const meta = KIND_META[row.kind] || KIND_META.adjust;
                const Icon = meta.icon;
                return (
                  <div className="activity-row" key={row.id}>
                    <span className={`activity-icon ${row.kind}`}>
                      <Icon size={15} />
                    </span>
                    <div className="activity-body">
                      <strong>{row.item_name}</strong>
                      <span>
                        {row.note || meta.label} · {timeAgo(row.created_at)}
                      </span>
                    </div>
                    <span className={`activity-qty ${row.kind}`}>
                      {meta.sign}
                      {num(row.quantity)} {row.item_unit}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
