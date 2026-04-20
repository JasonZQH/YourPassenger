# Database Creation and Update Playbook (Prisma + PostgreSQL)

## Goal

This document defines the current database workflow for this project across:

- local development
- branch collaboration and merge
- CI checks
- production deployment
- future scaling and reliability evolution

It is based on the current backend implementation: NestJS modules, PostgreSQL as the source of truth, Prisma for data access and migrations, and `@nestjs/config` for runtime environment loading.

## Scope

This playbook applies to:

- schema definition in `backend/prisma/schema.prisma`
- migration files in `backend/prisma/migrations/*`
- local environment files in `backend/.env` and `backend/.env.local`

This playbook does not include:

- analytics warehouse design
- vector DB / retrieval memory design

## Current Repo Facts

- Prisma reads the datasource URL from `DATABASE_URL`.
- Nest loads `.env.local` and `.env` through `@nestjs/config`.
- `DATABASE_URL_TEST` exists in `.env.example` as a reserved value for future test tooling, but the current Prisma schema does not read it directly.
- To point Prisma at a different database today, override `DATABASE_URL` for that command.

## Core Principles

1. PostgreSQL is the primary source of truth for product data.
2. Prisma schema and migrations are versioned code artifacts.
3. Every engineer should use an isolated development database.
4. Automated tests must never share the development database.
5. Production should run `prisma migrate deploy`, never `prisma migrate dev`.
6. Prefer expand-contract migrations for zero-downtime releases.

## Environment Strategy

| Environment | DB Isolation | Source of Env Values | Migration Command | Reset Policy |
| --- | --- | --- | --- | --- |
| `dev` | per developer database | `.env.local` or `.env` | `npm run prisma:migrate:dev -- --name <change>` | optional manual reset |
| `test` | per developer or ephemeral CI database | exported `DATABASE_URL` for the command or future dedicated env file | `npm run prisma:migrate:deploy` | reset before test suite |
| `prod` | shared production cluster | platform-injected env vars | `npm run prisma:migrate:deploy` | never reset |

Recommended naming:

- `yourpassenger_dev_<username>`
- `yourpassenger_test_<username>`
- `yourpassenger_prod`

## One-Time Local Setup

1. Install backend dependencies.
2. Copy `backend/.env.example` to `backend/.env` or create a private `backend/.env.local`.
3. Fill in `DATABASE_URL` and `AUTH_TOKEN_SECRET` with local values.
4. Generate the Prisma client.
5. Apply migrations.
6. Start the backend.

Example commands:

```bash
cd backend
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate:dev -- --name init
npm run start:dev
```

Notes:

- `npm run prisma:migrate:dev -- --name init` is only for a fresh local database. For later changes, replace `init` with the actual migration name.
- Prefer `.env.local` for machine-specific overrides that should never be committed.

## Day-to-Day Schema Update Workflow

```text
+--------------------------+
| Create feature branch    |
+--------------------------+
            |
            v
+-------------------------------+
| Edit prisma/schema.prisma     |
+-------------------------------+
            |
            v
+-----------------------------------------------+
| Run prisma migrate dev --name <change_name>   |
+-----------------------------------------------+
            |
            v
+--------------------------+
| Run app and verification |
+--------------------------+
            |
            v
+-----------------------------------+
| Commit schema + migration files   |
+-----------------------------------+
            |
            v
+------------------+
| Open PR          |
+------------------+
            |
            v
+-----------------------------------+
| CI validate + migration checks    |
+-----------------------------------+
            |
           yes
            |
            v
+------------------+
| Merge            |
+------------------+
            |
            v
+------------------+
| Release pipeline |
+------------------+
            |
            v
+------------------------------+
| Run prisma migrate deploy    |
+------------------------------+
            |
            v
+------------------+
| Rollout app      |
+------------------+
```

The repo-level command form should be:

```bash
cd backend
npm run prisma:migrate:dev -- --name <change_name>
```

## Branch Merge and Migration Conflict Rules

1. Never modify committed historical migration files.
2. If `schema.prisma` conflicts, resolve the schema first.
3. After rebase or merge, generate a new reconciliation migration if needed.
4. Commit both schema and the new migration in the same PR.

Example reconciliation command:

```bash
cd backend
npm run prisma:migrate:dev -- --name reconcile_after_rebase
```

## Local Startup and Test Data Isolation

To avoid polluting development data with test payloads:

1. run the app locally against `DATABASE_URL`
2. use a separate database for tests
3. reset the test DB before each full test run
4. never point normal app runtime at the test DB

Today, because Prisma only reads `DATABASE_URL`, a test-db command should override that value explicitly.

Example:

```bash
cd backend
DATABASE_URL="postgresql://db_user:db_password@localhost:5432/yourpassenger_test?schema=public" \
  npm run prisma:migrate:deploy
```

The same pattern applies to `prisma migrate reset`, `prisma db push`, or other one-off Prisma commands.

## Current CI-Friendly Checks

These checks match the current repo state:

```bash
cd backend
npx prisma validate
npx prisma format --check
npx prisma migrate status
npm run typecheck
npm run build
```

## Production Release Workflow

Use a dedicated migration step before app rollout.

```text
+---------------+      +------------------------+      +---------------------------+
| Build image   | ---> | Deploy Migration Job   | ---> | migrate deploy success ? |
+---------------+      +------------------------+      +---------------------------+
                                                             | yes            | no
                                                             v                v
                                             +----------------------------+   +---------------------------+
                                             | Rollout Backend Deployment |   | Stop release and alert    |
                                             +----------------------------+   +---------------------------+
                                                            |
                                                            v
                                             +----------------------------+
                                             | Post-deploy health checks |
                                             +----------------------------+
```

Operational rules:

1. migration job image version must match app image version
2. migration job must be idempotent (`prisma migrate deploy`)
3. app deployment proceeds only after migration success
4. failed migration blocks rollout

## Zero-Downtime Migration Pattern (Expand-Contract)

When changing critical fields:

1. Expand: add new nullable column, table, or index.
2. Dual write: app writes old and new shapes.
3. Backfill: migrate historical rows in batches.
4. Cutover: app reads the new shape only.
5. Contract: remove old shape in a later release.

Avoid destructive one-step schema changes on hot paths.

## Rollback and Recovery Strategy

1. Prefer forward-fix over rollback migration scripts.
2. Keep regular Postgres backups and a tested restore procedure.
3. Define RPO/RTO targets per environment.
4. For a failed production release:
   - stop rollout
   - assess migration impact
   - apply a forward-fix migration or restore per runbook

## Future Considerations

### Service extraction readiness

- the current monolith can keep one primary Postgres
- when splitting ASR, LLM, or TTS services, keep session and profile ownership clear
- consider an `outbox_events` table for reliable event publishing to NATS or Kafka

### Realtime scale

- `sessions` and `session_turns` will grow quickly
- keep indexes on `(session_id, created_at)` and `(user_id, started_at)`
- consider table partitioning for `session_turns` at higher volume

### Data lifecycle and cost

- define retention policy for raw turns and summaries
- move long-term analytics out of OLTP Postgres into a warehouse pipeline

### Privacy and compliance

- classify PII fields early
- keep raw conversation retention explicit and reviewable
