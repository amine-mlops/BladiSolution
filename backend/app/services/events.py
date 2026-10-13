"""Activity feed and notification fan-out, triggered only by real events."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Activity, CategoryFollow, Notification, Problem, ProblemFollower, Solution, User, UserFollow, utcnow

STAR_MILESTONES = {1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000}


def record(db: Session, actor: User, verb: str, problem: Problem | None = None, solution: Solution | None = None, **meta) -> None:
    db.add(
        Activity(
            actor_id=actor.id,
            verb=verb,
            problem_id=problem.id if problem else (solution.problem_id if solution else None),
            solution_id=solution.id if solution else None,
            meta=meta or None,
        )
    )


def notify(db: Session, user_id: int, actor: User | None, type_: str, message: str, link: str | None = None) -> None:
    if actor is not None and user_id == actor.id:
        return
    db.add(Notification(user_id=user_id, actor_id=actor.id if actor else None, type=type_, message=message, link=link))


def notify_many(db: Session, user_ids: set[int], actor: User | None, type_: str, message: str, link: str | None) -> None:
    for uid in user_ids:
        notify(db, uid, actor, type_, message, link)


def on_new_solution(db: Session, actor: User, solution: Solution, problem: Problem) -> None:
    link = f"/solutions/{solution.id}"
    record(db, actor, "submitted_solution", problem=problem, solution=solution)
    notified: set[int] = {actor.id}

    # Problem author always hears about new solutions to their problem.
    if problem.author_id not in notified:
        notify(db, problem.author_id, actor, "new_solution",
               f'{actor.name} proposed "{solution.title}" for your problem "{problem.title}".', link)
        notified.add(problem.author_id)

    followers = set(db.scalars(select(ProblemFollower.user_id).where(ProblemFollower.problem_id == problem.id))) - notified
    notify_many(db, followers, actor, "new_solution",
                f'New solution "{solution.title}" submitted to "{problem.title}", a problem you follow.', link)
    notified |= followers

    fans = set(db.scalars(select(UserFollow.follower_id).where(UserFollow.followed_id == actor.id))) - notified
    notify_many(db, fans, actor, "followed_user_solution", f'{actor.name} published a new solution: "{solution.title}".', link)


def on_new_problem(db: Session, actor: User, problem: Problem) -> None:
    record(db, actor, "published_problem" if not problem.is_official else "published_challenge", problem=problem)
    link = f"/problems/{problem.id}"
    watchers = set(db.scalars(select(CategoryFollow.user_id).where(CategoryFollow.category == problem.category)))
    watchers.discard(actor.id)
    label = "official challenge" if problem.is_official else "problem"
    notify_many(db, watchers, actor, "category_problem", f'New {label} in a domain you follow: "{problem.title}"' + (f" ({problem.city})." if problem.city else "."), link)


def on_star(db: Session, actor: User, solution: Solution) -> None:
    record(db, actor, "starred_solution", solution=solution)
    solution.last_activity_at = utcnow()
    n = solution.stars_count
    if n in STAR_MILESTONES:
        msg = (
            f'{actor.name} starred your solution "{solution.title}".'
            if n == 1
            else f'Your solution "{solution.title}" reached {n} community stars.'
        )
        notify(db, solution.author_id, actor if n == 1 else None, "star_milestone", msg, f"/solutions/{solution.id}")
