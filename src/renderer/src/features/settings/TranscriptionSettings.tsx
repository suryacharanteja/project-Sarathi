import { useEffect, useRef, useState } from 'react'
import { CloudOff, Download, HardDrive, Loader2, Check, Mic, Square } from 'lucide-react'
import type { AppSettings } from '@shared/ipc-contract'
import { STT_MODELS, sttModelInfo, type LocalSttModelStatus, type SttModelId } from '@shared/stt-types'
import { Dropdown } from '../../components/ui/dropdown'
import { Toggle } from '../../components/ui/toggle'
import { createAudioCapture } from '../audio/capture'

const ENGINE_OPTIONS = [
  { value: 'assemblyai', label: 'AssemblyAI (cloud)' },
  { value: 'local', label: 'Local (on this device)' }
]

/**
 * A deliberately short list. Whisper is multilingual, but every extra option
 * here is one more way to end up transcribing an English interview with the
 * wrong language forced — which is exactly the failure the AssemblyAI config
 * pinned `universal-streaming-english` to avoid. English stays the default;
 * "Detect automatically" is the escape hatch, not the default.
 */
const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'auto', label: 'Detect automatically' },
  { value: 'hi', label: 'Hindi' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' }
]

const TEST_TIMEOUT_MS = 8000

function formatBytes(bytes: number | null): string {
  if (bytes === null) return ''
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`
}

export function TranscriptionSettings({
  settings,
  onChange
}: {
  settings: AppSettings
  onChange: (patch: Partial<AppSettings>) => void
}): React.JSX.Element {
  const [status, setStatus] = useState<LocalSttModelStatus | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const captureRef = useRef<ReturnType<typeof createAudioCapture> | null>(null)
  const testTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recordingRef = useRef(false)
  // ALL finalized turns for the current test, not just the first — a real
  // video reproduction of this bug (user said "Hello, mic testing") showed
  // the test ending on the FIRST final ("Hello.") and silently discarding
  // the rest, because it used to call finishTest() the instant any final
  // arrived. That made a genuinely working mic look broken/incomplete.
  const finalsRef = useRef<string[]>([])
  // Latest in-flight partial, committed too on stop so a last sentence that
  // never got finalized isn't lost.
  const partialRef = useRef('')

  useEffect(() => {
    window.sarathi.sttGetModelStatus().then(setStatus)
    return window.sarathi.onSttModelStatus(setStatus)
  }, [])

  // Whichever engine is currently configured (AssemblyAI, or local once
  // downloaded) — this is a real, self-contained end-to-end check the user
  // can run from Settings, not just a "does it download" check, and it
  // doesn't touch the live overlay/call state at all.
  useEffect(() => {
    const unsubPartial = window.sarathi.onSttPartial((event) => {
      if (event.source !== 'mic' || !recordingRef.current) return
      partialRef.current = event.text ?? ''
    })
    const unsubFinal = window.sarathi.onSttFinal((event) => {
      if (event.source !== 'mic' || !recordingRef.current) return
      // Accumulate and KEEP RECORDING — do not end the test on the first
      // final. AssemblyAI finalizes a turn after a short pause, and a test
      // phrase spoken with any natural pause was being cut off mid-sentence.
      if (event.text) finalsRef.current.push(event.text)
      partialRef.current = ''
    })
    const unsubError = window.sarathi.onSttError((event) => {
      if (event.source !== 'mic' || !recordingRef.current) return
      commitTest(event.error)
    })
    return () => {
      unsubPartial()
      unsubFinal()
      unsubError()
      stopCaptureQuietly()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function stopCaptureQuietly(): void {
    if (testTimeoutRef.current) {
      clearTimeout(testTimeoutRef.current)
      testTimeoutRef.current = null
    }
    captureRef.current?.stopMic().catch(() => {})
    // Instance intentionally NOT nulled: createAudioCapture gives each
    // instance its own start/stop serialization queue, so a discarded
    // instance's queued stop could land after the next instance's start and
    // kill the fresh connection. Reusing one instance keeps every start/stop
    // ordered on a single queue. doStartMic early-returns when already active,
    // so reuse across repeated tests is safe.
    window.sarathi.sttStop('mic')
  }

  /**
   * Stops capture and COMMITS everything heard so far — the previous version
   * discarded whatever had been said whenever this was reached via the Stop
   * button (it passed `null` as the "result"). Stopping now always reports
   * the full accumulated speech, matching what actually happened.
   */
  function commitTest(error?: string): void {
    if (!recordingRef.current) return
    recordingRef.current = false
    stopCaptureQuietly()
    setTesting(false)

    const spoken = [...finalsRef.current, partialRef.current].join(' ').replace(/\s+/g, ' ').trim()
    finalsRef.current = []
    partialRef.current = ''

    if (error) {
      setTestError(error)
    } else {
      setTestResult(spoken || 'No speech detected — try again and speak right after clicking Test.')
    }
  }

  async function handleTestMic(): Promise<void> {
    setTestResult(null)
    setTestError(null)
    finalsRef.current = []
    partialRef.current = ''
    recordingRef.current = true
    setTesting(true)
    // No explicit sttStart here: capture.startMic() already performs it (see
    // doStartMic in features/audio/capture.ts). Doing both started the socket
    // twice within milliseconds, and assemblyai.ts's start() only treats a
    // re-entry as a no-op once `streaming` is true — which is set in
    // ws.on('open'). Inside the connect window the second call instead hit
    // terminateQuietly() → ws.terminate() on a CONNECTING socket, surfacing as
    // "WebSocket was closed before the connection was established". It was a
    // timing race, so it only failed when the socket was slow to open.
    // startMic() throws the real reason, which the catch below reports.
    const capture = captureRef.current ?? createAudioCapture()
    captureRef.current = capture
    try {
      await capture.startMic()
    } catch (err) {
      recordingRef.current = false
      setTesting(false)
      setTestError(err instanceof Error ? err.message : 'Could not access the microphone.')
      stopCaptureQuietly()
      return
    }
    testTimeoutRef.current = setTimeout(() => commitTest(), TEST_TIMEOUT_MS)
  }

  function handleStopTest(): void {
    commitTest()
  }

  /**
   * The model choice is persisted the moment it changes, not on Save. Whether
   * the weights are already on disk is answered by the main process from the
   * *stored* setting, so a picker that only lived in local state would show
   * "Ready" for the wrong checkpoint until the user hit Save.
   */
  async function handleModelChange(value: string): Promise<void> {
    const modelId = value as SttModelId
    onChange({ sttModel: modelId })
    setDownloadError(null)
    await window.sarathi.setSettings({ sttModel: modelId })
    setStatus(await window.sarathi.sttGetModelStatus())
  }

  async function handleDownload(): Promise<void> {
    setDownloading(true)
    setDownloadError(null)
    const result = await window.sarathi.sttEnsureModel()
    setDownloading(false)
    if (!result.ok) setDownloadError(result.error ?? 'Download failed.')
  }

  const ready = status?.phase === 'ready'
  const percent = status?.phase === 'downloading' ? status.percent : null

  return (
    <div className="space-y-3 rounded-lg border border-black/10 bg-black/[0.02] p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-900">
        <HardDrive size={13} /> Transcription
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600">Speech engine</label>
        <Dropdown
          value={settings.sttEngine}
          options={ENGINE_OPTIONS}
          onChange={(value) => onChange({ sttEngine: value as AppSettings['sttEngine'] })}
        />
        <p className="mt-1 text-[11px] leading-snug text-neutral-500">
          {settings.sttEngine === 'local'
            ? 'Speech is transcribed by Whisper on this machine. No audio is uploaded anywhere.'
            : 'Audio is streamed to AssemblyAI for transcription — fast and accurate as long as the service is reachable.'}
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600">Spoken language</label>
        <Dropdown
          value={settings.sttLanguage}
          options={LANGUAGE_OPTIONS}
          onChange={(value) => onChange({ sttLanguage: value })}
        />
      </div>

      <div className="space-y-2 rounded-md border border-black/10 bg-white/70 p-2.5">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Offline backup model</label>
          <Dropdown
            value={settings.sttModel}
            options={STT_MODELS.map((model) => ({
              value: model.id,
              label: `${model.label} · ${model.sizeLabel}`
            }))}
            onChange={handleModelChange}
          />
          <p className="mt-1 text-[11px] leading-snug text-neutral-500">{sttModelInfo(settings.sttModel).note}</p>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-black/5 pt-2">
          <span className="text-xs font-medium text-neutral-700">Weights</span>
          {ready ? (
            <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
              <Check size={12} strokeWidth={3} /> Ready
            </span>
          ) : (
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-1 rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60"
            >
              {downloading ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
              {downloading ? 'Downloading…' : `Download ${sttModelInfo(settings.sttModel).sizeLabel}`}
            </button>
          )}
        </div>

        {percent !== null && (
          <div className="space-y-1">
            <div className="h-1 w-full overflow-hidden rounded-full bg-black/10">
              <div className="h-full bg-neutral-900 transition-all" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-[10px] text-neutral-500">
              {percent}%
              {status?.totalBytes ? ` · ${formatBytes(status.loadedBytes)} of ${formatBytes(status.totalBytes)}` : ''}
            </p>
          </div>
        )}

        {status?.phase === 'loading' && <p className="text-[10px] text-neutral-500">Loading the model into memory…</p>}

        <p className="text-[11px] leading-snug text-neutral-500">
          Downloaded once, kept on this device. This is what Sarathi automatically switches to if
          AssemblyAI becomes unreachable mid-call — download it now so the fallback is ready
          before you need it, not during an interview.
        </p>

        {(downloadError || status?.error) && (
          <p className="text-[11px] leading-snug text-red-600">{downloadError ?? status?.error}</p>
        )}
      </div>

      <div className="space-y-1.5 border-t border-black/5 pt-2">
        <button
          type="button"
          onClick={testing ? handleStopTest : handleTestMic}
          className={`flex w-full items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
            testing ? 'bg-red-500/10 text-red-600 hover:bg-red-500/20' : 'bg-neutral-900 text-white hover:bg-neutral-700'
          }`}
        >
          {testing ? (
            <>
              <Square size={11} /> Stop test
            </>
          ) : (
            <>
              <Mic size={11} /> Test microphone
            </>
          )}
        </button>
        {testing && <p className="text-center text-[11px] text-neutral-500">Listening — say a few words…</p>}
        {testResult && <p className="text-[11px] leading-snug text-neutral-700">Heard: "{testResult}"</p>}
        {testError && <p className="text-[11px] leading-snug text-red-600">{testError}</p>}
        <p className="text-[11px] leading-snug text-neutral-500">
          Runs a real ~8-second transcription through whichever engine is configured above —
          confirms the mic, the engine, and (if downloaded) the offline model all actually work.
        </p>
      </div>

      <Toggle
        checked={settings.sttFallbackToLocal}
        onChange={(value) => onChange({ sttFallbackToLocal: value })}
        label="Fall back to local Whisper"
        hint="If AssemblyAI becomes unreachable mid-call — outage, invalid key, no internet — Sarathi switches that audio source to the local model (once downloaded) for the rest of the call and tells you it did. Turn this off to only ever use AssemblyAI."
      />
      {!settings.sttFallbackToLocal && settings.sttEngine === 'assemblyai' && (
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-amber-700">
          <CloudOff size={12} className="mt-0.5 shrink-0" />
          No fallback. If AssemblyAI becomes unreachable, that audio source won&apos;t be transcribed
          at all until it recovers.
        </p>
      )}
    </div>
  )
}
