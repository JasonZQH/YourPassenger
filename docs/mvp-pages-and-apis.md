# AI Passenger MVP Pages and API Contract

## Goal

This document defines the first usable MVP slice for the AI Passenger app:

- Swift iOS client with a working page flow
- NestJS backend with authenticated auth, profile, session, and summary APIs
- Manual start and manual end for a conversation session
- Realtime chat over authenticated raw WebSocket

The MVP does not include:

- Bluetooth detection
- Auto-start driving detection
- Auto-end driving detection
- CarPlay integration
- Complex multi-agent service decomposition
- Real Apple Sign In SDK integration
- Real microphone capture / ASR / streamed TTS

## Current MVP User Flow

1. App boots and restores auth if a token exists.
2. User signs in with Guest or Apple.
3. User completes profile onboarding.
4. User completes the local passenger naming step.
5. User lands on the home screen.
6. User taps `Start Chat`.
7. App creates a conversation session.
8. User enters the live chat screen.
9. User sends a prompt through the websocket-backed MVP chat flow.
10. User taps `End`.
11. App shows a session summary screen.

## Auth and Session Rules

- `POST /v1/auth/apple` and `POST /v1/auth/guest` return signed mock tokens.
- All profile and session routes require `Authorization: Bearer <accessToken>`.
- The realtime websocket handshake also requires the same bearer token.
- The backend enforces session ownership on both HTTP and websocket requests.

## iOS Page Structure

### 1. Launch / Auth

Purpose:

- Restore session if a token exists
- Otherwise enter sign-in flow

Core UI:

- app logo
- `Continue with Apple`
- `Continue as Guest` for internal MVP testing

Client state:

- `screen`
- `profile`
- token storage in `UserDefaults`

Calls:

- `POST /v1/auth/apple`
- `POST /v1/auth/guest`
- `GET /v1/me`
- `GET /v1/profile`

Notes:

- the current Apple button uses a locally persisted mock identity token, then hits the real backend endpoint

Exit conditions:

- if profile is missing, move to onboarding
- if profile exists, move to home

### 2. Onboarding / Preference Setup

Purpose:

- collect the minimum profile needed to steer conversation generation

Core UI:

- interest multi-select chips
- background form
- conversation style preferences
- optional avoid-topic section
- `Continue`

Current profile fields:

- `nickname`
- `interests`
- `ageRange`
- `gender`
- `occupationCategory`
- `hobbyTags`
- `preferredLanguage`
- `conversationStyle`
- `responseLength`
- `proactiveTopicPushing`
- `avoidTopicTags`

Profile rules:

- do not ask for a real name anywhere in MVP
- `nickname` is the only user-entered identity field sent to the backend
- background and preference data are captured through structured controls instead of free-text prompts

Client state:

- `profileDraft`
- `isSubmitting`

Calls:

- `PUT /v1/profile`
- `GET /v1/profile`

Exit condition:

- navigate to `PassengerNamingView` after profile save succeeds

### 3. Passenger Naming

Purpose:

- collect a local-only passenger display name used by the app shell

Core UI:

- passenger naming prompt
- input field
- `Continue`

Client state:

- `passengerName`

Calls:

- none

Notes:

- this step writes only to local `UserDefaults`
- it does not call the backend

Exit condition:

- navigate to home

### 4. Home

Purpose:

- provide one clear entry point into the conversation experience

Core UI:

- primary CTA: `Start Chat`
- top-right avatar button that opens profile

MVP home rules:

- keep the screen intentionally sparse
- do not add dashboard widgets just to fill space
- defer session history and recommendation cards

Client state:

- `profile`
- `isStartingSession`

Calls:

- `POST /v1/sessions`

Exit conditions:

- `Start Chat` creates a session and opens the live chat screen
- avatar opens the profile page

### 5. Profile

Purpose:

- let the user review and edit the profile created during onboarding

Core UI:

- avatar and nickname
- editable sections for interests, background, and conversation preferences
- `Save`

Client state:

- `profile`
- `profileDraft`
- `isSaving`

Calls:

- `PUT /v1/profile`
- `GET /v1/profile`

Exit conditions:

- `Save` returns to home
- back returns to home without changes

### 6. Live Chat

Purpose:

- main driving-safe interaction screen for MVP testing

Core UI:

- current assistant status: `Listening`, `Thinking`, `Speaking`
- transcript strip for the most recent exchange
- large microphone CTA
- `Interrupt` button while assistant is speaking
- `End` button

Client state:

- `sessionId`
- `connectionStatus`
- `assistantState`: `idle | listening | thinking | speaking`
- `partialTranscript`
- message list
- `isInterrupted`

Transport:

- authenticated raw WebSocket

Calls:

- `POST /v1/sessions`
- `WS connect /v1/realtime?sessionId=...`
- `POST /v1/sessions/:id/end`
- `GET /v1/sessions/:id/summary`

Current realtime actions:

- send `audio.commit` with canned text to simulate a spoken prompt
- receive `transcript.final`
- receive `assistant.state`
- receive `assistant.text`
- send `assistant.interrupt`

Notes:

- `GET /v1/sessions/:id` exists on the backend, but the current iOS client does not call it during the normal happy path
- binary audio streaming is not part of the current MVP implementation yet

Exit conditions:

- user taps `End`
- app transitions to session summary

### 7. Session Summary

Purpose:

- give the user a clean end-state and conversation continuity for next time

Core UI:

- short session summary
- topics discussed
- `Start New Session`
- `Back Home`

Client state:

- `summary`
- `topics`
- `sessionDuration`

Calls:

- `GET /v1/sessions/:id/summary`

## Navigation Graph

```text
Launch/Auth
  -> Onboarding
  -> Home

Onboarding
  -> Passenger Naming

Passenger Naming
  -> Home

Home
  -> Profile
  -> Live Chat

Profile
  -> Home

Live Chat
  -> Session Summary

Session Summary
  -> Home
  -> Live Chat
```

## Backend Surface Snapshot

Current HTTP routes:

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

Current realtime route:

- `WS /v1/realtime?sessionId=<sessionId>`

## REST Contract Snapshot

### `POST /v1/auth/apple`

Request:

```json
{
  "identityToken": "ios-dev-apple-<uuid>"
}
```

Response:

```json
{
  "accessToken": "<signed-access-token>",
  "refreshToken": "<signed-refresh-token>",
  "user": {
    "id": "usr_<uuid>",
    "nickname": "Rider",
    "profileCompleted": false
  }
}
```

### `POST /v1/auth/guest`

Request:

```json
{}
```

Response:

```json
{
  "accessToken": "<signed-access-token>",
  "refreshToken": "<signed-refresh-token>",
  "user": {
    "id": "usr_<uuid>",
    "nickname": "Guest",
    "profileCompleted": false
  }
}
```

### `GET /v1/me`

Response:

```json
{
  "id": "usr_<uuid>",
  "nickname": "Rider",
  "profileCompleted": true
}
```

### `GET /v1/profile`

Response when a profile exists:

```json
{
  "userId": "usr_<uuid>",
  "nickname": "Alex",
  "interests": ["history", "travel", "technology"],
  "ageRange": "25_34",
  "gender": "prefer_not_to_say",
  "occupationCategory": "tech",
  "hobbyTags": ["reading", "podcasts", "travel"],
  "preferredLanguage": "en",
  "conversationStyle": "curious",
  "responseLength": "short",
  "proactiveTopicPushing": true,
  "avoidTopicTags": ["graphic_violence"],
  "updatedAt": "2026-04-13T10:00:00.000Z"
}
```

Response when the current user has no saved profile yet:

- `null`
- or an empty body

The iOS client currently treats both cases as "profile missing".

### `PUT /v1/profile`

Request:

```json
{
  "nickname": "Alex",
  "interests": ["history", "travel", "technology"],
  "ageRange": "25_34",
  "gender": "prefer_not_to_say",
  "occupationCategory": "tech",
  "hobbyTags": ["reading", "podcasts", "travel"],
  "preferredLanguage": "en",
  "conversationStyle": "curious",
  "responseLength": "short",
  "proactiveTopicPushing": true,
  "avoidTopicTags": ["graphic_violence"]
}
```

Response:

```json
{
  "success": true,
  "profileCompleted": true
}
```

### `POST /v1/sessions`

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
    "id": "ses_<uuid>",
    "status": "active",
    "startedAt": "2026-04-13T10:05:00.000Z"
  },
  "realtime": {
    "wsUrl": "ws://localhost:3000/v1/realtime?sessionId=ses_<uuid>",
    "token": "<same-access-token>"
  }
}
```

### `GET /v1/sessions/:id`

Response:

```json
{
  "id": "ses_<uuid>",
  "status": "active",
  "startedAt": "2026-04-13T10:05:00.000Z",
  "latestAssistantState": "idle"
}
```

### `POST /v1/sessions/:id/end`

Request:

```json
{
  "reason": "manual_end"
}
```

Response:

```json
{
  "id": "ses_<uuid>",
  "status": "ended",
  "endedAt": "2026-04-13T10:42:00.000Z"
}
```

### `GET /v1/sessions/:id/summary`

Response:

```json
{
  "sessionId": "ses_<uuid>",
  "durationSeconds": 2220,
  "summary": "You talked about Tell me something interesting about the Silk Road..",
  "topics": ["history", "travel", "technology"],
  "memoryCandidates": [
    "User prefers a curious conversation style.",
    "Session contained 2 turns."
  ]
}
```

## Realtime Contract Snapshot

Handshake:

```text
GET ws://localhost:3000/v1/realtime?sessionId=ses_<uuid>
Authorization: Bearer <accessToken>
```

Client -> server events currently supported:

```json
{ "type": "audio.chunk", "sequence": 1, "audioFormat": "pcm16", "sampleRate": 16000, "payload": "<base64>" }
```

```json
{ "type": "audio.commit", "text": "Tell me something interesting about the Silk Road." }
```

```json
{ "type": "assistant.interrupt" }
```

```json
{ "type": "ping", "ts": 1770000000 }
```

Server -> client events currently emitted:

```json
{ "type": "session.ready", "sessionId": "ses_<uuid>" }
```

```json
{ "type": "transcript.final", "utteranceId": "utt_<ts>", "text": "Tell me something interesting about the Silk Road." }
```

```json
{ "type": "assistant.state", "state": "thinking" }
```

```json
{ "type": "assistant.text", "messageId": "msg_<ts>", "text": "Short answer for Alex: ..." }
```

```json
{ "type": "assistant.audio", "messageId": "msg_<ts>", "audioFormat": "mp3", "payload": "" }
```

```json
{ "type": "assistant.interrupted", "messageId": "msg_<ts>" }
```

```json
{ "type": "pong", "ts": 1770000000 }
```

```json
{ "type": "error", "code": "AUTH_INVALID", "message": "Realtime bearer token is invalid." }
```

Notes:

- the backend currently emits `transcript.final`, not `transcript.partial`
- `assistant.audio` is a placeholder metadata event today, not a real streamed audio payload
- the iOS client currently sends `audio.commit` with canned text instead of microphone audio
