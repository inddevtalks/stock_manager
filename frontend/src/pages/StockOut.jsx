import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  Download,
  PackageMinus,
  Plus,
  Search,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { api } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { csvEscape, dateTime, initials, num } from "../lib/format";
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingRows,
  Modal,
} from "../components/ui";

const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "item", label: "Item (A–Z)" },
  { value: "quantity", label: "Highest quantity" },
];

function nowLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function formatDate(value) {
  if (!value) return "—";
  return dateTime(value);
}

const EMPTY_FORM = {
  stationery_id: "",
  quantity: "",
  member_id: null,
  taken_by: "",
  department: "",
  purpose: "",
  note: "",
  taken_at: nowLocal(),
};

function StatusBadge({ status }) {
  const s = status || "pending";
  const cls = s === "approved" ? "badge-brand" : s === "rejected" ? "badge-danger" : "badge-low";
  return <span className={`badge ${cls} no-dot`}>{s}</span>;
}

export default function StockOut() {
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [memberFilter, setMemberFilter] = useState("all");
  const [itemFilter, setItemFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [itemSearch, setItemSearch] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [undoTarget, setUndoTarget] = useState(null);
  const [memberModal, setMemberModal] = useState(false);
  const [memberForm, setMemberForm] = useState({ name: "", department: "", email: "", phone: "", notes: "" });
  const [memberError, setMemberError] = useState("");
  const [memberBusy, setMemberBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (memberFilter !== "all") params.set("member_id", memberFilter);
    if (itemFilter !== "all") params.set("stationery_id", itemFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    params.set("sort", sort);
    return `?${params.toString()}`;
  }, [search, memberFilter, itemFilter, statusFilter, sort]);

  const { data, loading, error, reload } = useFetch(() => api.stockOut(query), [query]);
  const { data: membersData, reload: reloadMembers } = useFetch(() => api.members(""), []);
  const members = membersData || [];

  const records = data?.records || [];
  const itemOptions = Array.from(
    new Map(records.map((r) => [r.stationery_id, r.item_name])).entries()
  );
  const memberOptions = members || [];
  const summary = data?.summary || {
    records: 0,
    units_out: 0,
    people: 0,
    items: 0,
    remaining_units: 0,
    in_items: 0,
  };
  const items = data?.items || [];

  const selectedItem = useMemo(
    () => items.find((item) => String(item.id) === String(form.stationery_id)) || null,
    [items, form.stationery_id]
  );
  const filteredItems = useMemo(() => {
    const term = itemSearch.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (item) =>
        String(item.name || "").toLowerCase().includes(term) ||
        String(item.category || "").toLowerCase().includes(term)
    );
  }, [items, itemSearch]);

  function openCreate() {
    setForm({ ...EMPTY_FORM, taken_at: nowLocal() });
    setItemSearch("");
    setFormError("");
    setModal({ type: "create" });
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submitForm(event) {
    event.preventDefault();
    setFormError("");
    if (!form.stationery_id) {
      setFormError("Pick the item being taken out.");
      return;
    }
    if (!form.member_id && !form.taken_by.trim()) {
      setFormError("Choose a member or type a name.");
      return;
    }
    const quantity = form.quantity === "" ? 0 : Number(form.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setFormError("Quantity must be greater than zero.");
      return;
    }
    if (selectedItem && quantity > selectedItem.available) {
      setFormError(`Only ${selectedItem.available} available in Stock In.`);
      return;
    }
    if (!form.taken_by.trim()) {
      setFormError("Tell us who is taking the stock.");
      return;
    }
    setBusy(true);
    try {
      await api.createStockOut({
        stationery_id: Number(form.stationery_id),
        quantity,
        member_id: form.member_id,
        taken_by: form.taken_by.trim() || null,
        department: form.department.trim() || null,
        purpose: form.purpose.trim() || null,
        note: form.note.trim() || null,
        taken_at: form.taken_at || null,
      });
      toast.success("Stock taken out", `${quantity} × ${selectedItem?.name} recorded.`);
      setModal(null);
      reload();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitMember(event) {
    event.preventDefault();
    setMemberError("");
    if (!memberForm.name.trim()) {
      setMemberError("Member name is required.");
      return;
    }
    setMemberBusy(true);
    try {
      const created = await api.createMember({
        name: memberForm.name.trim(),
        department: memberForm.department.trim() || null,
        email: memberForm.email.trim() || null,
        phone: memberForm.phone.trim() || null,
        notes: memberForm.notes.trim() || null,
      });
      toast.success("Member added", `${created.name} can now take stock out.`);
      setMemberForm({ name: "", department: "", email: "", phone: "", notes: "" });
      reloadMembers();
    } catch (err) {
      setMemberError(err.message);
    } finally {
      setMemberBusy(false);
    }
  }

  async function removeMember(member) {
    if (!window.confirm(`Remove member "${member.name}"?`)) return;
    try {
      await api.deleteMember(member.id);
      toast.success("Member removed", `${member.name} was removed.`);
      reloadMembers();
    } catch (err) {
      toast.error("Could not remove member", err.message);
    }
  }

  async function confirmUndo() {
    if (!undoTarget) return;
    setBusy(true);
    try {
      await api.deleteStockOut(undoTarget.id);
      toast.success("Stock restored", `${undoTarget.quantity} × ${undoTarget.item_name} added back to Stock In.`);
      setUndoTarget(null);
      reload();
    } catch (err) {
      toast.error("Could not undo", err.message);
      setUndoTarget(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove(record) {
    setBusy(true);
    try {
      await api.approveStockOut(record.id);
      toast.success("Approved", `Stock taken out for ${record.item_name}.`);
      reload();
    } catch (err) {
      toast.error("Could not approve", err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReject(record) {
    if (!window.confirm(`Reject this request for ${record.quantity} x ${record.item_name}?`)) return;
    setBusy(true);
    try {
      await api.rejectStockOut(record.id);
      toast.success("Rejected", "The request was rejected.");
      reload();
    } catch (err) {
      toast.error("Could not reject", err.message);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    if (!records.length) {
      toast.info("Nothing to export", "Record a stock-out first.");
      return;
    }
    const header = [
      "Item",
      "Category",
      "Quantity",
      "Taken by",
      "Department",
      "Purpose",
      "Date",
      "Remaining in stock",
    ];
    const rows = records.map((row) => [
      row.item_name,
      row.item_category,
      row.quantity,
      row.taken_by,
      row.department || "",
      row.purpose || "",
      row.taken_at || "",
      row.remaining,
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stock-out-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Export ready", `${records.length} rows exported to CSV.`);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">
            <PackageMinus size={12} /> Inventory · Stock Out register
          </span>
          <h1 className="page-title">Stock Out</h1>
          <p className="page-sub">
            Take stationery out of the cupboard — Stock In balances update automatically.
          </p>
        </div>
        <div className="head-actions">
          {isAdmin && (
            <Link to="/stock-in" className="btn btn-outline">
              <ArrowDownToLine size={16} /> Stock in
            </Link>
          )}
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> Take out
          </button>
        </div>
      </div>

      <div className="mini-stats five">
        <div className="mini-stat">
          <span className="stat-icon">
            <PackageMinus size={17} />
          </span>
          <div>
            <strong>{num(summary.records)}</strong>
            <span>Stock-out records</span>
          </div>
        </div>
        <div className="mini-stat">
          <span className="stat-icon rose">
            <ArrowDownToLine size={17} />
          </span>
          <div>
            <strong>{num(summary.units_out)}</strong>
            <span>Units taken out</span>
          </div>
        </div>
        <div className="mini-stat">
          <span className="stat-icon blue">
            <Users size={17} />
          </span>
          <div>
            <strong>{num(summary.people)}</strong>
            <span>People</span>
          </div>
        </div>
        <div className="mini-stat">
          <span className="stat-icon green">
            <CheckCircle2 size={17} />
          </span>
          <div>
            <strong>{num(summary.remaining_units)}</strong>
            <span>Units still in stock</span>
          </div>
        </div>
        <div className="mini-stat">
          <span className="stat-icon amber">
            <AlertTriangle size={17} />
          </span>
          <div>
            <strong>{num(summary.pending_records || 0)}</strong>
            <span>Pending requests</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search-box">
            <Search size={16} />
            <input
              className="input"
              placeholder="Search item, person, department or purpose…"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
          <select className="select" value={itemFilter} onChange={(event) => setItemFilter(event.target.value)}>
            <option value="all">All items</option>
            {itemOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select className="select" value={memberFilter} onChange={(event) => setMemberFilter(event.target.value)}>
            <option value="all">All members</option>
            {memberOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select className="select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <select className="select" value={sort} onChange={(event) => setSort(event.target.value)}>
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button className="btn btn-outline btn-sm" onClick={exportCsv}>
            <Download size={14} /> Export
          </button>
          <span className="toolbar-count">{records.length} rows</span>
        </div>

        {loading ? (
          <LoadingRows rows={6} />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : records.length === 0 ? (
          <EmptyState
            icon={<PackageMinus size={22} />}
            title={search ? "No matching records" : "Nothing taken out yet"}
            message={
              search
                ? "Try a different search."
                : "Take stationery out of the cupboard and it will be recorded here. Stock In balances update automatically."
            }
            action={
              <button className="btn btn-primary btn-sm" onClick={openCreate}>
                <Plus size={14} /> Take out
              </button>
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Quantity</th>
                    <th>Status</th>
                    <th>Taken by</th>
                    <th>Department</th>
                    <th>Purpose</th>
                    <th>Date</th>
                    <th className="num">Remaining</th>
                    <th className="actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div className="cell-item">
                          <span className="item-glyph">{initials(row.item_name)}</span>
                          <div style={{ minWidth: 0 }}>
                            <strong>{row.item_name}</strong>
                            <span className="muted small">{row.item_category}</span>
                          </div>
                        </div>
                      </td>
                      <td className="num strong">{num(row.quantity)}</td>
                      <td>
                        <StatusBadge status={row.status} />
                      </td>
                      <td>
                        <strong>{row.taken_by}</strong>
                      </td>
                      <td className="muted small">{row.department || "—"}</td>
                      <td className="muted small">{row.purpose || "—"}</td>
                      <td className="muted small">{formatDate(row.taken_at)}</td>
                      <td className="num">{num(row.remaining)}</td>
                      <td className="actions">
                        {isAdmin && row.status === "pending" && (
                          <>
                            <button className="btn-icon" title="Approve" onClick={() => handleApprove(row)} style={{ color: "var(--success)" }}>
                              <CheckCircle2 size={15} />
                            </button>
                            <button className="btn-icon danger" title="Reject" onClick={() => handleReject(row)}>
                              <XCircle size={15} />
                            </button>
                          </>
                        )}
                        {(isAdmin || (row.status === "pending")) && (
                          <button
                            className="btn-icon"
                            title="Undo / cancel"
                            onClick={() => setUndoTarget(row)}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="item-cards">
              {records.map((row) => (
                <div className="item-card" key={row.id}>
                  <div className="item-card-top">
                    <div className="cell-item">
                      <span className="item-glyph">{initials(row.item_name)}</span>
                      <div style={{ minWidth: 0 }}>
                        <strong>{row.item_name}</strong>
                        <span>
                          {row.item_category} · {formatDate(row.taken_at)}
                        </span>
                      </div>
                    </div>
                    <span className={`badge ${row.status === "approved" ? "badge-brand" : row.status === "rejected" ? "badge-danger" : "badge-low"} no-dot`}>
                      {row.status}
                    </span>
                  </div>
                  <div className="item-card-stats">
                    <div>
                      <span>Taken by</span>
                      <strong>{row.taken_by}</strong>
                    </div>
                    <div>
                      <span>Department</span>
                      <strong>{row.department || "—"}</strong>
                    </div>
                    <div>
                      <span>Remaining</span>
                      <strong>{num(row.remaining)}</strong>
                    </div>
                  </div>
                  {row.purpose && (
                    <div className="muted small" style={{ marginBottom: 10 }}>
                      {row.purpose}
                    </div>
                  )}
                  <div className="item-card-actions">
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: "var(--danger)" }}
                      onClick={() => setUndoTarget(row)}
                    >
                      <Trash2 size={14} /> Undo
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <Modal
        open={modal?.type === "create"}
        onClose={() => setModal(null)}
        title="Take stock out"
        subtitle="Record stationery leaving the cupboard. Stock In balances update automatically."
        wide
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setModal(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" form="stockout-form" disabled={busy}>
              {busy ? "Saving…" : "Take out"}
            </button>
          </>
        }
      >
        <form id="stockout-form" className="form-grid" onSubmit={submitForm}>
          <div className="field span-2">
            <label>Search item *</label>
            <div className="item-picker">
              <div className="item-picker-search">
                <Search size={15} />
                <input
                  className="input"
                  placeholder="Type to search stock-in items..."
                  value={itemSearch}
                  onChange={(event) => setItemSearch(event.target.value)}
                  autoFocus
                />
              </div>
              <div className="item-picker-list">
                {filteredItems.length === 0 ? (
                  <div className="item-picker-empty">No matching items. Try a different search.</div>
                ) : (
                  filteredItems.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`item-picker-row${String(form.stationery_id) === String(item.id) ? " selected" : ""}`}
                      onClick={() => updateField("stationery_id", item.id)}
                    >
                      <span className="item-picker-glyph">{initials(item.name)}</span>
                      <span className="item-picker-copy">
                        <strong>{item.name}</strong>
                        <em>{item.category}</em>
                      </span>
                      <span className="item-picker-qty">
                        <strong>{item.available}</strong>
                        <em>available</em>
                      </span>
                      {String(form.stationery_id) === String(item.id) && (
                        <CheckCircle2 size={16} className="item-picker-check" />
                      )}
                    </button>
                  ))
                )}
              </div>
              {selectedItem && (
                <div className="item-picker-selected">
                  <CheckCircle2 size={14} />
                  <span>
                    Selected: <strong>{selectedItem.name}</strong> ({selectedItem.available} available)
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="field">
            <label htmlFor="so-qty">Quantity *</label>
            <input
              id="so-qty"
              className="input"
              type="number"
              min="1"
              step="any"
              placeholder="1"
              value={form.quantity}
              onChange={(event) => updateField("quantity", event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="so-member">Member *</label>
            <select
              id="so-member"
              className="select"
              value={form.member_id || ""}
              onChange={(event) => {
                const id = event.target.value;
                updateField("member_id", id ? Number(id) : null);
                const m = members.find((x) => String(x.id) === String(id));
                if (m) updateField("taken_by", m.name);
              }}
            >
              <option value="">Choose a member...</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}{m.department ? ` - ${m.department}` : ""}
                </option>
              ))}
            </select>

          </div>
          <div className="field">
            <label htmlFor="so-taken-by">Or type a name</label>
            <input
              id="so-taken-by"
              className="input"
              placeholder="Person or team"
              value={form.taken_by}
              onChange={(event) => {
                updateField("taken_by", event.target.value);
                updateField("member_id", null);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="so-department">Department</label>
            <input
              id="so-department"
              className="input"
              placeholder="e.g. Admin"
              value={form.department}
              onChange={(event) => updateField("department", event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="so-purpose">Purpose</label>
            <input
              id="so-purpose"
              className="input"
              placeholder="What it is for"
              value={form.purpose}
              onChange={(event) => updateField("purpose", event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="so-date">Date & time</label>
            <input
              id="so-date"
              className="input"
              type="datetime-local"
              value={form.taken_at}
              onChange={(event) => updateField("taken_at", event.target.value)}
            />
          </div>
          <div className="field span-2">
            <label htmlFor="so-note">Note</label>
            <textarea
              id="so-note"
              className="textarea"
              placeholder="Optional note…"
              value={form.note}
              onChange={(event) => updateField("note", event.target.value)}
            />
          </div>
          {formError && <div className="form-error span-2">{formError}</div>}
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(undoTarget)}
        title="Undo this stock-out?"
        message={
          undoTarget
            ? `${undoTarget.quantity} × ${undoTarget.item_name} will be added back to Stock In.`
            : ""
        }
        confirmLabel="Undo"
        danger
        busy={busy}
        onClose={() => setUndoTarget(null)}
        onConfirm={confirmUndo}
      />
    </>
  );
}