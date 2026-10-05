"""Request payload validation. Responses are shaped by app.serializers."""

import re
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from .constants import CATEGORY_SLUGS, LEVELS, ORG_KINDS, PROBLEM_STATUSES, REPORT_REASONS, REPORT_TARGETS, SOLUTION_STATUSES

Level = Literal["low", "medium", "high", "critical"]
assert list(Level.__args__) == LEVELS  # type: ignore[attr-defined]


def _clean(text: str | None) -> str | None:
    if text is None:
        return None
    # Strip control characters; content is rendered as text (never HTML) on the client.
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    return text.strip()


def _clean_list(items: list[str], max_items: int, max_len: int) -> list[str]:
    out: list[str] = []
    for item in items:
        item = (_clean(item) or "")[:max_len]
        if item and item.lower() not in {o.lower() for o in out}:
            out.append(item)
    return out[:max_items]


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: Literal["citizen", "talent", "organization", "municipality"] = "citizen"
    org_kind: str | None = None
    city: str | None = Field(default=None, max_length=80)
    skills: list[str] = Field(default_factory=list)

    @field_validator("name", "city")
    @classmethod
    def clean(cls, v):
        return _clean(v)

    @field_validator("skills")
    @classmethod
    def clean_skills(cls, v):
        return _clean_list(v, 15, 40)

    @field_validator("org_kind")
    @classmethod
    def valid_kind(cls, v):
        if v and v not in ORG_KINDS:
            raise ValueError("Unknown organization type")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    headline: str | None = Field(default=None, max_length=120)
    city: str | None = Field(default=None, max_length=80)
    bio: str | None = Field(default=None, max_length=2000)
    skills: list[str] | None = None
    avatar_url: str | None = Field(default=None, max_length=500)
    website: str | None = Field(default=None, max_length=255)
    role: Literal["citizen", "talent", "organization", "municipality"] | None = None
    org_kind: str | None = None

    @field_validator("name", "headline", "city", "bio", "website")
    @classmethod
    def clean(cls, v):
        return _clean(v)

    @field_validator("skills")
    @classmethod
    def clean_skills(cls, v):
        return None if v is None else _clean_list(v, 15, 40)

    @field_validator("avatar_url", "website")
    @classmethod
    def safe_url(cls, v):
        if v and not (v.startswith("https://") or v.startswith("http://") or v.startswith("/api/uploads/")):
            raise ValueError("Must be an http(s) URL")
        return v or None


class ProblemIn(BaseModel):
    title: str = Field(min_length=8, max_length=160)
    description: str = Field(min_length=20, max_length=5000)
    category: str
    city: str = Field(min_length=2, max_length=80)
    neighborhood: str | None = Field(default=None, max_length=120)
    location: str | None = Field(default=None, max_length=200)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    impact: Level = "medium"
    urgency: Level = "medium"
    image_url: str | None = Field(default=None, max_length=500)
    tags: list[str] = Field(default_factory=list)
    is_official: bool = False

    @field_validator("title", "description", "city", "neighborhood", "location")
    @classmethod
    def clean(cls, v):
        return _clean(v)

    @field_validator("category")
    @classmethod
    def valid_category(cls, v):
        if v not in CATEGORY_SLUGS:
            raise ValueError("Unknown category")
        return v

    @field_validator("tags")
    @classmethod
    def clean_tags(cls, v):
        return [t.lower().lstrip("#") for t in _clean_list(v, 8, 30)]

    @field_validator("image_url")
    @classmethod
    def safe_image(cls, v):
        if v and not (v.startswith("/api/uploads/") or v.startswith("https://")):
            raise ValueError("Invalid image")
        return v or None


class ProblemUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=8, max_length=160)
    description: str | None = Field(default=None, min_length=20, max_length=5000)
    status: str | None = None
    urgency: Level | None = None
    impact: Level | None = None
    neighborhood: str | None = Field(default=None, max_length=120)
    location: str | None = Field(default=None, max_length=200)

    @field_validator("status")
    @classmethod
    def valid_status(cls, v):
        if v and v not in PROBLEM_STATUSES:
            raise ValueError("Unknown status")
        return v


class SolutionIn(BaseModel):
    title: str = Field(min_length=6, max_length=160)
    description: str = Field(min_length=20, max_length=5000)
    approach: str = Field(min_length=20, max_length=8000)
    impact: str = Field(min_length=10, max_length=4000)
    implementation_plan: str = Field(min_length=10, max_length=6000)
    required_skills: list[str] = Field(default_factory=list)
    resources: str | None = Field(default=None, max_length=2000)
    estimated_cost: str | None = Field(default=None, max_length=120)
    links: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)

    @field_validator("title", "description", "approach", "impact", "implementation_plan", "resources", "estimated_cost")
    @classmethod
    def clean(cls, v):
        return _clean(v) or None if v is not None else None

    @field_validator("required_skills")
    @classmethod
    def clean_skills(cls, v):
        return _clean_list(v, 12, 40)

    @field_validator("tags")
    @classmethod
    def clean_tags(cls, v):
        return [t.lower().lstrip("#") for t in _clean_list(v, 8, 30)]

    @field_validator("links")
    @classmethod
    def clean_links(cls, v):
        links = _clean_list(v, 5, 300)
        for link in links:
            if not link.startswith(("https://", "http://")):
                raise ValueError("Links must start with http:// or https://")
        return links


class SolutionUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=6, max_length=160)
    description: str | None = Field(default=None, min_length=20, max_length=5000)
    approach: str | None = Field(default=None, min_length=20, max_length=8000)
    impact: str | None = Field(default=None, min_length=10, max_length=4000)
    implementation_plan: str | None = Field(default=None, min_length=10, max_length=6000)
    required_skills: list[str] | None = None
    resources: str | None = Field(default=None, max_length=2000)
    estimated_cost: str | None = Field(default=None, max_length=120)


class StatusChange(BaseModel):
    status: str
    note: str | None = Field(default=None, max_length=1000)
    # Implementation details (used when status == "implemented")
    location: str | None = Field(default=None, max_length=200)
    impact_summary: str | None = Field(default=None, max_length=2000)
    citizens_impacted: int | None = Field(default=None, ge=0, le=50_000_000)
    evidence_url: str | None = Field(default=None, max_length=500)

    @field_validator("status")
    @classmethod
    def valid_status(cls, v):
        if v not in SOLUTION_STATUSES:
            raise ValueError("Unknown status")
        return v

    @field_validator("evidence_url")
    @classmethod
    def safe_url(cls, v):
        if v and not v.startswith(("https://", "http://", "/api/uploads/")):
            raise ValueError("Evidence must be a link")
        return v or None


class CommentIn(BaseModel):
    body: str = Field(min_length=2, max_length=3000)
    parent_id: int | None = None

    @field_validator("body")
    @classmethod
    def clean(cls, v):
        return _clean(v)


class ReportIn(BaseModel):
    target_type: str
    target_id: int
    reason: str
    details: str | None = Field(default=None, max_length=1000)

    @field_validator("target_type")
    @classmethod
    def valid_target(cls, v):
        if v not in REPORT_TARGETS:
            raise ValueError("Unknown target")
        return v

    @field_validator("reason")
    @classmethod
    def valid_reason(cls, v):
        if v not in REPORT_REASONS:
            raise ValueError("Unknown reason")
        return v


class ReportResolve(BaseModel):
    action: Literal["hide", "dismiss"]


class ContactIn(BaseModel):
    message: str = Field(min_length=10, max_length=1500)


class CollaborationIn(BaseModel):
    message: str | None = Field(default=None, max_length=800)


class CollaborationDecision(BaseModel):
    accept: bool


class AnalyzeIn(BaseModel):
    title: str = Field(default="", max_length=160)
    description: str = Field(min_length=10, max_length=5000)
    city: str | None = Field(default=None, max_length=80)


class SimilarIn(BaseModel):
    title: str = Field(default="", max_length=160)
    description: str = Field(default="", max_length=5000)
    category: str | None = None
    city: str | None = None
    neighborhood: str | None = None
    exclude_id: int | None = None


class SummarizeIn(BaseModel):
    solution_id: int
    refresh: bool = False


class MatchIn(BaseModel):
    problem_id: int
