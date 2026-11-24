from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import case, func, select
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

    # ------------------------------------------------------------------ #
    # 1. Items + pending map -- two queries total (was: N+1)              #
    # ------------------------------------------------------------------ #
    items = list(db.scalars(select(Item)))

    # Aggregate pending quantities per item in a single query.
    pending_rows = db.execute(
        select(
            Issue.item_id,
            func.coalesce(func.sum(Issue.quantity - Issue.returned_quantity), 0),
        )
        .where(Issue.status == "pending")
        .group_by(Issue.item_id)
    ).all()
    pending_map = {item_id: float(qty or 0) for item_id, qty in pending_rows}

    # ------------------------------------------------------------------ #
    # 2. High-level item stats derived from already-loaded objects        #
    # ------------------------------------------------------------------ #
    total_units = sum(float(i.quantity or 0) for i in items)
    stock_value = sum(float(i.quantity or 0) * float(i.unit_price or 0) for i in items)
    low_items   = [i for i in items if float(i.quantity or 0) > 0 and i.min_level and float(i.quantity) <= float(i.min_level)]
    out_items   = [i for i in items if float(i.quantity or 0) <= 0]

    # ------------------------------------------------------------------ #
    # 3. Pending issues -- ONE query (was: separate + loop)               #
    # ------------------------------------------------------------------ #
    pending_issues = list(db.scalars(select(Issue).where(Issue.status == "pending")))
    pending_units  = sum(float(i.quantity) - float(i.returned_quantity or 0) for i in pending_issues)

    # ------------------------------------------------------------------ #
    # 4. Stationery stats -- two queries (was: three)                     #
    # ------------------------------------------------------------------ #
    stationery_items = list(db.scalars(select(StationeryItem)))
    stationery_agg = db.execute(
        select(
            StationeryOut.status,
            func.coalesce(func.sum(StationeryOut.quantity), 0),
            func.count(StationeryOut.id),
        ).group_by(StationeryOut.status)
    ).all()

    stationery_taken         = 0.0
    stationery_pending_units = 0.0
    stationery_pending_count = 0
    for status, qty, cnt in stationery_agg:
        if status == "approved":
            stationery_taken = float(qty)
        elif status == "pending":
            stationery_pending_units = float(qty)
            stationery_pending_count = int(cnt)

    stationery_units = sum(float(i.total_stock or 0) for i in stationery_items)

    # ------------------------------------------------------------------ #
    # 5. Today issued / returned -- two focused queries                   #
    # ------------------------------------------------------------------ #
    issued_today = db.scalar(
        select(func.coalesce(func.sum(Issue.quantity), 0)).where(Issue.issued_at >= today_start)
    ) or 0
    returned_today = db.scalar(
        select(func.coalesce(func.sum(Movement.quantity), 0)).where(
            Movement.kind == "return", Movement.created_at >= today_start
        )
    ) or 0

    # ------------------------------------------------------------------ #
    # 6. Category breakdown -- ONE query with sub-aggregates (was: N+1)  #
    # ------------------------------------------------------------------ #
    cat_rows = db.execute(
        select(
            Item.category,
            func.count(Item.id),
            func.coalesce(func.sum(Item.quantity), 0),
            func.coalesce(func.sum(Item.quantity * Item.unit_price), 0),
        ).group_by(Item.category)
    ).all()
    categories = [
        {
            "name":  name or "General",
            "items": count,
            "units": float(units or 0),
            "value": float(value or 0),
        }
        for name, count, units, value in cat_rows
    ]
    categories.sort(key=lambda row: row["value"], reverse=True)

    # ------------------------------------------------------------------ #
    # 7. Low-stock list from already-loaded items                         #
    # ------------------------------------------------------------------ #
    low_stock = sorted(
        [item_to_dict(i, pending_map.get(i.id, 0)) for i in items],
        key=lambda row: row["quantity"],
    )
    low_stock = [row for row in low_stock if row["status"] in ("low", "out")][:5]

    # ------------------------------------------------------------------ #
    # 8. Recent activity                                                  #
    # ------------------------------------------------------------------ #
    recent_issues = sorted(pending_issues, key=lambda i: i.issued_at, reverse=True)[:5]
    movements = list(
        db.scalars(select(Movement).order_by(Movement.created_at.desc()).limit(8))
    )

    # ------------------------------------------------------------------ #
    # 9. 7-day trend -- ONE grouped query instead of 14 scalar calls      #
    # ------------------------------------------------------------------ #
    week_start = today_start - timedelta(days=6)
    trend_rows = db.execute(
        select(
            func.date(Movement.created_at).label("day"),
            Movement.kind,
            func.coalesce(func.sum(Movement.quantity), 0),
        )
        .where(Movement.created_at >= week_start)
        .where(Movement.kind.in_(["in", "out"]))
        .group_by(func.date(Movement.created_at), Movement.kind)
    ).all()

    # Build a lookup: {date_str: {kind: qty}}
    trend_lookup: dict[str, dict[str, float]] = {}
    for day_val, kind, qty in trend_rows:
        # func.date() may return a string or a date object depending on dialect
        day_key = str(day_val)[:10]
        trend_lookup.setdefault(day_key, {})
        trend_lookup[day_key][kind] = float(qty or 0)

    trend = []
    for offset in range(6, -1, -1):
        day = today_start - timedelta(days=offset)
        day_key = day.strftime("%Y-%m-%d")
        day_data = trend_lookup.get(day_key, {})
        trend.append(
            {
                "date":     iso(day),
                "label":    day.strftime("%a"),
                "issued":   day_data.get("out", 0.0),
                "received": day_data.get("in", 0.0),
            }
        )

    # ------------------------------------------------------------------ #
    # 10. Settings                                                        #
    # ------------------------------------------------------------------ #
    settings = db.get(Setting, 1)

    return {
        "company": {
            "name":            settings.company_name    if settings else "My Company",
            "currency":        settings.currency        if settings else "INR",
            "currency_symbol": settings.currency_symbol if settings else "₹",
        },
        "stats": {
            "total_items":     len(items),
            "total_units":     total_units,
            "stock_value":     round(stock_value, 2),
            "low_stock":       len(low_items),
            "out_of_stock":    len(out_items),
            "pending_issues":  len(pending_issues),
            "pending_units":   pending_units,
            "issued_today":    float(issued_today),
            "returned_today":  float(returned_today),
            "categories":      len(cat_rows),
        },
        "stationery": {
            "items":            len(stationery_items),
            "units":            stationery_units,
            "taken_out":        stationery_taken,
            "pending_requests": stationery_pending_count,
            "pending_units":    stationery_pending_units,
            "out_of_stock":     sum(1 for i in stationery_items if float(i.total_stock or 0) <= 0),
        },
        "categories": categories,
        "low_stock":  low_stock,
        "pending":    [issue_to_dict(i) for i in recent_issues],
        "activity":   [movement_to_dict(m) for m in movements],
        "trend":      trend,
    }
