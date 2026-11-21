<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# TechComp Hub — Engineering & Operations Guide

## 1. Project Overview & Tech Stack

**TechComp Hub** is a self-hosted Computer & Technology Competition Hub and Teacher/Admin Team Builder built for Thai schools. Students register with structured school info (`firstName`, `lastName`, `nickname`, `ม.1`–`ม.6`, rooms `1`–`14`), track open Thai tech competitions matched to their tech stack, express interest by role, and check confirmed teams; teachers/admins curate AI-discovered competitions, manage users, form balanced teams with drag-and-drop, and export rosters.

- **Framework:** Next.js `16.4.6` (App Router, Turbopack, `output: "standalone"`), React `19.3.0`, TypeScript
- **Styling & UI:** Tailwind CSS v4 (`@tailwindcss/turbopack`), shadcn/ui (`radix-ui`), `lucide-react`, `sonner`, `@dnd-kit/core`
- **Database:** PostgreSQL 16 (self-hosted Docker `postgres:16-alpine`) via `pg` with strict `FORCE ROW LEVEL SECURITY`
- **Auth:** Self-hosted `node:crypto` `scrypt` password hashing (`src/lib/auth/password.ts`) + `jose` HTTP-only JWT cookie (`techhub_session`)
- **AI Engine:** OpenTyphoon API (`https://api.opentyphoon.ai/v1`) via `openai` SDK (`typhoon-v2.5-30b-a3b-instruct` for JSON extraction, `/v1/ocr` `typhoon-ocr` with `typhoon-ocr-v2` fallback for poster OCR)
- **Validation:** Zod v4 (`zod` `^4.6.7`) at every request and AI output boundary

---

## 2. Domain & Localization Rules

### Strict Computer & Technology Taxonomy
All categories, roles, skills, and statuses are centrally defined in `src/lib/constants/tech-taxonomy.ts` and enforced in `db/schema.sql`. **Never** diverge between TypeScript enums and PostgreSQL `CHECK` constraints:
- **Categories (`TECH_CATEGORIES`, exact 8 values):** `Programming / Competitive`, `AI & Data Science`, `Web & Mobile Dev`, `Cybersecurity / CTF`, `Robotics & IoT`, `Game Dev`, `Tech Hackathon & Innovation`, `UI/UX & Digital Design`.
- **Roles (`TECH_ROLES`, 13 values):** `Frontend`, `Backend`, `Full-Stack`, `Mobile Dev`, `AI / ML`, `Data Science`, `Cybersecurity`, `Embedded / IoT`, `Robotics`, `Game Dev`, `UI/UX Design`, `Algorithm / CP`, `Pitching & PM`.
- **Skill Tags (`TECH_SKILLS`, 16 presets):** Grouped via `TECH_SKILL_GROUPS`, plus custom user tags (max 30).
- **Thailand-Only Competition Scope:** Exclude foreign-only contests and automated weekly CP rounds (Codeforces, AtCoder, LeetCode, Devpost global) in the scout pipeline. Prioritize active Thai tech competitions.

### Thai Language & Buddhist Era (พ.ศ.) Dates
- All UI labels, empty states, validation messages, toasts, and error responses must be written in clean, modern **Thai**.
- **Typography:** `IBM Plex Sans Thai` (`--font-ibm-plex-sans-thai`) for prose/UI and `JetBrains Mono` (`--font-jetbrains-mono`) for code, deadlines, and tech tags (`tabular-nums` on counts/dates).
- **Date Invariant:** Store dates in PostgreSQL strictly as Christian Era (ค.ศ.) `YYYY-MM-DD`. Display in Thai Buddhist Era (`CE + 543`) using `formatThaiDate`, `normalizeToIsoCeDate`, `parseIsoDateParts`, `getTodayIsoBangkok`, and `getDeadlineCountdown` in `src/lib/utils/thai-date.ts` — always do UTC calendar arithmetic so local timezones never drift deadlines by ±1 day.

### Structured Student Classroom & Profile Fields
Defined in `src/lib/constants/classroom.ts`:
- `GRADE_LEVELS`: `ม.1` through `ม.6`
- `CLASS_ROOMS`: `1` through `14`
- `formatClassroom` / `parseClassroom` normalize and parse strings such as `"ม.5/14"`, preserving non-standard legacy values safely via `customGrade`.
- `profiles.nickname` stores user nicknames (`ชื่อเล่น`); show `{full_name}{nickname ? ` (${nickname})` : ""}` in member rosters, team builder, admin lists, and dropdown menus, and include `Nickname` in CSV exports.

---

## 3. Database, RLS & Security Invariants

1. **Always Choose the Right Pool Helper (`src/lib/db/pool.ts`):**
   - **`withUserDb(userId, fn)`** for all standard authenticated or anonymous reads/writes. It runs `BEGIN`, sets `app.system_mode = 'off'` and transaction-scoped `app.current_user_id` (`app_uid()`), and enforces PostgreSQL `FORCE ROW LEVEL SECURITY` using the non-superuser `techhub_app` role (`db/init/00-init-role.sh`).
   - **`withSystemDb(fn)`** sets `app.system_mode = 'on'`. Reserve strictly for auth (`login`, `register`, `change-password`), privileged admin user management (only *after* `requireTeacherUser()` passes), and cron/scout background jobs. **Never** pass untrusted user actions through `withSystemDb` without explicit server-side authorization checks.
2. **Role & Admin Protection:**
   - Database role column stays `role in ('student', 'teacher')`; `teacher` represents Teachers & Admins.
   - `POST /api/auth/register` grants `'teacher'` ONLY when `profiles` count is `0` (first-user bootstrap under `pg_advisory_xact_lock(742901)`) OR `isConfiguredAdminEmail(email)` (`ADMIN_EMAILS` env var via `src/lib/auth/admin-emails.ts`). Every other signup MUST force `'student'`.
   - Protected primary admins (configured through `ADMIN_EMAILS`, for example `admin@school.example`) and the last remaining `'teacher'` account cannot be demoted or deleted via `/api/admin/users/[id]`.
3. **XSS, SSRF & CSV Safety:**
   - Validate all external URLs before server-side fetching (`fetchUrlMarkdown`, scout fetchers) with `validatePublicHttpUrl` (`src/lib/utils/url-safety.ts`) to block private/loopback/link-local SSRF targets.
   - Validate `next` redirect parameters with `isSafeInternalRedirect`.
   - Escape CSV cells in `/api/teacher/competitions/[id]/teams/export` with leading UTF-8 BOM (`\uFEFF`) and formula-injection prefixing (`^[=+\-@\t]`).
4. **Secrets Hygiene:**
   - Never commit `.env.local`, API keys (`TYPHOON_API_KEY`, `SESSION_SECRET`, `CRON_SECRET`), database passwords, or SSH/sudo credentials into tracked files or client bundles.
   - Note that `src/proxy.ts` and `next.config.ts` run on HTTP Tailscale/LAN in self-hosted mode when `COOKIE_SECURE=false`; keep `COOKIE_SECURE=true` only behind HTTPS.

---

## 4. AI Ingestion & Live Scout Pipeline

- **Configuration (`src/lib/ai/opentyphoon.ts`):** Uses OpenAI-compatible client pointed at `TYPHOON_BASE_URL` with `TYPHOON_API_KEY`. Gracefully checks `isTyphoonConfigured()`.
- **Structured Extraction & Gatekeeper (`src/lib/ai/extract-competition.ts`):**
  - Shared entry point `extractTechCompetitionFromText` for manual URL/text extraction, Typhoon OCR poster extraction (`extractTextFromPosterImage`), and Auto Scout.
  - Injects current CE + Thai BE date context and parses nullable/Thai/BE/DD-MM-YYYY AI date strings safely with `rawAiExtractionSchema` + `parseAiDeadlineToIsoCe`.
  - Strict `is_tech_related` boolean gatekeeper: students cannot insert rows directly unless `is_tech_related === true`; student submissions always insert with `status = 'pending_review'`.
- **Auto Tech Scout & Streaming Progress (`src/lib/ai/scout.ts`):**
  - Auto-closes expired `open` competitions (`deadline < today`), scans 6 verified Thai sources (`Hackza Thailand`, `Hackathon Thailand`, `PorTCAS Thailand`, `Contester Thailand`, `CTF Thailand`, `Google News Thailand`), deduplicates against `competitions.source_url`, extracts via OpenTyphoon (`thailandOnly: true`), and inserts new items as `pending_review`.
  - `POST /api/teacher/scout?stream=1` streams newline-delimited JSON (`ScoutProgressEvent` over `application/x-ndjson`) rendered in `<ScoutRunnerDialog />` (`src/components/teacher/scout-runner-dialog.tsx`) with live source status, progress bar, abort support, and activity log.
  - **Web Search Discovery (`src/lib/search/*`):** One provider module owns each external search wire format. `resolveSearchProvider` reads `SEARCH_PROVIDER` and one server-only provider key. `searchCompetitionListings` returns a common `WebSearchResult[]`. Scout adds these URLs as candidates only after `toWebSearchResult` rejects private targets. Search snippets never become competition fields.
  - **Bundling Rule:** Client components must import types from `@/lib/ai/scout` strictly via `import type { ... }` so `pg` and server modules are never dragged into the client bundle.

---

## 5. Next.js 16 & Codebase Conventions

- **Middleware -> Proxy:** Next.js 16 uses `src/proxy.ts` exporting `export async function proxy(request: NextRequest)`. Route guards protect `/profile`, `/my-teams`, `/settings` (authenticated users) and `/teacher/*`, `/admin/*` (`teacher` role only).
- **Async Dynamic Request APIs:** Always `await params` and `await searchParams` in pages, layouts, and dynamic Route Handlers (`params: Promise<{ id: string }>`).
- **Route Handler Exports:** In `src/app/**/route.ts`, export **only** HTTP method handlers (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) and Next.js segment config (`dynamic`). Place shared TypeScript interfaces in `src/types/database.ts`, never in `route.ts` files.
- **Dynamic Server Pages:** Avoid enabling `cacheComponents` in `next.config.ts`; authenticated cookie-backed pages rely on per-request SSR (`export const dynamic = "force-dynamic"` where appropriate).
- **Strict TypeScript:** Avoid `any` and unvalidated `as` casts. Validate inputs with Zod schemas and type guards (`isTechCategory`, `isTechRole`, `isGradeLevel`, `isClassRoom`, etc.).

---

## 6. UI & Design-Engineering Standards

- **Aesthetic Discipline:** Warm editorial canvas (`oklch(0.980 0.010 87)` cream light / `oklch(0.221 0.028 272)` deep indigo dark) with a single forest-teal action color (`--primary`). Category and deadline meaning may use the low-chroma named semantic tokens `--sage`, `--lavender`, `--peach`, and `--sky`; each has a paired foreground token and must stay AA-contrast. Never add ad-hoc hex or inline hue classes.
- **Canvas-First Layout:** Let content sit directly on the canvas separated by spacing and hairline borders. Use tinted panels only for the primary discovery/search surface. Avoid nested cards, heavy shadows (`shadow-lg`), hover lift bounces, decorative dot grids, blurred orbs, gradients, saturated rainbow badges, or decorative `Sparkles`/`Flame` icons.
- **Dark Mode:** Every UI surface, border, text color, and alert must use semantic tokens (`bg-background`, `text-foreground`, `text-muted-foreground`, `bg-muted`, `border-border`) or paired `dark:` classes. `ThemeProvider` defaults to `"system"` with pre-hydration script initialization (`techcomp-theme`), `<ThemeToggle />` in `navbar-client.tsx`, 3-way selector in `/settings`, and `<ThemedToaster />`.
- **Icons & Numbers:** Minimal `lucide-react` icons only where they aid scanning. Apply `tabular-nums` and `font-mono` for deadlines, countdowns, KPI counters, and tech tags. Keep `hover` / `active` states calm and crisp.

---

## 7. Key File Map

| Path | Responsibility |
| --- | --- |
| `db/schema.sql`, `db/init/00-init-role.sh` | PostgreSQL 16 schema, idempotent `ALTER TABLE`s, `SECURITY DEFINER` helpers, strict RLS policies |
| `src/proxy.ts` | Edge/server route protection (`/profile`, `/my-teams`, `/settings`, `/teacher/*`, `/admin/*`) |
| `src/lib/db/pool.ts`, `src/lib/db/team-builder.ts` | `withUserDb` (RLS) / `withSystemDb` transaction wrappers and team builder SQL loaders |
| `src/lib/auth/*` | `password.ts` (`scrypt`), `session.ts` (`jose` JWT), `cookies.ts` (session & role guards), `admin-emails.ts` |
| `src/lib/constants/tech-taxonomy.ts`, `classroom.ts` | Canonical 8 categories, 13 roles, 16 skills, status metadata, `ม.1`–`ม.6` & room `1`–`14` helpers |
| `src/lib/utils/thai-date.ts`, `url-safety.ts` | Thai Buddhist Era date formatting, UTC countdowns, public HTTP URL SSRF validation |
| `src/lib/ai/opentyphoon.ts`, `extract-competition.ts`, `scout.ts` | OpenTyphoon client, URL/text/OCR extractor, streaming Thailand tech scout |
| `src/lib/search/*` | Server-only web search providers, provider selection, and common result normalization |
| `src/lib/db/student-teams.ts`, `src/lib/utils/teammate-match.ts` | Student-led recruitment, invites, open roles, and explainable teammate ranking |
| `src/lib/ai/prep-studio.ts`, `src/components/prep-studio/*` | AI roadmap, rubric review, deliverables, and submission readiness |
| `src/lib/realtime/*`, `src/components/collab/*` | SSE transport, team chat, mentions, and weekly check-ins |
| `src/lib/integrations/*`, `src/app/showcase/*` | Calendar feeds, signed webhooks, showcase projection, and OG images |
| `src/lib/db/badges.ts`, `src/lib/reports/*` | Verified badges, skill evidence, and Thai academic-year reports |
| `src/components/command/*`, `src/components/pwa/*`, `public/sw.js` | Command palette, installable PWA, and private-safe offline read cache |
| `src/lib/ops/*`, `scripts/bench-queries.mjs`, `scripts/verify-backup.sh` | Ops telemetry, query benchmarks, and backup restore verification |
| `src/types/database.ts` | Shared database & admin view TypeScript interfaces |
| `src/components/theme/*` | `ThemeProvider`, `ThemedToaster`, and SSR-safe `<ThemeToggle />` |
| `src/components/competitions/*` | `CompetitionFeed` (SSR query sync + skill matching), `CompetitionActions` (share + `.ics`), `InterestDrawer`, `SmartAddModal` |
| `src/components/teacher/*` | `ReviewQueueClient`, `ScoutRunnerDialog` (NDJSON live progress), `TeamBuilderBoard` (`@dnd-kit/core` + auto-balance) |
| `src/components/admin/admin-dashboard-client.tsx` | Full Admin UI (users, classrooms `1–14`, roles, competitions, teams overview) |
| `src/components/settings/settings-client.tsx` | Account/classroom editor, change password, theme switcher, session management |
| `src/components/auth/auth-form.tsx` | Sign In / Sign Up with split first/last name, `nickname`, `ม.1–ม.6`, rooms `1–14` |
| `src/app/**/page.tsx` & `src/app/api/**` | App Router SSR pages (`/` with filter params, `/competitions/[id]`, `/my-teams`, `/profile`, `/settings`, `/admin`, `/teacher/*`, `/login`) and JSON/NDJSON APIs |

---

## 8. Verification & Production Deployment Runbook

1. **Before Every Deploy (Local Checks):**
   ```bash
   npx tsc --noEmit && npm run lint && npm run build
   ```
   All three must exit `0` with zero TypeScript errors, zero ESLint warnings, and a clean standalone production build.
2. **Schema Changes on Live PostgreSQL:**
   Apply migrations with `npm run db:migrate`. Files in `db/migrations/` are versioned, checksummed, and idempotent.
3. **Deployment to a self-hosted Linux host:**
   - Sync without overwriting remote `.env.local` or host state:
     ```bash
     rsync -az --delete --exclude node_modules --exclude .next --exclude .git --exclude .env.local "./" "$DEPLOY_HOST:$DEPLOY_DIR/"
     ```
   - Always pass `--env-file .env.local` to `docker compose` (secrets live in `.env.local`):
     ```bash
     ssh "$DEPLOY_HOST" "cd \"$DEPLOY_DIR\" && docker compose --env-file .env.local up -d --build web"
     ```
4. **Post-Deploy Verification & Host Boundaries:**
   - Verify HTTP `200` on `/`, `/login`, and sample `/competitions/<id>`, plus `307`/`401`/`403` auth & role guards, and check `docker ps` for healthy `db` and running `web`.
   - Schedule the scout endpoint with your platform scheduler or cron.
   - Never modify unrelated host services or network configuration.
