# Low-Level Design (LLD)

**Project:** Sarathi - AI-Powered Presentation Co-Pilot  
**Version:** 2.0  
**Date:** 2026-09-07  
**Owner:** Engineering  
**Status:** Proposed - Pending Approval  
**Related:** [HLD](./HLD.md), [Solution Design](./Solution-Design.md), [FRD](./FRD.md)

## 1. Purpose

This LLD defines the implementation contracts and control flows needed to build, review, and test Sarathi v2.0. It records the current repository boundaries and the proposed viewer/state additions described by the FRD.

## 2. Module Map

| Area | Current location | LLD responsibility |
|---|---|---|
| Main bootstrap | `src/main/index.ts` | App lifecycle, single-instance behavior, crash/unresponsive recovery. |
| IPC | `src/main/ipc.ts` | Request validation, handlers, file dialogs, service orchestration. |
| IPC contract | `src/shared/ipc-contract.ts` | Channel names, payload/result types, settings and event contracts. |
| Preload | `src/preload/index.ts` | Context-isolated renderer bridge. |
| Renderer | `src/renderer/src/` | Setup, overlay, viewers, stores, and keyboard interactions. |
| Settings | `src/main/store.ts` | Validated settings and API-key encryption. |
| Documents | `src/main/documents/` | Extraction and local metadata. |
| LLM | `src/main/services/llm/` | Provider dispatch, retries, timeouts, and failover. |
| STT | `src/main/services/stt/` | AssemblyAI/local selection and one-way fallback. |

## 3. IPC Contracts

### 3.1 Document operations

| Channel | Direction | Input | Result | Rules |
|---|---|---|---|---|
| `document:getFilePath` | renderer -> main | none | `{ filePath, fileName, kind, text }` or `{ cancelled }`/`{ error }` | Main opens the file picker and determines viewer kind. |
| `document:getHtml` | renderer -> main | `filePath: string` | `{ html }` or `{ error }` | DOCX uses Mammoth; TXT/MD is escaped before `<pre>` wrapping. |
| `document:readBytes` | renderer -> main | `filePath: string` | `{ data: Uint8Array }` or `{ error }` | Used for PDF.js; no renderer filesystem read. |

The renderer must treat cancellation as a normal branch, display errors without throwing uncaught exceptions, and release old PDF page resources when a new file is selected.

### 3.2 AI operations

| Channel/event | Direction | Contract intent |
|---|---|---|
| `ai:askStart` | renderer -> main | Validate request and start a scoped streamed answer. |
| `ai:chunk` | main -> renderer | Append a delta to the matching card id. |
| `ai:done` | main -> renderer | Complete the card and disclose fallback provider/question type when present. |
| `ai:error` | main -> renderer | Provide scoped error and whether partial content exists. |

### 3.3 STT operations

`stt:start`, `stt:stop`, and `stt:audioChunk` control a source (`mic` or `system`). `stt:partial`, `stt:final`, `stt:status`, `stt:engine`, and `stt:error` report state. The router must preserve a source on local fallback for the remainder of that stream and reset the fallback lock on stop.

## 4. Renderer State Model

The presentation state should be represented by a setup store and prompter store with the following minimum fields:

```typescript
type ContentMode = 'teleprompter' | 'carousel' | 'pdf' | 'document'
type Persona = 'webinar' | 'teacher' | 'speaker' | 'meeting'

interface Slide {
  id: string
  title: string
  body: string
}

interface PresentationState {
  persona: Persona
  contentMode: ContentMode
  scriptText: string
  slides: Slide[]
  currentSlideIndex: number
  pdfFilePath: string | null
  docHtml: string | null
  bookmarks: number[]
  sessionStartedAt: number | null
}
```

Invariants:

- `currentSlideIndex` is clamped to `0..slides.length - 1`.
- `bookmarks` is sorted, finite, and cleared when a new script is loaded.
- `pdfFilePath` is set only when `contentMode` is `pdf`.
- `docHtml` is sanitized output returned by the main process, never raw user HTML from an input field.
- The session timer is based on a monotonic elapsed calculation from `sessionStartedAt`, not on render count.

## 5. Viewer Algorithms

### Teleprompter

1. Read `scrollTop`, `scrollHeight`, and `clientHeight` from the scroll container.
2. Compute progress as `scrollTop / max(1, scrollHeight - clientHeight)`.
3. Auto-scroll only when not paused and the overlay is active.
4. On `B`, add or remove the nearest bookmark within a small pixel tolerance.
5. On `J`/`K`, choose the next/previous bookmark and use smooth scrolling.

### Carousel

1. Clamp the requested index.
2. Render one slide body and its title.
3. Arrow and PageUp/PageDown actions update the index.
4. Progress is `(index + 1) / max(1, slides.length)`.

### PDF

1. Request bytes through `document:readBytes`.
2. Load the byte array into `pdfjs-dist`.
3. Render only current page and nearby pages where practical.
4. Clamp zoom to `0.5..2.0`.
5. Cancel or ignore stale render promises after file/page changes.

### DOCX/TXT/MD

1. Request HTML from `document:getHtml`.
2. Render returned sanitized HTML in the document viewer.
3. Apply teleprompter font and scroll controls without reinterpreting markup.
4. Never pass unsanitized user-provided HTML to `dangerouslySetInnerHTML`.

## 6. Error and Retry Rules

- IPC schema validation failure returns a typed error and does not mutate state.
- File-picker cancellation does not create a document or alter the active viewer.
- LLM requests use bounded retry delays and stop retrying after partial content has streamed.
- LLM provider fallback occurs only before any content is streamed; the completed event reports the provider actually used.
- STT cloud failure falls back once per source when enabled and the configured local model is ready.
- Renderer crash is handled by the main process restart/quit dialog.
- All user-visible errors must be actionable and must not contain secrets or full document contents.

## 7. Data and Security Details

- Settings are validated by `appSettingsSchema` before merge/write.
- API key fields are encrypted through `safeStorage` before JSON persistence.
- Documents are represented by metadata under the Electron user-data directory; source paths and extracted text must not be logged.
- `BrowserWindow` uses `contextIsolation: true`, `nodeIntegration: false`, and a restricted preload surface.
- Screen capture protection is applied with `setContentProtection` and may be changed only through the explicit visibility IPC action.

## 8. Test Design

| Test area | Required checks |
|---|---|
| IPC | Invalid payloads, cancellation, missing files, typed result shape. |
| Document viewers | PDF page count/render, DOCX conversion, escaped TXT/MD, malformed input. |
| State | Index clamping, bookmark navigation, mode transitions, timer reset. |
| STT | Cloud start, local start, cloud outage fallback, disabled fallback, stop reset. |
| LLM | Stream chunks, timeout, retryable error, partial failure, provider fallback. |
| Security | No API keys in repository, no renderer filesystem access, HTML sanitization, capture protection. |
| Release | `npm run typecheck`, `npm run build`, installer smoke test. |

## 9. Approval

| Approval role | Approver | Date | Decision |
|---|---|---|---|
| Engineering lead | __________________ | __________ | Pending |
| QA lead | __________________ | __________ | Pending |
| Security/privacy reviewer | __________________ | __________ | Pending |
| Product owner | __________________ | __________ | Pending |

## 10. Revision History

| Version | Date | Author | Change | Approval status |
|---|---|---|---|---|
| 2.0 | 2026-09-07 | Engineering | Initial low-level design | Pending |
