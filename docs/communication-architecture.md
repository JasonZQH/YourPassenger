# Backend Communication Architecture

## Goal

This document defines the current communication model for the AI Passenger MVP backend and the intended upgrade path after MVP.

## External Communication

### iOS Client -> Backend

Use two interface types:

- REST for auth, profile, session lifecycle, summary, and health APIs
- Raw WebSocket for live conversation events on `/v1/realtime`

Current protected routes:

- `GET /v1/me`
- `GET /v1/profile`
- `PUT /v1/profile`
- `POST /v1/sessions`
- `GET /v1/sessions/:id`
- `POST /v1/sessions/:id/end`
- `GET /v1/sessions/:id/summary`
- WebSocket handshake on `/v1/realtime?sessionId=...`

Current auth model:

- `POST /v1/auth/apple` and `POST /v1/auth/guest` return signed mock bearer tokens
- The client must send `Authorization: Bearer <accessToken>` on all protected HTTP routes
- The client must also send the same bearer token in the realtime WebSocket handshake headers
- The backend validates both the token and session ownership before allowing realtime traffic

Why raw WebSocket:

- Swift can use standard WebSocket support directly
- Event framing stays under project control
- The protocol stays aligned with the existing MVP event contract
- The mobile client avoids a Socket.IO-specific dependency

## Realtime Event Model

The MVP realtime transport uses JSON messages with a required `type` field.

### Client -> Server

Currently supported events:

- `audio.chunk`
- `audio.commit`
- `assistant.interrupt`
- `ping`

Current MVP behavior:

- `audio.commit` may include a `text` field to simulate ASR before real speech recognition is connected
- `audio.chunk` is accepted but currently only drives assistant state changes; it does not stream binary audio into an ASR stack yet
- `assistant.interrupt` resets assistant state back to `idle`

### Server -> Client

Currently emitted events:

- `session.ready`
- `transcript.final`
- `assistant.state`
- `assistant.text`
- `assistant.audio`
- `assistant.interrupted`
- `pong`
- `error`

Notes:

- `transcript.partial` is part of the longer-term protocol direction, but it is not emitted by the current backend implementation
- `assistant.audio` is currently metadata-only; the MVP does not stream synthesized audio bytes yet

## Internal Communication

### Current MVP Rule

For the current monolith:

- client-facing realtime = raw WebSocket
- client-facing request-response APIs = REST controllers
- backend module-to-module calls = direct in-process NestJS service calls
- persistence = PostgreSQL via Prisma

This matches the codebase today:

- auth, profile, session, and health routes are standard NestJS controllers
- realtime upgrades are handled by a raw `ws` server mounted on the Nest HTTP server
- session, profile, and conversation orchestration run inside the same process

### Default Rule After Service Extraction

Do not choose raw TCP or raw UDP as application protocols for service-to-service business communication.

Instead:

- use `gRPC over TCP` for synchronous service calls
- use an event bus later for asynchronous events

### Synchronous Service Calls

Recommended long-term protocol:

- `gRPC`

Best fit for:

- orchestrator -> ASR adapter
- orchestrator -> LLM adapter
- orchestrator -> TTS adapter
- session service -> conversation service

Why:

- typed contracts
- efficient binary transport
- consistent request-response semantics
- strong fit for microservice boundaries

### Asynchronous Events

Recommended long-term mechanism:

- `NATS` or `Kafka`

Best fit for:

- session ended events
- analytics events
- memory write jobs
- recommendation refresh jobs

## Why Not UDP

UDP is not the right default for the current backend business layer.

It only becomes relevant if the product moves to true low-latency media transport such as WebRTC-based audio streaming. That is a future client-media concern, not the current internal service RPC choice.

## Implementation Rule

For MVP:

- client-facing realtime = raw WebSocket
- auth and ownership checks happen before realtime traffic is accepted
- internal backend modules = direct in-process calls

After service extraction:

- client-facing realtime = raw WebSocket or WebRTC gateway, depending on media needs
- internal synchronous service calls = gRPC
- internal asynchronous events = message bus
