"""The critical BladiSolution user journeys, end to end through the HTTP API."""

import uuid

from conftest import flagship_id, login, make_client

SOLUTION = {
    "title": "Weekend night collection round",
    "description": "Add a dedicated collection round on Friday and Saturday nights around the market.",
    "approach": "The operator adds one truck between 22:00 and 02:00 on weekend nights, when streets are empty.",
    "impact": "Containers start each market day empty.",
    "implementation_plan": "Negotiate an addendum with the operator and run for 2 months.",
    "required_skills": ["Logistics"],
}


def _register(role: str = "citizen") -> tuple:
    c = make_client()
    email = f"user-{uuid.uuid4().hex[:8]}@example.com"
    r = c.post("/api/auth/register", json={"name": "Nadia Test", "email": email, "password": "s3cure-pass", "role": role, "city": "Rabat"})
    assert r.status_code == 201, r.text
    return c, email, r.json()["user"]


# Journey 1 — Register → Login → Create Problem (visible to others)
def test_register_login_create_problem(anon):
    c, email, user = _register()
    assert user["role"] == "citizen" and "password_hash" not in user
    assert c.get("/api/auth/me").json()["email"] == email

    c.post("/api/auth/logout")
    fresh = login(email, "s3cure-pass")
    r = fresh.post(
        "/api/problems",
        json={
            "title": "Broken swings in the neighbourhood park",
            "description": "Three of the four swings in the park have been broken for months and children get hurt.",
            "category": "urban-planning", "city": "Rabat", "neighborhood": "Hassan", "urgency": "medium", "impact": "medium",
            "tags": ["park", "children"],
        },
    )
    assert r.status_code == 201, r.text
    problem = r.json()
    assert problem["ai_analysis"]["provider"] == "local"
    assert problem["following"] is True

    seen = anon.get(f"/api/problems/{problem['id']}").json()
    assert seen["title"] == "Broken swings in the neighbourhood park"
    assert seen["tags"] == ["park", "children"]


def test_auth_and_validation_errors(anon):
    assert anon.post("/api/problems", json={}).status_code == 401
    r = anon.post("/api/auth/login", json={"email": "citizen@bladisolution.ma", "password": "wrong"})
    assert r.status_code == 401
    c, _, _ = _register()
    r = c.post("/api/problems", json={"title": "short", "description": "x", "category": "waste", "city": "Rabat"})
    assert r.status_code == 422 and "detail" in r.json() and "Traceback" not in r.text
    dup = c.post("/api/auth/register", json={"name": "Again", "email": "citizen@bladisolution.ma", "password": "whatever1"})
    assert dup.status_code == 409


# Journey 2 & 4 — Open Problem → Submit Solution → appears first in Latest
def test_submit_solution_and_latest(talent, anon):
    pid = flagship_id(anon)
    before = anon.get(f"/api/problems/{pid}").json()["solutions_count"]
    r = talent.post(f"/api/problems/{pid}/solutions", json=SOLUTION)
    assert r.status_code == 201, r.text
    sid = r.json()["id"]
    assert r.json()["ai_summary"]["required"] == "Logistics"

    latest = anon.get(f"/api/problems/{pid}/solutions", params={"sort": "latest"}).json()["items"]
    assert latest[0]["id"] == sid
    top = anon.get(f"/api/problems/{pid}/solutions", params={"sort": "top"}).json()["items"]
    assert [s["stars_count"] for s in top] == sorted([s["stars_count"] for s in top], reverse=True)
    assert anon.get(f"/api/problems/{pid}").json()["solutions_count"] == before + 1
    assert anon.get("/api/solutions", params={"sort": "latest"}).json()["items"][0]["id"] == sid


# Journey 3 — Star → Unstar (idempotent, one star per user)
def test_star_unstar(citizen, anon):
    sid = anon.get("/api/solutions", params={"sort": "top"}).json()["items"][0]["id"]
    start = anon.get(f"/api/solutions/{sid}").json()["stars_count"]
    r = citizen.post(f"/api/solutions/{sid}/star")
    assert r.json() == {"starred": True, "stars_count": start + 1}
    assert citizen.post(f"/api/solutions/{sid}/star").json()["stars_count"] == start + 1  # no double star
    assert citizen.get(f"/api/solutions/{sid}").json()["starred"] is True
    r = citizen.delete(f"/api/solutions/{sid}/star")
    assert r.json() == {"starred": False, "stars_count": start}
    assert citizen.delete(f"/api/solutions/{sid}/star").json()["stars_count"] == start


def test_ranking_follows_stars(anon):
    pid = flagship_id(anon)
    newcomer, _, _ = _register("talent")
    sid = newcomer.post(f"/api/problems/{pid}/solutions", json={**SOLUTION, "title": "Ranking probe solution"}).json()["id"]
    top_ids = [s["id"] for s in anon.get(f"/api/problems/{pid}/solutions", params={"sort": "top", "page_size": 50}).json()["items"]]
    assert top_ids[-1] == sid or anon.get(f"/api/solutions/{sid}").json()["stars_count"] == 0
    for _ in range(3):
        fan, _, _ = _register()
        fan.post(f"/api/solutions/{sid}/star")
    stars = anon.get(f"/api/solutions/{sid}").json()["stars_count"]
    assert stars == 3
    ranked = anon.get(f"/api/problems/{pid}/solutions", params={"sort": "top", "page_size": 50}).json()["items"]
    counts = [s["stars_count"] for s in ranked]
    assert counts == sorted(counts, reverse=True)


# Journey 5 — Comment on Solution (+ reply, + author notified)
def test_comment_and_reply(citizen, talent, anon):
    sid = anon.get("/api/users/youssef-amrani/solutions").json()["items"][0]["id"]
    r = citizen.post(f"/api/solutions/{sid}/comments", json={"body": "Could this work in Agdal too?"})
    assert r.status_code == 201
    cid = r.json()["id"]
    reply = talent.post(f"/api/solutions/{sid}/comments", json={"body": "Yes, the same setup applies.", "parent_id": cid})
    assert reply.json()["parent_id"] == cid
    bodies = [c["body"] for c in anon.get(f"/api/solutions/{sid}/comments").json()]
    assert "Could this work in Agdal too?" in bodies
    talent_notes = talent.get("/api/notifications").json()
    assert any(n["type"] == "comment" and "Salma Benali" in n["message"] for n in talent_notes)
    citizen_notes = citizen.get("/api/notifications").json()
    assert any(n["type"] == "reply" for n in citizen_notes)


# Journey 6 — Follow Problem → New Solution → Notification
def test_follow_problem_notification(anon):
    follower, _, _ = _register()
    pid = anon.get("/api/problems", params={"sort": "latest"}).json()["items"][0]["id"]
    assert follower.post(f"/api/problems/{pid}/follow").json()["following"] is True
    assert follower.get("/api/notifications/unread-count").json()["count"] == 0

    author, _, _ = _register("talent")
    author.post(f"/api/problems/{pid}/solutions", json={**SOLUTION, "title": "Follow-trigger solution"})

    notes = follower.get("/api/notifications").json()
    assert notes[0]["type"] == "new_solution" and "Follow-trigger solution" in notes[0]["message"]
    assert follower.get("/api/notifications/unread-count").json()["count"] == 1
    follower.post("/api/notifications/read-all")
    assert follower.get("/api/notifications/unread-count").json()["count"] == 0


def test_support_problem(anon):
    supporter, _, _ = _register()
    pid = flagship_id(anon)
    before = anon.get(f"/api/problems/{pid}").json()["supporters_count"]
    r = supporter.post(f"/api/problems/{pid}/support").json()
    assert r["supported"] and r["supporters_count"] == before + 1
    supporter.post(f"/api/problems/{pid}/support")
    assert anon.get(f"/api/problems/{pid}").json()["supporters_count"] == before + 1
    supporter.delete(f"/api/problems/{pid}/support")
    assert anon.get(f"/api/problems/{pid}").json()["supporters_count"] == before


# Journey 7 — Organization → View Solution → Change status (pipeline)
def test_municipality_pipeline(municipality, citizen, talent, anon):
    pid = flagship_id(anon)
    ai_solution = next(s for s in anon.get(f"/api/problems/{pid}/solutions").json()["items"] if s["title"] == "AI Waste Overflow Prediction")
    sid = ai_solution["id"]
    assert ai_solution["status"] == "under_evaluation"

    assert citizen.patch(f"/api/solutions/{sid}/status", json={"status": "selected"}).status_code == 403
    detail = municipality.get(f"/api/solutions/{sid}").json()
    assert detail["can_decide"] is True

    r = municipality.patch(f"/api/solutions/{sid}/status", json={"status": "selected", "note": "Pilot approved."})
    assert r.status_code == 200
    assert r.json()["status"] == "selected"
    assert r.json()["decided_by"]["name"] == "Rabat Municipal Innovation Office"
    assert anon.get(f"/api/problems/{pid}").json()["status"] == "in_progress"

    amine = login("amine@bladisolution.ma")
    assert any(n["type"] == "status_selected" for n in amine.get("/api/notifications").json())

    r = municipality.patch(
        f"/api/solutions/{sid}/status",
        json={"status": "implemented", "citizens_impacted": 12400, "impact_summary": "Overflow incidents down 45%."},
    )
    impl = r.json()["implementation"]
    assert impl["citizens_impacted"] == 12400 and impl["organization"]["role"] == "municipality"
    assert anon.get(f"/api/problems/{pid}").json()["status"] == "solved"
    implemented = anon.get(f"/api/problems/{pid}/solutions", params={"sort": "implemented"}).json()["items"]
    assert [s["id"] for s in implemented] == [sid]
    profile = anon.get("/api/users/amine-el-baydaouy").json()
    assert profile["stats"]["citizens_impacted"] >= 12400

    # Authors may only move their own work between proposed/developing.
    own = talent.get("/api/users/youssef-amrani/solutions").json()["items"]
    proposed = next(s for s in own if s["status"] in ("proposed", "developing"))
    assert talent.patch(f"/api/solutions/{proposed['id']}/status", json={"status": "selected"}).status_code == 403


# Journey 8 — AI problem analysis (deterministic fallback)
def test_ai_analysis(anon):
    r = anon.post(
        "/api/ai/analyze-problem",
        json={"title": "Market bins", "description": "The garbage containers around the market overflow every Friday and Saturday.", "city": "Rabat"},
    )
    a = r.json()
    assert a["category"] == "environment" and a["frequency"] == "Weekly" and a["urgency"] in ("high", "critical")
    assert "Public Health" in a["impact_areas"]
    assert {"container", "overflow"} <= set(a["keywords"])


# Journey 9 — Duplicate problem detection
def test_duplicate_detection(anon):
    r = anon.post(
        "/api/ai/similar-problems",
        json={"title": "Garbage bins near the market are always full", "description": "Garbage bins near the market are always full.", "city": "Rabat"},
    )
    matches = r.json()
    assert matches and matches[0]["title"] == "Overflowing Waste Containers Around a Market"
    assert matches[0]["similarity"] >= 0.5
    unrelated = anon.post("/api/ai/similar-problems", json={"title": "Museum opening hours", "description": "The museum should open later on Fridays."}).json()
    assert all(m["similarity"] < 0.5 for m in unrelated)


def test_contributor_matching_and_summary(anon):
    pid = flagship_id(anon)
    matches = anon.post("/api/ai/match-contributors", json={"problem_id": pid}).json()
    assert matches and all(m["reasons"] for m in matches)
    sid = anon.get(f"/api/problems/{pid}/solutions").json()["items"][0]["id"]
    summary = anon.post("/api/ai/summarize-solution", json={"solution_id": sid}).json()
    assert {"problem", "solution", "impact", "required"} <= set(summary)


def test_feeds_search_dashboard(anon):
    assert anon.get("/api/solutions", params={"sort": "trending"}).status_code == 200
    # Legacy category slugs are still accepted and mapped onto the current domain.
    filtered = anon.get("/api/solutions", params={"category": "waste", "city": "Rabat"}).json()["items"]
    assert filtered and all(s["problem"]["category"]["slug"] == "environment" and s["problem"]["city"] == "Rabat" for s in filtered)
    res = anon.get("/api/search", params={"q": "waste Rabat"}).json()
    assert any("Waste" in p["title"] for p in res["problems"])
    assert anon.get("/api/search", params={"q": "Python"}).json()["users"]
    d = anon.get("/api/dashboard").json()
    assert len(d["problems_by_category"]) == 11 and d["stats"]["problems"] > 20
    disc = anon.get("/api/discover").json()
    assert disc["latest_solutions"] and disc["top_contributors"] and disc["active_organizations"]


def test_report_and_moderation(citizen, admin, anon):
    offender, _, _ = _register()
    pid = flagship_id(anon)
    cid = offender.post(f"/api/problems/{pid}/comments", json={"body": "Buy cheap followers at spam.example"}).json()["id"]
    assert citizen.post("/api/reports", json={"target_type": "comment", "target_id": cid, "reason": "spam"}).status_code == 201
    assert citizen.get("/api/moderation/reports").status_code == 403
    reports = admin.get("/api/moderation/reports").json()
    report = next(r for r in reports if r["target_id"] == cid)
    admin.post(f"/api/moderation/reports/{report['id']}", json={"action": "hide"})
    assert cid not in [c["id"] for c in anon.get(f"/api/problems/{pid}/comments").json()]


def test_collaboration_request(talent):
    helper, _, user = _register("talent")
    sid = talent.get("/api/users/youssef-amrani/solutions").json()["items"][0]["id"]
    assert helper.post(f"/api/solutions/{sid}/collaborate", json={"message": "I can help"}).json()["status"] == "pending"
    assert any(n["type"] == "collaboration_request" for n in talent.get("/api/notifications").json())
    assert talent.post(f"/api/solutions/{sid}/collaborators/{user['id']}", json={"accept": True}).json()["status"] == "accepted"
    team = [c["user"]["id"] for c in helper.get(f"/api/solutions/{sid}").json()["contributors"]]
    assert user["id"] in team
