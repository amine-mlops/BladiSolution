from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Problem, Solution, User
from ..schemas import AnalyzeIn, MatchIn, SimilarIn, SummarizeIn
from ..security import get_optional_user, rate_limit
from ..serializers import problem_out, user_brief
from ..services.ai import get_ai_service, get_local_ai
from ..services.background import solution_ai_payload
from .common import get_problem_or_404, get_solution_or_404, user_stats

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/status")
def status():
    ai = get_ai_service()
    return {"provider": ai.name, "model": getattr(ai, "model", None)}


@router.post("/analyze-problem", dependencies=[Depends(rate_limit("ai_analyze", 20, 300))])
def analyze_problem(body: AnalyzeIn):
    return get_ai_service().analyze_problem(body.title, body.description, body.city)


@router.post("/similar-problems", dependencies=[Depends(rate_limit("ai_similar", 60, 60))])
def similar_problems(body: SimilarIn, db: Session = Depends(get_db), viewer: User | None = Depends(get_optional_user)):
    if len(f"{body.title} {body.description}".strip()) < 12:
        return []
    rows = list(
        db.scalars(
            select(Problem).where(Problem.is_hidden.is_(False), Problem.status != "archived")
        ).unique()
    )
    candidates = [
        {
            "id": p.id, "title": p.title, "description": p.description, "category": p.category, "city": p.city,
            "neighborhood": p.neighborhood, "tags": [t.name for t in p.tags],
        }
        for p in rows
        if p.id != body.exclude_id
    ]
    matches = get_ai_service().detect_similar_problems(body.model_dump(), candidates, limit=4)
    by_id = {p.id: p for p in rows}
    return [{**problem_out(by_id[m["id"]]), "similarity": m["similarity"], "shared_terms": m["shared_terms"]} for m in matches]


@router.post("/summarize-solution", dependencies=[Depends(rate_limit("ai_summary", 30, 300))])
def summarize_solution(body: SummarizeIn, db: Session = Depends(get_db), viewer: User | None = Depends(get_optional_user)):
    s = get_solution_or_404(db, body.solution_id, viewer)
    ai = get_ai_service()
    cached = s.ai_summary
    if cached and not body.refresh and (cached.get("provider") == ai.name or ai.name == "local"):
        return cached
    summary = ai.summarize_solution(solution_ai_payload(s))
    if summary.get("provider") != "local" or not cached:
        s.ai_summary = summary
        db.commit()
    return summary


@router.post("/match-contributors", dependencies=[Depends(rate_limit("ai_match", 60, 60))])
def match_contributors(body: MatchIn, db: Session = Depends(get_db), viewer: User | None = Depends(get_optional_user)):
    p = get_problem_or_404(db, body.problem_id, viewer)
    return _match(db, p)


def _match(db: Session, p: Problem, limit: int = 5) -> list[dict]:
    already = set(db.scalars(select(Solution.author_id).where(Solution.problem_id == p.id)))
    already.add(p.author_id)
    users = [
        u for u in db.scalars(
            select(User).where(
                User.is_hidden.is_(False), User.is_featured.is_(True), User.role.in_(["talent", "organization"])
            )
        )
        if u.id not in already
    ]
    if not users:
        return []
    required = sorted({sk for row in db.scalars(select(Solution.required_skills).where(Solution.problem_id == p.id)) for sk in (row or [])})
    cat_counts: dict[int, dict[str, int]] = {}
    implemented: dict[int, int] = {}
    for author_id, category, status in db.execute(
        select(Solution.author_id, Problem.category, Solution.status)
        .join(Problem, Problem.id == Solution.problem_id)
        .where(Solution.author_id.in_([u.id for u in users]), Solution.is_hidden.is_(False))
    ):
        cat_counts.setdefault(author_id, {}).setdefault(category, 0)
        cat_counts[author_id][category] += 1
        if status == "implemented":
            implemented[author_id] = implemented.get(author_id, 0) + 1
    candidates = [
        {
            "id": u.id, "role": u.role, "city": u.city, "skills": u.skills or [],
            "category_counts": cat_counts.get(u.id, {}), "implemented": implemented.get(u.id, 0),
        }
        for u in users
    ]
    problem = {"category": p.category, "city": p.city, "title": p.title, "description": p.description, "required_skills": required}
    # Matching always runs on the deterministic engine: it is instant and explainable.
    matches = get_local_ai().match_contributors(problem, candidates, limit=limit)
    by_id = {u.id: u for u in users}
    stats = user_stats(db, [m["user_id"] for m in matches])
    return [
        {**user_brief(by_id[m["user_id"]]), "match": m["match"], "reasons": m["reasons"], "matched_skills": m["matched_skills"], "stats": stats[m["user_id"]]}
        for m in matches
    ]


__all__ = ["router", "HTTPException"]
