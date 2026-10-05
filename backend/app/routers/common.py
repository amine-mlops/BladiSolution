import math
import re
import unicodedata

from fastapi import HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Comment, Problem, Solution, SolutionContributor, SolutionStar, Tag, User, Implementation


def get_problem_or_404(db: Session, problem_id: int, viewer: User | None = None) -> Problem:
    p = db.get(Problem, problem_id)
    if p is None or (p.is_hidden and not (viewer and viewer.role == "admin")):
        raise HTTPException(404, "This problem doesn't exist or was removed.")
    return p


def get_solution_or_404(db: Session, solution_id: int, viewer: User | None = None) -> Solution:
    s = db.get(Solution, solution_id)
    if s is None or (s.is_hidden and not (viewer and viewer.role == "admin")):
        raise HTTPException(404, "This solution doesn't exist or was removed.")
    return s


def get_user_or_404(db: Session, username: str) -> User:
    u = db.scalar(select(User).where(User.username == username))
    if u is None or u.is_hidden:
        raise HTTPException(404, "User not found.")
    return u


def get_or_create_tags(db: Session, names: list[str]) -> list[Tag]:
    tags = []
    for name in names:
        tag = db.scalar(select(Tag).where(Tag.name == name))
        if tag is None:
            tag = Tag(name=name)
            db.add(tag)
            db.flush()
        tags.append(tag)
    return tags


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:36].strip("-") or "user"


def unique_username(db: Session, name: str) -> str:
    base = slugify(name)
    candidate, i = base, 1
    while db.scalar(select(User.id).where(User.username == candidate)) is not None:
        i += 1
        candidate = f"{base}-{i}"
    return candidate


class Page:
    def __init__(self, page: int = Query(1, ge=1, le=500), page_size: int = Query(12, ge=1, le=50)):
        self.page = page
        self.size = page_size

    def apply(self, db: Session, stmt, count_stmt=None):
        total = db.scalar(count_stmt if count_stmt is not None else select(func.count()).select_from(stmt.order_by(None).subquery()))
        items = list(db.scalars(stmt.offset((self.page - 1) * self.size).limit(self.size)).unique())
        return items, total or 0

    def envelope(self, items: list, total: int) -> dict:
        return {
            "items": items,
            "total": total,
            "page": self.page,
            "page_size": self.size,
            "pages": max(1, math.ceil(total / self.size)) if total else 1,
        }


def user_stats(db: Session, user_ids: list[int]) -> dict[int, dict]:
    """Contribution metrics for many users at once."""
    stats = {
        uid: {
            "solutions": 0, "stars": 0, "implemented": 0, "selected": 0, "problems": 0, "comments": 0,
            "collaborations": 0, "citizens_impacted": 0, "followers": 0,
        }
        for uid in user_ids
    }
    if not user_ids:
        return stats
    visible = Solution.is_hidden.is_(False)
    for uid, n, stars in db.execute(
        select(Solution.author_id, func.count(), func.coalesce(func.sum(Solution.stars_count), 0))
        .where(Solution.author_id.in_(user_ids), visible)
        .group_by(Solution.author_id)
    ):
        stats[uid]["solutions"] = n
        stats[uid]["stars"] = int(stars)
    for uid, status, n in db.execute(
        select(Solution.author_id, Solution.status, func.count())
        .where(Solution.author_id.in_(user_ids), visible, Solution.status.in_(["selected", "implemented"]))
        .group_by(Solution.author_id, Solution.status)
    ):
        stats[uid][status] = n
    for uid, n in db.execute(
        select(Solution.author_id, func.coalesce(func.sum(Implementation.citizens_impacted), 0))
        .join(Implementation, Implementation.solution_id == Solution.id)
        .where(Solution.author_id.in_(user_ids))
        .group_by(Solution.author_id)
    ):
        stats[uid]["citizens_impacted"] = int(n)
    for uid, n in db.execute(
        select(Problem.author_id, func.count()).where(Problem.author_id.in_(user_ids), Problem.is_hidden.is_(False)).group_by(Problem.author_id)
    ):
        stats[uid]["problems"] = n
    for uid, n in db.execute(
        select(Comment.author_id, func.count()).where(Comment.author_id.in_(user_ids), Comment.is_hidden.is_(False)).group_by(Comment.author_id)
    ):
        stats[uid]["comments"] = n
    for uid, n in db.execute(
        select(SolutionContributor.user_id, func.count())
        .where(
            SolutionContributor.user_id.in_(user_ids),
            SolutionContributor.role == "contributor",
            SolutionContributor.status == "accepted",
        )
        .group_by(SolutionContributor.user_id)
    ):
        stats[uid]["collaborations"] = n
    from ..models import UserFollow

    for uid, n in db.execute(
        select(UserFollow.followed_id, func.count()).where(UserFollow.followed_id.in_(user_ids)).group_by(UserFollow.followed_id)
    ):
        stats[uid]["followers"] = n
    for s in stats.values():
        # Real-world outcomes weigh far more than popularity.
        s["reputation"] = (
            s["implemented"] * 120 + s["selected"] * 50 + s["collaborations"] * 20 + s["solutions"] * 10
            + s["problems"] * 4 + s["comments"] * 2 + s["stars"]
        )
    return stats


def stars_given_count(db: Session, user_id: int) -> int:
    return db.scalar(select(func.count()).select_from(SolutionStar).where(SolutionStar.user_id == user_id)) or 0
