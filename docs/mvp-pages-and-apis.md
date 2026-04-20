# AI Passenger MVP Pages and API Contract

## Goal

This document defines the first usable MVP slice for the AI Passenger app:

- Swift iOS client with a tappable page skeleton
- NestJS backend with minimal session, profile, and conversation APIs
- Manual start and manual end for a conversation session
- Real-time voice chat over WebSocket

The MVP does not include:

- Bluetooth detection
- Auto-start driving detection
- Auto-end driving detection
- CarPlay integration
- Complex multi-agent service decomposition

## MVP User Flow

1. User signs in.
2. User completes profile onboarding.
3. User lands on the home screen directly after onboarding completes.
4. User taps `Start Chat`.
5. App creates a conversation session.
6. User enters the live voice chat screen.
7. User speaks, backend processes the input through the agentic pipeline, and returns a voice response.
8. User taps `End`.
9. App shows a session summary screen.

## iOS Page Structure

### 1. Launch / Auth

Purpose:

- Restore session if token exists
- Otherwise enter sign-in flow

Core UI:

- App logo
- `Continue with Apple`
- `Continue as Guest` for internal MVP testing only

Client state:

- `authStatus`: `unknown | signed_out | signed_in`
- `accessToken`
- `userId`

Calls:

- `POST /v1/auth/apple`
- `POST /v1/auth/guest`
- `GET /v1/me`

Exit conditions:

- If profile is incomplete, move to onboarding
- If profile is complete, move to home

### 2. Onboarding / Preference Setup

Purpose:

- Collect the minimum profile needed to steer conversation generation

Core UI:

- Interest multi-select chips
- Background form
- Conversation style preferences
- Optional avoid-topic section
- `Continue`

Suggested fields:

- `nickname`
- `interests`: `history`, `international_news`, `sports`, `travel`, `gaming`, `technology`, `finance`, `movies`, `music`
- `ageRange`: `under_18 | 18_24 | 25_34 | 35_44 | 45_54 | 55_plus`
- `gender`: `female | male | nonbinary | prefer_not_to_say`
- `occupationCategory`: `student | tech | finance | healthcare | education | creative | business | service | logistics | other`
- `hobbyTags`: `reading`, `fitness`, `cooking`, `photography`, `music`, `movies`, `hiking`, `cars`, `podcasts`, `design`
- `preferredLanguage`
- `conversationStyle`: `relaxed | curious | analytical`
- `responseLength`: `short | medium`
- `proactiveTopicPushing`: boolean
- `avoidTopicTags`: `politics`, `religion`, `graphic_violence`, `personal_finance`, `dating`

Profile rules:

- Do not ask for a real name anywhere in MVP
- `nickname` is the only user-entered identity field and should be framed as the name the AI uses in conversation
- Background and preference data should be collected with chips, pickers, or segmented controls instead of free-text inputs

Client state:

- `profileDraft`
- `isSubmitting`

Calls:

- `PUT /v1/profile`
- `GET /v1/profile`

Exit condition:

- Navigate to home after profile save succeeds

### 3. Home

Purpose:

- One clear entry point into the conversation experience

Core UI:

- Primary CTA: `Start Chat`
- Top-right avatar button that opens profile

MVP home screen rules:

- Keep the screen intentionally sparse
- Do not add dashboard widgets just to fill space
- Any session history, recommendation cards, or activity surfaces should be deferred

Client state:

- `profile`
- `isStartingSession`

Calls:

- `GET /v1/profile`
- `POST /v1/sessions`

Exit conditions:

- `Start Chat` creates a session and opens the live chat screen
- Avatar opens the profile page

### 4. Profile

Purpose:

- Let the user review and edit the profile created during onboarding

Core UI:

- Avatar and nickname
- Editable sections for interests, background, and conversation preferences
- `Save`

Client state:

- `profile`
- `profileDraft`
- `isSaving`

Calls:

- `GET /v1/profile`
- `PUT /v1/profile`

Exit conditions:

- `Save` returns to home
- Back returns to home without changes

### 5. Live Voice Chat

Purpose:

- Main driving-safe interaction screen

Core UI:

- Current assistant status: `Listening`, `Thinking`, `Speaking`
- Transcript strip for the most recent exchange
- Big circular input area with microphone waveform
- `Interrupt` button while assistant is speaking
- `End` button

Client state:

- `sessionId`
- `connectionStatus`
- `assistantState`: `idle | listening | thinking | speaking`
- `partialTranscript`
- `finalTranscript`
- `latestAssistantText`
- `isInterrupted`

Transport:

- WebSocket for real-time events

Calls:

- `GET /v1/sessions/:id`
- `WS connect /v1/realtime?sessionId=...`
- `POST /v1/sessions/:id/end`

Realtime actions:

- stream audio chunks
- receive partial ASR text
- receive final ASR text
- receive assistant response text
- receive TTS playback metadata
- send interrupt

Exit conditions:

- User taps `End`
- App transitions to session summary

### 6. Session Summary

Purpose:

- Give the user a clean end-state and provide conversation continuity for next time

Core UI:

- Short session summary
- Topics discussed
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

Home
  -> Profile
  -> Live Voice Chat

Profile
  -> Home

Live Voice Chat
  -> Session Summary

Session Summary
  -> Home
  -> Live Voice Chat
```

## Backend Surface

The backend should expose two interface types:

- HTTP for auth, profile, session lifecycle, and summary data
- raw WebSocket for real-time voice conversation events

For MVP, this is enough. Internal service extraction should later use `gRPC over TCP`, while the iOS client continues to use raw WebSocket externally.

## REST API Contract

### Auth

#### `POST /v1/auth/apple`

Request:

```json
{
  "identityToken": "apple-jwt-token"
}
```

Response:

```json
{
  "accessToken": "jwt",
  "refreshToken": "jwt",
  "user": {
    "id": "usr_123",
    "nickname": "Alex",
    "profileCompleted": false
  }
}
```

#### `POST /v1/auth/guest`

Request:

```json
{}
```

Response:

```json
{
  "accessToken": "jwt",
  "refreshToken": "jwt",
  "user": {
    "id": "guest_123",
    "nickname": "Guest",
    "profileCompleted": false
  }
}
```

### Current User

#### `GET /v1/me`

Response:

```json
{
  "id": "usr_123",
  "nickname": "Alex",
  "profileCompleted": true
}
```

### Profile

#### `GET /v1/profile`

Response:

```json
{
  "userId": "usr_123",
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
  "updatedAt": "2026-04-13T10:00:00Z"
}
```

#### `PUT /v1/profile`

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

### Sessions

#### `POST /v1/sessions`

Purpose:

- Create a manual conversation session after the user taps the start button

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
    "startedAt": "2026-04-13T10:05:00Z"
  },
  "realtime": {
    "wsUrl": "wss://api.example.com/v1/realtime?sessionId=ses_123",
    "token": "realtime-jwt"
  }
}
```

#### `GET /v1/sessions/:id`

Response:

```json
{
  "id": "ses_123",
  "status": "active",
  "startedAt": "2026-04-13T10:05:00Z",
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
  "endedAt": "2026-04-13T10:42:00Z"
}
```

#### `GET /v1/sessions/:id/summary`

Response:

```json
{
  "sessionId": "ses_123",
  "durationSeconds": 2220,
  "summary": "You discussed Roman history, solo travel in Spain, and EV road trips.",
  "topics": ["history", "travel", "electric vehicles"],
  "memoryCandidates": [
    "User is planning a trip to Spain.",
    "User enjoys history with a practical angle."
  ]
}
```

## WebSocket Contract

Client opens:

```text
GET wss://api.example.com/v1/realtime?sessionId=ses_123
```

MVP note:

- this is a raw WebSocket endpoint, not Socket.IO
- the `realtime.token` field is reserved for later auth wiring
- until ASR is connected, `audio.commit` may optionally carry a `text` field for development

### Client -> Server Events

#### `audio.chunk`

```json
{
  "type": "audio.chunk",
  "sequence": 1,
  "audioFormat": "pcm16",
  "sampleRate": 16000,
  "payload": "<base64>"
}
```

#### `audio.commit`

Marks the end of the current user utterance.

```json
{
  "type": "audio.commit",
  "text": "Tell me something about the Silk Road."
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
  "ts": 1770000000
}
```

### Server -> Client Events

#### `session.ready`

```json
{
  "type": "session.ready",
  "sessionId": "ses_123"
}
```

#### `transcript.partial`

```json
{
  "type": "transcript.partial",
  "text": "tell me something about"
}
```

#### `transcript.final`

```json
{
  "type": "transcript.final",
  "utteranceId": "utt_001",
  "text": "Tell me something about the Silk Road."
}
```

#### `assistant.state`

```json
{
  "type": "assistant.state",
  "state": "thinking"
}
```

Allowed values:

- `idle`
- `listening`
- `thinking`
- `speaking`

#### `assistant.text`

```json
{
  "type": "assistant.text",
  "messageId": "msg_001",
  "text": "The Silk Road was less a single road and more a trade network that linked China, Central Asia, the Middle East, and Europe."
}
```

#### `assistant.audio`

```json
{
  "type": "assistant.audio",
  "messageId": "msg_001",
  "audioFormat": "mp3",
  "payload": "<base64>"
}
```

#### `assistant.interrupted`

```json
{
  "type": "assistant.interrupted",
  "messageId": "msg_001"
}
```

#### `error`

```json
{
  "type": "error",
  "code": "ASR_TIMEOUT",
  "message": "Speech recognition timed out."
}
```

## Agentic Pipeline Contract

The MVP backend should not treat the model as a single black-box brain. The orchestrator should run a fixed chain per utterance:

1. `ASR`
2. `Input Normalizer`
3. `Intent Router`
4. `Profile Retriever`
5. `Short-Term Memory Retriever`
6. `Response Planner`
7. `LLM Generator`
8. `TTS`
9. `Memory Writer` after response is complete

### Orchestrator Inputs

- current `sessionId`
- current user utterance
- user profile
- latest session turns
- optional memory candidates
- option-based background fields such as age range, occupation category, and hobby tags

### Orchestrator Outputs

- assistant text
- assistant style metadata
- TTS request
- memory write candidates

## NestJS Module Suggestion

Keep the MVP small. Do not split into too many deployable services yet.

Recommended modules:

- `AuthModule`
- `UsersModule`
- `ProfileModule`
- `SessionsModule`
- `RealtimeModule`
- `ConversationModule`
- `AiAdaptersModule`

Suggested internal providers:

- `AsrAdapter`
- `LlmAdapter`
- `TtsAdapter`
- `ConversationOrchestrator`
- `MemoryService`
- `ProfileContextService`

## Recommended Delivery Order

1. Build the Swift page skeleton with mocked data.
2. Lock the REST and WebSocket payloads above.
3. Implement `Auth`, `Profile`, and `Sessions` in NestJS.
4. Implement the WebSocket realtime gateway with fake assistant replies first.
5. Replace fake replies with the actual orchestrator pipeline.
6. Add session summary generation.

## What To Defer

- Kubernetes
- automatic drive detection
- Bluetooth logic
- advanced memory ranking
- complex analytics
- background conversation resume
