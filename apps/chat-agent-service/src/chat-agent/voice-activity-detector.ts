export interface VoiceActivityDetectorOptions {
  speechRmsThreshold: number;
  endSilenceMs: number;
  minSpeechMs: number;
  maxUtteranceMs: number;
}

export interface VoiceActivityFrameStats {
  rms: number;
  durationMs: number;
}

export interface VoiceActivityDecision {
  speechStarted: boolean;
  shouldCommit: boolean;
  reason?: 'silence' | 'max_duration';
  speechMs: number;
  silenceMs: number;
  utteranceMs: number;
}

export class VoiceActivityDetector {
  private inSpeech = false;
  private speechMs = 0;
  private silenceMs = 0;
  private utteranceMs = 0;

  // Stores VAD thresholds and timing limits for utterance detection.
  constructor(private readonly options: VoiceActivityDetectorOptions) {}

  // Classifies one audio frame and decides whether an utterance should commit.
  accept(frame: VoiceActivityFrameStats): VoiceActivityDecision {
    const durationMs = Math.max(0, frame.durationMs);
    const isSpeech = frame.rms >= this.options.speechRmsThreshold;
    let speechStarted = false;

    if (isSpeech) {
      if (!this.inSpeech) {
        this.inSpeech = true;
        this.speechMs = 0;
        this.silenceMs = 0;
        this.utteranceMs = 0;
        speechStarted = true;
      }

      this.speechMs += durationMs;
      this.silenceMs = 0;
      this.utteranceMs += durationMs;
    } else if (this.inSpeech) {
      this.silenceMs += durationMs;
      this.utteranceMs += durationMs;
    }

    const hasMinimumSpeech = this.speechMs >= this.options.minSpeechMs;
    const endedBySilence =
      this.inSpeech &&
      hasMinimumSpeech &&
      this.silenceMs >= this.options.endSilenceMs;
    const endedByDuration =
      this.inSpeech &&
      hasMinimumSpeech &&
      this.utteranceMs >= this.options.maxUtteranceMs;

    const decision: VoiceActivityDecision = {
      speechStarted,
      shouldCommit: endedBySilence || endedByDuration,
      reason: endedBySilence
        ? 'silence'
        : endedByDuration
          ? 'max_duration'
          : undefined,
      speechMs: this.speechMs,
      silenceMs: this.silenceMs,
      utteranceMs: this.utteranceMs,
    };

    if (decision.shouldCommit) {
      this.reset();
    }

    return decision;
  }

  // Clears the detector state after an utterance commits.
  reset() {
    this.inSpeech = false;
    this.speechMs = 0;
    this.silenceMs = 0;
    this.utteranceMs = 0;
  }
}

// Computes normalized RMS for PCM16 audio samples.
export function computePcm16Rms(samples: Int16Array): number {
  if (samples.length === 0) {
    return 0;
  }

  let sumSquares = 0;
  for (const sample of samples) {
    const normalized = sample / 32768;
    sumSquares += normalized * normalized;
  }

  return Math.sqrt(sumSquares / samples.length);
}
