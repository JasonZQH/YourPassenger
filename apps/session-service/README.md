# session-service

Session lifecycle and persistence service.

Ownership:

- session lifecycle
- session ownership validation
- user and assistant turns
- session summaries
- end-session summary orchestration via `profile-service` and `conversation-service`

Current HTTP surface:

- `POST /v1/sessions`
- `GET /v1/sessions/:id?userId=<userId>`
- `POST /v1/sessions/:id/end`
- `GET /v1/sessions/:id/summary?userId=<userId>`
- `POST /v1/sessions/:id/turns`
- `POST /v1/sessions/:id/realtime-turn`
- `POST /v1/sessions/:id/assistant-state`
- `PUT /v1/sessions/:id/summary`
- `GET /v1/health/live`
- `GET /v1/health/ready`
