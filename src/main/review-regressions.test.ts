import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { transformSync } from 'esbuild'
import { defaultAppSettings, IPC_CHANNELS } from '../shared/ipc-contract'
import { appSettingsSchema } from '../shared/schemas'
import { createDocumentAccess } from './documents/access'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
import * as endpointing from './services/stt/endpointing'

// Exercise real modules with fake OS/provider boundaries; no Electron process,
// real credentials, microphone or download is needed for failure injection.
function load(file: string, mocks: Record<string, unknown>, globals: Record<string, unknown> = {}): any {
  const filename = resolve(file)
  const nativeRequire = createRequire(filename)
  const code = transformSync(readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' }).code
  const module = { exports: {} }
  runInNewContext(code, {
    module, exports: module.exports, Buffer, Error, console, process, setTimeout, clearTimeout,
    __dirname: dirname(filename),
    require: (name: string) => name in mocks ? mocks[name] : nativeRequire(name),
    ...globals
  }, { filename })
  return module.exports
}

async function speechWorkerHarness() {
  const sent: any[] = []
  const decodes: Array<{ resolve: (value: { text: string }) => void; reject: (error: Error) => void }> = []
  const parentPort = Object.assign(new EventEmitter(), { postMessage: (message: unknown) => sent.push(message) })
  load('src/main/services/stt/local-worker.ts', {
    './endpointing': endpointing,
    './hallucinations': { isMeaningfulTranscript: () => true },
    './whisper': {
      DEFAULT_STT_MODEL_ID: 'fixture', isSttModelCachedAt: () => true,
      getAsrPipeline: async () => () => new Promise((resolve, reject) => decodes.push({ resolve, reject }))
    }
  }, { process: { parentPort, exit: () => {} } })
  const send = (data: unknown) => parentPort.emit('message', { data })
  const flush = () => new Promise(resolve => setImmediate(resolve))
  send({ type: 'init', modelId: 'fixture', cacheDir: '', allowDownload: false, language: 'en' })
  await flush()
  function speech(source: string, silence: boolean) {
    for (let frame = 0; frame < (silence ? 50 : 10); frame++) {
      const samples = new Int16Array(1600)
      if (frame < 10) samples.fill(5000)
      send({ type: 'audio', source, pcm: samples.buffer })
    }
  }
  return { sent, decodes, send, flush, speech }
}

test('CR-009 stop drains queued and in-flight finals before acknowledging shutdown', async () => {
  const worker = await speechWorkerHarness()
  worker.send({ type: 'start', source: 'system', generation: 1 })
  worker.speech('system', true)
  worker.speech('system', false)
  worker.send({ type: 'stop', source: 'system', generation: 1 })
  assert.equal(worker.sent.some(event => event.type === 'stopped'), false)
  worker.decodes[0].resolve({ text: 'First turn' })
  await worker.flush()
  assert.equal(worker.decodes.length, 2)
  assert.equal(worker.sent.some(event => event.type === 'stopped'), false)
  worker.decodes[1].resolve({ text: 'Last turn before stopping' })
  await worker.flush()
  assert.deepEqual(worker.sent.filter(event => ['final', 'stopped'].includes(event.type)).map(event => event.type), ['final', 'final', 'stopped'])
})

for (const outcome of ['final', 'error']) {
  test(`CR-009 restart suppresses an old in-flight ${outcome}`, async () => {
    const worker = await speechWorkerHarness()
    worker.send({ type: 'start', source: 'system', generation: 1 })
    worker.speech('system', true)
    worker.send({ type: 'stop', source: 'system', generation: 1 })
    worker.send({ type: 'start', source: 'system', generation: 2 })
    if (outcome === 'final') worker.decodes[0].resolve({ text: 'Stale turn' })
    else worker.decodes[0].reject(new Error('Stale failure'))
    await worker.flush()
    assert.equal(worker.sent.some(event => event.type === 'final' || event.type === 'decode-error'), false)
    worker.speech('system', true)
    worker.decodes[1].resolve({ text: 'Current turn' })
    await worker.flush()
    const finals = worker.sent.filter(event => event.type === 'final')
    assert.equal(finals.length, 1)
    assert.equal(finals[0].generation, 2)
    assert.equal(finals[0].text, 'Current turn')
  })
}

test('CR-009 main process waits for current-generation stop acknowledgement', () => {
  const posted: any[] = []
  const events: any[] = []
  const timers: Array<{ callback: () => void; ms: number }> = []
  const child = Object.assign(new EventEmitter(), { postMessage: (message: unknown) => posted.push(message), kill: () => {} })
  const { createLocalSttService } = load('src/main/services/stt/local.ts', {
    electron: { app: { getPath: () => tmpdir() }, utilityProcess: { fork: () => child } },
    '../../../shared/ipc-contract': { IPC_CHANNELS },
    '../../utils/safe-send': { safeSend: (_wc: unknown, channel: string, payload: unknown) => events.push({ channel, payload }) },
    './whisper': { DEFAULT_STT_MODEL_ID: 'fixture', isSttModelCachedAt: () => true, sttModelInfo: () => ({ sizeLabel: 'test' }) }
  }, {
    setTimeout: (callback: () => void, ms: number) => { timers.push({ callback, ms }); return timers.length }, clearTimeout: () => {}
  })
  const service = createLocalSttService({}, { onUnavailable: () => {} })
  service.start('system')
  service.stop('system')
  assert.equal(posted.some(message => message.type === 'dispose'), false)
  service.start('system')
  service.stop('system')
  child.emit('message', { type: 'stopped', source: 'system', generation: 1 })
  child.emit('message', { type: 'final', source: 'system', generation: 1, text: 'stale' })
  assert.equal(posted.some(message => message.type === 'dispose'), false)
  assert.equal(events.some(event => event.channel === IPC_CHANNELS.sttFinal), false)
  child.emit('message', { type: 'final', source: 'system', generation: 2, text: 'current' })
  child.emit('message', { type: 'stopped', source: 'system', generation: 2 })
  assert.equal(events.find(event => event.channel === IPC_CHANNELS.sttFinal).payload.text, 'current')
  assert.equal(posted.filter(message => message.type === 'dispose').length, 1)
  service.dispose()
  const stalled = createLocalSttService({}, { onUnavailable: () => {} })
  stalled.start('system')
  stalled.stop('system')
  timers.filter(timer => timer.ms === 30000).at(-1)!.callback()
  assert.equal(events.some(event => event.channel === IPC_CHANNELS.sttError && /Timed out/.test(event.payload.error)), true)
  assert.equal(posted.filter(message => message.type === 'dispose').length, 2)
  stalled.dispose()
})

test('CR-002 document reads require picker authorization and the owning main frame', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sarathi-access-'))
  try {
    const selected = join(dir, 'selected.txt')
    const unrelated = join(dir, 'unrelated.txt')
    writeFileSync(selected, 'selected fixture')
    writeFileSync(unrelated, 'unrelated fixture')
    const mainFrame = {}
    const sender = { mainFrame, isDestroyed: () => false } as unknown as WebContents
    const event = { sender, senderFrame: mainFrame } as IpcMainInvokeEvent
    const access = createDocumentAccess(sender)
    assert.throws(() => access.resolve(event, selected), /Select this document/)
    assert.equal(access.resolve(event, access.grant(selected)), selected)
    assert.throws(() => access.resolve(event, unrelated), /Select this document/)
    assert.throws(() => access.resolve({ ...event, sender: {} } as IpcMainInvokeEvent, selected), /Unauthorized/)
    assert.throws(() => access.resolve({ ...event, senderFrame: {} } as IpcMainInvokeEvent, selected), /Unauthorized/)
    assert.throws(() => access.resolve(event, null), /Invalid document/)
    assert.throws(() => access.resolve(event, join(dir, 'sub', '..', 'unrelated.txt')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CR-003 unavailable or throwing encryption refuses writes and preserves saved settings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sarathi-storage-'))
  try {
    let available = false
    let throws = false
    const safeStorage = {
      isEncryptionAvailable: () => { if (throws) throw new Error('locked'); return available },
      encryptString: () => Buffer.from('encrypted-fixture-with-padding!'),
      decryptString: () => 'test-key'
    }
    const store = load('src/main/store.ts', {
      electron: { app: { getPath: () => dir }, safeStorage },
      '../shared/ipc-contract': { defaultAppSettings },
      '../shared/schemas': { appSettingsSchema }
    })
    const settings = { ...defaultAppSettings, openaiApiKey: 'test-key' }
    const path = join(dir, 'Sarathi-settings.json')
    assert.throws(() => store.writeSettings(settings), /Secure key storage is unavailable/)
    assert.equal(existsSync(path), false)
    available = true
    store.writeSettings(settings)
    const saved = readFileSync(path, 'utf8')
    assert.equal(saved.includes('test-key'), false)
    assert.equal(store.readSettings().openaiApiKey, 'test-key')
    throws = true
    assert.throws(() => store.writeSettings(settings), /Secure key storage is unavailable/)
    assert.equal(readFileSync(path, 'utf8'), saved)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

for (const source of ['mic', 'system']) {
  for (const stage of ['media', 'resume', 'processor']) {
    test(`CR-004 ${source} failure at ${stage} releases resources and permits restart`, async () => {
      let fail = true
      let stops = 0
      let liveTracks = 0
      let liveContexts = 0
      const acquire = async () => {
        if (fail && stage === 'media') throw new Error('injected media failure')
        liveTracks++
        let stopped = false
        const track = { stop: () => { if (!stopped) liveTracks--; stopped = true }, addEventListener: () => {} }
        return { getTracks: () => [track], getAudioTracks: () => [track], getVideoTracks: () => [] }
      }
      class FakeContext {
        constructor() { liveContexts++ }
        async resume() { if (fail && stage === 'resume') throw new Error('injected resume failure') }
        close() { liveContexts-- }
      }
      const pipeline = {
        getSystemAudioStream: acquire,
        resetSourceSampleQueue: () => {}, resetChunkCounter: () => {}, drainSourceSampleQueue: () => {},
        buildAudioProcessor: async () => {
          if (fail && stage === 'processor') throw new Error('injected processor failure')
          return { disconnect: () => {} }
        },
        stopAudioResources: (context: any, stream: any, processor: any) => {
          processor?.disconnect(); context?.close(); stream?.getTracks().forEach((track: any) => track.stop())
        }
      }
      const { createAudioCapture } = load('src/renderer/src/features/audio/capture.ts', {
        './audio-pipeline': { createAudioPipeline: () => pipeline }
      }, {
        AudioContext: FakeContext,
        navigator: { mediaDevices: { getUserMedia: acquire } },
        window: { sarathi: { sttStart: async () => ({ success: true }), sttStop: async () => { stops++ } } }
      })
      const capture = createAudioCapture()
      const start = source === 'mic' ? capture.startMic : capture.startSystem
      await assert.rejects(start(), /injected/)
      assert.equal(stops, 1)
      assert.equal(liveTracks, 0)
      assert.equal(liveContexts, 0)
      fail = false
      await start()
      assert.equal(liveTracks, 1)
      await capture.stopAll()
      assert.equal(stops, 2)
      assert.equal(liveTracks, 0)
      assert.equal(liveContexts, 0)
    })
  }
}

test('CR-005 initial system failure exposes recovery, including a failed retry', async () => {
  const states: any[] = []
  let effect: (() => (() => void)) | undefined
  let fail = true
  const noOp = () => {}
  const state = new Proxy({}, { get: () => noOp })
  const useOverlayStore = Object.assign((select: (value: any) => unknown) => select(state), {
    subscribe: () => noOp, getState: () => state
  })
  const { useLiveTranscription } = load('src/renderer/src/features/overlay/useLiveTranscription.ts', {
    react: {
      useState: (initial: unknown) => {
        const index = states.length
        states.push(initial)
        return [initial, (value: any) => { states[index] = typeof value === 'function' ? value(states[index]) : value }]
      },
      useRef: (current: unknown) => ({ current }),
      useEffect: (callback: () => (() => void)) => { effect = callback }
    },
    sonner: { toast: noOp },
    '../audio/capture': { createAudioCapture: () => ({
      startSystem: async () => { if (fail) throw new Error('Missing key') },
      stopSystem: async () => {}, stopAll: async () => {}
    }) },
    '../../stores/overlay-store': { useOverlayStore },
    '../../stores/session-store': { useSessionStore: { getState: () => ({ form: {} }) } },
    './question-detector': {}, './ask-ai': {}
  }, {
    window: { sarathi: { onSttStatus: () => noOp, onSttPartial: () => noOp, onSttFinal: () => noOp, onSttError: () => noOp } },
    setInterval: () => 1, clearInterval: noOp
  })
  const hook = useLiveTranscription()
  const cleanup = effect!()
  try {
    await Promise.resolve()
    assert.equal(states[2], true)
    assert.equal(states[0].system, 'Missing key')
    await hook.retrySystemAudio()
    assert.equal(states[2], true)
    fail = false
    await hook.retrySystemAudio()
    assert.equal(states[2], false)
    assert.equal(states[0].system, null)
  } finally {
    cleanup()
  }
})

for (const cached of [true, false]) {
  test(`CR-006 no-key fallback uses selected model; cached=${cached}`, () => {
    let selected = 'default'
    let started = false
    const local = {
      configure: ({ modelId }: { modelId: string }) => { selected = modelId },
      modelStatus: () => ({ phase: selected === 'selected' && cached ? 'ready' : 'missing' }),
      start: () => { started = true; return { success: true } }
    }
    const { createSttService } = load('src/main/services/stt/router.ts', {
      '../../../shared/ipc-contract': { IPC_CHANNELS },
      '../../utils/safe-send': { safeSend: () => {} },
      './local': { createLocalSttService: () => local },
      './assemblyai': { createAssemblyAiSttService: () => ({}) }
    })
    const service = createSttService({}, () => ({ ...defaultAppSettings, sttFallbackToLocal: true, sttModel: 'selected' }))
    assert.equal(service.start('system').success, cached)
    assert.equal(started, cached)
  })
}

test('CR-008 first download does not receive a premature offline initialization failure', async () => {
  const { createLocalSttService } = load('src/main/services/stt/local.ts', {
    electron: {
      app: { getPath: () => tmpdir() },
      utilityProcess: { fork: () => {
        const child = Object.assign(new EventEmitter(), {
          postMessage: (message: any) => {
            if (message.type === 'init') queueMicrotask(() => child.emit('message', message.allowDownload
              ? { type: 'model-ready' }
              : { type: 'model-error', error: 'The local speech model is not downloaded yet.', cached: false }))
          },
          kill: () => {}
        })
        return child
      } }
    },
    '../../../shared/ipc-contract': { IPC_CHANNELS },
    '../../utils/safe-send': { safeSend: () => {} },
    './whisper': { DEFAULT_STT_MODEL_ID: 'default', isSttModelCachedAt: () => false, sttModelInfo: () => ({ sizeLabel: 'test' }) }
  })
  const service = createLocalSttService({}, { onUnavailable: () => {} })
  try { assert.equal((await service.ensureModel()).ok, true) }
  finally { service.dispose() }
})

for (const stop of ['exit', 'dispose', 'configure']) {
  test(`CR-007 download settles on ${stop} and ignores stale worker messages`, { timeout: 2000 }, async () => {
    const children: EventEmitter[] = []
    const { createLocalSttService } = load('src/main/services/stt/local.ts', {
      electron: {
        app: { getPath: () => tmpdir() },
        utilityProcess: { fork: () => {
          const child = Object.assign(new EventEmitter(), { postMessage: () => {}, kill: () => {} })
          children.push(child)
          return child
        } }
      },
      '../../../shared/ipc-contract': { IPC_CHANNELS },
      '../../utils/safe-send': { safeSend: () => {} },
      './whisper': { DEFAULT_STT_MODEL_ID: 'default', isSttModelCachedAt: () => false, sttModelInfo: () => ({ sizeLabel: 'test' }) }
    })
    const service = createLocalSttService({}, { onUnavailable: () => {} })
    const pending = service.ensureModel()
    const first = children[0]
    if (stop === 'exit') first.emit('exit', 1)
    else if (stop === 'dispose') service.dispose()
    else service.configure({ modelId: 'different', language: null })
    assert.equal((await pending).ok, false)
    if (stop === 'dispose') {
      assert.equal((await service.ensureModel()).ok, false)
    } else {
      let settled = false
      const retry = service.ensureModel().then((result: any) => { settled = true; return result })
      first.emit('message', { type: 'model-ready' })
      await Promise.resolve()
      assert.equal(settled, false)
      children[1].emit('message', { type: 'model-ready' })
      assert.equal((await retry).ok, true)
      service.dispose()
    }
  })
}

test('RISK-004 LibreOffice PATH probing times out stuck subprocesses', async () => {
  const children: any[] = []
  const timers: Array<{ callback: () => void; ms: number }> = []
  const { findSofficePath } = load('src/main/documents/convert-to-pdf.ts', {
    child_process: {
      spawn: () => {
        const child = Object.assign(new EventEmitter(), { kill: () => { child.killed = true }, killed: false })
        children.push(child)
        return child
      }
    },
    fs: { existsSync: () => false, mkdtempSync }
  }, {
    setTimeout: (callback: () => void, ms: number) => { timers.push({ callback, ms }); return timers.length },
    clearTimeout: () => {}
  })
  const pending = findSofficePath()
  timers[0].callback()
  await Promise.resolve()
  timers[1].callback()
  assert.equal(await pending, null)
  assert.deepEqual(timers.map(timer => timer.ms), [3000, 3000])
  assert.equal(children.length, 2)
  assert.equal(children.every(child => child.killed), true)
})

test('RISK-004 LibreOffice conversion times out and kills stuck subprocesses', async () => {
  const children: any[] = []
  const timers: Array<{ callback: () => void; ms: number }> = []
  const { convertToPdf } = load('src/main/documents/convert-to-pdf.ts', {
    child_process: {
      spawn: (command: string, args: string[]) => {
        const child = Object.assign(new EventEmitter(), {
          stderr: new EventEmitter(),
          kill: () => { child.killed = true },
          killed: false,
          command,
          args
        })
        children.push(child)
        if (args[0] === '--version') Promise.resolve().then(() => child.emit('close', 0))
        return child
      }
    },
    fs: { existsSync: (path: string) => path.includes('LibreOffice'), mkdtempSync: () => join(tmpdir(), 'sarathi-convert-test') }
  }, {
    setTimeout: (callback: () => void, ms: number) => { timers.push({ callback, ms }); return timers.length },
    clearTimeout: () => {}
  })
  const pending = convertToPdf(join(tmpdir(), 'deck.pptx'))
  for (let attempt = 0; attempt < 5 && !timers.some(timer => timer.ms === 60000); attempt++) {
    await Promise.resolve()
  }
  const conversionTimer = timers.find(timer => timer.ms === 60000)
  assert.ok(conversionTimer)
  conversionTimer.callback()
  assert.equal((await pending).error, 'LibreOffice conversion timed out.')
  assert.equal(children.length, 2)
  assert.equal(children[1].killed, true)
  assert.equal(children[1].args[0], '--headless')
  assert.equal(children[1].args[1], '--convert-to')
  assert.equal(children[1].args[2], 'pdf')
})
