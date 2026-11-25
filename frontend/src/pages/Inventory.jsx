import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  History,
  Layers,
  PackageCheck,
  RotateCcw,
  Search,
  User,
  XCircle,
} from "lucide-react";
import { api } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { useToast } from "../context/ToastContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { dateShort, dateTime, daysUntil, initials, money, num, timeAgo } from "../lib/format";
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  IssueBadge,
  LoadingRows,
  Modal,
  StockBadge,
} from "../components/ui";

const EMPTY_ISSUE = {
  item_id: "",
  quantity: "",
  issued_to: "",
  department: "",
  expected_return: "",
  notes: "",
};

function isOverdue(issue) {
  if (issue.status !== "pending" || !issue.expected_return) return false;
  return daysUntil(issue.expected_return) < 0;
}

export default function Inventory() {
  const toast = useToast();
  const { currencySymbol } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") || "overview");
  const [search, setSearch] = useState("");
  const [historyFilter, setHistoryFilter] = useState("all");
  const [modal, setModal] = useState(null);
  const [issueForm, setIssueForm] = useState(EMPTY_ISSUE);
  const [returnQty, setReturnQty] = useState("");
  const [returnNote, setReturnNote] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const {
    data: items,
    loading: itemsLoading,
    error: itemsError,
    reload: reloadItems,
  } = useFetch(() => api.items(""), []);
  const {
    data: issues,
    loading: issuesLoading,
    error: issuesError,
    reload: reloadIssues,
  } = useFetch(() => api.issues("?status=all"), []);
  const {
    data: stationeryOverview,
  } = useFetch(() => api.stationeryOverview(), []);

  const itemList = items || [];
  const issueList = issues || [];
  const pending = issueList.filter((issue) => issue.status === "pending");
  const overdue = pending.filter(isOverdue);

  useEffect(() => {
    if (searchParams.get("issue") === "1") {
      openIssue();
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function changeTab(next) {
    setTab(next);
    setSearch("");
    setSearchParams(next === "overview" ? {} : { tab: next }, { replace: true });
  }

  function openIssue(item) {
    setIssueForm({
      ...EMPTY_ISSUE,
      item_id: item ? String(item.id) : "",
    });
    setFormError("");
    setModal({ type: "issue", item });
  }

  function openReturn(issue) {
    setReturnQty(String(issue.pending_quantity));
    setReturnNote("");
    setFormError("");
    setModal({ type: "return", issue });
  }

  const totals = useMemo(() => {
    return itemList.reduce(
      (acc, item) => {
        acc.available += Number(item.quantity || 0);
        acc.issued += Number(item.pending_quantity || 0);
        acc.value += Number(item.value || 0);
        return acc;
      },
      { available: 0, issued: 0, value: 0 }
    );
  }, [itemList]);

  const selectedItem = itemList.find((item) => String(item.id) === String(issueForm.item_id));

  const overviewRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return itemList;
    return itemList.filter((item) =>
      [item.name, item.sku, item.category, item.location]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term))
    );
  }, [itemList, search]);

  const pendingRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = term
      ? pending.filter((issue) =>
          [issue.item_name, issue.issued_to, issue.reference, issue.department]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(term))
        )
      : pending;
    return [...rows].sort((a, b) => {
      const aOver = isOverdue(a) ? 0 : 1;
      const bOver = isOverdue(b) ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      return new Date(b.issued_at) - new Date(a.issued_at);
    });
  }, [pending, search]);

  const historyRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return issueList
      .filter((issue) => (historyFilter === "all" ? true : issue.status === historyFilter))
      .filter((issue) =>
        term
          ? [issue.item_name, issue.issued_to, issue.reference, issue.department]
              .filter(Boolean)
              .some((value) => value.toLowerCase().includes(term))
          : true
      );
  }, [issueList, historyFilter, search]);

  async function submitIssue(event) {
    event.preventDefault();
    setFormError("");
    if (!issueForm.item_id) {
      setFormError("Please choose an item to issue.");
      return;
    }
    if (!issueForm.issued_to.trim()) {
      setFormError("Please enter who is receiving this item.");
      return;
    }
    const qty = Number(issueForm.quantity);
    if (!qty || qty <= 0) {
      setFormError("Enter a quantity greater than zero.");
      return;
    }
    if (selectedItem && qty > Number(selectedItem.quantity)) {
      setFormError(`Only ${num(selectedItem.quantity)} ${selectedItem.unit} available in stock.`);
      return;
    }
    setBusy(true);
    try {
      const issue = await api.issue({
        item_id: Number(issueForm.item_id),
        quantity: qty,
        issued_to: issueForm.issued_to.trim(),
        department: issueForm.department.trim() || null,
        expected_return: issueForm.expected_return || null,
        notes: issueForm.notes.trim() || null,
      });
      toast.success(
        "Item issued",
        `${num(issue.quantity)} ${issue.item_unit} of ${issue.item_name} issued to ${issue.issued_to}.`
      );
      setModal(null);
      reloadItems();
      reloadIssues();
      if (tab === "overview") changeTab("pending");
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitReturn(event) {
    event.preventDefault();
    setFormError("");
    const qty = Number(returnQty);
    const outstanding = Number(modal?.issue?.pending_quantity || 0);
    if (!qty || qty <= 0) {
      setFormError("Enter a quantity greater than zero.");
      return;
    }
    if (qty > outstanding) {
      setFormError(`Only ${num(outstanding)} units are pending for this issue.`);
      return;
    }
    setBusy(true);
    try {
      await api.returnIssue(modal.issue.id, {
        quantity: qty,
        note: returnNote.trim() || `Returned from ${modal.issue.issued_to}`,
      });
      toast.success(
        "Items returned",
        `${num(qty)} ${modal.issue.item_unit} of ${modal.issue.item_name} added back to stock.`
      );
      setModal(null);
      reloadItems();
      reloadIssues();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmCancel() {
    setBusy(true);
    try {
      await api.cancelIssue(modal.issue.id);
      toast.success("Issue cancelled", "The units have been returned to available stock.");
      setModal(null);
      reloadItems();
      reloadIssues();
    } catch (err) {
      toast.error("Could not cancel issue", err.message);
      setModal(null);
    } finally {
      setBusy(false);
    }
  }

  const loading = itemsLoading || issuesLoading;
  const error = itemsError || issuesError;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">
            <Boxes size={12} /> Live inventory
          </span>
          <h1 className="page-title">Inventory</h1>
          <p className="page-sub">
            Issue items to your team and track everything still pending, automatically.
          </p>
        </div>
        <div className="head-actions">
          <button className="btn btn-primary" onClick={() => openIssue()}>
            <ArrowUpFromLine size={16} /> Issue item
          </button>
        </div>
      </div>

      <div className="mini-stats four">
        <div className="mini-stat">
          <span className="stat-icon">
            <Boxes size={17} />
          </span>
          <div>
            <strong>{num(totals.available)}</strong>
            <span>Available units</span>
          </div>
        </div>
        <div className="mini-stat">
          <span className="stat-icon amber">
            <ClipboardList size={17} />
          </span>
          <div>
            <strong>{num(totals.issued)}</strong>
            <span>Units issued / pending</span>
          </div>
        </div>
        <div className="mini-stat">
          <span className="stat-icon blue">
            <CalendarClock size={17} />
          </span>
          <div>
            <strong>{num(pending.length)}</strong>
            <span>Pending issue records</span>
          </div>
        </div>
        <div className="mini-stat">
          <span className="stat-icon rose">
            <AlertTriangle size={17} />
          </span>
          <div>
            <strong>{num(overdue.length)}</strong>
            <span>Overdue returns</span>
          </div>
        </div>
      </div>

      <div className="stationery-hub">
        <Link to="/stock-in" className="hub-card">
          <span className="stat-icon blue">
            <ArrowDownToLine size={18} />
          </span>
          <div className="hub-card-copy">
            <strong>Stock In</strong>
            <span>
              {num(stationeryOverview?.in?.items || 0)} items · {num(stationeryOverview?.in?.units || 0)} units available
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
              {num(stationeryOverview?.out?.records || 0)} records · {num(stationeryOverview?.out?.units_out || 0)} units taken
            </span>
          </div>
          <ChevronRight size={16} className="hub-arrow" />
        </Link>
      </div>

      <div className="mini-stats four" style={{ marginBottom: 18 }}>
        <div className="mini-stat">
          <span className="stat-icon">
            <ClipboardList size={17} />
          </span>
          <div>
            <strong>{num(stationeryOverview?.in?.items || 0)}</strong>
            <span>Stock In items</span>
          </div>
        </div>
        <div className="mini-stat">
          <span className="stat-icon green">
            <Layers size={17} />
          </span>
          <div>
            <strong>{num(stationeryOverview?.in?.units || 0)}</strong>
            <span>Units in stock</span>
          </div>
        </div>
        <div className="mini-stat">
          <span className="stat-icon amber">
            <ArrowUpFromLine size={17} />
          </span>
          <div>
            <strong>{num(stationeryOverview?.out?.pending_records || 0)}</strong>
            <span>Pending requests</span>
          </div>
        </div>
        <div className="mini-stat">
          <span className="stat-icon rose">
            <AlertTriangle size={17} />
          </span>
          <div>
            <strong>{num(stationeryOverview?.out?.units_out || 0)}</strong>
            <span>Units taken out</span>
          </div>
        </div>
      </div>

      <div className="tabs" role="tablist">
        <button
          className={`tab${tab === "overview" ? " active" : ""}`}
          onClick={() => changeTab("overview")}
        >
          <Boxes size={14} /> Overview
        </button>
        <button
          className={`tab${tab === "pending" ? " active" : ""}`}
          onClick={() => changeTab("pending")}
        >
          <ClipboardList size={14} /> Pending
          {pending.length > 0 && <span className="tab-count">{pending.length}</span>}
        </button>
        <button
          className={`tab${tab === "history" ? " active" : ""}`}
          onClick={() => changeTab("history")}
        >
          <History size={14} /> History
        </button>
      </div>

      {error ? (
        <div className="card">
          <ErrorState
            message={error}
            onRetry={() => {
              reloadItems();
              reloadIssues();
            }}
          />
        </div>
      ) : tab === "overview" ? (
        <div className="card">
          <div className="toolbar">
            <div className="search-box">
              <Search size={16} />
              <input
                className="input"
                placeholder="Search inventory…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <span className="toolbar-count">
              {overviewRows.length} items · {money(totals.value, currencySymbol)} on hand
            </span>
          </div>

          {loading ? (
            <LoadingRows rows={6} />
          ) : overviewRows.length === 0 ? (
            <EmptyState
              icon={<Boxes size={22} />}
              title={search ? "No matching items" : "No stock yet"}
              message={
                search
                  ? "Try a different search term."
                  : "Add items on the Stock items page, then come back here to issue them."
              }
            />
          ) : (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Category</th>
                      <th className="num">Available</th>
                      <th className="num">Issued</th>
                      <th className="num">Total</th>
                      <th>Status</th>
                      <th className="actions">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overviewRows.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="cell-item">
                            <span className="item-glyph">{initials(item.name)}</span>
                            <div style={{ minWidth: 0 }}>
                              <strong>{item.name}</strong>
                              <span>
                                {item.sku}
                                {item.location ? ` · ${item.location}` : ""}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="badge badge-neutral no-dot">{item.category}</span>
                        </td>
                        <td className="num strong">
                          {num(item.quantity)}{" "}
                          <span className="muted small" style={{ fontWeight: 400 }}>
                            {item.unit}
                          </span>
                        </td>
                        <td className="num" style={{ color: item.pending_quantity > 0 ? "var(--brand-text)" : undefined }}>
                          {num(item.pending_quantity)}
                        </td>
                        <td className="num muted">{num(item.quantity + item.pending_quantity)}</td>
                        <td>
                          <StockBadge status={item.status} />
                        </td>
                        <td className="actions">
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => openIssue(item)}
                            disabled={Number(item.quantity) <= 0}
                          >
                            <ArrowUpFromLine size={13} /> Issue
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="item-cards">
                {overviewRows.map((item) => (
                  <div className="item-card" key={item.id}>
                    <div className="item-card-top">
                      <div className="cell-item">
                        <span className="item-glyph">{initials(item.name)}</span>
                        <div style={{ minWidth: 0 }}>
                          <strong>{item.name}</strong>
                          <span>
                            {item.sku} · {item.category}
                          </span>
                        </div>
                      </div>
                      <StockBadge status={item.status} />
                    </div>
                    <div className="item-card-stats">
                      <div>
                        <span>Available</span>
                        <strong>
                          {num(item.quantity)} {item.unit}
                        </strong>
                      </div>
                      <div>
                        <span>Issued</span>
                        <strong>{num(item.pending_quantity)}</strong>
                      </div>
                      <div>
                        <span>Total</span>
                        <strong>{num(item.quantity + item.pending_quantity)}</strong>
                      </div>
                    </div>
                    <div className="item-card-actions">
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => openIssue(item)}
                        disabled={Number(item.quantity) <= 0}
                      >
                        <ArrowUpFromLine size={14} /> Issue this item
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : tab === "pending" ? (
        <div className="card">
          <div className="toolbar">
            <div className="search-box">
              <Search size={16} />
              <input
                className="input"
                placeholder="Search by person, item or reference…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <span className="toolbar-count">
              {pending.length} pending · {num(totals.issued)} units out
            </span>
          </div>
          {loading ? (
            <LoadingRows rows={4} height={120} />
          ) : pendingRows.length === 0 ? (
            <EmptyState
              icon={<PackageCheck size={22} />}
              title={search ? "No matching pending items" : "Everything is back"}
              message={
                search
                  ? "Try a different search term."
                  : "Nothing is currently issued. Issue an item and it will be tracked here until returned."
              }
              action={
                !search && (
                  <button className="btn btn-primary btn-sm" onClick={() => openIssue()}>
                    <ArrowUpFromLine size={14} /> Issue an item
                  </button>
                )
              }
            />
          ) : (
            <div className="card-body">
              <div className="pending-grid">
                {pendingRows.map((issue) => {
                  const over = isOverdue(issue);
                  const days = issue.expected_return ? daysUntil(issue.expected_return) : null;
                  return (
                    <div className={`pending-card${over ? " overdue" : ""}`} key={issue.id}>
                      <div className="pending-top">
                        <div className="pending-person">
                          <span className="avatar">{initials(issue.issued_to)}</span>
                          <div style={{ minWidth: 0 }}>
                            <strong>{issue.issued_to}</strong>
                            <span>
                              {issue.department || "No department"} · {issue.reference}
                            </span>
                          </div>
                        </div>
                        <IssueBadge status={issue.status} overdue={over} />
                      </div>

                      <div className="pending-item">
                        <span className="name">{issue.item_name}</span>
                        <span className="qty">
                          {num(issue.pending_quantity)} {issue.item_unit}
                        </span>
                      </div>

                      <div className="pending-meta">
                        <span>
                          Issued <b>{dateShort(issue.issued_at)}</b>
                        </span>
                        <span>
                          {issue.expected_return ? (
                            <>
                              Due <b>{dateShort(issue.expected_return)}</b>
                              {over ? ` · ${Math.abs(days)}d overdue` : days === 0 ? " · today" : ""}
                            </>
                          ) : (
                            "No return date"
                          )}
                        </span>
                      </div>

                      {issue.notes && <div className="pending-notes">{issue.notes}</div>}

                      <div className="pending-actions">
                        <button className="btn btn-primary btn-sm" onClick={() => openReturn(issue)}>
                          <RotateCcw size={13} /> Receive back
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setModal({ type: "cancel", issue })}
                        >
                          <XCircle size={13} /> Cancel
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card">
          <div className="toolbar">
            <div className="search-box">
              <Search size={16} />
              <input
                className="input"
                placeholder="Search issue history…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <select
              className="select"
              value={historyFilter}
              onChange={(event) => setHistoryFilter(event.target.value)}
            >
              <option value="all">All records</option>
              <option value="pending">Pending only</option>
              <option value="returned">Returned only</option>
            </select>
            <span className="toolbar-count">{historyRows.length} records</span>
          </div>

          {loading ? (
            <LoadingRows rows={6} />
          ) : historyRows.length === 0 ? (
            <EmptyState
              icon={<History size={22} />}
              title="No issue records"
              message="Every issue and return is stored here with its reference number."
            />
          ) : (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Item</th>
                      <th className="num">Issued</th>
                      <th className="num">Returned</th>
                      <th>Issued to</th>
                      <th>Issued on</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((issue) => (
                      <tr key={issue.id}>
                        <td>
                          <span className="strong" style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                            {issue.reference}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{issue.item_name}</div>
                          <div className="muted small">{issue.department || "—"}</div>
                        </td>
                        <td className="num strong">
                          {num(issue.quantity)} <span className="muted small">{issue.item_unit}</span>
                        </td>
                        <td className="num muted">{num(issue.returned_quantity)}</td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span className="avatar" style={{ width: 28, height: 28, fontSize: 10 }}>
                              {initials(issue.issued_to)}
                            </span>
                            {issue.issued_to}
                          </div>
                        </td>
                        <td className="muted small">{dateShort(issue.issued_at)}</td>
                        <td>
                          <IssueBadge status={issue.status} overdue={isOverdue(issue)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="item-cards">
                {historyRows.map((issue) => (
                  <div className="item-card" key={issue.id}>
                    <div className="item-card-top">
                      <div className="cell-item">
                        <span className="item-glyph">{initials(issue.issued_to)}</span>
                        <div style={{ minWidth: 0 }}>
                          <strong>{issue.item_name}</strong>
                          <span>
                            {issue.reference} · {issue.issued_to}
                          </span>
                        </div>
                      </div>
                      <IssueBadge status={issue.status} overdue={isOverdue(issue)} />
                    </div>
                    <div className="item-card-stats">
                      <div>
                        <span>Issued</span>
                        <strong>
                          {num(issue.quantity)} {issue.item_unit}
                        </strong>
                      </div>
                      <div>
                        <span>Returned</span>
                        <strong>{num(issue.returned_quantity)}</strong>
                      </div>
                      <div>
                        <span>Date</span>
                        <strong>{dateShort(issue.issued_at)}</strong>
                      </div>
                    </div>
                    {issue.status === "pending" && (
                      <div className="item-card-actions">
                        <button className="btn btn-primary btn-sm" onClick={() => openReturn(issue)}>
                          <RotateCcw size={13} /> Receive back
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <Modal
        open={modal?.type === "issue"}
        onClose={() => setModal(null)}
        title="Issue item"
        subtitle="Stock is reduced immediately and tracked as pending until returned."
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setModal(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" form="issue-form" disabled={busy}>
              {busy ? "Issuing…" : "Issue item"}
            </button>
          </>
        }
      >
        <form id="issue-form" onSubmit={submitIssue} className="stack" style={{ gap: 14 }}>
          <div className="field">
            <label htmlFor="issue-item">Item *</label>
            <select
              id="issue-item"
              className="select"
              value={issueForm.item_id}
              onChange={(event) => {
                setIssueForm((current) => ({ ...current, item_id: event.target.value }));
                setFormError("");
              }}
              required
            >
              <option value="">Select an item…</option>
              {itemList.map((item) => (
                <option key={item.id} value={item.id} disabled={Number(item.quantity) <= 0}>
                  {item.name} — {num(item.quantity)} {item.unit} available
                  {Number(item.quantity) <= 0 ? " (out of stock)" : ""}
                </option>
              ))}
            </select>
          </div>

          {selectedItem && (
            <div className="issue-preview">
              <span className="item-glyph">{initials(selectedItem.name)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{selectedItem.name}</strong>
                <span>
                  {num(selectedItem.quantity)} {selectedItem.unit} available ·{" "}
                  {money(selectedItem.unit_price, currencySymbol)} per {selectedItem.unit}
                </span>
              </div>
              <StockBadge status={selectedItem.status} />
            </div>
          )}

          <div className="form-grid">
            <div className="field">
              <label htmlFor="issue-qty">Quantity *</label>
              <input
                id="issue-qty"
                className="input"
                type="number"
                min="0.01"
                max={selectedItem ? selectedItem.quantity : undefined}
                step="any"
                placeholder="0"
                value={issueForm.quantity}
                onChange={(event) =>
                  setIssueForm((current) => ({ ...current, quantity: event.target.value }))
                }
                required
              />
            </div>
            <div className="field">
              <label htmlFor="issue-date">Expected return</label>
              <input
                id="issue-date"
                className="input"
                type="date"
                value={issueForm.expected_return}
                onChange={(event) =>
                  setIssueForm((current) => ({ ...current, expected_return: event.target.value }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="issue-person">Issued to *</label>
              <div style={{ position: "relative" }}>
                <User
                  size={15}
                  style={{ position: "absolute", left: 12, top: 13, color: "var(--muted)" }}
                />
                <input
                  id="issue-person"
                  className="input"
                  style={{ paddingLeft: 35 }}
                  placeholder="Employee / team name"
                  value={issueForm.issued_to}
                  onChange={(event) =>
                    setIssueForm((current) => ({ ...current, issued_to: event.target.value }))
                  }
                  required
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="issue-dept">Department</label>
              <input
                id="issue-dept"
                className="input"
                placeholder="e.g. IT, Admin, HR"
                value={issueForm.department}
                onChange={(event) =>
                  setIssueForm((current) => ({ ...current, department: event.target.value }))
                }
              />
            </div>
            <div className="field span-2">
              <label htmlFor="issue-notes">Notes</label>
              <textarea
                id="issue-notes"
                className="textarea"
                placeholder="Purpose or remarks (optional)"
                value={issueForm.notes}
                onChange={(event) =>
                  setIssueForm((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </div>
          </div>

          {selectedItem && Number(issueForm.quantity) > 0 && (
            <div
              style={{
                fontSize: 12,
                color: "var(--muted)",
                background: "var(--surface-2)",
                border: "1px solid var(--line)",
                borderRadius: 10,
                padding: "9px 12px",
              }}
            >
              After issuing, available stock will be{" "}
              <strong style={{ color: "var(--text)" }}>
                {num(Math.max(0, Number(selectedItem.quantity) - Number(issueForm.quantity)))}{" "}
                {selectedItem.unit}
              </strong>
              .
            </div>
          )}

          {formError && <div className="form-error">{formError}</div>}
        </form>
      </Modal>

      <Modal
        open={modal?.type === "return"}
        onClose={() => setModal(null)}
        title="Receive items back"
        subtitle={
          modal?.issue
            ? `${modal.issue.reference} · ${modal.issue.issued_to}`
            : ""
        }
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setModal(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" form="return-form" disabled={busy}>
              {busy ? "Receiving…" : "Add back to stock"}
            </button>
          </>
        }
      >
        {modal?.issue && (
          <div className="issue-preview">
            <span className="item-glyph">{initials(modal.issue.item_name)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{modal.issue.item_name}</strong>
              <span>
                {num(modal.issue.pending_quantity)} {modal.issue.item_unit} still pending · issued{" "}
                {dateTime(modal.issue.issued_at)}
              </span>
            </div>
          </div>
        )}
        <form id="return-form" onSubmit={submitReturn} className="stack" style={{ gap: 14 }}>
          <div className="field">
            <label htmlFor="return-qty">Quantity returned *</label>
            <input
              id="return-qty"
              className="input"
              type="number"
              min="0.01"
              max={modal?.issue?.pending_quantity}
              step="any"
              value={returnQty}
              onChange={(event) => setReturnQty(event.target.value)}
              autoFocus
              required
            />
            <span className="hint">
              Partial returns are allowed — the rest stays in the pending list.
            </span>
          </div>
          <div className="field">
            <label htmlFor="return-note">Note</label>
            <input
              id="return-note"
              className="input"
              placeholder="Condition, remarks (optional)"
              value={returnNote}
              onChange={(event) => setReturnNote(event.target.value)}
            />
          </div>
          {formError && <div className="form-error">{formError}</div>}
        </form>
      </Modal>

      <ConfirmDialog
        open={modal?.type === "cancel"}
        onClose={() => setModal(null)}
        onConfirm={confirmCancel}
        busy={busy}
        title="Cancel this issue?"
        confirmLabel="Cancel issue"
        message={
          <>
            The issue record for <strong>{modal?.issue?.item_name}</strong> to{" "}
            <strong>{modal?.issue?.issued_to}</strong> will be removed and{" "}
            {num(modal?.issue?.pending_quantity)} {modal?.issue?.item_unit} will be added back to
            available stock. Prefer "Receive back" if the items were actually handed over.
          </>
        }
      />
    </>
  );
}
