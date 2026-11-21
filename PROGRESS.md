# PROGRESS

Baseline commit: `fdd8830`
Baseline gate: 37 tests pass, lint/typecheck/build pass, public repo gate pass.
Branch: `main`

## Phase status

| Phase | Focus | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Security, observability, hardening | VERIFIED | 41 tests pass; DB-backed rate limits; headers; CSRF; logger; deep health; magic bytes |
| 2 | Database evolution, migration engine | IMPLEMENTED | deterministic runner + 2 numbered migrations; deploy switched; fresh parity pending deploy |
| 3 | Auth, SMTP, admin RBAC | IMPLEMENTED | jti sessions, outbox cron, admin ops; SMTP env required for delivery |
| 4 | Scout engine, AI extraction v2 | IMPLEMENTED | Retry, dedupe, common web search boundary, Thai scout queries, 77 tests pass |
| 5 | Discovery, matching, student workspace | IMPLEMENTED | AI ranking guardrails, skill match, bookmarks and comments APIs |
| 6 | Teacher ops, team builder, analytics | IMPLEMENTED | Team optimizer wired into candidate selection, migration 0006 |
| 7 | Notifications, media, UX polish | IMPLEMENTED | Notification bell, reminders cron, migration 0007 |
| 8 | Tests, CI/CD, production docs | IMPLEMENTED | CI workflow, Playwright journeys, integration schema check |

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
