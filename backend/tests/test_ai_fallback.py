"""The Claude provider must degrade to the local engine on any failure."""

from types import SimpleNamespace

from app.services.ai.claude import ClaudeAIService


def _broken_provider() -> ClaudeAIService:
    def fail(**_kwargs):
        raise TimeoutError("simulated outage")

    ai = ClaudeAIService.__new__(ClaudeAIService)
    ai.model = "claude-opus-5-5"
    ai.client = SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(parse=fail)))
    return ai


def test_analysis_falls_back_to_local():
    a = _broken_provider().analyze_problem("Market bins", "The garbage containers around the market overflow every Friday.", "Rabat")
    assert a["provider"] == "local" and a["fallback_reason"] == "invalid_output"
    assert a["category"] == "waste"


def test_summary_falls_back_to_local():
    s = _broken_provider().summarize_solution(
        {"problem_title": "Waste", "title": "T", "description": "Predict overflow.", "approach": "Model.", "impact": "Less overflow.",
         "implementation_plan": "Pilot.", "required_skills": ["Python", "GIS"]}
    )
    assert s["provider"] == "local" and s["required"] == "Python + GIS" and "fallback_reason" in s
