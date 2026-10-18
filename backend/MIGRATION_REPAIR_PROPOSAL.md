# Migration Repair Status

## Decision

The migration repair is implemented in `hikari-dev` and validated against two new, loopback-bound, tmpfs-backed PostgreSQL containers. No migration was applied to an existing database, and the original project remains untouched.

## Finding

`0001_initial` imports `app.models` and calls `Base.metadata.create_all()` against the current ORM metadata. The current metadata includes `official_alerts` and `ai_analysis`, although they were introduced after the initial revision. `0007_official_alerts` unconditionally creates `official_alerts`, so a fresh install can fail with a duplicate-table error before reaching `0008_ai_analysis`.

`0008_ai_analysis` conditionally creates `ai_analysis`. For a version-7 database without that table, it should create it. For a fresh database where `0001` already created the table, it skips it. At present, the skip does not validate columns, types, constraints, or indexes, so it can conceal schema drift.

## Implemented Correction

1. **Revision 0007:** creates `official_alerts` only if absent, validates its columns/nullability, primary key, unique report constraint, cascade foreign key, and expected indexes, then fails on incompatible structure.
2. **Revision 0008:** creates `ai_analysis` only if absent and validates columns/nullability, primary key, cascade foreign key, and unique report constraint whether it was created by the initial dynamic metadata or the revision.
3. The ORM property is `analysis_metadata`, mapped to the existing SQL column `metadata`.
4. The pytest fixture requires `TEST_DATABASE_URL`, the explicit disposable opt-in, the exact `hikari_test` database/user, and a matching PostgreSQL cluster system identifier before importing the application database module.

## Migration-History Implications

The `0007` adjustment changes a historical revision and must not be made casually. A database already stamped at version 7 will not rerun `0007`; it will be unaffected by that code change and can proceed to `0008`. A database at version 6, or a fresh install replaying the chain, will execute the guarded `0007` logic. Alembic does not normally checksum revision source, but the change must be documented and reviewed by whoever owns deployed migration history.
The `0007` adjustment changes a historical revision and must not be promoted casually. A database already stamped at version 7 will not rerun `0007`; it proceeds to `0008`. A version-6 upgrade or fresh install executes the guarded `0007` logic. Alembic does not normally checksum revision source, but the change must be documented and reviewed by whoever owns deployed migration history.

The alternative is to make `0001_initial` a frozen baseline that excludes later tables. That is a substantially broader historical rewrite and still needs careful compatibility testing. A new revision after `0007` alone cannot solve the fresh-install failure because execution never reaches it.

## Validation Evidence

 - Fresh chain: all migrations through `0008` applied on the new `hikari_test` container; application schema comparison against ORM metadata returned no differences.
 - Version-7 path: replayed through `0007` with `AIAnalysis` omitted from in-memory metadata, verified `ai_analysis` absent, upgraded through `0008`, then compared the application schema with ORM metadata; no differences.
 - Database safety guard: 8 database-free tests passed; both database-backed paths used a verified PostgreSQL system identifier before DDL.
 - Backend: full suite passed, 83 tests. AI-focused tests passed, 4 tests, including provider-outage fallback and manual-review preservation.
 - Frontend: 19 tests, TypeScript, and production build passed. Full ESLint reports 7 Prettier errors in unchanged `src/features/dashboard/DashboardPage.tsx` and 18 warnings.
 - Workflow: API-driven synthetic submission, private media checks, AI-disabled persistence/readback, analyst/verifier permissions, human decision, and audit history passed. Browser inspection rendered the persisted report and advisory AI state. Browser form entry and decision clicks were not automated because no Playwright/Puppeteer runner or browser text-entry tool is available.
 - Real provider: not tested; the backend provider is disabled and no endpoint/key is configured.

## Current Blocker

No `TEST_DATABASE_URL` or disposable-database opt-in is configured. The local PostgreSQL service is running, but the configured app cluster is shared with existing application databases; local PostgreSQL client utilities were not found. Do not use that cluster to provision or probe a test database without an explicitly approved isolation target. Full backend tests, fresh/version-7 database validation, and browser-to-database acceptance remain blocked.
The two disposable database containers used for validation were stopped after the test run. Promotion remains blocked by the full-lint errors, lack of real-provider validation, incomplete browser-driven submission/decision automation, and absence of a verified backup/maintenance window. Do not apply migrations or copy files into the original project as part of this phase.
