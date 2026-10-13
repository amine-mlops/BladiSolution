"""Idempotent schema and data migrations, run on every startup after `create_all`.

The project has no Alembic history: tables are created by SQLAlchemy's
`metadata.create_all`, which creates missing tables but never alters existing ones.
Each step below checks the current state first, so running it again is a no-op. Steps
only add columns or remap values; none of them drops user data.

Add a new step by appending a function to STEPS.
"""

import logging

from sqlalchemy import inspect, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from .constants import CATEGORY_SLUGS, LEGACY_CATEGORY_MAP
from .models import Category, CategoryFollow, Problem

log = logging.getLogger("bladisolution.migrations")

# (table, column, SQL type) for columns added after the first release.
ADDED_COLUMNS = [
    ("users", "affiliation", "VARCHAR(160)"),
]


def add_missing_columns(engine: Engine, db: Session) -> None:
    inspector = inspect(engine)
    for table, column, sql_type in ADDED_COLUMNS:
        existing = {c["name"] for c in inspector.get_columns(table)}
        if column not in existing:
            log.info("Adding column %s.%s", table, column)
            db.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {sql_type}"))
    db.commit()


def remap_legacy_categories(engine: Engine, db: Session) -> None:
    """Move rows that use the prototype's 12 Smart City categories onto the current domains."""
    legacy = list(LEGACY_CATEGORY_MAP)
    moved = 0
    for old, new in LEGACY_CATEGORY_MAP.items():
        moved += db.query(Problem).filter(Problem.category == old).update({Problem.category: new}, synchronize_session=False)
    # A user may already follow the target domain; the composite key forbids duplicates.
    for row in db.scalars(select(CategoryFollow).where(CategoryFollow.category.in_(legacy))).all():
        target = LEGACY_CATEGORY_MAP[row.category]
        if db.get(CategoryFollow, {"user_id": row.user_id, "category": target}) is None:
            db.add(CategoryFollow(user_id=row.user_id, category=target, created_at=row.created_at))
        db.delete(row)
        db.flush()  # the session doesn't autoflush; make the new row visible to the next lookup
    db.flush()
    unused = (
        select(Category.slug)
        .where(Category.slug.notin_(CATEGORY_SLUGS))
        .where(~select(Problem.id).where(Problem.category == Category.slug).exists())
        .where(~select(CategoryFollow.user_id).where(CategoryFollow.category == Category.slug).exists())
    )
    removed = db.query(Category).filter(Category.slug.in_(unused)).delete(synchronize_session=False)
    db.commit()
    if moved or removed:
        log.info("Remapped %d problems to current domains; removed %d legacy categories", moved, removed)


STEPS = [add_missing_columns, remap_legacy_categories]


def run_migrations(engine: Engine, db: Session) -> None:
    for step in STEPS:
        step(engine, db)
