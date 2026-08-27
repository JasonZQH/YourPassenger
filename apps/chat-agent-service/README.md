# chat-agent-service

Ownership:

- joins LiveKit rooms as the assistant participant
- subscribes to user media tracks for the realtime voice path
- emits placeholder room data events while the STT/LLM/TTS pipeline is not wired
- does not own session, profile, summary, or memory truth

Current surface:

- `GET /v1/health/live`
- `GET /v1/health/ready`
- `POST /v1/agents/sessions`

`POST /v1/agents/sessions` is called by `app-server` after a LiveKit session is
created. It is idempotent per room and returns the current agent room status.
