import { AssistantState } from '../common/types';

export interface AudioChunkEvent {
  type: 'audio.chunk';
  sequence: number;
  audioFormat: 'pcm16';
  sampleRate: number;
  payload: string;
}

export interface ClientTextAudioCommitEvent {
  type: 'audio.commit';
  text?: string;
}

export interface AssistantInterruptEvent {
  type: 'assistant.interrupt';
}

export interface PingEvent {
  type: 'ping';
  ts?: number;
}

export type ClientRealtimeEvent =
  | AudioChunkEvent
  | ClientTextAudioCommitEvent
  | AssistantInterruptEvent
  | PingEvent;

export interface SessionReadyEvent {
  type: 'session.ready';
  sessionId: string;
}

export interface TranscriptFinalEvent {
  type: 'transcript.final';
  utteranceId: string;
  text: string;
}

export interface AssistantStateEvent {
  type: 'assistant.state';
  state: AssistantState;
}

export interface AssistantTextEvent {
  type: 'assistant.text';
  messageId: string;
  text: string;
}

export interface AssistantAudioEvent {
  type: 'assistant.audio';
  messageId: string;
  audioFormat: 'mp3';
  payload: string;
}

export interface AssistantInterruptedEvent {
  type: 'assistant.interrupted';
  messageId: string;
}

export interface PongEvent {
  type: 'pong';
  ts: number;
}

export interface ErrorEvent {
  type: 'error';
  code: string;
  message: string;
}

export type ServerRealtimeEvent =
  | SessionReadyEvent
  | TranscriptFinalEvent
  | AssistantStateEvent
  | AssistantTextEvent
  | AssistantAudioEvent
  | AssistantInterruptedEvent
  | PongEvent
  | ErrorEvent;
