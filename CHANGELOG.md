# Changelog

## 1.8.0

### Fixed: a mis-heard word could silently sink a whole question

- **AssemblyAI mishearing "write" as "right" made coding questions invisible.** "Write a Python function that..." is typically flat/declarative in intonation, so it never got a `?`, and depended entirely on matching the word "write" — a single homophone swap made it disappear with no capture, no error, nothing. Fixed with a precisely-scoped fix (not a blanket "right" match, which would have reopened the backchannel false-positive class fixed two releases ago): only the specific "right a/an/the/some/code..." shapes a real instruction actually takes are recognized, verified against real risk cases like "right away," "right along," and "right after" to confirm none of them false-positive.
- **The deeper fix: a substantial question that matches nothing is no longer silently and permanently dropped.** Previously, if the local keyword detector found no match at all, the question was gone — no fallback, no second chance. Now, a long, clearly-spoken buffer that doesn't match any known pattern gets one real semantic judgment (reusing the same check already built for backchannel detection) before being discarded. This means the *next* ASR mishearing, accent variation, or unanticipated phrasing doesn't require another one-off patch to catch — it's a structural fix, not another entry in a list.

### Documentation

- README now documents real, observed latency (roughly 1-3 seconds typical, up to ~5s for longer multi-clause questions) and network guidance grounded in actual testing: connection **stability** matters far more than raw speed — a connection that fluctuated down to 1-2 Mbps caused real transcription interruptions, independent of its peak speed rating.

## 1.7.0

### New: capture the interviewer's cross-question or clarification

- **"+ Question" (Ctrl+Plus+Q)** replaces "+ More detail," which added little once framework-structured answers already covered most of what it asked for. Arm it when the interviewer asks a genuine cross-question or clarification, or when a long question was only partially captured — the interviewer repeats or adds the missing part, you press it again, and the follow-up answer accounts for both the original question and the new one, with full context of what was already answered. Re-listen is unchanged and still the tool for "the whole capture was wrong, start over" — this is additive, not a replacement for it.

### Fixed: follow-ups losing the actual answer content

- **Follow-ups on framework-based answers (the majority of questions) had no idea what the original answer said.** Pressing a follow-up chip, using Speak, or attaching a screenshot sent the model a prompt where "the existing answer" was blank whenever the original answer used a structured framework (Behavioral, Theoretical, Scenario, System Design). The model then improvised a disconnected response instead of building on the real content on screen. Follow-ups now correctly see the actual prior answer regardless of which framework produced it.

### Fixed: screenshot Query silently losing your screenshot

- **Speaking a query about a staged screenshot could silently discard both the screenshot and what you said**, with no error and no feedback — a genuine bug in last release's first pass at this feature. Query now has its own independent state (so its "Listening…" indicator can never be confused with the card's separate Speak button) and toggling off always finalizes and sends, matching how Re-listen and "+ Question" already work.
- **Query with nothing spoken was refusing to send at all**, showing a warning instead. This was an overcorrection in the first fix above — silence should never block a send. Query now always sends when toggled off: with your spoken words if you gave any, falling back to the same generic instruction plain Send already uses if you didn't. Renamed from "Speak" to **Query** so it reads as a distinct action from the card's own Speak button at a glance, not just by color.

### Interface

- README rewritten to document "+ Question," the Query/Send distinction for screenshots, and the fact that backchannel remarks are now recognized and never sent to the model as real questions.

## 1.6.0

### Reliability: the fallback and error-reporting bugs are fixed

- **Automatic fallback to local Whisper was silently broken.** If AssemblyAI became unreachable, the app checked readiness of the wrong model — the hardcoded default, not the one actually downloaded and selected in Settings — and refused to fall back even though a working offline model was sitting right there. Fixed: the app now applies your actual selected model before checking whether it's ready.
- **A real failure on one audio source could be silently erased by the other.** Mic and system audio shared one error message; if system audio failed but the mic reported itself as listening, the error banner vanished with no explanation. Each source now tracks its own error independently.
- **API keys could get silently corrupted with no visible symptom.** A stray double-paste or trailing whitespace in Settings would save exactly as typed, with nothing anywhere trimming it — quietly breaking authentication. All key fields are now trimmed on entry.
- **Manual capture (Re-listen) could get stuck armed, silently swallowing audio.** Arming Re-listen on a question and then moving to a different card without explicitly disarming left every future system-audio transcript diverted into a dead buffer for up to 90 seconds — auto-capture would just stop working with no visible cause. Fixed: disarms automatically the moment you're no longer looking at that card.
- **The microphone test in Settings silently discarded most of what you said**, ending on the first word and throwing away the rest — a working mic looked broken. It now captures your whole answer and shows a live "Listening" preview as you speak.

### Capture accuracy: backchannel speech is no longer treated as a real question

- **Conversational remarks were captured as full questions and answered with fabricated content.** "Can you come again?" and "Yeah, why not?" were producing complete, invented technical answers. A semantic classifier — the same LLM already configured for answers, asked a one-word question — now distinguishes genuine questions from backchannel/repair speech, generalizing to phrasing never seen before rather than matching a fixed list.
- **Data/SQL and analytics questions were sometimes missed entirely** ("Identify distinct user sessions... Assign a unique session_id...") because the detector only recognized software-engineering verbs. Broadened to cover analytics vocabulary.
- **Latency regression from the new classifier fixed.** The classifier was reusing the same heavy model configured for full answers and re-running itself on every pause in a longer question — both fixed, bringing detection back down to a 1-3 second common case.

### Follow-ups now actually know what the original answer said

- **Follow-ups on framework-based answers (the majority of questions) were blind to the original answer.** Pressing a follow-up chip, using Speak, or attaching a screenshot sent the model a prompt where the "existing answer" was empty, so it improvised a disconnected response instead of building on what was actually said. Fixed — follow-ups now see the real prior content regardless of which framework answered the question.
- **New: speak your instructions for an attached screenshot.** Typing during a live call defeats the point of this app. Staging a screenshot now offers a **Speak** option alongside Send — say what you want done with it, and it's sent together with the screenshot and the full context of the original answer. Available in both Interview and Coding Challenge sessions.

### Interface

- The transcript strip's control icons (Auto Answer, Capture) are now icon-only with tooltips, matching the microphone button's existing style — recovers the space that was squeezing the live transcript to near-invisibility on narrower windows, and the transcript itself now shows up to two lines instead of a single truncated scrolling line.

## 1.5.0

### Answers that sound like a person, not a template

- **Frameworks are now visible in the answer.** Each framework renders its own labeled stages on the card — a behavioral answer shows Situation / Task / Action / Result / Learning, a theoretical one shows Definition / Example / Formula / Conclusion, and so on. Previously every answer rendered as the same generic "Answer + Key Steps" block regardless of the framework chosen, so there was no way to tell whether a framework had been applied at all.
- **General questions no longer get a framework.** "Hi, how are you?", "walk me through your career", "why do you want this role?", "any questions for us?" now get a short, natural spoken answer instead of being forced into a rigid structure. Previously anything the classifier didn't recognise fell back to Theoretical/DEFC — which produced a "Formula" section for questions about why you liked a job. A framework is now applied only on positive evidence, never by default.
- **Framework names no longer leak into what you say.** Follow-up answers were coming back with the internal acronym spoken aloud in first person — *"to add to my DEFC answer…"* — which is meaningless to an interviewer and reads like reciting from a cheat sheet. The acronym is no longer sent to the model at all, and a new guard forbids naming any framework, describing what the answer is doing, or acknowledging the request ("Sure, here's more detail…"). Answers now start directly with substance.
- **Interview-length code, with explain-as-you-type comments.** Generated code was long enough to be impractical to type live. It's now the shortest correct solution — no helper classes, no boilerplate or imports unless genuinely required — and carries 1-2 brief comments marking the key steps so you can explain what you're writing while you write it.
- **Pseudocode now follows a real convention, matched to the question.** Algorithmic questions get standard structured pseudocode (capitalised control flow, indentation, no invented `SET` keyword). Non-algorithmic questions — ML strategy, system design, process questions — get a numbered execution pipeline naming the actual techniques and metrics, instead of a fabricated function signature full of invented `ALL_CAPS` macros.
- **Filler words actually apply now.** The instruction was previously competing with several others in the prompt and was reliably ignored; it's now folded into the structural instructions the model actually follows.

### Speaking style

- **Practice & Learn My Style.** A new guided flow (Select Profile → *Learn my style* → *Practice now*) walks you through 8 practice questions that you answer yourself — **typed or spoken aloud**, with live transcription shown as you talk. Your answers are analysed into a reusable style profile describing how you actually talk: sentence length, filler words you genuinely use (quoted back to you), how you open and close an answer, formality, recurring phrasing. The generated profile is shown to you in full so you can judge whether it's accurate. This replaces relying solely on scraped fragments of past live interviews, which were compressed and unrepresentative; that passive path remains available as a faster, lower-signal alternative.
- **"Styled" badge on answers.** When an answer was actually written using your learned speaking style, the card says so — previously there was no way to verify the feature was doing anything.

### Capture reliability

- **Data/SQL questions are now detected.** Question detection only recognised software-engineering verbs (`write`, `implement`, `design`…) and had no analytics vocabulary at all, so a question opening with "Identify distinct user sessions… Assign a unique session_id…" produced no answer card whatsoever. Added `identify`, `assign`, `calculate`, `compute`, `determine`, `extract`, `derive`, `rank`, `partition`, `classify` and others, plus precise multi-word forms (`find the`, `count how many`) that don't false-positive on ordinary conversation.
- **Manual capture is findable.** The recovery control was an unlabelled ear icon; it now reads **Capture** / **Listening…**. Its tooltip also states plainly that the keyboard shortcut only works while MynaI's window is focused — during a call, focus is on the meeting window, so clicking is the reliable path.

### Fixes

- **"Speak this answer" in Practice failed outright** with *"WebSocket was closed before the connection was established"*. The microphone was being started twice within milliseconds, and the second start terminated the first connection while it was still opening. The same latent defect in **Settings → Test microphone** was fixed too.
- **Spoken practice answers were being discarded.** Pressing "Stop speaking" threw away everything said; the first pause ended the recording, truncating longer answers; and text could land under the wrong question. Recording now accumulates across pauses, commits everything on stop, shows live transcription while you speak, and the timeout went from 12s to 120s so a real answer isn't cut off mid-sentence.

## 1.4.0

### Reliability

- **Automatic LLM vendor failover.** If the primary provider produces no answer at all (outage, revoked key, sustained rate-limit), the request automatically retries against the next configured provider (OpenAI → Gemini → DeepSeek → OpenCode Go → OpenCode Zen) with the same prompt, before ever surfacing an error. A toast discloses when a fallback provider actually answered. OpenAI (GPT-5.4) is now the default provider.
- **Local Whisper transcription fallback.** AssemblyAI stays the default transcription engine, but if it becomes unreachable mid-call after exhausting reconnect attempts, that audio source automatically switches to a local Whisper model running entirely on-device — no internet required once downloaded — and switches back once AssemblyAI recovers. New **Settings → Transcription** panel: choose Fast (~77MB) or Accurate (~241MB), download with a real progress bar, and run a built-in microphone test end-to-end before ever starting a session.

### Answer quality

- **Question-type answer frameworks.** Every question is now automatically classified (Behavioral, Theoretical, Scenario, Coding, System Design) and answered using a matching structured framework — STAR-L, DEFC, SCOPE, REACT, and REALM respectively — instead of one generic answer shape for everything. Detection is instant (a local heuristic, no added latency) and explicitly grounds examples in your attached profile/resume/documents rather than inventing generic scenarios. Each answer card shows its detected type as a small tag you can click to override and regenerate.
- **Answer Preferences redesigned.** Length is replaced by **Format** (Full script / Script + bullets / Bullet points), plus a new **Use filler words** toggle for more natural, less scripted delivery.
- **Speaking-style learning.** A new per-profile action ("learn my speaking style") summarizes your own past saved interview transcripts into a reusable style descriptor, applied via a new **Match my speaking style** toggle in Answer Preferences — answers sound like your own voice, not generic AI phrasing.

### Notes

- Local transcription fallback and speaking-style learning both require some manual one-time setup (downloading the offline model; running at least one past session with Save Transcript on) — see the README for details.

---

## 1.3.0 and earlier

- Windows installer packaging (NSIS), Task Manager identity (`Gameinput Terminal`) and multi-resolution icon set.
- Local, in-window shortcut mechanism (`Ctrl+Plus+<letter>`) replacing OS-level global hotkeys, which proved unreliable across different machines.
- Global manual-capture fallback so a missed question is never a dead end.
- Coding Challenge session type, multi-screenshot follow-ups, resume upload, Profile/Documents/Extra Context, and the original stealth/overlay foundation (content-protected window, native-popup replacements, custom resize/drag).
