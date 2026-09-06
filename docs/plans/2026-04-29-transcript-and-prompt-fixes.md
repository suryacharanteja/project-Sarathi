# Transcript and Prompt Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the desktop chat auto-scroll-during-transcript bug (issue #11), slow down transcript-to-chat conversion, and rewrite the AI system prompt so it works in non-coding interviews.

**Architecture:** Three independent fixes against the Electron desktop assistant. (1) An auto-scroll preference gates every `scrollTop = scrollHeight` write in the chat, including the partial-transcript path. (2) `mergeWindowMs` is raised from 2400 to 3500 ms in both renderer and main-process buffers. (3) `prompts.js` uses a multi-domain prompt that detects coding, system design, behavioral, conceptual, conversational, and other questions, applying the detailed code format only to coding questions.

**Tech Stack:** Electron 28, Node 18 (Electron-bundled), AssemblyAI streaming v3, Gemini via `@google/generative-ai`.

---

## Pre-flight

- [src/windows/assistant/renderer.js](../../src/windows/assistant/renderer.js) — wires the renderer transcript buffer.
- [src/windows/assistant/renderer/features/chat/chat-ui-manager.js](../../src/windows/assistant/renderer/features/chat/chat-ui-manager.js) — owns desktop chat scrolling.
- [src/windows/assistant/renderer/features/transcription/transcription-manager.js](../../src/windows/assistant/renderer/features/transcription/transcription-manager.js) — partial-transcript DOM and scroll behavior.
- [src/windows/assistant/renderer/features/assembly-ai/transcript-buffer.js](../../src/windows/assistant/renderer/features/assembly-ai/transcript-buffer.js) — renderer-side merge window.
- [src/services/assembly-ai/service.js](../../src/services/assembly-ai/service.js) — main-process merge window.
- [src/services/ai/prompts.js](../../src/services/ai/prompts.js) — system prompt builders.

This project has **no existing automated test runner**. Tests in this plan are manual verification steps unless otherwise stated.

Before starting any task: `git status` must be clean.

---

## Task 1: Respect the auto-scroll preference everywhere

**Why:** While the desktop user reads an AI response, partial transcripts can forcibly snap the view to the bottom. The user loses their place during speech. There is also no explicit way to disable auto-scroll.

**Files:**

- Modify: `src/windows/assistant/renderer/features/chat/chat-ui-manager.js`.
- Modify: `src/windows/assistant/renderer/features/transcription/transcription-manager.js`.
- Modify: `src/windows/assistant/renderer.js` and the assistant HTML/CSS that own the composer toolbar.
- Create: `src/windows/assistant/renderer/features/chat/auto-scroll-prefs.js`.

### Implementation

1. Add a single preference module using `localStorage` with the key `open-cluely.autoScrollEnabled`. Missing or unreadable values default to enabled.
2. Expose `autoScrollEnabled()`, `setAutoScrollEnabled(boolean)`, and `isNearBottom()` from the chat UI manager.
3. Gate every chat `scrollTop = scrollHeight` write with the live preference and the existing near-bottom rule.
4. Pass the chat scroll helpers into the transcription manager and apply the same gate to partial-transcript updates.
5. Add an `autoScrollToggle` button to the composer. Persist its state, expose `aria-pressed`, and visibly indicate when auto-scroll is off.

### Manual verification

1. With auto-scroll on, trigger an AI streaming response and verify the view follows new tokens.
2. Scroll up, speak, and verify the view stays where it was.
3. Turn auto-scroll off, return to the bottom, and send another request. Verify streaming does not move the view.
4. Toggle it on and verify streaming follows again.
5. Reload the window and verify the preference persists.

### Commit

```bash
git add src/windows/assistant
git commit -m "fix(chat): respect auto-scroll preference everywhere"
```

---

## Task 2: Slow down transcript-to-chat conversion

**Why:** The current `mergeWindowMs = 2400` means a 2.4-second pause flushes the buffered turn into a final chat bubble. A longer window reduces fragmented transcript bubbles during natural pauses.

**Files:**

- Modify: `src/windows/assistant/renderer.js`.
- Modify: `src/services/assembly-ai/service.js`.
- Optional: `src/services/assembly-ai/stt-history.js` to make the default configurable.

### Implementation

1. Change both merge-window call sites to `3500` ms.
2. Optionally add a `TRANSCRIPT_MERGE_WINDOW_MS` environment setting with a default of `3500`, then pass it to both call sites.

### Manual verification

Start the app and speak a sentence with a 2-second pause followed by a 3.5-second pause:

- A 2-second pause keeps both halves in one bubble.
- A 3.5-second pause creates a new bubble.

### Commit

```bash
git add src/windows/assistant/renderer.js src/services/assembly-ai/service.js
git commit -m "tune(transcript): raise merge window to reduce churn"
```

---

## Task 3: Rewrite the AI system prompt for non-coding interviews

**Why:** The current prompt forces coding-oriented output in HR, behavioral, system-design, and product conversations. Responses should route by intent and only use code-heavy formatting for genuine coding questions.

**Files:**

- Modify: `src/services/ai/prompts.js`.

### Implementation

1. Define a shared core directive covering direct answers, uncertainty, Markdown/math formatting, screen/transcript precedence, and silent STT corrections.
2. Classify each request into one domain: coding, system design, behavioral, conceptual, conversational, or other.
3. Use domain-specific formats:
   - **Coding:** complete code first, approach, complexity, and non-trivial edge cases.
   - **System design:** headline, components, data flow, and trade-offs.
   - **Behavioral:** a speakable STAR-style answer and concise talking points.
   - **Conceptual:** plain-English explanation with a short recap.
   - **Conversational:** one short sentence.
   - **Other:** direct answer first and a final answer when useful.
4. Apply the programming-language preference only when the request is actually coding-related.
5. Rebuild `buildAskAiSessionPrompt` and `buildScreenshotAnalysisPrompt` around the shared directive. Leave the existing suggestion, meeting-notes, and insights prompts unchanged.

### Manual verification

Run four typed-input scenarios:

- Coding: “Reverse a linked list iteratively.”
- Behavioral: “Tell me about a time you handled a conflict.”
- System design: “Design a URL shortener.”
- Conversational: “How are you?”

Confirm the outputs use the matching format and never expose the system prompt or `=== FORMAT:` tags.

### Commit

```bash
git add src/services/ai/prompts.js
git commit -m "feat(ai): support non-coding interview prompt formats"
```

---

## Final integration check

1. Start the desktop app with `npx electron .`.
2. Verify transcript buffering, auto-scroll behavior, and persisted preference.
3. Verify coding, behavioral, system-design, and conversational responses.
4. Review the final commit graph and push the current branch:

```bash
git log --oneline -8
git push origin main
```

## Out of scope

- No mobile companion or mobile-server implementation is part of this plan.
- No new automated test runner is introduced; the repository currently has no `test` script.
- No changes are made to the other prompt builders unless required by a shared helper.