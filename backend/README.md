# Backend Skeleton

This directory contains the minimal NestJS backend skeleton for the AI Passenger MVP.

## Scope

- `POST /v1/auth/apple`
- `POST /v1/auth/guest`
- `GET /v1/me`
- `GET /v1/profile`
- `PUT /v1/profile`
- `POST /v1/sessions`
- `GET /v1/sessions/:id`
- `POST /v1/sessions/:id/end`
- `GET /v1/sessions/:id/summary`
- `GET /v1/health`
- realtime gateway skeleton at `/v1/realtime`

## Notes

- This version uses in-memory state only.
- There is no real auth, persistence, ASR, TTS, or database layer yet.
- The realtime server is a raw WebSocket mock conversation path to support client integration before the full agentic chain exists.

## Run

```bash
cd backend
npm install
npm run start:dev
```

Default base URL:

```text
http://localhost:3000/v1
```

Realtime WebSocket:

```text
ws://localhost:3000/v1/realtime?sessionId=<session-id>
```
