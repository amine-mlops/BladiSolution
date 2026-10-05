import logging
import os
from functools import lru_cache

from ...config import get_settings
from .base import AIService
from .local import LocalAIService

log = logging.getLogger("bladisolution.ai")


def _has_anthropic_credentials(api_key: str | None) -> bool:
    return bool(api_key or os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


@lru_cache
def get_ai_service() -> AIService:
    s = get_settings()
    provider = s.ai_provider.lower()
    if provider == "claude" or (provider == "auto" and _has_anthropic_credentials(s.anthropic_api_key)):
        try:
            from .claude import ClaudeAIService

            log.info("AI provider: Claude (%s)", s.ai_model)
            return ClaudeAIService(model=s.ai_model, timeout=s.ai_timeout_seconds, api_key=s.anthropic_api_key)
        except Exception as exc:  # noqa: BLE001
            log.warning("Claude provider could not start (%s); using local engine", exc)
    log.info("AI provider: local deterministic engine")
    return LocalAIService()


def get_local_ai() -> LocalAIService:
    return LocalAIService()


__all__ = ["AIService", "get_ai_service", "get_local_ai"]
