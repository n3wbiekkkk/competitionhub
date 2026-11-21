# PROGRESS

Baseline commit: `fdd8830`
Baseline gate: 37 tests pass, lint/typecheck/build pass, public repo gate pass.
Branch: `main`
Wave 2 code commit: `1c709d9`
Wave 2 code CI run: `44875005294`
Wave 2 final CI run: `44877076252`
Final deploy stamp: `20261121T063626Z`
Final production probe: `/tmp/competition-hub-wave2/production-final.log`
Security fuzz: `/tmp/competition-hub-wave2/fuzz4.log`
Backup verification: `/tmp/competition-hub-wave2/verify-backup3.log`
Query benchmark: `/tmp/competition-hub-wave2/bench-final.log`
Fresh Compose boot: `/tmp/competition-hub-wave2/fresh-compose2.log`

## Phase status

| Phase | Focus | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Security, observability, hardening | VERIFIED | CI run 44861768813 green; 84 unit tests; production probe shows schema ok and login 401, not 429. |
| 2 | Database evolution, migration engine | VERIFIED | 14 migrations applied in production; `db:status` complete; schema parity reports 14 migrations and 96 objects. |
| 3 | Auth, SMTP, admin RBAC | VERIFIED | jti sessions, truthful outbox, audit writes, RBAC. CI green and production login probe pass. |
| 4 | Scout engine, AI extraction v2 | VERIFIED | Server gatekeeper, dedupe, retry abort fix, 7 sources, web search. CI green; `/tmp/competition-hub-phases/live-search-probe.log`. |
| 5 | Discovery, matching, student workspace | VERIFIED | Rate-limited AI ranking, honest relaxed intent, explainable matching wired. CI green. |
| 6 | Teacher ops, team builder, analytics | VERIFIED | Canonical roles, optimizer wired, safer task RLS. CI green; integration RLS probe reports 0 unprotected tables. |
| 7 | Notifications, media, UX polish | VERIFIED | New-user preference trigger applied as 0008; reminders scheduler added; E2E covers notification bell. CI green. |
| 8 | Tests, CI/CD, production docs | VERIFIED | CI run 44875005294 green with 13 Playwright tests; public repo gate green; deploy stamp 20261121T063626Z healthy. |
| 9 | Student-led teams and recruitment | VERIFIED | Migration 0010, LFG/invites, teammate ranking. CI 44875005294 green; fuzz 7/7. |
| 10 | AI coach and prep studio | VERIFIED | Migration 0011, roadmap, rubric review, deliverables, readiness meter. CI 44875005294 green. |
| 11 | SSE, team chat and mentor check-ins | VERIFIED | Migration 0012, SSE, chat, check-ins, mentor triage. CI 44875005294 green. |
| 12 | Calendar, webhooks and showcase | VERIFIED | Migration 0013, tokenized .ics, webhook routing, public showcase, OG images. CI 44875005294 green. |
| 13 | Badges, skill evidence and reports | VERIFIED | Migration 0014, badge engine, verified skills, school impact reports. CI 44875005294 green. |
| 14 | PWA, offline read and command palette | VERIFIED | Manifest, private-safe service worker, command palette, mobile bottom nav. CI 44875005294 green. |
| 15 | Resilience, backups and profiling | VERIFIED | Backup restore passed; 10-query benchmark complete; ops telemetry mounted. CI 44875005294 green. |
| 16 | E2E, fuzzing and v1.0.0 | VERIFIED | 13 Playwright tests green; fuzz 7/7; package version 1.0.0; release workflow added. |

## Decision trail

| Phase | Decision | Reason | Evidence |
| --- | --- | --- | --- |
| 0 | Use existing commit as baseline and audit all 8 phases before coding | Need quantified scope and risk before a long run | `/tmp/competition-hub-master/baseline.log` |
| 1 | Keep one DB-backed limiter instead of two | Removes process-local state and preserves one boundary | atomic fixed-window upsert in `src/lib/auth/rate-limit.ts` |
| 1 | Enforce CSRF centrally in proxy | Avoids editing 15 route handlers with the same guard | `src/proxy.ts` mutation origin check |
| 1 | Keep `public/.gitkeep` | Fresh Docker build needs the directory in git | Phase 8 audit blocker |
| 3 | Force re-login for legacy tokens | Old tokens lack jti and cannot be safely bound to a session row | `session.ts` strict jti schema |
| 2 | Replace monolithic SQL with checksummed migrations | Two sources of truth caused drift | `scripts/migrate.mjs`, `db/migrations/0001_baseline.sql`, `0002_search_indexes.sql` |
| 2 | Keep `schema.sql` as fresh-boot snapshot | Fresh Docker still needs one clean bootstrap file | `db/schema.sql` updated with ledger and trgm indexes |
| 4 | Use one common result shape for all web search providers | Scout must not know any provider wire format | `src/lib/search/types.ts` and provider modules |
| 4 | Keep search snippets as hints only | AI extraction remains the only writer of competition fields | `fetchWebSearchCandidates` sets `requireFetchedContent` |
| 8 | Add a schema and RLS integration probe | CI needs proof that migrations and row security work together | `scripts/test-integration.mjs` wired into CI |
| 8 | Copy `db/` into the standalone runner | Migration command runs inside the web container and needs migration files | `Dockerfile` runner stage |
| 1 | Remove the unused limit parameter from the rate limit upsert | PostgreSQL rejected the untyped parameter and every rate limited route failed closed with 429 | `src/lib/auth/rate-limit.ts`, `scripts/test-integration.mjs` |
| 1 | Ignore client proxy headers unless `TRUST_PROXY_HEADERS=true` | Forwarded IP headers were spoofable on auth routes | `src/lib/utils/request-ip.ts` |
| 1 | Require an Origin on API mutations and exempt bearer cron calls | The previous guard skipped unauthenticated mutations | `src/proxy.ts`, `src/lib/auth/csrf.ts` |
| 1 | Redact nested log fields and token-shaped strings | Error messages could carry secrets past top-level key checks | `src/lib/utils/logger.ts` |
| 1 | Derive CSRF host from the Host header | `x-forwarded-host` is client-controllable and Next may normalize request URL | `src/lib/auth/csrf.ts` |
| 1 | Check migration version and required objects in health | The previous probe returned OK on an incomplete schema | `src/lib/health/schema.ts` |
| 2 | Add schema parity check and mirror 0001 objects | Fresh DBs skipped 0001 and lacked auth tables | `scripts/check-schema-parity.mjs`, `db/schema.sql` |
| 2 | Move advisory lock before the ledger read | Concurrent runners could both decide to apply the same migration | `scripts/migrate.mjs` |
| 3 | Keep SMTP rows out of `sent` and record `last_error` | SMTP was optional but cron claimed delivery | `src/lib/email/mailer.ts`, `src/app/api/cron/email/route.ts` |
| 3 | Add audit writes for user creation and review status changes | Those privileged actions had no audit row | `src/app/api/admin/users/route.ts`, `src/app/api/competitions/[id]/route.ts` |
| 4 | Recheck relevance on the server for student submissions | `is_tech_related` was client-asserted | `src/app/api/competitions/route.ts` |
| 4 | Use `dedupeCompetition` inside the scout | Near-duplicate detection was test-only | `src/lib/ai/scout.ts` |
| 5 | Rate-limit `/api/discovery` and use relaxed intent after relaxation | Anonymous AI calls were unthrottled and fallback claims could lie | `src/app/api/discovery/route.ts` |
| 5 | Wire `explainSkillMatch` into the live feed | Explainable matching was test-only | `src/components/competitions/competition-feed.tsx` |
| 6 | Use `optimizeTeams` for new team creation | Only `scoreTeam` was wired into the UI | `src/components/teacher/team-builder-board.tsx` |
| 7 | Add a trigger that creates notification preferences for new users | New users were excluded from reminders | `db/migrations/0008_notification_preferences.sql` |
| 8 | Check all public tables and all migration versions in the integration probe | The old probe missed missing tables and migrations | `scripts/test-integration.mjs` |

| 8 | Marked all phases VERIFIED only after CI, deploy, and production probes passed | Labels without real verification were the original problem | CI run 44861768813, deploy stamp 20261121T033725Z, `/tmp/competition-hub-phases/production-probe-final.log` |
| 9-16 | Split Wave 2 into eight isolated worktree slices | Parallel work needed separate write ownership | `/tmp/competition-hub-wave2/PLAN.md`, eight phase reports |
| 9-16 | Integrated migrations 0010 to 0014 by appending them to schema.sql | Fresh boot must match the migration ledger | `npm run check:schema`, 14 migrations and 96 objects |
| 9-16 | Added a canonical dynamic calendar feed route | Next 16 treats `[token].ics` as a literal segment | `src/app/api/calendar/feed/[token]/route.ts` |
| 9-16 | Removed all planned-route skip guards after merging | Zero skipped tests is part of the release gate | five E2E specs and fuzz suite |
| 15 | Added verify-backup, bench:seed and bench:queries scripts | Ops claims need rerunnable tools | `package.json`, `scripts/verify-backup.sh`, `scripts/bench-queries.mjs` |

## Accepted boundaries

- CSP keeps inline scripts and styles because Next.js emits them. HSTS is added only when `COOKIE_SECURE=true`.
- Direct deployments share one non-spoofable `direct` rate-limit bucket. Enable `TRUST_PROXY_HEADERS=true` only behind a trusted reverse proxy.
- `competition_results`, `team_tasks`, and `team_activity_logs` are schema-only storage in this release. No UI writes them.
- Avatar flows have unit coverage for magic bytes and serving rules. Playwright journeys cover student, teacher, admin, and notification bell flows.

## Wave 2 verification notes

- Unit tests: 135 pass. Playwright: 13 pass. Security fuzz: 7 pass.
- RLS: 0 public tables without FORCE RLS in production.
- Backup verification restored the latest dump into a temporary database and matched row counts, schema fingerprint, and migration ledger.
- Query benchmark: 10 queries, 3 runs on 500 students, 200 competitions, and 100 teams. Median execution 0.02 ms to 2.06 ms. No shared disk reads and no temp reads in the recorded runs. This is a baseline, not a speed comparison.
- Production health reports migration `0014_badges_reports`, `ok=true`, and package version `1.0.0` in `/tmp/competition-hub-wave2/production-final.log`.
- `/showcase`, `/`, `/login`, `/api/health`, and `/api/competitions?status=all` return HTTP 200.
- Fresh Compose boot applied all 13 remaining migrations, returned 200 on `/`, `/login`, `/showcase`, and `/api/health`, and reported memory limits 536870912 bytes for web and 268435456 bytes for db.

## UX/UI Overhaul (Phases U1–U6)

Baseline for visual work: commit `1a536e3`, baseline gate `/tmp/competition-hub-ux/baseline-check.log`.

| Phase | Focus | Status | Evidence |
| --- | --- | --- | --- |
| U1 | Design tokens and full-viewport app shell | VERIFIED | Surface tokens, Thai line-height, collapsible sidebar, h-16 topbar, full-width content shell. Final check and visual audit green. |
| U2 | Competition feed and discovery | VERIFIED | Sticky filter rail, card grid, grid/list toggle, compact discovery bar, mobile filter sheet. Final check and E2E green. |
| U3 | Competition detail and public showcase | VERIFIED | 12-column detail split, sticky action rail, editorial showcase with KPI strip and gallery. Final check and E2E green. |
| U4 | Student workspace | VERIFIED | Team split pane, directory grid, profile and settings subnav. Final check and E2E green. |
| U5 | Teacher studio and admin console | VERIFIED | Edge-to-edge board, master-detail review, KPI bento, sticky table rows, scrollable tabs. Final check and E2E green. |
| U6 | Visual polish and multi-viewport audit | VERIFIED | Skeletons, empty states, 72 visual checks across 12 routes at 1920/1440/390 in light and dark, 13 E2E pass, full local gate green. |

### UX/UI verification notes

- Full local gate: `/tmp/competition-hub-ux/final-check3.log`, all checks passed including integration schema and RLS.
- Remote CI run `44883959997` green at commit `307d686`, 13 Playwright tests passed.
- Playwright: 13 passed in `/tmp/competition-hub-ux/e2e8.log`.
- Visual audit: 72 checks pass in `/tmp/competition-hub-ux/visual-final4.log`. Screenshots in `/tmp/competition-hub-ux/final/visual4`.
- 1920px light shell metric: sidebar 247px, topbar 65px, main starts at 248px, no horizontal overflow. Produced by `scripts/visual-audit.mjs`.
- 390px metric: sidebar hidden, bottom navigation visible, no horizontal overflow.
- Decision trail: `docs/ux-overhaul-decisions.tsv`.

### Before and after

- Before: max-w-7xl topbar-only shell, dense single-column feed, narrow stacked page wrappers.
- After: grouped 248px sidebar, h-16 topbar, 1680px canvas, sticky filter rail, 2–3 column competition grid, 12-column detail split, full-width workspaces, master-detail review, and bento KPIs.
- Thai typography uses 1.65 body line-height and 1.35 heading line-height with a Thai fallback for mono.
- Dev-only React warning about Radix `aria-hidden` hydration attributes is an accepted boundary. CI and all 13 E2E routes pass, and no user-visible failure was observed.

## World-Class Design Overhaul (Phases D1–D6)

Goal: elevate TechComp Hub from commit `2ea7f5d` to world-class visual craft across six phases. Zero backend, schema, migration, or RLS changes. Thai typography and the existing feature set stay intact. Each phase ends with a full verification gate and one clean commit.

| Phase | Focus | Status | Evidence |
| --- | --- | --- | --- |
| D1 | Remove /showcase and establish surface/color/typography tokens | VERIFIED | All gates green; 12 E2E pass; 66 visual checks; commit on branch |
| D2 | Linear-grade app shell: single-line sidebar and quiet topbar | VERIFIED | All gates green; 12 E2E pass; geometry 227/61/228; commit on branch |
| D3 | Flagship discovery page: full-width grid and horizontal filter bar | VERIFIED | All gates green; 12 E2E pass; 72 visual checks; cards above fold; commit on branch |
| D4 | Editorial detail and student workspaces | VERIFIED | All gates green; 12 E2E pass; 72 visual checks; commit on branch |
| D5 | Teacher studio and admin console | VERIFIED | All gates green; 12 E2E pass; 72 visual checks; commit on branch |
| D6 | Motion, dev-warning fixes, visual audit and full gate | NOT STARTED | — |

### Baseline evidence (pre-change, commit `2ea7f5d`)

- `npm run lint` — PASS, 0 errors, 0 warnings.
- `npm run typecheck` — PASS, 0 errors.
- `npm test` — PASS, 135/135 tests, 0 skipped.
- `npm run check:schema` — PASS, `migrations=14 objects=96`.
- `npm run test:integration` — PASS, `tables=36 migrations=14`.

### Environment decision

Local Postgres and Docker were down, so the DB-backed gates could not run from the workstation. An SSH forward `localhost:5432 -> newbie:127.0.0.1:5432` was opened. `check:schema` and `test:integration` then passed against the real migrated schema. No local database, schema, or migration was created or changed.

### Ownership map for D1

- Writer A owns app-shell nav, competition detail page and tabs, the shared OG-meta module split, showcase route deletion, and README/CHANGELOG/AGENTS prose.
- Writer B owns `scripts/visual-audit.mjs`, the E2E spec split and rename, and `docs/ux-overhaul-decisions.tsv`.
- Writer C owns `src/app/globals.css` token values only.
- Root owns `PROGRESS.md`, verification, and the commit.

Writers have disjoint file sets. Shared state is eliminated structurally rather than serialized.

### Tooling gap

`/deslop` from `cursor-team-kit` is not installed in this environment. A manual code-noise pass replaces it before each commit. `unslop` covers prose.

### D1 verification evidence

- `npm run lint` — PASS, 0 errors, 0 warnings.
- `npm run typecheck` — PASS after clearing stale `.next` generated route types that still referenced the deleted page. Source was never at fault.
- `npm test` — PASS, 135/135.
- `npm run check:schema` — PASS, `migrations=14 objects=96`.
- `npm run test:integration` — PASS, `tables=36 migrations=14`.
- `npm run build` — PASS, compiled and 29 static pages generated, no warnings.
- `npm run test:e2e` — PASS, 12/12 including the renamed `.ics` spec `tests/e2e/public-ics-feed.spec.ts`.
- `npm run test:visual` — PASS, 66 checks. Geometry at 1920 light: sidebar 247px, topbar 65px, main left 248px. The 6 removed checks are the `/showcase` assertions across 3 viewports and 2 themes.

### D1 removal scope

- Deleted the `/showcase` route, its OG image, gallery component, and the public-results loader.
- Kept `loadCompetitionOgMeta` by moving it to `src/lib/integrations/competition-og.ts`; the shared `showcase-og.tsx` renderer and the competition detail OG route are untouched.
- Kept the `.ics` feed verbatim. The badge "showcase" feature and migration 0013 DDL are a different feature and were not touched.
- No schema, migration, RLS, or database object changed.

### E2E environment harness

The live database was not used for E2E writes. A throwaway database `tech_competition_hub_e2e` was restored from the live one through `pg_dump`/`pg_restore`, the two E2E accounts and one `E2E Hackathon` seed row were added there, and the local dev server was pointed at it. `E2E_BYPASS_RATE_LIMIT=true` prevented the shared-IP login bucket from causing false failures. A superuser `MIGRATION_DATABASE_URL` was used only for the direct-SQL seeding inside the collaboration and auth-recovery specs. The live app and its data were never modified.

### Dev warning evidence captured for D6

- Hydration mismatch: `data-aria-hidden="true"` / `aria-hidden="true"` on the competition feed filter rail, plus Radix `SwitchBubbleInput` style serialization differences (`caret-color: transparent`, `pointer-events`, margins) on `/profile` and `/settings`.
- Stream error: `Error: The destination stream errored while writing data.` at `GET /api/events/stream`, digest `4196242234`.
- Browser console also reports React dev `eval()` unsupported under the current CSP. This is development-only and does not occur in production.

### D2 verification evidence

- `npm run lint` — PASS, 0 errors, 0 warnings.
- `npm run typecheck` — PASS, 0 errors.
- `npm test` — PASS, 135/135.
- `npm run check:schema` — PASS, `migrations=14 objects=96`.
- `npm run test:integration` — PASS, `tables=36 migrations=14`.
- `npm run build` — PASS, compiled and 29 static pages generated, no warnings.
- `npm run test:visual` — PASS, 66 checks. Geometry at 1920 light: sidebar 227px, topbar 61px, main left 228px. The audit contract was widened from 240–260/62–68/240 to 220–236/56–64/220 to match the new 228/60 targets.
- `npm run test:e2e` — PASS, 12/12.

### D2 shell changes

- Sidebar 228px expanded / 64px collapsed, single-line 36px nav rows, 2px primary active accent bar, quiet 11px section labels, filler box replaced by a collapse toggle and `[` shortcut. The `[` handler ignores typing in inputs, textareas, selects, and contenteditable targets.
- Topbar 60px with `bg-background/80 backdrop-blur-xl`, crisp 9px-radius controls, compact command trigger showing `ค้นหา...` plus a ⌘K chip.
- Exactly one `เพิ่มรายการ` primary CTA remains. The mobile navigation Sheet duplicate and its extra modal mount were deleted; the topbar button is icon-only below `sm` with a fixed accessible name.
- Every E2E-coupled accessible name was preserved, including `ผู้ดูแลระบบ`, `คิวตรวจรายการ`, `ทีมของฉัน`, `การแจ้งเตือน`, the avatar `/บัญชีของ/` pattern, and `เพิ่มรายการ`.

### E2E harness note

A second E2E run initially failed because earlier runs had left team rows in the throwaway DB, so the admin empty state no longer appeared. The isolated DB was recreated, reseeded with the two accounts and one seed competition, and the suite then passed 12/12. No live data was touched.

### D3 verification evidence

- `npm run lint` — PASS, 0 errors, 0 warnings.
- `npm run typecheck` — PASS, 0 errors.
- `npm test` — PASS, 135/135.
- `npm run check:schema` — PASS, `migrations=14 objects=96`.
- `npm run test:integration` — PASS, `tables=36 migrations=14`.
- `npm run build` — PASS, compiled and 29 static pages generated, no warnings.
- `npm run test:e2e` — PASS, 12/12.
- `npm run test:visual` — PASS, 72 checks across 3 viewports and 2 themes.

### D3 discovery rebuild

- Removed the 288px desktop filter rail and the mobile filter Sheet; the canvas is now full width. The filter surface is a two-row horizontal control bar labelled `แถบตัวกรองการแข่งขัน`, with a scrollable category strip and dimmed zero-count categories.
- Deleted the duplicate `+ เพิ่มรายการ` button, its extra modal mount, and the duplicated 14-day 3-card strip. A `ปิดใน 14 วัน` quick-filter pill replaces the strip. The shell remains the single primary CTA source.
- Header is one editorial row with inline KPI pills, a one-line subtitle, and an inline collapsed AI trigger. The first card row is above the fold at 1440×900 and 1920×1080.
- Cards use the 5-element anatomy: category pill plus one countdown, title and date, two-line description, ONE merged tag row capped at 4 chips plus `+N`, and a calm footer. No non-functional bookmark control was added.
- Grid is `grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4`; the view toggles keep their exact `aria-label`s.

### Audit contract change

The sticky-rail assertion was replaced with a horizontal-filter-bar assertion, the grid selector moved from `2xl:grid-cols-3` to `xl:grid-cols-3`, and `/` was added to the authenticated path set so the single-CTA assertion runs against a logged-in context. The audit now also checks filter-bar overflow and that the first card is above the fold. Anonymous `/` has zero add CTAs by design, so the CTA count check is scoped to authenticated contexts.

### Visual spot check

Inspected `.visual-audit/light-1440-home.png` and `.visual-audit/dark-1440-home.png` directly. Both show a single sidebar, full-width canvas, horizontal filters, one unified tag row per card, and the first card row fully visible. No raw hue or ad-hoc shadow styling was introduced.

### D4 verification evidence

- `npm run lint` — PASS, 0 errors, 0 warnings.
- `npm run typecheck` — PASS, 0 errors.
- `npm test` — PASS, 135/135.
- `npm run check:schema` — PASS, `migrations=14 objects=96`.
- `npm run test:integration` — PASS, `tables=36 migrations=14`.
- `npm run build` — PASS, compiled and 29 static pages generated, no warnings.
- `npm run test:e2e` — PASS, 12/12.
- `npm run test:visual` — PASS, 72 checks.

### D4 layout changes

- Detail page: canvas capped at 1480px, 12-column grid kept with the 8/4 audit spans, hero de-shadowed with a specular hairline, horizontal milestone timeline with hairline separators, calm underline tabs labelled `รายละเอียด` / `ผู้สนใจ & หาทีม` / `ถาม-ตอบ`, and a sticky right rail. Added a Google Calendar template link beside the existing `.ics` download.
- `/my-teams`: responsive 1/2/3-column team gallery; `/my-teams/[id]`: gap-8 8/4 split with a calmer right rail and preserved sticky/scroll behavior. Readiness progress bars and all E2E-coupled headings and ARIA labels are unchanged.
- `/people`: gap-6 airy grid with p-6 cards and a ring on avatars; the `2xl:grid-cols-4` audit class and both empty-state strings stay.
- `/profile` and `/settings`: content column now `max-w-3xl space-y-8`, sub-nav narrowed to `lg:w-56`, account sections keep their ids and 4/8 grid.

### Lever

Added a rerunnable throwaway-DB reset at `.e2e-reset.mjs` so each phase can prove the browser gates on clean data without touching the live database. It is a local verification tool, not application code.

### Visual spot check

Inspected `.visual-audit/dark-1440--competitions-*.png`. The detail page shows an editorial hero, horizontal timeline, calm underline tabs, and a crisp sticky rail with both `.ics` and Google Calendar actions.

### D5 verification evidence

- `npm run lint` — PASS, 0 errors, 0 warnings.
- `npm run typecheck` — PASS, 0 errors.
- `npm test` — PASS, 135/135.
- `npm run check:schema` — PASS, `migrations=14 objects=96`.
- `npm run test:integration` — PASS, `tables=36 migrations=14`.
- `npm run build` — PASS, compiled and 29 static pages generated, no warnings.
- `npm run test:e2e` — PASS, 12/12.
- `npm run test:visual` — PASS, 72 checks.

### D5 studio changes

- Team builder board: edge-to-edge full-width workspace, calm drop zones with crisp `isOver` tint, `bg-popover` drag overlay without `shadow-md`, a thin readiness bar driven by the existing `readinessPercent` alongside the untouched numeric badge, and a sticky compact toolbar. No Redo or Publish control was invented because those actions do not exist.
- Review queue: kept the audited `lg:grid-cols-12` 4/8 split, calmer master rows with a clear active highlight, a single sticky detail surface, a de-nested inline edit panel, and a sticky approve/reject footer. All E2E strings and the Scout dialog stay.
- Reports and admin: kept the audited `xl:grid-cols-4` bento and `overflow-x-auto` wrappers, added subtle row hovers and generous table padding, refined tab typography, and kept all E2E strings and print rules.

### Visual spot check

Inspected `.visual-audit/dark-1440-auth--admin.png`. The admin console shows a clean 4-column KPI bento, quiet line tabs, and a hairline table with roomy rows.
