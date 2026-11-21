# PROGRESS

Baseline commit: `fdd8830`
Baseline gate: 37 tests pass, lint/typecheck/build pass, public repo gate pass.
Branch: `main`
Wave 2 code commit: `1c709d9`
Wave 2 code CI run: `44875005294`
Wave 2 final CI run: pending
Final deploy stamp: `20261121T063626Z`
Final production probe: pending
Security fuzz: `/tmp/competition-hub-wave2/fuzz4.log`
Backup verification: `/tmp/competition-hub-wave2/verify-backup3.log`
Query benchmark: `/tmp/competition-hub-wave2/bench-final.log`

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
