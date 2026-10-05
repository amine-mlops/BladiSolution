"""Lightweight multilingual (EN/FR + common Darija transliterations) text utilities.

Used by the deterministic AI engine for keyword extraction and similarity.
"""

import math
import re
import unicodedata
from collections import Counter

STOPWORDS = set(
    """
a an the and or but if of to in on at by for with from into onto over under about as is are was were be been being
this that these those there here it its they them their we our you your he she his her i me my mine us
have has had do does did done not no nor so too very can could should would will shall may might must
also just than then once each every some any all more most other such only own same few both through during before
after above below up down out off again further while because until near around always often usually still even
which who whom whose what when where why how lot lots many much get gets got make makes made people
le la les un une des du de et ou mais donc car ni que qui quoi dont où au aux ce cet cette ces se sa son ses
leur leurs nous vous ils elles il elle on est sont été être avoir a ont pas plus très tout tous toute toutes
dans sur sous par pour avec sans chez entre vers comme aussi bien encore déjà toujours souvent
""".split()
)

# Map surface forms to a canonical concept so "garbage bins are full" ≈ "waste containers overflow".
SYNONYMS = {
    "garbage": "waste", "trash": "waste", "rubbish": "waste", "litter": "waste", "refuse": "waste",
    "déchets": "waste", "dechets": "waste", "ordures": "waste", "zbel": "waste", "poubelle": "container",
    "poubelles": "container", "bin": "container", "bins": "container", "dumpster": "container",
    "dumpsters": "container", "containers": "container", "conteneur": "container", "conteneurs": "container",
    "full": "overflow", "overflowing": "overflow", "overflows": "overflow", "overflowed": "overflow",
    "débordent": "overflow", "deborde": "overflow", "déborde": "overflow", "piling": "overflow", "piles": "overflow",
    "souk": "market", "marché": "market", "marche": "market", "markets": "market", "bazaar": "market",
    "bus": "bus", "buses": "bus", "tram": "tramway", "trams": "tramway", "tramway": "tramway",
    "traffic": "traffic", "congestion": "traffic", "jam": "traffic", "jams": "traffic", "embouteillage": "traffic",
    "embouteillages": "traffic", "bouchons": "traffic", "streetlight": "lighting", "streetlights": "lighting",
    "lights": "lighting", "lamp": "lighting", "lamps": "lighting", "éclairage": "lighting", "lampadaires": "lighting",
    "dark": "lighting", "darkness": "lighting", "potholes": "pothole", "pothole": "pothole", "nids": "pothole",
    "jobs": "employment", "job": "employment", "unemployment": "employment", "unemployed": "employment",
    "chômage": "employment", "emploi": "employment", "work": "employment", "youth": "youth", "young": "youth",
    "jeunes": "youth", "students": "student", "étudiants": "student", "school": "school", "schools": "school",
    "école": "school", "écoles": "school", "wheelchair": "accessibility", "disabled": "accessibility",
    "disability": "accessibility", "disabilities": "accessibility", "handicap": "accessibility",
    "ramps": "accessibility", "ramp": "accessibility", "water": "water", "eau": "water", "leak": "leak",
    "leaks": "leak", "leaking": "leak", "fuite": "leak", "fuites": "leak", "flood": "flood", "floods": "flood",
    "flooding": "flood", "inondation": "flood", "inondations": "flood", "solar": "solar", "solaire": "solar",
    "electricity": "energy", "électricité": "energy", "power": "energy", "clinic": "clinic", "clinics": "clinic",
    "hospital": "hospital", "hôpital": "hospital", "doctors": "doctor", "médecin": "doctor",
    "tourists": "tourist", "tourism": "tourist", "visitor": "tourist", "visitors": "tourist", "touristes": "tourist", "medina": "medina", "médina": "medina",
    "parking": "parking", "stationnement": "parking", "trees": "tree", "arbres": "tree", "park": "park",
    "parks": "park", "jardin": "park", "garden": "park", "gardens": "park", "recycling": "recycle",
    "recycle": "recycle", "recyclage": "recycle", "plastic": "plastic", "plastique": "plastic",
    "smell": "odor", "smells": "odor", "odour": "odor", "odors": "odor", "odeur": "odor", "stink": "odor",
    "rats": "pest", "rodents": "pest", "flies": "pest", "insects": "pest", "mosquitoes": "pest",
    "weekend": "weekend", "weekends": "weekend", "friday": "weekend", "saturday": "weekend", "sunday": "weekend",
    "taxis": "taxi", "grand-taxi": "taxi", "sidewalk": "sidewalk", "sidewalks": "sidewalk", "trottoir": "sidewalk",
    "trottoirs": "sidewalk", "pavement": "sidewalk", "crossing": "crosswalk", "crosswalks": "crosswalk",
    "pedestrian": "pedestrian", "pedestrians": "pedestrian", "piétons": "pedestrian",
}


def strip_accents(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")


_TOKEN_RE = re.compile(r"[a-zA-ZÀ-ſ][a-zA-ZÀ-ſ\-']+")


def _stem(word: str) -> str:
    # Extremely light stemming; good enough to merge plurals.
    if len(word) > 4 and word.endswith("ies"):
        return word[:-3] + "y"
    if len(word) > 4 and word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def tokenize(text: str, canonical: bool = True) -> list[str]:
    tokens = []
    for raw in _TOKEN_RE.findall(text.lower()):
        word = raw.strip("-'")
        if len(word) < 3 or word in STOPWORDS:
            continue
        if canonical:
            word = SYNONYMS.get(word) or SYNONYMS.get(strip_accents(word)) or _stem(strip_accents(word))
        tokens.append(word)
    return tokens


class TfIdfIndex:
    """Tiny TF-IDF index for cosine similarity across a small corpus."""

    def __init__(self, docs: dict[int, list[str]]):
        self.docs = docs
        n = max(len(docs), 1)
        df: Counter[str] = Counter()
        for tokens in docs.values():
            df.update(set(tokens))
        self.idf = {t: math.log((1 + n) / (1 + c)) + 1.0 for t, c in df.items()}
        self.default_idf = math.log(1 + n) + 1.0
        self.vectors = {doc_id: self.vectorize(tokens) for doc_id, tokens in docs.items()}

    def vectorize(self, tokens: list[str]) -> dict[str, float]:
        tf = Counter(tokens)
        vec = {t: (1 + math.log(c)) * self.idf.get(t, self.default_idf) for t, c in tf.items()}
        norm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
        return {t: v / norm for t, v in vec.items()}

    @staticmethod
    def cosine(a: dict[str, float], b: dict[str, float]) -> float:
        if len(a) > len(b):
            a, b = b, a
        return sum(v * b.get(t, 0.0) for t, v in a.items())

    def query(self, tokens: list[str]) -> list[tuple[int, float, list[str]]]:
        qv = self.vectorize(tokens)
        results = []
        for doc_id, dv in self.vectors.items():
            score = self.cosine(qv, dv)
            if score > 0:
                shared = sorted(set(qv) & set(dv), key=lambda t: -(qv[t] * dv[t]))
                results.append((doc_id, score, shared))
        results.sort(key=lambda r: -r[1])
        return results


def top_keywords(text: str, limit: int = 6) -> list[str]:
    """Most frequent meaningful terms, preferring canonical concepts."""
    counts = Counter(tokenize(text))
    # Prefer longer/rarer-looking words when counts tie.
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], -len(kv[0])))
    return [w for w, _ in ranked[:limit]]


def first_sentences(text: str, max_chars: int = 220) -> str:
    text = " ".join(text.split())
    if len(text) <= max_chars:
        return text
    parts = re.split(r"(?<=[.!?])\s+", text)
    out = ""
    for p in parts:
        if len(out) + len(p) + 1 > max_chars:
            break
        out = f"{out} {p}".strip()
    if not out:
        out = text[: max_chars - 1].rsplit(" ", 1)[0] + "…"
    return out
