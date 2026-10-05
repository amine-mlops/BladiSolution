from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def TS(**kw):
    return mapped_column(DateTime(timezone=True), default=utcnow, **kw)


problem_tags = Table(
    "problem_tags",
    Base.metadata,
    Column("problem_id", ForeignKey("problems.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)

solution_tags = Table(
    "solution_tags",
    Base.metadata,
    Column("solution_id", ForeignKey("solutions.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Category(Base):
    __tablename__ = "categories"
    slug: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    icon: Mapped[str] = mapped_column(String(40))
    color: Mapped[str] = mapped_column(String(16))
    description: Mapped[str] = mapped_column(String(255))


class Tag(Base):
    __tablename__ = "tags"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(40), unique=True, index=True)


class User(Base):
    """A person or an organization account.

    Organizations and municipalities are users with an organization role plus
    `org_kind`, which keeps follow/notification/contribution logic uniform.
    """

    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    username: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(20), default="citizen", index=True)
    org_kind: Mapped[str | None] = mapped_column(String(30), nullable=True)
    headline: Mapped[str | None] = mapped_column(String(120), nullable=True)
    city: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    skills: Mapped[list] = mapped_column(JSON, default=list)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    # Lightweight community members created by the seed to give stars realistic volume.
    is_featured: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = TS()


class Problem(Base):
    __tablename__ = "problems"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(ForeignKey("categories.slug"), index=True)
    city: Mapped[str] = mapped_column(String(80), index=True)
    neighborhood: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    impact: Mapped[str] = mapped_column(String(20), default="medium")
    urgency: Mapped[str] = mapped_column(String(20), default="medium")
    affected_population: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)
    is_official: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    ai_analysis: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    supporters_count: Mapped[int] = mapped_column(Integer, default=0)
    followers_count: Mapped[int] = mapped_column(Integer, default=0)
    solutions_count: Mapped[int] = mapped_column(Integer, default=0)
    comments_count: Mapped[int] = mapped_column(Integer, default=0)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = TS(index=True)
    updated_at: Mapped[datetime] = TS(onupdate=utcnow)
    last_activity_at: Mapped[datetime] = TS(index=True)

    author: Mapped[User] = relationship(lazy="joined")
    tags: Mapped[list[Tag]] = relationship(secondary=problem_tags, lazy="selectin")


class Solution(Base):
    __tablename__ = "solutions"
    id: Mapped[int] = mapped_column(primary_key=True)
    problem_id: Mapped[int] = mapped_column(ForeignKey("problems.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text)
    approach: Mapped[str] = mapped_column(Text)
    impact: Mapped[str] = mapped_column(Text)
    implementation_plan: Mapped[str] = mapped_column(Text)
    required_skills: Mapped[list] = mapped_column(JSON, default=list)
    resources: Mapped[str | None] = mapped_column(Text, nullable=True)
    estimated_cost: Mapped[str | None] = mapped_column(String(120), nullable=True)
    links: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(24), default="proposed", index=True)
    status_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    stars_count: Mapped[int] = mapped_column(Integer, default=0, index=True)
    comments_count: Mapped[int] = mapped_column(Integer, default=0)
    ai_summary: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = TS(index=True)
    updated_at: Mapped[datetime] = TS(onupdate=utcnow)
    last_activity_at: Mapped[datetime] = TS(index=True)

    author: Mapped[User] = relationship(foreign_keys=[author_id], lazy="joined")
    decided_by: Mapped[User | None] = relationship(foreign_keys=[decided_by_id], lazy="joined")
    problem: Mapped[Problem] = relationship(lazy="joined")
    tags: Mapped[list[Tag]] = relationship(secondary=solution_tags, lazy="selectin")
    implementation: Mapped["Implementation | None"] = relationship(
        back_populates="solution", uselist=False, lazy="selectin"
    )

    __table_args__ = (Index("ix_solutions_problem_stars", "problem_id", "stars_count"),)


class SolutionContributor(Base):
    __tablename__ = "solution_contributors"
    id: Mapped[int] = mapped_column(primary_key=True)
    solution_id: Mapped[int] = mapped_column(ForeignKey("solutions.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[str] = mapped_column(String(20), default="contributor")  # author | contributor
    status: Mapped[str] = mapped_column(String(20), default="accepted")  # pending | accepted | declined
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = TS()

    user: Mapped[User] = relationship(lazy="joined")
    __table_args__ = (UniqueConstraint("solution_id", "user_id"),)


class Implementation(Base):
    __tablename__ = "implementations"
    id: Mapped[int] = mapped_column(primary_key=True)
    solution_id: Mapped[int] = mapped_column(ForeignKey("solutions.id", ondelete="CASCADE"), unique=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    implemented_at: Mapped[datetime] = TS()
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    impact_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    citizens_impacted: Mapped[int | None] = mapped_column(Integer, nullable=True)
    evidence_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    solution: Mapped[Solution] = relationship(back_populates="implementation")
    organization: Mapped[User] = relationship(lazy="joined")


class Comment(Base):
    __tablename__ = "comments"
    id: Mapped[int] = mapped_column(primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    problem_id: Mapped[int | None] = mapped_column(ForeignKey("problems.id", ondelete="CASCADE"), index=True)
    solution_id: Mapped[int | None] = mapped_column(ForeignKey("solutions.id", ondelete="CASCADE"), index=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("comments.id", ondelete="CASCADE"), nullable=True)
    body: Mapped[str] = mapped_column(Text)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = TS(index=True)

    author: Mapped[User] = relationship(lazy="joined")


class ProblemSupport(Base):
    __tablename__ = "problem_supports"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    problem_id: Mapped[int] = mapped_column(ForeignKey("problems.id", ondelete="CASCADE"), primary_key=True, index=True)
    created_at: Mapped[datetime] = TS(index=True)


class ProblemFollower(Base):
    __tablename__ = "problem_followers"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    problem_id: Mapped[int] = mapped_column(ForeignKey("problems.id", ondelete="CASCADE"), primary_key=True, index=True)
    created_at: Mapped[datetime] = TS()


class SolutionStar(Base):
    __tablename__ = "solution_stars"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    solution_id: Mapped[int] = mapped_column(ForeignKey("solutions.id", ondelete="CASCADE"), primary_key=True, index=True)
    created_at: Mapped[datetime] = TS(index=True)


class UserFollow(Base):
    __tablename__ = "user_follows"
    follower_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    followed_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True)
    created_at: Mapped[datetime] = TS()


class CategoryFollow(Base):
    __tablename__ = "category_follows"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    category: Mapped[str] = mapped_column(ForeignKey("categories.slug"), primary_key=True, index=True)
    created_at: Mapped[datetime] = TS()


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    type: Mapped[str] = mapped_column(String(40))
    message: Mapped[str] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(String(255), nullable=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = TS(index=True)

    actor: Mapped[User | None] = relationship(foreign_keys=[actor_id], lazy="joined")


class Activity(Base):
    __tablename__ = "activities"
    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    verb: Mapped[str] = mapped_column(String(40))
    problem_id: Mapped[int | None] = mapped_column(ForeignKey("problems.id", ondelete="CASCADE"), nullable=True, index=True)
    solution_id: Mapped[int | None] = mapped_column(ForeignKey("solutions.id", ondelete="CASCADE"), nullable=True, index=True)
    meta: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = TS(index=True)

    actor: Mapped[User] = relationship(lazy="joined")
    problem: Mapped[Problem | None] = relationship(lazy="joined")
    solution: Mapped[Solution | None] = relationship(lazy="joined")


class Report(Base):
    __tablename__ = "reports"
    id: Mapped[int] = mapped_column(primary_key=True)
    reporter_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    target_type: Mapped[str] = mapped_column(String(20))
    target_id: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(30))
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)  # open | actioned | dismissed
    resolved_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = TS()

    reporter: Mapped[User] = relationship(foreign_keys=[reporter_id], lazy="joined")
