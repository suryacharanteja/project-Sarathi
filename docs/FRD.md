# Functional Requirements Document (FRD)

**Project:** Sarathi v2.0
**Version:** 2.0
**Date:** 2026-09-06
**Related:** [`docs/BRD.md`](./BRD.md)

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

## 6. Non-Functional Requirements

| ID | Requirement | Verification |
|---|---|---|
| NFR-01 | Renderer code must not read arbitrary local files directly; file access is mediated by preload/IPC. | Architecture review and negative test |
| NFR-02 | API credentials must be stored outside the repository and encrypted with Electron `safeStorage` where available. | Security test and secret scan |
| NFR-03 | A provider or STT outage must produce a visible, actionable state; silent failure is not acceptable. | Failure-injection test |
| NFR-04 | User documents must not be logged, sent to a provider, or persisted beyond the stated workflow without user action. | Data-flow review |
| NFR-05 | The application must pass `npm run typecheck` and `npm run build` before release. | CI/build record |
| NFR-06 | Overlay controls must remain usable at the supported minimum window size of 360 x 240 pixels. | Responsive UI test |
| NFR-07 | Renderer failure must be surfaced by the main process and offer restart or quit. | Resilience test |

## 7. Error Handling and Accessibility

- Every IPC operation returns a typed success, cancellation, or error result where applicable.
- File-picker cancellation is not treated as a failure or shown as an alarming error.
- Provider errors are mapped to actionable messages for invalid keys, rate limits, outages, timeouts, and network failures.
- Keyboard navigation and visible focus states are required for all setup and overlay actions.
- Text content must remain readable when font size is increased and must not depend on color alone to communicate status.
- Screen-capture protection is enabled by default and can be changed only through an explicit user action.

## 8. Functional Traceability

| BRD requirement | FRD coverage | Design coverage | Verification |
|---|---|---|---|
| BR-01, BR-04, BR-05 | FR-02, FR-04, FR-05 | HLD-03, LLD-04 | Viewer tests |
| BR-02, BR-03 | FR-01, FR-03 | HLD-04, LLD-05 | Setup workflow tests |
| BR-06 | Existing AI listener plus FR-07 | HLD-05, LLD-06 | STT/LLM integration tests |
| BR-07, BR-08 | FR-06 | HLD-04, LLD-05 | Overlay tests |
| BR-09, BR-14 | FR-07, FR-08 | LLD-05 | Keyboard interaction tests |
| BR-10 | FR-10 | Solution Design-04 | Visual review |
| BR-11 | Existing secure settings flow | HLD-06, LLD-07 | Secret scan/security review |
| BR-12, BR-13 | FR-09 and release controls | Solution Design-05 | Release checklist |

## 9. Approval and Document Control

| Approval role | Responsibility | Approver | Date | Decision |
|---|---|---|---|---|
| Product owner | Confirms behavior and acceptance criteria | __________________ | __________ | Pending |
| UX/design lead | Confirms interaction, accessibility, and visual requirements | __________________ | __________ | Pending |
| Engineering lead | Confirms implementation feasibility and interfaces | __________________ | __________ | Pending |
| QA lead | Confirms testability and acceptance evidence | __________________ | __________ | Pending |
| Security/privacy reviewer | Confirms data-flow and credential requirements | __________________ | __________ | Pending |

**Approval rule:** A functional requirement is baselined only after all required reviewers approve it. Changes after approval require a version increment, updated traceability, and re-approval of impacted design documents.

| Version | Date | Author | Change | Approval status |
|---|---|---|---|---|
| 2.0 | 2026-09-06 | Engineering | Initial v2 functional requirements | Pending |
| 2.1 | 2026-09-07 | Engineering | Added NFRs, traceability, accessibility, and approval control | Pending |

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

## 5. Critical Existing Code to Reuse

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
