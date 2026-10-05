"""Time-aware trending scores.

Each recent interaction contributes weight * exp(-age / half-life-ish), so an old
solution with thousands of stars can only trend while it keeps receiving fresh
engagement. A small freshness bonus gives brand-new submissions a chance.
"""

import math
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Comment, Problem, ProblemSupport, Solution, SolutionStar

WINDOW_DAYS = 14
DECAY_HOURS = 72.0


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _decay(now: datetime, ts: datetime) -> float:
    age_h = max(0.0, (now - _aware(ts)).total_seconds() / 3600)
    return math.exp(-age_h / DECAY_HOURS)


def solution_trending_scores(db: Session, solution_ids: list[int] | None = None) -> dict[int, float]:
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=WINDOW_DAYS)
    scores: dict[int, float] = defaultdict(float)

    q = select(SolutionStar.solution_id, SolutionStar.created_at).where(SolutionStar.created_at >= since)
    if solution_ids is not None:
        q = q.where(SolutionStar.solution_id.in_(solution_ids))
    for sid, ts in db.execute(q):
        scores[sid] += 1.0 * _decay(now, ts)

    q = select(Comment.solution_id, Comment.created_at).where(
        Comment.created_at >= since, Comment.solution_id.is_not(None), Comment.is_hidden.is_(False)
    )
    if solution_ids is not None:
        q = q.where(Comment.solution_id.in_(solution_ids))
    for sid, ts in db.execute(q):
        scores[sid] += 2.5 * _decay(now, ts)

    q = select(Solution.id, Solution.created_at).where(Solution.created_at >= since)
    if solution_ids is not None:
        q = q.where(Solution.id.in_(solution_ids))
    for sid, ts in db.execute(q):
        scores[sid] += 4.0 * _decay(now, ts)
    return scores


def problem_trending_scores(db: Session) -> dict[int, float]:
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=WINDOW_DAYS)
    scores: dict[int, float] = defaultdict(float)
    for pid, ts in db.execute(select(ProblemSupport.problem_id, ProblemSupport.created_at).where(ProblemSupport.created_at >= since)):
        scores[pid] += 1.0 * _decay(now, ts)
    for pid, ts in db.execute(select(Solution.problem_id, Solution.created_at).where(Solution.created_at >= since)):
        scores[pid] += 4.0 * _decay(now, ts)
    for pid, ts in db.execute(
        select(Comment.problem_id, Comment.created_at).where(
            Comment.created_at >= since, Comment.problem_id.is_not(None), Comment.is_hidden.is_(False)
        )
    ):
        scores[pid] += 2.0 * _decay(now, ts)
    for pid, ts in db.execute(select(Problem.id, Problem.created_at).where(Problem.created_at >= since)):
        scores[pid] += 3.0 * _decay(now, ts)
    return scores
