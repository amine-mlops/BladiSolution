from typing import Protocol


class AIService(Protocol):
    """Provider-agnostic civic intelligence interface.

    Every method returns plain JSON-serialisable dicts and must never raise for
    provider failures: implementations degrade to deterministic logic instead.
    """

    name: str

    def analyze_problem(self, title: str, description: str, city: str | None = None) -> dict: ...

    def detect_similar_problems(self, query: dict, candidates: list[dict], limit: int = 5) -> list[dict]: ...

    def summarize_solution(self, solution: dict) -> dict: ...

    def match_contributors(self, problem: dict, candidates: list[dict], limit: int = 5) -> list[dict]: ...
