# Database Creation and Update Playbook (Prisma + PostgreSQL)

## Goal

This document defines a practical database workflow for this project across:

- local development
- branch collaboration and merge
- CI checks
- Kubernetes deployment
- future scaling and reliability evolution

It is based on the current backend direction: NestJS service modules, PostgreSQL as the source of truth, and Prisma for data access and migration management.

## Scope

This playbook applies to:

- schema definition and evolution in `prisma/schema.prisma`
- migration files in `prisma/migrations/*`
- environment isolation for `dev`, `test`, `prod`

This playbook does not include:

- analytics warehouse design
- vector DB / retrieval memory design

## Core Principles

1. PostgreSQL is the primary source of truth for product data.
2. Prisma schema and migrations are first-class code artifacts and must be versioned.
3. Every engineer uses an isolated development database.
4. Automated tests must never share the development database.
5. Production only runs `prisma migrate deploy`, never `prisma migrate dev`.
6. Prefer expand-contract migrations for zero-downtime releases.

## Environment Strategy

| Environment | DB Isolation | Migration Command | Reset Policy |
| --- | --- | --- | --- |
| `dev` | per developer database | `prisma migrate dev` | optional manual reset |
| `test` | per developer or ephemeral CI database | `prisma migrate deploy` (or reset + deploy) | reset before test suite |
| `prod` | shared production cluster | `prisma migrate deploy` | never reset |

Recommended naming:

- `yourpassenger_dev_<username>`
- `yourpassenger_test_<username>`
- `yourpassenger_prod`

## One-Time Setup

1. Install dependencies.
2. Initialize Prisma with PostgreSQL.
3. Create isolated local databases.
4. Configure `.env` and `.env.test`.
5. Run first migration.

Example commands:

```bash
cd backend
npm i @prisma/client
npm i -D prisma dotenv-cli
npx prisma init --datasource-provider postgresql
npx prisma migrate dev --name init
```

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
| Run tests and local app |
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
            v
      +-----------+
      | pass ?    |
      +-----------+
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

## Branch Merge and Migration Conflict Rules

1. Never modify committed historical migration files.
2. If `schema.prisma` conflicts, resolve schema first.
3. After rebase/merge, generate a new reconciliation migration if needed.
4. Commit both schema and newly generated migration in the same PR.

Example reconciliation command:

```bash
npx prisma migrate dev --name reconcile_after_rebase
```

## Local Startup and Test Data Isolation

To avoid polluting development data with test login/session payloads:

1. run app locally against `DATABASE_URL` (dev DB)
2. run tests against `DATABASE_URL_TEST` (test DB)
3. reset test DB before each test run or test suite
4. do not point local app runtime to test DB

Recommended test reset command:

```bash
dotenv -e .env.test -- npx prisma migrate reset --force --skip-seed
```

## Makefile / CI Checks

Use these checks as required CI gates:

```makefile
prisma-validate:
	npx prisma validate
	npx prisma format --check

migration-status:
	npx prisma migrate status

migration-diff-check:
	npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --exit-code

test-db-prepare:
	dotenv -e .env.test -- npx prisma migrate reset --force --skip-seed
	dotenv -e .env.test -- npx prisma migrate deploy
```

Recommended CI behavior:

1. run `prisma-validate`
2. run `migration-status`
3. run `migration-diff-check`
4. run migration apply on a clean temporary DB
5. run backend tests

## Kubernetes Release Workflow

Use a dedicated migration job before app rollout.

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
3. app deployment proceeds only after migration job success
4. failed migration blocks rollout

## Zero-Downtime Migration Pattern (Expand-Contract)

When changing critical fields:

1. Expand: add new nullable column/table/index.
2. Dual write: app writes old + new shape.
3. Backfill: migrate historical rows in batches.
4. Cutover: app reads new shape only.
5. Contract: remove old shape in a later release.

Avoid destructive one-step schema changes on hot paths.

## Rollback and Recovery Strategy

1. Prefer forward-fix over rollback migration scripts.
2. Keep regular Postgres backups and tested restore procedure.
3. Define RPO/RTO targets per environment.
4. For failed production release:
   1. stop rollout
   2. assess migration impact
   3. apply forward-fix migration or restore per runbook

## Future Considerations and Analysis

### 1) Service extraction readiness

- current monolith can keep one primary Postgres
- when splitting ASR/LLM/TTS services, keep session/profile ownership clear
- consider `outbox_events` table for reliable event publishing to NATS/Kafka

### 2) Realtime scale

- `sessions` and `session_turns` will grow fast
- add indexes by `(session_id, created_at)` and `(user_id, started_at)`
- for heavy volume, consider table partitioning by time for `session_turns`

### 3) Data lifecycle and cost

- define retention policy for raw turns and summaries
- move long-term analytics out of OLTP Postgres into warehouse pipeline

### 4) Privacy and compliance

- classify PII fields early
- apply encryption at rest + TLS in transit
- define deletion/anonymization workflow for user data requests

### 5) Observability

- track migration duration/failures
- track DB connection pool saturation and slow queries
- add release annotation linking app version to migration version

## Release Checklist

1. schema change reviewed
2. migration generated and committed
3. CI migration checks passed
4. migration tested on clean DB
5. K8s migration job configured
6. rollback/recovery path confirmed
