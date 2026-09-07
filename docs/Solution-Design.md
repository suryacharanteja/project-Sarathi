# Solution Design Document

**Project:** Sarathi - AI-Powered Presentation Co-Pilot  
**Version:** 2.0  
**Date:** 2026-09-07  
**Owner:** Engineering  
**Status:** Proposed - Pending Approval  
**Related:** [BRD](./BRD.md), [FRD](./FRD.md), [HLD](./HLD.md), [LLD](./LLD.md)

## 1. Purpose

This document converts the approved business and functional intent into a coherent solution direction for Sarathi v2.0. It is the decision baseline for the high-level and low-level designs. It describes what is being built, the important constraints, and the decisions that require stakeholder approval.

## 2. Design Principles

1. **Presenter-first:** The overlay must remain quiet, readable, keyboard-friendly, and usable during a live session.
2. **Least privilege:** The renderer receives capabilities through typed preload/IPC APIs instead of direct filesystem or Node.js access.
3. **Graceful degradation:** AI and speech services may fail; the user must see the failure and retain a usable local workflow where possible.
4. **Local ownership of sensitive data:** API keys, document metadata, and session state remain in the user's OS profile unless the user explicitly invokes a provider-backed feature.
5. **Incremental delivery:** Existing teleprompter, AI, STT, and session capabilities remain reusable while new viewer modes are introduced behind clear contracts.
6. **Observable decisions:** Provider fallback, STT engine changes, document errors, and renderer failure are surfaced through typed results or visible status.

## 3. Proposed Solution

Sarathi remains a single-user Electron desktop application with one renderer UI and one main-process boundary.

- **Renderer:** React and TypeScript setup and overlay experiences, content viewers, timers, keyboard controls, transcript, and answer cards.
- **Preload:** Context-isolated, typed bridge exposing only approved IPC operations.
- **Main process:** Window lifecycle, IPC validation, settings, document access, persistence, screenshot handling, provider orchestration, and STT lifecycle.
- **AI path:** Speech input -> transcription -> turn/question classification -> LLM router -> streamed answer events -> answer card.
- **Content path:** File picker -> main-process extraction or bytes -> renderer viewer; DOCX HTML is sanitized before rendering.
- **Persistence:** OS user-data directory for settings and document metadata. API keys are encrypted with Electron `safeStorage` when available.

## 4. Key Decisions

| ID | Decision | Rationale | Consequence |
|---|---|---|---|
| SD-01 | Keep Electron main as the security and integration boundary. | It already owns windows, settings, IPC, and provider access. | New capabilities require IPC contract and preload changes. |
| SD-02 | Render PDF pages in the renderer with `pdfjs-dist`, using bytes supplied by IPC. | Avoids exposing arbitrary paths and keeps page interaction responsive. | PDF rendering must manage memory and lazy page rendering. |
| SD-03 | Convert DOCX to HTML in the main process with Mammoth, then sanitize. | Keeps file access and conversion out of the renderer. | HTML output must remain a constrained local-document format. |
| SD-04 | Use AssemblyAI first with one-way local Whisper fallback per STT source. | Preserves live sessions during cloud failure without engine flapping. | Local model availability and device performance are release prerequisites. |
| SD-05 | Use provider candidates in configured fallback order for LLM requests. | A vendor outage should not block the entire session. | The UI must disclose provider fallback and partial-stream failures. |
| SD-06 | Keep v2 persistence local and file-based. | Matches the current product and open-source scope. | No cross-device sync or centralized audit is provided. |

## 5. Security and Privacy Position

- `contextIsolation` is enabled and Node integration is disabled in the BrowserWindow.
- Renderer file access is mediated by `document:getFilePath`, `document:getHtml`, and `document:readBytes`.
- API keys are written to the OS user-data settings file only after encryption when the platform supports it.
- Screen-capture protection is enabled by default for the overlay.
- Local document text is not automatically sent to an AI provider. It is included only when an explicit workflow supplies it as context.
- Logs must not include API keys, raw document contents, or complete transcripts unless a future diagnostic feature explicitly redacts and authorizes them.

## 6. Risks and Mitigations

| Risk | Impact | Mitigation | Owner |
|---|---|---|---|
| Provider quota or outage | High | Retry bounded failures, disclose errors, use configured fallback providers. | Engineering |
| Local STT model unavailable or slow | High | Preflight model status, show download state, surface actionable fallback error. | Engineering |
| Malicious or malformed document | High | Main-process parsing, HTML sanitization, typed file filters, bounded error handling. | Security/Engineering |
| Renderer performance under large PDFs | Medium | Lazy page rendering, current-page window, explicit zoom bounds. | UI Engineering |
| AI answer is incorrect | High | Present answers as assistance, show source/transcript context where available, retain presenter control. | Product |
| Screen capture exposes private content | High | `contentProtection` by default, visible setting for deliberate override, verification on supported OSes. | Security/QA |

## 7. Delivery and Approval Gates

| Gate | Exit criteria | Approvers |
|---|---|---|
| Requirements baseline | BRD and FRD approved; traceability complete. | Product, Business, QA |
| Solution baseline | This document and HLD approved; risks have owners. | Engineering, Security, Product |
| Detailed design baseline | LLD approved; IPC and data models are testable. | Engineering, QA, Security |
| Release candidate | `npm run typecheck`, `npm run build`, acceptance tests, security review, and release notes complete. | QA, Engineering, Product |

## 8. Approval

| Approval role | Approver | Date | Decision |
|---|---|---|---|
| Product owner | __________________ | __________ | Pending |
| Engineering lead | __________________ | __________ | Pending |
| Security/privacy reviewer | __________________ | __________ | Pending |
| QA/release owner | __________________ | __________ | Pending |

Approval requires all listed roles to record `Approved`. A change to an approved decision requires a revision entry and review of affected HLD/LLD sections.

## 9. Revision History

| Version | Date | Author | Change | Approval status |
|---|---|---|---|---|
| 2.0 | 2026-09-07 | Engineering | Initial solution design for Sarathi v2.0 | Pending |
