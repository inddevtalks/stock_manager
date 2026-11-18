import re
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

# Kept as a plain regex so the backend has no dependency on `email-validator`.
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")


def normalize_email(value: str) -> str:
    email = (value or "").strip().lower()
    if not EMAIL_PATTERN.match(email):
        raise ValueError("Enter a valid email address.")
    return email


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str
    password: str = Field(min_length=6, max_length=128)
    role: str = Field(default="staff", max_length=20)

    @field_validator("role")
    @classmethod
    def _valid_role(cls, value: str) -> str:
        value = (value or "staff").strip().lower()
        if value not in {"admin", "staff"}:
            raise ValueError("Role must be admin or staff.")
        return value

    @field_validator("email")
    @classmethod
    def _valid_email(cls, value: str) -> str:
        return normalize_email(value)


class LoginIn(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def _valid_email(cls, value: str) -> str:
        return normalize_email(value)


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6, max_length=128)


class ItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    sku: str | None = Field(default=None, max_length=60)
    category: str | None = Field(default=None, max_length=80)
    unit: str | None = Field(default="pcs", max_length=20)
    description: str | None = None
    location: str | None = Field(default=None, max_length=120)
    supplier: str | None = Field(default=None, max_length=160)
    unit_price: float = Field(default=0, ge=0)
    quantity: float = Field(default=0, ge=0)
    min_level: float = Field(default=0, ge=0)


class ItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    sku: str | None = Field(default=None, max_length=60)
    category: str | None = Field(default=None, max_length=80)
    unit: str | None = Field(default=None, max_length=20)
    description: str | None = None
    location: str | None = Field(default=None, max_length=120)
    supplier: str | None = Field(default=None, max_length=160)
    unit_price: float | None = Field(default=None, ge=0)
    quantity: float | None = Field(default=None, ge=0)
    min_level: float | None = Field(default=None, ge=0)


class RestockIn(BaseModel):
    quantity: float = Field(gt=0)
    note: str | None = None


class IssueCreate(BaseModel):
    item_id: int
    quantity: float = Field(gt=0)
    issued_to: str = Field(min_length=1, max_length=160)
    department: str | None = Field(default=None, max_length=120)
    notes: str | None = None
    expected_return: str | None = None


class ReturnIn(BaseModel):
    quantity: float = Field(gt=0)
    note: str | None = None


class SettingsUpdate(BaseModel):
    company_name: str = Field(min_length=1, max_length=160)
    currency: str = Field(default="INR", max_length=8)
    currency_symbol: str = Field(default="₹", max_length=8)


class ItemOut(BaseModel):
    id: int
    name: str
    sku: str
    category: str
    unit: str
    description: str | None
    location: str | None
    supplier: str | None
    unit_price: float
    quantity: float
    min_level: float
    pending_quantity: float
    status: str
    created_at: datetime
    updated_at: datetime


class IssueOut(BaseModel):
    id: int
    reference: str
    item_id: int
    item_name: str
    item_unit: str
    quantity: float
    returned_quantity: float
    pending_quantity: float
    issued_to: str
    department: str | None
    notes: str | None
    status: str
    issued_at: datetime
    expected_return: datetime | None
    returned_at: datetime | None
    issued_by: str | None


class StationeryIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    entry_date: str | None = None
    category: str | None = Field(default="General", max_length=80)
    total_stock: float = Field(default=0, ge=0)
    source_type: str = Field(default="purchased", max_length=40)
    source_detail: str | None = Field(default=None, max_length=200)
    referer: str | None = Field(default=None, max_length=160)
    notes: str | None = None
    extra: dict[str, Any] = Field(default_factory=dict)


class StationeryFieldIn(BaseModel):
    label: str = Field(min_length=1, max_length=60)
    field_type: str = Field(default="text", max_length=20)
    options: list[str] = Field(default_factory=list)


class StationeryBulkIn(BaseModel):
    rows: list[dict[str, Any]] = Field(default_factory=list)


class StationeryOutIn(BaseModel):
    stationery_id: int
    quantity: float = Field(gt=0)
    member_id: int | None = None
    taken_by: str | None = Field(default=None, max_length=160)
    department: str | None = Field(default=None, max_length=120)
    purpose: str | None = Field(default=None, max_length=200)
    note: str | None = None
    taken_at: str | None = None

class MemberIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=180)
    password: str = Field(min_length=6, max_length=128)
    role: str = Field(default="staff", max_length=20)
    department: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    notes: str | None = None

    @field_validator("role")
    @classmethod
    def _valid_role(cls, value: str) -> str:
        value = (value or "staff").strip().lower()
        if value not in {"admin", "staff"}:
            raise ValueError("Role must be admin or staff.")
        return value

    @field_validator("email")
    @classmethod
    def _valid_email(cls, value: str) -> str:
        return normalize_email(value)
