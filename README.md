# YourPassenger

AI passenger MVP with an iOS client and a split local service stack.

## Current Architecture

```text
iOS Simulator
  |
  | HTTP / WebSocket
  v
app-server (:3000)
  |
  +--> auth-service (:3101)
  +--> profile-service (:3102)
  +--> session-service (:3103)
  +--> conversation-service (:3104 HTTP, :5104 gRPC)

PostgreSQL (:5432)
  |
  +--> yourpassenger_auth
  +--> yourpassenger_profile
  +--> yourpassenger_session
```

Service roles:

- `app-server`: public REST + WebSocket entrypoint used by the iOS client
- `auth-service`: Apple/Guest sign-in and token validation
- `profile-service`: profile and onboarding source of truth
- `session-service`: sessions, turns, assistant state, summaries, and end-session summary orchestration
- `conversation-service`: reply and summary orchestration, plus gRPC realtime hot path

## Repository Layout

```text
apps/
  app-server/
  auth-service/
  profile-service/
  session-service/
  conversation-service/
packages/
  contracts/
  platform/
ios/
docs/
scripts/local/
docker-compose.local.yml
Makefile
```

## Quick Start

Prerequisites:

- Node.js / npm
- Reachable PostgreSQL for default host mode
- Docker with Compose for `DOCKER=1` mode
- Xcode for the iOS client
- `curl`

Start the local stack:

```bash
npm install
cp .env.example .env.local
make local-up
```

Start the local stack while skipping selected services:

```bash
make local-up SKIP=conversation-service,app-server
```

Start the full containerized stack:

```bash
make local-up DOCKER=1
```

Run the iOS client:

1. Open `ios/PassengerApp/PassengerClient/PassengerClient.xcodeproj`
2. Select the `PassengerClient` scheme
3. Run on an iOS Simulator

Stop and clean:

```bash
make local-down
make local-down DOCKER=1
make local-clean
make db-up
make db-down
```

Notes:

- The iOS client currently targets `http://localhost:3000/v1`, which is correct for Simulator.
- `Continue with Apple` currently uses a stable local mock identity token, not the system Apple Sign In sheet.
- `make local-up` is the default host mode: it uses the configured local PostgreSQL, runs Prisma generate + migrate deploy on the host, waits for readiness, then stays attached and streams each service's live logs in the current terminal.
- After startup/runtime or transport changes, prefer `make local-clean` before `make local-up` for deterministic verification.
- `make local-up` starts services in layers: `auth/profile/session/conversation` first, then `app-server`.
- `SKIP=service-a,service-b` skips selected services during startup. If you skip any downstream dependency, skip `app-server` as well.
- `make local-up DOCKER=1` runs PostgreSQL and all services in Docker Compose, auto-selects a free PostgreSQL host port when needed, then attaches to container logs.
- The realtime hot path now uses `app-server -> conversation-service` over gRPC; the rest of the internal service calls remain HTTP.
- `make db-up` / `make db-down` manage only the local Docker PostgreSQL instance.
- Stop either mode from the same terminal with `Ctrl+C`.
- Each `local-up` run also archives service logs under `.local/<timestamp>_logs/service.log`.
- Each `local-up` run also writes a root-level migration aggregate log at `.local/<timestamp>_logs/migrations.log`.
- `make local-clean` in host mode does not touch external PostgreSQL data.
- `make local-clean DOCKER=1` removes the local Docker PostgreSQL volume and resets Docker-managed database state.
- Host mode assumes `AUTH_DATABASE_URL`, `PROFILE_DATABASE_URL`, and `SESSION_DATABASE_URL` point to existing databases. The supported setup is to copy [`.env.example`](/Users/mydev/Desktop/YourPassenger/.env.example) to `.env.local` and fill in the required values there, including `AUTH_TOKEN_SECRET`.
- Host mode defaults to `localhost:5432`. `DOCKER_POSTGRES_PORT` is only relevant for `DOCKER=1` mode.

## Default Ports

- `app-server`: `3000`
- `auth-service`: `3101`
- `profile-service`: `3102`
- `session-service`: `3103`
- `conversation-service`: `3104`
- `conversation-service gRPC`: `5104`
- `postgres`: `DOCKER_POSTGRES_PORT` on the host, `5432` inside Docker

## Core Commands

- `make local-up`: host mode, using the configured local PostgreSQL
- `make local-up SKIP=...`: host mode, skipping selected services
- `make local-up DOCKER=1`: full Docker Compose mode for PostgreSQL and all services
- `make local-down`: stop host-mode services
- `make local-down DOCKER=1`: stop the Docker Compose stack
- `make db-up`: start Docker PostgreSQL only
- `make db-down`: stop Docker PostgreSQL only
- `make local-clean`: stop the local runtime and clear archived logs/build artifacts; in `DOCKER=1` mode it also removes Docker volumes

## Documentation

- [Second-Drive Sprint](docs/second-drive-sprint.md)
- [Local development and microservice workflow](docs/local-development-and-microservice-workflow.md)
- [MVP pages and public API contract](docs/mvp-pages-and-apis.md)
- [Database creation and update playbook](docs/database-creation-and-update.md)
- [iOS client notes](docs/ios-client-skeleton.md)
- [PassengerClient app notes](ios/PassengerApp/README.md)
