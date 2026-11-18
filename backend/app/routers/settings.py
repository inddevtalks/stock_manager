from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Setting, User
from ..schemas import SettingsUpdate
from ..security import get_current_user
from ..serializers import iso

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _get_settings(db: Session) -> Setting:
    settings = db.get(Setting, 1)
    if settings is None:
        settings = Setting(id=1, company_name="My Company", currency="INR", currency_symbol="₹")
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def settings_to_dict(settings: Setting) -> dict:
    return {
        "company_name": settings.company_name,
        "currency": settings.currency,
        "currency_symbol": settings.currency_symbol,
        "updated_at": iso(settings.updated_at),
    }


@router.get("")
def get_settings(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return settings_to_dict(_get_settings(db))


@router.put("")
def update_settings(
    payload: SettingsUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    settings = _get_settings(db)
    settings.company_name = payload.company_name.strip()
    settings.currency = payload.currency.strip().upper()
    settings.currency_symbol = payload.currency_symbol.strip()
    db.commit()
    db.refresh(settings)
    return settings_to_dict(settings)
