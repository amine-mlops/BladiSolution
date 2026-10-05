from collections.abc import Iterable
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .constants import CATEGORY_BY_SLUG
from .models import Comment, Problem, ProblemFollower, ProblemSupport, Solution, SolutionStar, User


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def user_brief(u: User | None) -> dict | None:
    if u is None:
        return None
    return {
        "id": u.id,
        "username": u.username,
        "name": u.name,
        "role": u.role,
        "org_kind": u.org_kind,
        "headline": u.headline,
        "city": u.city,
        "avatar_url": u.avatar_url,
        "verified": u.verified,
        "skills": (u.skills or [])[:6],
    }


def user_private(u: User) -> dict:
    return {
        **user_brief(u),
        "email": u.email,
        "bio": u.bio,
        "skills": u.skills or [],
        "website": u.website,
        "is_demo": u.is_demo,
        "created_at": iso(u.created_at),
    }


def category_brief(slug: str) -> dict:
    c = CATEGORY_BY_SLUG.get(slug, {"slug": slug, "name": slug, "icon": "circle", "color": "#64748b"})
    return {"slug": c["slug"], "name": c["name"], "icon": c["icon"], "color": c["color"]}


def problem_out(p: Problem, state: dict | None = None, full: bool = False) -> dict:
    out = {
        "id": p.id,
        "title": p.title,
        "excerpt": p.description[:220] + ("…" if len(p.description) > 220 else ""),
        "category": category_brief(p.category),
        "city": p.city,
        "neighborhood": p.neighborhood,
        "location": p.location,
        "lat": p.lat,
        "lng": p.lng,
        "image_url": p.image_url,
        "impact": p.impact,
        "urgency": p.urgency,
        "status": p.status,
        "is_official": p.is_official,
        "author": user_brief(p.author),
        "supporters_count": p.supporters_count,
        "followers_count": p.followers_count,
        "solutions_count": p.solutions_count,
        "comments_count": p.comments_count,
        "tags": [t.name for t in p.tags],
        "created_at": iso(p.created_at),
        "last_activity_at": iso(p.last_activity_at),
        "supported": bool(state and p.id in state.get("supported", ())),
        "following": bool(state and p.id in state.get("following", ())),
    }
    if full:
        out["description"] = p.description
        out["ai_analysis"] = p.ai_analysis
        out["affected_population"] = p.affected_population
    return out


def solution_out(s: Solution, starred: Iterable[int] = (), full: bool = False) -> dict:
    out = {
        "id": s.id,
        "title": s.title,
        "excerpt": s.description[:200] + ("…" if len(s.description) > 200 else ""),
        "status": s.status,
        "stars_count": s.stars_count,
        "comments_count": s.comments_count,
        "required_skills": s.required_skills or [],
        "author": user_brief(s.author),
        "problem": {
            "id": s.problem.id,
            "title": s.problem.title,
            "city": s.problem.city,
            "neighborhood": s.problem.neighborhood,
            "category": category_brief(s.problem.category),
            "status": s.problem.status,
        },
        "tags": [t.name for t in s.tags],
        "created_at": iso(s.created_at),
        "updated_at": iso(s.updated_at),
        "last_activity_at": iso(s.last_activity_at),
        "starred": s.id in set(starred),
        "decided_by": user_brief(s.decided_by),
        "decided_at": iso(s.decided_at),
        "implementation": implementation_out(s.implementation),
    }
    if full:
        out.update(
            {
                "description": s.description,
                "approach": s.approach,
                "impact": s.impact,
                "implementation_plan": s.implementation_plan,
                "resources": s.resources,
                "estimated_cost": s.estimated_cost,
                "links": s.links or [],
                "status_note": s.status_note,
                "ai_summary": s.ai_summary,
            }
        )
    return out


def implementation_out(impl) -> dict | None:
    if impl is None:
        return None
    return {
        "organization": user_brief(impl.organization),
        "implemented_at": iso(impl.implemented_at),
        "location": impl.location,
        "impact_summary": impl.impact_summary,
        "citizens_impacted": impl.citizens_impacted,
        "evidence_url": impl.evidence_url,
    }


def comment_out(c: Comment) -> dict:
    return {
        "id": c.id,
        "body": c.body,
        "author": user_brief(c.author),
        "parent_id": c.parent_id,
        "created_at": iso(c.created_at),
    }


def starred_ids(db: Session, user: User | None, solution_ids: list[int]) -> set[int]:
    if not user or not solution_ids:
        return set()
    rows = db.scalars(
        select(SolutionStar.solution_id).where(
            SolutionStar.user_id == user.id, SolutionStar.solution_id.in_(solution_ids)
        )
    )
    return set(rows)


def problem_state(db: Session, user: User | None, problem_ids: list[int]) -> dict:
    if not user or not problem_ids:
        return {}
    supported = set(
        db.scalars(
            select(ProblemSupport.problem_id).where(
                ProblemSupport.user_id == user.id, ProblemSupport.problem_id.in_(problem_ids)
            )
        )
    )
    following = set(
        db.scalars(
            select(ProblemFollower.problem_id).where(
                ProblemFollower.user_id == user.id, ProblemFollower.problem_id.in_(problem_ids)
            )
        )
    )
    return {"supported": supported, "following": following}


def problems_out(db: Session, user: User | None, problems: list[Problem]) -> list[dict]:
    state = problem_state(db, user, [p.id for p in problems])
    return [problem_out(p, state) for p in problems]


def solutions_out(db: Session, user: User | None, solutions: list[Solution]) -> list[dict]:
    starred = starred_ids(db, user, [s.id for s in solutions])
    return [solution_out(s, starred) for s in solutions]
