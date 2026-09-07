# Business Requirements Document (BRD)

**Project:** Sarathi — AI-Powered Presentation Co-Pilot
**Version:** 2.0
**Date:** 2026-09-06
**Author:** CharanTheAIGuy
**Status:** Proposed - Pending Approval

---

## 1. Executive Summary

Sarathi (Sanskrit: सारथी, "the charioteer who guided the greatest warriors") is an open-source desktop application that serves as an AI-powered co-pilot for anyone who speaks in front of an audience. The v1 app delivered a basic auto-scrolling teleprompter with an AI question-answering co-pilot. Version 2.0 expands Sarathi into a comprehensive presentation platform serving four distinct professional personas, with a radically improved user interface and a full suite of content-viewing modes.

---

## 2. Problem Statement

Presenters, teachers, webinar hosts, and consultants face a common set of problems during live sessions:

| Pain Point | Current Gap |
|---|---|
| Scripted content is in a specific format (slides, PDF, DOCX) | App only supports plain text teleprompter |
| Speaker needs to navigate slide-by-slide, not scroll continuously | No slide / carousel mode exists |
| Audience asks questions mid-session | Partially addressed — AI answers exist but UI is rudimentary |
| Different roles need different toolsets | One-size-fits-all setup screen |
| App UI feels like a developer tool, not a polished product | No design system, no micro-animations, minimal visual hierarchy |
| No awareness of time during a session | No timer, clock, or progress indicator |

---

## 3. Vision & Goals

**Vision:** Sarathi should feel like having a brilliant, invisible personal assistant sitting next to you during every presentation — reading your script, answering audience questions before you even panic, and never once getting in your way.

**Goals:**
1. Support four professional personas with purpose-built workflows
2. Support four content-viewing modes: teleprompter scroll, slide carousel, PDF viewer, document viewer
3. Deliver a world-class UI/UX aligned with Google Material Design 3 and Microsoft Fluent Design principles
4. Keep the AI question-detection and answer co-pilot as the core intelligence layer
5. Remain fully open-source, MIT-licensed, with zero API keys committed to the repository

---

## 4. Stakeholder & Persona Analysis

### Persona 1 — Webinar Host / Presenter
- **Context:** Running a scheduled webinar with 10–500 attendees on Zoom, Teams, or Google Meet
- **Primary need:** See slide-by-slide speaker notes while presenting; get AI help with live audience Q&A
- **Secondary need:** Timer to stay on schedule; progress indicator

### Persona 2 — Teacher / Educator
- **Context:** Live or recorded teaching session (university lecture, online course, school class)
- **Primary need:** Lesson plan in carousel form; smooth, uninterrupted delivery
- **Secondary need:** Clock, session timer, AI answers to student questions

### Persona 3 — Conference / Event Speaker
- **Context:** Keynote or panel talk at a conference (in-person or virtual)
- **Primary need:** Loaded PDF or DOCX script visible as they speak; mirror flip for physical glass
- **Secondary need:** Reading-time estimate, font size control, minimal distraction

### Persona 4 — Meeting Consultant / Presenter
- **Context:** Regular business call (client pitch, status update, board presentation)
- **Primary need:** Quick notes teleprompter; AI co-pilot for unexpected questions
- **Secondary need:** Minimal UI, fast setup, no fluff

---

## 5. Business Requirements

| ID | Requirement | Priority | Persona |
|---|---|---|---|
| BR-01 | App must support four distinct modes: Teleprompter, Slide Carousel, PDF Viewer, Document Viewer | P0 | All |
| BR-02 | App must present a persona-based setup experience (Webinar Host, Teacher, Speaker, Meeting) | P0 | All |
| BR-03 | Slide Carousel mode must allow adding, editing, and reordering slides with title + body | P0 | Host, Teacher |
| BR-04 | PDF Viewer mode must display the actual PDF pages (not just extracted text) | P0 | Speaker |
| BR-05 | DOCX/TXT Document Viewer must display formatted or plain document content | P1 | All |
| BR-06 | AI Listener must detect audience questions and surface answers without interrupting the presenter | P0 | All |
| BR-07 | Overlay must show a live clock and session elapsed timer | P1 | Host, Teacher |
| BR-08 | Overlay must show a scroll/slide progress indicator | P1 | All |
| BR-09 | All keyboard shortcuts must be discoverable via an in-app cheatsheet | P1 | All |
| BR-10 | UI must follow Google Material Design 3 and Microsoft Fluent Design principles | P0 | All |
| BR-11 | API keys must never appear in the repository; all keys stored via OS safeStorage | P0 | All |
| BR-12 | App must remain open-source under MIT license | P0 | All |
| BR-13 | Word count and estimated reading time must be shown on the setup screen | P2 | All |
| BR-14 | Presenter must be able to bookmark positions in a script and jump to them | P2 | Speaker |

---

## 6. Success Metrics

- A webinar host can set up, load slides, and begin presenting in under 60 seconds
- AI answers an audience question within 5 seconds of it being asked
- The app passes visual inspection against Material Design 3 elevation and color system guidelines
- Zero API keys appear in any committed file (verified by git grep)
- TypeScript typecheck passes with zero errors after all changes

---

## 7. Scope Boundaries and Assumptions

### In scope

- Windows, macOS, and Linux desktop distribution through Electron.
- Presenter-facing setup and always-on-top overlay workflows.
- User-selected local PDF, DOCX, TXT, and Markdown content.
- Configured third-party AI and speech-to-text providers, with local speech-to-text fallback where available.
- Secure local settings storage and screen-capture protection.

### Out of scope for v2.0

- Hosting or recording webinar sessions.
- Replacing Zoom, Teams, Google Meet, or another meeting platform.
- Multi-user collaboration, cloud synchronization, or centralized administration.
- Guaranteeing AI answer correctness; answers remain presenter-assistance content and require user judgment.

### Assumptions and constraints

- Users provide valid provider credentials and comply with provider terms.
- Provider latency, quota, and network availability are external dependencies.
- The presenter remains responsible for content, privacy, and decisions made during a session.
- The project remains MIT licensed and must not commit credentials or private user documents.

## 8. Business Acceptance Criteria

| ID | Acceptance criterion | Evidence required |
|---|---|---|
| BA-01 | A first-time user can configure a supported presentation and start the overlay in 60 seconds or less. | Usability test record |
| BA-02 | Supported PDF, DOCX, TXT, and Markdown files open in the correct viewer without exposing the local filesystem to renderer code. | Functional test and IPC review |
| BA-03 | A configured AI provider can produce a streamed answer and the UI identifies provider failure or fallback. | Integration test log |
| BA-04 | A cloud STT outage does not silently lose the session when local fallback is enabled and its model is ready. | STT failover test |
| BA-05 | API credentials are encrypted using Electron `safeStorage` where available and are absent from source control. | Security review and secret scan |
| BA-06 | The app recovers from renderer failure through the existing restart path without corrupting persisted settings. | Resilience test |

## 9. Requirements Traceability and Approval

The detailed functional traceability is maintained in [`docs/FRD.md`](./FRD.md). The solution and technical design traceability is maintained in [`docs/Solution-Design.md`](./Solution-Design.md), [`docs/HLD.md`](./HLD.md), and [`docs/LLD.md`](./LLD.md).

| Approval role | Responsibility | Approver | Date | Decision |
|---|---|---|---|---|
| Business sponsor | Confirms business value, scope, and success measures | __________________ | __________ | Pending |
| Product owner | Confirms persona workflows and release priorities | __________________ | __________ | Pending |
| Engineering lead | Confirms feasibility, estimates, and technical ownership | __________________ | __________ | Pending |
| Security/privacy reviewer | Confirms credential, document, and capture-protection controls | __________________ | __________ | Pending |
| QA/release owner | Confirms acceptance evidence and release readiness | __________________ | __________ | Pending |

**Approval rule:** Approval is complete only when all required roles record `Approved`. Any scope, priority, security, or success-metric change after approval requires a new version and re-approval of the affected sections.

## 10. Document Control

| Field | Value |
|---|---|
| Document owner | Product owner |
| Classification | Internal working document |
| Current status | Proposed - Pending Approval |
| Baseline | Sarathi v2.0 enhancement scope |
| Review cadence | At scope change, release gate, or at least once per milestone |
| Related documents | FRD, Solution Design, HLD, LLD, test plan, release notes |

### Revision history

| Version | Date | Author | Change | Approval status |
|---|---|---|---|---|
| 2.0 | 2026-09-06 | CharanTheAIGuy | Initial v2 business requirements | Pending |
| 2.1 | 2026-09-07 | Engineering | Added scope boundaries, acceptance criteria, traceability, and approval control | Pending |
