import {
  app,
  desktopCapturer,
  dialog,
  ipcMain,
  screen,
  type BrowserWindow,
  type IpcMainEvent,
  type Rectangle
} from 'electron'
import {
  IPC_CHANNELS,
  type AppSettings,
  type AskAiRequest,
  type AskAiStartResult,
  type CreateSessionError,
  type CreateSessionResult,
  type ScreenshotCaptureResult,
  type SessionSummary,
  type SttStartResult,
  type UploadDocumentResult,
  type ExtractResumeResult,
  type GetDocumentFilePathResult,
  type GetDocumentHtmlResult,
  type ReadDocumentBytesResult,
  type ImportSlideSourceResult,
  type ExportSlidesResult,
  type CheckTurnCompleteRequest,
  type CheckTurnCompleteResult,
  type WindowResizeBounds
} from '../shared/ipc-contract'
import type { DesktopSource } from '../shared/stt-types'
import type { TranscriptMessage } from '../shared/transcript-types'
import type { Profile } from '../shared/profile-types'
import { readSettings, writeSettings } from './store'
import { askLlmWithFallback, type LlmError, type ProviderCandidate } from './services/llm/router'
import { LLM_FALLBACK_ORDER, DEFAULT_MODEL_BY_PROVIDER } from '../shared/session-types'
import { classifyTurn } from './services/llm/turn-completeness'
import { appendTranscriptEntry, createSession, getSession, getSessionTranscript, listSessions } from './sessions/store'
import { createProfile, getProfile, listProfiles, updateProfileSpeakingStyle } from './profiles/store'
import {
  gatherSpeakingStyleSource,
  generateSpeakingStyleProfile,
  generateSpeakingStyleFromPractice
} from './profiles/speaking-style'
import { detectQuestionType, isGeneralQuestion } from './services/llm/question-type-detector'
import type {
  SpeakingStyleStats,
  LearnSpeakingStyleResult,
  PracticeAnswerPayload
} from '../shared/ipc-contract'
import { createDocument, getDocument, listDocuments } from './documents/store'
import {
  extractText,
  extractDocxAsFormattedText,
  SUPPORTED_DOCUMENT_EXTENSIONS,
  UNSUPPORTED_TEXT
} from './documents/extract-text'
import { extractPptxSlides } from './documents/extract-pptx'
import { convertToPdf } from './documents/convert-to-pdf'
import { basename, extname } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import mammoth from 'mammoth'
import { createSttService } from './services/stt/router'
import type { LocalSttModelStatus } from '../shared/stt-types'
import { safeSend } from './utils/safe-send'
import {
  appSettingsSchema,
  askAiRequestSchema,
  createSessionFormSchema,
  sttSourceSchema
} from '../shared/schemas'

const PROVIDER_LABELS = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  'opencode-go': 'OpenCode Go',
  'opencode-zen': 'OpenCode Zen',
  deepseek: 'DeepSeek'
} as const

function apiKeyForProvider(settings: AppSettings, provider: AskAiRequest['provider']): string | null {
  switch (provider) {
    case 'gemini':
      return settings.geminiApiKey
    case 'openai':
      return settings.openaiApiKey
    case 'opencode-go':
      return settings.openCodeGoApiKey
    case 'opencode-zen':
      return settings.openCodeZenApiKey
    case 'deepseek':
      return settings.deepseekApiKey
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Mammoth's own output never includes scripts, but strip defensively before
// dangerouslySetInnerHTML anyway — cheap insurance against a maliciously
// crafted DOCX (raw XML pasted into a text run, etc.) reaching the DOM.
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
}

const MINI_SIZE = 64
const MINI_MARGIN = 16

export function registerIpcHandlers(window: BrowserWindow): void {
  const originalMinimumSize = window.getMinimumSize()
  let previousBounds: Rectangle | null = null

  ipcMain.on(IPC_CHANNELS.windowMinimize, () => {
    if (window.isDestroyed()) return
    previousBounds = window.getBounds()
    const display = screen.getDisplayMatching(previousBounds)
    const x = display.workArea.x + display.workArea.width - MINI_SIZE - MINI_MARGIN
    const y = display.workArea.y + MINI_MARGIN
    window.setMinimumSize(MINI_SIZE, MINI_SIZE)
    window.setBounds({ x, y, width: MINI_SIZE, height: MINI_SIZE })
  })

  ipcMain.on(IPC_CHANNELS.windowRestore, () => {
    if (window.isDestroyed()) return
    window.setMinimumSize(originalMinimumSize[0], originalMinimumSize[1])
    if (previousBounds) {
      window.setBounds(previousBounds)
      previousBounds = null
    } else {
      window.setSize(420, 640)
    }
  })

  // Manual in-DOM resize drag (see resize-handles.tsx). The window is
  // created with resizable:false specifically to remove Electron's native
  // edge hit-testing and the OS resize cursor it draws — min/max size
  // constraints set at window-creation time in overlay.ts are still
  // enforced by Electron on setBounds regardless of the resizable flag.
  ipcMain.on(IPC_CHANNELS.setScreenCaptureVisibility, (_event, visible: boolean) => {
    if (window.isDestroyed()) return
    // setContentProtection can be flipped live — no need to recreate the window.
    window.setContentProtection(!visible)
  })

  ipcMain.on(IPC_CHANNELS.windowResize, (_event, bounds: WindowResizeBounds) => {
    if (window.isDestroyed()) return
    window.setBounds(bounds)
  })

  ipcMain.handle(IPC_CHANNELS.getSettings, () => readSettings())

  ipcMain.handle(IPC_CHANNELS.setSettings, (_event, patch: Partial<AppSettings>) => {
    const parsed = appSettingsSchema.partial().safeParse(patch)
    if (!parsed.success) {
      return readSettings()
    }
    const next = { ...readSettings(), ...parsed.data }
    writeSettings(next)
    return next
  })

  ipcMain.handle(
    IPC_CHANNELS.createSession,
    (_event, form: unknown): CreateSessionResult | CreateSessionError => {
      const parsed = createSessionFormSchema.safeParse(form)
      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0]
        return { ok: false, error: firstIssue?.message ?? 'Invalid session form' }
      }
      const session = createSession(parsed.data)
      return { ok: true, sessionId: session.id }
    }
  )

  ipcMain.handle(IPC_CHANNELS.listSessions, (): SessionSummary[] => listSessions())

  ipcMain.handle(IPC_CHANNELS.getSession, (_event, id: string): SessionSummary | null => getSession(id))

  ipcMain.on(IPC_CHANNELS.appendTranscriptEntry, (_event, sessionId: string, message: TranscriptMessage) => {
    appendTranscriptEntry(sessionId, message)
  })

  ipcMain.handle(IPC_CHANNELS.getSessionTranscript, (_event, id: string): TranscriptMessage[] =>
    getSessionTranscript(id)
  )

  ipcMain.handle(IPC_CHANNELS.createProfile, (_event, name: string, resumeText: string): Profile =>
    createProfile(name, resumeText)
  )

  ipcMain.handle(IPC_CHANNELS.listProfiles, (): Profile[] => listProfiles())

  ipcMain.handle(IPC_CHANNELS.learnSpeakingStyleStats, (_event, profileId: string): SpeakingStyleStats => {
    return gatherSpeakingStyleSource(profileId).stats
  })

  function speakingStyleCandidates(): ProviderCandidate[] {
    const settings = readSettings()
    const candidates: ProviderCandidate[] = []
    for (const provider of LLM_FALLBACK_ORDER) {
      const key = apiKeyForProvider(settings, provider)
      if (key) candidates.push({ provider, apiKey: key, model: DEFAULT_MODEL_BY_PROVIDER[provider] })
    }
    return candidates
  }

  ipcMain.handle(
    IPC_CHANNELS.learnSpeakingStyle,
    async (_event, profileId: string): Promise<LearnSpeakingStyleResult> => {
      const candidates = speakingStyleCandidates()
      if (candidates.length === 0) {
        return { ok: false, error: 'No LLM provider configured. Add an API key in Settings first.' }
      }
      try {
        const styleText = await generateSpeakingStyleProfile(profileId, candidates)
        const profile = updateProfileSpeakingStyle(profileId, styleText)
        if (!profile) return { ok: false, error: 'Profile not found.' }
        return { ok: true, profile }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Failed to learn speaking style.' }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.submitPracticeAnswers,
    async (_event, profileId: string, answers: PracticeAnswerPayload[]): Promise<LearnSpeakingStyleResult> => {
      const candidates = speakingStyleCandidates()
      if (candidates.length === 0) {
        return { ok: false, error: 'No LLM provider configured. Add an API key in Settings first.' }
      }
      try {
        const styleText = await generateSpeakingStyleFromPractice(answers, candidates)
        const profile = updateProfileSpeakingStyle(profileId, styleText)
        if (!profile) return { ok: false, error: 'Profile not found.' }
        return { ok: true, profile }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Failed to learn speaking style.' }
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.uploadDocument, async (): Promise<UploadDocumentResult> => {
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [{ name: 'Documents', extensions: SUPPORTED_DOCUMENT_EXTENSIONS }]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { cancelled: true }
    }
    try {
      const document = await createDocument(result.filePaths[0])
      return { document }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to process the selected document.' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.listDocuments, () => listDocuments())

  // Deliberately does not call createDocument() — this is for populating a
  // profile's resume text, not for attaching a standalone document to a
  // session, so it has no persistence side effect of its own.
  ipcMain.handle(IPC_CHANNELS.extractResumeFromFile, async (): Promise<ExtractResumeResult> => {
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [{ name: 'Documents', extensions: SUPPORTED_DOCUMENT_EXTENSIONS }]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { cancelled: true }
    }
    try {
      const filePath = result.filePaths[0]
      const ext = extname(filePath).toLowerCase().slice(1)
      // The OS dialog's filter can be bypassed via its own "All Files"
      // option, so an unsupported type (e.g. .pptx) can still reach here.
      if (!SUPPORTED_DOCUMENT_EXTENSIONS.includes(ext)) {
        return { error: `".${ext}" isn't a supported format. Use PDF, DOCX, TXT, or MD.` }
      }
      const text = await extractText(filePath)
      if (text === UNSUPPORTED_TEXT) {
        return { error: 'No extractable text found in this file — it may be a scanned/image-only PDF.' }
      }
      return { fileName: basename(filePath), text }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to read the selected file.' }
    }
  })

  // For the PDF / Document viewer modes — returns the raw file path (PDF is
  // rendered client-side by pdfjs-dist) or routes DOCX/TXT to getDocumentHtml.
  ipcMain.handle(IPC_CHANNELS.getDocumentFilePath, async (): Promise<GetDocumentFilePathResult> => {
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [{ name: 'Documents', extensions: ['pdf', 'docx', 'pptx', 'txt', 'md'] }]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { cancelled: true }
    }
    const filePath = result.filePaths[0]
    const fileName = basename(filePath)
    const ext = extname(filePath).toLowerCase()

    // PPTX/DOCX: show the file exactly as it looks (not a text
    // reconstruction) by converting to PDF via LibreOffice first, then
    // reusing the same pixel-exact PdfViewerPanel a real PDF already gets.
    if (ext === '.pptx' || ext === '.docx') {
      const converted = await convertToPdf(filePath)
      if (converted.pdfPath) {
        // Word count / AI context still reads the ORIGINAL file's text —
        // best-effort only, never blocks the exact-visual result above.
        const text =
          ext === '.pptx'
            ? (await extractPptxSlides(filePath)).map((s) => `${s.title}\n${s.body}`).join('\n\n')
            : await extractDocxAsFormattedText(filePath).catch(() => undefined)
        return { filePath: converted.pdfPath, fileName, kind: 'pdf', text }
      }
      if (ext === '.pptx') {
        // No text-based fallback exists for PPTX in this viewer — Speaker
        // mode has never supported a reconstructed-text view of a deck.
        return { error: converted.error }
      }
      // DOCX still has a real fallback: the existing formatted-text/HTML
      // path, unaffected by LibreOffice being unavailable.
    }

    // The OS dialog's filter can be bypassed via its own "All Files" option,
    // so an unsupported type (e.g. an unconvertible .pptx above) can still
    // reach here.
    if (!SUPPORTED_DOCUMENT_EXTENSIONS.includes(ext.slice(1))) {
      return { error: `".${ext.slice(1)}" isn't a supported format. Use PDF, DOCX, PPTX, TXT, or MD.` }
    }
    const kind = ext === '.pdf' ? 'pdf' : 'document'
    const text = await extractText(filePath)
    // A PDF still renders visually via its own page-canvas viewer even with
    // no extractable text (e.g. a scanned document) — only reject when the
    // format has no other way to show anything at all.
    if (kind === 'document' && text === UNSUPPORTED_TEXT) {
      return { error: 'No extractable text found in this file.' }
    }
    return { filePath, fileName, kind, text }
  })

  ipcMain.handle(
    IPC_CHANNELS.getDocumentHtml,
    async (_event, filePath: string): Promise<GetDocumentHtmlResult> => {
      try {
        const ext = extname(filePath).toLowerCase()
        if (ext === '.docx') {
          const result = await mammoth.convertToHtml({ path: filePath })
          return { html: sanitizeHtml(result.value) }
        }
        const text = readFileSync(filePath, 'utf-8')
        return { html: `<pre>${escapeHtml(text)}</pre>` }
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to read the selected file.' }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.readDocumentBytes,
    (_event, filePath: string): ReadDocumentBytesResult => {
      try {
        return { data: new Uint8Array(readFileSync(filePath)) }
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to read the selected file.' }
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.importSlideSource, async (): Promise<ImportSlideSourceResult> => {
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [{ name: 'Documents', extensions: [...SUPPORTED_DOCUMENT_EXTENSIONS, 'pptx'] }]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { cancelled: true }
    }
    const filePath = result.filePaths[0]
    const fileName = basename(filePath)
    const ext = extname(filePath).toLowerCase()
    try {
      if (ext === '.pptx') {
        const slides = await extractPptxSlides(filePath)
        if (slides.length === 0) {
          return { error: 'No slides with content found in this presentation.' }
        }
        return { slides, fileName }
      }
      // Same "All Files" dialog-bypass concern as the other document pickers.
      if (!SUPPORTED_DOCUMENT_EXTENSIONS.includes(ext.slice(1))) {
        return { error: `".${ext.slice(1)}" isn't a supported format. Use PPTX, PDF, DOCX, TXT, or MD.` }
      }
      // DOCX gets its headings/bold preserved (extractText()'s plain
      // extractRawText() would flatten both) — PDF/TXT/MD have no
      // equivalent formatting to preserve, so extractText() as before.
      const text = ext === '.docx' ? await extractDocxAsFormattedText(filePath) : await extractText(filePath)
      if (text === UNSUPPORTED_TEXT) {
        return { error: 'No extractable text found in this file.' }
      }
      return { text, fileName }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to read the selected file.' }
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.exportSlides,
    async (_event, markdown: string, suggestedFileName: string): Promise<ExportSlidesResult> => {
      const result = await dialog.showSaveDialog(window, {
        defaultPath: suggestedFileName,
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      })
      if (result.canceled || !result.filePath) {
        return { cancelled: true }
      }
      try {
        writeFileSync(result.filePath, markdown, 'utf-8')
        return { filePath: result.filePath }
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to save the file.' }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.aiAskStart,
    (_event, request: unknown): AskAiStartResult => {
      const parsed = askAiRequestSchema.safeParse(request)
      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0]
        // No cardId to report against if the payload itself failed to parse
        // (cardId is one of the fields being validated) — fall back to a
        // synthetic id so the renderer still gets a scoped error result.
        const cardId = typeof (request as Partial<AskAiRequest>)?.cardId === 'string'
          ? (request as AskAiRequest).cardId
          : 'invalid-request'
        return { cardId, error: firstIssue?.message ?? 'Invalid request' }
      }
      const req = parsed.data
      const settings = readSettings()
      const apiKey = apiKeyForProvider(settings, req.provider)
      if (!apiKey) {
        return {
          cardId: req.cardId,
          error: `No ${PROVIDER_LABELS[req.provider]} API key configured. Open Settings and add one.`
        }
      }

      // Resolved here (main owns the filesystem) into plain text, not
      // passed as raw IDs — buildPrompt() only ever sees resolved context,
      // same as company/jobDescription always have been.
      const profile = req.profileId ? getProfile(req.profileId) : null
      const documents = (req.documentIds ?? [])
        .map((id) => getDocument(id))
        .filter((doc) => doc !== null)
      const documentsContext =
        documents.length > 0
          ? documents.map((doc) => `Attached document (${doc.fileName}):\n${doc.extractedText}`).join('\n\n')
          : undefined

      // Explicit override always wins; otherwise auto-detect (pure/local, no
      // added latency) among only the frameworks the user enabled ahead of
      // time in Answer Preferences — see question-type-detector.ts. null
      // means the framework system is off for this request; converted to
      // undefined so no framework instruction is injected and no badge
      // renders on the card.
      const questionType =
        req.questionType ?? detectQuestionType(req.question, req.answerPreferences?.enabledFrameworks ?? []) ?? undefined
      // Independent of questionType: a null type also means "user disabled
      // all frameworks", where a hard technical question still deserves a
      // full answer. Only THIS flag shortens the response.
      const generalQuestion = isGeneralQuestion(req.question)
      const speakingStyleContext =
        req.answerPreferences?.matchSpeakingStyle && profile?.speakingStyleProfile
          ? profile.speakingStyleProfile
          : undefined

      // Automatic vendor failover: try the requested provider first, then
      // fall through LLM_FALLBACK_ORDER (skipping providers with no key
      // configured) so a single vendor outage never fully blocks an
      // answer. Only engages when the primary produced NO content at all
      // — see askLlmWithFallback's partial-error guard.
      const candidates: ProviderCandidate[] = [{ provider: req.provider, apiKey, model: req.model }]
      for (const provider of LLM_FALLBACK_ORDER) {
        if (provider === req.provider) continue
        const key = apiKeyForProvider(settings, provider)
        if (key) candidates.push({ provider, apiKey: key, model: DEFAULT_MODEL_BY_PROVIDER[provider] })
      }

      // Fire-and-forget: the renderer gets an immediate {cardId} ack and then
      // hears the actual answer arrive as ai:chunk/ai:done/ai:error pushes,
      // scoped by cardId (mirrors the sttStatus/sttPartial/sttFinal pattern).
      askLlmWithFallback(
        candidates,
        {
          question: req.question,
          company: req.company,
          jobDescription: req.jobDescription,
          extraContext: req.extraContext,
          answerPreferences: req.answerPreferences,
          followUpInstruction: req.followUpInstruction,
          priorAnswer: req.priorAnswer,
          imageDataUrls: req.imageDataUrls,
          sessionType: req.sessionType,
          profileContext: profile?.resumeText,
          documentsContext,
          questionType,
          speakingStyleContext,
          generalQuestion
        },
        (delta) => safeSend(window.webContents, IPC_CHANNELS.aiChunk, { cardId: req.cardId, delta })
      ).then(
        ({ provider }) =>
          safeSend(window.webContents, IPC_CHANNELS.aiDone, {
            cardId: req.cardId,
            fallbackProvider: provider !== req.provider ? provider : undefined,
            questionType,
            styledFromProfile: Boolean(speakingStyleContext)
          }),
        (error: LlmError) =>
          safeSend(window.webContents, IPC_CHANNELS.aiError, {
            cardId: req.cardId,
            error: error.message,
            partial: error.partial ?? false
          })
      )

      return { cardId: req.cardId }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.checkTurnComplete,
    async (_event, request: CheckTurnCompleteRequest): Promise<CheckTurnCompleteResult> => {
      const settings = readSettings()
      const apiKey = apiKeyForProvider(settings, request.provider)
      // No key configured — can't classify, and this must never block
      // question detection, so fail open exactly like a classifier timeout
      // does (see turn-completeness.ts).
      if (!apiKey) return { complete: true, isBackchannel: false }
      return classifyTurn(request.provider, apiKey, request.model, request.text)
    }
  )

  const stt = createSttService(window.webContents, readSettings)
  window.on('closed', () => stt.dispose())

  ipcMain.on(IPC_CHANNELS.windowClose, () => {
    // closable:false (required to suppress the native close button on a
    // frameless stealth overlay) also makes graceful app.quit() no-op on
    // Windows, since it tries the window's close path first and the window
    // refuses. Tear down explicitly and force-exit instead.
    stt.dispose()
    if (!window.isDestroyed()) window.destroy()
    app.exit(0)
  })

  ipcMain.handle(IPC_CHANNELS.sttGetDesktopSources, async (): Promise<DesktopSource[]> => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] })
    return sources.map((s) => ({ id: s.id, name: s.name }))
  })

  ipcMain.handle(IPC_CHANNELS.screenshotCapture, async (): Promise<ScreenshotCaptureResult> => {
    try {
      // Full-resolution thumbnailSize turns this into a real screenshot, not
      // a small preview. The overlay window's own setContentProtection(true)
      // (applyStealth) already excludes it from any OS-level capture — the
      // same mechanism that hides it from the interviewer's screen share
      // means it's excluded from this capture too, for free.
      const display = screen.getPrimaryDisplay()
      const width = Math.round(display.size.width * display.scaleFactor)
      const height = Math.round(display.size.height * display.scaleFactor)
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width, height } })
      if (sources.length === 0 || sources[0].thumbnail.isEmpty()) {
        return { error: 'No screen source available to capture.' }
      }
      return { dataUrl: sources[0].thumbnail.toDataURL() }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Screenshot capture failed.' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.sttStart, (_event, source: unknown): SttStartResult => {
    const parsed = sttSourceSchema.safeParse(source)
    if (!parsed.success) {
      return { success: false, error: 'Invalid audio source. Must be "mic" or "system".' }
    }
    return stt.start(parsed.data)
  })

  ipcMain.handle(IPC_CHANNELS.sttStop, (_event, source: unknown) => {
    const parsed = sttSourceSchema.safeParse(source)
    if (parsed.success) {
      stt.stop(parsed.data)
    }
  })

  ipcMain.handle(IPC_CHANNELS.sttGetModelStatus, (): LocalSttModelStatus => stt.localModelStatus())
  ipcMain.handle(
    IPC_CHANNELS.sttEnsureModel,
    (): Promise<{ ok: boolean; error?: string }> => stt.ensureLocalModel()
  )

  ipcMain.on(IPC_CHANNELS.sttAudioChunk, (_event: IpcMainEvent, { source, data }: { source: string; data: ArrayBuffer }) => {
    const parsed = sttSourceSchema.safeParse(source)
    if (parsed.success) {
      stt.pushAudioChunk(parsed.data, data)
    }
  })
}
