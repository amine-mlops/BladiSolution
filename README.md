# BladiSolution

> **Turn Local Problems Into Real Solutions.**
> *Where communities meet solutions.*

**BladiSolution** is an open civic innovation platform. Citizens, talents, organizations and municipalities publish local problems, propose solutions, collaborate in public, and help the best solutions gain visibility through community support. Institutions then evaluate, select and implement them.

**Bladi** (بلادي) means *"my country / my community"* in Moroccan Darija. The platform starts with Moroccan cities and is built to work for any African city.

```
LOCAL PROBLEM → OPEN CHALLENGE → COMMUNITY SOLUTIONS → STARS + DISCUSSION
      → DISCOVERY BY ORGANIZATIONS → SELECTION → IMPLEMENTATION → REAL-WORLD IMPACT
```

Built for the **African Smart City Innovation Conference (ASCIC) Hackathon 2026**.

---

## The problem

Every city has problems, and citizens know about them: *"The waste containers near the market overflow every weekend."*
Students, engineers, startups, NGOs and researchers have the skills and ideas to fix them. Municipalities have the resources to implement fixes.

These people rarely meet around the same problem. Complaints vanish into phone lines and paper forms, good ideas stay in hackathon repos, and institutions can't see which solutions the community actually supports.

## The solution

BladiSolution is the digital layer that connects them. A complaint becomes an **open civic challenge**:

1. A **citizen** reports a problem. AI structures it (category, urgency, frequency, affected population) and detects duplicates so support concentrates instead of fragmenting.
2. **Talents and organizations** propose concrete solutions: approach, impact, implementation plan, required skills, cost.
3. The **community** discusses the solutions and **stars** the ones it believes in. Contributors form teams.
4. **Municipalities and organizations** use a dashboard to find top community-backed solutions and move them through a public pipeline: *Proposed → Developing → Under Evaluation → Selected → Implemented*.
5. Implemented solutions record **real-world impact** (citizens impacted, location, evidence). Contributors earn reputation from outcomes, not just popularity.

It is **not** a complaint ticketing system, a social network or a voting app. It is GitHub Issues for the city, combined with community participation and smart-city intelligence.

---

## Key features

| Area | What works |
|---|---|
| **Problems** | Create with category, city, neighbourhood, map pin, urgency, impact, tags and photo. Statuses: Open, Under Review, In Progress, Solved, Archived. Official challenges for institutions. Support, follow, share, report. |
| **AI analysis** | Extracts category and subcategory, frequency, urgency, impact areas, affected groups and an estimated count, locations and keywords. "Apply suggestions" fills the form for you. |
| **Duplicate detection** | Live while typing. Shows similarity %, location, supporters and solutions, with **Support Existing Problem** or **Create New Problem**. Problems are never merged automatically. |
| **Solutions** | Detailed proposals: description, how it works, impact, implementation plan, skills, resources, cost, links. Public by default. |
| **Stars** | GitHub-style: one star per user per solution, optimistic UI, milestone notifications (1, 5, 10, 25, …). |
| **Ranking** | Per problem: **Top · Latest · Discussed · Implemented**. Global feed: Latest · Trending · Top · Discussed · Implemented, filterable by category, city, neighbourhood, status, skill and date. Trending is time-decayed so old popular solutions can't dominate forever. |
| **Collaboration** | "Ask to collaborate" → the author accepts or declines. Contact a contributor (sends your name and email). Team list on every solution. |
| **Discussion** | Comments with one level of replies on problems and solutions. Delete your own comments; report others. |
| **Following & notifications** | Follow problems, contributors, organizations and categories. The notification center is fed only by real events: new solution, star milestone, comment, reply, collaboration request or acceptance, evaluated, selected, implemented, contact, new follower. |
| **Profiles & reputation** | Skills, bio, focus areas. Impact metrics: implemented solutions, citizens impacted, stars, selections. Reputation weights real outcomes (implemented ×120, selected ×50) far above stars (×1). |
| **AI matching** | "Potential contributors" on each problem, matched on skills, solution history in the category, and location, with a stated reason for each match. |
| **AI summaries** | Every solution gets a summary (Problem / Solution / How / Impact / Required) above the full proposal, which expands on demand. |
| **Municipality dashboard** | KPIs, problems and solutions by category, pipeline, problems by city, 12-week participation (with a data table view), top problems, top solutions with one-click decisions, decision board, recent activity. Filterable by city. |
| **Map** | OpenStreetMap / Leaflet. Problem markers coloured by category and sized by urgency, or a city-intensity view (high / medium / low). Clicking a marker opens the problem. |
| **Search & discovery** | Global search across problems, solutions, people, organizations and tags (`waste Rabat`, `Python`, `urban planning`). The Discover page shows trending and latest problems and solutions, recent implementations, top contributors, active organizations and a live activity feed. |
| **Moderation** | Report problems, solutions, comments or profiles (spam, harassment, inappropriate, misinformation, duplicate, other). Moderator queue with hide or dismiss. |

---

## Architecture

```
┌──────────────────────────┐        ┌───────────────────────────────────────────┐
│  React 19 + TypeScript   │  /api  │  FastAPI (Python 3.12)                    │
│  Vite · Tailwind CSS 4   │ ─────► │  routers: auth, users, problems,          │
│  TanStack Query · Router │ cookie │  solutions, notifications, discover,      │
│  Leaflet · Recharts      │  (JWT) │  dashboard, ai, moderation, uploads       │
└──────────────────────────┘        │                                           │
        nginx (Docker)              │  services/                                │
                                    │   ├─ ai/  AIService ─┬─ LocalAIService    │
                                    │   │                  └─ ClaudeAIService   │
                                    │   ├─ events  (activity + notifications)   │
                                    │   └─ ranking (time-decayed trending)      │
                                    │  SQLAlchemy 2 ──► PostgreSQL 16           │
                                    └───────────────────────────────────────────┘
```

* **Frontend** (`frontend/`): React 19, TypeScript, Vite 8, Tailwind CSS 4, TanStack Query for caching, pagination and optimistic updates, React Router 7, Leaflet with OpenStreetMap tiles (no API key), and Recharts. The map and chart pages are code-split.
* **Backend** (`backend/`): FastAPI, SQLAlchemy 2, PostgreSQL (SQLite also works, which the tests use), bcrypt password hashing, and JWT sessions in an httpOnly, SameSite=Lax cookie.
* **Deployment**: Docker Compose runs Postgres, the API, and nginx serving the SPA and proxying `/api`.

### AI components

All AI goes through a provider-agnostic `AIService` interface (`backend/app/services/ai/`):

```
AIService
 ├── analyze_problem()          Claude (structured output) → local fallback
 ├── detect_similar_problems()  local TF-IDF + synonym canonicalisation (instant, runs while typing)
 ├── summarize_solution()       Claude (structured output) → local fallback
 └── match_contributors()       local skill / category / history / location scoring (explainable)
```

* **`LocalAIService`** is deterministic and runs offline. It includes a multilingual tokenizer (English, French and common Darija transliterations such as *zbel*), a synonym map so that *"garbage bins are full"* ≈ *"waste containers overflow"*, TF-IDF cosine similarity with city and neighbourhood boosts, weighted category signals, frequency and urgency patterns, and population-group detection.
* **`ClaudeAIService`** uses Claude (`claude-opus-5-5` by default) through the official `anthropic` SDK with Pydantic structured outputs, low effort for latency, and server-side refusal fallbacks. Any failure (missing key, timeout, rate limit, invalid output) **silently falls back** to the local engine, and the UI says *"AI analysis is temporarily unavailable — showing the local engine's analysis."*
* Problem analyses and solution summaries are computed locally at creation time (so they are instant) and upgraded by Claude in a background task when a key is configured.
* The provider is selected with `AI_PROVIDER=auto|claude|local`.

### Database

`User` (citizens, talents, organizations and municipalities; organizations are users with `org_kind`), `Category`, `Tag`, `Problem`, `ProblemTag`, `Solution`, `SolutionTag`, `SolutionContributor`, `Implementation`, `Comment`, `ProblemSupport`, `ProblemFollower`, `SolutionStar`, `UserFollow`, `CategoryFollow`, `Notification`, `Activity`, `Report`.

Counters (`stars_count`, `supporters_count`, `solutions_count`, …) are denormalized and updated atomically, so feeds sort on indexed columns. Composite primary keys enforce *one star / one support / one follow per user*.

### API (all under `/api`; interactive docs at `/api/docs`)

```
POST /auth/register · POST /auth/login · POST /auth/logout · GET /auth/me
GET  /problems?sort=trending|latest|supported|discussed|unsolved&category&city&status&official&q
POST /problems · GET|PATCH|DELETE /problems/{id} · GET /problems/map
POST|DELETE /problems/{id}/support · POST|DELETE /problems/{id}/follow
GET|POST /problems/{id}/solutions?sort=top|latest|discussed|implemented|trending
GET|POST /problems/{id}/comments
GET  /solutions?sort=…&category&city&neighborhood&status&skill&since · /solutions/latest|trending|top
GET|PATCH /solutions/{id} · PATCH /solutions/{id}/status · GET /solutions/{id}/activity
POST|DELETE /solutions/{id}/star · GET|POST /solutions/{id}/comments
POST /solutions/{id}/contact · POST /solutions/{id}/collaborate · POST /solutions/{id}/collaborators/{user_id}
POST /ai/analyze-problem · /ai/similar-problems · /ai/summarize-solution · /ai/match-contributors · GET /ai/status
GET  /users · /users/{username} · /users/{username}/solutions|problems · PATCH /users/me
POST|DELETE /users/{username}/follow · /categories/{slug}/follow · GET /me/following
GET  /notifications · /notifications/unread-count · POST /notifications/read-all · /notifications/{id}/read
GET  /discover · /activity · /search · /stats · /meta · /dashboard
POST /reports · GET /moderation/reports · POST /moderation/reports/{id} · DELETE /comments/{id}
POST /uploads
```

### Security

* Passwords are hashed with bcrypt (12 rounds). Sessions are signed JWTs in an **httpOnly, SameSite=Lax** cookie (`Secure` when `COOKIE_SECURE=true`). Tokens are never exposed to JavaScript.
* Every write is checked server-side: authors edit their own content; only organizations, municipalities and admins can evaluate, select or implement; authors can move only their own solutions between Proposed and Developing; moderation requires the admin role.
* Pydantic validates every payload (lengths, enums, URL schemes) and strips control characters. User content is always rendered as text, never as HTML.
* Uploads accept only JPEG, PNG or WebP verified by **magic bytes** (the declared content type is ignored), up to 5 MB, saved under random names.
* Sliding-window **rate limiting** on login, registration, content creation, comments, stars, reports, uploads and AI endpoints.
* Security headers (`nosniff`, `X-Frame-Options`, `Referrer-Policy`). Errors are friendly JSON with no stack traces. The API refuses to start in production with the default JWT secret.
* In production, organization and municipality accounts should be verified before they get decision rights. The `verified` flag and badge are already in place.

---

## Quick start (Docker, recommended)

```bash
cp .env.example .env          # optional: set JWT_SECRET, ANTHROPIC_API_KEY
docker compose up --build
```

Open **http://localhost:8080**. On first start the empty database is seeded with the demo dataset automatically.

## Local development

Requirements: Python 3.12+, Node 20+, and Docker (only for Postgres).

```bash
# 1. Database
docker run -d --name bladi-pg -e POSTGRES_USER=bladi -e POSTGRES_PASSWORD=bladi \
  -e POSTGRES_DB=bladisolution -p 5433:5432 postgres:16-alpine

# 2. API  →  http://localhost:8000/api/docs
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp ../.env.example .env        # edit if needed
uvicorn app.main:app --reload --port 8000

# 3. Web app  →  http://localhost:5173  (proxies /api to :8000)
cd frontend
npm install
npm run dev
```

Reset the demo data at any time with `python -m app.seed --reset` (from `backend/`).

## Environment variables

Every variable is documented in [`.env.example`](.env.example). The main ones:

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql+psycopg://bladi:bladi@localhost:5433/bladisolution` | SQLAlchemy URL (Postgres or SQLite) |
| `JWT_SECRET` | dev value | **Must be set in production** |
| `COOKIE_SECURE` | `false` | `true` behind HTTPS |
| `AI_PROVIDER` | `auto` | `auto`, `claude` or `local` |
| `ANTHROPIC_API_KEY` | — | Enables Claude for analysis and summaries |
| `AI_MODEL` | `claude-opus-5-5` | Claude model ID |
| `SEED_ON_STARTUP` | `true` | Seed demo data when the DB is empty |
| `RATE_LIMIT_ENABLED` | `true` | In-memory rate limiting |

## Demo accounts

Password for every account: **`demo1234`**. The login page has one-click buttons for each of them.

| Role | Account | Who |
|---|---|---|
| Citizen | `citizen@bladisolution.ma` | Salma Benali, Agdal, Rabat |
| Talent | `talent@bladisolution.ma` | Youssef Amrani, full-stack and IoT engineer |
| Organization | `org@bladisolution.ma` | GreenRabat Association (NGO) |
| Municipality | `city@bladisolution.ma` | Rabat Municipal Innovation Office |
| Moderator | `admin@bladisolution.ma` | Moderation team |

All featured seed users (for example `amine@bladisolution.ma`) also use `demo1234`. All people and organizations in the dataset are fictional.

### Seed data

38 featured users (citizens, talents, startups, NGOs, labs and three municipal units) plus 420 lightweight community members, so star and support counts are backed by real rows. The data covers 27 problems across all 12 Smart City categories in 8 cities (Rabat, Casablanca, Salé, Marrakech, Fès, Tangier, Agadir, Laâyoune), with 44 solutions, 60 hand-written comments, about 3,600 stars, implementations with measured impact, and an activity feed and notifications derived from those events.

## Hackathon demo flow

1. **Problem**: open *Overflowing Waste Containers Around a Market* (Rabat · Akkari) to show location, impact, supporters and AI insight, with 3 solutions: *AI Waste Overflow Prediction* (342 stars), *Smart IoT Containers* (218), *Community Recycling Network* (96).
2. **AI**: sign in as Citizen Demo, go to **New → Submit a Problem** and type *"Garbage bins near the market are always full"*. The similar-problem panel finds the flagship. Click *Analyze with AI* → *Apply suggestions*, then *Publish*. The modal says *"We found a potentially similar problem"*; choose **Support Existing Problem**.
3. **Solutions**: as Talent Demo, submit a solution to the flagship, then click **Latest**. The new solution is on top with a *New* badge, and the citizen receives a notification.
4. **Community**: star a solution (the count changes instantly) and add a comment.
5. **Ranking**: switch to **Top**. Solutions are ordered by community stars.
6. **Municipality**: as Municipality Demo, open the **Dashboard** and the top community-supported solutions. Change *AI Waste Overflow Prediction* from *Under Evaluation* to **Selected**. The author is notified.
7. **Impact**: on the solution page use *Institution actions* → **Implemented** and enter the citizens impacted. The solution shows *Implemented by Rabat Municipal Innovation Office* with its impact, and the problem becomes *Solved*.

> **BladiSolution turns local problems into collective action.**

To reset the data after a rehearsal, run `docker compose exec backend python -m app.seed --reset` (or `python -m app.seed --reset` locally).

## Demo video

`demo/record-demo.mjs` uses Playwright to record a **narrated, captioned walkthrough** of every feature: landing page, exploration, AI analysis and duplicate detection, problem submission with a map pin, solutions, stars, comments, contact, collaboration, feeds, notifications, profiles, search, discovery, the map, the municipality dashboard and implementation, official challenges, moderation, and the mobile UI. The walkthrough plays as the citizen, talent, municipality and moderator demo accounts.

The voiceover reads each on-screen caption. It is generated offline with [Piper](https://github.com/rhasspy/piper) (neural TTS, `en_US-lessac-high` voice), and the recording waits for each line to finish so voice and picture stay in sync.

Requirements: the app running locally, Google Chrome, ffmpeg and Python 3.12 (with [uv](https://docs.astral.sh/uv/)).

```bash
cd demo
npm install                                    # also downloads Playwright's video encoder
uv venv .tts -p 3.12 && uv pip install -p .tts piper-tts
mkdir -p voices && for f in en_US-lessac-high.onnx en_US-lessac-high.onnx.json; do
  curl -sSL -o voices/$f https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/high/$f; done

npm run check          # fast check of every step, no video (~1 min)
npm run record         # dry pass → synthesize voice → record (~10 min) → demo/output/bladisolution-demo.mp4
npm run record:silent  # same video without voiceover
```

Demo data is reset before and after recording. Set `BASE` to record another URL, and `RESET_CMD` to use another reset command, e.g. `RESET_CMD="docker compose exec -T backend python -m app.seed --reset"`.

## Testing

```bash
cd backend && pytest                       # 15 end-to-end API journeys on SQLite
TEST_DATABASE_URL=postgresql+psycopg://bladi:bladi@localhost:5433/bladisolution_test pytest   # same suite on Postgres
cd frontend && npm run build && npm run lint
```

The API suite covers: register → login → create problem (visible to others); validation and auth errors; submit solution → Latest and Top ordering; star/unstar idempotency; ranking by stars; comments, replies and notifications; follow problem → new solution → notification; support/unsupport; the municipality pipeline (403 for citizens, selected → implemented with impact); AI analysis; duplicate detection; matching and summaries; feeds, search and dashboard; reporting and moderation; collaboration requests.

The full demo flow, plus mobile navigation and a crawl of every page at 1440 px and 390 px for console errors, failed requests and horizontal overflow, was run in headless Chrome during development.

## Project structure

```
backend/
  app/
    main.py            FastAPI app, error handling, startup seeding
    models.py          SQLAlchemy models        schemas.py   request validation
    security.py        hashing, JWT, roles, rate limiting
    routers/           auth, users, problems, solutions, notifications,
                       discover (feeds/search/meta), dashboard, ai, moderation, uploads
    services/ai/       AIService protocol, local engine, Claude provider
    services/          events (activity + notifications), ranking, text utils
    seed.py, seed_data.py   demo dataset
  tests/               end-to-end API journeys
frontend/
  src/pages/           Home, Problems, ProblemDetail, NewProblem, NewSolution,
                       SolutionDetail, Solutions, Discover, Map, Dashboard, Search,
                       Profile, Settings, Notifications, Moderation, Auth
  src/components/      layout, cards, actions (star/support/follow/share/report),
                       comments, AI panels, map, UI primitives
docker-compose.yml
```

## Roadmap after the hackathon

Arabic and Amazigh interfaces (RTL), SMS and WhatsApp intake for citizens without smartphones, verified institution onboarding, open data exports (Open311), embeddings-based semantic search, and Redis-backed rate limiting for multi-instance deployments.
