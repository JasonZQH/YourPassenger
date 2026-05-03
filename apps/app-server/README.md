# app-server

External HTTP and WebSocket entrypoint for the mobile app.

Ownership:

- public REST API for iOS
- public realtime websocket termination
- auth/profile/session aggregation
- realtime bootstrap and stream forwarding
- thin orchestration for the realtime hot path, delegated to `conversation-service`
- single-call realtime turn persistence delegated to `session-service`
- gRPC client for the `conversation-service` realtime hot path
- forwards session end requests without owning summary generation

Non-ownership:

- source-of-truth profile storage
- source-of-truth session storage
- token issuance

Current surface:

- `POST /v1/auth/apple`
- `POST /v1/auth/guest`
- `GET /v1/me`
- `GET /v1/profile`
- `PUT /v1/profile`
- `POST /v1/sessions`
- `GET /v1/sessions/:id`
- `POST /v1/sessions/:id/end`
- `GET /v1/sessions/:id/summary`
- `GET /v1/health/live`
- `GET /v1/health/ready`
- `GET /v1/realtime?sessionId=<sessionId>` (WebSocket upgrade)
