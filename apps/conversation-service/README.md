# conversation-service

Realtime conversation orchestration service.

Ownership:

- prompt assembly
- conversation orchestration
- future ASR / LLM / TTS adapters
- low-latency reply generation
- summary generation consumed by `session-service`

Current HTTP surface:

- `POST /v1/conversation/reply`
- `POST /v1/conversation/realtime-turn`
- `POST /v1/conversation/summary`
- `GET /v1/health/live`
- `GET /v1/health/ready`

Current gRPC surface:

- `ConversationHotPathService/BuildRealtimeTurn`

This service should keep the realtime hot path narrow and avoid extra synchronous fan-out.
