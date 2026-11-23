from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Issue, Item, Movement, Setting, StationeryItem, StationeryOut, User
from ..security import get_current_user
from ..serializers import iso, item_to_dict, issue_to_dict, movement_to_dict

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
def dashboard(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    items = list(db.scalars(select(Item)))
    pending_issues = list(db.scalars(select(Issue).where(Issue.status == "pending")))

    total_units = sum(float(i.quantity or 0) for i in items)
    stock_value = sum(float(i.quantity or 0) * float(i.unit_price or 0) for i in items)
    low_items = [i for i in items if float(i.quantity or 0) > 0 and i.min_level and float(i.quantity) <= float(i.min_level)]
    out_items = [i for i in items if float(i.quantity or 0) <= 0]
    pending_units = sum(float(i.quantity) - float(i.returned_quantity or 0) for i in pending_issues)

    stationery_items = list(db.scalars(select(StationeryItem)))
    stationery_out_records = list(db.scalars(select(StationeryOut).where(StationeryOut.status == "approved")))
    stationery_pending = list(db.scalars(select(StationeryOut).where(StationeryOut.status == "pending")))
    stationery_units = sum(float(i.total_stock or 0) for i in stationery_items)
    stationery_taken = sum(float(r.quantity or 0) for r in stationery_out_records)
    stationery_pending_units = sum(float(r.quantity or 0) for r in stationery_pending)

    issued_today = db.scalar(
        select(func.coalesce(func.sum(Issue.quantity), 0)).where(Issue.issued_at >= today_start)
    ) or 0
    returned_today = db.scalar(
        select(func.coalesce(func.sum(Movement.quantity), 0)).where(
            Movement.kind == "return", Movement.created_at >= today_start
        )
    ) or 0

    category_rows = db.execute(
        select(Item.category, func.count(Item.id), func.coalesce(func.sum(Item.quantity), 0))
        .group_by(Item.category)
    ).all()
    categories = [
        {
            "name": name or "General",
            "items": count,
            "units": float(units or 0),
            "value": float(
                db.scalar(
                    select(func.coalesce(func.sum(Item.quantity * Item.unit_price), 0)).where(
                        Item.category == name
                    )
                )
                or 0
            ),
        }
        for name, count, units in category_rows
    ]
    categories.sort(key=lambda row: row["value"], reverse=True)

    pending_map = {}
    for issue in pending_issues:
        pending_map[issue.item_id] = pending_map.get(issue.item_id, 0) + (
            float(issue.quantity) - float(issue.returned_quantity or 0)
        )

    low_stock = sorted(
        [item_to_dict(i, pending_map.get(i.id, 0)) for i in items],
        key=lambda row: row["quantity"],
    )
    low_stock = [row for row in low_stock if row["status"] in ("low", "out")][:5]

    recent_issues = sorted(pending_issues, key=lambda i: i.issued_at, reverse=True)[:5]
    movements = list(
        db.scalars(select(Movement).order_by(Movement.created_at.desc()).limit(8))
    )

    trend = []
    for offset in range(6, -1, -1):
        day = today_start - timedelta(days=offset)
        next_day = day + timedelta(days=1)
        issued = db.scalar(
            select(func.coalesce(func.sum(Movement.quantity), 0)).where(
                Movement.kind == "out",
                Movement.created_at >= day,
                Movement.created_at < next_day,
            )
        ) or 0
        received = db.scalar(
            select(func.coalesce(func.sum(Movement.quantity), 0)).where(
                Movement.kind == "in",
                Movement.created_at >= day,
                Movement.created_at < next_day,
            )
        ) or 0
        trend.append(
            {
                "date": iso(day),
                "label": day.strftime("%a"),
                "issued": float(issued),
                "received": float(received),
            }
        )

    settings = db.get(Setting, 1)

    return {
        "company": {
            "name": settings.company_name if settings else "My Company",
            "currency": settings.currency if settings else "INR",
            "currency_symbol": settings.currency_symbol if settings else "₹",
        },
        "stats": {
            "total_items": len(items),
            "total_units": total_units,
            "stock_value": round(stock_value, 2),
            "low_stock": len(low_items),
            "out_of_stock": len(out_items),
            "pending_issues": len(pending_issues),
            "pending_units": pending_units,
            "issued_today": float(issued_today),
            "returned_today": float(returned_today),
            "categories": len(category_rows),
        },
        "stationery": {
            "items": len(stationery_items),
            "units": stationery_units,
            "taken_out": stationery_taken,
            "pending_requests": len(stationery_pending),
            "pending_units": stationery_pending_units,
            "out_of_stock": sum(1 for i in stationery_items if float(i.total_stock or 0) <= 0),
        },
        "categories": categories,
        "low_stock": low_stock,
        "pending": [issue_to_dict(i) for i in recent_issues],
        "activity": [movement_to_dict(m) for m in movements],
        "trend": trend,
    }
