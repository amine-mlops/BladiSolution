<p align="center"><img src="frontend/public/BladiSolution_logo.png" alt="BladiSolution Campus" height="80"></p>

# BladiSolution Campus

> **Real Problems. Collective Intelligence. Practical Solutions.**

**BladiSolution Campus** helps people discover real challenges, share ideas for solving them, and see which solutions the community supports most. It also gives organizations a simple way to say they want to take a promising solution further.

* **BladiSolution** is the long-term vision: a platform where communities, institutions, companies and other organizations across Morocco publish real problems, and the people able to solve them (students, developers, engineers, researchers, startups) step forward, with partners able to support, fund or implement the best solutions.
* **BladiSolution Campus** is its first version. It starts with students and university communities in Morocco, and anyone can propose solutions, including developers, researchers, startups and other professionals. Problems are **not** limited to campus or academic topics: a student can post a national agriculture problem as easily as a campus accessibility one.

*Bladi* (بلادي) means "my country / my community" in Moroccan Darija. The project began as a prototype for the ASCIC Hackathon 2026; see the git history for that version.

```
PROBLEM  →  SOLUTIONS  →  STARS (community interest)  →  ORGANIZATION INTEREST  →  IMPLEMENTATION
```

---

## What the MVP does

| Area | Behaviour |
|---|---|
| **Discovery** | Public home page with recent problems, the most-starred solutions and a domain directory. Visitors can browse every problem and solution without an account. |
| **Problems** | Title, description, one of 11 domains, optional city, optional place or affected community, optional photo. While you type, similar existing problems are shown so you can support one instead of creating a duplicate. |
| **Solutions** | Title and proposed approach (required); implementation plan, resources or budget, and links (optional). Existing solutions are listed beside the form. Any signed-in user can propose; several solutions per problem are welcome. |
| **Stars** | One star per person per solution, stored as a row with a composite primary key. Authors can't star their own solutions. Users can un-star. The displayed count is recomputed from the stored rows. |
| **Ranking** | **Most supported** (stars, then newest, then id) and **Newest**, with the same rule on the problem page, the global feed and the home page. Stars indicate interest, not a technical review, and the UI says so. |
| **Search & filters** | Keyword search and domain filter on problems and solutions. Problems also have a "Needs solutions" sort. |
| **Organizations** | Organizations register with their own account type. A moderator **verifies** them before they can (a) express interest in a solution (*implementation*, *sponsorship or funding*, or *mentoring & support*), which notifies the author with the organization's contact email, or (b) update a solution's status (evaluated / selected / implemented). Interest is shown publicly as interest, never as approval or funding. |
| **My Activity** | Your problems, your solutions and the solutions you starred, plus notifications. |
| **Discussion & teams** | Comments with one level of replies, "Ask to collaborate" with author approval, and "Contact the author". |
| **Moderation** | Reports (spam, harassment, …) with hide or dismiss; organization verification queue. |

### Domains

Technology & Digital · Environment & Sustainability · Transportation & Mobility · Healthcare · Agriculture & Food · Energy · Public Services & Governance · Business & Entrepreneurship · Education & Campus · Social Impact & Accessibility · Other.

### Deferred from the MVP interface (code kept)

These prototype features still exist in the backend and source tree, but are no longer linked from the interface to keep the first version simple: the analytics dashboard (`/dashboard`), the problem map (`/map`), the separate Discover page (merged into Home), AI insight and contributor-matching panels, AI solution summaries, reputation scores, following users and domains, and urgency or impact ratings. The old URLs redirect to the matching MVP page. The API endpoints still work, so nothing that depends on them breaks.

---

## Architecture

```
┌──────────────────────────┐        ┌───────────────────────────────────────────┐
│  React 19 + TypeScript   │  /api  │  FastAPI (Python 3.12)                    │
│  Vite · Tailwind CSS 4   │ ─────► │  routers: auth, users, problems,          │
│  TanStack Query · Router │ cookie │  solutions, notifications, discover,      │
│                          │  (JWT) │  dashboard, ai, moderation, uploads       │
└──────────────────────────┘        │  services/ ai · events · ranking          │
        nginx (Docker)              │  migrations.py (idempotent, on startup)   │
                                    │  SQLAlchemy 2 ──► PostgreSQL 16           │
                                    └───────────────────────────────────────────┘
```

* **Frontend** (`frontend/`): React 19, TypeScript, Vite, Tailwind CSS 4 (theme tokens in `src/index.css`: brand navy `#0b2d4c` and teal `#03aa98`, taken from the logo), TanStack Query, React Router 7.
* **Backend** (`backend/`): FastAPI, SQLAlchemy 2, PostgreSQL (SQLite works too), bcrypt, JWT sessions in an httpOnly SameSite=Lax cookie.
* **Deployment**: Docker Compose runs Postgres, the API, and nginx serving the SPA and proxying `/api`.

### Logo

| File | Use |
|---|---|
| `frontend/public/BladiSolution_logo.png` | Full "BladiSolution Campus" wordmark (675×160, transparent). Used in the header, footer, sign-in and registration pages, and as the social preview image. Rendered by `src/components/Logo.tsx` at a fixed height so it keeps its aspect ratio. |
| `frontend/public/BladiSolution_icon.png` | Square mark (256×256, transparent). |
| `frontend/public/favicon.png`, `apple-touch-icon.png` | Browser and home-screen icons (mark on a white tile, so it stays visible on dark tabs). |
| `frontend/public/BladiSolutionlogo1.png`, `BladiSolutionlogo2.png` | Original brand files the assets above were generated from (white background removed, trimmed, resized). |

To change the logo, replace `BladiSolution_logo.png` with a transparent PNG of a similar shape (about 4.2:1). If the ratio changes, update `LOGO_RATIO` in `Logo.tsx`.

### AI components

All AI goes through a provider-agnostic `AIService` (`backend/app/services/ai/`). In the MVP interface only the **duplicate check** is used: it runs locally (TF-IDF with a multilingual synonym map), instantly, with no external calls. Problem analysis, solution summaries and contributor matching still run in the background and through `/api/ai/*`, using Claude when `ANTHROPIC_API_KEY` is set and falling back to the deterministic local engine otherwise (`AI_PROVIDER=auto|claude|local`).

### Database and migrations

Tables: `User` (individuals and organizations; organizations have `org_kind` and a `verified` flag), `Category` (the domains), `Tag`, `Problem`, `Solution`, `SolutionStar`, `OrganizationInterest`, `SolutionContributor`, `Implementation`, `Comment`, `ProblemSupport`, `ProblemFollower`, `UserFollow`, `CategoryFollow`, `Notification`, `Activity`, `Report`.

Tables are created by SQLAlchemy (`create_all`). Changes that `create_all` can't make are applied by **`backend/app/migrations.py`** on every startup. Each step checks the current state first, so it is idempotent, and no step deletes user data:

1. **Add `users.affiliation`** (nullable) when it is missing.
2. **Remap the prototype's 12 categories onto the 11 domains** (`waste→environment`, `urban-planning→governance`, `public-safety→governance`, `economic-development→business`, `tourism-heritage→business`, `social-inclusion→social-impact`). Problems are updated in place. Duplicate follows that end up on the same domain are merged. Old category rows are removed only once nothing references them. The API still accepts the old slugs and maps them.

Rehearsed on PostgreSQL 16 against a database created by the original prototype: every user, problem, solution, star, comment, support and notification count was identical before and after. Category follows went from 10 to 8 because two duplicate pairs were merged. A second run changed nothing.

### API (all under `/api`; interactive docs at `/api/docs`)

Unchanged prototype endpoints keep their contracts. Additions and changes for Campus:

```
POST   /auth/register                  role ∈ citizen|talent|organization (organizations start unverified), + affiliation
PATCH  /users/me                       role can no longer be changed here; + affiliation
GET    /me/starred                     solutions the current user starred
GET    /solutions?q=…                  keyword search on the global feed
POST   /solutions/{id}/star            400 for the author's own solution; count recomputed from rows
POST   /solutions/{id}/interest        {kind: implementation|sponsorship|mentorship, message?}, verified organizations only
DELETE /solutions/{id}/interest
GET    /solutions/{id}                 + interests[], my_interest, can_star, is_organization
POST   /problems, /problems/{id}/solutions   an identical resubmission within 10 min returns the first one (200)
GET    /moderation/organizations?status=pending|verified        admin
POST   /moderation/organizations/{id}  {verified: bool}         admin
```

### Security

* bcrypt passwords and httpOnly JWT cookies; every write is authorized server-side.
* **No self-assigned privileges**: registration accepts only individual or organization accounts, `PATCH /users/me` ignores role changes, and organization rights (status changes, interest, organization challenges) require `verified=true`, which only an admin can set. This fixes the prototype's privilege-escalation path.
* **Rate limiting** identifies clients by socket address. `X-Forwarded-For` is only trusted when `TRUST_FORWARDED_FOR=true`, which Docker Compose sets for the bundled nginx (it overwrites the header).
* Pydantic validation with control-character stripping. Uploads are checked by magic bytes, up to 5 MB. Security headers are set. The API refuses to start in production with the default JWT secret.
* Interest messages are visible only to the solution's author and the organization. The organization's email is shared only with the author it contacts.

---

## Running it

### Docker (recommended)

```bash
cp .env.example .env          # set JWT_SECRET and POSTGRES_PASSWORD; ANTHROPIC_API_KEY is optional
docker compose up --build
```

Open **http://localhost:8080**. The database starts **empty**: real deployments show only real content. To make yourself a moderator, register normally, then run:

```bash
docker compose exec db psql -U bladi bladisolution -c "UPDATE users SET role='admin' WHERE email='you@example.com';"
```

### Local development

Requirements: Python 3.12+, Node 20+, and Docker (only for Postgres).

```bash
# 1. Database
docker run -d --name bladi-pg -e POSTGRES_USER=bladi -e POSTGRES_PASSWORD=bladi \
  -e POSTGRES_DB=bladisolution -p 5433:5432 postgres:16-alpine

# 2. API  →  http://localhost:8000/api/docs
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp ../.env.example .env
uvicorn app.main:app --reload --port 8000

# 3. Web app  →  http://localhost:5173  (proxies /api to :8000)
cd frontend
npm install
npm run dev
```

### Fictional demo data (development only)

`python -m app.seed --reset` (from `backend/`) loads a **fictional** dataset: made-up people, organizations (pre-verified), stars and implementations. It is meant for development and tests only, never for a database real users see. It is not loaded automatically unless `SEED_ON_STARTUP=true`. In development builds the sign-in page offers shortcuts to its accounts (password `demo1234`, for example `talent@bladisolution.ma`, `org@bladisolution.ma`, `admin@bladisolution.ma`). Production builds don't show them.

`demo/record-demo.mjs` records a narrated walkthrough video. It was written for the original prototype's screens and needs updating before it can record the Campus interface.

### Environment variables

Every variable is documented in [`.env.example`](.env.example).

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql+psycopg://bladi:bladi@localhost:5433/bladisolution` | SQLAlchemy URL (Postgres or SQLite) |
| `JWT_SECRET` | dev value | **Must be set in production** |
| `COOKIE_SECURE` | `false` | `true` behind HTTPS |
| `SEED_ON_STARTUP` | `false` | Load the fictional demo dataset into an empty database |
| `TRUST_FORWARDED_FOR` | `false` | Trust `X-Forwarded-For` (only behind a proxy that sets it; Compose sets `true`) |
| `RATE_LIMIT_ENABLED` | `true` | In-memory rate limiting |
| `AI_PROVIDER` / `ANTHROPIC_API_KEY` / `AI_MODEL` | `auto` / — / `claude-opus-5-5` | Background AI features (optional) |

---

## Testing

```bash
cd backend && pytest                       # 26 API tests on SQLite
TEST_DATABASE_URL=postgresql+psycopg://bladi:bladi@localhost:5433/bladisolution_test pytest   # same suite on Postgres
cd frontend && npm run build && npm run lint
```

`tests/test_journeys.py` covers the original journeys (register, problems, solutions, stars, comments, notifications, supports, organization pipeline, duplicate detection, feeds, moderation, collaboration). `tests/test_campus.py` covers the Campus rules: public browsing and 401s on protected actions, no self-assigned privileged roles, optional city and minimal solutions, duplicate-submission collapse, persisted and unique stars with deterministic ranking, organization verification and interest permissions, and both migrations (including on an old-schema database).

## Project structure

```
backend/app/
  main.py · config.py · security.py · models.py · schemas.py · serializers.py
  migrations.py        idempotent startup migrations
  constants.py         domains, roles, legacy category map
  routers/             auth, users, problems, solutions, notifications, discover, dashboard, ai, moderation, uploads
  services/            ai/, events (activity + notifications), ranking, text
  seed.py, seed_data.py   fictional demo dataset (opt-in)
backend/tests/         test_journeys.py, test_campus.py, test_ai_fallback.py
frontend/src/
  pages/               Home, Problems, ProblemDetail, NewProblem, Solutions, SolutionDetail, NewSolution,
                       MyActivity, Profile, Settings, Notifications, Search, Moderation, Auth
                       (Discover, MapPage, Dashboard: deferred, not routed)
  components/          Layout, Logo, cards, actions (star/support/share/report), comments, ui
frontend/public/       logo, icon and favicon assets
```

## Next steps

Verified institution onboarding (for example email-domain checks for universities), Arabic, French and Amazigh interfaces (RTL), email notifications, Alembic once the schema starts changing often, Redis-backed rate limiting for multi-instance deployments, and bringing back the deferred features as real usage justifies them.
