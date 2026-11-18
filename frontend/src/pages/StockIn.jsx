import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpFromLine,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Download,
  FileSpreadsheet,
  Layers,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
} from "lucide-react";
import { api } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { useToast } from "../context/ToastContext";
import { csvEscape, initials, num } from "../lib/format";
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingRows,
  Modal,
  StockBadge,
} from "../components/ui";

const SOURCE_META = {
  purchased: { label: "Purchased", cls: "badge-brand" },
  donation: { label: "Donation", cls: "badge-low" },
  other: { label: "Other", cls: "badge-neutral" },
};

const SORTS = [
  { value: "date", label: "Newest first" },
  { value: "name", label: "Name (A-Z)" },
  { value: "stock", label: "Lowest stock" },
  { value: "category", label: "Category" },
];

const TARGETS = [
  { key: "name", label: "Item name", required: true, hints: ["itemname", "name", "item", "particulars", "description"] },
  { key: "entry_date", label: "Date of entry", hints: ["dateofentry", "entrydate", "date", "dateadded", "purchasedate"] },
  { key: "category", label: "Category", hints: ["category", "type", "group"] },
  { key: "total_stock", label: "Total stock", hints: ["totalstock", "stock", "quantity", "qty", "total", "units"] },
  { key: "source_type", label: "Order / source", hints: ["order", "source", "ordertype", "purchasedfrom", "mode"] },
  { key: "source_detail", label: "Source detail", hints: ["details", "detail", "orderdetail", "sourcedetail", "remarks"] },
  { key: "referer", label: "Referer", hints: ["referer", "referrer", "vendor", "supplier", "donor", "givenby"] },
  { key: "notes", label: "Notes", hints: ["notes", "note", "comment"] },
];

function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "-";
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function normalizeHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function splitLine(line, delimiter) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function parseDelimited(text) {
  const cleaned = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!cleaned) return null;
  const lines = cleaned.split("\n").filter((line) => line.trim() !== "");
  if (!lines.length) return null;
  const delimiter = lines.some((line) => line.includes("\t"))
    ? "\t"
    : lines[0].split(";").length > lines[0].split(",").length
    ? ";"
    : ",";
  const grid = lines.map((line) => splitLine(line, delimiter));

  const headers = [];
  const seen = {};
  grid[0].forEach((cell, index) => {
    let label = cell || `Column ${index + 1}`;
    if (seen[label]) {
      seen[label] += 1;
      label = `${label} (${seen[label]})`;
    } else {
      seen[label] = 1;
    }
    headers.push(label);
  });

  const rows = grid
    .slice(1)
    .map((row) => headers.map((_, index) => row[index] ?? ""))
    .filter((row) => row.some((cell) => String(cell).trim() !== ""));

  return { headers, rows };
}

function downloadCsv(filename, header, rows) {
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const EMPTY_FORM = {
  name: "",
  entry_date: todayISO(),
  category: "",
  total_stock: "",
  source_type: "purchased",
  source_detail: "",
  referer: "",
  notes: "",
  extra: {},
};

export default function StockIn() {
  const toast = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [sort, setSort] = useState("date");

  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const [newColumn, setNewColumn] = useState({ label: "", field_type: "text", options: "" });
  const [columnError, setColumnError] = useState("");
  const [columnToDelete, setColumnToDelete] = useState(null);

  const [importStep, setImportStep] = useState(1);
  const [importMode, setImportMode] = useState("file");
  const [importFile, setImportFile] = useState(null);
  const [pasteText, setPasteText] = useState("");
  const [preview, setPreview] = useState(null);
  const [importRows, setImportRows] = useState(null);
  const [mapping, setMapping] = useState({});
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState("");
  const [importBusy, setImportBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (category !== "all") params.set("category", category);
    if (status !== "all") params.set("status", status);
    if (source !== "all") params.set("source", source);
    params.set("sort", sort);
    return `?${params.toString()}`;
  }, [search, category, status, source, sort]);

  const { data, loading, error, reload } = useFetch(() => api.stationery(query), [query]);

  const list = data?.items || [];
  const columns = data?.columns || [];
  const summary = data?.summary || { items: 0, units: 0, categories: 0, out_of_stock: 0, sources: {}, category_list: [] };

  function openCreate() {
    setForm({ ...EMPTY_FORM, entry_date: todayISO(), extra: {} });
    setFormError("");
    setModal({ type: "create" });
  }

  function openEdit(row) {
    setForm({
      name: row.name,
      entry_date: row.entry_date || todayISO(),
      category: row.category || "",
      total_stock: String(row.total_stock ?? ""),
      source_type: row.source_type || "purchased",
      source_detail: row.source_detail || "",
      referer: row.referer || "",
      notes: row.notes || "",
      extra: { ...(row.extra || {}) },
    });
    setFormError("");
    setModal({ type: "edit", row });
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateExtra(key, value) {
    setForm((current) => ({ ...current, extra: { ...current.extra, [key]: value } }));
  }

  async function submitForm(event) {
    event.preventDefault();
    setFormError("");
    if (!form.name.trim()) {
      setFormError("Item name is required.");
      return;
    }
    const stock = form.total_stock === "" ? 0 : Number(form.total_stock);
    if (!Number.isFinite(stock) || stock < 0) {
      setFormError("Total stock must be a number of 0 or more.");
      return;
    }
    if (form.source_type === "other" && !form.source_detail.trim()) {
      setFormError('Tell us what the "other" source was.');
      return;
    }
    const payload = {
      name: form.name.trim(),
      entry_date: form.entry_date || null,
      category: form.category.trim() || "General",
      total_stock: stock,
      source_type: form.source_type,
      source_detail: form.source_detail.trim() || null,
      referer: form.referer.trim() || null,
      notes: form.notes.trim() || null,
      extra: form.extra,
    };
    setBusy(true);
    try {
      if (modal.type === "create") {
        await api.createStationery(payload);
        toast.success("Stock in added", `${payload.name} is now in your register.`);
      } else {
        await api.updateStationery(modal.row.id, payload);
        toast.success("Entry updated", `${payload.name} has been saved.`);
      }
      setModal(null);
      reload();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    setBusy(true);
    try {
      await api.deleteStationery(modal.row.id);
      toast.success("Entry deleted", `${modal.row.name} was removed from the register.`);
      setModal(null);
      reload();
    } catch (err) {
      toast.error("Could not delete entry", err.message);
      setModal(null);
    } finally {
      setBusy(false);
    }
  }

  async function addColumn(event) {
    event.preventDefault();
    setColumnError("");
    const label = newColumn.label.trim();
    if (!label) {
      setColumnError("Column name is required.");
      return;
    }
    const options =
      newColumn.field_type === "select"
        ? newColumn.options.split(",").map((option) => option.trim()).filter(Boolean)
        : [];
    if (newColumn.field_type === "select" && !options.length) {
      setColumnError("Add at least one dropdown option, separated by commas.");
      return;
    }
    setBusy(true);
    try {
      await api.addStationeryColumn({ label, field_type: newColumn.field_type, options });
      toast.success("Column added", `"${label}" is now available for every entry.`);
      setNewColumn({ label: "", field_type: "text", options: "" });
      reload();
    } catch (err) {
      setColumnError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmColumnDelete() {
    setBusy(true);
    try {
      await api.deleteStationeryColumn(columnToDelete.id);
      toast.success("Column removed", `"${columnToDelete.label}" was removed from the register.`);
      setColumnToDelete(null);
      reload();
    } catch (err) {
      toast.error("Could not remove column", err.message);
      setColumnToDelete(null);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    if (!list.length) {
      toast.info("Nothing to export", "Add a few stock-in rows first.");
      return;
    }
    const header = [
      "Item name",
      "Date of entry",
      "Category",
      "Total stock",
      "Taken out",
      "Status",
      "Order",
      "Order detail",
      "Referer",
      "Notes",
      ...columns.map((column) => column.label),
    ];
    const rows = list.map((row) => [
      row.name,
      row.entry_date || "",
      row.category,
      row.total_stock,
      row.taken_out || 0,
      row.status === "out" ? "Out of stock" : "In stock",
      SOURCE_META[row.source_type]?.label || "Other",
      row.source_detail || "",
      row.referer || "",
      row.notes || "",
      ...columns.map((column) => row.extra?.[column.key] || ""),
    ]);
    downloadCsv(`stock-in-${todayISO()}.csv`, header, rows);
    toast.success("Export ready", `${list.length} rows exported to CSV.`);
  }

  function downloadTemplate() {
    const header = [
      "Item Name",
      "Date of Entry",
      "Category",
      "Total Stock",
      "Order",
      "Details",
      "Referer",
      "Notes",
      ...columns.map((column) => column.label),
    ];
    const sample = [
      "A4 Paper Ream",
      todayISO(),
      "Paper",
      "10",
      "Purchased",
      "PO-1001",
      "PaperMart",
      "",
      ...columns.map(() => ""),
    ];
    downloadCsv("stock-in-template.csv", header, [sample]);
  }

  // ---------------------------------------------------------------- importing

  function resetImport() {
    setImportStep(1);
    setImportMode("file");
    setImportFile(null);
    setPasteText("");
    setPreview(null);
    setImportRows(null);
    setMapping({});
    setImportResult(null);
    setImportError("");
    setImportBusy(false);
  }

  function openImport() {
    resetImport();
    setModal({ type: "import" });
  }

  function autoMap(headers) {
    const targets = [
      ...TARGETS,
      ...columns.map((column) => ({
        key: `extra:${column.key}`,
        label: column.label,
        hints: [normalizeHeader(column.label)],
      })),
    ];
    const next = {};
    headers.forEach((header, index) => {
      const normalized = normalizeHeader(header);
      const match = targets.find((target) =>
        target.hints.some((hint) => normalized.includes(hint))
      );
      if (match && next[match.key] === undefined) next[match.key] = header;
    });
    return next;
  }

  async function handleFileSelect(file) {
    setImportFile(file);
    setImportError("");
    if (!file) {
      setPreview(null);
      setImportRows(null);
      return;
    }
    setImportBusy(true);
    try {
      const result = await api.previewStationeryImport(file);
      setPreview(result);
      setImportRows(null);
      setMapping(autoMap(result.headers || []));
    } catch (err) {
      setImportError(err.message);
      setPreview(null);
    } finally {
      setImportBusy(false);
    }
  }

  function handlePaste() {
    const parsed = parseDelimited(pasteText);
    if (!parsed) {
      setImportError("Paste a table with a header row first.");
      return;
    }
    setPreview({ headers: parsed.headers, rows: parsed.rows.slice(0, 8), total_rows: parsed.rows.length, sheet: null });
    setImportRows(parsed.rows);
    setMapping(autoMap(parsed.headers));
    setImportError("");
  }

  function buildMappingPayload() {
    const payload = { extra: {} };
    Object.entries(mapping).forEach(([key, header]) => {
      if (!header) return;
      if (key.startsWith("extra:")) payload.extra[key.slice(6)] = header;
      else payload[key] = header;
    });
    return payload;
  }

  function buildRowsFromPreview() {
    if (!preview?.headers || !importRows) return [];
    const headers = preview.headers;
    const index = Object.fromEntries(headers.map((header, position) => [header, position]));
    return importRows.map((row) => {
      const payload = {};
      Object.entries(mapping).forEach(([key, header]) => {
        if (!header) return;
        const position = index[header];
        const value = position === undefined ? null : row[position];
        if (key.startsWith("extra:")) {
          payload.extra = payload.extra || {};
          payload.extra[key.slice(6)] = value;
        } else {
          payload[key] = value;
        }
      });
      return payload;
    });
  }

  async function runImport() {
    setImportBusy(true);
    setImportError("");
    try {
      let result;
      if (importMode === "file" && importFile) {
        result = await api.importStationery(importFile, buildMappingPayload());
      } else {
        const rows = buildRowsFromPreview();
        result = await api.bulkStationery(rows);
      }
      setImportResult(result);
      setImportStep(3);
      reload();
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImportBusy(false);
    }
  }

  const mapTargets = [
    ...TARGETS,
    ...columns.map((column) => ({
      key: `extra:${column.key}`,
      label: column.label,
      custom: true,
    })),
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">
            <ClipboardList size={12} /> Inventory - Stock In register
          </span>
          <h1 className="page-title">Stock In</h1>
          <p className="page-sub">
            Everything you have brought in - where it came from, who referred it and how much is left.
          </p>
        </div>
        <div className="head-actions">
          <Link to="/stock-out" className="btn btn-outline">
            <ArrowUpFromLine size={16} /> Stock out
          </Link>
          <button className="btn btn-outline" onClick={() => setModal({ type: "columns" })}>
            <SlidersHorizontal size={16} /> Columns
          </button>
          <button className="btn btn-outline" onClick={openImport}>
            <Upload size={16} /> Bulk add
          </button>
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> Add item
          </button>
        </div>
      </div>

      <div className="mini-stats four">
        <div className="mini-stat">
          <span className="stat-icon">
            <ClipboardList size={17} />
          </span>
          <div>
            <strong>{num(summary.items)}</strong>
            <span>Items tracked</span>
          </div>
        </div>
        <div className="mini-stat">
          <span className="stat-icon green">
            <Layers size={17} />
          </span>
          <div>
            <strong>{num(summary.units)}</strong>
            <span>Units in stock</span>
          </div>
        </div>
        <div className="mini-stat">
          <span className="stat-icon blue">
            <Boxes size={17} />
          </span>
          <div>
            <strong>{num(summary.categories)}</strong>
            <span>Categories</span>
          </div>
        </div>
        <div className="mini-stat">
          <span className="stat-icon rose">
            <AlertTriangle size={17} />
          </span>
          <div>
            <strong>{num(summary.out_of_stock)}</strong>
            <span>Out of stock</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search-box">
            <Search size={16} />
            <input
              className="input"
              placeholder="Search item, category, referer or source..."
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
          <select className="select" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">All categories</option>
            {(summary.category_list || []).map((entry) => (
              <option key={entry.name} value={entry.name}>
                {entry.name} ({entry.count})
              </option>
            ))}
          </select>
          <select className="select" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="in">In stock</option>
            <option value="out">Out of stock</option>
          </select>
          <select className="select" value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="all">All sources</option>
            <option value="purchased">Purchased</option>
            <option value="donation">Donation</option>
            <option value="other">Other</option>
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
          <span className="toolbar-count">{list.length} rows</span>
        </div>

        {loading ? (
          <LoadingRows rows={6} />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<ClipboardList size={22} />}
            title={search || category !== "all" || status !== "all" || source !== "all" ? "No matching rows" : "Your register is empty"}
            message={
              search || category !== "all" || status !== "all" || source !== "all"
                ? "Try a different search or clear the filters."
                : "Add stock-in items one by one, or paste/upload a spreadsheet to fill it in seconds."
            }
            action={
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                <button className="btn btn-primary btn-sm" onClick={openCreate}>
                  <Plus size={14} /> Add item
                </button>
                <button className="btn btn-outline btn-sm" onClick={openImport}>
                  <Upload size={14} /> Bulk add
                </button>
              </div>
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Date of entry</th>
                    <th>Category</th>
                    <th className="num">Total stock</th>
                    <th>Status</th>
                    <th>Order</th>
                    <th>Referer</th>
                    {columns.map((column) => (
                      <th key={column.key}>{column.label}</th>
                    ))}
                    <th className="actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div className="cell-item">
                          <span className="item-glyph">{initials(row.name)}</span>
                          <div style={{ minWidth: 0 }}>
                            <strong>{row.name}</strong>
                            {row.notes && <span className="truncate-note">{row.notes}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="muted small">{formatDate(row.entry_date)}</td>
                      <td>
                        <span className="badge badge-neutral no-dot">{row.category}</span>
                      </td>
                      <td className="num strong">
                        {num(row.total_stock)}
                        {row.taken_out > 0 && (
                          <span className="cell-sub">{num(row.taken_out)} taken out</span>
                        )}
                        {row.pending_out > 0 && (
                          <span className="cell-sub" style={{ color: "var(--warning, #f59e0b)" }}>{num(row.pending_out)} pending</span>
                        )}
                      </td>
                      <td>
                        <StockBadge status={row.status} />
                      </td>
                      <td>
                        <SourceBadge type={row.source_type} />
                        {row.source_detail && (
                          <div className="muted small" style={{ marginTop: 3 }}>
                            {row.source_detail}
                          </div>
                        )}
                      </td>
                      <td className="muted small">{row.referer || "-"}</td>
                      {columns.map((column) => (
                        <td key={column.key} className="small">
                          {row.extra?.[column.key] || "-"}
                        </td>
                      ))}
                      <td className="actions">
                        <button className="btn-icon" title="Edit entry" onClick={() => openEdit(row)}>
                          <Pencil size={15} />
                        </button>
                        <button
                          className="btn-icon danger"
                          title="Delete entry"
                          onClick={() => setModal({ type: "delete", row })}
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
              {list.map((row) => (
                <div className="item-card" key={row.id}>
                  <div className="item-card-top">
                    <div className="cell-item">
                      <span className="item-glyph">{initials(row.name)}</span>
                      <div style={{ minWidth: 0 }}>
                        <strong>{row.name}</strong>
                        <span>
                          {row.category} - {formatDate(row.entry_date)}
                        </span>
                      </div>
                    </div>
                    <StockBadge status={row.status} />
                  </div>
                  <div className="item-card-stats">
                    <div>
                      <span>Stock</span>
                      <strong>{num(row.total_stock)}</strong>
                    </div>
                    <div>
                      <span>Order</span>
                      <strong>{SOURCE_META[row.source_type]?.label || "Other"}</strong>
                    </div>
                    <div>
                      <span>Referer</span>
                      <strong>{row.referer || "-"}</strong>
                    </div>
                  </div>
                  {row.taken_out > 0 && (
                    <div className="muted small" style={{ marginBottom: 10 }}>
                      {num(row.taken_out)} taken out via Stock Out - {num(row.total_stock)} remaining
                    </div>
                  )}
                  {row.source_detail && (
                    <div className="muted small" style={{ marginBottom: 10 }}>
                      {row.source_detail}
                    </div>
                  )}
                  {columns.length > 0 && (
                    <div className="stationery-extra">
                      {columns
                        .filter((column) => row.extra?.[column.key])
                        .map((column) => (
                          <span key={column.key}>
                            <em>{column.label}</em>
                            {row.extra[column.key]}
                          </span>
                        ))}
                    </div>
                  )}
                  <div className="item-card-actions">
                    <button className="btn btn-outline btn-sm" onClick={() => openEdit(row)}>
                      <Pencil size={13} /> Edit
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: "var(--danger)" }}
                      onClick={() => setModal({ type: "delete", row })}
                    >
                      <Trash2 size={14} /> Delete
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
        title={modal?.type === "create" ? "Add stock in" : "Edit stock in"}
        subtitle={
          modal?.type === "create"
            ? "Record what you have, where it came from and who referred it."
            : `Update the details for ${modal?.row?.name}.`
        }
        wide
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setModal(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" form="stationery-form" disabled={busy}>
              {busy ? "Saving..." : modal?.type === "create" ? "Add item" : "Save changes"}
            </button>
          </>
        }
      >
        <form id="stationery-form" className="form-grid" onSubmit={submitForm}>
          <div className="field span-2">
            <label htmlFor="st-name">Item name *</label>
            <input
              id="st-name"
              className="input"
              placeholder="e.g. A4 Paper Ream"
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="field">
            <label htmlFor="st-date">Date of entry</label>
            <input
              id="st-date"
              className="input"
              type="date"
              value={form.entry_date}
              onChange={(event) => updateField("entry_date", event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="st-category">Category</label>
            <input
              id="st-category"
              className="input"
              list="stationery-categories"
              placeholder="e.g. Paper"
              value={form.category}
              onChange={(event) => updateField("category", event.target.value)}
            />
            <datalist id="stationery-categories">
              {(summary.category_list || []).map((entry) => (
                <option key={entry.name} value={entry.name} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label htmlFor="st-stock">Total stock</label>
            <input
              id="st-stock"
              className="input"
              type="number"
              min="0"
              step="any"
              placeholder="0"
              value={form.total_stock}
              onChange={(event) => updateField("total_stock", event.target.value)}
            />
            <span className="hint">Zero means it shows as out of stock. Stock-out reduces this automatically.</span>
          </div>
          <div className="field">
            <label htmlFor="st-source">Order / source</label>
            <select
              id="st-source"
              className="select"
              value={form.source_type}
              onChange={(event) => updateField("source_type", event.target.value)}
            >
              <option value="purchased">Purchased</option>
              <option value="donation">Donation</option>
              <option value="other">Other</option>
            </select>
          </div>
          {form.source_type === "other" && (
            <div className="field">
              <label htmlFor="st-source-detail">What was it? *</label>
              <input
                id="st-source-detail"
                className="input"
                placeholder="e.g. Returned from event stock"
                value={form.source_detail}
                onChange={(event) => updateField("source_detail", event.target.value)}
                required
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="st-referer">Referer</label>
            <input
              id="st-referer"
              className="input"
              placeholder="Vendor, donor or person"
              value={form.referer}
              onChange={(event) => updateField("referer", event.target.value)}
            />
          </div>
          {columns.map((column) => (
            <div className="field" key={column.key}>
              <label htmlFor={`st-extra-${column.key}`}>{column.label}</label>
              {column.field_type === "select" ? (
                <select
                  id={`st-extra-${column.key}`}
                  className="select"
                  value={form.extra[column.key] || ""}
                  onChange={(event) => updateExtra(column.key, event.target.value)}
                >
                  <option value="">-</option>
                  {(column.options || []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={`st-extra-${column.key}`}
                  className="input"
                  type={column.field_type === "number" ? "number" : column.field_type === "date" ? "date" : "text"}
                  value={form.extra[column.key] || ""}
                  onChange={(event) => updateExtra(column.key, event.target.value)}
                />
              )}
            </div>
          ))}
          <div className="field span-2">
            <label htmlFor="st-notes">Notes</label>
            <textarea
              id="st-notes"
              className="textarea"
              placeholder="Optional note about this entry..."
              value={form.notes}
              onChange={(event) => updateField("notes", event.target.value)}
            />
          </div>
          {formError && <div className="form-error span-2">{formError}</div>}
        </form>
      </Modal>

      <Modal
        open={modal?.type === "columns"}
        onClose={() => setModal(null)}
        title="Manage columns"
        subtitle="Add your own columns to the register. They appear for every entry and in bulk imports."
        footer={
          <button className="btn btn-outline" onClick={() => setModal(null)}>
            Close
          </button>
        }
      >
        <form className="form-grid" onSubmit={addColumn}>
          <div className="field span-2">
            <label htmlFor="col-label">Column name</label>
            <input
              id="col-label"
              className="input"
              placeholder="e.g. Shelf, Bin, Location"
              value={newColumn.label}
              onChange={(event) => setNewColumn((current) => ({ ...current, label: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="col-type">Type</label>
            <select
              id="col-type"
              className="select"
              value={newColumn.field_type}
              onChange={(event) => setNewColumn((current) => ({ ...current, field_type: event.target.value }))}
            >
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="date">Date</option>
              <option value="select">Dropdown</option>
            </select>
          </div>
          {newColumn.field_type === "select" && (
            <div className="field">
              <label htmlFor="col-options">Options (comma separated)</label>
              <input
                id="col-options"
                className="input"
                placeholder="A, B, C"
                value={newColumn.options}
                onChange={(event) => setNewColumn((current) => ({ ...current, options: event.target.value }))}
              />
            </div>
          )}
          {columnError && <div className="form-error span-2">{columnError}</div>}
          <div className="field span-2" style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
              <Plus size={14} /> Add column
            </button>
          </div>
        </form>

        {columns.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div className="muted small" style={{ marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Existing columns
            </div>
            <div className="column-list">
              {columns.map((column) => (
                <div className="column-chip" key={column.id}>
                  <span>
                    {column.label} <em>({column.field_type})</em>
                  </span>
                  <button
                    className="btn-icon danger"
                    title="Remove column"
                    onClick={() => setColumnToDelete(column)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={modal?.type === "delete"}
        onClose={() => setModal(null)}
        title="Delete entry?"
        subtitle={modal?.row ? `Remove "${modal.row.name}" from the register.` : ""}
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setModal(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={confirmDelete} disabled={busy}>
              {busy ? "Deleting..." : "Delete"}
            </button>
          </>
        }
      >
        <p className="muted">This cannot be undone. Stock-out records for this item must be undone first.</p>
      </Modal>

      <ConfirmDialog
        open={Boolean(columnToDelete)}
        title="Remove column?"
        message={columnToDelete ? `"${columnToDelete.label}" will be removed from every entry.` : ""}
        confirmLabel="Remove"
        danger
        busy={busy}
        onClose={() => setColumnToDelete(null)}
        onConfirm={confirmColumnDelete}
      />

      {/* ---------------------------------------------------- bulk import */}
      <Modal
        open={modal?.type === "import"}
        onClose={() => setModal(null)}
        title="Bulk add stock in"
        subtitle="Upload a spreadsheet, paste a table, or use the CSV template."
        wide
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setModal(null)} disabled={importBusy}>
              Cancel
            </button>
            {importStep === 2 && (
              <button className="btn btn-primary" onClick={runImport} disabled={importBusy}>
                {importBusy ? "Importing..." : `Import ${importRows?.length || preview?.total_rows || 0} row${(importRows?.length || preview?.total_rows || 0) === 1 ? "" : "s"}`}
              </button>
            )}
            {importStep === 3 && (
              <button className="btn btn-primary" onClick={() => setModal(null)}>
                Done
              </button>
            )}
          </>
        }
      >
        {importStep === 1 && (
          <div className="import-step">
            <div className="import-modes">
              <button
                className={`import-mode${importMode === "file" ? " active" : ""}`}
                onClick={() => setImportMode("file")}
              >
                <FileSpreadsheet size={18} /> Upload file
              </button>
              <button
                className={`import-mode${importMode === "paste" ? " active" : ""}`}
                onClick={() => setImportMode("paste")}
              >
                <ClipboardList size={18} /> Paste table
              </button>
            </div>

            {importMode === "file" ? (
              <div className="import-file">
                <input
                  type="file"
                  accept=".csv,.tsv,.txt,.xlsx,.xlsm"
                  onChange={(event) => handleFileSelect(event.target.files?.[0])}
                />
                <button className="btn btn-outline btn-sm" onClick={downloadTemplate}>
                  <Download size={14} /> Download template
                </button>
              </div>
            ) : (
              <div className="import-paste">
                <textarea
                  className="textarea"
                  placeholder="Paste rows from Excel or a CSV here..."
                  value={pasteText}
                  onChange={(event) => setPasteText(event.target.value)}
                />
                <button className="btn btn-primary btn-sm" onClick={handlePaste} disabled={!pasteText.trim()}>
                  Parse pasted table
                </button>
              </div>
            )}

            {importError && <div className="form-error">{importError}</div>}

            {preview && (
              <div className="import-preview-block">
                <div className="import-hint">
                  {preview.total_rows} data row{preview.total_rows === 1 ? "" : "s"} detected
                  {preview.sheet ? ` (sheet: ${preview.sheet})` : ""}.
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => setImportStep(2)}>
                  Map columns
                </button>
              </div>
            )}
          </div>
        )}

        {importStep === 2 && preview && (
          <div className="import-step">
            <div className="map-grid">
              {mapTargets.map((target) => (
                <div className="map-field" key={target.key}>
                  <label>{target.label}{target.required ? " *" : ""}</label>
                  <select
                    className="select"
                    value={mapping[target.key] || ""}
                    onChange={(event) =>
                      setMapping((current) => ({ ...current, [target.key]: event.target.value }))
                    }
                  >
                    <option value="">- Not mapped -</option>
                    {preview.headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="import-preview">
              <table>
                <thead>
                  <tr>
                    {preview.headers.map((header) => (
                      <th key={header}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(preview.rows || []).map((row, index) => (
                    <tr key={index}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {importStep === 3 && importResult && (
          <div className="import-step">
            <div className="import-result">
              <CheckCircle2 size={20} />
              <strong>{importResult.created} row{importResult.created === 1 ? "" : "s"} imported</strong>
              {importResult.failed?.length > 0 && (
                <span>{importResult.failed.length} row{importResult.failed.length === 1 ? "" : "s"} skipped.</span>
              )}
            </div>
            {importResult.failed?.length > 0 && (
              <ul className="import-failures">
                {importResult.failed.slice(0, 20).map((failure, index) => (
                  <li key={index}>
                    Row {failure.row}: {failure.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

function SourceBadge({ type }) {
  const meta = SOURCE_META[type] || SOURCE_META.other;
  return <span className={`badge ${meta.cls} no-dot`}>{meta.label}</span>;
}
