"""Domain vocabulary shared by the API, the AI engine and the seed data."""

ROLES = ["citizen", "talent", "organization", "municipality", "admin"]
ORG_ROLES = {"organization", "municipality", "admin"}
DECISION_ROLES = {"municipality", "organization", "admin"}

ORG_KINDS = ["startup", "ngo", "association", "university_club", "research_lab", "company", "municipality", "institution"]

PROBLEM_STATUSES = ["open", "under_review", "in_progress", "solved", "archived"]
SOLUTION_STATUSES = ["proposed", "developing", "under_evaluation", "selected", "implemented"]
# Statuses an author can set on their own solution; the rest are decisions made by institutions.
AUTHOR_SOLUTION_STATUSES = {"proposed", "developing"}

LEVELS = ["low", "medium", "high", "critical"]

REPORT_REASONS = ["spam", "harassment", "inappropriate", "misinformation", "duplicate", "other"]
REPORT_TARGETS = ["problem", "solution", "comment", "user"]

CATEGORIES = [
    {
        "slug": "transportation",
        "name": "Transportation & Mobility",
        "icon": "bus",
        "color": "#2563eb",
        "description": "Public transport, traffic, road safety, cycling and walkability.",
        "skills": ["GIS", "Data Science", "Transport Planning", "IoT", "Mobile Development", "Machine Learning"],
    },
    {
        "slug": "governance",
        "name": "Smart Governance",
        "icon": "landmark",
        "color": "#7c3aed",
        "description": "Digital public services, transparency and citizen participation.",
        "skills": ["Web Development", "UX Design", "Public Policy", "Data Engineering", "Cybersecurity"],
    },
    {
        "slug": "education",
        "name": "Education",
        "icon": "graduation-cap",
        "color": "#0891b2",
        "description": "Schools, digital literacy, tutoring and lifelong learning.",
        "skills": ["Teaching", "EdTech", "Content Design", "Web Development", "Community Organizing"],
    },
    {
        "slug": "social-inclusion",
        "name": "Social Inclusion",
        "icon": "hand-heart",
        "color": "#db2777",
        "description": "Accessibility, youth, women, elderly and vulnerable communities.",
        "skills": ["Social Work", "Accessibility", "Community Organizing", "UX Design", "Public Policy"],
    },
    {
        "slug": "tourism-heritage",
        "name": "Tourism & Cultural Heritage",
        "icon": "landmark-dome",
        "color": "#b45309",
        "description": "Medinas, monuments, artisans and visitor experience.",
        "skills": ["Heritage Conservation", "Marketing", "Mobile Development", "3D / AR", "Tourism Management"],
    },
    {
        "slug": "economic-development",
        "name": "Economic Development",
        "icon": "briefcase",
        "color": "#ca8a04",
        "description": "Youth employment, entrepreneurship, informal economy and local commerce.",
        "skills": ["Entrepreneurship", "Finance", "Marketing", "Web Development", "Training"],
    },
    {
        "slug": "environment",
        "name": "Environmental Sustainability",
        "icon": "leaf",
        "color": "#16a34a",
        "description": "Green spaces, air quality, water, climate resilience and biodiversity.",
        "skills": ["Environmental Engineering", "Data Science", "IoT", "Urban Planning", "Hydrology"],
    },
    {
        "slug": "energy",
        "name": "Energy Efficiency",
        "icon": "zap",
        "color": "#eab308",
        "description": "Solar, public lighting, building efficiency and energy access.",
        "skills": ["Electrical Engineering", "Solar Energy", "IoT", "Data Science", "Embedded Systems"],
    },
    {
        "slug": "urban-planning",
        "name": "Urban Planning",
        "icon": "building-2",
        "color": "#475569",
        "description": "Public spaces, housing, land use and neighbourhood design.",
        "skills": ["Urban Planning", "Architecture", "GIS", "Civil Engineering", "Community Organizing"],
    },
    {
        "slug": "waste",
        "name": "Waste Management",
        "icon": "recycle",
        "color": "#0d9488",
        "description": "Collection, recycling, illegal dumping and circular economy.",
        "skills": ["IoT", "Machine Learning", "Logistics", "GIS", "Environmental Engineering", "Community Organizing"],
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
        "slug": "public-safety",
        "name": "Public Safety & Security",
        "icon": "shield",
        "color": "#ea580c",
        "description": "Street lighting, road hazards, emergency response and safe public spaces.",
        "skills": ["Computer Vision", "IoT", "Urban Planning", "Data Science", "Civil Engineering"],
    },
]
CATEGORY_SLUGS = [c["slug"] for c in CATEGORIES]
CATEGORY_BY_SLUG = {c["slug"]: c for c in CATEGORIES}

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
