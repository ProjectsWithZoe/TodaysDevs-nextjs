# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev             # Next.js dev server on port 5173 (client + API)

# Database
npm run migrate         # Run SQL migrations in client/src/db/migrations/ in order
npm run seed            # Seed roles table

# Client only
cd client && npm run build
cd client && npm run start

# E2E tests (requires dev server running on port 5173)
cd client && npm run test:e2e           # headless Chromium
cd client && npm run test:e2e:ui        # interactive Playwright UI
cd client && npx playwright test tests/e2e/auth.spec.js   # single spec file
```

## Architecture Overview

This is a **single Next.js 15 application** — the frontend and backend API are co-located in the `client/` package. There is no separate server process.

- **`client/`** — Next.js 15 App Router (JSX, Tailwind CSS v4, React 19)
- **`sanity/`** — Sanity CMS schema for the blog

### Client

**Routing** uses the Next.js 15 App Router under `client/src/app/`:
- `(app)/` — authenticated shell (`/dashboard`, `/projects`, `/leaderboard`, `/friends`, `/profile`, `/rooms/[id]`, etc.); `AppLayout` redirects to `/login` if no session
- `(auth)/` — unauthenticated flows (`/login`, `/register`, `/auth/forgot-password`, `/auth/reset-password`)
- `api/` — all backend Route Handlers (see below)
- Public routes: `/` (landing), `/blog`, `/blog/[slug]`

Both route group layouts export `dynamic = 'force-dynamic'`.

**Page files** in `client/src/app/` are thin wrappers. Shared UI components live in `client/src/components/`.

**Auth** uses [better-auth](https://better-auth.com). The `authClient` (`client/src/lib/auth-client.js`) manages session cookies. `AuthContext` (`client/src/context/AuthContext.jsx`) is a `'use client'` context that merges the better-auth session with app-level fields from `GET /api/users/me`. Use `useAuth()` from `client/src/context/AuthContext.jsx` or `client/src/hooks/useAuth.js`.

**API calls** go through the Axios singleton at `client/src/api/client.js`. Base URL is `/api` — same origin, no proxy needed.

**Client components**: All layout, context, and interactive components are marked `'use client'`. `Providers` (`client/src/components/Providers.jsx`) wraps `AuthProvider`, `Toaster`, and Vercel `Analytics`.

**Global UI state** (sidebar open/closed, active room, notifications) lives in Zustand: `client/src/store/useAppStore.js`.

**Blog** content comes from Sanity CMS via `client/src/lib/sanity.js` and `client/src/lib/sanityQueries.js`.

### API Route Handlers

All API endpoints live under `client/src/app/api/` and mirror the previous REST surface exactly:

| Path | Methods |
|---|---|
| `/api/auth/[...all]` | GET, POST — better-auth handler |
| `/api/health` | GET |
| `/api/users/community` | GET |
| `/api/users/me` | GET, PATCH (display_name) |
| `/api/users/me/location` | PATCH |
| `/api/users/me/role` | PATCH |
| `/api/projects` | GET |
| `/api/projects/python` | GET |
| `/api/projects/[slug]` | GET |
| `/api/projects/[slug]/download` | GET (ZIP) |
| `/api/rooms` | POST (create) |
| `/api/rooms/my` | GET |
| `/api/rooms/[id]` | GET |
| `/api/rooms/[id]/join` | POST |
| `/api/rooms/[id]/start` | POST |
| `/api/rooms/[id]/leave` | POST |
| `/api/rooms/[id]/partner-decision` | PATCH |
| `/api/matchmaking/queue` | POST, DELETE |
| `/api/matchmaking/status` | GET |
| `/api/submissions` | POST |
| `/api/submissions/[id]` | GET (by teamId), PATCH (review) |
| `/api/leaderboard` | GET |
| `/api/leaderboard/me` | GET |
| `/api/lobby/[project_id]` | GET |

### Server-side Shared Library

All server-only code lives in `client/src/lib/server/` — never import these from client components:

- `db.js` — pg.Pool singleton (strips SSL params from DATABASE_URL for compatibility)
- `auth.js` — better-auth config with pg.Pool, email verification, snake_case table mapping
- `email.js` — Resend client
- `posthog.js` — PostHog analytics
- `github.js` — GitHub API client with 5-minute TTL cache
- `joinCode.js` — join code generator
- `constants.js` — `CAPACITY` and `MIN_TO_START` per mode
- `fetchRoom.js` — shared room query helper
- `middleware/authenticate.js` — validates better-auth session, resolves app user, geolocates IP on first login
- `middleware/requireMember.js` — `isMember(teamId, userId)` helper
- `services/matchmaker.js` — pure matchmaking logic (role/experience compatibility, duo/team assembly)
- `services/scoring.js` — score calculation (base, bonus, streak multiplier, DB upsert)
- `services/streak.js` — streak tracking
- `services/experienceLevel.js` — experience level derivation from submission history

### Database

PostgreSQL accessed via `pg` pool. Schema managed by plain SQL files in `client/src/db/migrations/` (currently 26 files, `001_` through `026_`) run in filename-sort order by `client/src/db/migrate.js`. No ORM — raw SQL only.

Auth tables use snake_case mapping: `auth_user`, `auth_session`, `auth_account`, `auth_verification`.

The codebase is plain JavaScript (no TypeScript).

### Environment Variables

All in `client/.env.local`:
- `DATABASE_URL` — PostgreSQL connection string
- `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` — better-auth config (BETTER_AUTH_URL = the app URL, e.g. `http://localhost:5173`)
- `GITHUB_TOKEN` — GitHub API access
- `RESEND_API_KEY`, `RESEND_FROM` — transactional email
- `POSTHOG_API_KEY`, `POSTHOG_HOST` — analytics
- `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET` — Sanity CMS
