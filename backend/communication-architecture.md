# Backend Communication Architecture

## Goal

This document defines the communication model for the AI Passenger backend during MVP and the intended upgrade path after MVP.

## External Communication

### iOS Client -> Backend

Use two interface types:

- REST for auth, profile, session lifecycle, summary, and other standard request-response APIs
- Raw WebSocket for live conversation events on `/v1/realtime`

Why:

- Swift can use standard WebSocket support directly
- Event framing stays under our control
- The protocol stays aligned with the existing MVP event contract
- We avoid locking the mobile client into a Socket.IO-specific client library

### Realtime Event Model

The MVP realtime transport uses JSON messages with a required `type` field.

Examples:

- `audio.chunk`
- `audio.commit`
- `assistant.interrupt`
- `ping`
- `session.ready`
- `transcript.partial`
- `transcript.final`
- `assistant.state`
- `assistant.text`
- `assistant.audio`
- `assistant.interrupted`
- `error`

During MVP, `audio.commit` may include an optional `text` field to simulate ASR before real speech recognition is connected.

## Internal Communication

### Default Rule

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

It becomes relevant only when the system evolves toward true low-latency media streaming, for example with WebRTC-based audio transport. That is a future client-media concern, not the current internal service RPC choice.

## MVP Implementation Rule

For MVP:

- client-facing realtime = raw WebSocket
- internal backend modules = direct in-process calls

After service extraction:

- client-facing realtime = raw WebSocket
- internal synchronous service calls = gRPC
- internal asynchronous events = message bus

## Current State

The current backend implementation should reflect this:

- REST controllers for standard APIs
- raw WebSocket server for `/v1/realtime`
- no Socket.IO dependency at the protocol layer
