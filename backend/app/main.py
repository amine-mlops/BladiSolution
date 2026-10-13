import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from . import db as dbmod
from .config import get_settings
from .constants import CATEGORIES
from .db import Base
from .migrations import run_migrations
from .models import Category, User
from .routers import ai, auth, dashboard, discover, moderation, notifications, problems, solutions, uploads, users

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("bladisolution")


DEFAULT_SECRET = "dev-only-change-me-in-production-please-32b"


def check_config() -> None:
    s = get_settings()
    if s.jwt_secret == DEFAULT_SECRET:
        if s.environment == "production":
            raise RuntimeError("JWT_SECRET must be set in production.")
        log.warning("Using the development JWT secret. Set JWT_SECRET before deploying.")


def init_db(seed: bool | None = None) -> None:
    Base.metadata.create_all(dbmod.engine)
    with dbmod.SessionLocal() as db:
        for c in CATEGORIES:
            row = db.get(Category, c["slug"])
            fields = {k: c[k] for k in ("name", "icon", "color", "description")}
            if row is None:
                db.add(Category(slug=c["slug"], **fields))
            else:
                for k, v in fields.items():
                    setattr(row, k, v)
        db.commit()
        run_migrations(dbmod.engine, db)
        should_seed = get_settings().seed_on_startup if seed is None else seed
        if should_seed and db.scalar(select(User.id).limit(1)) is None:
            from .seed import seed_demo

            log.info("Empty database and SEED_ON_STARTUP=true: loading the demo dataset…")
            seed_demo(db)


@asynccontextmanager
async def lifespan(app: FastAPI):
    check_config()
    init_db()
    yield


settings = get_settings()
app = FastAPI(
    title="BladiSolution Campus API",
    description="Real problems, community solutions ranked by stars, and a path to implementation.",
    version="1.1.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    return response


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    fields = {}
    for err in exc.errors():
        loc = [str(p) for p in err.get("loc", []) if p not in ("body", "query", "path")]
        msg = err.get("msg", "Invalid value").replace("Value error, ", "")
        fields[".".join(loc) or "request"] = msg
    first = next(iter(fields.items()), ("request", "Invalid request"))
    label = first[0].replace("_", " ").capitalize()
    return JSONResponse(status_code=422, content={"detail": f"{label}: {first[1]}", "fields": fields})


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        raise exc
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Something went wrong on our side. Please try again."})


for r in (auth, users, problems, solutions, notifications, discover, dashboard, ai, moderation, uploads):
    app.include_router(r.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok", "app": settings.app_name}


Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
app.mount("/api/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

# Optional single-process deployment: serve the built frontend from the API.
STATIC_DIR = os.environ.get("FRONTEND_DIST")
if STATIC_DIR and Path(STATIC_DIR).is_dir():
    dist = Path(STATIC_DIR)
    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404)
        candidate = dist / full_path
        if full_path and candidate.is_file() and dist in candidate.resolve().parents:
            return FileResponse(candidate)
        return FileResponse(dist / "index.html")
