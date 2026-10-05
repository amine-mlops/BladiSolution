from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import String, cast, desc, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..constants import CATEGORY_SLUGS
from ..db import get_db
from ..models import CategoryFollow, Problem, ProblemFollower, Solution, User, UserFollow
from ..schemas import ProfileUpdate
from ..security import get_current_user, get_optional_user
from ..serializers import problems_out, solutions_out, user_brief, user_private
from .common import Page, get_user_or_404, user_stats

router = APIRouter(tags=["users"])


@router.get("/users")
def list_users(
    role: str | None = None,
    city: str | None = None,
    skill: str | None = None,
    q: str | None = Query(None, max_length=80),
    sort: str = "reputation",
    limit: int = Query(12, ge=1, le=50),
    db: Session = Depends(get_db),
):
    stmt = select(User).where(User.is_hidden.is_(False), User.is_featured.is_(True))
    if role == "organizations":
        stmt = stmt.where(User.role.in_(["organization", "municipality"]))
    elif role:
        stmt = stmt.where(User.role == role)
    if city:
        stmt = stmt.where(User.city == city)
    if skill:
        stmt = stmt.where(cast(User.skills, String).ilike(f"%{skill}%"))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(User.name.ilike(like), User.headline.ilike(like), cast(User.skills, String).ilike(like)))
    users = list(db.scalars(stmt.limit(300)))
    stats = user_stats(db, [u.id for u in users])
    key = {
        "reputation": lambda u: -stats[u.id]["reputation"],
        "stars": lambda u: -stats[u.id]["stars"],
        "implemented": lambda u: (-stats[u.id]["implemented"], -stats[u.id]["reputation"]),
        "newest": lambda u: -u.id,
    }.get(sort, lambda u: -stats[u.id]["reputation"])
    users.sort(key=key)
    return [{**user_brief(u), "stats": stats[u.id]} for u in users[:limit]]


@router.get("/users/{username}")
def profile(username: str, db: Session = Depends(get_db), viewer: User | None = Depends(get_optional_user)):
    u = get_user_or_404(db, username)
    stats = user_stats(db, [u.id])[u.id]
    following = bool(
        viewer and db.get(UserFollow, {"follower_id": viewer.id, "followed_id": u.id})
    )
    following_count = db.scalar(select(func.count()).select_from(UserFollow).where(UserFollow.follower_id == u.id))
    cat_rows = db.execute(
        select(Problem.category, func.count())
        .join(Solution, Solution.problem_id == Problem.id)
        .where(Solution.author_id == u.id, Solution.is_hidden.is_(False))
        .group_by(Problem.category)
        .order_by(desc(func.count()))
    ).all()
    return {
        **user_brief(u),
        "bio": u.bio,
        "skills": u.skills or [],
        "website": u.website,
        "created_at": u.created_at.isoformat(),
        "stats": {**stats, "following": following_count or 0},
        "focus_categories": [{"slug": c, "count": n} for c, n in cat_rows[:4]],
        "is_following": following,
        "is_me": bool(viewer and viewer.id == u.id),
    }


@router.get("/users/{username}/solutions")
def user_solutions(username: str, page: Page = Depends(), db: Session = Depends(get_db), viewer: User | None = Depends(get_optional_user)):
    u = get_user_or_404(db, username)
    stmt = (
        select(Solution)
        .where(Solution.author_id == u.id, Solution.is_hidden.is_(False))
        .order_by(desc(Solution.status == "implemented"), desc(Solution.stars_count))
    )
    items, total = page.apply(db, stmt)
    return page.envelope(solutions_out(db, viewer, items), total)


@router.get("/users/{username}/problems")
def user_problems(username: str, page: Page = Depends(), db: Session = Depends(get_db), viewer: User | None = Depends(get_optional_user)):
    u = get_user_or_404(db, username)
    stmt = select(Problem).where(Problem.author_id == u.id, Problem.is_hidden.is_(False)).order_by(desc(Problem.created_at))
    items, total = page.apply(db, stmt)
    return page.envelope(problems_out(db, viewer, items), total)


@router.patch("/users/me")
def update_me(body: ProfileUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    data = body.model_dump(exclude_unset=True)
    if "role" in data and data["role"] and user.role == "admin":
        data.pop("role")  # admins keep their role
    for field, value in data.items():
        setattr(user, field, value)
    if user.role == "municipality":
        user.org_kind = "municipality"
    elif user.role not in ("organization", "municipality"):
        user.org_kind = None
    db.commit()
    return user_private(user)


@router.post("/users/{username}/follow")
def follow_user(username: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    target = get_user_or_404(db, username)
    if target.id == user.id:
        raise HTTPException(400, "You can't follow yourself.")
    if not db.get(UserFollow, {"follower_id": user.id, "followed_id": target.id}):
        db.add(UserFollow(follower_id=user.id, followed_id=target.id))
        from ..services.events import notify

        notify(db, target.id, user, "new_follower", f"{user.name} started following your contributions.", f"/u/{user.username}")
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
    return {"following": True}


@router.delete("/users/{username}/follow")
def unfollow_user(username: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    target = get_user_or_404(db, username)
    row = db.get(UserFollow, {"follower_id": user.id, "followed_id": target.id})
    if row:
        db.delete(row)
        db.commit()
    return {"following": False}


@router.get("/me/following")
def my_following(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    problems = list(
        db.scalars(
            select(Problem)
            .join(ProblemFollower, ProblemFollower.problem_id == Problem.id)
            .where(ProblemFollower.user_id == user.id, Problem.is_hidden.is_(False))
            .order_by(desc(Problem.last_activity_at))
        ).unique()
    )
    users = list(
        db.scalars(select(User).join(UserFollow, UserFollow.followed_id == User.id).where(UserFollow.follower_id == user.id))
    )
    cats = list(db.scalars(select(CategoryFollow.category).where(CategoryFollow.user_id == user.id)))
    return {"problems": problems_out(db, user, problems), "users": [user_brief(u) for u in users], "categories": cats}


@router.post("/categories/{slug}/follow")
def follow_category(slug: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if slug not in CATEGORY_SLUGS:
        raise HTTPException(404, "Unknown category")
    if not db.get(CategoryFollow, {"user_id": user.id, "category": slug}):
        db.add(CategoryFollow(user_id=user.id, category=slug))
        db.commit()
    return {"following": True}


@router.delete("/categories/{slug}/follow")
def unfollow_category(slug: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = db.get(CategoryFollow, {"user_id": user.id, "category": slug})
    if row:
        db.delete(row)
        db.commit()
    return {"following": False}
