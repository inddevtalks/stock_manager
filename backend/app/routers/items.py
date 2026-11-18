from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Issue, Item, Movement, User
from ..schemas import ItemCreate, ItemUpdate, RestockIn
from ..security import get_current_user
from ..serializers import item_to_dict, movement_to_dict

router = APIRouter(prefix="/api/items", tags=["items"])


def _pending_map(db: Session) -> dict[int, float]:
    rows = db.execute(
        select(
            Issue.item_id,
            func.coalesce(func.sum(Issue.quantity - Issue.returned_quantity), 0),
        )
        .where(Issue.status == "pending")
        .group_by(Issue.item_id)
    ).all()
    return {item_id: float(qty or 0) for item_id, qty in rows}


def _generate_sku(db: Session, name: str) -> str:
    prefix = "".join(ch for ch in name.upper() if ch.isalnum())[:3] or "SKU"
    while True:
        count = (db.scalar(select(func.count(Item.id))) or 0) + 1
        candidate = f"{prefix}-{count:04d}"
        if not db.scalar(select(Item.id).where(Item.sku == candidate)):
            return candidate


@router.get("")
def list_items(
    search: str | None = Query(default=None),
    category: str | None = Query(default=None),
    status: str | None = Query(default=None, description="in | low | out"),
    sort: str = Query(default="name"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(Item)
    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Item.name.ilike(term),
                Item.sku.ilike(term),
                Item.category.ilike(term),
                Item.location.ilike(term),
                Item.supplier.ilike(term),
            )
        )
    if category and category != "all":
        stmt = stmt.where(Item.category == category)

    items = list(db.scalars(stmt))
    pending = _pending_map(db)
    result = [item_to_dict(item, pending.get(item.id, 0)) for item in items]

    if status and status != "all":
        result = [row for row in result if row["status"] == status]

    if sort == "quantity":
        result.sort(key=lambda row: row["quantity"])
    elif sort == "value":
        result.sort(key=lambda row: row["value"], reverse=True)
    elif sort == "updated":
        result.sort(key=lambda row: row["updated_at"] or "", reverse=True)
    elif sort == "pending":
        result.sort(key=lambda row: row["pending_quantity"], reverse=True)
    else:
        result.sort(key=lambda row: row["name"].lower())

    return result


@router.get("/categories")
def list_categories(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    rows = db.execute(
        select(Item.category, func.count(Item.id)).group_by(Item.category).order_by(Item.category)
    ).all()
    return [{"name": name or "General", "count": count} for name, count in rows]


@router.get("/{item_id}")
def get_item(item_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    item = db.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    pending = _pending_map(db).get(item.id, 0)
    return item_to_dict(item, pending)


@router.post("", status_code=201)
def create_item(
    payload: ItemCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sku = (payload.sku or "").strip() or _generate_sku(db, payload.name)
    if db.scalar(select(Item.id).where(Item.sku == sku)):
        raise HTTPException(status_code=400, detail=f"SKU '{sku}' is already in use.")

    item = Item(
        name=payload.name.strip(),
        sku=sku,
        category=(payload.category or "General").strip() or "General",
        unit=(payload.unit or "pcs").strip() or "pcs",
        description=payload.description,
        location=payload.location,
        supplier=payload.supplier,
        unit_price=payload.unit_price,
        quantity=payload.quantity,
        min_level=payload.min_level,
    )
    db.add(item)
    db.flush()

    if payload.quantity > 0:
        db.add(
            Movement(
                item_id=item.id,
                kind="in",
                quantity=payload.quantity,
                reference=f"OPEN-{item.id:05d}",
                note="Opening stock",
                created_by=user.name,
            )
        )

    db.commit()
    db.refresh(item)
    return item_to_dict(item, 0)


@router.put("/{item_id}")
def update_item(
    item_id: int,
    payload: ItemUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = db.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")

    data = payload.model_dump(exclude_unset=True)
    if "sku" in data:
        sku = (data["sku"] or "").strip()
        if not sku:
            data.pop("sku")
        else:
            duplicate = db.scalar(select(Item.id).where(Item.sku == sku, Item.id != item_id))
            if duplicate:
                raise HTTPException(status_code=400, detail=f"SKU '{sku}' is already in use.")
            data["sku"] = sku

    if "quantity" in data and data["quantity"] is not None:
        new_quantity = float(data["quantity"])
        delta = new_quantity - float(item.quantity or 0)
        if abs(delta) > 0.0001:
            db.add(
                Movement(
                    item_id=item.id,
                    kind="adjust",
                    quantity=abs(delta),
                    reference=None,
                    note=f"Manual adjustment ({'+' if delta > 0 else '-'}{abs(delta):g})",
                    created_by=user.name,
                )
            )
        item.quantity = new_quantity

    for field in ("name", "category", "unit", "description", "location", "supplier", "unit_price", "min_level"):
        if field in data and data[field] is not None:
            value = data[field]
            if isinstance(value, str):
                value = value.strip()
            setattr(item, field, value)

    db.commit()
    db.refresh(item)
    pending = _pending_map(db).get(item.id, 0)
    return item_to_dict(item, pending)


@router.delete("/{item_id}")
def delete_item(item_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    item = db.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")

    pending = _pending_map(db).get(item.id, 0)
    if pending > 0:
        raise HTTPException(
            status_code=400,
            detail="This item has pending issued units. Receive them back before deleting.",
        )

    issue_count = db.scalar(select(func.count(Issue.id)).where(Issue.item_id == item.id)) or 0
    if issue_count:
        raise HTTPException(
            status_code=400,
            detail="This item has issue history and cannot be deleted. Keep it for your records.",
        )

    db.query(Movement).filter(Movement.item_id == item.id).delete()
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.post("/{item_id}/restock")
def restock(
    item_id: int,
    payload: RestockIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = db.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")

    item.quantity = float(item.quantity or 0) + payload.quantity
    movement = Movement(
        item_id=item.id,
        kind="in",
        quantity=payload.quantity,
        reference=None,
        note=payload.note or "Stock received",
        created_by=user.name,
    )
    db.add(movement)
    db.commit()
    db.refresh(item)
    pending = _pending_map(db).get(item.id, 0)
    return item_to_dict(item, pending)


@router.get("/{item_id}/history")
def item_history(
    item_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = db.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    movements = db.scalars(
        select(Movement).where(Movement.item_id == item_id).order_by(Movement.created_at.desc()).limit(50)
    )
    return [movement_to_dict(m) for m in movements]
