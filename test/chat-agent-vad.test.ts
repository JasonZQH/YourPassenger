import assert from 'node:assert/strict';

import { VoiceActivityDetector } from '../apps/chat-agent-service/src/chat-agent/voice-activity-detector';

function frame(rms: number, durationMs = 20) {
  return {
    rms,
    durationMs,
  };
}

function main() {
  const detector = new VoiceActivityDetector({
    speechRmsThreshold: 0.02,
    endSilenceMs: 180,
    minSpeechMs: 120,
    maxUtteranceMs: 10_000,
  });

  for (let i = 0; i < 20; i += 1) {
    const result = detector.accept(frame(0.001));
    assert.equal(result.speechStarted, false);
    assert.equal(result.shouldCommit, false);
  }

  const firstSpeech = detector.accept(frame(0.08));
  assert.equal(firstSpeech.speechStarted, true);
  assert.equal(firstSpeech.shouldCommit, false);

  for (let i = 0; i < 6; i += 1) {
    detector.accept(frame(0.08));
  }

  let commitCount = 0;
  for (let i = 0; i < 9; i += 1) {
    const result = detector.accept(frame(0.001));
    if (result.shouldCommit) {
      commitCount += 1;
    }
  }

  assert.equal(commitCount, 1);

  for (let i = 0; i < 10; i += 1) {
    const result = detector.accept(frame(0.001));
    assert.equal(result.shouldCommit, false);
  }

  console.log('chat-agent vad tests passed');
}

main();
