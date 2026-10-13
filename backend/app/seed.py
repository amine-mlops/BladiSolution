"""Build a FICTIONAL demo database from app.seed_data, for local development and tests.

All people, organizations, stars and implementations here are made up. Never load this
into a database real users see. It is not loaded automatically unless SEED_ON_STARTUP=true.

Every derived row (stars, supports, activity, notifications) is generated from
the seeded events themselves, so counters and feeds are internally consistent.

Run manually with:  python -m app.seed --reset
"""

import argparse
import random
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from .constants import CITIES, canonical_category
from .models import (
    Activity,
    CategoryFollow,
    Comment,
    Implementation,
    Notification,
    Problem,
    ProblemFollower,
    ProblemSupport,
    Solution,
    SolutionContributor,
    SolutionStar,
    Tag,
    User,
    UserFollow,
)
from .security import hash_password
from .seed_data import CATEGORY_FOLLOWS, COMMUNITY_CITIES, DEMO_PASSWORD, FIRST_NAMES, FOLLOWS, LAST_NAMES, PROBLEMS, USERS, USER_FOLLOWS
from .services.ai.local import LocalAIService
from .services.background import solution_ai_payload
from .services.events import STAR_MILESTONES

COMMUNITY_SIZE = 420


def seed_demo(db: Session, community_size: int = COMMUNITY_SIZE) -> dict:
    rnd = random.Random(2026)
    now = datetime.now(timezone.utc)
    ai = LocalAIService()

    def ts(age_days: float) -> datetime:
        return now - timedelta(days=age_days)

    def between(start: datetime, skew: float = 1.0) -> datetime:
        span = (now - start).total_seconds()
        return start + timedelta(seconds=span * (rnd.random() ** skew))

    # ------------------------------------------------------------------ users
    demo_hash = hash_password(DEMO_PASSWORD)
    users: dict[str, User] = {}
    for i, u in enumerate(USERS):
        user = User(
            email=u["email"],
            username=_username(u["name"]),
            password_hash=demo_hash,
            name=u["name"],
            role=u["role"],
            org_kind=u.get("org_kind"),
            headline=u.get("headline"),
            city=u.get("city"),
            bio=u.get("bio"),
            skills=u.get("skills", []),
            # Demo organizations are pre-verified so the organization workflow can be tried out.
            verified=u.get("verified", False) or u["role"] in ("organization", "municipality"),
            is_demo=u.get("demo", False),
            created_at=ts(120 - i),
        )
        db.add(user)
        users[u["key"]] = user
    db.flush()

    locked_hash = hash_password(secrets.token_urlsafe(24))  # community members can't sign in
    community: list[User] = []
    seen = set()
    while len(community) < community_size:
        first, last = rnd.choice(FIRST_NAMES), rnd.choice(LAST_NAMES)
        if (first, last) in seen:
            continue
        seen.add((first, last))
        n = len(community)
        community.append(
            User(
                email=f"member{n}@community.bladisolution.ma",
                username=f"{_username(first + ' ' + last)}-{n}",
                password_hash=locked_hash,
                name=f"{first} {last}",
                role="citizen",
                city=rnd.choice(COMMUNITY_CITIES),
                skills=[],
                is_featured=False,
                created_at=ts(rnd.uniform(30, 200)),
            )
        )
    db.add_all(community)
    db.flush()

    demo_ids = {u.id for u in users.values() if u.is_demo}
    featured_pool = [u for u in users.values() if not u.is_demo and u.role in ("citizen", "talent", "organization")]
    pool = community + featured_pool

    notifications: list[Notification] = []
    activities: list[Activity] = []

    def notify(user: User, actor: User | None, type_: str, message: str, link: str, at: datetime) -> None:
        if actor is not None and actor.id == user.id:
            return
        notifications.append(
            Notification(user_id=user.id, actor_id=actor.id if actor else None, type=type_, message=message,
                         link=link, created_at=at, read=at < now - timedelta(days=2))
        )

    def activity(actor: User, verb: str, at: datetime, problem: Problem | None = None, solution: Solution | None = None, **meta) -> None:
        activities.append(
            Activity(actor_id=actor.id, verb=verb, created_at=at, meta=meta or None,
                     problem_id=problem.id if problem else (solution.problem_id if solution else None),
                     solution_id=solution.id if solution else None)
        )

    tag_cache: dict[str, Tag] = {}

    def tags(names: list[str]) -> list[Tag]:
        out = []
        for n in names:
            if n not in tag_cache:
                tag_cache[n] = Tag(name=n)
                db.add(tag_cache[n])
            out.append(tag_cache[n])
        return out

    problems: dict[str, Problem] = {}
    solutions: dict[str, Solution] = {}
    followers: dict[str, set[int]] = {}
    last_activity: dict[int, datetime] = {}

    def bump(obj_key: int, at: datetime) -> None:
        last_activity[obj_key] = max(last_activity.get(obj_key, at), at)

    for spec in PROBLEMS:
        author = users[spec["author"]]
        created = ts(spec["age"])
        lat, lng = spec.get("coords") or CITIES[spec["city"]]
        analysis = ai.analyze_problem(spec["title"], spec["description"], spec["city"])
        p = Problem(
            title=spec["title"], description=spec["description"], category=canonical_category(spec["category"]), city=spec["city"],
            neighborhood=spec.get("neighborhood"), location=spec.get("location"), lat=lat, lng=lng,
            impact=spec["impact"], urgency=spec["urgency"], status=spec.get("status", "open"),
            is_official=spec.get("official", False), author_id=author.id, ai_analysis=analysis,
            affected_population=analysis["affected_estimate"], created_at=created, updated_at=created,
            last_activity_at=created,
        )
        p.tags = tags(spec.get("tags", []))
        db.add(p)
        db.flush()
        problems[spec["key"]] = p
        activity(author, "published_challenge" if p.is_official else "published_problem", created, problem=p)

        # Supports (exclude demo accounts so the demo can support live).
        candidates = [u for u in pool if u.id != author.id]
        supporters = rnd.sample(candidates, min(spec["supporters"], len(candidates)))
        fset = {author.id}
        for u in supporters:
            at = between(created + timedelta(hours=1), 1.6)
            db.add(ProblemSupport(user_id=u.id, problem_id=p.id, created_at=at))
            if u.is_featured:
                activity(u, "supported_problem", at, problem=p)
            if rnd.random() < 0.35:
                fset.add(u.id)
        for key, keys in FOLLOWS.items():
            if spec["key"] in keys:
                fset.add(users[key].id)
        followers[spec["key"]] = fset
        p.supporters_count = len(supporters)

        # Problem comments
        p.comments_count = _seed_comments(
            db, spec.get("comments", []), users, ts, notify, activity, bump,
            problem=p, owner=author, link=f"/problems/{p.id}#discussion",
        )

        # Solutions
        for sspec in spec["solutions"]:
            s_author = users[sspec["author"]]
            s_created = ts(sspec["age"])
            s = Solution(
                problem_id=p.id, author_id=s_author.id, title=sspec["title"], description=sspec["description"],
                approach=sspec["approach"], impact=sspec["impact"], implementation_plan=sspec["plan"],
                required_skills=sspec.get("skills", []), resources=sspec.get("resources"),
                estimated_cost=sspec.get("cost"), links=[], status=sspec.get("status", "proposed"),
                status_note=sspec.get("status_note"), created_at=s_created, updated_at=s_created,
                last_activity_at=s_created,
            )
            s.problem = p
            s.tags = tags(sspec.get("tags", []))
            db.add(s)
            db.flush()
            s.ai_summary = ai.summarize_solution(solution_ai_payload(s))
            solutions[sspec["key"]] = s
            link = f"/solutions/{s.id}"
            bump(-p.id, s_created)

            activity(s_author, "submitted_solution", s_created, solution=s)
            notify(author, s_author, "new_solution", f'{s_author.name} proposed "{s.title}" for your problem "{p.title}".', link, s_created)
            for fid in fset - {author.id, s_author.id}:
                fu = db.get(User, fid)
                if fu.is_featured:
                    notify(fu, s_author, "new_solution", f'New solution "{s.title}" submitted to "{p.title}", a problem you follow.', link, s_created)

            # Team
            db.add(SolutionContributor(solution_id=s.id, user_id=s_author.id, role="author", status="accepted", created_at=s_created))
            for ckey in sspec.get("contributors", []):
                cu = users[ckey]
                at = s_created + timedelta(days=min(2.0, sspec["age"] / 3))
                db.add(SolutionContributor(solution_id=s.id, user_id=cu.id, role="contributor", status="accepted", created_at=at))
                activity(cu, "joined_solution", at, solution=s)
                notify(cu, s_author, "collaboration_accepted", f'You joined the team of "{s.title}".', link, at)

            # Stars
            star_pool = [u for u in pool if u.id != s_author.id and u.id not in demo_ids]
            stars = rnd.sample(star_pool, min(sspec.get("stars", 0), len(star_pool)))
            star_times = sorted(between(s_created + timedelta(minutes=20), 1.5) for _ in stars)
            for u, at in zip(stars, star_times):
                db.add(SolutionStar(user_id=u.id, solution_id=s.id, created_at=at))
                if u.is_featured:
                    activity(u, "starred_solution", at, solution=s)
            for n, at in enumerate(star_times, start=1):
                if n in STAR_MILESTONES and n > 1:
                    notify(s_author, None, "star_milestone", f'Your solution "{s.title}" reached {n} community stars.', link, at)
            s.stars_count = len(stars)
            if star_times:
                bump(s.id, star_times[-1])

            # Comments
            s.comments_count = _seed_comments(
                db, sspec.get("comments", []), users, ts, notify, activity, bump,
                solution=s, owner=s_author, link=f"{link}#discussion",
            )

            # Status pipeline
            if sspec.get("decided_by"):
                decider = users[sspec["decided_by"]]
                d_at = ts(sspec["decided_age"])
                s.decided_by_id = decider.id
                s.decided_at = d_at
                path = {"under_evaluation": ["under_evaluation"], "selected": ["under_evaluation", "selected"],
                        "implemented": ["under_evaluation", "selected", "implemented"]}[s.status]
                steps = len(path)
                for i, st in enumerate(path):
                    at = d_at - timedelta(days=(steps - 1 - i) * 3)
                    activity(decider, "changed_solution_status", at, solution=s, old=(["developing"] + path)[i], new=st)
                    msg = {
                        "under_evaluation": f'{decider.name} is evaluating your solution "{s.title}".',
                        "selected": f'Your solution "{s.title}" was selected by {decider.name}.',
                        "implemented": f'Your solution "{s.title}" was marked as implemented by {decider.name}.',
                    }[st]
                    notify(s_author, decider, f"status_{'evaluation' if st == 'under_evaluation' else st}", msg, link, at)
                    bump(s.id, at)
                if s.status == "implemented":
                    impl = sspec["impl"]
                    db.add(Implementation(solution_id=s.id, organization_id=decider.id, implemented_at=d_at,
                                          location=impl["location"], impact_summary=impl["impact_summary"],
                                          citizens_impacted=impl["citizens_impacted"]))
            elif s.status == "developing":
                activity(s_author, "changed_solution_status", s_created + timedelta(days=1), solution=s, old="proposed", new="developing")

        p.solutions_count = len(spec["solutions"])
        statuses = {solutions[x["key"]].status for x in spec["solutions"]}
        if "status" not in spec:
            if "implemented" in statuses:
                p.status = "solved"
            elif "selected" in statuses:
                p.status = "in_progress"
            elif "under_evaluation" in statuses:
                p.status = "under_review"

    # Followers
    for key, fset in followers.items():
        p = problems[key]
        for uid in fset:
            db.add(ProblemFollower(user_id=uid, problem_id=p.id, created_at=p.created_at))
        p.followers_count = len(fset)

    # Last activity
    for p in problems.values():
        p.last_activity_at = max([p.created_at, last_activity.get(-p.id, p.created_at), last_activity.get(p.id + 10**6, p.created_at)])
    for s in solutions.values():
        s.last_activity_at = max(s.created_at, last_activity.get(s.id, s.created_at))
        s.updated_at = s.last_activity_at

    # A pending collaboration request the Talent Demo can accept live.
    req_at = ts(0.3)
    db.add(SolutionContributor(solution_id=solutions["light_report"].id, user_id=users["anas"].id, role="contributor",
                               status="pending", message="I can add automatic pole-number recognition with a small vision model.", created_at=req_at))
    notify(users["talent_demo"], users["anas"], "collaboration_request",
           f'{users["anas"].name} wants to collaborate on "{solutions["light_report"].title}"', f'/solutions/{solutions["light_report"].id}#team', req_at)

    # Social graph
    for a, targets in USER_FOLLOWS.items():
        for b in targets:
            db.add(UserFollow(follower_id=users[a].id, followed_id=users[b].id, created_at=ts(30)))
    for a, cats in CATEGORY_FOLLOWS.items():
        for c in sorted({canonical_category(c) for c in cats}):
            db.add(CategoryFollow(user_id=users[a].id, category=c, created_at=ts(30)))
    # A few community follows for realistic follower counts
    for target in ("amine", "smartlab", "org_demo", "talent_demo", "darna", "sara", "mahfoud"):
        for u in rnd.sample(community, min(len(community), rnd.randint(25, 90))):
            db.add(UserFollow(follower_id=u.id, followed_id=users[target].id, created_at=between(ts(90))))

    db.add_all(activities)
    db.add_all(notifications)
    db.commit()
    return {"users": len(users) + len(community), "problems": len(problems), "solutions": len(solutions),
            "activities": len(activities), "notifications": len(notifications)}


def _seed_comments(db, specs, users, ts, notify, activity, bump, owner, link, problem=None, solution=None) -> int:
    count = 0
    target_title = (solution or problem).title
    for spec in specs:
        author_key, body, age = spec[:3]
        replies = spec[3] if len(spec) > 3 else []
        author = users[author_key]
        at = ts(age)
        c = Comment(author_id=author.id, body=body, created_at=at,
                    problem_id=problem.id if problem else None, solution_id=solution.id if solution else None)
        db.add(c)
        db.flush()
        count += 1
        what = "solution" if solution else "problem"
        activity(author, f"commented_{what}", at, problem=problem, solution=solution)
        notify(owner, author, "comment", f'{author.name} commented on your {what} "{target_title}".', link, at)
        bump(solution.id if solution else problem.id + 10**6, at)
        for r_author_key, r_body, r_age in replies:
            ra = users[r_author_key]
            r_at = ts(r_age)
            db.add(Comment(author_id=ra.id, body=r_body, created_at=r_at, parent_id=c.id,
                           problem_id=problem.id if problem else None, solution_id=solution.id if solution else None))
            count += 1
            activity(ra, f"commented_{what}", r_at, problem=problem, solution=solution)
            notify(author, ra, "reply", f'{ra.name} replied to your comment on "{target_title}".', link, r_at)
            if owner.id != author.id:
                notify(owner, ra, "comment", f'{ra.name} commented on your {what} "{target_title}".', link, r_at)
            bump(solution.id if solution else problem.id + 10**6, r_at)
    return count


def _username(name: str) -> str:
    from .routers.common import slugify

    return slugify(name)


def main() -> None:
    from . import db as dbmod
    from .db import Base
    from .main import init_db

    parser = argparse.ArgumentParser(description="Seed the BladiSolution demo database")
    parser.add_argument("--reset", action="store_true", help="drop all tables first")
    args = parser.parse_args()
    if args.reset:
        Base.metadata.drop_all(dbmod.engine)
    init_db(seed=False)
    with dbmod.SessionLocal() as db:
        if db.query(User.id).first() is not None:
            print("Database already contains data; use --reset to rebuild it.")
            return
        print(seed_demo(db))


if __name__ == "__main__":
    main()
