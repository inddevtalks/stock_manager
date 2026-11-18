import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Boxes, X } from "lucide-react";

export function Logo({ size = 40 }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size, borderRadius: size * 0.3 }}>
      <Boxes size={size * 0.52} strokeWidth={2.2} />
    </span>
  );
}

export function Modal({ open, onClose, title, subtitle, children, footer, wide = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className={`modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  busy = false,
  danger = true,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <span
          className="stat-icon rose"
          style={{ width: 40, height: 40, borderRadius: 12, flex: "none" }}
        >
          <AlertTriangle size={19} />
        </span>
        <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>{message}</p>
      </div>
    </Modal>
  );
}

const STOCK_LABELS = {
  in: ["badge-in", "In stock"],
  low: ["badge-low", "Low stock"],
  out: ["badge-out", "Out of stock"],
};

export function StockBadge({ status }) {
  const [cls, label] = STOCK_LABELS[status] || STOCK_LABELS.in;
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function IssueBadge({ status, overdue = false }) {
  if (status === "returned") return <span className="badge badge-returned">Returned</span>;
  if (overdue) return <span className="badge badge-overdue">Overdue</span>;
  return <span className="badge badge-pending">Pending</span>;
}

export function EmptyState({ icon, title, message, action }) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon || <Boxes size={24} />}</span>
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </div>
  );
}

export function LoadingRows({ rows = 5, height = 46 }) {
  return (
    <div style={{ padding: 18 }}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="skeleton skeleton-row" style={{ height }} />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="empty">
      <span className="empty-icon" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
        <AlertTriangle size={24} />
      </span>
      <h3>Could not load data</h3>
      <p>{message}</p>
      {onRetry && (
        <button className="btn btn-outline btn-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
