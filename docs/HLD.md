# High-Level Design (HLD)

**Project:** Sarathi - AI-Powered Presentation Co-Pilot  
**Version:** 2.0  
**Date:** 2026-09-07  
**Owner:** Engineering  
**Status:** Proposed - Pending Approval  
**Related:** [Solution Design](./Solution-Design.md), [FRD](./FRD.md), [LLD](./LLD.md)

## 1. Purpose and Scope

This HLD defines the deployable boundaries, responsibilities, major interfaces, and runtime flows for Sarathi v2.0. It is intentionally independent of individual React component layout and implementation syntax; those details belong in the LLD.

## 2. Logical Architecture

```text
+------------------------------------------------------------------+
| Sarathi Electron Application                                    |
|                                                                  |
|  +----------------------+       +-----------------------------+  |
|  | Renderer             |       | Main Process                |  |
|  | React/TypeScript     | IPC   | IPC handlers + validation  |  |
|  | Setup + Overlay      |<----->| Window lifecycle           |  |
|  | Viewers + HUD        |       | Settings + documents       |  |
|  | Transcript + cards   |       | LLM router + STT router    |  |
|  +----------+-----------+       +-------------+---------------+  |
|             | Preload typed bridge             |                |
|             +----------------------------------+                |
|                                                                  |
|  Local user-data directory: settings, document metadata, state  |
+------------------------------------------------------------------+
             |                         |
             v                         v
       AI providers              STT providers
   Gemini/OpenAI-compatible   AssemblyAI -> local Whisper
```

## 3. Component Responsibilities

| Component | Responsibility | Does not own |
|---|---|---|
| Renderer | User interaction, viewer state, keyboard controls, visual feedback, streamed event presentation. | API keys, arbitrary filesystem access, provider credentials. |
| Preload | Exposes the minimum typed bridge and forwards approved events. | Business decisions or persistence. |
| Main IPC layer | Validates requests, invokes services, returns typed results, sends scoped events. | React presentation state. |
| Window layer | Creates the frameless always-on-top overlay, capture protection, permission policy, crash handling. | Session content semantics. |
| Settings store | Reads/writes validated settings and encrypts provider keys. | Live provider calls. |
| Document services | File selection, text extraction, DOCX conversion, PDF byte reads, metadata. | Rendering pages or HTML in the UI. |
| LLM router | Streaming calls, bounded retries, timeout classification, provider fallback. | Deciding whether a transcript is a question. |
| STT router | Audio source lifecycle and per-source cloud/local engine selection. | Answer generation. |
| Session/document stores | Local records for sessions, transcripts, and document metadata. | Remote synchronization. |

## 4. Primary Runtime Flows

### 4.1 Start a presentation

1. The user configures persona, content mode, content, and AI/STT settings in the renderer.
2. The renderer calls `session:create` or the relevant content IPC operation through preload.
3. Main validates the request and persists session/document metadata where applicable.
4. The overlay enters presentation mode and starts only the selected audio and viewer flows.
5. The top bar receives progress, timer, and status updates from renderer state.

### 4.2 AI co-pilot

```text
Audio capture -> STT partial/final events -> turn completeness
-> question classification -> ai:askStart
-> LLM router -> ai:chunk / ai:done or ai:error
-> answer card stack
```

### 4.3 File viewing

```text
File picker in main -> typed file result
   PDF: readDocumentBytes -> pdfjs-dist canvas in renderer
   DOCX: getDocumentHtml -> sanitized HTML in renderer
   TXT/MD: escaped text/HTML -> document/teleprompter viewer
```

## 5. Deployment and Environment

- The application is packaged with Electron Builder for Windows NSIS and can be built for macOS/Linux using the existing Electron toolchain.
- Runtime settings are stored under Electron `app.getPath('userData')`.
- Provider services are external HTTPS dependencies.
- Local Whisper uses packaged model/runtime assets and requires a supported machine profile.
- Build commands are `npm run typecheck`, `npm run build`, and `npm run dist:win` for the Windows installer.

## 6. Cross-Cutting Quality Attributes

| Attribute | HLD approach |
|---|---|
| Security | Context isolation, no Node integration, IPC validation, safeStorage, capture protection. |
| Availability | Bounded retries, LLM provider fallback, STT cloud-to-local fallback, visible errors. |
| Performance | Streaming responses, background throttling disabled, lazy PDF pages, bounded viewer state. |
| Maintainability | Shared IPC contract, service routers, typed result objects, feature-local renderer components. |
| Accessibility | Keyboard controls, focusable actions, readable contrast, status not conveyed by color alone. |
| Testability | Pure-ish routers/stores, endpointing tests, typed IPC seams, build/typecheck gates. |

## 7. Approval

| Approval role | Approver | Date | Decision |
|---|---|---|---|
| Engineering lead | __________________ | __________ | Pending |
| Security/privacy reviewer | __________________ | __________ | Pending |
| QA lead | __________________ | __________ | Pending |
| Product owner | __________________ | __________ | Pending |

## 8. Revision History

| Version | Date | Author | Change | Approval status |
|---|---|---|---|---|
| 2.0 | 2026-09-07 | Engineering | Initial high-level design | Pending |
