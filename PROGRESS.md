# PROGRESS

Baseline commit: `fdd8830`
Baseline gate: 37 tests pass, lint/typecheck/build pass, public repo gate pass.
Branch: `main`

## Phase status

| Phase | Focus | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Security, observability, hardening | VERIFIED | 41 tests pass; DB-backed rate limits; headers; CSRF; logger; deep health; magic bytes |
| 2 | Database evolution, migration engine | IMPLEMENTED | deterministic runner + 2 numbered migrations; deploy switched; fresh parity pending deploy |
| 3 | Auth, SMTP, admin RBAC | PENDING | |
| 4 | Scout engine, AI extraction v2 | PENDING | |
| 5 | Discovery, matching, student workspace | PENDING | |
| 6 | Teacher ops, team builder, analytics | PENDING | |
| 7 | Notifications, media, UX polish | PENDING | |
| 8 | Tests, CI/CD, production docs | PENDING | |

## Decision trail

| Phase | Decision | Reason | Evidence |
| --- | --- | --- | --- |
| 0 | Use existing commit as baseline and audit all 8 phases before coding | Need quantified scope and risk before a long run | `/tmp/competition-hub-master/baseline.log` |
| 1 | Keep one DB-backed limiter instead of two | Removes process-local state and preserves one boundary | atomic fixed-window upsert in `src/lib/auth/rate-limit.ts` |
| 1 | Enforce CSRF centrally in proxy | Avoids editing 15 route handlers with the same guard | `src/proxy.ts` mutation origin check |
| 1 | Keep `public/.gitkeep` | Fresh Docker build needs the directory in git | Phase 8 audit blocker |
| 2 | Replace monolithic SQL with checksummed migrations | Two sources of truth caused drift | `scripts/migrate.mjs`, `db/migrations/0001_baseline.sql`, `0002_search_indexes.sql` |
| 2 | Keep `schema.sql` as fresh-boot snapshot | Fresh Docker still needs one clean bootstrap file | `db/schema.sql` updated with ledger and trgm indexes | | Fresh Docker build needs the directory in git | Phase 8 audit blocker |
