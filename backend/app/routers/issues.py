from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Issue, Item, Movement, User
from ..schemas import IssueCreate, ReturnIn
from ..security import get_current_user
from ..serializers import issue_to_dict

router = APIRouter(prefix="/api/issues", tags=["issues"])


def _parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid expected return date.")
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


@router.get("")
def list_issues(
    status: str = Query(default="all", description="all | pending | returned | overdue"),
    search: str | None = Query(default=None),
    item_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(Issue).join(Item, Issue.item_id == Item.id, isouter=True)
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    if status == "pending":
        stmt = stmt.where(Issue.status == "pending")
    elif status == "returned":
        stmt = stmt.where(Issue.status == "returned")
    elif status == "overdue":
        stmt = stmt.where(Issue.status == "pending", Issue.expected_return.is_not(None), Issue.expected_return < now)
    if item_id:
        stmt = stmt.where(Issue.item_id == item_id)
    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Issue.issued_to.ilike(term),
                Issue.reference.ilike(term),
                Issue.department.ilike(term),
                Item.name.ilike(term),
            )
        )

    issues = list(db.scalars(stmt.order_by(Issue.issued_at.desc())))
    return [issue_to_dict(issue) for issue in issues]


@router.post("", status_code=201)
def create_issue(
    payload: IssueCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = db.get(Item, payload.item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")

    available = float(item.quantity or 0)
    if payload.quantity > available:
        raise HTTPException(
            status_code=400,
            detail=f"Only {available:g} {item.unit} available in stock.",
        )

    issue = Issue(
        reference="TEMP",
        item_id=item.id,
        quantity=payload.quantity,
        returned_quantity=0,
        issued_to=payload.issued_to.strip(),
        department=(payload.department or "").strip() or None,
        notes=(payload.notes or "").strip() or None,
        status="pending",
        expected_return=_parse_date(payload.expected_return),
        issued_by=user.name,
    )
    db.add(issue)
    db.flush()
    issue.reference = f"ISS-{issue.id:05d}"

    item.quantity = available - payload.quantity
    db.add(
        Movement(
            item_id=item.id,
            kind="out",
            quantity=payload.quantity,
            reference=issue.reference,
            note=f"Issued to {issue.issued_to}",
            created_by=user.name,
        )
    )

    db.commit()
    db.refresh(issue)
    return issue_to_dict(issue)


@router.post("/{issue_id}/return")
def return_issue(
    issue_id: int,
    payload: ReturnIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    issue = db.get(Issue, issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue record not found.")
    if issue.status == "returned":
        raise HTTPException(status_code=400, detail="This issue is already fully returned.")

    outstanding = float(issue.quantity) - float(issue.returned_quantity or 0)
    if payload.quantity > outstanding + 0.0001:
        raise HTTPException(
            status_code=400,
            detail=f"Only {outstanding:g} units are still pending for this issue.",
        )

    item = db.get(Item, issue.item_id)
    if item is None:
        raise HTTPException(status_code=400, detail="The related item no longer exists.")

    issue.returned_quantity = float(issue.returned_quantity or 0) + payload.quantity
    if issue.returned_quantity >= float(issue.quantity) - 0.0001:
        issue.returned_quantity = float(issue.quantity)
        issue.status = "returned"
        issue.returned_at = datetime.now(timezone.utc).replace(tzinfo=None)

    item.quantity = float(item.quantity or 0) + payload.quantity
    db.add(
        Movement(
            item_id=item.id,
            kind="return",
            quantity=payload.quantity,
            reference=issue.reference,
            note=payload.note or f"Returned from {issue.issued_to}",
            created_by=user.name,
        )
    )

    db.commit()
    db.refresh(issue)
    return issue_to_dict(issue)


@router.delete("/{issue_id}")
def cancel_issue(issue_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Cancel a pending issue and put the units back into stock."""
    issue = db.get(Issue, issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue record not found.")
    if issue.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending issues can be cancelled.")

    item = db.get(Item, issue.item_id)
    outstanding = float(issue.quantity) - float(issue.returned_quantity or 0)
    if item and outstanding > 0:
        item.quantity = float(item.quantity or 0) + outstanding

    db.query(Movement).filter(Movement.reference == issue.reference).delete()
    db.delete(issue)
    db.commit()
    return {"ok": True}
