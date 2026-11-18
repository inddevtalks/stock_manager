"""Members: user accounts that can take stock out of the cupboard."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import User
from ..schemas import MemberIn
from ..security import get_current_user, hash_password
from ..serializers import user_to_dict

router = APIRouter(prefix="/api/members", tags=["members"])


@router.get("")
def list_members(
    search: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(User)
    if search and search.strip():
        like = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(User.name).like(like),
                func.lower(User.email).like(like),
                func.lower(func.coalesce(User.department, "")).like(like),
            )
        )
    stmt = stmt.order_by(func.lower(User.name))
    users = db.scalars(stmt).all()
    return [user_to_dict(u) for u in users]


@router.post("", status_code=201)
def create_member(
    payload: MemberIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can manage members.")

    name = payload.name.strip()
    email = payload.email.lower().strip() if payload.email else None
    if not name:
        raise HTTPException(status_code=400, detail="Member name is required.")
    if not email:
        raise HTTPException(status_code=400, detail="Member email is required.")
    if not payload.password or len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    existing = db.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    role = (payload.role or "staff").strip().lower()
    if role not in {"admin", "staff"}:
        role = "staff"

    member = User(
        name=name[:120],
        email=email,
        password_hash=hash_password(payload.password),
        role=role,
        department=(payload.department or "").strip()[:120] or None,
        phone=(payload.phone or "").strip()[:40] or None,
        notes=(payload.notes or "").strip() or None,
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return user_to_dict(member)


@router.delete("/{member_id}")
def delete_member(
    member_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can manage members.")
    if member_id == user.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")
    member = db.get(User, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found.")
    db.delete(member)
    db.commit()
    return {"ok": True}
