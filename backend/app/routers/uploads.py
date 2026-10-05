import secrets
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..config import get_settings
from ..models import User
from ..security import get_current_user, rate_limit

router = APIRouter(tags=["uploads"])

# Magic-byte signatures; the client-declared content type is never trusted.
SIGNATURES = {
    b"\xff\xd8\xff": ".jpg",
    b"\x89PNG\r\n\x1a\n": ".png",
    b"RIFF": ".webp",
}


def _detect(head: bytes) -> str | None:
    for sig, ext in SIGNATURES.items():
        if head.startswith(sig):
            if ext == ".webp" and head[8:12] != b"WEBP":
                return None
            return ext
    return None


@router.post("/uploads", status_code=201, dependencies=[Depends(rate_limit("upload", 20, 3600))])
async def upload(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    s = get_settings()
    data = await file.read(s.max_upload_mb * 1024 * 1024 + 1)
    if len(data) > s.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"Images must be under {s.max_upload_mb} MB.")
    ext = _detect(data[:16])
    if ext is None:
        raise HTTPException(415, "Please upload a JPG, PNG or WebP image.")
    name = f"{secrets.token_urlsafe(16)}{ext}"
    folder = Path(s.upload_dir)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / name).write_bytes(data)
    return {"url": f"/api/uploads/{name}"}
