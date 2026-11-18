import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Download,
  History,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Wallet,
} from "lucide-react";
import { api } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { useToast } from "../context/ToastContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { csvEscape, dateTime, initials, money, num } from "../lib/format";
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingRows,
  Modal,
  StockBadge,
} from "../components/ui";

const UNITS = ["pcs", "box", "ream", "pack", "set", "kg", "g", "litre", "ml", "bottle", "roll", "pair", "dozen"];

const EMPTY_FORM = {
  name: "",
  sku: "",
  category: "General",
  unit: "pcs",
  quantity: "",
  min_level: "",
  unit_price: "",
  location: "",
  supplier: "",
  description: "",
};

const SORTS = [
  { value: "name", label: "Name (A–Z)" },
  { value: "quantity", label: "Lowest stock" },
  { value: "value", label: "Highest value" },
  { value: "pending", label: "Most pending" },
  { value: "updated", label: "Recently updated" },
];

export default function Stock() {
  const toast = useToast();
  const { currencySymbol } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("name");

  const [modal, setModal] = useState(null); // { type, item }
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState({ loading: false, rows: [] });
  const [restockQty, setRestockQty] = useState("");
  const [restockNote, setRestockNote] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (category !== "all") params.set("category", category);
    if (status !== "all") params.set("status", status);
    params.set("sort", sort);
    return `?${params.toString()}`;
  }, [search, category, status, sort]);

  const { data: items, loading, error, reload } = useFetch(() => api.items(query), [query]);
  const { data: categories, reload: reloadCategories } = useFetch(() => api.categories(), []);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      openCreate();
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const list = items || [];

  const totals = useMemo(() => {
    return list.reduce(
      (acc, item) => {
        acc.units += Number(item.quantity || 0);
        acc.value += Number(item.quantity || 0) * Number(item.unit_price || 0);
        acc.pending += Number(item.pending_quantity || 0);
        return acc;
      },
      { units: 0, value: 0, pending: 0 }
    );
  }, [list]);

  function openCreate() {
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setModal({ type: "create" });
  }

  function openEdit(item) {
    setForm({
      name: item.name,
      sku: item.sku,
      category: item.category,
      unit: item.unit,
      quantity: String(item.quantity),
      min_level: String(item.min_level),
      unit_price: String(item.unit_price),
      location: item.location || "",
      supplier: item.supplier || "",
      description: item.description || "",
    });
    setFormError("");
    setModal({ type: "edit", item });
  }

  function openRestock(item) {
    setRestockQty("");
    setRestockNote("");
    setFormError("");
    setModal({ type: "restock", item });
  }

  async function openHistory(item) {
    setModal({ type: "history", item });
    setHistory({ loading: true, rows: [] });
    try {
      const rows = await api.itemHistory(item.id);
      setHistory({ loading: false, rows });
    } catch (err) {
      setHistory({ loading: false, rows: [] });
      toast.error("Could not load history", err.message);
    }
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submitForm(event) {
    event.preventDefault();
    setFormError("");
    if (!form.name.trim()) {
      setFormError("Item name is required.");
      return;
    }
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      category: form.category.trim() || "General",
      unit: form.unit,
      quantity: form.quantity === "" ? 0 : Number(form.quantity),
      min_level: form.min_level === "" ? 0 : Number(form.min_level),
      unit_price: form.unit_price === "" ? 0 : Number(form.unit_price),
      location: form.location.trim() || null,
      supplier: form.supplier.trim() || null,
      description: form.description.trim() || null,
    };
    if ([payload.quantity, payload.min_level, payload.unit_price].some((value) => value < 0 || Number.isNaN(value))) {
      setFormError("Quantity, minimum level and price cannot be negative.");
      return;
    }
    setBusy(true);
    try {
      if (modal.type === "create") {
        await api.createItem(payload);
        toast.success("Stock item added", `${payload.name} is now in your catalogue.`);
      } else {
        await api.updateItem(modal.item.id, payload);
        toast.success("Item updated", `${payload.name} has been saved.`);
      }
      setModal(null);
      reload();
      reloadCategories();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitRestock(event) {
    event.preventDefault();
    setFormError("");
    const qty = Number(restockQty);
    if (!qty || qty <= 0) {
      setFormError("Enter a quantity greater than zero.");
      return;
    }
    setBusy(true);
    try {
      const updated = await api.restock(modal.item.id, {
        quantity: qty,
        note: restockNote.trim() || "Stock received",
      });
      toast.success("Stock received", `${num(qty)} ${modal.item.unit} added to ${modal.item.name}.`);
      setModal(null);
      reload();
      if (updated) {
        // no-op: reload above refreshes the table
      }
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    setBusy(true);
    try {
      await api.deleteItem(modal.item.id);
      toast.success("Item deleted", `${modal.item.name} was removed from your stock.`);
      setModal(null);
      reload();
      reloadCategories();
    } catch (err) {
      toast.error("Could not delete item", err.message);
      setModal(null);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    if (!list.length) {
      toast.info("Nothing to export", "Add a few stock items first.");
      return;
    }
    const header = [
      "Name",
      "SKU",
      "Category",
      "Unit",
      "Available",
      "Pending",
      "Min level",
      "Unit price",
      "Stock value",
      "Location",
      "Supplier",
    ];
    const rows = list.map((item) => [
      item.name,
      item.sku,
      item.category,
      item.unit,
      item.quantity,
      item.pending_quantity,
      item.min_level,
      item.unit_price,
      item.value,
      item.location || "",
      item.supplier || "",
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stock-items-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Export ready", `${list.length} items exported to CSV.`);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">
            <Package size={12} /> Catalogue
          </span>
          <h1 className="page-title">Stock items</h1>
          <p className="page-sub">Everything you own, with live availability and value.</p>
        </div>
        <div className="head-actions">
          <button className="btn btn-outline" onClick={exportCsv}>
            <Download size={16} /> Export CSV
          </button>
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> Add item
          </button>
        </div>
      </div>

      <div className="mini-stats">
        <div className="mini-stat">
          <span className="stat-icon">
            <Package size={17} />
          </span>
          <div>
            <strong>{num(totals.units)}</strong>
            <span>Units on hand</span>
          </div>
        </div>
        <div className="mini-stat">
          <span className="stat-icon green">
            <Wallet size={17} />
          </span>
          <div>
            <strong>{money(totals.value, currencySymbol)}</strong>
            <span>Total stock value</span>
          </div>
        </div>
        <div className="mini-stat">
          <span className="stat-icon amber">
            <PackagePlus size={17} />
          </span>
          <div>
            <strong>{num(totals.pending)}</strong>
            <span>Units currently issued</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search-box">
            <Search size={16} />
            <input
              className="input"
              placeholder="Search name, SKU, location or supplier…"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
          <select className="select" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">All categories</option>
            {(categories || []).map((cat) => (
              <option key={cat.name} value={cat.name}>
                {cat.name} ({cat.count})
              </option>
            ))}
          </select>
          <select className="select" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="in">In stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </select>
          <select className="select" value={sort} onChange={(event) => setSort(event.target.value)}>
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="toolbar-count">{list.length} items</span>
        </div>

        {loading ? (
          <LoadingRows rows={6} />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<SlidersHorizontal size={22} />}
            title={search || category !== "all" || status !== "all" ? "No matching items" : "Your stock is empty"}
            message={
              search || category !== "all" || status !== "all"
                ? "Try a different search or clear the filters."
                : "Add your first item and it will show up in inventory instantly."
            }
            action={
              <button className="btn btn-primary btn-sm" onClick={openCreate}>
                <Plus size={14} /> Add your first item
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
                    <th>Category</th>
                    <th>Location</th>
                    <th className="num">Available</th>
                    <th className="num">Issued</th>
                    <th className="num">Unit price</th>
                    <th className="num">Value</th>
                    <th>Status</th>
                    <th className="actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="cell-item">
                          <span className="item-glyph">{initials(item.name)}</span>
                          <div style={{ minWidth: 0 }}>
                            <strong>{item.name}</strong>
                            <span>{item.sku}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-neutral no-dot">{item.category}</span>
                      </td>
                      <td className="muted small">{item.location || "—"}</td>
                      <td className="num strong">
                        {num(item.quantity)}{" "}
                        <span className="muted small" style={{ fontWeight: 400 }}>
                          {item.unit}
                        </span>
                      </td>
                      <td className="num" style={{ color: item.pending_quantity > 0 ? "var(--brand-text)" : undefined }}>
                        {num(item.pending_quantity)}
                      </td>
                      <td className="num muted">{money(item.unit_price, currencySymbol)}</td>
                      <td className="num strong">{money(item.value, currencySymbol)}</td>
                      <td>
                        <StockBadge status={item.status} />
                      </td>
                      <td className="actions">
                        <button className="btn-icon" title="Receive stock" onClick={() => openRestock(item)}>
                          <PackagePlus size={16} />
                        </button>
                        <button className="btn-icon" title="Edit item" onClick={() => openEdit(item)}>
                          <Pencil size={15} />
                        </button>
                        <button className="btn-icon" title="Movement history" onClick={() => openHistory(item)}>
                          <History size={16} />
                        </button>
                        <button
                          className="btn-icon danger"
                          title="Delete item"
                          onClick={() => setModal({ type: "delete", item })}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="item-cards">
              {list.map((item) => (
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
                      <span>Value</span>
                      <strong>{money(item.value, currencySymbol)}</strong>
                    </div>
                  </div>
                  <div className="item-card-actions">
                    <button className="btn btn-outline btn-sm" onClick={() => openRestock(item)}>
                      <PackagePlus size={14} /> Receive
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => openEdit(item)}>
                      <Pencil size={13} /> Edit
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => openHistory(item)}>
                      <History size={14} /> History
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: "var(--danger)" }}
                      onClick={() => setModal({ type: "delete", item })}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <Modal
        open={modal?.type === "create" || modal?.type === "edit"}
        onClose={() => setModal(null)}
        title={modal?.type === "create" ? "Add stock item" : "Edit stock item"}
        subtitle={
          modal?.type === "create"
            ? "Create a new item in your stock catalogue."
            : `Update the details for ${modal?.item?.name}.`
        }
        wide
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setModal(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" form="item-form" disabled={busy}>
              {busy ? "Saving…" : modal?.type === "create" ? "Add item" : "Save changes"}
            </button>
          </>
        }
      >
        <form id="item-form" onSubmit={submitForm} className="form-grid">
          <div className="field span-2">
            <label htmlFor="item-name">Item name *</label>
            <input
              id="item-name"
              className="input"
              placeholder="e.g. Wireless Mouse"
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="field">
            <label htmlFor="item-sku">SKU / code</label>
            <input
              id="item-sku"
              className="input"
              placeholder="Auto-generated if empty"
              value={form.sku}
              onChange={(event) => updateField("sku", event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="item-category">Category</label>
            <input
              id="item-category"
              className="input"
              list="category-options"
              placeholder="General"
              value={form.category}
              onChange={(event) => updateField("category", event.target.value)}
            />
            <datalist id="category-options">
              {(categories || []).map((cat) => (
                <option key={cat.name} value={cat.name} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label htmlFor="item-unit">Unit</label>
            <select
              id="item-unit"
              className="select"
              value={form.unit}
              onChange={(event) => updateField("unit", event.target.value)}
            >
              {UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="item-qty">{modal?.type === "create" ? "Opening quantity" : "Quantity on hand"}</label>
            <input
              id="item-qty"
              className="input"
              type="number"
              min="0"
              step="any"
              placeholder="0"
              value={form.quantity}
              onChange={(event) => updateField("quantity", event.target.value)}
            />
            {modal?.type === "edit" && (
              <span className="hint">Changing this records a manual stock adjustment.</span>
            )}
          </div>
          <div className="field">
            <label htmlFor="item-min">Minimum level</label>
            <input
              id="item-min"
              className="input"
              type="number"
              min="0"
              step="any"
              placeholder="0"
              value={form.min_level}
              onChange={(event) => updateField("min_level", event.target.value)}
            />
            <span className="hint">You get a low stock warning at or below this.</span>
          </div>
          <div className="field">
            <label htmlFor="item-price">Unit price ({currencySymbol})</label>
            <input
              id="item-price"
              className="input"
              type="number"
              min="0"
              step="any"
              placeholder="0.00"
              value={form.unit_price}
              onChange={(event) => updateField("unit_price", event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="item-location">Storage location</label>
            <input
              id="item-location"
              className="input"
              placeholder="e.g. Rack A1"
              value={form.location}
              onChange={(event) => updateField("location", event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="item-supplier">Supplier</label>
            <input
              id="item-supplier"
              className="input"
              placeholder="Supplier name"
              value={form.supplier}
              onChange={(event) => updateField("supplier", event.target.value)}
            />
          </div>
          <div className="field span-2">
            <label htmlFor="item-desc">Notes</label>
            <textarea
              id="item-desc"
              className="textarea"
              placeholder="Optional description or internal note…"
              value={form.description}
              onChange={(event) => updateField("description", event.target.value)}
            />
          </div>
          {formError && <div className="form-error span-2">{formError}</div>}
        </form>
      </Modal>

      <Modal
        open={modal?.type === "restock"}
        onClose={() => setModal(null)}
        title="Receive stock"
        subtitle={modal?.item ? `Add new units of ${modal.item.name}.` : ""}
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setModal(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" form="restock-form" disabled={busy}>
              {busy ? "Adding…" : "Add to stock"}
            </button>
          </>
        }
      >
        <div className="issue-preview">
          <span className="item-glyph">{initials(modal?.item?.name || "")}</span>
          <div>
            <strong>{modal?.item?.name}</strong>
            <span>
              Currently {num(modal?.item?.quantity)} {modal?.item?.unit} available
            </span>
          </div>
        </div>
        <form id="restock-form" onSubmit={submitRestock} className="stack" style={{ gap: 14 }}>
          <div className="field">
            <label htmlFor="restock-qty">Quantity received *</label>
            <input
              id="restock-qty"
              className="input"
              type="number"
              min="0.01"
              step="any"
              placeholder="0"
              value={restockQty}
              onChange={(event) => setRestockQty(event.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="field">
            <label htmlFor="restock-note">Note</label>
            <input
              id="restock-note"
              className="input"
              placeholder="e.g. Purchase order #1042"
              value={restockNote}
              onChange={(event) => setRestockNote(event.target.value)}
            />
          </div>
          {formError && <div className="form-error">{formError}</div>}
        </form>
      </Modal>

      <Modal
        open={modal?.type === "history"}
        onClose={() => setModal(null)}
        title="Movement history"
        subtitle={modal?.item ? `${modal.item.name} · ${modal.item.sku}` : ""}
        footer={
          <button className="btn btn-outline" onClick={() => setModal(null)}>
            Close
          </button>
        }
      >
        {history.loading ? (
          <LoadingRows rows={4} height={40} />
        ) : history.rows.length === 0 ? (
          <EmptyState
            icon={<History size={22} />}
            title="No movements yet"
            message="Stock received, issued and returned will be listed here."
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {history.rows.map((row) => (
              <div
                key={row.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 2px",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <span className={`activity-icon ${row.kind}`} style={{ width: 30, height: 30 }}>
                  {row.kind === "in" ? "+" : row.kind === "out" ? "−" : row.kind === "return" ? "↩" : "~"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                    {row.kind === "in"
                      ? "Stock received"
                      : row.kind === "out"
                      ? "Issued"
                      : row.kind === "return"
                      ? "Returned"
                      : "Adjustment"}
                    {row.reference ? ` · ${row.reference}` : ""}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                    {row.note || "—"} · {dateTime(row.created_at)}
                  </div>
                </div>
                <span className={`activity-qty ${row.kind}`} style={{ whiteSpace: "nowrap" }}>
                  {row.kind === "in" || row.kind === "return" ? "+" : row.kind === "out" ? "−" : ""}
                  {num(row.quantity)} {row.item_unit}
                </span>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={modal?.type === "delete"}
        onClose={() => setModal(null)}
        onConfirm={confirmDelete}
        busy={busy}
        title="Delete this item?"
        confirmLabel="Delete item"
        message={
          <>
            <strong>{modal?.item?.name}</strong> will be permanently removed from your stock catalogue.
            Items with pending issues must be returned or cancelled first.
          </>
        }
      />
    </>
  );
}
