# Database Creation and Update Playbook

## Goal

This document defines the current database workflow for the split local service architecture.

It covers:

- local development
- schema changes per service
- migration ownership
- deploy-safe migration rules
- branch and CI expectations

It does not cover:

- analytics warehouse design
- vector DB / retrieval memory design
- long-term multi-region data topology

## Current Database Topology

The project currently uses one local PostgreSQL instance with three service-owned logical databases.

| Service | Env Var | Default Local DB | Prisma Schema Path | Owns |
| --- | --- | --- | --- | --- |
| `auth-service` | `AUTH_DATABASE_URL` | `yourpassenger_auth` | `apps/auth-service/prisma/schema.prisma` | auth identities |
| `profile-service` | `PROFILE_DATABASE_URL` | `yourpassenger_profile` | `apps/profile-service/prisma/schema.prisma` | user profiles |
| `session-service` | `SESSION_DATABASE_URL` | `yourpassenger_session` | `apps/session-service/prisma/schema.prisma` | sessions, turns, summaries |
| `conversation-service` | n/a | n/a | n/a | no persistent DB yet |
| `app-server` | n/a | n/a | n/a | no persistent DB |

Current rule:

- one service owns one schema definition and one migration history
- no service reaches into another service's tables
- no shared `db-manager` service exists

## Core Principles

1. PostgreSQL is the source of truth for product data.
2. Prisma schema and migrations are versioned code artifacts.
3. Migration ownership stays inside the service that owns the data.
4. `local-up` uses `prisma migrate deploy`, not `prisma migrate dev`.
5. Schema generation and migration are explicit orchestration steps, not `start` side effects.
6. Prefer expand-contract migrations for any non-trivial production change.

## Local Development Workflow

### Standard Startup

Normal local startup is handled by:

```bash
make local-up
```

That flow currently does the following:

1. in default host mode, reads service DB URLs from root `.env.local`
2. in `DOCKER=1` mode, starts local PostgreSQL via `docker-compose.local.yml`
3. waits for Postgres readiness
4. in `DOCKER=1` mode, creates the three service databases if needed
5. runs Prisma client generation for `auth/profile/session`
6. runs `prisma migrate deploy` for `auth/profile/session`
7. starts all services
8. waits for `/v1/health/ready`

This means local services should always see a database that is already migrated to the current code version.

### Day-to-Day Schema Change Workflow

When changing a schema, work service-by-service.

Example for `session-service`:

```bash
npm run prisma:migrate:dev -w @yourpassenger/session-service -- --name add_turn_metadata
npm run prisma:generate -w @yourpassenger/session-service
npm run typecheck -w @yourpassenger/session-service
npm run build -w @yourpassenger/session-service
```

Equivalent commands exist for `auth-service` and `profile-service`.

Rules:

- edit only the schema for the owning service
- generate a migration in that same service
- commit schema and migration together
- do not modify historical committed migration files

## Migration Ownership Rules

### `auth-service`

Owns:

- auth identity records
- provider user IDs
- token-related identity lookup data

Must not own:

- profile fields
- session data
- conversation summaries

### `profile-service`

Owns:

- nickname
- onboarding fields
- conversation preferences
- profile completeness truth

Must not own:

- auth provider mappings
- session lifecycle
- turns or summaries

### `session-service`

Owns:

- session lifecycle
- ownership checks
- user/assistant turns
- assistant state
- summaries

Must not own:

- auth identities
- profile preference truth

## Branch and Merge Rules

1. Never edit committed historical migration files.
2. Resolve schema conflicts first, then generate a new reconciliation migration if needed.
3. Commit schema changes and migration files in the same PR.
4. If two branches change the same service schema, the merged branch must generate a new migration for the resolved state.

Example reconciliation command:

```bash
npm run prisma:migrate:dev -w @yourpassenger/session-service -- --name reconcile_after_rebase
```

## CI and Local Checks

Minimum checks for any DB-affecting change:

```bash
npm run prisma:generate -w @yourpassenger/auth-service
npm run prisma:generate -w @yourpassenger/profile-service
npm run prisma:generate -w @yourpassenger/session-service
npm run typecheck
npm run build
```

Recommended future CI additions:

- `prisma validate` per service
- migration apply on a fresh temporary Postgres instance
- service-specific tests against isolated databases

## Production / Deployment Rules

1. Production must only run `prisma migrate deploy`.
2. Migration execution should happen in a dedicated migration job or pre-deploy step.
3. App rollout should happen only after migration success.
4. Failed migration blocks rollout.
5. Forward-fix is preferred over rollback migration editing.

## Zero-Downtime Guidance

For non-trivial changes, use expand-contract:

1. expand: add the new column / table / index
2. dual write if needed
3. backfill historical data
4. switch reads to the new shape
5. contract: remove the old shape later

Do not compress destructive changes into one release unless the data is disposable.

## Current Initial Migration Layout

The repository now contains initial migrations for:

- `apps/auth-service/prisma/migrations/20260420193000_init`
- `apps/profile-service/prisma/migrations/20260420193000_init`
- `apps/session-service/prisma/migrations/20260420193000_init`

These are the baseline migrations that `make local-up` deploys.

## Practical Rules To Keep

- `local-clean` never deletes database data
- `local-down` never removes Docker volumes by default
- if you need a full reset later, add a separate `local-reset` command
- if a migration makes old data invalid, fix the migration design instead of hiding the problem with implicit DB resets
