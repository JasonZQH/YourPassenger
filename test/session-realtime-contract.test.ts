import assert from 'node:assert/strict';

import { TokenVerifier } from 'livekit-server-sdk';

import { DownstreamConfigService } from '../apps/app-server/src/http/downstream-config.service';
import { SessionsService } from '../apps/app-server/src/sessions/sessions.service';
import type { SessionRecord } from '../packages/contracts/src/session';

type ConfigValues = Record<string, string | undefined>;

class FakeConfigService {
  private readonly values: ConfigValues;

  constructor(values: ConfigValues) {
    this.values = values;
  }

  get<T = string>(key: string): T | undefined {
    return this.values[key] as T | undefined;
  }
}

class FakeDownstreamHttpService {
  private readonly session: SessionRecord;

  constructor(session: SessionRecord) {
    this.session = session;
  }

  async post<T>(): Promise<T> {
    return this.session as T;
  }
}

class FakeChatAgentClientService {
  dispatchCalls: Array<{ sessionId: string; roomName: string; userId: string }> = [];

  async dispatchSessionAgent(body: { sessionId: string; roomName: string; userId: string }) {
    this.dispatchCalls.push(body);
    return {
      sessionId: body.sessionId,
      roomName: body.roomName,
      agentIdentity: `agent_${body.sessionId}`,
      status: 'joined' as const,
      connectedAt: '2026-05-03T00:00:00.000Z',
    };
  }
}

async function main() {
  await verifiesWebSocketFallback();
  await verifiesLiveKitConnection();
  console.log('session realtime contract tests passed');
}

async function verifiesWebSocketFallback() {
  const service = buildSessionsService({
    APP_SERVER_PORT: '3000',
    PUBLIC_WS_BASE_URL: 'ws://localhost:3000',
  });

  const response = await service.createSession(
    'user_123',
    'access-token',
    { source: 'manual_start' },
  );

  assert.equal(response.session.id, 'ses_123');
  assert.equal(response.realtime.transport, 'websocket');

  if (response.realtime.transport !== 'websocket') {
    throw new Error('Expected websocket realtime response.');
  }

  assert.equal(
    response.realtime.wsUrl,
    'ws://localhost:3000/v1/realtime?sessionId=ses_123',
  );
  assert.equal(response.realtime.token, 'access-token');
}

async function verifiesLiveKitConnection() {
  const service = buildSessionsService({
    LIVEKIT_URL: 'wss://livekit.example.com/',
    LIVEKIT_API_KEY: 'devkey',
    LIVEKIT_API_SECRET: 'devsecret',
    LIVEKIT_PARTICIPANT_TOKEN_TTL_SECONDS: '600',
  });

  const response = await service.createSession(
    'user_123',
    'access-token',
    { source: 'manual_start' },
  );

  assert.equal(response.session.id, 'ses_123');
  assert.equal(response.realtime.transport, 'livekit');

  if (response.realtime.transport !== 'livekit') {
    throw new Error('Expected livekit realtime response.');
  }

  assert.equal(response.realtime.livekitUrl, 'wss://livekit.example.com');
  assert.equal(response.realtime.roomName, 'yp_ses_ses_123');
  assert.ok(response.realtime.participantToken.length > 0);

  const verifier = new TokenVerifier('devkey', 'devsecret');
  const grants = await verifier.verify(response.realtime.participantToken);
  assert.equal(grants.sub, 'usr_user_123');
  assert.equal(grants.video?.room, 'yp_ses_ses_123');
  assert.equal(grants.video?.roomJoin, true);
  assert.equal(grants.video?.canPublish, true);
  assert.equal(grants.video?.canSubscribe, true);
  assert.equal(grants.video?.canPublishData, true);
}

function buildSessionsService(config: ConfigValues): SessionsService {
  const downstreamConfig = new DownstreamConfigService(
    new FakeConfigService(config) as never,
  );
  return new SessionsService(
    downstreamConfig,
    new FakeDownstreamHttpService(buildSessionRecord()) as never,
    new FakeChatAgentClientService() as never,
  );
}

function buildSessionRecord(): SessionRecord {
  return {
    id: 'ses_123',
    status: 'active',
    startedAt: '2026-05-03T00:00:00.000Z',
    latestAssistantState: 'idle',
    turns: [],
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
