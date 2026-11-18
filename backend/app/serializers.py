from datetime import datetime, timezone

from .models import Issue, Item, Movement, User


def iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def user_to_dict(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "department": user.department,
        "phone": user.phone,
        "notes": user.notes,
        "created_at": iso(user.created_at),
    }


def item_to_dict(item: Item, pending: float = 0.0) -> dict:
    pending = float(pending or 0)
    return {
        "id": item.id,
        "name": item.name,
        "sku": item.sku,
        "category": item.category or "General",
        "unit": item.unit or "pcs",
        "description": item.description,
        "location": item.location,
        "supplier": item.supplier,
        "unit_price": float(item.unit_price or 0),
        "quantity": float(item.quantity or 0),
        "min_level": float(item.min_level or 0),
        "pending_quantity": pending,
        "status": stock_status(item.quantity or 0, item.min_level or 0),
        "value": round(float(item.quantity or 0) * float(item.unit_price or 0), 2),
        "created_at": iso(item.created_at),
        "updated_at": iso(item.updated_at),
    }


def stock_status(quantity: float, min_level: float) -> str:
    if quantity <= 0:
        return "out"
    if min_level and quantity <= min_level:
        return "low"
    return "in"


def issue_to_dict(issue: Issue) -> dict:
    pending = max(float(issue.quantity) - float(issue.returned_quantity or 0), 0)
    return {
        "id": issue.id,
        "reference": issue.reference,
        "item_id": issue.item_id,
        "item_name": issue.item.name if issue.item else "Deleted item",
        "item_unit": issue.item.unit if issue.item else "pcs",
        "quantity": float(issue.quantity),
        "returned_quantity": float(issue.returned_quantity or 0),
        "pending_quantity": pending,
        "issued_to": issue.issued_to,
        "department": issue.department,
        "notes": issue.notes,
        "status": issue.status,
        "issued_at": iso(issue.issued_at),
        "expected_return": iso(issue.expected_return),
        "returned_at": iso(issue.returned_at),
        "issued_by": issue.issued_by,
    }


def movement_to_dict(movement: Movement) -> dict:
    return {
        "id": movement.id,
        "item_id": movement.item_id,
        "item_name": movement.item.name if movement.item else "Deleted item",
        "item_unit": movement.item.unit if movement.item else "pcs",
        "kind": movement.kind,
        "quantity": float(movement.quantity),
        "reference": movement.reference,
        "note": movement.note,
        "created_by": movement.created_by,
        "created_at": iso(movement.created_at),
    }
