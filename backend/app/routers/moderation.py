from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Comment, Problem, Report, Solution, User
from ..schemas import OrgVerification, ReportIn, ReportResolve
from ..security import get_current_user, rate_limit, require_admin
from ..serializers import iso, user_brief
from ..services import events

router = APIRouter(tags=["moderation"])

TARGETS = {"problem": Problem, "solution": Solution, "comment": Comment, "user": User}


def _target_summary(db: Session, target_type: str, target_id: int) -> dict | None:
    obj = db.get(TARGETS[target_type], target_id)
    if obj is None:
        return None
    if target_type == "problem":
        return {"title": obj.title, "text": obj.description[:300], "link": f"/problems/{obj.id}", "hidden": obj.is_hidden}
    if target_type == "solution":
        return {"title": obj.title, "text": obj.description[:300], "link": f"/solutions/{obj.id}", "hidden": obj.is_hidden}
    if target_type == "comment":
        link = f"/solutions/{obj.solution_id}#discussion" if obj.solution_id else f"/problems/{obj.problem_id}#discussion"
        return {"title": f"Comment by {obj.author.name}", "text": obj.body[:300], "link": link, "hidden": obj.is_hidden}
    return {"title": obj.name, "text": obj.bio or "", "link": f"/u/{obj.username}", "hidden": obj.is_hidden}


@router.post("/reports", status_code=201, dependencies=[Depends(rate_limit("report", 20, 3600))])
def create_report(body: ReportIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if db.get(TARGETS[body.target_type], body.target_id) is None:
        raise HTTPException(404, "Content not found.")
    existing = db.scalar(
        select(Report).where(
            Report.reporter_id == user.id, Report.target_type == body.target_type,
            Report.target_id == body.target_id, Report.status == "open",
        )
    )
    if existing is None:
        db.add(Report(reporter_id=user.id, target_type=body.target_type, target_id=body.target_id, reason=body.reason, details=body.details))
        db.commit()
    return {"ok": True}


@router.get("/moderation/reports")
def list_reports(status: str = "open", db: Session = Depends(get_db), _: User = Depends(require_admin)):
    rows = db.scalars(select(Report).where(Report.status == status).order_by(desc(Report.created_at)).limit(100))
    out = []
    for r in rows:
        out.append(
            {
                "id": r.id,
                "target_type": r.target_type,
                "target_id": r.target_id,
                "target": _target_summary(db, r.target_type, r.target_id),
                "reason": r.reason,
                "details": r.details,
                "status": r.status,
                "reporter": user_brief(r.reporter),
                "created_at": iso(r.created_at),
                "reports_on_target": db.scalar(
                    select(func.count()).select_from(Report).where(Report.target_type == r.target_type, Report.target_id == r.target_id)
                ),
            }
        )
    return out


@router.post("/moderation/reports/{report_id}")
def resolve_report(report_id: int, body: ReportResolve, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    r = db.get(Report, report_id)
    if r is None:
        raise HTTPException(404, "Report not found.")
    if body.action == "hide":
        obj = db.get(TARGETS[r.target_type], r.target_id)
        if obj is not None:
            obj.is_hidden = True
            if r.target_type == "comment":
                parent = db.get(Solution, obj.solution_id) if obj.solution_id else db.get(Problem, obj.problem_id)
                if parent is not None and parent.comments_count:
                    parent.comments_count -= 1
    # Resolve every open report about the same target at once.
    for other in db.scalars(
        select(Report).where(Report.target_type == r.target_type, Report.target_id == r.target_id, Report.status == "open")
    ):
        other.status = "actioned" if body.action == "hide" else "dismissed"
        other.resolved_by_id = admin.id
    db.commit()
    return {"ok": True}


@router.get("/moderation/organizations")
def list_organizations(status: str = "pending", db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Organization accounts waiting for verification (or already verified)."""
    stmt = select(User).where(User.role.in_(["organization", "municipality"]), User.is_hidden.is_(False))
    stmt = stmt.where(User.verified.is_(status == "verified"))
    rows = db.scalars(stmt.order_by(desc(User.created_at), desc(User.id)).limit(200))
    return [{**user_brief(u), "email": u.email, "created_at": iso(u.created_at)} for u in rows]


@router.post("/moderation/organizations/{user_id}")
def verify_organization(user_id: int, body: OrgVerification, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    u = db.get(User, user_id)
    if u is None or u.role not in ("organization", "municipality"):
        raise HTTPException(404, "Organization not found.")
    if u.verified != body.verified:
        u.verified = body.verified
        if body.verified:
            events.notify(
                db, u.id, admin, "organization_verified",
                "Your organization account is verified. You can now express interest in solutions and update their status.",
                "/solutions?sort=top",
            )
    db.commit()
    return {**user_brief(u), "email": u.email, "created_at": iso(u.created_at)}


@router.delete("/comments/{comment_id}", status_code=204)
def delete_comment(comment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    c = db.get(Comment, comment_id)
    if c is None or c.is_hidden:
        raise HTTPException(404, "Comment not found.")
    if c.author_id != user.id and user.role != "admin":
        raise HTTPException(403, "You can only delete your own comments.")
    c.is_hidden = True
    parent = db.get(Solution, c.solution_id) if c.solution_id else db.get(Problem, c.problem_id)
    if parent is not None and parent.comments_count:
        parent.comments_count -= 1
    db.commit()
