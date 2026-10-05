"""Deterministic civic-intelligence engine.

Runs entirely offline. It is the default provider when no LLM credentials are
configured, and the safety net the Claude provider falls back to.
"""

import re
from collections import Counter

from ...constants import CATEGORIES, CATEGORY_BY_SLUG, CITIES
from ..text import TfIdfIndex, first_sentences, strip_accents, tokenize, top_keywords

# Canonical tokens (after synonym mapping/stemming) that signal each category.
CATEGORY_SIGNALS: dict[str, dict[str, float]] = {
    "transportation": {
        "bus": 3, "tramway": 3, "traffic": 3, "taxi": 3, "road": 1.5, "parking": 2, "commute": 2.5,
        "transport": 3, "station": 2, "cycling": 2.5, "bike": 2.5, "route": 1.5, "mobility": 3, "car": 1,
        "driver": 1.5, "trip": 1, "schedule": 1.5, "stop": 1, "line": 1, "crosswalk": 1, "intersection": 2,
        "gridlock": 3, "motorway": 2.5, "roundabout": 2.5, "rush-hour": 2.5, "rush": 2, "commuter": 2.5,
    },
    "governance": {
        "administration": 3, "paperwork": 3, "document": 2, "municipality": 1.5, "permit": 3,
        "transparency": 3, "corruption": 3, "appointment": 2, "queue": 2.5, "online": 1.5, "digital": 1.5,
        "procedure": 3, "certificate": 3, "office": 1.5, "bureaucracy": 3, "complaint": 1.5, "participation": 2,
        "budget": 2, "information": 1, "request": 2, "track": 1.5, "accountability": 2.5, "e-government": 3,
    },
    "education": {
        "school": 2, "student": 1.5, "teacher": 3, "classroom": 3, "library": 2.5, "learning": 2.5,
        "dropout": 3, "tutoring": 3, "university": 2, "education": 3, "literacy": 3, "course": 2, "homework": 3,
        "pupil": 3, "exam": 2,
    },
    "social-inclusion": {
        "accessibility": 3.5, "elderly": 3, "women": 2, "homeless": 3, "poverty": 3, "inclusion": 3,
        "migrant": 3, "orphan": 3, "vulnerable": 3, "isolation": 2.5, "discrimination": 3, "blind": 3,
        "deaf": 3, "senior": 2.5, "isolated": 2.5, "alone": 2, "older": 2.5,
    },
    "tourism-heritage": {
        "tourist": 3, "medina": 2, "heritage": 3.5, "monument": 3, "museum": 3, "artisan": 3, "riad": 2.5,
        "guide": 1.5, "kasbah": 3, "culture": 2, "cultural": 2.5, "signage": 2, "craft": 2.5, "historic": 2.5,
    },
    "economic-development": {
        "employment": 3.5, "entrepreneur": 3, "startup": 2.5, "business": 1, "vendor": 2, "informal": 2.5,
        "income": 2.5, "skill": 2, "training": 2, "shop": 1.5, "merchant": 2, "microfinance": 3, "youth": 1.5,
        "internship": 3, "graduate": 2, "cooperative": 3, "economy": 2.5,
    },
    "environment": {
        "tree": 3, "park": 2, "pollution": 3, "air": 2, "water": 2, "drought": 3, "green": 2, "climate": 3,
        "beach": 2.5, "river": 2.5, "dust": 2, "noise": 2, "heat": 2, "biodiversity": 3, "flood": 1.5,
        "irrigation": 2.5, "leak": 1.5, "sewage": 2, "emission": 2.5, "shade": 2, "hot": 2,
    },
    "energy": {
        "energy": 3.5, "solar": 3.5, "electricity": 3, "consumption": 2, "outage": 3, "efficiency": 2.5,
        "led": 2, "bill": 1.5, "panel": 2, "grid": 2.5, "lighting": 1, "insulation": 2.5,
    },
    "urban-planning": {
        "housing": 3, "construction": 2.5, "building": 2, "space": 1.5, "square": 1.5, "zoning": 3,
        "abandoned": 2.5, "playground": 2.5, "sidewalk": 2, "neighborhood": 1, "infrastructure": 2,
        "urban": 2.5, "plot": 2, "public": 0.5, "bench": 2, "shade": 1, "drainage": 3, "flood": 2, "street": 1,
    },
    "waste": {
        "waste": 4, "container": 3, "overflow": 2.5, "recycle": 3.5, "dumping": 3.5, "collection": 2,
        "landfill": 3.5, "plastic": 2, "odor": 1.5, "compost": 3, "sorting": 2.5, "truck": 1, "pest": 1,
    },
    "healthcare": {
        "clinic": 3.5, "hospital": 3.5, "doctor": 3, "health": 2.5, "ambulance": 3, "medicine": 3,
        "pharmacy": 3, "disease": 2.5, "vaccination": 3, "patient": 3, "maternal": 3, "mental": 2,
        "care": 1.5, "nurse": 3, "emergency": 1.5, "pregnant": 3.5, "maternity": 3.5, "maternal-health": 3,
    },
    "public-safety": {
        "lighting": 3, "crime": 3.5, "theft": 3, "accident": 3, "pothole": 3, "unsafe": 3, "danger": 3,
        "dangerous": 3, "harassment": 3, "fire": 3, "emergency": 1.5, "police": 3, "crosswalk": 2,
        "safety": 3, "stray": 2.5, "speeding": 3, "manhole": 3, "collapse": 3, "pedestrian": 2, "road": 1,
    },
}

SUBCATEGORIES: dict[str, list[tuple[set[str], str]]] = {
    "waste": [
        ({"container", "overflow", "collection", "truck"}, "Collection & container capacity"),
        ({"dumping", "landfill"}, "Illegal dumping"),
        ({"recycle", "sorting", "plastic", "compost"}, "Recycling & sorting"),
    ],
    "transportation": [
        ({"bus", "tramway", "station", "schedule", "line"}, "Public transport"),
        ({"traffic", "intersection", "car", "driver"}, "Traffic congestion"),
        ({"cycling", "bike", "pedestrian", "sidewalk", "crosswalk"}, "Active mobility"),
        ({"parking"}, "Parking"),
        ({"taxi"}, "Taxis"),
    ],
    "public-safety": [
        ({"lighting"}, "Street lighting"),
        ({"pothole", "manhole", "collapse"}, "Road & infrastructure hazards"),
        ({"accident", "speeding", "crosswalk"}, "Road safety"),
        ({"crime", "theft", "harassment"}, "Crime prevention"),
    ],
    "environment": [
        ({"tree", "park", "green", "shade"}, "Green spaces"),
        ({"water", "drought", "irrigation", "leak"}, "Water resources"),
        ({"pollution", "air", "dust", "emission"}, "Air quality"),
        ({"beach", "river", "plastic"}, "Coastal & river protection"),
        ({"flood"}, "Flood resilience"),
    ],
    "economic-development": [
        ({"employment", "internship", "graduate", "youth"}, "Youth employment"),
        ({"vendor", "informal", "merchant", "shop"}, "Local commerce"),
        ({"entrepreneur", "startup", "cooperative"}, "Entrepreneurship"),
    ],
    "healthcare": [
        ({"clinic", "doctor", "nurse", "hospital"}, "Access to care"),
        ({"ambulance", "emergency"}, "Emergency response"),
        ({"vaccination", "disease"}, "Prevention"),
    ],
    "education": [
        ({"dropout", "pupil", "school"}, "School access & retention"),
        ({"library", "literacy", "learning"}, "Learning resources"),
        ({"digital", "online"}, "Digital education"),
    ],
    "energy": [
        ({"solar", "panel"}, "Renewable energy"),
        ({"lighting", "led"}, "Public lighting efficiency"),
        ({"outage", "grid"}, "Supply reliability"),
    ],
    "urban-planning": [
        ({"playground", "square", "space", "bench", "shade"}, "Public spaces"),
        ({"housing", "building", "construction"}, "Housing & construction"),
        ({"sidewalk", "infrastructure"}, "Streets & infrastructure"),
    ],
    "social-inclusion": [
        ({"accessibility", "blind", "deaf"}, "Accessibility"),
        ({"elderly", "senior", "isolation"}, "Elderly support"),
        ({"women"}, "Women's inclusion"),
    ],
    "tourism-heritage": [
        ({"medina", "monument", "heritage", "historic", "kasbah"}, "Heritage preservation"),
        ({"tourist", "signage", "guide"}, "Visitor experience"),
        ({"artisan", "craft"}, "Artisans & crafts"),
    ],
    "governance": [
        ({"queue", "appointment", "paperwork", "procedure", "certificate"}, "Administrative services"),
        ({"transparency", "budget", "participation"}, "Transparency & participation"),
    ],
}

IMPACT_AREAS = {
    "waste": ["Environmental", "Public Health"],
    "transportation": ["Mobility", "Economic"],
    "governance": ["Governance", "Social"],
    "education": ["Education", "Social"],
    "social-inclusion": ["Social", "Equity"],
    "tourism-heritage": ["Cultural", "Economic"],
    "economic-development": ["Economic", "Social"],
    "environment": ["Environmental", "Public Health"],
    "energy": ["Energy", "Environmental"],
    "urban-planning": ["Urban Quality", "Social"],
    "healthcare": ["Public Health", "Social"],
    "public-safety": ["Safety", "Public Health"],
}

CRITICAL_SIGNALS = [
    "injur", "death", "died", "killed", "electrocut", "collapse", "fire", "sewage", "drown", "life-threatening",
    "blessé", "mort", "effondr",
]
HIGH_SIGNALS = [
    "every day", "daily", "each day", "every week", "every friday", "every weekend", "weekends", "health",
    "disease", "rats", "odor", "smell", "overflow", "unsafe", "danger", "accident", "children", "blocked",
    "urgent", "always", "flood", "no access", "chaque jour", "tous les jours", "dangereux",
]
LOW_SIGNALS = ["would be nice", "suggest", "beautif", "idea", "could improve", "nice to have"]

FREQUENCY_PATTERNS = [
    (r"\b(every|each)\s+(day|morning|evening|night)\b|\bdaily\b|tous les jours|chaque jour", "Daily"),
    (r"\b(every|each)\s+(friday|saturday|sunday|monday|tuesday|wednesday|thursday|week|weekend)\b|weekends?\b|weekly", "Weekly"),
    (r"\b(every|each)\s+month\b|monthly", "Monthly"),
    (r"\bafter (rain|storms?)\b|\bwhen it rains\b|\brainy season\b|\bwinter\b|\bsummer\b", "Seasonal"),
    (r"\balways\b|\bconstantly\b|\bpermanent", "Continuous"),
]

POPULATION_SIGNALS = [
    (("resident", "neighbo", "household", "habitant", "families"), "Residents", 5000),
    (("vendor", "merchant", "shop", "commerçant", "trader", "market", "souk"), "Vendors & merchants", 300),
    (("market", "shopper", "souk"), "Shoppers", 4000),
    (("student", "pupil", "school", "élève", "étudiant"), "Students", 1500),
    (("child", "kid", "enfant"), "Children", 1200),
    (("elderly", "senior", "older", "personnes âgées"), "Elderly people", 800),
    (("commut", "passenger", "bus stop", "bus line", "buses", "tram", "traveler"), "Commuters", 8000),
    (("tourist", "visitor"), "Tourists & visitors", 3000),
    (("patient", "clinic", "hospital"), "Patients", 2000),
    (("women", "girl", "femme"), "Women & girls", 1500),
    (("wheelchair", "disab", "handicap", "blind", "deaf"), "People with disabilities", 400),
    (("driver", "motorist"), "Drivers", 3000),
    (("pedestrian", "walk"), "Pedestrians", 3000),
    (("youth", "young", "graduate", "jeunes"), "Young people", 2500),
]

LANDMARKS = [
    "market", "souk", "school", "station", "hospital", "clinic", "medina", "beach", "university", "park",
    "mosque", "stadium", "port", "corniche", "boulevard", "avenue", "roundabout", "bus stop", "tram stop",
    "campus", "kasbah", "square", "industrial zone",
]


def _level(score: float) -> str:
    if score >= 4:
        return "critical"
    if score >= 2:
        return "high"
    if score >= 0.5:
        return "medium"
    return "low"


class LocalAIService:
    name = "local"

    # ---------------------------------------------------------------- analysis
    def classify(self, text: str) -> tuple[str, float, list[tuple[str, float]]]:
        tokens = tokenize(text)
        counts = Counter(tokens)
        scores: dict[str, float] = {}
        for slug, signals in CATEGORY_SIGNALS.items():
            s = sum(weight * min(counts[t], 3) for t, weight in signals.items() if t in counts)
            if s:
                scores[slug] = s
        if not scores:
            return "urban-planning", 0.2, []
        ranked = sorted(scores.items(), key=lambda kv: -kv[1])
        best, best_score = ranked[0]
        total = sum(scores.values())
        confidence = round(min(0.97, 0.35 + 0.65 * (best_score / total) * min(1.0, best_score / 6)), 2)
        return best, confidence, ranked[:3]

    def analyze_problem(self, title: str, description: str, city: str | None = None) -> dict:
        text = f"{title}. {description}"
        lower = text.lower()
        tokens = set(tokenize(text))
        category, confidence, ranked = self.classify(f"{title} {title} {description}")

        subcategory = "General"
        for keys, label in SUBCATEGORIES.get(category, []):
            if keys & tokens:
                subcategory = label
                break

        frequency = None
        for pattern, label in FREQUENCY_PATTERNS:
            if re.search(pattern, lower):
                frequency = label
                break

        # Recurring nuisance signals push towards "high"; only explicit risk to life reaches "critical".
        has_critical = any(re.search(rf"\b{re.escape(s)}", lower) for s in CRITICAL_SIGNALS)
        urgency_score = 0.5 + 0.6 * sum(1 for s in HIGH_SIGNALS if s in lower)
        urgency_score -= 1.0 * sum(1 for s in LOW_SIGNALS if s in lower)
        if frequency in ("Daily", "Weekly", "Continuous"):
            urgency_score += 0.5
        urgency_score = 4.5 if has_critical else min(urgency_score, 3.5)
        urgency = _level(urgency_score)

        groups, estimate = [], 0
        for keys, label, size in POPULATION_SIGNALS:
            if any(re.search(rf"\b{re.escape(k)}", lower) for k in keys):
                groups.append(label)
                estimate += size
        if not groups:
            groups, estimate = ["Local residents"], 2000

        impact_areas = list(IMPACT_AREAS.get(category, ["Social"]))
        if tokens & {"odor", "pest", "disease", "sewage"} and "Public Health" not in impact_areas:
            impact_areas.append("Public Health")
        if tokens & {"accident", "danger", "unsafe", "lighting"} and "Safety" not in impact_areas:
            impact_areas.append("Safety")
        impact = "high" if estimate >= 5000 or urgency in ("high", "critical") else "medium"
        if urgency == "critical" and estimate >= 5000:
            impact = "critical"

        locations = []
        for name in CITIES:
            if strip_accents(name).lower() in strip_accents(lower):
                locations.append(name)
        for lm in LANDMARKS:
            if re.search(rf"\b{lm}s?\b", lower):
                locations.append(lm.title())
        if city and city not in locations:
            locations.insert(0, city)

        keywords = top_keywords(text, 6)
        cat_name = CATEGORY_BY_SLUG[category]["name"]
        where = f" in {city}" if city else ""
        freq_txt = f"{frequency.lower()} " if frequency else ""
        summary = (
            f"A {freq_txt}{subcategory.lower() if subcategory != 'General' else cat_name.lower()} issue{where} "
            f"affecting {', '.join(g.lower() for g in groups[:3])}."
        )

        return {
            "provider": "local",
            "category": category,
            "category_name": cat_name,
            "category_confidence": confidence,
            "alternatives": [s for s, _ in ranked[1:3]],
            "subcategory": subcategory,
            "frequency": frequency,
            "urgency": urgency,
            "impact": impact,
            "impact_areas": impact_areas[:4],
            "affected_groups": groups[:4],
            "affected_estimate": estimate,
            "locations": locations[:5],
            "keywords": keywords,
            "summary": summary,
        }

    # -------------------------------------------------------------- similarity
    @staticmethod
    def _doc_tokens(title: str, description: str, category: str | None, tags: list[str] | None = None) -> list[str]:
        tokens = tokenize(title) * 3 + tokenize(description)
        for t in tags or []:
            tokens += tokenize(t)
        if category:
            tokens.append(f"cat:{category}")
        return tokens

    def detect_similar_problems(self, query: dict, candidates: list[dict], limit: int = 5) -> list[dict]:
        if not candidates:
            return []
        docs = {
            c["id"]: self._doc_tokens(c["title"], c["description"], c.get("category"), c.get("tags"))
            for c in candidates
        }
        index = TfIdfIndex(docs)
        q_tokens = self._doc_tokens(query.get("title", ""), query.get("description", ""), query.get("category"))
        if len([t for t in q_tokens if not t.startswith("cat:")]) < 2:
            return []
        by_id = {c["id"]: c for c in candidates}
        results = []
        for doc_id, score, shared in index.query(q_tokens):
            cand = by_id[doc_id]
            content_shared = [t for t in shared if not t.startswith("cat:")]
            if len(content_shared) < 2:
                continue
            boost = 0.0
            if query.get("city") and cand.get("city") == query.get("city"):
                boost += 0.08
            if query.get("neighborhood") and cand.get("neighborhood") and (
                query["neighborhood"].strip().lower() == cand["neighborhood"].strip().lower()
            ):
                boost += 0.07
            similarity = min(0.97, score * 1.2 + boost)
            if similarity < 0.3:
                continue
            results.append({"id": doc_id, "similarity": round(similarity, 2), "shared_terms": content_shared[:5]})
        results.sort(key=lambda r: -r["similarity"])
        return results[:limit]

    # ---------------------------------------------------------- summarisation
    def summarize_solution(self, solution: dict) -> dict:
        skills = solution.get("required_skills") or []
        return {
            "provider": "local",
            "problem": first_sentences(solution.get("problem_title", ""), 120),
            "solution": first_sentences(f"{solution.get('description', '')}", 220),
            "how": first_sentences(solution.get("approach", ""), 200),
            "impact": first_sentences(solution.get("impact", ""), 200),
            "required": " + ".join(skills[:4]) if skills else "Not specified",
        }

    # ---------------------------------------------------------------- matching
    def match_contributors(self, problem: dict, candidates: list[dict], limit: int = 5) -> list[dict]:
        category = problem.get("category")
        cat_skills = {s.lower() for s in CATEGORY_BY_SLUG.get(category, {}).get("skills", [])}
        wanted = {s.lower() for s in problem.get("required_skills", [])}
        text_tokens = set(tokenize(f"{problem.get('title', '')} {problem.get('description', '')}"))
        city = problem.get("city")

        results = []
        for c in candidates:
            skills = c.get("skills") or []
            score, reasons, matched = 0.0, [], []
            for s in skills:
                sl = s.lower()
                hit = False
                if sl in cat_skills:
                    score += 3
                    hit = True
                if sl in wanted:
                    score += 2
                    hit = True
                if set(tokenize(s)) & text_tokens:
                    score += 1.5
                    hit = True
                if hit:
                    matched.append(s)
            if matched:
                reasons.append(f"Skills: {', '.join(matched[:3])}")
            in_cat = (c.get("category_counts") or {}).get(category, 0)
            if in_cat:
                score += 2.5 * min(in_cat, 4)
                reasons.append(
                    f"{in_cat} solution{'s' if in_cat > 1 else ''} in {CATEGORY_BY_SLUG[category]['name']}"
                )
            if c.get("implemented"):
                score += 1.5 * min(c["implemented"], 3)
                reasons.append(f"{c['implemented']} implemented")
            if city and c.get("city") == city:
                score += 2
                reasons.append(f"Based in {city}")
            if c.get("role") in ("organization", "talent"):
                score += 0.5
            if score < 3:
                continue
            results.append({"user_id": c["id"], "score": round(score, 1), "matched_skills": matched[:4], "reasons": reasons[:3]})
        results.sort(key=lambda r: -r["score"])
        top = results[:limit]
        if top:
            best = top[0]["score"]
            for r in top:
                r["match"] = int(round(55 + 44 * r["score"] / best))
        return top


# Expose category list for prompt building.
CATEGORY_LINES = "\n".join(f"- {c['slug']}: {c['name']} — {c['description']}" for c in CATEGORIES)
