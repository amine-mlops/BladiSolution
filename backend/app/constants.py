"""Domain vocabulary shared by the API, the AI engine and the seed data."""

ROLES = ["citizen", "talent", "organization", "municipality", "admin"]
ORG_ROLES = {"organization", "municipality", "admin"}
# Organization roles may act on solutions only once a moderator has verified the account
# (see security.can_decide); admins always can.
DECISION_ROLES = {"municipality", "organization", "admin"}
# Roles a person can pick for themselves when registering. "municipality" accounts are
# organizations with org_kind="municipality" and are never self-assigned.
SELF_SERVICE_ROLES = {"citizen", "talent", "organization"}

# Kinds of support an organization can offer a solution (expressions of interest only;
# nothing here commits money or implies approval).
INTEREST_KINDS = ["implementation", "sponsorship", "mentorship"]

ORG_KINDS = [
    "university", "company", "startup", "incubator", "foundation", "ngo", "association", "university_club",
    "research_lab", "institution", "municipality",
]

PROBLEM_STATUSES = ["open", "under_review", "in_progress", "solved", "archived"]
SOLUTION_STATUSES = ["proposed", "developing", "under_evaluation", "selected", "implemented"]
# Statuses an author can set on their own solution; the rest are decisions made by institutions.
AUTHOR_SOLUTION_STATUSES = {"proposed", "developing"}

LEVELS = ["low", "medium", "high", "critical"]

REPORT_REASONS = ["spam", "harassment", "inappropriate", "misinformation", "duplicate", "other"]
REPORT_TARGETS = ["problem", "solution", "comment", "user"]

# Problem domains for BladiSolution Campus. They are deliberately broad: a student can
# post a national agriculture issue as easily as a campus accessibility one.
CATEGORIES = [
    {
        "slug": "technology",
        "name": "Technology & Digital",
        "icon": "cpu",
        "color": "#4f46e5",
        "description": "Software, data, connectivity, digital tools and cybersecurity.",
        "skills": ["Web Development", "Mobile Development", "Data Science", "Cybersecurity", "UX Design"],
    },
    {
        "slug": "environment",
        "name": "Environment & Sustainability",
        "icon": "leaf",
        "color": "#16a34a",
        "description": "Waste, water, air quality, green spaces, climate and biodiversity.",
        "skills": ["Environmental Engineering", "Data Science", "IoT", "Urban Planning", "Hydrology"],
    },
    {
        "slug": "transportation",
        "name": "Transportation & Mobility",
        "icon": "bus",
        "color": "#2563eb",
        "description": "Public transport, traffic, road safety, cycling and walkability.",
        "skills": ["GIS", "Data Science", "Transport Planning", "IoT", "Mobile Development"],
    },
    {
        "slug": "healthcare",
        "name": "Healthcare",
        "icon": "heart-pulse",
        "color": "#dc2626",
        "description": "Access to care, public health, prevention and emergency response.",
        "skills": ["Public Health", "Medicine", "Data Science", "Mobile Development", "Logistics"],
    },
    {
        "slug": "agriculture",
        "name": "Agriculture & Food",
        "icon": "wheat",
        "color": "#a16207",
        "description": "Farming, irrigation, food supply chains, food waste and rural livelihoods.",
        "skills": ["Agronomy", "IoT", "Hydrology", "Supply Chain", "Data Science"],
    },
    {
        "slug": "energy",
        "name": "Energy",
        "icon": "zap",
        "color": "#ca8a04",
        "description": "Solar, efficiency, public lighting and access to energy.",
        "skills": ["Electrical Engineering", "Solar Energy", "IoT", "Embedded Systems", "Data Science"],
    },
    {
        "slug": "governance",
        "name": "Public Services & Governance",
        "icon": "landmark",
        "color": "#7c3aed",
        "description": "Administration, public safety, urban services, transparency and participation.",
        "skills": ["Web Development", "UX Design", "Public Policy", "Urban Planning", "Data Engineering"],
    },
    {
        "slug": "business",
        "name": "Business & Entrepreneurship",
        "icon": "briefcase",
        "color": "#0f766e",
        "description": "Employment, small business, tourism, commerce and access to finance.",
        "skills": ["Entrepreneurship", "Finance", "Marketing", "Web Development", "Training"],
    },
    {
        "slug": "education",
        "name": "Education & Campus",
        "icon": "graduation-cap",
        "color": "#0891b2",
        "description": "Schools, universities, campus life, learning and digital literacy.",
        "skills": ["Teaching", "EdTech", "Content Design", "Web Development", "Community Organizing"],
    },
    {
        "slug": "social-impact",
        "name": "Social Impact & Accessibility",
        "icon": "hand-heart",
        "color": "#db2777",
        "description": "Accessibility, inclusion, youth, women, elderly and vulnerable communities.",
        "skills": ["Social Work", "Accessibility", "Community Organizing", "UX Design", "Public Policy"],
    },
    {
        "slug": "other",
        "name": "Other",
        "icon": "circle-dot",
        "color": "#64748b",
        "description": "Anything that doesn't fit the domains above.",
        "skills": [],
    },
]
CATEGORY_SLUGS = [c["slug"] for c in CATEGORIES]
CATEGORY_BY_SLUG = {c["slug"]: c for c in CATEGORIES}

# Categories used by the original prototype, mapped onto the current domains. Used to
# migrate stored rows and to keep old API clients and links working.
LEGACY_CATEGORY_MAP = {
    "waste": "environment",
    "urban-planning": "governance",
    "public-safety": "governance",
    "economic-development": "business",
    "tourism-heritage": "business",
    "social-inclusion": "social-impact",
}


def canonical_category(slug: str | None) -> str | None:
    """Map a legacy category slug to the current domain; other values pass through."""
    if slug is None:
        return None
    return LEGACY_CATEGORY_MAP.get(slug, slug)


# City centres used for the map and for location extraction.
CITIES = {
    "Rabat": (34.0209, -6.8416),
    "Casablanca": (33.5731, -7.5898),
    "Salé": (34.0331, -6.7985),
    "Marrakech": (31.6295, -7.9811),
    "Tangier": (35.7595, -5.8340),
    "Agadir": (30.4278, -9.5981),
    "Fès": (34.0181, -5.0078),
    "Laâyoune": (27.1253, -13.1625),
    "Meknès": (33.8935, -5.5473),
    "Oujda": (34.6814, -1.9086),
    "Tétouan": (35.5785, -5.3684),
    "Kénitra": (34.2610, -6.5802),
}
