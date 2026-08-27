# Core Voice Interaction and User Memory Business Design

## Goal

This document defines the core business design for the next stage of AI Passenger:

- realtime voice conversation powered by LiveKit
- short-lived session agents for each active chat
- structured storage of conversations, summaries, and learned user memory
- controlled persona updates through profile ownership boundaries
- a microservice-friendly orchestration model that keeps realtime latency low

The design assumes the current architecture remains:

- iOS client as the primary frontend
- `app-server` as the public REST entrypoint
- internal `auth-service`, `profile-service`, `session-service`, and `conversation-service`
- future LiveKit-based voice runtime added as a new service

The key product requirement is not only that the user can speak with the AI Passenger in realtime, but that every completed conversation can help the system understand the user better in a safe, explainable, and reversible way.

## Business Principles

### Realtime voice is ephemeral

Each active voice session should be treated as a short-lived runtime.

The session agent can use current profile and memory context to answer better, but the runtime itself is not the source of long-term truth. Once the session ends, durable state must be written through owned backend services.

### Profile and memory are separate

`UserProfile` and `UserMemory` should not be collapsed into one table or concept.

`UserProfile` is explicit, stable, and user-configurable. Examples:

- nickname
- preferred language
- response length
- conversation style
- proactive topic pushing
- avoid topic tags

`UserMemory` is learned from conversations and must include evidence. Examples:

- user likes science fiction podcasts
- user is planning a trip to Japan
- user prefers concise responses while driving
- user often asks for technical explanations

### LLMs propose, services decide

`conversation-service` can use LLMs and rule-based prompts to extract summaries, preferences, and memory candidates, but it should not directly mutate the user's authoritative persona.

The safer ownership model is:

```text
conversation-service -> proposes memory/profile candidates
profile-service      -> validates, merges, stores, exposes, deletes
```

This keeps LLM output auditable and prevents accidental long-term persona pollution.

### Every learned memory needs evidence

Long-term user understanding must be traceable to source sessions and turns.

Any memory candidate should include:

- type
- key
- value
- confidence
- evidence session id
- evidence turn ids when available
- extraction reason
- sensitivity level
- status

The system should be able to answer: "Why does the app think this about me?"

## Core Business Requirements

### 1. Start a realtime voice session

The user taps `Start Chat` in the iOS app.

The system must:

- authenticate the user
- create a session record
- create or name a LiveKit room for that session
- issue a scoped LiveKit participant token
- dispatch or allow a voice agent to join the room
- return connection details to the iOS client

The iOS client then joins the LiveKit room and publishes microphone audio.

### 2. Serve one active session with one short-lived chat agent

Each LiveKit room/session should have a dedicated short-lived voice agent runtime.

The voice agent must:

- receive user audio from LiveKit
- perform or coordinate STT
- detect user turn completion
- support interruption while the assistant is speaking
- call generation logic with profile and memory context
- synthesize assistant speech
- publish assistant audio back into the LiveKit room
- emit transcript and assistant state events for UI display

This runtime is allowed to use long-term context, but it should not own long-term memory storage.

### 3. Use previous chats to improve current answers

Before or during session bootstrap, the agent needs context from backend services:

- profile snapshot from `profile-service`
- stable memories from `profile-service` or a future memory-owned module
- recent session summaries from `session-service`
- current session metadata from `session-service`

The prompt/context builder should compress this into a small, relevant context block for the voice agent.

The current agent should not load unbounded raw conversation history. It should prefer:

- explicit profile fields
- high-confidence memories
- summaries from recent sessions
- currently active session turns

### 4. Persist completed turns

Every completed user/assistant turn should be durably stored.

The minimum durable record should include:

- session id
- user id
- role
- transcript text
- turn index
- created timestamp
- optional audio metadata
- optional model/provider metadata

For MVP, raw audio storage can be deferred. Transcript and assistant text are required.

### 5. Summarize completed sessions

When the user ends a session, `session-service` should orchestrate session finalization.

The system must:

- mark the session as ended
- compile the final transcript
- request summary generation from `conversation-service`
- store `SessionSummary`
- extract memory/profile candidates
- route candidates to the profile/memory ownership layer

### 6. Learn user preferences safely

The system should learn from each completed session, but not every statement should become memory.

Good memory candidates:

- repeated preferences
- stable interests
- explicit corrections by the user
- durable plans or context the user wants the app to remember
- interaction preferences that improve future conversations

Poor memory candidates:

- one-off jokes
- temporary mood
- private third-party details
- sensitive attributes without explicit user intent
- unsupported inferences
- uncertain claims

### 7. Make learned persona user-controllable

The product should eventually expose a user-facing memory/persona view.

The user should be able to:

- see what the app remembers
- see why it remembers it
- delete a memory
- disable future memory learning
- edit explicit profile fields
- prevent specific topics from being used

## Service Responsibilities

### `app-server`

Owns public entrypoints and client-facing contracts.

Responsibilities:

- authenticate public requests
- create sessions through `session-service`
- issue LiveKit connection details
- mint scoped LiveKit participant tokens
- keep legacy WebSocket MVP path available for Simulator/debug flows
- avoid owning transcript, summary, or memory truth

### `chat-agent-service`

Owns realtime agent runtime.

Responsibilities:

- join LiveKit rooms as the assistant participant
- handle audio input/output
- coordinate STT, LLM, TTS, turn detection, and interruption
- retrieve compact context for the active session
- commit completed turns to `session-service`
- send UI events through LiveKit data/text channels

Non-responsibilities:

- long-term profile storage
- direct persona mutation
- session ownership validation as source of truth

### `conversation-service`

Owns language intelligence.

Responsibilities:

- build assistant replies
- build prompt/context from profile, memory, and session state
- generate session summaries
- extract memory candidates
- extract profile update candidates
- apply rule-based extraction constraints

Non-responsibilities:

- direct writes to authoritative profile fields
- direct writes to long-term memories unless explicitly delegated through a narrow API

### `session-service`

Owns session truth.

Responsibilities:

- create sessions
- validate session ownership
- store turns
- store assistant state
- end sessions
- store session summaries
- orchestrate end-session summary generation

### `profile-service`

Owns user persona truth.

Responsibilities:

- store explicit profile fields
- store or expose stable user memories
- validate profile update candidates
- merge memory candidates
- reject unsafe or low-confidence candidates
- expose user-controllable persona/memory APIs

In a later stage, `UserMemory` can be split into a dedicated `memory-service`, but for the next implementation phase it can live under `profile-service` to avoid premature service fragmentation.

## Proposed Data Concepts

### `SessionTurn`

Stores the durable transcript of each conversation turn.

```text
SessionTurn
- id
- sessionId
- turnIndex
- role: user | assistant
- text
- createdAt
- audioRef?
- providerMetadata?
```

### `SessionSummary`

Stores a compressed record of a completed session.

```text
SessionSummary
- sessionId
- durationSeconds
- summary
- topics[]
- memoryCandidates[]
- createdAt
- updatedAt
```

The current MVP already has this shape. The next stage should make `memoryCandidates` structured instead of plain strings.

### `UserMemory`

Stores learned, durable user understanding.

```text
UserMemory
- id
- userId
- type: preference | interest | fact | interaction_style | avoid_topic | plan
- key
- value
- confidence
- status: pending | active | rejected | archived
- sensitivity: low | medium | high
- evidenceSessionId
- evidenceTurnIds[]
- extractionReason
- createdAt
- updatedAt
- lastUsedAt?
```

### `ProfileUpdateCandidate`

Represents a proposed update to explicit profile/persona fields.

```text
ProfileUpdateCandidate
- id
- userId
- field
- proposedValue
- previousValue
- confidence
- evidenceSessionId
- evidenceTurnIds[]
- status: pending | accepted | rejected
- createdAt
```

Examples:

- `responseLength`: user repeatedly asks for shorter answers
- `conversationStyle`: user says they prefer direct explanations
- `avoidTopicTags`: user explicitly says not to discuss a topic

## Business Flow: Start Voice Session

```text
+----------+        +------------+        +-----------------+
| iOS App  |        | app-server |        | session-service |
+----------+        +------------+        +-----------------+
     |                    |                       |
     | POST /v1/sessions  |                       |
     |------------------->|                       |
     |                    | validate access token |
     |                    |---------------------->|
     |                    | create session        |
     |                    |<----------------------|
     |                    |                       |
     |                    | mint LiveKit token    |
     |                    | room = yp_ses_<id>   |
     |                    |                       |
     | session + LK info  |                       |
     |<-------------------|                       |
     |                    |                       |
     | connect to LiveKit room                    |
     |------------------------------------------->|
```

Returned realtime payload:

```json
{
  "transport": "livekit",
  "livekitUrl": "wss://livekit.example.com",
  "roomName": "yp_ses_123",
  "participantToken": "scoped-livekit-jwt"
}
```

## Business Flow: Realtime Voice Conversation

```text
+----------+      +-------------+      +---------------------+
| iOS App  |<---->| LiveKit Room|<---->| chat-agent-service |
+----------+      +-------------+      +---------------------+
     |                  |                         |
     | publish mic      |                         |
     |----------------->| user audio track        |
     |                  |------------------------>|
     |                  |                         | STT
     |                  |                         | turn detection
     |                  |                         |
     |                  |                         | load compact context
     |                  |                         |--------------------+
     |                  |                         |                    |
     |                  |                         v                    v
     |                  |              +-------------------+  +----------------+
     |                  |              | conversation-svc  |  | profile-svc    |
     |                  |              +-------------------+  +----------------+
     |                  |                         |
     |                  |                         | assistant reply
     |                  |                         | TTS
     | assistant audio  |<------------------------|
     |<-----------------|                         |
     |                  |                         |
     | transcript/state data events               |
     |<-----------------|<------------------------|
     |                  |                         |
     |                  |                         | commit final turn
     |                  |                         v
     |                  |              +-------------------+
     |                  |              | session-service   |
     |                  |              +-------------------+
```

Hot path rule:

- LiveKit carries realtime audio.
- `chat-agent-service` keeps short-lived runtime state.
- Completed turns are committed to `session-service`.
- Profile and memory are read as compact context, not synchronously rewritten on every partial utterance.

## Business Flow: End Session and Learn

```text
+----------+       +------------+       +-----------------+
| iOS App  |       | app-server |       | session-service |
+----------+       +------------+       +-----------------+
     |                   |                       |
     | POST /end         |                       |
     |------------------>|                       |
     |                   | forward end request   |
     |                   |---------------------->|
     |                   |                       |
     |                   |                       | load turns
     |                   |                       | mark ended
     |                   |                       |
     |                   |                       | build summary input
     |                   |                       |-------------------+
     |                   |                       |                   |
     |                   |                       v                   v
     |                   |             +-------------------+ +----------------+
     |                   |             | conversation-svc  | | profile-svc    |
     |                   |             +-------------------+ +----------------+
     |                   |                       |
     |                   |                       | summary
     |                   |                       | memory candidates
     |                   |                       | profile candidates
     |                   |                       |
     |                   |                       v
     |                   |             +-------------------+
     |                   |             | profile-service   |
     |                   |             | validate + merge  |
     |                   |             +-------------------+
     |                   |                       |
     | ended session     |<----------------------|
     |<------------------|                       |
```

The important boundary:

```text
conversation-service extracts candidates
profile-service decides what becomes durable persona or memory
```

## Business Flow: Next Session Uses Learned Context

```text
+---------------------+
| new voice session   |
+---------------------+
          |
          v
+---------------------+       +----------------+
| chat-agent-service |------>| profile-service|
+---------------------+       +----------------+
          |                           |
          | load explicit profile     |
          | load active memories      |
          | load avoid topics         |
          |<--------------------------|
          |
          v
+---------------------+       +-----------------+
| prompt/context      |------>| session-service |
| builder             |       +-----------------+
+---------------------+               |
          |                           |
          | load recent summaries     |
          |<--------------------------|
          |
          v
+---------------------+
| current chat agent  |
| answers with memory |
+---------------------+
```

The agent should use learned context only when it helps the current conversation. It should not over-personalize every response or reveal memory awkwardly.

## Memory Extraction Rules

`conversation-service` should use rule-based prompts and structured output schemas for extraction.

### Extract

Extract only information that is useful for future conversations:

- stable interests
- stable preferences
- explicit corrections
- repeated patterns
- durable plans
- conversation style preferences
- topics the user wants to avoid

### Do not extract

Do not create durable memory from:

- jokes
- sarcasm
- one-off emotions
- unsupported assumptions
- sensitive traits inferred indirectly
- private details about third parties
- anything contradicted by the same session

### Require evidence

Every candidate must include evidence:

```json
{
  "type": "preference",
  "key": "conversation.response_length",
  "value": "short",
  "confidence": 0.86,
  "evidenceSessionId": "ses_123",
  "evidenceTurnIds": ["turn_4", "turn_8"],
  "extractionReason": "The user explicitly asked twice for shorter answers.",
  "sensitivity": "low"
}
```

### Confidence behavior

Suggested handling:

```text
confidence >= 0.85 and sensitivity = low
  -> can auto-activate

confidence 0.60 - 0.85
  -> store as pending

confidence < 0.60
  -> reject or keep only inside session summary

sensitivity = high
  -> never auto-activate
```

## Profile Update Rules

Profile fields should change more conservatively than memories.

Examples of acceptable updates:

- User explicitly says: "Call me Alex."
- User explicitly says: "Please answer in Chinese from now on."
- User repeatedly says: "Keep it shorter."
- User explicitly says: "Do not bring up politics."

Examples that should not directly update profile:

- User discusses Spanish once, so `preferredLanguage` becomes Spanish.
- User sounds frustrated once, so `conversationStyle` becomes comforting.
- User mentions a political topic once, so it becomes an interest.

Profile updates should be either:

- user-initiated through UI
- high-confidence and low-risk
- visible and reversible
- tied to evidence

## Implementation Conditions

### LiveKit infrastructure

Required:

- LiveKit Cloud project or self-hosted LiveKit server
- LiveKit API key and secret stored only on backend
- room naming convention, such as `yp_ses_<sessionId>`
- token minting in `app-server`
- participant identity convention, such as `usr_<userId>` and `agent_<sessionId>`
- microphone permission in iOS
- LiveKit Swift SDK in the iOS project

### Backend services

Required:

- `chat-agent-service` added as a deployable service
- backend-to-backend credentials for `chat-agent-service`
- session ownership checks before token issuance
- APIs for committing turns from the agent runtime
- APIs for fetching compact profile/memory context
- end-session summary and memory extraction flow

### Data storage

Required:

- durable session turns
- durable session summaries
- structured memory candidates
- durable active user memories
- evidence links from memory to sessions/turns
- migration path from current string `memoryCandidates` to structured candidates

### Model pipeline

Required:

- STT provider
- LLM provider
- TTS provider
- turn detection
- interruption handling
- prompt templates for:
  - realtime reply
  - session summary
  - memory extraction
  - profile update proposal

### Product controls

Required before broad release:

- delete memory
- disable memory learning
- view remembered facts/preferences
- avoid topic enforcement
- privacy policy language for learned memory

## MVP-To-Core Migration Path

### Phase 1: Keep current text realtime path

Keep `/v1/realtime` for Simulator and regression tests.

It remains useful for:

- local development
- deterministic integration tests
- testing `conversation-service`
- testing turn persistence

### Phase 2: Add LiveKit session connection

Extend `POST /v1/sessions` to return LiveKit connection details.

The iOS app can choose:

- `transport: "websocket"` for current MVP/debug
- `transport: "livekit"` for real voice

### Phase 3: Add `chat-agent-service`

Start with:

- join room
- receive audio
- emit placeholder transcript
- respond with placeholder TTS or text events
- commit turns

Then integrate real STT, LLM, TTS, and interruption.

### Phase 4: Add structured memory extraction

Upgrade session finalization:

```text
raw turns -> summary -> memory candidates -> profile-service validation -> active memories
```

### Phase 5: Add user-facing memory controls

Expose APIs and UI for:

- list memories
- delete memory
- disable memory
- approve pending memory if needed

## Key Open Decisions

### Where should `UserMemory` live first?

Recommended for next phase:

```text
profile-service owns UserMemory
```

Reason:

- less service fragmentation
- persona and memory are closely related
- easier to expose user controls

Possible future split:

```text
memory-service owns UserMemory
profile-service owns explicit profile
```

This split is useful if memory retrieval, embedding search, ranking, or privacy workflows become large enough to deserve a separate service.

### Should memory extraction happen synchronously?

Recommended:

```text
session end request stores summary synchronously
memory extraction can be async
```

For MVP, synchronous extraction is acceptable if latency is small. For production, memory extraction should move to a background job so ending a session is reliable even when model providers are slow.

### Should the agent see raw old transcripts?

Recommended:

```text
No by default.
```

The agent should see compact profile, active memories, and recent summaries. Raw historical transcripts should be used only for debugging, explicit user requests, or offline memory processing.

## Summary

The core architecture should be treated as multi-agent orchestration, but with strict ownership boundaries.

The realtime chat agent is short-lived and optimized for low-latency voice interaction. `conversation-service` provides language intelligence and extraction logic. `profile-service` owns durable persona and memory. `session-service` owns conversation history and summaries.

The most important rule is:

```text
Agents can infer.
Services must verify and own durable truth.
```
