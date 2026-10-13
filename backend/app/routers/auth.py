from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import User
from ..schemas import LoginIn, RegisterIn
from ..security import create_token, get_current_user, hash_password, rate_limit, verify_password
from ..serializers import user_private
from .common import unique_username

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_session(response: Response, user: User) -> None:
    s = get_settings()
    response.set_cookie(
        s.cookie_name,
        create_token(user.id),
        max_age=s.jwt_expire_hours * 3600,
        httponly=True,
        secure=s.cookie_secure,
        samesite="lax",
        path="/",
    )


@router.post("/register", status_code=201, dependencies=[Depends(rate_limit("register", 8, 600))])
def register(body: RegisterIn, response: Response, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "An account with this email already exists.")
    is_org = body.role == "organization"
    user = User(
        email=email,
        username=unique_username(db, body.name),
        password_hash=hash_password(body.password),
        name=body.name,
        role=body.role,
        org_kind=(body.org_kind or "company") if is_org else None,
        affiliation=body.affiliation,
        city=body.city,
        skills=body.skills,
        # Organizations act on solutions only after a moderator verifies them.
        verified=False,
    )
    db.add(user)
    db.commit()
    _set_session(response, user)
    return {"user": user_private(user)}


@router.post("/login", dependencies=[Depends(rate_limit("login", 12, 60))])
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if user is None or user.is_hidden or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Incorrect email or password.")
    _set_session(response, user)
    return {"user": user_private(user)}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(get_settings().cookie_name, path="/")
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_private(user)
