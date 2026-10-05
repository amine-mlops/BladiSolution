from fastapi import APIRouter, Depends, Query
from sqlalchemy import String, cast, desc, distinct, func, or_, select, union
from sqlalchemy.orm import Session

from ..constants import CATEGORIES, CATEGORY_BY_SLUG, CITIES
from ..db import get_db
from ..models import (
    Activity,
    CategoryFollow,
    Comment,
    Problem,
    ProblemFollower,
    ProblemSupport,
    Solution,
    SolutionStar,
    Tag,
    User,
    UserFollow,
)
from ..security import get_current_user, get_optional_user
from ..serializers import iso, problems_out, solutions_out, user_brief
from ..services.ai import get_ai_service
from ..services.ranking import problem_trending_scores, solution_trending_scores
from .common import user_stats

router = APIRouter(tags=["discover"])

VISIBLE_ACTIVITY = [
    "submitted_solution", "published_problem", "published_challenge", "starred_solution", "commented_solution",
    "commented_problem", "changed_solution_status", "supported_problem", "joined_solution", "changed_problem_status",
]


def activity_out(a: Activity) -> dict:
    return {
        "id": a.id,
        "verb": a.verb,
        "actor": user_brief(a.actor),
        "problem": {"id": a.problem.id, "title": a.problem.title, "city": a.problem.city, "category": a.problem.category} if a.problem else None,
        "solution": {"id": a.solution.id, "title": a.solution.title} if a.solution else None,
        "meta": a.meta,
        "created_at": iso(a.created_at),
    }


def _visible_activity(stmt):
    return (
        stmt.where(Activity.verb.in_(VISIBLE_ACTIVITY))
        .outerjoin(Problem, Problem.id == Activity.problem_id)
        .outerjoin(Solution, Solution.id == Activity.solution_id)
        .where(or_(Problem.id.is_(None), Problem.is_hidden.is_(False)), or_(Solution.id.is_(None), Solution.is_hidden.is_(False)))
    )


@router.get("/activity")
def activity(
    scope: str = "global",
    limit: int = Query(20, ge=1, le=60),
    exclude_stars: bool = False,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_optional_user),
):
    stmt = _visible_activity(select(Activity))
    if exclude_stars:
        stmt = stmt.where(Activity.verb.notin_(["starred_solution", "supported_problem"]))
    if scope == "following":
        if viewer is None:
            return []
        followed_users = select(UserFollow.followed_id).where(UserFollow.follower_id == viewer.id)
        followed_problems = select(ProblemFollower.problem_id).where(ProblemFollower.user_id == viewer.id)
        followed_cats = select(CategoryFollow.category).where(CategoryFollow.user_id == viewer.id)
        stmt = stmt.where(
            Activity.actor_id != viewer.id,
            or_(
                Activity.actor_id.in_(followed_users),
                Activity.problem_id.in_(followed_problems),
                Problem.category.in_(followed_cats),
            ),
        )
    rows = db.scalars(stmt.order_by(desc(Activity.created_at)).limit(limit)).unique()
    return [activity_out(a) for a in rows]


def platform_stats(db: Session, city: str | None = None) -> dict:
    pq = select(func.count()).select_from(Problem).where(Problem.is_hidden.is_(False))
    sq = select(func.count()).select_from(Solution).join(Problem).where(Solution.is_hidden.is_(False))
    if city:
        pq = pq.where(Problem.city == city)
        sq = sq.where(Problem.city == city)
    in_city = select(Problem.id).where(Problem.city == city) if city else None
    city_solutions = select(Solution.id).where(Solution.problem_id.in_(in_city)) if city else None
    branches = [
        select(Problem.author_id.label("uid")),
        select(Solution.author_id.label("uid")),
        select(Comment.author_id.label("uid")),
        select(SolutionStar.user_id.label("uid")),
        select(ProblemSupport.user_id.label("uid")),
    ]
    if city:
        branches = [
            branches[0].where(Problem.city == city),
            branches[1].where(Solution.problem_id.in_(in_city)),
            branches[2].where(or_(Comment.problem_id.in_(in_city), Comment.solution_id.in_(city_solutions))),
            branches[3].where(SolutionStar.solution_id.in_(city_solutions)),
            branches[4].where(ProblemSupport.problem_id.in_(in_city)),
        ]
    participants = union(*branches).subquery()
    return {
        "problems": db.scalar(pq) or 0,
        "open_problems": db.scalar(pq.where(Problem.status.in_(["open", "under_review", "in_progress"]))) or 0,
        "solutions": db.scalar(sq) or 0,
        "active_solutions": db.scalar(sq.where(Solution.status != "implemented")) or 0,
        "implemented": db.scalar(sq.where(Solution.status == "implemented")) or 0,
        "selected": db.scalar(sq.where(Solution.status == "selected")) or 0,
        "participants": db.scalar(select(func.count(distinct(participants.c.uid)))) or 0,
        "organizations": db.scalar(
            select(func.count()).select_from(User).where(User.role.in_(["organization", "municipality"]), User.is_hidden.is_(False))
        ) or 0,
        "stars": db.scalar(select(func.count()).select_from(SolutionStar)) or 0,
        "cities": db.scalar(select(func.count(distinct(Problem.city))).where(Problem.is_hidden.is_(False))) or 0,
    }


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    return platform_stats(db)


@router.get("/discover")
def discover(db: Session = Depends(get_db), viewer: User | None = Depends(get_optional_user)):
    vis_p = Problem.is_hidden.is_(False)
    open_p = Problem.status.in_(["open", "under_review", "in_progress"])

    p_scores = problem_trending_scores(db)
    trending_ids = [pid for pid, _ in sorted(p_scores.items(), key=lambda kv: -kv[1])[:30]]
    pmap = {p.id: p for p in db.scalars(select(Problem).where(Problem.id.in_(trending_ids), vis_p, open_p)).unique()}
    trending_problems = [pmap[i] for i in trending_ids if i in pmap][:6]

    latest_problems = list(db.scalars(select(Problem).where(vis_p).order_by(desc(Problem.created_at)).limit(6)).unique())

    vis_s = Solution.is_hidden.is_(False)
    s_scores = solution_trending_scores(db)
    s_ids = [sid for sid, _ in sorted(s_scores.items(), key=lambda kv: -kv[1])[:30]]
    smap = {s.id: s for s in db.scalars(select(Solution).where(Solution.id.in_(s_ids), vis_s)).unique()}
    trending_solutions = [smap[i] for i in s_ids if i in smap][:6]
    latest_solutions = list(db.scalars(select(Solution).where(vis_s).order_by(desc(Solution.created_at)).limit(6)).unique())
    implemented = list(
        db.scalars(select(Solution).where(vis_s, Solution.status == "implemented").order_by(desc(Solution.decided_at)).limit(4)).unique()
    )

    people = list(db.scalars(select(User).where(User.is_featured.is_(True), User.is_hidden.is_(False), User.role.in_(["talent", "citizen"]))))
    orgs = list(db.scalars(select(User).where(User.is_hidden.is_(False), User.role.in_(["organization", "municipality"]))))
    st = user_stats(db, [u.id for u in people + orgs])
    people.sort(key=lambda u: -st[u.id]["reputation"])
    orgs.sort(key=lambda u: -(st[u.id]["solutions"] * 10 + st[u.id]["problems"] * 5 + st[u.id]["reputation"]))

    return {
        "stats": platform_stats(db),
        "trending_problems": problems_out(db, viewer, trending_problems),
        "latest_problems": problems_out(db, viewer, latest_problems),
        "trending_solutions": solutions_out(db, viewer, trending_solutions),
        "latest_solutions": solutions_out(db, viewer, latest_solutions),
        "recently_implemented": solutions_out(db, viewer, implemented),
        "top_contributors": [{**user_brief(u), "stats": st[u.id]} for u in people[:6]],
        "active_organizations": [{**user_brief(u), "stats": st[u.id]} for u in orgs[:6]],
    }


@router.get("/search")
def search(
    q: str = Query(..., min_length=1, max_length=120),
    type: str = "all",
    category: str | None = None,
    city: str | None = None,
    limit: int = Query(10, ge=1, le=40),
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_optional_user),
):
    terms = [t for t in q.split() if t][:6]
    out: dict = {"query": q}

    # A term that names a city or category acts as a filter rather than free text.
    city_names = {c.lower(): c for c in CITIES}
    free_terms, auto_city = [], city
    for t in terms:
        if t.lower() in city_names and not auto_city:
            auto_city = city_names[t.lower()]
        else:
            free_terms.append(t)
    cat_matches = [c["slug"] for c in CATEGORIES if q.lower() in c["name"].lower() or q.lower() == c["slug"]]

    if type in ("all", "problems"):
        stmt = select(Problem).where(Problem.is_hidden.is_(False))
        if category:
            stmt = stmt.where(Problem.category == category)
        if auto_city:
            stmt = stmt.where(Problem.city == auto_city)
        for t in free_terms:
            like = f"%{t}%"
            cats = [c["slug"] for c in CATEGORIES if t.lower() in c["name"].lower()]
            stmt = stmt.where(
                or_(
                    Problem.title.ilike(like), Problem.description.ilike(like), Problem.neighborhood.ilike(like),
                    Problem.tags.any(Tag.name.ilike(like)), Problem.category.in_(cats or ["__none__"]),
                )
            )
        if not free_terms and cat_matches:
            stmt = stmt.where(Problem.category.in_(cat_matches))
        rows = list(db.scalars(stmt.order_by(desc(Problem.supporters_count)).limit(limit)).unique())
        out["problems"] = problems_out(db, viewer, rows)

    if type in ("all", "solutions"):
        stmt = select(Solution).join(Problem, Problem.id == Solution.problem_id).where(Solution.is_hidden.is_(False))
        if category:
            stmt = stmt.where(Problem.category == category)
        if auto_city:
            stmt = stmt.where(Problem.city == auto_city)
        for t in free_terms:
            like = f"%{t}%"
            cats = [c["slug"] for c in CATEGORIES if t.lower() in c["name"].lower()]
            stmt = stmt.where(
                or_(
                    Solution.title.ilike(like), Solution.description.ilike(like), Solution.approach.ilike(like),
                    cast(Solution.required_skills, String).ilike(like), Solution.tags.any(Tag.name.ilike(like)),
                    Problem.title.ilike(like), Problem.category.in_(cats or ["__none__"]),
                )
            )
        if not free_terms and cat_matches:
            stmt = stmt.where(Problem.category.in_(cat_matches))
        rows = list(db.scalars(stmt.order_by(desc(Solution.stars_count)).limit(limit)).unique())
        out["solutions"] = solutions_out(db, viewer, rows)

    if type in ("all", "users"):
        stmt = select(User).where(User.is_hidden.is_(False), User.is_featured.is_(True))
        if auto_city:
            stmt = stmt.where(User.city == auto_city)
        for t in free_terms:
            like = f"%{t}%"
            stmt = stmt.where(
                or_(User.name.ilike(like), User.headline.ilike(like), cast(User.skills, String).ilike(like), User.bio.ilike(like))
            )
        rows = list(db.scalars(stmt.limit(limit)))
        st = user_stats(db, [u.id for u in rows])
        rows.sort(key=lambda u: -st[u.id]["reputation"])
        out["users"] = [{**user_brief(u), "stats": st[u.id]} for u in rows]

    if type in ("all", "tags"):
        like = f"%{q.strip().lstrip('#')}%"
        out["tags"] = list(db.scalars(select(Tag.name).where(Tag.name.ilike(like)).limit(10)))
    return out


@router.get("/meta")
def meta(db: Session = Depends(get_db)):
    counts = dict(
        db.execute(
            select(Problem.category, func.count()).where(Problem.is_hidden.is_(False)).group_by(Problem.category)
        ).all()
    )
    skill_rows = db.scalars(select(Solution.required_skills).limit(500))
    from collections import Counter

    skills = Counter(s for row in skill_rows for s in (row or []))
    for c in CATEGORIES:
        for s in c["skills"]:
            skills[s] += 0
    ai = get_ai_service()
    return {
        "categories": [{**{k: v for k, v in c.items()}, "problems": counts.get(c["slug"], 0)} for c in CATEGORIES],
        "cities": [{"name": n, "lat": lat, "lng": lng} for n, (lat, lng) in CITIES.items()],
        "skills": [s for s, _ in skills.most_common(60)],
        "ai_provider": ai.name,
    }


@router.get("/me/category-follows")
def my_category_follows(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return list(db.scalars(select(CategoryFollow.category).where(CategoryFollow.user_id == user.id)))


__all__ = ["router", "CATEGORY_BY_SLUG"]
