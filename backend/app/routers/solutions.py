from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import String, cast, desc, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..constants import AUTHOR_SOLUTION_STATUSES, DECISION_ROLES, SOLUTION_STATUSES
from ..db import get_db
from ..models import (
    Activity,
    Comment,
    Implementation,
    Problem,
    ProblemFollower,
    Solution,
    SolutionContributor,
    SolutionStar,
    User,
    utcnow,
)
from ..schemas import CollaborationDecision, CollaborationIn, CommentIn, ContactIn, SolutionUpdate, StatusChange
from ..security import get_current_user, get_optional_user, rate_limit
from ..serializers import comment_out, iso, solution_out, solutions_out, user_brief
from ..services import events
from ..services.ranking import solution_trending_scores
from .common import Page, get_solution_or_404

router = APIRouter(prefix="/solutions", tags=["solutions"])

FEED_SORTS = {"latest", "top", "trending", "discussed", "implemented"}
SINCE = {"24h": timedelta(hours=24), "7d": timedelta(days=7), "30d": timedelta(days=30), "90d": timedelta(days=90)}


@router.get("")
def feed(
    sort: str = "latest",
    category: str | None = None,
    city: str | None = None,
    neighborhood: str | None = None,
    status: str | None = None,
    skill: str | None = Query(None, max_length=40),
    since: str | None = None,
    page: Page = Depends(),
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_optional_user),
):
    """Global solution feed with filters."""
    if sort not in FEED_SORTS:
        raise HTTPException(400, "Unknown sort")
    stmt = select(Solution).join(Problem, Problem.id == Solution.problem_id).where(
        Solution.is_hidden.is_(False), Problem.is_hidden.is_(False)
    )
    if category:
        stmt = stmt.where(Problem.category == category)
    if city:
        stmt = stmt.where(Problem.city == city)
    if neighborhood:
        stmt = stmt.where(Problem.neighborhood.ilike(f"%{neighborhood}%"))
    if status:
        if status not in SOLUTION_STATUSES:
            raise HTTPException(400, "Unknown status")
        stmt = stmt.where(Solution.status == status)
    if sort == "implemented":
        stmt = stmt.where(Solution.status == "implemented")
    if skill:
        stmt = stmt.where(cast(Solution.required_skills, String).ilike(f"%{skill}%"))
    if since in SINCE:
        stmt = stmt.where(Solution.created_at >= datetime.now(timezone.utc) - SINCE[since])

    if sort == "trending":
        ids = list(db.scalars(stmt.with_only_columns(Solution.id)))
        scores = solution_trending_scores(db, ids)
        ids.sort(key=lambda i: -scores.get(i, 0.0))
        total = len(ids)
        page_ids = ids[(page.page - 1) * page.size : page.page * page.size]
        by_id = {s.id: s for s in db.scalars(select(Solution).where(Solution.id.in_(page_ids))).unique()}
        items = [by_id[i] for i in page_ids if i in by_id]
    else:
        order = {
            "latest": [desc(Solution.created_at)],
            "top": [desc(Solution.stars_count), desc(Solution.created_at)],
            "discussed": [desc(Solution.comments_count), desc(Solution.last_activity_at)],
            "implemented": [desc(Solution.decided_at)],
        }[sort]
        items, total = page.apply(db, stmt.order_by(*order))
    return page.envelope(solutions_out(db, viewer, items), total)


@router.get("/latest")
def latest(page: Page = Depends(), db: Session = Depends(get_db), viewer: User | None = Depends(get_optional_user)):
    return feed(sort="latest", page=page, db=db, viewer=viewer, category=None, city=None, neighborhood=None, status=None, skill=None, since=None)


@router.get("/trending")
def trending(page: Page = Depends(), db: Session = Depends(get_db), viewer: User | None = Depends(get_optional_user)):
    return feed(sort="trending", page=page, db=db, viewer=viewer, category=None, city=None, neighborhood=None, status=None, skill=None, since=None)


@router.get("/top")
def top(page: Page = Depends(), db: Session = Depends(get_db), viewer: User | None = Depends(get_optional_user)):
    return feed(sort="top", page=page, db=db, viewer=viewer, category=None, city=None, neighborhood=None, status=None, skill=None, since=None)


def _contributors(db: Session, s: Solution) -> list[dict]:
    rows = db.scalars(
        select(SolutionContributor).where(SolutionContributor.solution_id == s.id).order_by(SolutionContributor.created_at)
    )
    return [
        {"user": user_brief(c.user), "role": c.role, "status": c.status, "message": c.message, "created_at": iso(c.created_at)}
        for c in rows
    ]


@router.get("/{solution_id}")
def get_solution(solution_id: int, db: Session = Depends(get_db), viewer: User | None = Depends(get_optional_user)):
    s = get_solution_or_404(db, solution_id, viewer)
    starred = {s.id} if viewer and db.get(SolutionStar, {"user_id": viewer.id, "solution_id": s.id}) else set()
    out = solution_out(s, starred, full=True)
    contributors = _contributors(db, s)
    is_author = bool(viewer and viewer.id == s.author_id)
    out["contributors"] = [c for c in contributors if c["status"] == "accepted" or is_author]
    out["can_edit"] = is_author
    out["can_decide"] = bool(viewer and viewer.role in DECISION_ROLES)
    out["my_collaboration"] = next(
        (c["status"] for c in contributors if viewer and c["user"]["id"] == viewer.id and c["role"] == "contributor"), None
    )
    out["problem"]["description"] = s.problem.description[:400]
    out["problem"]["supporters_count"] = s.problem.supporters_count
    out["problem"]["solutions_count"] = s.problem.solutions_count
    return out


@router.patch("/{solution_id}")
def edit_solution(solution_id: int, body: SolutionUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    s = get_solution_or_404(db, solution_id, user)
    if user.id != s.author_id:
        raise HTTPException(403, "Only the author can edit this solution.")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    s.last_activity_at = utcnow()
    events.record(db, user, "updated_solution", solution=s)
    db.commit()
    return get_solution(solution_id, db, user)


@router.patch("/{solution_id}/status")
def change_status(solution_id: int, body: StatusChange, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    s = get_solution_or_404(db, solution_id, user)
    is_author = user.id == s.author_id
    is_decider = user.role in DECISION_ROLES
    if body.status == s.status:
        return get_solution(solution_id, db, user)
    if not is_decider and not (is_author and body.status in AUTHOR_SOLUTION_STATUSES and s.status in AUTHOR_SOLUTION_STATUSES):
        raise HTTPException(403, "Only organizations and municipalities can evaluate, select or implement solutions.")

    old = s.status
    s.status = body.status
    s.status_note = body.note or s.status_note
    s.last_activity_at = utcnow()
    if body.status in ("under_evaluation", "selected", "implemented") and is_decider:
        s.decided_by_id = user.id
        s.decided_at = utcnow()
    if body.status == "implemented":
        impl = s.implementation or Implementation(solution_id=s.id, organization_id=user.id)
        impl.organization_id = user.id
        impl.implemented_at = utcnow()
        impl.location = body.location or impl.location or f"{s.problem.neighborhood or ''} {s.problem.city}".strip()
        impl.impact_summary = body.impact_summary or impl.impact_summary
        impl.citizens_impacted = body.citizens_impacted if body.citizens_impacted is not None else impl.citizens_impacted
        impl.evidence_url = body.evidence_url or impl.evidence_url
        if s.implementation is None:
            db.add(impl)
        if s.problem.status in ("open", "under_review", "in_progress"):
            s.problem.status = "solved"
    elif body.status == "selected" and s.problem.status in ("open", "under_review"):
        s.problem.status = "in_progress"
    elif body.status == "under_evaluation" and s.problem.status == "open":
        s.problem.status = "under_review"

    events.record(db, user, "changed_solution_status", solution=s, old=old, new=body.status)
    link = f"/solutions/{s.id}"
    messages = {
        "under_evaluation": ("status_evaluation", f'{user.name} is evaluating your solution "{s.title}".'),
        "selected": ("status_selected", f'Your solution "{s.title}" was selected by {user.name}.'),
        "implemented": ("status_implemented", f'Your solution "{s.title}" was marked as implemented by {user.name}.'),
        "developing": ("status_developing", f'"{s.title}" moved to Developing.'),
        "proposed": ("status_proposed", f'"{s.title}" moved back to Proposed.'),
    }
    ntype, msg = messages[body.status]
    recipients = {s.author_id} | set(
        db.scalars(
            select(SolutionContributor.user_id).where(
                SolutionContributor.solution_id == s.id, SolutionContributor.status == "accepted"
            )
        )
    )
    events.notify_many(db, recipients, user, ntype, msg, link)
    if body.status in ("selected", "implemented"):
        followers = set(db.scalars(select(ProblemFollower.user_id).where(ProblemFollower.problem_id == s.problem_id))) - recipients
        verb = "selected" if body.status == "selected" else "implemented"
        events.notify_many(
            db, followers, user, ntype, f'"{s.title}" was {verb} for "{s.problem.title}", a problem you follow.', link
        )
    db.commit()
    db.refresh(s)
    return get_solution(solution_id, db, user)


# ---------------------------------------------------------------- stars
@router.post("/{solution_id}/star", dependencies=[Depends(rate_limit("star", 120, 60))])
def star(solution_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    s = get_solution_or_404(db, solution_id, user)
    if db.get(SolutionStar, {"user_id": user.id, "solution_id": s.id}) is None:
        try:
            db.add(SolutionStar(user_id=user.id, solution_id=s.id))
            db.flush()
        except IntegrityError:
            db.rollback()
        else:
            db.execute(update(Solution).where(Solution.id == s.id).values(stars_count=Solution.stars_count + 1))
            db.refresh(s)
            events.on_star(db, user, s)
            db.commit()
    db.refresh(s)
    return {"starred": True, "stars_count": s.stars_count}


@router.delete("/{solution_id}/star", dependencies=[Depends(rate_limit("star", 120, 60))])
def unstar(solution_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    s = get_solution_or_404(db, solution_id, user)
    row = db.get(SolutionStar, {"user_id": user.id, "solution_id": s.id})
    if row is not None:
        db.delete(row)
        db.execute(update(Solution).where(Solution.id == s.id, Solution.stars_count > 0).values(stars_count=Solution.stars_count - 1))
        db.commit()
    db.refresh(s)
    return {"starred": False, "stars_count": s.stars_count}


# ---------------------------------------------------------------- comments
@router.get("/{solution_id}/comments")
def solution_comments(solution_id: int, db: Session = Depends(get_db), viewer: User | None = Depends(get_optional_user)):
    s = get_solution_or_404(db, solution_id, viewer)
    rows = db.scalars(
        select(Comment).where(Comment.solution_id == s.id, Comment.is_hidden.is_(False)).order_by(Comment.created_at)
    )
    return [comment_out(c) for c in rows]


@router.post("/{solution_id}/comments", status_code=201, dependencies=[Depends(rate_limit("comment", 30, 600))])
def comment_solution(solution_id: int, body: CommentIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    s = get_solution_or_404(db, solution_id, user)
    parent = None
    if body.parent_id:
        parent = db.get(Comment, body.parent_id)
        if parent is None or parent.solution_id != s.id:
            raise HTTPException(400, "Invalid reply target.")
        if parent.parent_id:
            parent = db.get(Comment, parent.parent_id)
    c = Comment(author_id=user.id, solution_id=s.id, parent_id=parent.id if parent else None, body=body.body)
    db.add(c)
    s.comments_count = (s.comments_count or 0) + 1
    s.last_activity_at = utcnow()
    events.record(db, user, "commented_solution", solution=s)
    link = f"/solutions/{s.id}#discussion"
    if parent:
        events.notify(db, parent.author_id, user, "reply", f'{user.name} replied to your comment on "{s.title}".', link)
    if not parent or parent.author_id != s.author_id:
        events.notify(db, s.author_id, user, "comment", f'{user.name} commented on your solution "{s.title}".', link)
    db.commit()
    return comment_out(c)


# ---------------------------------------------------------------- activity
@router.get("/{solution_id}/activity")
def solution_activity(solution_id: int, db: Session = Depends(get_db), viewer: User | None = Depends(get_optional_user)):
    s = get_solution_or_404(db, solution_id, viewer)
    rows = db.scalars(
        select(Activity)
        .where(Activity.solution_id == s.id, Activity.verb.in_(["submitted_solution", "changed_solution_status", "updated_solution", "joined_solution"]))
        .order_by(desc(Activity.created_at))
        .limit(30)
    )
    return [
        {"id": a.id, "verb": a.verb, "actor": user_brief(a.actor), "meta": a.meta, "created_at": iso(a.created_at)}
        for a in rows
    ]


# ---------------------------------------------------------------- contact & collaboration
@router.post("/{solution_id}/contact", dependencies=[Depends(rate_limit("contact", 10, 3600))])
def contact(solution_id: int, body: ContactIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    s = get_solution_or_404(db, solution_id, user)
    if user.id == s.author_id:
        raise HTTPException(400, "This is your own solution.")
    msg = (
        f'{user.name} ({user.email}) contacted you about "{s.title}": "{body.message}"'
    )
    events.notify(db, s.author_id, user, "contact", msg, f"/u/{user.username}")
    events.record(db, user, "contacted_author", solution=s)
    db.commit()
    return {"sent": True}


@router.post("/{solution_id}/collaborate", dependencies=[Depends(rate_limit("collab", 20, 3600))])
def request_collaboration(solution_id: int, body: CollaborationIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    s = get_solution_or_404(db, solution_id, user)
    if user.id == s.author_id:
        raise HTTPException(400, "You're already the author.")
    existing = db.scalar(
        select(SolutionContributor).where(SolutionContributor.solution_id == s.id, SolutionContributor.user_id == user.id)
    )
    if existing:
        return {"status": existing.status}
    db.add(SolutionContributor(solution_id=s.id, user_id=user.id, role="contributor", status="pending", message=body.message))
    note = f' — "{body.message}"' if body.message else ""
    events.notify(db, s.author_id, user, "collaboration_request", f'{user.name} wants to collaborate on "{s.title}"{note}', f"/solutions/{s.id}#team")
    db.commit()
    return {"status": "pending"}


@router.post("/{solution_id}/collaborators/{user_id}")
def decide_collaboration(
    solution_id: int, user_id: int, body: CollaborationDecision, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    s = get_solution_or_404(db, solution_id, user)
    if user.id != s.author_id:
        raise HTTPException(403, "Only the author can manage the team.")
    row = db.scalar(
        select(SolutionContributor).where(SolutionContributor.solution_id == s.id, SolutionContributor.user_id == user_id)
    )
    if row is None or row.role == "author":
        raise HTTPException(404, "Request not found.")
    row.status = "accepted" if body.accept else "declined"
    if body.accept:
        member = db.get(User, user_id)
        events.record(db, member, "joined_solution", solution=s)
        events.notify(db, user_id, user, "collaboration_accepted", f'You joined the team of "{s.title}".', f"/solutions/{s.id}")
    db.commit()
    return {"status": row.status}
