# AI Passenger MVP Pages and Public API Contract

## Goal

This document defines the current MVP slice for the AI Passenger app:

- Swift iOS client running in Simulator
- `app-server` as the public REST + WebSocket entrypoint
- internal `auth/profile/session/conversation` services behind `app-server`
- manual start and manual end for a conversation session
- real-time chat over WebSocket with a narrow hot path

The MVP still does not include:

- Bluetooth detection
- auto-start driving detection
- auto-end driving detection
- CarPlay integration
- real microphone / ASR / TTS pipeline

## Runtime Architecture

```text
+----------------------+
| iOS Simulator Client |
+----------------------+
          |
          | HTTP: /v1/auth/*, /v1/me, /v1/profile, /v1/sessions/*
          | WebSocket: /v1/realtime?sessionId=...
          v
+---------------------------------------------------------------------------------+
|                                   app-server                                    |
|                                 public REST + WS                                |
+---------------------------------------------------------------------------------+
   | HTTP              | HTTP                | HTTP                | gRPC
   v                   v                     v                     v
+--------------+  +----------------+  +----------------+  +----------------------+
| auth-service |  | profile-service|  | session-service|  | conversation-service |
+--------------+  +----------------+  +----------------+  +----------------------+
       |                  |                     |                    |
       |                  |                     |                    +--> realtime turn generation
       |                  |                     |                    +--> reply generation
       |                  |                     |                    +--> summary generation
       v                  v                     v
+-------------+   +---------------+    +---------------+
| auth Postgres|   |profile Postgres|   |session Postgres|
+-------------+   +---------------+    +---------------+

Session end path:

+----------------------+      +----------------------+      +----------------------+
| iOS Simulator Client | ---> |      app-server      | ---> |    session-service   |
+----------------------+      +----------------------+      +----------------------+
                                                                  |            |
                                                                  | HTTP       | HTTP
                                                                  v            v
                                                       +----------------+  +----------------------+
                                                       | profile-service|  | conversation-service |
                                                       +----------------+  +----------------------+
                                                                  \            /
                                                                   \          /
                                                                    v        v
                                                             +----------------------+
                                                             |   session Postgres   |
                                                             +----------------------+

Realtime hot path:

+----------------------+      +----------------------+      +----------------------+
| iOS Simulator Client | ---> |      app-server      | ---> | conversation-service |
+----------------------+  WS  +----------------------+ gRPC +----------------------+
                                   |
                                   | HTTP commit completed turn
                                   v
                         +----------------------+
                         |    session-service   |
                         +----------------------+
                                   |
                                   v
                         +----------------------+
                         |   session Postgres   |
                         +----------------------+
```

Responsibilities:

- `app-server`: public contract, auth enforcement, aggregation, websocket termination
- `auth-service`: sign-in and token validation
- `profile-service`: profile truth
- `session-service`: session / turns / summaries truth, plus end-session summary orchestration
- `conversation-service`: reply and summary generation logic, plus gRPC realtime turn generation

## MVP User Flow

1. User signs in.
2. User completes onboarding if no profile exists.
3. User lands on home.
4. User taps `Start Chat`.
5. App creates a session.
6. App connects websocket to `/v1/realtime`.
7. User sends a text-backed `audio.commit` event.
8. App receives transcript + assistant state + assistant text/audio events.
9. User taps `End`.
10. App fetches the session summary.

## iOS Screen Stack

1. `AuthView`
2. `OnboardingView`
3. `PassengerNamingView`
4. `HomeView`
5. `ProfileView`
6. `LiveChatView`
7. `SessionSummaryView`

## Public API Surface

All public routes are served by `app-server`.

### Auth

#### `POST /v1/auth/apple`

Request:

```json
{
  "identityToken": "apple-or-local-dev-token"
}
```

Response:

```json
{
  "accessToken": "token",
  "refreshToken": "token",
  "user": {
    "id": "usr_123",
    "nickname": "Rider",
    "profileCompleted": false
  }
}
```

#### `POST /v1/auth/guest`

Response:

```json
{
  "accessToken": "token",
  "refreshToken": "token",
  "user": {
    "id": "usr_123",
    "nickname": "Guest",
    "profileCompleted": false
  }
}
```

#### `GET /v1/me`

Response:

```json
{
  "id": "usr_123",
  "nickname": "Rider",
  "profileCompleted": true
}
```

### Profile

#### `GET /v1/profile`

Response when profile exists:

```json
{
  "userId": "usr_123",
  "nickname": "Rider",
  "interests": ["technology"],
  "ageRange": "25_34",
  "gender": "prefer_not_to_say",
  "occupationCategory": "tech",
  "hobbyTags": ["design"],
  "preferredLanguage": "en",
  "conversationStyle": "curious",
  "responseLength": "short",
  "proactiveTopicPushing": true,
  "avoidTopicTags": ["politics"],
  "updatedAt": "2026-04-20T00:00:00.000Z"
}
```

If profile does not exist yet, the current implementation may return `null` or an empty body.

#### `PUT /v1/profile`

Request:

```json
{
  "nickname": "Rider",
  "interests": ["technology"],
  "ageRange": "25_34",
  "gender": "prefer_not_to_say",
  "occupationCategory": "tech",
  "hobbyTags": ["design"],
  "preferredLanguage": "en",
  "conversationStyle": "curious",
  "responseLength": "short",
  "proactiveTopicPushing": true,
  "avoidTopicTags": ["politics"]
}
```

Response:

```json
{
  "success": true,
  "profileCompleted": true
}
```

### Sessions

#### `POST /v1/sessions`

Request:

```json
{
  "source": "manual_start"
}
```

Response:

```json
{
  "session": {
    "id": "ses_123",
    "status": "active",
    "startedAt": "2026-04-20T00:00:00.000Z"
  },
  "realtime": {
    "transport": "websocket",
    "wsUrl": "ws://localhost:3000/v1/realtime?sessionId=ses_123",
    "token": "token"
  }
}
```

If `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` are configured on
`app-server`, the realtime payload switches to LiveKit:

```json
{
  "session": {
    "id": "ses_123",
    "status": "active",
    "startedAt": "2026-04-20T00:00:00.000Z"
  },
  "realtime": {
    "transport": "livekit",
    "livekitUrl": "wss://your-livekit-host",
    "roomName": "yp_ses_ses_123",
    "participantToken": "scoped-livekit-jwt"
  }
}
```

The WebSocket response remains the local fallback and debug transport.
When the LiveKit response is used, `app-server` also dispatches
`chat-agent-service` to join the same room as `agent_<sessionId>`.

#### `GET /v1/sessions/:id`

Response:

```json
{
  "id": "ses_123",
  "status": "active",
  "startedAt": "2026-04-20T00:00:00.000Z",
  "latestAssistantState": "idle"
}
```

#### `POST /v1/sessions/:id/end`

Request:

```json
{
  "reason": "manual_end"
}
```

Response:

```json
{
  "id": "ses_123",
  "status": "ended",
  "endedAt": "2026-04-20T00:10:00.000Z"
}
```

#### `GET /v1/sessions/:id/summary`

Response:

```json
{
  "sessionId": "ses_123",
  "durationSeconds": 600,
  "summary": "You talked about travel and technology.",
  "topics": ["technology"],
  "memoryCandidates": [
    "User prefers a curious conversation style.",
    "Session contained 4 turns."
  ]
}
```

## Public Realtime Contract

WebSocket endpoint:

```text
GET ws://localhost:3000/v1/realtime?sessionId=ses_123
Authorization: Bearer <accessToken>
```

### Client Events

#### `audio.commit`

```json
{
  "type": "audio.commit",
  "text": "Tell me something interesting for the road."
}
```

#### `assistant.interrupt`

```json
{
  "type": "assistant.interrupt"
}
```

#### `ping`

```json
{
  "type": "ping",
  "ts": 1710000000
}
```

### Server Events

#### `session.ready`

```json
{
  "type": "session.ready",
  "sessionId": "ses_123"
}
```

#### `transcript.final`

```json
{
  "type": "transcript.final",
  "utteranceId": "utt_001",
  "text": "Tell me something interesting for the road."
}
```

#### `assistant.state`

```json
{
  "type": "assistant.state",
  "state": "thinking"
}
```

#### `assistant.text`

```json
{
  "type": "assistant.text",
  "messageId": "msg_001",
  "text": "Short answer for Rider: ..."
}
```

#### `assistant.audio`

```json
{
  "type": "assistant.audio",
  "messageId": "msg_001",
  "audioFormat": "mp3",
  "payload": ""
}
```

#### `assistant.interrupted`

```json
{
  "type": "assistant.interrupted",
  "messageId": "msg_001"
}
```

#### `pong`

```json
{
  "type": "pong",
  "ts": 1710000000
}
```

#### `error`

```json
{
  "type": "error",
  "code": "SESSION_NOT_FOUND",
  "message": "Session ses_123 not found."
}
```

## Internal Service Ownership

### `auth-service`

Owns:

- Apple / Guest sign-in
- token issuance and validation
- auth identity persistence

### `profile-service`

Owns:

- onboarding fields
- nickname and preferences
- profile completeness truth

### `session-service`

Owns:

- session lifecycle
- session ownership validation
- user and assistant turns
- assistant state
- summaries
- end-session summary orchestration

### `conversation-service`

Owns:

- assistant reply generation
- conversation summary generation
- gRPC realtime turn generation for `app-server`
- future ASR / LLM / TTS integration points

Session summary path:

1. `app-server` forwards `POST /v1/sessions/:id/end`
2. `session-service` loads the owned session
3. `session-service` fetches a profile snapshot from `profile-service`
4. `session-service` asks `conversation-service` to build the summary
5. `session-service` stores the summary and marks the session ended

## Realtime Hot Path Rule

The current design keeps the realtime hot path narrow:

1. client connects to `app-server`
2. `app-server` validates bearer token
3. `app-server` validates `sessionId` ownership
4. `app-server` loads profile + session snapshot once during bootstrap
5. `app-server` forwards realtime turn generation to `conversation-service` over gRPC
6. `app-server` persists the completed realtime turn to `session-service` in a single commit
7. `app-server` emits websocket events to the client

This avoids synchronous fan-out to all services on every realtime event.

Bootstrap behavior:

- `app-server` now buffers websocket messages received before realtime bootstrap completes
- this prevents the first `audio.commit` from being dropped if the client sends immediately after socket open
- `session.ready` remains the stable protocol marker that the session is ready for normal traffic

## Current Limitations

- Apple sign-in is still mock-token based on the iOS side
- realtime is text-driven, not real microphone streaming yet
- assistant audio payload is still a placeholder
- no background conversation resume
- no CarPlay or automatic drive detection
