"""BladiSolution Campus MVP rules: roles, verification, stars, duplicates, interest, migrations."""

import uuid

from conftest import flagship_id, login, make_client

from app import db as dbmod
from app.migrations import run_migrations
from app.models import Category, CategoryFollow, Problem, SolutionStar, User


def _register(role: str = "citizen", **extra) -> tuple:
    c = make_client()
    email = f"campus-{uuid.uuid4().hex[:8]}@example.com"
    r = c.post("/api/auth/register", json={"name": "Campus Tester", "email": email, "password": "s3cure-pass", "role": role, **extra})
    assert r.status_code == 201, r.text
    return c, r.json()["user"]


def _problem(client, **overrides) -> dict:
    body = {
        "title": f"Campus problem {uuid.uuid4().hex[:6]}",
        "description": "The library closes too early during exam weeks for students who commute.",
        "category": "education",
        **overrides,
    }
    r = client.post("/api/problems", json=body)
    assert r.status_code == 201, r.text
    return r.json()


SOLUTION = {"title": "Extended exam-week opening", "description": "Keep one floor open until midnight with student volunteers."}


def test_public_browsing_and_protected_actions(anon):
    assert anon.get("/api/health").json()["status"] == "ok"
    assert anon.get("/api/problems", params={"sort": "latest"}).status_code == 200
    assert anon.get("/api/solutions", params={"sort": "top"}).status_code == 200
    pid = flagship_id(anon)
    assert anon.get(f"/api/problems/{pid}").status_code == 200
    sid = anon.get(f"/api/problems/{pid}/solutions").json()["items"][0]["id"]
    assert anon.post("/api/problems", json={}).status_code == 401
    assert anon.post(f"/api/problems/{pid}/solutions", json=SOLUTION).status_code == 401
    assert anon.post(f"/api/solutions/{sid}/star").status_code == 401
    assert anon.post(f"/api/solutions/{sid}/interest", json={"kind": "implementation"}).status_code == 401


def test_cannot_self_assign_privileged_roles():
    c = make_client()
    r = c.post(
        "/api/auth/register",
        json={"name": "Fake City", "email": f"x-{uuid.uuid4().hex[:6]}@example.com", "password": "s3cure-pass", "role": "municipality"},
    )
    assert r.status_code == 422
    member, user = _register(affiliation="Université Mohammed V")
    assert user["affiliation"] == "Université Mohammed V"
    me = member.patch("/api/users/me", json={"role": "municipality", "headline": "Student"}).json()
    assert me["role"] == "citizen" and me["headline"] == "Student"


def test_problem_without_city_and_minimal_solution():
    member, _ = _register()
    p = _problem(member, category="agriculture", title="Irrigation water lost in old canals")
    assert p["city"] == "" and p["category"]["slug"] == "agriculture"
    helper, _ = _register()
    r = helper.post(f"/api/problems/{p['id']}/solutions", json=SOLUTION)
    assert r.status_code == 201, r.text
    assert r.json()["approach"] == "" and r.json()["implementation_plan"] == ""


def test_duplicate_submissions_are_collapsed():
    member, _ = _register()
    body = {"title": "Bus 32 never arrives on time", "description": "Students wait 40 minutes every morning at the campus stop.", "category": "transportation"}
    first = member.post("/api/problems", json=body)
    again = member.post("/api/problems", json=body)
    assert first.status_code == 201 and again.status_code == 200
    assert again.json()["id"] == first.json()["id"]

    pid = first.json()["id"]
    helper, _ = _register()
    s1 = helper.post(f"/api/problems/{pid}/solutions", json=SOLUTION)
    s2 = helper.post(f"/api/problems/{pid}/solutions", json=SOLUTION)
    assert s1.status_code == 201 and s2.status_code == 200 and s1.json()["id"] == s2.json()["id"]
    # A genuinely different proposal from the same person is still accepted.
    other = helper.post(f"/api/problems/{pid}/solutions", json={**SOLUTION, "title": "Shared ride-hailing for the campus"})
    assert other.status_code == 201 and other.json()["id"] != s1.json()["id"]
    assert member.get(f"/api/problems/{pid}").json()["solutions_count"] == 2


def test_stars_are_persisted_unique_and_rank_deterministically(anon):
    owner, _ = _register()
    p = _problem(owner)
    author, _ = _register()
    older = author.post(f"/api/problems/{p['id']}/solutions", json={**SOLUTION, "title": "Older idea"}).json()["id"]
    newer = author.post(f"/api/problems/{p['id']}/solutions", json={**SOLUTION, "title": "Newer idea"}).json()["id"]

    # No stars yet: ties break by newest first, the same way every time.
    order = [s["id"] for s in anon.get(f"/api/problems/{p['id']}/solutions", params={"sort": "top"}).json()["items"]]
    assert order == [newer, older]
    assert order == [s["id"] for s in anon.get(f"/api/problems/{p['id']}/solutions", params={"sort": "top"}).json()["items"]]

    # Authors can't star their own work.
    assert author.post(f"/api/solutions/{older}/star").status_code == 400

    fans = [_register()[0] for _ in range(2)]
    for fan in fans:
        assert fan.post(f"/api/solutions/{older}/star").json()["stars_count"] in (1, 2)
        fan.post(f"/api/solutions/{older}/star")  # repeated click: still one star
    with dbmod.SessionLocal() as db:
        rows = db.query(SolutionStar).filter(SolutionStar.solution_id == older).count()
    assert rows == 2 == anon.get(f"/api/solutions/{older}").json()["stars_count"]

    order = [s["id"] for s in anon.get(f"/api/problems/{p['id']}/solutions", params={"sort": "top"}).json()["items"]]
    assert order == [older, newer]
    latest = [s["id"] for s in anon.get(f"/api/problems/{p['id']}/solutions", params={"sort": "latest"}).json()["items"]]
    assert latest == [newer, older]
    # The global feed ranks by the same persisted counts.
    feed = anon.get("/api/solutions", params={"sort": "top", "q": "Older idea", "page_size": 50}).json()["items"]
    assert older in [s["id"] for s in feed]
    counts = [s["stars_count"] for s in anon.get("/api/solutions", params={"sort": "top", "page_size": 50}).json()["items"]]
    assert counts == sorted(counts, reverse=True)

    starred = fans[0].get("/api/me/starred").json()["items"]
    assert [s["id"] for s in starred] == [older]
    fans[0].delete(f"/api/solutions/{older}/star")
    assert anon.get(f"/api/solutions/{older}").json()["stars_count"] == 1


def test_organization_verification_and_interest(admin, anon):
    org, org_user = _register("organization", org_kind="research_lab")
    assert org_user["role"] == "organization" and org_user["verified"] is False

    owner, _ = _register()
    p = _problem(owner)
    author, author_user = _register()
    sid = author.post(f"/api/problems/{p['id']}/solutions", json=SOLUTION).json()["id"]

    # Unverified organizations can't act for an organization yet.
    assert org.get(f"/api/solutions/{sid}").json()["can_decide"] is False
    assert org.patch(f"/api/solutions/{sid}/status", json={"status": "selected"}).status_code == 403
    assert org.post(f"/api/solutions/{sid}/interest", json={"kind": "sponsorship"}).status_code == 403
    # Individuals never can.
    assert owner.post(f"/api/solutions/{sid}/interest", json={"kind": "implementation"}).status_code == 403

    pending = admin.get("/api/moderation/organizations", params={"status": "pending"}).json()
    assert org_user["id"] in [o["id"] for o in pending]
    assert owner.post(f"/api/moderation/organizations/{org_user['id']}", json={"verified": True}).status_code == 403
    assert admin.post(f"/api/moderation/organizations/{org_user['id']}", json={"verified": True}).json()["verified"] is True

    r = org.post(f"/api/solutions/{sid}/interest", json={"kind": "sponsorship", "message": "We fund student pilots."})
    assert r.status_code == 200 and r.json() == {"kind": "sponsorship", "created": True}
    again = org.post(f"/api/solutions/{sid}/interest", json={"kind": "implementation", "message": "We fund student pilots."})
    assert again.json()["created"] is False  # one row per organization; it is updated, not duplicated

    public = anon.get(f"/api/solutions/{sid}").json()
    assert [(i["organization"]["id"], i["kind"]) for i in public["interests"]] == [(org_user["id"], "implementation")]
    assert public["interests"][0]["message"] is None  # private to the author and the organization
    assert public["status"] == "proposed"  # interest is not a decision
    assert author.get(f"/api/solutions/{sid}").json()["interests"][0]["message"] == "We fund student pilots."
    notes = author.get("/api/notifications").json()
    assert any(n["type"] == "organization_interest" and org_user["name"] in n["message"] for n in notes)

    assert org.patch(f"/api/solutions/{sid}/status", json={"status": "under_evaluation"}).status_code == 200
    org.delete(f"/api/solutions/{sid}/interest")
    assert anon.get(f"/api/solutions/{sid}").json()["interests"] == []
    assert author_user["id"] != org_user["id"]


def test_legacy_categories_are_migrated_without_data_loss():
    with dbmod.SessionLocal() as db:
        owner = db.query(User).filter(User.email == "citizen@bladisolution.ma").one()
        db.add_all([Category(slug="waste", name="Waste", icon="recycle", color="#000000", description="legacy"),
                    Category(slug="urban-planning", name="Urban", icon="building-2", color="#000000", description="legacy"),
                    Category(slug="public-safety", name="Safety", icon="shield", color="#000000", description="legacy")])
        db.flush()
        p = Problem(title="Legacy waste problem", description="Created before the domains changed.", category="waste", city="Rabat", author_id=owner.id)
        db.add(p)
        db.add_all([CategoryFollow(user_id=owner.id, category="urban-planning"), CategoryFollow(user_id=owner.id, category="public-safety")])
        db.commit()
        pid = p.id

        run_migrations(dbmod.engine, db)
        run_migrations(dbmod.engine, db)  # idempotent
        db.expire_all()

        assert db.get(Problem, pid).category == "environment"
        assert db.get(Category, "waste") is None and db.get(Category, "public-safety") is None
        follows = {f.category for f in db.query(CategoryFollow).filter(CategoryFollow.user_id == owner.id)}
        assert "governance" in follows and not follows & {"urban-planning", "public-safety"}


def test_seeded_demo_accounts_still_work():
    # The fictional demo data is opt-in, but when loaded its organizations are verified.
    city = login("city@bladisolution.ma")
    assert city.get("/api/auth/me").json()["verified"] is True


def test_added_columns_migrate_an_existing_database(tmp_path):
    from sqlalchemy import create_engine, inspect, text
    from sqlalchemy.orm import Session

    from app.migrations import add_missing_columns

    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with engine.begin() as conn:  # the users table as the prototype created it (abridged)
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, email VARCHAR(255), name VARCHAR(120))"))
        conn.execute(text("INSERT INTO users (id, email, name) VALUES (1, 'old@example.com', 'Old User')"))
    with Session(engine) as db:
        add_missing_columns(engine, db)
        add_missing_columns(engine, db)  # idempotent
        assert "affiliation" in {c["name"] for c in inspect(engine).get_columns("users")}
        assert db.execute(text("SELECT name, affiliation FROM users")).all() == [("Old User", None)]
