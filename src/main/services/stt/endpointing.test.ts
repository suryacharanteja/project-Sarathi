import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SAMPLE_RATE,
  closeUtterance,
  collectUtterance,
  createEndpointerState,
  hasEnoughSpeech,
  pcm16ToFloat32,
  pushFrame
} from './endpointing.ts'

/**
 * Turn boundaries are the one piece of genuinely new logic in the local engine
 * — everything else is either the Skill Recorder model code or a transport —
 * and they are what every downstream timing in `useLiveTranscription` assumes.
 * They are also pure functions over Float32Array, so they can be exercised with
 * synthetic audio and no model, no Electron, and no microphone.
 *
 * Run with:  npm run test:stt
 *
 * Executed by Node's own test runner with type stripping, so the import below
 * carries its `.ts` extension (Node's ESM resolver needs it) and this file is
 * excluded from the tsc project — see tsconfig.node.json.
 */

/** 100 ms, matching the frame size the renderer's audio pipeline emits. */
const FRAME = Math.round(SAMPLE_RATE * 0.1)

function tone(samples: number, amplitude: number): Float32Array {
  const out = new Float32Array(samples)
  for (let i = 0; i < samples; i += 1) {
    out[i] = Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE) * amplitude
  }
  return out
}

const speech = (): Float32Array => tone(FRAME, 0.25)
const silence = (): Float32Array => new Float32Array(FRAME)

test('speech alone never ends a turn', () => {
  const state = createEndpointerState()
  for (let i = 0; i < 10; i += 1) {
    assert.notEqual(pushFrame(state, speech()).type, 'end-of-turn')
  }
  assert.ok(hasEnoughSpeech(state))
})

test('a turn ends after ~2.5s of silence, matching the AssemblyAI gate', () => {
  const state = createEndpointerState()
  for (let i = 0; i < 10; i += 1) pushFrame(state, speech())

  let endedAtFrame = -1
  for (let i = 0; i < 40; i += 1) {
    if (pushFrame(state, silence()).type === 'end-of-turn') {
      endedAtFrame = i
      break
    }
  }
  // 100 ms frames, so frame 24-26 is 2.4-2.6 s of trailing silence.
  assert.ok(endedAtFrame >= 24 && endedAtFrame <= 26, `ended at frame ${endedAtFrame}`)
  assert.ok(collectUtterance(state).length > 10 * FRAME)
})

test('a sub-300ms blip never becomes a transcribable turn', () => {
  const state = createEndpointerState()
  for (let i = 0; i < 2; i += 1) pushFrame(state, speech())
  for (let i = 0; i < 30; i += 1) pushFrame(state, silence())
  assert.equal(hasEnoughSpeech(state), false)
})

test('pre-roll keeps the audio before speech onset', () => {
  const state = createEndpointerState()
  for (let i = 0; i < 20; i += 1) pushFrame(state, silence())

  assert.equal(pushFrame(state, speech()).type, 'speech-start')
  // ~300 ms of pre-roll plus the onset frame itself.
  assert.ok(state.bufferSamples >= FRAME * 3 && state.bufferSamples <= FRAME * 5)
})

test('a monologue is cut at the max-utterance ceiling, inside Whisper 30s window', () => {
  const state = createEndpointerState()
  let frames = 0
  let event = pushFrame(state, speech())
  while (event.type !== 'end-of-turn' && frames < 400) {
    event = pushFrame(state, speech())
    frames += 1
  }
  assert.equal(event.type, 'end-of-turn')
  assert.equal(event.type === 'end-of-turn' && event.reason, 'max-length')
  assert.ok(frames >= 244 && frames <= 254, `cut after ${frames} frames`)

  closeUtterance(state, 'max-length')
  // The tail seeds the next utterance so a continuous talker is not cut mid-word.
  assert.ok(state.preRollSamples > 0)
})

test('a quiet trailing word does not close the turn early (hysteresis)', () => {
  const state = createEndpointerState()
  for (let i = 0; i < 10; i += 1) pushFrame(state, speech())
  for (let i = 0; i < 10; i += 1) {
    // -40 dBFS: below the speech-onset threshold, above the release threshold.
    assert.notEqual(pushFrame(state, tone(FRAME, 0.01)).type, 'end-of-turn')
  }
})

test('pcm16 converts to the float range Whisper expects', () => {
  const converted = pcm16ToFloat32(Int16Array.from([0, 16384, -16384, 32767, -32768]))
  assert.equal(converted[0], 0)
  assert.ok(Math.abs(converted[1] - 0.5) < 1e-6)
  assert.ok(Math.abs(converted[2] + 0.5) < 1e-6)
  assert.ok(converted.every((value) => value >= -1 && value <= 1))
})
