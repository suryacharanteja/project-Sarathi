# Sarathi — Enhancement Plan v2.0
## Includes: BRD · FRD · Implementation Roadmap

> On approval, `docs/BRD.md` and `docs/FRD.md` will be created as standalone deliverables, followed by phased feature implementation.

---

---

# PART 1 — BUSINESS REQUIREMENTS DOCUMENT (BRD)

**Document:** `docs/BRD.md`
**Project:** Sarathi — AI-Powered Presentation Co-Pilot
**Version:** 2.0
**Date:** 2026-09-06
**Author:** CharanTheAIGuy
**Status:** Draft — Pending Approval

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

---

# PART 2 — FUNCTIONAL REQUIREMENTS DOCUMENT (FRD)

**Document:** `docs/FRD.md`
**Project:** Sarathi v2.0
**Version:** 2.0
**Date:** 2026-09-06

---

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Sarathi Desktop App (Electron + React + TypeScript)            │
│                                                                 │
│  Setup Screen (light glass-morphism)                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Persona Tabs: [Webinar Host] [Teacher] [Speaker] [Meeting]│   │
│  │                                                           │   │
│  │  Content Panel          │  Settings Panel                │   │
│  │  ┌───────────────────┐  │  ┌────────────────────────┐   │   │
│  │  │ Mode Picker       │  │  │ Scroll/Font/Flip        │   │   │
│  │  │ File Upload / Slide│  │  │ AI Listener toggle      │   │   │
│  │  │ Builder           │  │  │ Provider + Model picker  │   │   │
│  │  └───────────────────┘  │  └────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Presentation Overlay (dark, always-on-top, screen-capture safe)│
│  ┌────────────────────────────────┐ ┌────────────────────────┐  │
│  │ Content Viewer (75%)           │ │ AI Co-Pilot (25%)       │  │
│  │                                │ │                         │  │
│  │ [Teleprompter / Carousel /     │ │ Transcript Strip        │  │
│  │  PDF Pages / Doc Text]         │ │ Answer Cards            │  │
│  │                                │ │ AskAiBar                │  │
│  │ Top bar: ← | Mode | Progress   │ │                         │  │
│  │ 48% ██████░░░░ | ⏱ 12:34 | 🕐 │ │                         │  │
│  └────────────────────────────────┘ └────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Feature Specifications

---

### FR-01: Persona Tab System (Setup Screen)

**Description:** The setup screen is reorganized into four persona tabs. Each tab shows a purpose-built content panel and a shared settings panel.

**Tabs:**
| Tab | Icon | Primary Content Panel |
|---|---|---|
| Webinar Host | 🎙 | Slide Builder (add/edit/reorder slides) |
| Teacher | 🎓 | Slide Builder + Lesson Timer option |
| Speaker | 📄 | File Upload (PDF/DOCX/TXT) |
| Meeting | 💼 | Quick plain-text scratchpad input |

**State:** Active tab stored in `setup-store.ts` (new). Persisted to localStorage so the user's last persona is remembered.

**UI rules:**
- Tabs render as a horizontal pill-style selector at the top of the setup card
- Active tab: `bg-indigo-600 text-white`, inactive: `text-neutral-500 hover:text-neutral-800`
- Tab switch is animated with a sliding underline (CSS transition on a `transform: translateX()` indicator)

---

### FR-02: Content Mode Picker

**Description:** Within the content panel, the user picks a content mode. The mode determines how content is displayed in the overlay.

**Modes:**
| Mode ID | Label | Trigger | Viewer Component |
|---|---|---|---|
| `teleprompter` | Scroll | Default for Meeting tab | `TeleprompterPanel` (existing) |
| `carousel` | Slides | Default for Host/Teacher tabs | `SlideCarouselPanel` (new) |
| `pdf` | PDF | Auto-selected when PDF is uploaded | `PdfViewerPanel` (new) |
| `document` | Document | Auto-selected for DOCX/TXT | `DocumentViewerPanel` (new) |

Mode is stored in `prompter-store.ts` as `contentMode: 'teleprompter' | 'carousel' | 'pdf' | 'document'`.

---

### FR-03: Slide Builder (Carousel Mode)

**Description:** A slide editor where the presenter creates speaker notes slide-by-slide.

**Data model:**
```typescript
interface Slide {
  id: string        // nanoid
  title: string     // e.g. "Introduction"
  body: string      // speaker notes / content to display
}
```
Stored in `prompter-store.ts` as `slides: Slide[]`.

**UI (setup screen):**
- Left rail: slide list (numbered, draggable via mouse-down+move on the handle icon)
- Main area: title input + body textarea for the selected slide
- Toolbar: [+ Add Slide] [🗑 Delete] [↑ Move Up] [↓ Move Down]
- Import from file: parses headings (# Title → new slide; body = text until next heading)

**Overlay — SlideCarouselPanel:**
- Shows current slide's `body` text centred in the viewer
- Slide title shown in small caps above the body
- Navigation: ← Previous slide | Slide 3/7 | Next slide →
- Keyboard: ArrowLeft / ArrowRight or PageUp / PageDown
- Progress: filled bar showing position across all slides

---

### FR-04: PDF Viewer

**Description:** PDF pages rendered as images inside the overlay viewer.

**Implementation approach:**
- Add new IPC channel `document:renderPdfPages` in `src/main/ipc.ts`
- Main process uses `pdf-parse` (already installed) to determine page count, then uses Electron's `webContents.capturePage` workaround OR a lightweight canvas renderer
- **Preferred:** Use `pdfjs-dist` in the **renderer** directly (add as dependency). The renderer receives the file path via IPC (`document:getFilePath`), then loads it into a PDF.js `pdfjsLib.getDocument()` call and renders each page onto a `<canvas>` element.
- Pages are lazy-rendered on demand (render current ± 1 page)

**Overlay — PdfViewerPanel:**
- `<canvas>` element displays the current page, scaled to fill the panel width
- Navigation: ← Previous page | Page 4/22 | Next page →
- Keyboard: ArrowLeft / ArrowRight
- Zoom: +/- keys (scale factor 0.5 – 2.0)

**New IPC channel:**
```typescript
getDocumentFilePath: 'document:getFilePath'  // returns { filePath: string }
```

---

### FR-05: Document Viewer (DOCX / TXT)

**Description:** DOCX files rendered as formatted HTML; TXT files rendered as styled plain text with the teleprompter scroll.

**Implementation:**
- Add new IPC channel `document:getHtml` → main calls `mammoth.convertToHtml({ path: filePath })` → returns `{ html: string }`
- Renderer renders `<div dangerouslySetInnerHTML={{ __html: sanitized }}>`
- Basic XSS sanitization: strip `<script>`, `<iframe>`, `on*` attributes (simple regex, no external sanitizer needed for locally-opened files)
- TXT files: render as `<pre>` with `white-space: pre-wrap` and the prompter font/size settings applied

**Overlay — DocumentViewerPanel:**
- Reuses the `TeleprompterPanel` auto-scroll infrastructure
- For DOCX: renders formatted HTML (mammoth preserves bold, italic, headings)
- Font size and scroll speed sliders apply as usual

---

### FR-06: Overlay Top Bar — Progress, Timer, Clock

**Description:** A persistent top bar inside the content viewer panel.

**Elements (left to right):**
| Element | Detail |
|---|---|
| Back button | "← Setup" — returns to setup screen |
| Mode badge | Small pill: `Slides` / `PDF` / `Scroll` / `Doc` |
| Progress bar | Thin `4px` bar showing scroll % or slide N/total. Color: `#6366f1` |
| Slide / Page counter | "3 / 7" or "42%" |
| Spacer | flex-1 |
| Pause indicator | `⏸ paused` or `▶ scrolling` (teleprompter only) |
| Session timer | `⏱ 12:34` (count-up from session start) |
| Clock | `🕐 14:32` (system time, updates every 30 s) |
| Minimize / Close | — and ✕ |

**Implementation:**
- Timer: `useEffect` with `setInterval(1000)` tracking seconds since `onHome` → `Start Presenting`
- Clock: system time formatted with `Intl.DateTimeFormat`
- Progress: for teleprompter = `el.scrollTop / (el.scrollHeight - el.clientHeight)`, for carousel = `(currentSlide + 1) / slides.length`, for PDF = `currentPage / totalPages`

---

### FR-07: Keyboard Shortcut System (Enhanced)

**Description:** Discoverable keyboard shortcuts with an in-overlay cheatsheet.

**Shortcuts:**

| Key | Action | Mode |
|---|---|---|
| Space | Pause / Resume scroll | Teleprompter |
| ← / → | Previous / Next slide or page | Carousel, PDF |
| + / = | Increase font size by 2px | All |
| - | Decrease font size by 2px | All |
| Shift+↑ / Shift+↓ | Increase / Decrease scroll speed | Teleprompter |
| B | Toggle bookmark at current position | Teleprompter |
| J / K | Jump to next / prev bookmark | Teleprompter |
| ? | Toggle shortcut cheatsheet overlay | All |
| Ctrl+Alt+A | Manual capture (existing) | All |

**Cheatsheet:** A semi-transparent card (`bg-neutral-900/90`) that floats over the content panel when `?` is pressed. Lists all shortcuts in a two-column grid. Dismissed by pressing `?` again or Escape.

---

### FR-08: Bookmark System

**Description:** Presenters can mark key positions in a scrolling script and jump between them.

**State:** `bookmarks: number[]` (scroll pixel positions) in `prompter-store.ts`.

**Behaviour:**
- Press `B`: adds `el.scrollTop` to `bookmarks` array; a small indigo pip appears on the right edge of the scroll area at that position
- Press `J`: scroll jumps to the next bookmark position (smooth scroll)
- Press `K`: scroll jumps to the previous bookmark position
- Bookmarks shown as `◆` markers on a thin right rail next to the scroll area
- Bookmarks are cleared when a new script is loaded

---

### FR-09: Word Count and Reading Time (Setup Screen)

**Description:** After loading a script or building slides, show estimated reading time.

**Formula:** `words / 130` (average speaker pace at 130 words/minute).

**Display:** A subtle row below the script/slide content area:
```
3,247 words · ~25 min reading time at normal pace
```

**Implementation:** Computed in the `prompter-store` as a derived value using `useMemo` in the setup screen.

---

### FR-10: UI Design System

**Description:** A coherent visual design system applied across all screens.

**Color tokens (dark overlay):**
```
bg-base:    #0a0a0f       (nearly black, hint of indigo)
bg-surface: #13131a       (card backgrounds)
bg-edge:    rgba(255,255,255,0.06)  (borders)
accent:     #6366f1       (indigo — primary action)
accent-dim: #4f46e5       (hover state)
positive:   #10b981       (green — active, listening)
warning:    #f59e0b       (amber — alerts, retries)
danger:     #ef4444       (red — errors)
text-hi:    #f5f5f5
text-mid:   #a3a3a3
text-lo:    #525252
```

**Color tokens (setup screen — light glass):**
```
bg-base:    rgba(255,255,255,0.92)
bg-surface: rgba(255,255,255,0.7)
accent:     #6366f1
text:       #111827
```

**Typography:**
- UI labels: `Inter` (system-ui fallback), 13–14 px, tracking-wide for section headers
- Script/teleprompter body: `Georgia, serif` (readable, warm)
- Monospace hints: `JetBrains Mono` (for meeting notes / code contexts)

**Elevation (dark theme):**
- Level 0: `bg-base` (main window bg)
- Level 1: `bg-surface` + `border border-white/6` (panels)
- Level 2: `bg-surface` + `shadow-xl` + `border border-white/10` (cards, modals)
- Level 3: `backdrop-blur-2xl` + overlay (cheatsheet, tooltips)

**Motion:**
- Tab switch: `transition-all duration-200 ease-out`
- Card appear: `animate-in fade-in slide-in-from-bottom-2 duration-150`
- Progress bar: `transition-width duration-300`
- All interactive elements: `transition-colors duration-150`

**Spacing:** 4-pt grid (`p-1 = 4px, p-2 = 8px, p-3 = 12px, p-4 = 16px, p-5 = 20px, p-6 = 24px`)

---

### FR-11: Bug Fix — overlay-store field name

**Current bug:** `OverlayHUD.tsx` reads `useOverlayStore((s) => s.answerCards)` but the store field is named `cards`.

**Fix:** Change `s.answerCards` → `s.cards` in `OverlayHUD.tsx`.

---

## 3. New Files & Modified Files Summary

### New files
| Path | Purpose |
|---|---|
| `docs/BRD.md` | Business Requirements Document |
| `docs/FRD.md` | Functional Requirements Document |
| `src/renderer/src/stores/setup-store.ts` | Persona tab + active mode state |
| `src/renderer/src/features/slides/SlideBuilder.tsx` | Slide management UI for setup |
| `src/renderer/src/features/slides/SlideCarouselPanel.tsx` | Overlay: carousel viewer |
| `src/renderer/src/features/viewer/PdfViewerPanel.tsx` | Overlay: PDF renderer (pdfjs-dist) |
| `src/renderer/src/features/viewer/DocumentViewerPanel.tsx` | Overlay: DOCX/TXT viewer |
| `src/renderer/src/features/overlay/ShortcutCheatsheet.tsx` | ? overlay with all shortcuts |
| `src/renderer/src/features/overlay/OverlayTopBar.tsx` | Progress + timer + clock bar |
| `src/renderer/src/features/overlay/BookmarkRail.tsx` | Bookmark pip markers on scroll area |

### Modified files
| Path | Change |
|---|---|
| `src/renderer/src/features/session/CreateSessionScreen.tsx` | Full redesign: persona tabs, mode picker, slide builder, word count |
| `src/renderer/src/features/overlay/OverlayHUD.tsx` | Add OverlayTopBar, mode-aware content panel, bug fix |
| `src/renderer/src/features/prompter/prompter-store.ts` | Add `contentMode`, `slides`, `bookmarks`, `currentSlideIndex`, `pdfFilePath`, `docHtml` |
| `src/shared/ipc-contract.ts` | Add `getDocumentFilePath`, `getDocumentHtml` channels + types |
| `src/main/ipc.ts` | Add handlers for `document:getFilePath` and `document:getHtml` |
| `package.json` | Add `pdfjs-dist` dependency |
| `src/renderer/src/index.css` | Add CSS custom properties for design tokens |

---

## 4. New IPC Channels

```typescript
// In IPC_CHANNELS:
getDocumentFilePath: 'document:getFilePath',
getDocumentHtml:     'document:getHtml',

// Return types:
interface GetDocumentFilePathResult { filePath?: string; error?: string }
interface GetDocumentHtmlResult     { html?: string;     error?: string }
```

**`document:getFilePath` handler (main):**
- Opens OS file picker filtered to PDF, DOCX, TXT
- Returns the absolute file path (renderer uses it for pdfjs-dist)

**`document:getHtml` handler (main):**
- Accepts `{ filePath: string }`
- Reads file, runs `mammoth.convertToHtml()` for DOCX or wraps TXT in `<pre>` tags
- Returns `{ html }`

---

---

# PART 3 — IMPLEMENTATION PLAN

## Phase 0: Deliverable Documents (30 min)
- Write `docs/BRD.md` (BRD content from Part 1 above)
- Write `docs/FRD.md` (FRD content from Part 2 above)

## Phase 1: Foundation — Store + IPC + Design Tokens (1 hour)
1. Fix `OverlayHUD.tsx` bug: `s.answerCards` → `s.cards`
2. Expand `prompter-store.ts`: add `contentMode`, `slides`, `currentSlideIndex`, `bookmarks`, `pdfFilePath`, `docHtml`
3. Create `setup-store.ts`: active persona tab, mode
4. Add IPC channels in `ipc-contract.ts`: `getDocumentFilePath`, `getDocumentHtml`
5. Add IPC handlers in `src/main/ipc.ts`: `document:getFilePath`, `document:getHtml` (mammoth)
6. Add `pdfjs-dist` to `package.json`
7. Add CSS design tokens to `src/renderer/src/index.css`

## Phase 2: Setup Screen Redesign (2 hours)
1. Create `setup-store.ts`
2. Rewrite `CreateSessionScreen.tsx`:
   - Persona tab selector (4 tabs with icons)
   - Content panel (mode picker + context-aware input: slide builder OR file upload)
   - Slide builder embedded (for Host/Teacher tabs)
   - File upload (for Speaker/Meeting tabs) with auto mode detection
   - Settings panel: scroll speed, font size, mirror flip, AI listener
   - Word count + reading time row
   - "Start Presenting" button

## Phase 3: Slide Builder Component (1.5 hours)
1. Create `SlideBuilder.tsx`: slide list rail + editor + toolbar
2. Create `SlideCarouselPanel.tsx`: carousel overlay viewer
3. Wire keyboard nav (ArrowLeft/Right) in overlay

## Phase 4: PDF Viewer (2 hours)
1. Install `pdfjs-dist`, configure worker URL in renderer
2. Create `PdfViewerPanel.tsx`: canvas-based page renderer, lazy load ±1 pages
3. Add IPC to pass file path to renderer; renderer loads PDF directly via pdfjs-dist
4. Wire keyboard nav (ArrowLeft/Right) in overlay

## Phase 5: Document Viewer (1 hour)
1. Create `DocumentViewerPanel.tsx`: renders `html` from IPC using `dangerouslySetInnerHTML` with basic sanitization
2. Wire to mammoth IPC handler for DOCX
3. For TXT: use existing teleprompter scroll with `<pre>` formatting

## Phase 6: Overlay Enhancements (2 hours)
1. Create `OverlayTopBar.tsx`: progress bar, mode badge, timer, clock, controls
2. Create `ShortcutCheatsheet.tsx`: `?` key overlay
3. Create `BookmarkRail.tsx`: pip markers on right edge of scroll area
4. Update `OverlayHUD.tsx`:
   - Replace hard-coded two-panel layout with mode-aware content switcher
   - Integrate `OverlayTopBar`
   - Fix the `answerCards` bug
5. Add enhanced keyboard shortcuts to `local-shortcuts.ts`

## Phase 7: UI/UX Polish (1.5 hours)
1. Apply design tokens across all screens (CSS custom properties)
2. Add micro-animations (tab transitions, card appear, progress bar)
3. Audit spacing consistency (4-pt grid)
4. Ensure all hover/focus states follow the token system
5. Test light (setup) vs dark (overlay) themes

## Phase 8: Verification
1. `npm run typecheck` — zero errors
2. `npm run dev` — app launches, all four persona tabs visible
3. Load a TXT file → teleprompter mode, scroll works
4. Build slides → carousel mode, ArrowLeft/Right navigate
5. Upload a PDF → PDF viewer shows pages, navigation works
6. Upload DOCX → formatted HTML renders correctly
7. Start presenting → overlay top bar shows timer + clock + progress
8. Press `?` → shortcut cheatsheet appears
9. Press `B` → bookmark appears; `J`/`K` jump between bookmarks
10. Speak a question → AI answer card appears in right panel
11. `git grep -r "ApiKey\|api_key" --include="*.json" -- ':!package.json'` — zero matches

---

## Critical existing code to reuse

| Reuse | Location |
|---|---|
| `useLiveTranscription` | `src/renderer/src/features/overlay/useLiveTranscription.ts` — unchanged |
| `AnswerCardStack` | `src/renderer/src/features/overlay/AnswerCardStack.tsx` — unchanged |
| `TranscriptStrip` | `src/renderer/src/features/overlay/TranscriptStrip.tsx` — unchanged |
| `AskAiBar` | `src/renderer/src/features/overlay/AskAiBar.tsx` — unchanged |
| `TitleBar` | `src/renderer/src/components/ui/title-bar.tsx` — unchanged |
| `Toggle`, `Dropdown` | `src/renderer/src/components/ui/toggle.tsx`, `dropdown.tsx` — unchanged |
| `extractText()` | `src/main/documents/extract-text.ts` — reused for DOCX→HTML in new handler |
| LLM router | `src/main/services/llm/router.ts` — unchanged |
| STT pipeline | `src/renderer/src/features/audio/audio-pipeline.ts` — unchanged |
| `safeStorage` key store | `src/main/store.ts` — unchanged |
