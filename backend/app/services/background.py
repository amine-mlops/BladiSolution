"""Work that runs after the response is sent (LLM upgrades of cached AI output)."""

import logging

from ..db import SessionLocal
from ..models import Problem, Solution
from .ai import get_ai_service

log = logging.getLogger("bladisolution.ai")


def solution_ai_payload(s: Solution) -> dict:
    return {
        "problem_title": s.problem.title,
        "title": s.title,
        "description": s.description,
        "approach": s.approach,
        "impact": s.impact,
        "implementation_plan": s.implementation_plan,
        "required_skills": s.required_skills or [],
    }


def upgrade_problem_analysis(problem_id: int) -> None:
    ai = get_ai_service()
    if ai.name == "local":
        return
    with SessionLocal() as db:
        p = db.get(Problem, problem_id)
        if p is None:
            return
        analysis = ai.analyze_problem(p.title, p.description, p.city)
        if analysis.get("provider") != "local":
            p.ai_analysis = analysis
            db.commit()


def upgrade_solution_summary(solution_id: int) -> None:
    ai = get_ai_service()
    if ai.name == "local":
        return
    with SessionLocal() as db:
        s = db.get(Solution, solution_id)
        if s is None:
            return
        summary = ai.summarize_solution(solution_ai_payload(s))
        if summary.get("provider") != "local":
            s.ai_summary = summary
            db.commit()
