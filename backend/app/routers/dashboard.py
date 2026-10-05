from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from ..constants import CATEGORIES, SOLUTION_STATUSES
from ..db import get_db
from ..models import Activity, Comment, Problem, Solution, SolutionStar, User
from ..security import get_optional_user
from ..serializers import problems_out, solutions_out
from .discover import VISIBLE_ACTIVITY, activity_out, platform_stats

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _week_buckets(rows, weeks: int, now: datetime) -> list[int]:
    out = [0] * weeks
    for (ts,) in rows:
        ts = ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
        idx = weeks - 1 - int((now - ts).days // 7)
        if 0 <= idx < weeks:
            out[idx] += 1
    return out


@router.get("")
def overview(city: str | None = None, db: Session = Depends(get_db), viewer: User | None = Depends(get_optional_user)):
    now = datetime.now(timezone.utc)
    vis_p = [Problem.is_hidden.is_(False)]
    if city:
        vis_p.append(Problem.city == city)
    vis_s = [Solution.is_hidden.is_(False), *vis_p]

    by_category = dict(db.execute(select(Problem.category, func.count()).where(*vis_p).group_by(Problem.category)).all())
    sol_by_category = dict(
        db.execute(select(Problem.category, func.count()).select_from(Solution).join(Problem).where(*vis_s).group_by(Problem.category)).all()
    )
    by_city = db.execute(
        select(Problem.city, func.count()).where(Problem.is_hidden.is_(False)).group_by(Problem.city).order_by(desc(func.count()))
    ).all()
    by_status = dict(db.execute(select(Solution.status, func.count()).select_from(Solution).join(Problem).where(*vis_s).group_by(Solution.status)).all())
    problem_status = dict(db.execute(select(Problem.status, func.count()).where(*vis_p).group_by(Problem.status)).all())

    weeks = 12
    since = now - timedelta(weeks=weeks)
    participation = {
        "problems": _week_buckets(db.execute(select(Problem.created_at).where(*vis_p, Problem.created_at >= since)), weeks, now),
        "solutions": _week_buckets(
            db.execute(select(Solution.created_at).join(Problem).where(*vis_s, Solution.created_at >= since)), weeks, now
        ),
        "stars": _week_buckets(
            db.execute(select(SolutionStar.created_at).join(Solution).join(Problem).where(*vis_s, SolutionStar.created_at >= since)), weeks, now
        ),
        "comments": _week_buckets(db.execute(select(Comment.created_at).where(Comment.created_at >= since)), weeks, now),
        "week_starts": [(now - timedelta(weeks=weeks - 1 - i)).date().isoformat() for i in range(weeks)],
    }

    top_problems = list(
        db.scalars(
            select(Problem).where(*vis_p, Problem.status.in_(["open", "under_review", "in_progress"]))
            .order_by(desc(Problem.supporters_count)).limit(8)
        ).unique()
    )
    top_solutions = list(
        db.scalars(
            select(Solution).join(Problem).where(*vis_s, Solution.status.in_(["proposed", "developing", "under_evaluation"]))
            .order_by(desc(Solution.stars_count)).limit(10)
        ).unique()
    )
    pipeline = {
        status: solutions_out(
            db,
            viewer,
            list(
                db.scalars(
                    select(Solution).join(Problem).where(*vis_s, Solution.status == status)
                    .order_by(desc(Solution.decided_at), desc(Solution.stars_count)).limit(6)
                ).unique()
            ),
        )
        for status in ("under_evaluation", "selected", "implemented")
    }
    recent = db.scalars(
        select(Activity).join(Problem, Problem.id == Activity.problem_id)
        .where(Activity.verb.in_(VISIBLE_ACTIVITY), Activity.verb != "starred_solution", *vis_p)
        .order_by(desc(Activity.created_at)).limit(12)
    ).unique()

    stats = platform_stats(db, city)
    total_solutions = sum(by_status.values()) or 1
    problems_total = sum(problem_status.values()) or 1
    return {
        "city": city,
        "stats": stats,
        "implementation_rate": round(100 * by_status.get("implemented", 0) / total_solutions, 1),
        "resolution_rate": round(100 * problem_status.get("solved", 0) / problems_total, 1),
        "problems_by_category": [
            {"slug": c["slug"], "name": c["name"], "color": c["color"], "problems": by_category.get(c["slug"], 0), "solutions": sol_by_category.get(c["slug"], 0)}
            for c in CATEGORIES
        ],
        "problems_by_city": [{"city": c, "problems": n} for c, n in by_city],
        "solutions_by_status": [{"status": s, "count": by_status.get(s, 0)} for s in SOLUTION_STATUSES],
        "problems_by_status": problem_status,
        "participation": participation,
        "top_problems": problems_out(db, viewer, top_problems),
        "top_solutions": solutions_out(db, viewer, top_solutions),
        "pipeline": pipeline,
        "recent_activity": [activity_out(a) for a in recent],
    }
