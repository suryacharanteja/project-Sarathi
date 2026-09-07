import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  type AppSettings,
  type AskAiRequest,
  type CheckTurnCompleteRequest,
  type AskAiChunkEvent,
  type AskAiDoneEvent,
  type AskAiErrorEvent,
  type WindowResizeBounds,
  type SarathiApi
} from '../shared/ipc-contract'
import type { CreateSessionForm } from '../shared/session-types'
import type {
  LocalSttModelStatus,
  SttEngineEvent,
  SttErrorEvent,
  SttStatusEvent,
  SttTranscriptEvent
} from '../shared/stt-types'
import type { TranscriptMessage } from '../shared/transcript-types'

function subscribe<T>(channel: string, callback: (event: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: SarathiApi = {
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.getSettings),
  setSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke(IPC_CHANNELS.setSettings, patch),
  createSession: (form: CreateSessionForm) => ipcRenderer.invoke(IPC_CHANNELS.createSession, form),
  listSessions: () => ipcRenderer.invoke(IPC_CHANNELS.listSessions),
  getSession: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.getSession, id),
  appendTranscriptEntry: (sessionId: string, message: TranscriptMessage) =>
    ipcRenderer.send(IPC_CHANNELS.appendTranscriptEntry, sessionId, message),
  getSessionTranscript: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.getSessionTranscript, id),
  createProfile: (name: string, resumeText: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.createProfile, name, resumeText),
  listProfiles: () => ipcRenderer.invoke(IPC_CHANNELS.listProfiles),
  learnSpeakingStyleStats: (profileId: string) => ipcRenderer.invoke(IPC_CHANNELS.learnSpeakingStyleStats, profileId),
  learnSpeakingStyle: (profileId: string) => ipcRenderer.invoke(IPC_CHANNELS.learnSpeakingStyle, profileId),
  submitPracticeAnswers: (profileId: string, answers) =>
    ipcRenderer.invoke(IPC_CHANNELS.submitPracticeAnswers, profileId, answers),
  uploadDocument: () => ipcRenderer.invoke(IPC_CHANNELS.uploadDocument),
  listDocuments: () => ipcRenderer.invoke(IPC_CHANNELS.listDocuments),
  extractResumeFromFile: () => ipcRenderer.invoke(IPC_CHANNELS.extractResumeFromFile),
  getDocumentFilePath: () => ipcRenderer.invoke(IPC_CHANNELS.getDocumentFilePath),
  getDocumentHtml: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.getDocumentHtml, filePath),
  readDocumentBytes: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.readDocumentBytes, filePath),
  importSlideSource: () => ipcRenderer.invoke(IPC_CHANNELS.importSlideSource),
  askAiStart: (request: AskAiRequest) => ipcRenderer.invoke(IPC_CHANNELS.aiAskStart, request),
  checkTurnComplete: (request: CheckTurnCompleteRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.checkTurnComplete, request),
  onAiChunk: (callback: (event: AskAiChunkEvent) => void) => subscribe(IPC_CHANNELS.aiChunk, callback),
  onAiDone: (callback: (event: AskAiDoneEvent) => void) => subscribe(IPC_CHANNELS.aiDone, callback),
  onAiError: (callback: (event: AskAiErrorEvent) => void) => subscribe(IPC_CHANNELS.aiError, callback),

  // Raw channel names owned by the electron-audio-loopback package itself
  // (see node_modules/electron-audio-loopback/dist/config.js) — not routed
  // through our own IPC_CHANNELS since we don't own the handler side of
  // these, `initMain()` in src/main/index.ts does.
  enableLoopbackAudio: () => ipcRenderer.invoke('enable-loopback-audio'),
  disableLoopbackAudio: () => ipcRenderer.invoke('disable-loopback-audio'),

  sttGetDesktopSources: () => ipcRenderer.invoke(IPC_CHANNELS.sttGetDesktopSources),
  sttStart: (source: string) => ipcRenderer.invoke(IPC_CHANNELS.sttStart, source),
  sttStop: (source: string) => ipcRenderer.invoke(IPC_CHANNELS.sttStop, source),
  sttSendAudioChunk: (source: string, data: ArrayBuffer) =>
    ipcRenderer.send(IPC_CHANNELS.sttAudioChunk, { source, data }),
  onSttStatus: (callback: (event: SttStatusEvent) => void) => subscribe(IPC_CHANNELS.sttStatus, callback),
  onSttPartial: (callback: (event: SttTranscriptEvent) => void) => subscribe(IPC_CHANNELS.sttPartial, callback),
  onSttFinal: (callback: (event: SttTranscriptEvent) => void) => subscribe(IPC_CHANNELS.sttFinal, callback),
  onSttError: (callback: (event: SttErrorEvent) => void) => subscribe(IPC_CHANNELS.sttError, callback),
  onSttEngine: (callback: (event: SttEngineEvent) => void) => subscribe(IPC_CHANNELS.sttEngine, callback),
  onSttModelStatus: (callback: (status: LocalSttModelStatus) => void) =>
    subscribe(IPC_CHANNELS.sttModelStatus, callback),
  sttGetModelStatus: () => ipcRenderer.invoke(IPC_CHANNELS.sttGetModelStatus),
  sttEnsureModel: () => ipcRenderer.invoke(IPC_CHANNELS.sttEnsureModel),

  windowMinimize: () => ipcRenderer.send(IPC_CHANNELS.windowMinimize),
  windowRestore: () => ipcRenderer.send(IPC_CHANNELS.windowRestore),
  windowClose: () => ipcRenderer.send(IPC_CHANNELS.windowClose),
  resizeWindow: (bounds: WindowResizeBounds) => ipcRenderer.send(IPC_CHANNELS.windowResize, bounds),
  setScreenCaptureVisibility: (visible: boolean) => ipcRenderer.send(IPC_CHANNELS.setScreenCaptureVisibility, visible),

  screenshotCapture: () => ipcRenderer.invoke(IPC_CHANNELS.screenshotCapture)
}

contextBridge.exposeInMainWorld('sarathi', api)
