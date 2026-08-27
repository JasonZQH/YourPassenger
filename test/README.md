# Test Scripts

Root-level scripts for cross-service contract checks that do not belong to one
service package.

Run both checks with `npm test` from the repository root, or run either one
directly.

Run the session realtime contract check with:

```bash
npx ts-node --project apps/app-server/tsconfig.json -r tsconfig-paths/register test/session-realtime-contract.test.ts
```

The script verifies:

- `POST /v1/sessions` service logic returns the WebSocket fallback when LiveKit
  env is absent.
- the same service logic returns a LiveKit room connection and valid participant
  token when LiveKit env is present.

Run the chat-agent VAD check with:

```bash
npx ts-node --project apps/chat-agent-service/tsconfig.json -r tsconfig-paths/register test/chat-agent-vad.test.ts
```

The script verifies the voice-activity detector's speech-start, end-silence, and
max-utterance transitions against synthetic PCM frames.
