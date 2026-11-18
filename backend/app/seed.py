import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .db import SessionLocal
from .models import (
    Issue,
    Item,
    Movement,
    Setting,
    StationeryField,
    StationeryItem,
    StationeryOut,
    User,
)
from .security import hash_password

DEFAULT_EMAIL = "admin@stockmanager.app"
DEFAULT_PASSWORD = "admin123"


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def seed() -> None:
    db: Session = SessionLocal()
    try:
        _seed_admin(db)
        _seed_settings(db)
    finally:
        db.close()


def _seed_admin(db: Session) -> None:
    if db.scalar(select(func.count(User.id))):
        return
    db.add(
        User(
            name="Admin User",
            email=DEFAULT_EMAIL,
            password_hash=hash_password(DEFAULT_PASSWORD),
            role="admin",
        )
    )
    db.commit()
    print(f"[seed] Default admin created -> {DEFAULT_EMAIL} / {DEFAULT_PASSWORD}")


def _seed_settings(db: Session) -> None:
    if db.get(Setting, 1) is None:
        db.add(
            Setting(
                id=1,
                company_name="IndDevtalks",
                currency="INR",
                currency_symbol="₹",
            )
        )
        db.commit()


DEMO_ITEMS = [
    # name, sku, category, unit, price, quantity, min_level, location, supplier
    ("Wireless Mouse", "ELE-0001", "Electronics", "pcs", 650, 45, 10, "Rack A1", "TechSource Ltd"),
    ("USB-C Cable 1m", "ELE-0002", "Electronics", "pcs", 250, 115, 25, "Rack A2", "TechSource Ltd"),
    ("A4 Paper Ream", "STA-0003", "Stationery", "ream", 320, 50, 15, "Shelf B1", "PaperMart"),
    ("Blue Ball Pen", "STA-0004", "Stationery", "pcs", 12, 350, 100, "Shelf B2", "PaperMart"),
    ("Printer Toner 88A", "CON-0005", "Consumables", "pcs", 2400, 6, 8, "Rack C1", "PrintHub"),
    ("Ergonomic Office Chair", "FUR-0006", "Furniture", "pcs", 4800, 11, 4, "Floor 2", "ComfortSeating"),
    ("Hand Sanitizer 500ml", "CON-0007", "Consumables", "bottle", 150, 0, 10, "Shelf B3", "MediCare"),
    ("LED Bulb 12W", "ELE-0008", "Electricals", "pcs", 180, 34, 10, "Rack A3", "BrightVolt"),
]


def _seed_demo_data(db: Session) -> None:
    if db.scalar(select(func.count(Item.id))):
        return

    now = _now()
    items: dict[str, Item] = {}
    for index, row in enumerate(DEMO_ITEMS):
        name, sku, category, unit, price, qty, min_level, location, supplier = row
        item = Item(
            name=name,
            sku=sku,
            category=category,
            unit=unit,
            unit_price=price,
            quantity=qty,
            min_level=min_level,
            location=location,
            supplier=supplier,
            description=f"Demo stock record for {name}.",
            created_at=now - timedelta(days=20 - index),
            updated_at=now - timedelta(days=20 - index),
        )
        db.add(item)
        db.flush()
        items[sku] = item
        db.add(
            Movement(
                item_id=item.id,
                kind="in",
                quantity=qty,
                reference=f"OPEN-{item.id:05d}",
                note="Opening stock",
                created_by="Admin User",
                created_at=now - timedelta(days=20 - index),
            )
        )

    demo_issues = [
        # sku, qty, issued_to, department, notes, days_ago, expected_in_days
        ("ELE-0001", 3, "Priya Sharma", "IT", "Replacement for faulty mouse", 2, 5),
        ("STA-0003", 10, "Rahul Verma", "Admin", "Monthly stationery refill", 1, 2),
        ("FUR-0006", 1, "Neha Gupta", "HR", "New joiner setup", 4, None),
        ("STA-0004", 50, "Amit Singh", "Operations", "Floor team stock", 6, -2),
        ("ELE-0002", 5, "Priya Sharma", "IT", "Lab cables", 9, 1),
    ]

    for index, (sku, qty, person, dept, notes, days_ago, expected_in) in enumerate(demo_issues, start=1):
        item = items[sku]
        issued_at = now - timedelta(days=days_ago)
        issue = Issue(
            reference=f"ISS-{index:05d}",
            item_id=item.id,
            quantity=qty,
            returned_quantity=0,
            issued_to=person,
            department=dept,
            notes=notes,
            status="pending",
            issued_at=issued_at,
            expected_return=(now + timedelta(days=expected_in)) if expected_in is not None else None,
            issued_by="Admin User",
        )
        db.add(issue)
        db.add(
            Movement(
                item_id=item.id,
                kind="out",
                quantity=qty,
                reference=issue.reference,
                note=f"Issued to {person}",
                created_by="Admin User",
                created_at=issued_at,
            )
        )

    # One fully returned issue so the history view has data.
    cable = items["ELE-0002"]
    returned_issue = Issue(
        reference="ISS-00006",
        item_id=cable.id,
        quantity=5,
        returned_quantity=5,
        issued_to="Sandeep Rao",
        department="Maintenance",
        notes="Returned after event",
        status="returned",
        issued_at=now - timedelta(days=8),
        expected_return=now - timedelta(days=6),
        returned_at=now - timedelta(days=7),
        issued_by="Admin User",
    )
    db.add(returned_issue)
    db.add(
        Movement(
            item_id=cable.id,
            kind="return",
            quantity=5,
            reference=returned_issue.reference,
            note="Returned from Sandeep Rao",
            created_by="Admin User",
            created_at=now - timedelta(days=7),
        )
    )

    db.commit()
    print("[seed] Demo stock, issues and activity created.")


DEMO_STATIONERY = [
    # name, days_ago, category, stock, source_type, source_detail, referer, shelf
    ("A4 Paper Ream", 26, "Paper", 42, "purchased", "PO-2411", "PaperMart", "Shelf 1"),
    ("Blue Ball Pen (Box of 50)", 21, "Writing", 12, "purchased", "PO-2418", "PaperMart", "Shelf 2"),
    ("Whiteboard Marker Set", 18, "Writing", 6, "purchased", None, "Stationery World", "Shelf 2"),
    ("Stapler 24/6", 15, "Desk", 9, "donation", "Donated by HR team", "Neha Gupta", "Drawer A"),
    ("Sticky Notes 3x3", 11, "Paper", 24, "purchased", "Order #A-9921", "Amazon Business", "Shelf 1"),
    ("File Folder (Pack of 10)", 8, "Filing", 15, "other", "Returned from event stock", "Events team", "Cabinet 1"),
    ("Scissors 8 inch", 5, "Desk", 0, "purchased", "PO-2433", "Stationery World", "Drawer A"),
    ("Highlighter Pack", 2, "Writing", 18, "donation", "School supply drive", "Rahul Verma", "Shelf 3"),
]


def _seed_stationery(db: Session) -> None:
    if db.scalar(select(func.count(StationeryItem.id))):
        return

    field = StationeryField(
        key="shelf",
        label="Shelf",
        field_type="text",
        options="[]",
        position=1,
    )
    db.add(field)

    now = _now()
    for index, row in enumerate(DEMO_STATIONERY):
        name, days_ago, category, stock, source, detail, referer, shelf = row
        entry = now - timedelta(days=days_ago)
        db.add(
            StationeryItem(
                name=name,
                entry_date=entry.date(),
                category=category,
                total_stock=stock,
                source_type=source,
                source_detail=detail,
                referer=referer,
                notes=None,
                extra=json.dumps({"shelf": shelf}),
                created_at=entry,
                updated_at=entry,
            )
        )

    db.commit()
    print("[seed] Stationery register demo rows created.")


DEMO_STATIONERY_OUT = [
    # item name, quantity, taken by, department, purpose, days ago
    ("A4 Paper Ream", 6, "Priya Sharma", "Admin", "Monthly print stock", 3),
    ("Blue Ball Pen (Box of 50)", 2, "Rahul Verma", "Sales", "New joiner kits", 6),
    ("Sticky Notes 3x3", 4, "Neha Gupta", "HR", "Onboarding kits", 9),
]


def _seed_stationery_out(db: Session) -> None:
    if db.scalar(select(func.count(StationeryOut.id))):
        return

    items = {item.name: item for item in db.scalars(select(StationeryItem)).all()}
    if not items:
        return

    now = _now()
    created = 0
    for name, quantity, person, department, purpose, days_ago in DEMO_STATIONERY_OUT:
        item = items.get(name)
        if item is None:
            continue
        db.add(
            StationeryOut(
                stationery_id=item.id,
                quantity=quantity,
                taken_by=person,
                department=department,
                purpose=purpose,
                taken_at=now - timedelta(days=days_ago),
                created_by="Admin User",
            )
        )
        created += 1

    if created:
        db.commit()
        print("[seed] Stationery stock-out demo rows created.")
