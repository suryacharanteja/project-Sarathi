/**
 * Turn endpointing for the local engine.
 *
 * AssemblyAI's streaming API decided turn boundaries server-side (see the
 * `max_turn_silence` / `end_of_turn_confidence_threshold` query params in
 * `assemblyai.ts`). Whisper is a batch model: it transcribes a finished span
 * of audio and has no notion of a turn. Something has to draw the boundary,
 * and everything downstream — the silence debounce, the completeness check,
 * duplicate suppression in `useLiveTranscription` — was tuned against
 * AssemblyAI's turn shape. So this module reproduces that shape rather than
 * inventing a new one: the same 2.5 s end-of-turn silence, and a hard ceiling
 * so a monologue still yields finals instead of one 10-minute utterance.
 *
 * The RMS-window scan is the same technique Skill Recorder uses offline
 * (`electron/narration/audio-analysis.ts`), applied incrementally to a live
 * stream instead of to a whole file.
 */

export const SAMPLE_RATE = 16_000

/** -38 dBFS. Below the quietest speech, above room tone on a typical headset. */
const SPEECH_RMS_THRESHOLD = 10 ** (-38 / 20)
/** Once speech has started, tolerate a lower level before calling it silence.
 *  Hysteresis stops a trailing-off word from being clipped as end-of-turn. */
const RELEASE_RMS_THRESHOLD = 10 ** (-44 / 20)
/** 20 ms analysis window, matching the offline detector. */
const WINDOW_MS = 20
const WINDOW_SAMPLES = Math.round((SAMPLE_RATE * WINDOW_MS) / 1000)

/** Matches AssemblyAI's tuned `max_turn_silence=2500`. */
export const END_OF_TURN_SILENCE_MS = 2500
/** Ignore sub-300 ms blips (a key click, a cough) so they never open a turn. */
export const MIN_SPEECH_MS = 300
/** Whisper's receptive window is 30 s; cut before it so no audio is truncated. */
export const MAX_UTTERANCE_MS = 25_000
/** Audio kept from before speech onset so the first phoneme isn't clipped. */
export const PRE_ROLL_MS = 300

export type TurnEvent =
  | { type: 'none' }
  | { type: 'speech-start' }
  | { type: 'end-of-turn'; reason: 'silence' | 'max-length' }

export interface EndpointerState {
  /** Samples held for the utterance in progress, including pre-roll. */
  buffer: Float32Array[]
  bufferSamples: number
  /** Rolling pre-roll kept while idle, so onset isn't clipped. */
  preRoll: Float32Array[]
  preRollSamples: number
  speaking: boolean
  /** Consecutive silent samples seen since the last voiced window. */
  trailingSilenceSamples: number
  /** Voiced samples accumulated in this utterance — gates MIN_SPEECH_MS. */
  voicedSamples: number
}

export function createEndpointerState(): EndpointerState {
  return {
    buffer: [],
    bufferSamples: 0,
    preRoll: [],
    preRollSamples: 0,
    speaking: false,
    trailingSilenceSamples: 0,
    voicedSamples: 0
  }
}

const PRE_ROLL_SAMPLES = Math.round((SAMPLE_RATE * PRE_ROLL_MS) / 1000)
const MIN_SPEECH_SAMPLES = Math.round((SAMPLE_RATE * MIN_SPEECH_MS) / 1000)
const END_OF_TURN_SAMPLES = Math.round((SAMPLE_RATE * END_OF_TURN_SILENCE_MS) / 1000)
const MAX_UTTERANCE_SAMPLES = Math.round((SAMPLE_RATE * MAX_UTTERANCE_MS) / 1000)

function rms(samples: Float32Array, from: number, to: number): number {
  let energy = 0
  for (let i = from; i < to; i += 1) energy += samples[i] * samples[i]
  return Math.sqrt(energy / Math.max(1, to - from))
}

/**
 * Feed one frame of 16 kHz mono audio and learn whether a turn just opened or
 * closed. The caller owns the decode; this only decides boundaries.
 */
export function pushFrame(state: EndpointerState, frame: Float32Array): TurnEvent {
  if (frame.length === 0) return { type: 'none' }

  let voiced = 0
  let silent = 0
  for (let offset = 0; offset < frame.length; offset += WINDOW_SAMPLES) {
    const end = Math.min(frame.length, offset + WINDOW_SAMPLES)
    const level = rms(frame, offset, end)
    const threshold = state.speaking ? RELEASE_RMS_THRESHOLD : SPEECH_RMS_THRESHOLD
    if (level >= threshold) voiced += end - offset
    else silent += end - offset
  }

  if (!state.speaking) {
    // Idle: keep a short rolling pre-roll so the utterance doesn't start
    // mid-word once speech is confirmed.
    state.preRoll.push(frame)
    state.preRollSamples += frame.length
    while (state.preRollSamples - state.preRoll[0].length >= PRE_ROLL_SAMPLES) {
      state.preRollSamples -= state.preRoll.shift()!.length
    }
    if (voiced === 0) return { type: 'none' }

    state.speaking = true
    state.buffer = [...state.preRoll]
    state.bufferSamples = state.preRollSamples
    state.preRoll = []
    state.preRollSamples = 0
    state.voicedSamples = voiced
    state.trailingSilenceSamples = silent
    return { type: 'speech-start' }
  }

  state.buffer.push(frame)
  state.bufferSamples += frame.length
  state.voicedSamples += voiced
  state.trailingSilenceSamples = voiced > 0 ? silent : state.trailingSilenceSamples + silent

  if (state.bufferSamples >= MAX_UTTERANCE_SAMPLES) {
    return { type: 'end-of-turn', reason: 'max-length' }
  }
  if (state.trailingSilenceSamples >= END_OF_TURN_SAMPLES) {
    return { type: 'end-of-turn', reason: 'silence' }
  }
  return { type: 'none' }
}

/** True when the utterance in progress holds enough real speech to transcribe. */
export function hasEnoughSpeech(state: EndpointerState): boolean {
  return state.voicedSamples >= MIN_SPEECH_SAMPLES
}

/** Flatten the utterance in progress into one contiguous buffer. */
export function collectUtterance(state: EndpointerState): Float32Array {
  const out = new Float32Array(state.bufferSamples)
  let offset = 0
  for (const chunk of state.buffer) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

/**
 * Close the current utterance. A `max-length` cut keeps the tail as the seed of
 * the next utterance so a continuous monologue isn't chopped mid-word — a
 * `silence` cut has nothing worth keeping, so it resets clean.
 */
export function closeUtterance(state: EndpointerState, reason: 'silence' | 'max-length'): void {
  const carry = reason === 'max-length' ? state.buffer.slice(-2) : []
  state.buffer = []
  state.bufferSamples = 0
  state.voicedSamples = 0
  state.trailingSilenceSamples = 0
  state.speaking = false
  state.preRoll = carry
  state.preRollSamples = carry.reduce((sum, chunk) => sum + chunk.length, 0)
}

/** Convert the renderer's interleaved 16-bit PCM into Whisper's float input. */
export function pcm16ToFloat32(pcm: Int16Array): Float32Array {
  const out = new Float32Array(pcm.length)
  for (let i = 0; i < pcm.length; i += 1) out[i] = pcm[i] / 0x8000
  return out
}
