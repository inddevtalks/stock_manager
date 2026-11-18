"""Stationery register: rows, admin-defined columns and bulk import."""

import csv
import io
import json
import re
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import StationeryField, StationeryItem, StationeryOut, User, utcnow
from ..schemas import StationeryBulkIn, StationeryFieldIn, StationeryIn, StationeryOutIn
from ..security import get_current_user
from ..serializers import iso

router = APIRouter(prefix="/api/stationery", tags=["stationery"])

SOURCE_TYPES = ("purchased", "donation", "other")
FIELD_TYPES = ("text", "number", "date", "select")
MAX_IMPORT_ROWS = 5000
MAX_UPLOAD_BYTES = 15 * 1024 * 1024

DATE_FORMATS = (
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%d-%m-%Y",
    "%Y/%m/%d",
    "%m/%d/%Y",
    "%d %b %Y",
    "%d %B %Y",
    "%b %d, %Y",
    "%B %d, %Y",
    "%d.%m.%Y",
)


# --------------------------------------------------------------------------- helpers


def _clean(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def parse_date(value: Any) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    if not text:
        return None
    if re.fullmatch(r"\d{5}(\.\d+)?", text):
        # Excel serial date
        try:
            return (datetime(1899, 12, 30) + timedelta(days=float(text))).date()
        except (ValueError, OverflowError):
            pass
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def parse_number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(",", "").replace(" ", "")
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    return float(match.group()) if match else None


def normalize_source(raw_type: Any, raw_detail: Any) -> tuple[str, str | None]:
    text = _clean(raw_type).lower()
    detail = _clean(raw_detail) or None
    if text in {"purchased", "purchase", "bought", "buy", "paid", "order", "ordered", "vendor"}:
        return "purchased", detail
    if text in {"donation", "donated", "donate", "gift", "gifted", "free", "sponsor", "sponsored"}:
        return "donation", detail
    if text in {"other", "others", "misc", "miscellaneous"}:
        return "other", detail
    if text:
        return "other", detail or _clean(raw_type)
    return "purchased", detail


def parse_datetime(value: Any) -> datetime | None:
    """Accept ISO datetimes (from the browser) or plain dates."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        text = str(value).strip()
        if not text:
            return None
        try:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            parsed_date = parse_date(text)
            if parsed_date is None:
                return None
            return datetime.combine(parsed_date, time(12, 0))
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def build_row(payload: dict, existing: StationeryItem | None = None) -> StationeryItem:
    name = _clean(payload.get("name"))
    if not name:
        raise ValueError("Item name is required.")

    entry = parse_date(payload.get("entry_date"))
    if entry is None:
        entry = existing.entry_date if existing is not None else date.today()

    stock = parse_number(payload.get("total_stock"))
    if stock is None:
        stock = 0.0
    if stock < 0:
        raise ValueError("Total stock cannot be negative.")

    source_type, source_detail = normalize_source(
        payload.get("source_type"), payload.get("source_detail")
    )

    extra_raw = payload.get("extra") or {}
    extra: dict[str, str] = {}
    if isinstance(extra_raw, dict):
        for key, value in extra_raw.items():
            text = _clean(value)
            if text:
                extra[str(key)] = text

    return StationeryItem(
        name=name[:160],
        entry_date=entry,
        category=(_clean(payload.get("category")) or "General")[:80],
        total_stock=stock,
        source_type=source_type,
        source_detail=source_detail[:200] if source_detail else None,
        referer=_clean(payload.get("referer"))[:160] or None,
        notes=_clean(payload.get("notes")) or None,
        extra=json.dumps(extra, ensure_ascii=False),
    )


def row_to_dict(row: StationeryItem, taken_out: float = 0.0, pending_out: float = 0.0) -> dict:
    stock = float(row.total_stock or 0)
    try:
        extra = json.loads(row.extra or "{}")
    except (TypeError, ValueError):
        extra = {}
    return {
        "id": row.id,
        "name": row.name,
        "entry_date": row.entry_date.isoformat() if row.entry_date else None,
        "category": row.category or "General",
        "total_stock": stock,
        "taken_out": float(taken_out or 0),
        "pending_out": float(pending_out or 0),
        "status": "in" if stock > 0 else "out",
        "source_type": row.source_type or "purchased",
        "source_detail": row.source_detail,
        "referer": row.referer,
        "notes": row.notes,
        "extra": extra if isinstance(extra, dict) else {},
        "created_at": iso(row.created_at),
        "updated_at": iso(row.updated_at),
    }


def out_to_dict(
    record: StationeryOut,
    item: StationeryItem | None = None,
    member: User | None = None,
) -> dict:
    return {
        "id": record.id,
        "stationery_id": record.stationery_id,
        "member_id": record.member_id,
        "member_name": member.name if member else None,
        "status": record.status or "pending",
        "approved_at": iso(record.approved_at) if record.approved_at else None,
        "approved_by": record.approved_by,
        "item_name": item.name if item else "Deleted item",
        "item_category": (item.category or "General") if item else "General",
        "quantity": float(record.quantity or 0),
        "taken_by": record.taken_by,
        "department": record.department,
        "purpose": record.purpose,
        "note": record.note,
        "taken_at": iso(record.taken_at),
        "created_by": record.created_by,
        "remaining": float(item.total_stock or 0) if item else 0.0,
        "available": float(item.total_stock or 0) if item else 0.0,
    }


def field_to_dict(field: StationeryField) -> dict:
    try:
        options = json.loads(field.options or "[]")
    except (TypeError, ValueError):
        options = []
    return {
        "id": field.id,
        "key": field.key,
        "label": field.label,
        "field_type": field.field_type,
        "options": options if isinstance(options, list) else [],
        "position": field.position,
    }


def _summary(rows: list[StationeryItem]) -> dict:
    sources = {"purchased": 0, "donation": 0, "other": 0}
    categories: dict[str, int] = {}
    units = 0.0
    out_of_stock = 0
    for row in rows:
        stock = float(row.total_stock or 0)
        units += stock
        if stock <= 0:
            out_of_stock += 1
        sources[row.source_type if row.source_type in sources else "other"] += 1
        name = row.category or "General"
        categories[name] = categories.get(name, 0) + 1
    return {
        "items": len(rows),
        "units": units,
        "categories": len(categories),
        "out_of_stock": out_of_stock,
        "sources": sources,
        "category_list": [
            {"name": name, "count": count}
            for name, count in sorted(categories.items(), key=lambda pair: pair[0].lower())
        ],
    }


def _out_summary(records: list[StationeryOut], items: list[StationeryItem]) -> dict:
    approved = [r for r in records if (r.status or "pending") == "approved"]
    pending = [r for r in records if (r.status or "pending") == "pending"]
    return {
        "records": len(records),
        "approved_records": len(approved),
        "pending_records": len(pending),
        "units_out": sum(float(record.quantity or 0) for record in approved),
        "pending_units": sum(float(record.quantity or 0) for record in pending),
        "people": len({record.taken_by for record in records if record.taken_by}),
        "items": len({record.stationery_id for record in records}),
        "remaining_units": sum(float(item.total_stock or 0) for item in items),
        "in_items": len(items),
    }


def _slug(label: str, existing: set[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_") or "field"
    key = base[:48]
    suffix = 2
    while key in existing:
        key = f"{base[:45]}_{suffix}"
        suffix += 1
    return key


# ------------------------------------------------------------------------ file parsing


def _decode_text(content: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-16", "cp1252", "latin-1"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="replace")


def _normalize_table(rows: list[list[Any]]) -> tuple[list[str], list[list[Any]]]:
    # Drop leading blank rows.
    while rows and not any(_clean(cell) for cell in rows[0]):
        rows.pop(0)
    if not rows:
        return [], []

    raw_headers = rows[0]
    headers: list[str] = []
    seen: dict[str, int] = {}
    for index, cell in enumerate(raw_headers):
        label = _clean(cell) or f"Column {index + 1}"
        if label in seen:
            seen[label] += 1
            label = f"{label} ({seen[label]})"
        else:
            seen[label] = 1
        headers.append(label)

    data: list[list[Any]] = []
    for row in rows[1:]:
        row = list(row) + [None] * max(0, len(headers) - len(row))
        trimmed = row[: len(headers)]
        if not any(_clean(cell) for cell in trimmed):
            continue
        data.append(trimmed)
    return headers, data


def _read_table(filename: str, content: bytes) -> tuple[str | None, list[str], list[list[Any]]]:
    name = (filename or "").lower()
    if name.endswith((".xlsx", ".xlsm")):
        try:
            from openpyxl import load_workbook
        except ImportError as exc:  # pragma: no cover - dependency hint
            raise HTTPException(
                status_code=400,
                detail="Excel import needs the 'openpyxl' package. Run: pip install openpyxl",
            ) from exc
        try:
            workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Could not read that Excel file.") from exc
        sheet = workbook.active
        rows = [list(row) for row in sheet.iter_rows(values_only=True)]
        sheet_name = sheet.title
        workbook.close()
        headers, data = _normalize_table(rows)
        return sheet_name, headers, data

    if name.endswith((".csv", ".tsv", ".txt")):
        text = _decode_text(content)
        try:
            dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t|")
            delimiter = dialect.delimiter
        except csv.Error:
            delimiter = "\t" if name.endswith(".tsv") else ","
        rows = [list(row) for row in csv.reader(io.StringIO(text), delimiter=delimiter)]
        headers, data = _normalize_table(rows)
        return None, headers, data

    raise HTTPException(
        status_code=400,
        detail="Unsupported file type. Upload a .csv or .xlsx file.",
    )


def _display(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


# -------------------------------------------------------------------------- endpoints


@router.get("")
def list_stationery(
    search: str | None = None,
    category: str | None = None,
    status: str | None = None,
    source: str | None = None,
    sort: str = "date",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(StationeryItem)
    if search and search.strip():
        like = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(StationeryItem.name).like(like),
                func.lower(StationeryItem.category).like(like),
                func.lower(func.coalesce(StationeryItem.referer, "")).like(like),
                func.lower(func.coalesce(StationeryItem.source_detail, "")).like(like),
                func.lower(func.coalesce(StationeryItem.notes, "")).like(like),
            )
        )
    if category and category != "all":
        stmt = stmt.where(StationeryItem.category == category)
    if source and source != "all":
        stmt = stmt.where(StationeryItem.source_type == source)
    if status == "in":
        stmt = stmt.where(StationeryItem.total_stock > 0)
    elif status == "out":
        stmt = stmt.where(StationeryItem.total_stock <= 0)

    if sort == "name":
        stmt = stmt.order_by(func.lower(StationeryItem.name))
    elif sort == "stock":
        stmt = stmt.order_by(StationeryItem.total_stock.asc(), func.lower(StationeryItem.name))
    elif sort == "category":
        stmt = stmt.order_by(func.lower(StationeryItem.category), func.lower(StationeryItem.name))
    else:
        stmt = stmt.order_by(StationeryItem.entry_date.desc(), StationeryItem.id.desc())

    rows = db.scalars(stmt).all()
    all_rows = db.scalars(select(StationeryItem)).all()
    fields = db.scalars(select(StationeryField).order_by(StationeryField.position, StationeryField.id)).all()
    approved_totals = dict(
        db.execute(
            select(StationeryOut.stationery_id, func.sum(StationeryOut.quantity)).where(
                StationeryOut.status == "approved"
            ).group_by(StationeryOut.stationery_id)
        ).all()
    )
    pending_totals = dict(
        db.execute(
            select(StationeryOut.stationery_id, func.sum(StationeryOut.quantity)).where(
                StationeryOut.status == "pending"
            ).group_by(StationeryOut.stationery_id)
        ).all()
    )

    return {
        "items": [row_to_dict(row, float(approved_totals.get(row.id, 0) or 0), float(pending_totals.get(row.id, 0) or 0)) for row in rows],
        "columns": [field_to_dict(field) for field in fields],
        "summary": _summary(list(all_rows)),
    }


@router.get("/overview")
def stationery_overview(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    items = list(db.scalars(select(StationeryItem)).all())
    records = list(db.scalars(select(StationeryOut)).all())
    summary = _summary(items)
    summary["units_out"] = sum(float(record.quantity or 0) for record in records)
    return {"in": summary, "out": _out_summary(records, items)}


@router.post("", status_code=201)
def create_stationery(
    payload: StationeryIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        row = build_row(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.add(row)
    db.commit()
    db.refresh(row)
    return row_to_dict(row)


@router.put("/{row_id}")
def update_stationery(
    row_id: int,
    payload: StationeryIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(StationeryItem, row_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Stationery item not found.")
    try:
        updated = build_row(payload.model_dump(), existing=row)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    row.name = updated.name
    row.entry_date = updated.entry_date
    row.category = updated.category
    row.total_stock = updated.total_stock
    row.source_type = updated.source_type
    row.source_detail = updated.source_detail
    row.referer = updated.referer
    row.notes = updated.notes
    row.extra = updated.extra
    db.commit()
    db.refresh(row)
    return row_to_dict(row)


@router.delete("/{row_id}")
def delete_stationery(
    row_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(StationeryItem, row_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Stationery item not found.")
    out_count = (
        db.scalar(
            select(func.count(StationeryOut.id)).where(
                StationeryOut.stationery_id == row_id
            )
        )
        or 0
    )
    if out_count:
        raise HTTPException(
            status_code=400,
            detail=(
                f"This item has {out_count} stock-out record(s). "
                "Undo them before deleting the item."
            ),
        )
    db.delete(row)
    db.commit()
    return {"ok": True}


# -------------------------------------------------------------------------- stock out


@router.get("/out")
def list_stock_out(
    search: str | None = None,
    member_id: int | None = None,
    stationery_id: int | None = None,
    status: str | None = None,
    sort: str = "newest",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = (
        select(StationeryOut, StationeryItem, User)
        .join(StationeryItem, StationeryOut.stationery_id == StationeryItem.id)
        .outerjoin(User, StationeryOut.member_id == User.id)
    )
    if search and search.strip():
        like = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(StationeryItem.name).like(like),
                func.lower(StationeryOut.taken_by).like(like),
                func.lower(func.coalesce(StationeryOut.department, "")).like(like),
                func.lower(func.coalesce(StationeryOut.purpose, "")).like(like),
            )
        )
    if member_id is not None:
        stmt = stmt.where(StationeryOut.member_id == member_id)
    if stationery_id is not None:
        stmt = stmt.where(StationeryOut.stationery_id == stationery_id)
    if status and status != "all":
        stmt = stmt.where(StationeryOut.status == status)
    if getattr(user, "role", "admin") == "staff":
        stmt = stmt.where(StationeryOut.created_by == user.name)
    if sort == "item":
        stmt = stmt.order_by(
            func.lower(StationeryItem.name), StationeryOut.taken_at.desc()
        )
    elif sort == "quantity":
        stmt = stmt.order_by(StationeryOut.quantity.desc(), StationeryOut.id.desc())
    else:
        stmt = stmt.order_by(StationeryOut.taken_at.desc(), StationeryOut.id.desc())

    rows = db.execute(stmt).all()
    filtered_records = [r for r, _, _ in rows]
    items = list(db.scalars(select(StationeryItem)).all())

    return {
        "records": [out_to_dict(record, item, member) for record, item, member in rows],
        "summary": _out_summary(filtered_records, items),
        "items": [
            {
                "id": item.id,
                "name": item.name,
                "category": item.category or "General",
                "available": float(item.total_stock or 0),
            }
            for item in sorted(items, key=lambda entry: entry.name.lower())
            if float(item.total_stock or 0) > 0
        ],
    }


@router.post("/out", status_code=201)
def create_stock_out(
    payload: StationeryOutIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = db.get(StationeryItem, payload.stationery_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Stationery item not found.")

    member = None
    if payload.member_id is not None:
        member = db.get(User, payload.member_id)
        if member is None:
            raise HTTPException(status_code=404, detail="Member not found.")
        taken_by = member.name
        department = (payload.department or "").strip() or (member.department or None)
    else:
        taken_by = (payload.taken_by or "").strip()
        if not taken_by:
            raise HTTPException(status_code=400, detail="Tell us who is taking the stock.")
        department = (payload.department or "").strip() or None

    quantity = float(payload.quantity or 0)
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero.")
    available = float(item.total_stock or 0)
    if quantity > available:
        raise HTTPException(
            status_code=400,
            detail=f"Only {available:g} available in Stock In for {item.name}.",
        )

    is_admin = getattr(user, "role", "staff") == "admin"
    if is_admin:
        # admins take stock out immediately
        item.total_stock = available - quantity
        record = StationeryOut(
            stationery_id=item.id,
            member_id=member.id if member else None,
            quantity=quantity,
            status="approved",
            taken_by=taken_by[:160],
            department=department[:120] if department else None,
            purpose=(payload.purpose or "").strip()[:200] or None,
            note=(payload.note or "").strip() or None,
            taken_at=parse_datetime(payload.taken_at) or utcnow(),
            approved_at=utcnow(),
            approved_by=user.name,
            created_by=user.name,
        )
    else:
        # staff submit a request; stock is not deducted yet
        record = StationeryOut(
            stationery_id=item.id,
            member_id=member.id if member else None,
            quantity=quantity,
            status="pending",
            taken_by=taken_by[:160],
            department=department[:120] if department else None,
            purpose=(payload.purpose or "").strip()[:200] or None,
            note=(payload.note or "").strip() or None,
            taken_at=parse_datetime(payload.taken_at) or utcnow(),
            created_by=user.name,
        )
    db.add(record)
    db.commit()
    db.refresh(record)
    db.refresh(item)
    return out_to_dict(record, item)


@router.delete("/out/{record_id}")
def delete_stock_out(
    record_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    record = db.get(StationeryOut, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Stock-out record not found.")
    is_admin = getattr(user, "role", "admin") == "admin"
    if not is_admin:
        if record.created_by != user.name or (record.status or "pending") != "pending":
            raise HTTPException(status_code=403, detail="You can only cancel your own pending requests.")
    item = db.get(StationeryItem, record.stationery_id)
    restored = float(record.quantity or 0)
    if (record.status or "pending") == "approved" and item is not None:
        item.total_stock = float(item.total_stock or 0) + restored
    db.delete(record)
    db.commit()
    return {"ok": True, "restored": restored}


@router.post("/out/{record_id}/approve")
def approve_stock_out(
    record_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if getattr(user, "role", "admin") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can approve stock-out requests.")
    record = db.get(StationeryOut, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Stock-out record not found.")
    if (record.status or "pending") != "pending":
        raise HTTPException(status_code=400, detail="This request is not pending.")
    item = db.get(StationeryItem, record.stationery_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Stationery item not found.")
    quantity = float(record.quantity or 0)
    available = float(item.total_stock or 0)
    if quantity > available:
        raise HTTPException(
            status_code=400,
            detail=f"Only {available:g} available in Stock In for {item.name}.",
        )
    item.total_stock = available - quantity
    record.status = "approved"
    record.approved_at = utcnow()
    record.approved_by = user.name
    db.commit()
    db.refresh(record)
    db.refresh(item)
    member = db.get(User, record.member_id) if record.member_id else None
    return out_to_dict(record, item, member)


@router.post("/out/{record_id}/reject")
def reject_stock_out(
    record_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if getattr(user, "role", "admin") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can reject stock-out requests.")
    record = db.get(StationeryOut, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Stock-out record not found.")
    if (record.status or "pending") != "pending":
        raise HTTPException(status_code=400, detail="This request is not pending.")
    record.status = "rejected"
    db.commit()
    db.refresh(record)
    item = db.get(StationeryItem, record.stationery_id)
    member = db.get(User, record.member_id) if record.member_id else None
    return out_to_dict(record, item, member)


@router.post("/bulk")
def bulk_create(
    payload: StationeryBulkIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not payload.rows:
        raise HTTPException(status_code=400, detail="No rows to import.")
    if len(payload.rows) > MAX_IMPORT_ROWS:
        raise HTTPException(
            status_code=400,
            detail=f"Too many rows. Import at most {MAX_IMPORT_ROWS} rows at a time.",
        )
    created = 0
    failed: list[dict] = []
    for index, raw in enumerate(payload.rows, start=1):
        if not isinstance(raw, dict):
            failed.append({"row": index, "error": "Row is not an object."})
            continue
        try:
            row = build_row(raw)
        except ValueError as exc:
            failed.append({"row": index, "error": str(exc)})
            continue
        db.add(row)
        created += 1
    db.commit()
    return {"created": created, "failed": failed, "total_rows": len(payload.rows)}


# ------------------------------------------------------------------- custom columns


@router.get("/columns")
def list_columns(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    fields = db.scalars(select(StationeryField).order_by(StationeryField.position, StationeryField.id)).all()
    return [field_to_dict(field) for field in fields]


@router.post("/columns", status_code=201)
def create_column(
    payload: StationeryFieldIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can add columns.")
    label = payload.label.strip()
    if not label:
        raise HTTPException(status_code=400, detail="Column name is required.")
    field_type = payload.field_type if payload.field_type in FIELD_TYPES else "text"
    options = [option.strip() for option in payload.options if option.strip()]
    if field_type == "select" and not options:
        raise HTTPException(status_code=400, detail="Add at least one option for a dropdown column.")

    existing_keys = set(db.scalars(select(StationeryField.key)).all())
    key = _slug(label, existing_keys)
    position = (db.scalar(select(func.max(StationeryField.position))) or 0) + 1
    field = StationeryField(
        key=key,
        label=label[:60],
        field_type=field_type,
        options=json.dumps(options, ensure_ascii=False),
        position=position,
    )
    db.add(field)
    db.commit()
    db.refresh(field)
    return field_to_dict(field)


@router.delete("/columns/{field_id}")
def delete_column(
    field_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can remove columns.")
    field = db.get(StationeryField, field_id)
    if field is None:
        raise HTTPException(status_code=404, detail="Column not found.")
    db.delete(field)
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------------- importing


@router.post("/import/preview")
async def import_preview(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File is too large (max 15 MB).")
    sheet, headers, rows = _read_table(file.filename or "", content)
    if not headers:
        raise HTTPException(status_code=400, detail="That file looks empty.")
    preview = [[_display(cell) for cell in row] for row in rows[:8]]
    return {
        "sheet": sheet,
        "headers": headers,
        "rows": preview,
        "total_rows": len(rows),
    }


@router.post("/import")
async def import_file(
    file: UploadFile = File(...),
    mapping: str = Form("{}"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        mapping_data = json.loads(mapping or "{}")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid column mapping.") from exc
    if not isinstance(mapping_data, dict):
        raise HTTPException(status_code=400, detail="Invalid column mapping.")

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File is too large (max 15 MB).")
    _, headers, rows = _read_table(file.filename or "", content)
    if not headers:
        raise HTTPException(status_code=400, detail="That file looks empty.")
    if len(rows) > MAX_IMPORT_ROWS:
        raise HTTPException(
            status_code=400,
            detail=f"Too many rows. Import at most {MAX_IMPORT_ROWS} rows at a time.",
        )

    index = {header: position for position, header in enumerate(headers)}

    def cell(row: list, header: Any):
        position = index.get(header)
        if position is None or position >= len(row):
            return None
        return row[position]

    extra_map = mapping_data.get("extra") if isinstance(mapping_data.get("extra"), dict) else {}
    created = 0
    failed: list[dict] = []

    for number, row in enumerate(rows, start=2):
        payload = {
            "name": cell(row, mapping_data.get("name")),
            "entry_date": cell(row, mapping_data.get("entry_date")),
            "category": cell(row, mapping_data.get("category")),
            "total_stock": cell(row, mapping_data.get("total_stock")),
            "source_type": cell(row, mapping_data.get("source_type")),
            "source_detail": cell(row, mapping_data.get("source_detail")),
            "referer": cell(row, mapping_data.get("referer")),
            "notes": cell(row, mapping_data.get("notes")),
        }
        if not _clean(payload["name"]) and not _clean(payload["total_stock"]):
            continue
        payload["extra"] = {
            key: cell(row, header) for key, header in extra_map.items() if header
        }
        try:
            item = build_row(payload)
        except ValueError as exc:
            failed.append({"row": number, "error": str(exc)})
            continue
        db.add(item)
        created += 1

    db.commit()
    return {"created": created, "failed": failed, "total_rows": len(rows)}
