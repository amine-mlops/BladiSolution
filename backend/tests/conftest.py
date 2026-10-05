import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

TEST_DB = os.environ.get("TEST_DATABASE_URL", f"sqlite:///{Path(__file__).parent / 'test.db'}")
os.environ["DATABASE_URL"] = TEST_DB
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["SEED_ON_STARTUP"] = "false"
os.environ["AI_PROVIDER"] = "local"

from fastapi.testclient import TestClient  # noqa: E402

from app import db as dbmod  # noqa: E402
from app.db import Base  # noqa: E402
from app.main import app, init_db  # noqa: E402
from app.seed import seed_demo  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def database():
    Base.metadata.drop_all(dbmod.engine)
    init_db(seed=False)
    with dbmod.SessionLocal() as db:
        seed_demo(db, community_size=60)
    yield
    Base.metadata.drop_all(dbmod.engine)
    if TEST_DB.startswith("sqlite:///"):
        Path(TEST_DB.removeprefix("sqlite:///")).unlink(missing_ok=True)


def make_client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def anon() -> TestClient:
    return make_client()


def login(email: str, password: str = "demo1234") -> TestClient:
    c = make_client()
    r = c.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return c


@pytest.fixture
def citizen() -> TestClient:
    return login("citizen@bladisolution.ma")


@pytest.fixture
def talent() -> TestClient:
    return login("talent@bladisolution.ma")


@pytest.fixture
def municipality() -> TestClient:
    return login("city@bladisolution.ma")


@pytest.fixture
def admin() -> TestClient:
    return login("admin@bladisolution.ma")


def flagship_id(client: TestClient) -> int:
    r = client.get("/api/search", params={"q": "Overflowing Waste Containers", "type": "problems"})
    return r.json()["problems"][0]["id"]
