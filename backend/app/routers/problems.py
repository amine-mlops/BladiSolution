from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import desc, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..constants import DECISION_ROLES
from ..db import get_db
from ..models import Comment, Problem, ProblemFollower, ProblemSupport, Solution, SolutionContributor, Tag, User, utcnow
from ..schemas import CommentIn, ProblemIn, ProblemUpdate, SolutionIn
from ..security import get_current_user, get_optional_user, rate_limit
from ..serializers import comment_out, problem_out, problem_state, problems_out, solution_out, solutions_out
from ..services import events
from ..services.ai import get_local_ai
from ..services.background import solution_ai_payload, upgrade_problem_analysis, upgrade_solution_summary
from ..services.ranking import problem_trending_scores, solution_trending_scores
from .common import Page, get_or_create_tags, get_problem_or_404

router = APIRouter(prefix="/problems", tags=["problems"])

PROBLEM_SORTS = {"trending", "latest", "supported", "discussed", "solutions", "unsolved"}
SOLUTION_SORTS = {"top", "latest", "discussed", "implemented", "trending"}


def _filtered(stmt, category, city, neighborhood, status, official, q):
    if category:
        stmt = stmt.where(Problem.category == category)
    if city:
        stmt = stmt.where(Problem.city == city)
    if neighborhood:
        stmt = stmt.where(Problem.neighborhood.ilike(f"%{neighborhood}%"))
    if status:
        stmt = stmt.where(Problem.status == status)
    elif status is None:
        stmt = stmt.where(Problem.status != "archived")
    if official:
        stmt = stmt.where(Problem.is_official.is_(True))
    if q:
        for term in q.split()[:6]:
            like = f"%{term}%"
            stmt = stmt.where(
                or_(
                    Problem.title.ilike(like),
                    Problem.description.ilike(like),
                    Problem.city.ilike(like),
                    Problem.neighborhood.ilike(like),
                    Problem.tags.any(Tag.name.ilike(like)),
                )
            )
    return stmt


@router.get("")
def list_problems(
    sort: str = "trending",
    category: str | None = None,
    city: str | None = None,
    neighborhood: str | None = None,
    status: str | None = None,
    official: bool = False,
    q: str | None = Query(None, max_length=120),
    page: Page = Depends(),
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_optional_user),
):
    if sort not in PROBLEM_SORTS:
        raise HTTPException(400, "Unknown sort")
    stmt = _filtered(select(Problem).where(Problem.is_hidden.is_(False)), category, city, neighborhood, status, official, q)
    if sort == "trending":
        ids = list(db.scalars(stmt.with_only_columns(Problem.id)))
        scores = problem_trending_scores(db)
        ids.sort(key=lambda i: -scores.get(i, 0.0))
        total = len(ids)
        page_ids = ids[(page.page - 1) * page.size : page.page * page.size]
        by_id = {p.id: p for p in db.scalars(select(Problem).where(Problem.id.in_(page_ids))).unique()}
        items = [by_id[i] for i in page_ids if i in by_id]
    else:
        order = {
            "latest": [desc(Problem.created_at)],
            "supported": [desc(Problem.supporters_count), desc(Problem.created_at)],
            "discussed": [desc(Problem.comments_count + Problem.solutions_count), desc(Problem.last_activity_at)],
            "solutions": [desc(Problem.solutions_count), desc(Problem.supporters_count)],
            "unsolved": [Problem.solutions_count.asc(), desc(Problem.supporters_count)],
        }[sort]
        items, total = page.apply(db, stmt.order_by(*order))
    return page.envelope(problems_out(db, viewer, items), total)


@router.get("/map")
def problems_map(category: str | None = None, city: str | None = None, db: Session = Depends(get_db)):
    stmt = select(
        Problem.id, Problem.title, Problem.category, Problem.city, Problem.neighborhood, Problem.urgency,
        Problem.status, Problem.lat, Problem.lng, Problem.supporters_count, Problem.solutions_count,
    ).where(Problem.is_hidden.is_(False), Problem.lat.is_not(None), Problem.status != "archived")
    if category:
        stmt = stmt.where(Problem.category == category)
    if city:
        stmt = stmt.where(Problem.city == city)
    return [dict(r._mapping) for r in db.execute(stmt)]


@router.post("", status_code=201, dependencies=[Depends(rate_limit("create_problem", 10, 3600))])
def create_problem(
    body: ProblemIn,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    analysis = get_local_ai().analyze_problem(body.title, body.description, body.city)
    p = Problem(
        title=body.title,
        description=body.description,
        category=body.category,
        city=body.city,
        neighborhood=body.neighborhood,
        location=body.location,
        lat=body.lat,
        lng=body.lng,
        impact=body.impact,
        urgency=body.urgency,
        image_url=body.image_url,
        is_official=body.is_official and user.role in DECISION_ROLES,
        author_id=user.id,
        ai_analysis=analysis,
        affected_population=analysis.get("affected_estimate"),
        followers_count=1,
    )
    p.tags = get_or_create_tags(db, body.tags or analysis["keywords"][:3])
    db.add(p)
    db.flush()
    db.add(ProblemFollower(user_id=user.id, problem_id=p.id))
    events.on_new_problem(db, user, p)
    db.commit()
    background.add_task(upgrade_problem_analysis, p.id)
    return problem_out(p, {"following": {p.id}}, full=True)


@router.get("/{problem_id}")
def get_problem(problem_id: int, db: Session = Depends(get_db), viewer: User | None = Depends(get_optional_user)):
    p = get_problem_or_404(db, problem_id, viewer)
    out = problem_out(p, problem_state(db, viewer, [p.id]), full=True)
    counts = dict(
        db.execute(
            select(Solution.status, func.count())
            .where(Solution.problem_id == p.id, Solution.is_hidden.is_(False))
            .group_by(Solution.status)
        ).all()
    )
    out["solution_status_counts"] = counts
    out["can_edit"] = bool(viewer and (viewer.id == p.author_id or viewer.role == "admin"))
    out["can_manage_status"] = bool(viewer and (viewer.role in DECISION_ROLES or viewer.id == p.author_id))
    return out


@router.patch("/{problem_id}")
def update_problem(problem_id: int, body: ProblemUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    p = get_problem_or_404(db, problem_id, user)
    is_author = user.id == p.author_id
    is_decider = user.role in DECISION_ROLES
    data = body.model_dump(exclude_unset=True)
    content_fields = {k for k in data if k != "status"}
    if content_fields and not (is_author or user.role == "admin"):
        raise HTTPException(403, "Only the author can edit this problem.")
    if "status" in data and data["status"] != p.status:
        if not is_decider and not (is_author and data["status"] in ("solved", "archived", "open")):
            raise HTTPException(403, "You can't set this status.")
        old = p.status
        p.status = data["status"]
        events.record(db, user, "changed_problem_status", problem=p, old=old, new=p.status)
        followers = set(db.scalars(select(ProblemFollower.user_id).where(ProblemFollower.problem_id == p.id)))
        label = p.status.replace("_", " ").title()
        events.notify_many(db, followers, user, "problem_status", f'"{p.title}" is now {label}.', f"/problems/{p.id}")
    for k in content_fields:
        setattr(p, k, data[k])
    db.commit()
    return get_problem(problem_id, db, user)


@router.delete("/{problem_id}", status_code=204)
def delete_problem(problem_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    p = get_problem_or_404(db, problem_id, user)
    if user.role != "admin" and user.id != p.author_id:
        raise HTTPException(403, "Only the author can delete this problem.")
    if user.role != "admin" and p.solutions_count > 0:
        raise HTTPException(409, "This problem already has solutions; archive it instead so contributors keep their work.")
    db.delete(p)
    db.commit()


# ---------------------------------------------------------------- support & follow
def _toggle(db: Session, model, user: User, p: Problem, counter: str, add: bool) -> bool:
    key = {"user_id": user.id, "problem_id": p.id}
    row = db.get(model, key)
    col = getattr(Problem, counter)
    if add and row is None:
        db.add(model(**key))
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            return True
        db.execute(update(Problem).where(Problem.id == p.id).values({counter: col + 1}))
        return True
    if not add and row is not None:
        db.delete(row)
        db.execute(update(Problem).where(Problem.id == p.id, col > 0).values({counter: col - 1}))
    return add


@router.post("/{problem_id}/support")
def support(problem_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    p = get_problem_or_404(db, problem_id, user)
    was = db.get(ProblemSupport, {"user_id": user.id, "problem_id": p.id}) is not None
    _toggle(db, ProblemSupport, user, p, "supporters_count", True)
    if not was:
        p.last_activity_at = utcnow()
        events.record(db, user, "supported_problem", problem=p)
        # Supporting implies wanting updates.
        _toggle(db, ProblemFollower, user, p, "followers_count", True)
    db.commit()
    db.refresh(p)
    return {"supported": True, "supporters_count": p.supporters_count, "following": True, "followers_count": p.followers_count}


@router.delete("/{problem_id}/support")
def unsupport(problem_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    p = get_problem_or_404(db, problem_id, user)
    _toggle(db, ProblemSupport, user, p, "supporters_count", False)
    db.commit()
    db.refresh(p)
    return {"supported": False, "supporters_count": p.supporters_count}


@router.post("/{problem_id}/follow")
def follow(problem_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    p = get_problem_or_404(db, problem_id, user)
    _toggle(db, ProblemFollower, user, p, "followers_count", True)
    db.commit()
    db.refresh(p)
    return {"following": True, "followers_count": p.followers_count}


@router.delete("/{problem_id}/follow")
def unfollow(problem_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    p = get_problem_or_404(db, problem_id, user)
    _toggle(db, ProblemFollower, user, p, "followers_count", False)
    db.commit()
    db.refresh(p)
    return {"following": False, "followers_count": p.followers_count}


# ---------------------------------------------------------------- solutions
@router.get("/{problem_id}/solutions")
def problem_solutions(
    problem_id: int,
    sort: str = "top",
    page: Page = Depends(),
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_optional_user),
):
    if sort not in SOLUTION_SORTS:
        raise HTTPException(400, "Unknown sort")
    p = get_problem_or_404(db, problem_id, viewer)
    stmt = select(Solution).where(Solution.problem_id == p.id, Solution.is_hidden.is_(False))
    if sort == "trending":
        sols = list(db.scalars(stmt).unique())
        scores = solution_trending_scores(db, [s.id for s in sols])
        sols.sort(key=lambda s: (-scores.get(s.id, 0.0), -s.stars_count))
        total = len(sols)
        items = sols[(page.page - 1) * page.size : page.page * page.size]
    else:
        if sort == "implemented":
            stmt = stmt.where(Solution.status == "implemented")
        order = {
            "top": [desc(Solution.stars_count), desc(Solution.created_at)],
            "latest": [desc(Solution.created_at)],
            "discussed": [desc(Solution.comments_count), desc(Solution.last_activity_at)],
            "implemented": [desc(Solution.decided_at), desc(Solution.stars_count)],
        }[sort]
        items, total = page.apply(db, stmt.order_by(*order))
    return page.envelope(solutions_out(db, viewer, items), total)


@router.post("/{problem_id}/solutions", status_code=201, dependencies=[Depends(rate_limit("create_solution", 15, 3600))])
def create_solution(
    problem_id: int,
    body: SolutionIn,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    p = get_problem_or_404(db, problem_id, user)
    if p.status in ("archived", "solved"):
        raise HTTPException(409, "This problem is closed to new solutions.")
    s = Solution(
        problem_id=p.id,
        author_id=user.id,
        title=body.title,
        description=body.description,
        approach=body.approach,
        impact=body.impact,
        implementation_plan=body.implementation_plan,
        required_skills=body.required_skills,
        resources=body.resources,
        estimated_cost=body.estimated_cost,
        links=body.links,
    )
    s.tags = get_or_create_tags(db, body.tags)
    s.problem = p
    db.add(s)
    db.flush()
    s.ai_summary = get_local_ai().summarize_solution(solution_ai_payload(s))
    db.add(SolutionContributor(solution_id=s.id, user_id=user.id, role="author", status="accepted"))
    p.solutions_count = (p.solutions_count or 0) + 1
    p.last_activity_at = utcnow()
    events.on_new_solution(db, user, s, p)
    db.commit()
    background.add_task(upgrade_solution_summary, s.id)
    return solution_out(s, full=True)


# ---------------------------------------------------------------- discussion
@router.get("/{problem_id}/comments")
def problem_comments(problem_id: int, db: Session = Depends(get_db), viewer: User | None = Depends(get_optional_user)):
    p = get_problem_or_404(db, problem_id, viewer)
    rows = db.scalars(
        select(Comment).where(Comment.problem_id == p.id, Comment.is_hidden.is_(False)).order_by(Comment.created_at)
    )
    return [comment_out(c) for c in rows]


@router.post("/{problem_id}/comments", status_code=201, dependencies=[Depends(rate_limit("comment", 30, 600))])
def comment_problem(problem_id: int, body: CommentIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    p = get_problem_or_404(db, problem_id, user)
    parent = None
    if body.parent_id:
        parent = db.get(Comment, body.parent_id)
        if parent is None or parent.problem_id != p.id:
            raise HTTPException(400, "Invalid reply target.")
        if parent.parent_id:  # keep threads one level deep
            parent = db.get(Comment, parent.parent_id)
    c = Comment(author_id=user.id, problem_id=p.id, parent_id=parent.id if parent else None, body=body.body)
    db.add(c)
    p.comments_count = (p.comments_count or 0) + 1
    p.last_activity_at = utcnow()
    events.record(db, user, "commented_problem", problem=p)
    link = f"/problems/{p.id}#discussion"
    if parent:
        events.notify(db, parent.author_id, user, "reply", f'{user.name} replied to your comment on "{p.title}".', link)
    if not parent or parent.author_id != p.author_id:
        events.notify(db, p.author_id, user, "comment", f'{user.name} commented on your problem "{p.title}".', link)
    db.commit()
    return comment_out(c)
