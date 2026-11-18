from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Issue, User
from ..schemas import LoginIn, PasswordChange, ProfileUpdate, RegisterIn
from ..security import create_token, get_current_user, hash_password, verify_password
from ..serializers import user_to_dict

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register")
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    existing = db.scalar(select(User).where(User.email == email))
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")
    user = User(name=payload.name.strip(), email=email, password_hash=hash_password(payload.password), role=payload.role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"token": create_token(user), "user": user_to_dict(user)}


@router.post("/login")
def login(payload: LoginIn, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    user = db.scalar(select(User).where(User.email == email))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return {"token": create_token(user), "user": user_to_dict(user)}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_to_dict(user)


@router.put("/me")
def update_me(
    payload: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.name:
        user.name = payload.name.strip()
    db.commit()
    db.refresh(user)
    return user_to_dict(user)


@router.post("/change-password")
def change_password(
    payload: PasswordChange,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"ok": True}


@router.get("/stats")
def account_stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pending = db.scalar(
        select(func.count(Issue.id)).where(Issue.status == "pending")
    ) or 0
    return {"users": db.scalar(select(func.count(User.id))) or 0, "pending_issues": pending}
