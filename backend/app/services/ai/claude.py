"""Claude-backed civic intelligence.

Analysis and summaries use Claude with structured outputs. Similarity and
contributor matching stay on the deterministic engine: they must be instant
while a citizen types, and they run over the whole corpus.
Any provider failure degrades to the local engine; it never surfaces as an error.
"""

import logging
from typing import Literal

import anthropic
from pydantic import BaseModel, Field

from ...constants import CATEGORY_BY_SLUG, CATEGORY_SLUGS
from .local import CATEGORY_LINES, LocalAIService

log = logging.getLogger("bladisolution.ai")

Level = Literal["low", "medium", "high", "critical"]


class ProblemAnalysis(BaseModel):
    category: str = Field(description="One category slug from the provided list")
    category_confidence: float = Field(description="0 to 1")
    subcategory: str = Field(description="Short subcategory label, 2-4 words")
    frequency: str | None = Field(description="Daily, Weekly, Monthly, Seasonal, Continuous, or null if unknown")
    urgency: Level
    impact: Level
    impact_areas: list[str] = Field(description="2-4 areas, e.g. Environmental, Public Health, Mobility, Economic, Safety")
    affected_groups: list[str] = Field(description="1-4 population groups affected")
    affected_estimate: int = Field(description="Rough order-of-magnitude count of people affected")
    locations: list[str] = Field(description="Places mentioned or implied (city, neighbourhood, landmark)")
    keywords: list[str] = Field(description="4-6 lowercase keywords")
    summary: str = Field(description="One neutral sentence summarising the problem")


class SolutionSummary(BaseModel):
    problem: str = Field(description="The problem addressed, under 12 words")
    solution: str = Field(description="What the solution does, 1-2 sentences")
    how: str = Field(description="Core mechanism, 1 sentence")
    impact: str = Field(description="Expected impact, 1 sentence")
    required: str = Field(description="Key skills joined with ' + ', e.g. 'ML + GIS + Backend'")


ANALYSIS_SYSTEM = f"""You are the civic-intelligence engine of BladiSolution, a platform where citizens in
Moroccan and African cities publish local problems so communities can propose solutions.
Analyse the citizen's report. Problems may be written in English, French or Darija.
Be factual and conservative: do not invent details the report does not support.

Category slugs:
{CATEGORY_LINES}

Urgency guide: critical = risk to life or safety now; high = recurring harm to health, safety or
livelihoods; medium = clear recurring nuisance; low = improvement idea."""

SUMMARY_SYSTEM = """You summarise solution proposals on BladiSolution, a civic innovation platform, for
busy municipal officers. Be concrete and neutral; never add claims the proposal does not make."""


class ClaudeAIService(LocalAIService):
    name = "claude"

    def __init__(self, model: str, timeout: float, api_key: str | None = None):
        # A bare Anthropic() resolves ANTHROPIC_API_KEY / auth tokens / CLI profiles itself.
        self.client = anthropic.Anthropic(api_key=api_key, timeout=timeout, max_retries=1) if api_key else anthropic.Anthropic(
            timeout=timeout, max_retries=1
        )
        self.model = model

    def _parse(self, system: str, prompt: str, schema: type[BaseModel]) -> BaseModel:
        response = self.client.beta.messages.parse(
            model=self.model,
            max_tokens=4000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "low"},
            system=system,
            messages=[{"role": "user", "content": prompt}],
            output_format=schema,
        )
        if response.stop_reason == "refusal" or response.parsed_output is None:
            raise ValueError(f"no structured output (stop_reason={response.stop_reason})")
        return response.parsed_output

    @staticmethod
    def _failure_reason(exc: Exception) -> str:
        if isinstance(exc, anthropic.AuthenticationError):
            return "auth"
        if isinstance(exc, anthropic.RateLimitError):
            return "rate_limited"
        if isinstance(exc, anthropic.APITimeoutError):
            return "timeout"
        if isinstance(exc, anthropic.APIConnectionError):
            return "unreachable"
        if isinstance(exc, anthropic.APIStatusError):
            return f"api_{exc.status_code}"
        return "invalid_output"

    def analyze_problem(self, title: str, description: str, city: str | None = None) -> dict:
        local = super().analyze_problem(title, description, city)
        prompt = f"City: {city or 'unspecified'}\nTitle: {title}\nReport:\n{description}"
        try:
            out = self._parse(ANALYSIS_SYSTEM, prompt, ProblemAnalysis)
        except Exception as exc:  # noqa: BLE001 - any provider failure falls back
            reason = self._failure_reason(exc)
            log.warning("Claude analysis unavailable (%s): %s", reason, exc)
            return {**local, "fallback_reason": reason}
        data = out.model_dump()
        if data["category"] not in CATEGORY_SLUGS:
            data["category"] = local["category"]
        data["category_name"] = CATEGORY_BY_SLUG[data["category"]]["name"]
        data["category_confidence"] = round(max(0.0, min(1.0, data["category_confidence"])), 2)
        data["alternatives"] = [c for c in [local["category"], *local["alternatives"]] if c != data["category"]][:2]
        data["keywords"] = [k.lower() for k in data["keywords"]][:6]
        data["provider"] = self.name
        return data

    def summarize_solution(self, solution: dict) -> dict:
        prompt = (
            f"Problem: {solution.get('problem_title', '')}\n\n"
            f"Solution title: {solution.get('title', '')}\n"
            f"Description: {solution.get('description', '')}\n"
            f"How it works: {solution.get('approach', '')}\n"
            f"Expected impact: {solution.get('impact', '')}\n"
            f"Implementation plan: {solution.get('implementation_plan', '')}\n"
            f"Required skills: {', '.join(solution.get('required_skills') or [])}"
        )
        try:
            out = self._parse(SUMMARY_SYSTEM, prompt, SolutionSummary)
        except Exception as exc:  # noqa: BLE001
            reason = self._failure_reason(exc)
            log.warning("Claude summary unavailable (%s): %s", reason, exc)
            return {**super().summarize_solution(solution), "fallback_reason": reason}
        return {**out.model_dump(), "provider": self.name}
