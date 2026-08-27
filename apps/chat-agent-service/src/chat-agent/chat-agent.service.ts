import { HttpException, Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  AudioFrame,
  AudioSource,
  AudioStream,
  LocalAudioTrack,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  TrackKind,
  TrackPublishOptions,
  TrackSource,
  dispose,
} from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';

import type {
  BuildRealtimeTurnBody,
  ClientRealtimeEvent,
  CommitRealtimeTurnBody,
  DispatchChatAgentBody,
  DispatchChatAgentResponse,
  RealtimeTurnResponse,
  ServerRealtimeEvent,
  SessionRecord,
  UserProfile,
} from '@yourpassenger/contracts';

import { DownstreamConfigService } from '../http/downstream-config.service';
import { DownstreamHttpService } from '../http/downstream-http.service';
import { LiveKitAgentConfigService } from './livekit-agent-config.service';
import {
  VoiceActivityDetector,
  computePcm16Rms,
} from './voice-activity-detector';

interface AgentRoomRuntime {
  sessionId: string;
  roomName: string;
  userId: string;
  agentIdentity: string;
  room: Room;
  status: DispatchChatAgentResponse['status'];
  connectedAt?: string;
  audioBuffers: Map<string, BufferedAudio>;
  audioReaders: Set<string>;
  voiceDetectors: Map<string, VoiceActivityDetector>;
  turnInProgress: boolean;
  assistantAudioSource?: AudioSource;
  assistantAudioTrackPublished?: boolean;
}

interface BufferedAudio {
  frames: AudioFrame[];
  sampleRate: number;
  channels: number;
  totalSamplesPerChannel: number;
}

@Injectable()
export class ChatAgentService implements OnModuleDestroy {
  private readonly roomsByName = new Map<string, AgentRoomRuntime>();

  // Wires LiveKit configuration and downstream service clients for room agents.
  constructor(
    private readonly liveKitConfigService: LiveKitAgentConfigService,
    private readonly downstreamConfig: DownstreamConfigService,
    private readonly downstreamHttp: DownstreamHttpService,
  ) {}

  // Disconnects active LiveKit rooms and releases rtc-node resources on shutdown.
  async onModuleDestroy() {
    await Promise.all(
      [...this.roomsByName.values()].map(async (runtime) => {
        await runtime.assistantAudioSource?.close().catch(() => undefined);
        await runtime.room.disconnect();
      }),
    );
    this.roomsByName.clear();
    await dispose();
  }

  // Starts or reuses the chat agent for a LiveKit session room.
  async dispatchSessionAgent(
    body: DispatchChatAgentBody,
  ): Promise<DispatchChatAgentResponse> {
    const existing = this.roomsByName.get(body.roomName);
    if (existing) {
      return this.toResponse(existing);
    }

    const config = this.liveKitConfigService.getLiveKitConfig();
    const agentIdentity = this.buildAgentIdentity(body.sessionId);
    const room = new Room();
    const runtime: AgentRoomRuntime = {
      sessionId: body.sessionId,
      roomName: body.roomName,
      userId: body.userId,
      agentIdentity,
      room,
      status: 'joining',
      audioBuffers: new Map(),
      audioReaders: new Set(),
      voiceDetectors: new Map(),
      turnInProgress: false,
    };
    this.roomsByName.set(body.roomName, runtime);
    this.attachRoomHandlers(runtime);

    try {
      await room.connect(config.url, await this.buildAgentToken(body, agentIdentity), {
        autoSubscribe: true,
        dynacast: true,
      });
      runtime.status = 'joined';
      runtime.connectedAt = new Date().toISOString();
      await this.publishAgentState(runtime, 'joined');
      await this.publishServerEvent(runtime, {
        type: 'session.ready',
        sessionId: runtime.sessionId,
      });
      console.log(
        '[live-session] started',
        `session=${runtime.sessionId}`,
        `room=${body.roomName}`,
        `user=${runtime.userId}`,
        `agent=${agentIdentity}`,
      );
      return this.toResponse(runtime);
    } catch (error) {
      runtime.status = 'failed';
      this.roomsByName.delete(body.roomName);
      await room.disconnect().catch(() => undefined);
      console.error('[chat-agent] failed to join room', body.roomName, error);
      throw error;
    }
  }

  // Returns the active chat-agent room runtimes.
  listSessionAgents(): DispatchChatAgentResponse[] {
    return [...this.roomsByName.values()].map((runtime) => this.toResponse(runtime));
  }

  // Attaches LiveKit room handlers for participants, tracks, data, and disconnects.
  private attachRoomHandlers(runtime: AgentRoomRuntime) {
    runtime.room
      .on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        console.log(
          '[chat-agent] participant connected',
          runtime.roomName,
          participant.identity,
        );
        void this.publishAgentState(runtime, 'participant_connected');
        void this.publishServerEvent(runtime, {
          type: 'session.ready',
          sessionId: runtime.sessionId,
        });
      })
      .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        this.handleTrackSubscribed(runtime, track, publication, participant);
      })
      .on(RoomEvent.DataReceived, (payload, participant, kind, topic) => {
        void this.handleDataReceived(runtime, payload, participant, kind, topic);
      })
      .on(RoomEvent.Disconnected, () => {
        runtime.status = 'disconnected';
        this.roomsByName.delete(runtime.roomName);
        void runtime.assistantAudioSource?.close().catch(() => undefined);
        console.log('[chat-agent] disconnected from room', runtime.roomName);
      });
  }

  // Starts audio reading and realtime detection for subscribed audio tracks.
  private handleTrackSubscribed(
    runtime: AgentRoomRuntime,
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
  ) {
    console.log(
      '[chat-agent] track subscribed',
      runtime.roomName,
      participant.identity,
      publication.sid,
      track.kind,
    );

    if (track.kind === TrackKind.KIND_AUDIO) {
      this.startAudioReader(runtime, track, participant);
      void this.publishAgentState(runtime, 'audio_track_subscribed');
      console.log(
        '[live-session] realtime detection enabled',
        `session=${runtime.sessionId}`,
        `participant=${participant.identity}`,
        `speechRmsThreshold=${this.getVadSpeechRmsThreshold()}`,
        `endSilenceMs=${this.getVadEndSilenceMs()}`,
      );
    }
  }

  // Reads audio frames from a participant track and feeds the VAD pipeline.
  private startAudioReader(
    runtime: AgentRoomRuntime,
    track: RemoteTrack,
    participant: RemoteParticipant,
  ) {
    if (runtime.audioReaders.has(participant.identity)) {
      return;
    }

    runtime.audioReaders.add(participant.identity);
    const stream = new AudioStream(track, {
      sampleRate: this.getSttSampleRate(),
      numChannels: 1,
      frameSizeMs: 20,
    });

    void (async () => {
      const reader = stream.getReader();
      try {
        while (true) {
          const result = await reader.read();
          if (result.done) {
            break;
          }
          this.appendAudioFrame(runtime, participant.identity, result.value);
        }
      } catch (error) {
        console.error('[chat-agent] audio reader failed', runtime.roomName, error);
      } finally {
        reader.releaseLock();
        runtime.audioReaders.delete(participant.identity);
      }
    })();
  }

  // Buffers audio, detects utterance boundaries, and triggers auto commits.
  private appendAudioFrame(
    runtime: AgentRoomRuntime,
    participantIdentity: string,
    frame: AudioFrame,
  ) {
    const detector = this.getVoiceDetector(runtime, participantIdentity);
    const rms = computePcm16Rms(frame.data);
    const decision = detector.accept({
      rms,
      durationMs: (frame.samplesPerChannel / frame.sampleRate) * 1000,
    });

    if (decision.speechStarted) {
      runtime.audioBuffers.delete(participantIdentity);
      console.log(
        '[live-session] speech detected',
        `session=${runtime.sessionId}`,
        `participant=${participantIdentity}`,
        `rms=${rms.toFixed(4)}`,
      );
      void this.publishServerEvent(runtime, {
        type: 'assistant.state',
        state: 'listening',
      });
    }

    let buffer = runtime.audioBuffers.get(participantIdentity);
    if (!buffer) {
      buffer = {
        frames: [],
        sampleRate: frame.sampleRate,
        channels: frame.channels,
        totalSamplesPerChannel: 0,
      };
      runtime.audioBuffers.set(participantIdentity, buffer);
    }

    if (buffer.sampleRate !== frame.sampleRate || buffer.channels !== frame.channels) {
      buffer.frames = [];
      buffer.sampleRate = frame.sampleRate;
      buffer.channels = frame.channels;
      buffer.totalSamplesPerChannel = 0;
    }

    buffer.frames.push(frame);
    buffer.totalSamplesPerChannel += frame.samplesPerChannel;

    const maxSamples = Math.round(buffer.sampleRate * this.getAudioBufferSeconds());
    while (
      buffer.frames.length > 0 &&
      buffer.totalSamplesPerChannel > maxSamples
    ) {
      const removed = buffer.frames.shift();
      buffer.totalSamplesPerChannel -= removed?.samplesPerChannel ?? 0;
    }

    if (decision.shouldCommit) {
      const utteranceBuffer = runtime.audioBuffers.get(participantIdentity);
      runtime.audioBuffers.delete(participantIdentity);
      console.log(
        '[live-session] end-of-utterance detected',
        `session=${runtime.sessionId}`,
        `participant=${participantIdentity}`,
        `reason=${decision.reason ?? 'unknown'}`,
        `utteranceMs=${Math.round(decision.utteranceMs)}`,
      );
      void this.handleAutoAudioCommit(
        runtime,
        participantIdentity,
        utteranceBuffer,
      );
    }
  }

  // Publishes an agent lifecycle state event over LiveKit data.
  private async publishAgentState(runtime: AgentRoomRuntime, event: string) {
    const localParticipant = runtime.room.localParticipant;
    if (!localParticipant) {
      return;
    }

    const payload = Buffer.from(
      JSON.stringify({
        type: 'agent.state',
        event,
        sessionId: runtime.sessionId,
        roomName: runtime.roomName,
        agentIdentity: runtime.agentIdentity,
        timestamp: new Date().toISOString(),
      }),
    );

    await localParticipant.publishData(payload, {
      reliable: true,
      topic: 'agent.state',
    });
  }

  // Parses client LiveKit data messages and dispatches supported realtime events.
  private async handleDataReceived(
    runtime: AgentRoomRuntime,
    payload: Uint8Array,
    participant: RemoteParticipant | undefined,
    kind: unknown,
    topic: string | undefined,
  ) {
    console.log(
      '[chat-agent] data received',
      runtime.roomName,
      participant?.identity ?? 'unknown',
      kind,
      topic ?? 'untopiced',
      payload.byteLength,
    );

    if (topic !== 'realtime.client') {
      return;
    }

    if (!participant || participant.identity === runtime.agentIdentity) {
      return;
    }

    let event: ClientRealtimeEvent;
    try {
      event = JSON.parse(Buffer.from(payload).toString('utf8')) as ClientRealtimeEvent;
    } catch {
      await this.publishServerEvent(runtime, {
        type: 'error',
        code: 'INVALID_JSON',
        message: 'Realtime payload must be valid JSON.',
      });
      return;
    }

    await this.handleClientEvent(runtime, event);
  }

  // Handles one parsed client realtime event.
  private async handleClientEvent(
    runtime: AgentRoomRuntime,
    event: ClientRealtimeEvent,
  ) {
    switch (event.type) {
      case 'audio.chunk':
        await this.publishServerEvent(runtime, {
          type: 'assistant.state',
          state: 'listening',
        });
        return;
      case 'audio.commit':
        await this.handleAudioCommit(runtime, event.text);
        return;
      case 'assistant.interrupt':
        await this.publishServerEvents(runtime, [
          {
            type: 'assistant.interrupted',
            messageId: `msg_${Date.now()}`,
          },
          {
            type: 'assistant.state',
            state: 'idle',
          },
        ]);
        return;
      case 'ping':
        await this.publishServerEvent(runtime, {
          type: 'pong',
          ts: event.ts ?? Date.now(),
        });
        return;
      default:
        await this.publishServerEvent(runtime, {
          type: 'error',
          code: 'UNSUPPORTED_EVENT',
          message: `Unsupported realtime event: ${String((event as { type?: string }).type)}`,
        });
    }
  }

  // Returns the participant VAD instance, creating it on first use.
  private getVoiceDetector(
    runtime: AgentRoomRuntime,
    participantIdentity: string,
  ): VoiceActivityDetector {
    let detector = runtime.voiceDetectors.get(participantIdentity);
    if (!detector) {
      detector = new VoiceActivityDetector({
        speechRmsThreshold: this.getVadSpeechRmsThreshold(),
        endSilenceMs: this.getVadEndSilenceMs(),
        minSpeechMs: this.getVadMinSpeechMs(),
        maxUtteranceMs: this.getVadMaxUtteranceMs(),
      });
      runtime.voiceDetectors.set(participantIdentity, detector);
    }

    return detector;
  }

  // Commits a VAD-detected utterance when audio is available.
  private async handleAutoAudioCommit(
    runtime: AgentRoomRuntime,
    participantIdentity: string,
    audioBuffer?: BufferedAudio,
  ) {
    if (!audioBuffer) {
      console.log(
        '[live-session] auto commit skipped',
        `session=${runtime.sessionId}`,
        `participant=${participantIdentity}`,
        'reason=no_audio_buffer',
      );
      return;
    }

    await this.handleAudioCommit(runtime, undefined, {
      audioBuffer,
      participantIdentity,
      source: 'auto-vad',
    });
  }

  // Transcribes, generates, stores, and publishes one realtime turn.
  private async handleAudioCommit(
    runtime: AgentRoomRuntime,
    rawUtterance?: string,
    options?: {
      audioBuffer?: BufferedAudio;
      source?: 'manual' | 'auto-vad';
      participantIdentity?: string;
    },
  ) {
    if (runtime.turnInProgress) {
      console.log(
        '[live-session] turn ignored while busy',
        `session=${runtime.sessionId}`,
        `source=${options?.source ?? 'manual'}`,
      );
      return;
    }

    runtime.turnInProgress = true;
    await this.publishServerEvent(runtime, {
      type: 'assistant.state',
      state: 'thinking',
    });

    try {
      const utterance =
        rawUtterance?.trim() ||
        await this.transcribeLatestAudio(runtime, options?.audioBuffer);

      if (!utterance) {
        console.log(
          '[live-session] no transcript produced',
          `session=${runtime.sessionId}`,
          `source=${options?.source ?? 'manual'}`,
        );
        await this.publishServerEvent(runtime, {
          type: 'assistant.state',
          state: 'idle',
        });
        return;
      }

      console.log(
        '[live-session] user said',
        `session=${runtime.sessionId}`,
        `source=${options?.source ?? 'manual'}`,
        `text="${this.formatLogText(utterance)}"`,
      );
      const [session, profile] = await Promise.all([
        this.getSession(runtime.userId, runtime.sessionId),
        this.getProfile(runtime.userId),
      ]);
      const realtimeTurn = await this.buildRealtimeTurn({
        utterance,
        profile,
        session,
      });
      await this.commitRealtimeTurn(runtime, realtimeTurn);
      console.log(
        '[live-session] ai replied',
        `session=${runtime.sessionId}`,
        `text="${this.formatLogText(realtimeTurn.assistantText)}"`,
      );
      await this.publishRealtimeTurn(runtime, realtimeTurn);
    } catch (error) {
      console.error('[chat-agent] realtime turn failed', runtime.roomName, error);
      await this.publishServerEvents(runtime, [
        {
          type: 'error',
          code: 'REALTIME_TURN_FAILED',
          message: error instanceof Error ? error.message : 'Realtime turn failed.',
        },
        {
          type: 'assistant.state',
          state: 'idle',
        },
      ]);
    } finally {
      runtime.turnInProgress = false;
    }
  }

  // Publishes transcript, text, audio, and state events for a completed turn.
  private async publishRealtimeTurn(
    runtime: AgentRoomRuntime,
    realtimeTurn: RealtimeTurnResponse,
  ) {
    const now = Date.now();
    const messageId = `msg_${now}`;
    await this.publishServerEvents(runtime, [
      {
        type: 'transcript.final',
        utteranceId: `utt_${now}`,
        text: realtimeTurn.transcriptText,
      },
      {
        type: 'assistant.text',
        messageId,
        text: realtimeTurn.assistantText,
      },
      {
        type: 'assistant.state',
        state: 'speaking',
      },
    ]);

    await this.speakAssistantText(runtime, realtimeTurn.assistantText);

    await this.publishServerEvents(runtime, [
      {
        type: 'assistant.audio',
        messageId,
        audioFormat: realtimeTurn.audioFormat,
        payload: realtimeTurn.audioPayload,
      },
      {
        type: 'assistant.state',
        state: 'idle',
      },
    ]);
  }

  // Sends buffered audio to OpenAI STT and returns the transcript.
  private async transcribeLatestAudio(
    runtime: AgentRoomRuntime,
    audioBuffer?: BufferedAudio,
  ): Promise<string> {
    if (!this.openAiSttEnabled()) {
      console.log(
        '[live-session] asr disabled',
        `session=${runtime.sessionId}`,
        `provider=${process.env.ASR_PROVIDER ?? 'unset'}`,
      );
      return '';
    }

    const buffer = audioBuffer ?? this.selectLargestAudioBuffer(runtime);
    if (!buffer || buffer.totalSamplesPerChannel < buffer.sampleRate * 0.35) {
      console.log(
        '[live-session] asr skipped',
        `session=${runtime.sessionId}`,
        'reason=not_enough_audio',
      );
      return '';
    }

    const wav = this.encodeWav(this.combineBufferedAudio(buffer));
    const apiKey = this.getOpenAiApiKey();
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required when ASR_PROVIDER=openai.');
    }

    const form = new FormData();
    form.set('model', process.env.OPENAI_STT_MODEL || 'gpt-4o-mini-transcribe');
    form.set('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'utterance.wav');
    const language = process.env.OPENAI_STT_LANGUAGE?.trim();
    if (language) {
      form.set('language', language);
    }

    console.log(
      '[live-session] asr request',
      `session=${runtime.sessionId}`,
      `model=${process.env.OPENAI_STT_MODEL || 'gpt-4o-mini-transcribe'}`,
      `durationMs=${Math.round((buffer.totalSamplesPerChannel / buffer.sampleRate) * 1000)}`,
    );

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });

    const payload = (await response.json().catch(() => null)) as
      | { text?: string; error?: { message?: string } }
      | null;

    if (!response.ok) {
      throw new Error(payload?.error?.message ?? `OpenAI transcription failed with ${response.status}.`);
    }

    const transcript = payload?.text?.trim() ?? '';
    console.log(
      '[live-session] transcript',
      `session=${runtime.sessionId}`,
      `text="${this.formatLogText(transcript)}"`,
    );
    return transcript;
  }

  // Selects the participant audio buffer with the most samples.
  private selectLargestAudioBuffer(runtime: AgentRoomRuntime): BufferedAudio | null {
    let selected: BufferedAudio | null = null;
    for (const buffer of runtime.audioBuffers.values()) {
      if (
        !selected ||
        buffer.totalSamplesPerChannel > selected.totalSamplesPerChannel
      ) {
        selected = buffer;
      }
    }

    return selected;
  }

  // Combines buffered audio frames into a single PCM frame.
  private combineBufferedAudio(buffer: BufferedAudio): AudioFrame {
    const sampleCount = buffer.totalSamplesPerChannel * buffer.channels;
    const data = new Int16Array(sampleCount);
    let offset = 0;
    for (const frame of buffer.frames) {
      data.set(frame.data, offset);
      offset += frame.data.length;
    }

    return new AudioFrame(
      data,
      buffer.sampleRate,
      buffer.channels,
      buffer.totalSamplesPerChannel,
    );
  }

  // Encodes a PCM audio frame as a WAV buffer for STT upload.
  private encodeWav(frame: AudioFrame): Buffer {
    const bytesPerSample = 2;
    const blockAlign = frame.channels * bytesPerSample;
    const byteRate = frame.sampleRate * blockAlign;
    const dataBytes = Buffer.from(
      frame.data.buffer,
      frame.data.byteOffset,
      frame.data.byteLength,
    );
    const header = Buffer.alloc(44);

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataBytes.byteLength, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(frame.channels, 22);
    header.writeUInt32LE(frame.sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataBytes.byteLength, 40);

    return Buffer.concat([header, dataBytes]);
  }

  // Synthesizes and publishes assistant speech when TTS is configured.
  private async speakAssistantText(
    runtime: AgentRoomRuntime,
    assistantText: string,
  ) {
    if (!this.openAiTtsEnabled()) {
      return;
    }

    try {
      const pcm = await this.synthesizeSpeechPcm(assistantText);
      await this.publishAssistantPcm(runtime, pcm);
    } catch (error) {
      console.error('[chat-agent] tts failed', runtime.roomName, error);
      await this.publishServerEvent(runtime, {
        type: 'error',
        code: 'TTS_FAILED',
        message: error instanceof Error ? error.message : 'TTS failed.',
      });
    }
  }

  // Requests OpenAI TTS PCM audio for assistant text.
  private async synthesizeSpeechPcm(text: string): Promise<Buffer> {
    const apiKey = this.getOpenAiApiKey();
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required when TTS_PROVIDER=openai.');
    }

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
        voice: process.env.OPENAI_TTS_VOICE || 'alloy',
        input: text,
        response_format: 'pcm',
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      throw new Error(payload?.error?.message ?? `OpenAI TTS failed with ${response.status}.`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  // Streams synthesized PCM audio into a LiveKit local audio track.
  private async publishAssistantPcm(
    runtime: AgentRoomRuntime,
    pcm: Buffer,
  ) {
    const localParticipant = runtime.room.localParticipant;
    if (!localParticipant || pcm.byteLength < 2) {
      return;
    }

    const sampleRate = this.getTtsSampleRate();
    if (!runtime.assistantAudioSource) {
      runtime.assistantAudioSource = new AudioSource(sampleRate, 1, 1000);
    }

    if (!runtime.assistantAudioTrackPublished) {
      const track = LocalAudioTrack.createAudioTrack(
        'passenger-assistant',
        runtime.assistantAudioSource,
      );
      const options = new TrackPublishOptions();
      options.source = TrackSource.SOURCE_MICROPHONE;
      await localParticipant.publishTrack(track, options);
      runtime.assistantAudioTrackPublished = true;
    }

    const samples = new Int16Array(
      pcm.buffer,
      pcm.byteOffset,
      Math.floor(pcm.byteLength / 2),
    );
    const samplesPerFrame = Math.max(1, Math.round(sampleRate / 50));

    for (let offset = 0; offset < samples.length; offset += samplesPerFrame) {
      const chunk = samples.subarray(offset, offset + samplesPerFrame);
      const frame = new AudioFrame(Int16Array.from(chunk), sampleRate, 1, chunk.length);
      await runtime.assistantAudioSource.captureFrame(frame);
    }
    await runtime.assistantAudioSource.waitForPlayout();
  }

  // Loads the current session record from the session service.
  private async getSession(userId: string, sessionId: string): Promise<SessionRecord> {
    return this.downstreamHttp.get<SessionRecord>(
      this.downstreamConfig.getSessionServiceBaseUrl(),
      `/sessions/${encodeURIComponent(sessionId)}?userId=${encodeURIComponent(userId)}`,
    );
  }

  // Loads the user profile and treats missing profiles as null.
  private async getProfile(userId: string): Promise<UserProfile | null> {
    try {
      return await this.downstreamHttp.get<UserProfile | null>(
        this.downstreamConfig.getProfileServiceBaseUrl(),
        `/profiles/${encodeURIComponent(userId)}`,
      );
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 404) {
        return null;
      }
      throw error;
    }
  }

  // Requests a realtime turn from the conversation service.
  private async buildRealtimeTurn(
    body: BuildRealtimeTurnBody,
  ): Promise<RealtimeTurnResponse> {
    return this.downstreamHttp.post<RealtimeTurnResponse>(
      this.downstreamConfig.getConversationServiceBaseUrl(),
      '/conversation/realtime-turn',
      body,
    );
  }

  // Persists a realtime turn through the session service.
  private async commitRealtimeTurn(
    runtime: AgentRoomRuntime,
    realtimeTurn: RealtimeTurnResponse,
  ): Promise<SessionRecord> {
    return this.downstreamHttp.post<SessionRecord>(
      this.downstreamConfig.getSessionServiceBaseUrl(),
      `/sessions/${encodeURIComponent(runtime.sessionId)}/realtime-turn`,
      {
        userId: runtime.userId,
        transcriptText: realtimeTurn.transcriptText,
        assistantText: realtimeTurn.assistantText,
        finalAssistantState: 'idle',
      } satisfies CommitRealtimeTurnBody,
    );
  }

  // Publishes a sequence of realtime server events in order.
  private async publishServerEvents(
    runtime: AgentRoomRuntime,
    events: ServerRealtimeEvent[],
  ) {
    for (const event of events) {
      await this.publishServerEvent(runtime, event);
    }
  }

  // Publishes one realtime server event over LiveKit data.
  private async publishServerEvent(
    runtime: AgentRoomRuntime,
    event: ServerRealtimeEvent,
  ) {
    const localParticipant = runtime.room.localParticipant;
    if (!localParticipant) {
      return;
    }

    await localParticipant.publishData(Buffer.from(JSON.stringify(event)), {
      reliable: true,
      topic: 'realtime.server',
    });
  }

  // Returns whether OpenAI speech-to-text is configured.
  private openAiSttEnabled(): boolean {
    return process.env.ASR_PROVIDER === 'openai' && !!this.getOpenAiApiKey();
  }

  // Returns whether OpenAI text-to-speech is configured.
  private openAiTtsEnabled(): boolean {
    return process.env.TTS_PROVIDER === 'openai' && !!this.getOpenAiApiKey();
  }

  // Returns a usable OpenAI API key when one is configured.
  private getOpenAiApiKey(): string | null {
    const value = process.env.OPENAI_API_KEY?.trim();
    if (!value || value === 'replace-with-openai-api-key') {
      return null;
    }
    return value;
  }

  // Returns the rolling audio buffer length in seconds.
  private getAudioBufferSeconds(): number {
    return this.getPositiveNumberEnv('LIVEKIT_AGENT_AUDIO_BUFFER_SECONDS', 12);
  }

  // Returns the RMS threshold used to classify speech.
  private getVadSpeechRmsThreshold(): number {
    return this.getPositiveNumberEnv('LIVEKIT_AGENT_VAD_SPEECH_RMS_THRESHOLD', 0.018);
  }

  // Returns the trailing silence duration that ends an utterance.
  private getVadEndSilenceMs(): number {
    return this.getPositiveNumberEnv('LIVEKIT_AGENT_VAD_END_SILENCE_MS', 800);
  }

  // Returns the minimum speech duration required before committing.
  private getVadMinSpeechMs(): number {
    return this.getPositiveNumberEnv('LIVEKIT_AGENT_VAD_MIN_SPEECH_MS', 280);
  }

  // Returns the maximum utterance duration before forced commit.
  private getVadMaxUtteranceMs(): number {
    return this.getPositiveNumberEnv('LIVEKIT_AGENT_VAD_MAX_UTTERANCE_MS', 12_000);
  }

  // Returns the sample rate used for STT audio frames.
  private getSttSampleRate(): number {
    return Math.round(this.getPositiveNumberEnv('OPENAI_STT_SAMPLE_RATE', 16000));
  }

  // Returns the sample rate used for TTS PCM playback.
  private getTtsSampleRate(): number {
    return Math.round(this.getPositiveNumberEnv('OPENAI_TTS_SAMPLE_RATE', 24000));
  }

  // Reads a positive numeric environment value with fallback.
  private getPositiveNumberEnv(name: string, fallback: number): number {
    const value = process.env[name]?.trim();
    if (!value) {
      return fallback;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  // Builds the LiveKit JWT used by the backend agent participant.
  private async buildAgentToken(
    body: DispatchChatAgentBody,
    agentIdentity: string,
  ): Promise<string> {
    const config = this.liveKitConfigService.getLiveKitConfig();
    const token = new AccessToken(config.apiKey, config.apiSecret, {
      identity: agentIdentity,
      name: 'Passenger Agent',
      metadata: JSON.stringify({
        sessionId: body.sessionId,
        userId: body.userId,
        role: 'agent',
      }),
      ttl: config.agentTokenTtlSeconds,
    });
    token.addGrant({
      roomJoin: true,
      room: body.roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return token.toJwt();
  }

  // Builds the LiveKit participant identity for the backend agent.
  private buildAgentIdentity(sessionId: string): string {
    return `agent_${sessionId}`;
  }

  // Sanitizes long text for concise terminal logging.
  private formatLogText(text: string): string {
    // Transcripts are user speech. Redact them unless LOG_TRANSCRIPTS=1 so a
    // deployed service never writes what a driver said into its logs.
    if (process.env.LOG_TRANSCRIPTS !== '1') {
      return `<${text.length} chars>`;
    }
    return text
      .replace(/\s+/g, ' ')
      .replace(/"/g, '\\"')
      .slice(0, 240);
  }

  // Converts runtime state into the public dispatch response.
  private toResponse(runtime: AgentRoomRuntime): DispatchChatAgentResponse {
    return {
      sessionId: runtime.sessionId,
      roomName: runtime.roomName,
      agentIdentity: runtime.agentIdentity,
      status: runtime.status,
      connectedAt: runtime.connectedAt,
    };
  }
}
