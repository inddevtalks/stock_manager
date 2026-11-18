from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    """Naive UTC timestamp (SQLite friendly)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(40), default="admin")
    department: Mapped[str | None] = mapped_column(String(120), default=None)
    phone: Mapped[str | None] = mapped_column(String(40), default=None)
    notes: Mapped[str | None] = mapped_column(Text, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Setting(Base):
    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_name: Mapped[str] = mapped_column(String(160), default="My Company")
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    currency_symbol: Mapped[str] = mapped_column(String(8), default="₹")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class Item(Base):
    __tablename__ = "items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    sku: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    category: Mapped[str] = mapped_column(String(80), default="General", index=True)
    unit: Mapped[str] = mapped_column(String(20), default="pcs")
    description: Mapped[str | None] = mapped_column(Text, default=None)
    location: Mapped[str | None] = mapped_column(String(120), default=None)
    supplier: Mapped[str | None] = mapped_column(String(160), default=None)
    unit_price: Mapped[float] = mapped_column(Float, default=0.0)
    quantity: Mapped[float] = mapped_column(Float, default=0.0)
    min_level: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    issues: Mapped[list["Issue"]] = relationship(back_populates="item")
    movements: Mapped[list["Movement"]] = relationship(back_populates="item")


class Issue(Base):
    __tablename__ = "issues"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reference: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), index=True)
    quantity: Mapped[float] = mapped_column(Float)
    returned_quantity: Mapped[float] = mapped_column(Float, default=0.0)
    issued_to: Mapped[str] = mapped_column(String(160))
    department: Mapped[str | None] = mapped_column(String(120), default=None)
    notes: Mapped[str | None] = mapped_column(Text, default=None)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expected_return: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    returned_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    issued_by: Mapped[str | None] = mapped_column(String(160), default=None)

    item: Mapped[Item] = relationship(back_populates="issues")


class Movement(Base):
    __tablename__ = "movements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))  # in | out | return | adjust
    quantity: Mapped[float] = mapped_column(Float)
    reference: Mapped[str | None] = mapped_column(String(40), default=None)
    note: Mapped[str | None] = mapped_column(Text, default=None)
    created_by: Mapped[str | None] = mapped_column(String(160), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    item: Mapped[Item] = relationship(back_populates="movements")


class StationeryItem(Base):
    """A row in the stationery register (separate from the stock catalogue)."""

    __tablename__ = "stationery_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    entry_date: Mapped[date] = mapped_column(Date, default=date.today, index=True)
    category: Mapped[str] = mapped_column(String(80), default="General", index=True)
    total_stock: Mapped[float] = mapped_column(Float, default=0.0)
    source_type: Mapped[str] = mapped_column(String(20), default="purchased", index=True)
    source_detail: Mapped[str | None] = mapped_column(String(200), default=None)
    referer: Mapped[str | None] = mapped_column(String(160), default=None)
    notes: Mapped[str | None] = mapped_column(Text, default=None)
    extra: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class StationeryField(Base):
    """Admin-defined extra column for the stationery register."""

    __tablename__ = "stationery_fields"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(60))
    field_type: Mapped[str] = mapped_column(String(20), default="text")
    options: Mapped[str] = mapped_column(Text, default="[]")
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class StationeryOut(Base):
    """A stock-out record: units taken out of a stationery item."""

    __tablename__ = "stationery_out"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    stationery_id: Mapped[int] = mapped_column(
        ForeignKey("stationery_items.id"), index=True
    )
    member_id: Mapped[int | None] = mapped_column(
        ForeignKey("members.id"), nullable=True, index=True, default=None
    )
    quantity: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    taken_by: Mapped[str] = mapped_column(String(160), index=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    approved_by: Mapped[str | None] = mapped_column(String(160), default=None)
    department: Mapped[str | None] = mapped_column(String(120), default=None)
    purpose: Mapped[str | None] = mapped_column(String(200), default=None)
    note: Mapped[str | None] = mapped_column(Text, default=None)
    taken_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    created_by: Mapped[str | None] = mapped_column(String(160), default=None)

class Member(Base):
    """A person who can take stock out of the cupboard."""

    __tablename__ = "members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    department: Mapped[str | None] = mapped_column(String(120), default=None)
    email: Mapped[str | None] = mapped_column(String(180), default=None)
    phone: Mapped[str | None] = mapped_column(String(40), default=None)
    notes: Mapped[str | None] = mapped_column(Text, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
