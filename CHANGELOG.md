# Changelog

All notable changes to TechComp Hub are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
Semantic Versioning.

## [1.0.0] - 2026-11-21

Wave 2 expands the verified Phases 1–8 tracker into a collaborative,
AI-assisted platform for Thai schools.

### Added

- Student-led team formation: draft teams, LFG open roles, invitations and join
  requests with transactional team-size enforcement and explainable teammate
  recommendations (`0010_student_teams`).
- AI prep studio: rate-limited OpenTyphoon kickoff roadmaps and pitch rubric
  reviews with input hashing, Thai suggestions and a deliverable vault
  (`0011_prep_studio`).
- Team collaboration: team chat, @mention notifications, weekly check-ins,
  mentor triage and authenticated SSE updates without a new message broker
  (`0012_collab_checkins`).
- Calendar and public integrations: revocable tokenized `.ics` subscriptions
  and smart Discord/LINE/generic webhook routing (`0013_integrations_showcase`).
- Achievement badges, skill evidence counts and academic-year impact reports
  for school leadership (`0014_badges_reports`).
- Installable PWA, safe offline competition reading, mobile bottom navigation
  and a global `Cmd/Ctrl+K` command palette.
- Operational resilience: backup verification, `/admin/ops` telemetry and SQL
  profiling scripts.
- Expanded test pyramid: five additional Playwright specs plus a negative
  security and RLS fuzz suite for the Wave 2 tables and boundaries.
- Release automation: `v*` tags run install, schema/RLS checks, build,
  typecheck, lint, unit tests, E2E and security fuzzing before publishing a
  GitHub Release.

### Changed

- All new tables use `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`
  scoped through `app.current_user_id`; `db/schema.sql` stays in parity with
  migrations `0001` through `0014`.
- Every new mutation keeps Zod validation, Origin/Host CSRF checks,
  role-based authorization, DB-backed rate limits (especially AI routes),
  and audit logging.
- Student-facing copy, dates and countdowns remain Thai-first with Buddhist
  Era display derived from Christian Era storage.

### Security

- Cross-user reads and writes are denied on student-team, prep-studio,
  collaboration, calendar, webhook and badge tables.
- AI and webhook boundaries reject private, loopback, link-local and
  credential-bearing URLs.
- Revoked `jti` sessions and missing or mismatched `Origin` headers are
  rejected in dedicated fuzz tests.

## [0.1.0] - 2026-11-21

First verified release: Phases 1–8.

### Added

- PostgreSQL 16 schema with strict row-level security and checksummed
  migrations.
- Self-hosted scrypt authentication, HTTP-only JWT sessions, SMTP outbox,
  session revocation and admin bootstrap rules.
- Competition feed, Thai date utilities, skill matching, Smart Add and Auto
  Scout with OpenTyphoon extraction and web-search discovery.
- Teacher review queue, team builder, notifications, avatars, admin dashboard,
  settings and dark mode.
- CI with schema parity, RLS integration probe, unit tests, lint, typecheck,
  build, public-repo audit and three role-based Playwright journeys.
