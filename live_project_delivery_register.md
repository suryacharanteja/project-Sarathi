# Live Project Delivery Register

**This register is the persistent project memory for Sarathi. Anything and everything relevant to the project must be documented here, or linked here with a clear summary.**

Last updated: 2026-10-28 (Asia/Dubai). Baseline reviewed: `b717ab89444cf3dff78fc7c4a85119a1c9b06b00`, version 1.8.0.

## Mandatory documentation policy

- Read this register before starting project work. Update it during material changes and before each handoff.
- Document every requirement, clarification, decision and rationale, assumption, change, issue, bug, risk, dependency, experiment, test result, failure, workaround, release, blocker and next action. Link detailed artifacts where appropriate; chat history alone is not project memory.
- Record date, stable ID, severity/priority, status, owner, evidence, affected files, acceptance criteria and next action for work items. Use `Unassigned` when no owner has accepted the work.
- Preserve history. Never silently delete or overwrite decisions or closed issues; record superseding decisions and reasons.
- Distinguish observed results, static code findings and unverified hypotheses. Do not mark a fix verified without recording the actual verification result.
- Never document secret values, API keys or private document/transcript contents. Record redacted descriptions and safe references instead.
- Keep this register authoritative for delivery status. Related design documents remain supporting references, and discrepancies must be recorded here.

## Current delivery status

LibreOffice subprocess hang risk now has a bounded fix: discovery probes time out after 3 seconds and conversions time out after 60 seconds with a structured error. Latest validation: typecheck PASS, tests 44/44, Electron integration 20/20, packaged acceptance 10/10, installer rebuilt. UI/UX update remains completed with live UI UAT 12/12. Actual LibreOffice visual conversion, native picker, installation lifecycle and signing remain separate acceptance limits.

Latest UX delivery: UX-008 PDF viewer clarity work is implemented and live Electron UAT passes 15/15. Typecheck, production build and unit tests pass (47/47). Fit-to-page, resize-aware layout, explicit zoom controls and high-DPI canvas rendering are covered. See the [PDF viewer delivery record](#pdf-viewer-clarity--2026-10-28) and [PDF UAT results](docs/validation/2026-10-28/pdf-viewer-results.json).

Remediation implemented for all eleven recorded findings (CR-001 through CR-011), on 2026-09-16. Owner: Codex. The original review identified 3 High and 4 Medium findings; follow-up runtime acceptance identified 4 further Medium findings. Latest document checks pass 20/20; the complete automated suite passes 42/42 and all three TypeScript projects pass. Prior native speech and packaged lifecycle results remain linked below. Native picker interaction, actual OS/device failure scenarios, LibreOffice conversion, endurance testing, installation lifecycle and signing remain acceptance limits. See the latest dated ledger for package status and evidence. No Critical finding was established. This is not a release certification.

Severity: Critical/P0 = immediate catastrophic impact; High/P1 = significant security or delivery gate defect; Medium/P2 = conditional functional/reliability defect; Low/P3 = minor impact.

## Scope and limitations

Reviewed the active Electron/Vite entry points, main IPC handlers, settings and session/document persistence, LLM routing, STT routing/local worker lifecycle, renderer audio capture, transcription recovery, document rendering and compiler/build configuration. The older JavaScript application tree is not the active package entry point and was not comprehensively audited. This is a focused repository review, not an exhaustive security audit.

Initial review checkpoint only (superseded by the runtime acceptance ledgers below): validation used local source and installed dependencies. At that checkpoint, no external provider requests, real microphone capture, model downloads, packaged installer runs or GUI failure injection were performed. Runtime findings below are static path analyses with explicit verification procedures, not claims of end-to-end reproduction.

## Findings and remediation backlog

All findings discovered 2026-09-16; initially OPEN and Unassigned. Remediation owner is now **Codex**. Current statuses and evidence are recorded in the remediation ledger below. Evidence line numbers in the original finding table refer to the reviewed baseline.

| ID | Severity | Issue | Evidence location | Next action |
| --- | --- | --- | --- | --- |
| CR-001 | High/P1 | Typecheck reports success without checking application projects | `package.json:12`, `tsconfig.json:2` | Check both referenced projects and resolve diagnostics |
| CR-002 | High/P1 | Document IPC reads arbitrary renderer-supplied filesystem paths | `src/main/ipc.ts:351-378` | Restrict reads to main-process-authorized documents |
| CR-003 | High/P1 | API keys silently persist as plaintext when encryption is unavailable | `src/main/store.ts:28-30` | Refuse persistent secret storage without secure encryption |
| CR-004 | Medium/P2 | Failed audio startup leaks STT sessions and partially acquired audio resources | `src/renderer/src/features/audio/capture.ts:42-64,74-114` | Add rollback covering each startup stage |
| CR-005 | Medium/P2 | Initial transcription failure can leave no Retry control | `src/renderer/src/features/overlay/useLiveTranscription.ts:691`, `OverlayHUD.tsx:293` | Expose recovery on initial startup failure |
| CR-006 | Medium/P2 | No-key offline fallback checks the wrong model before configuration | `src/main/services/stt/router.ts:117-122` | Configure selected model before checking readiness |
| CR-007 | Medium/P2 | Model download request never settles if worker exits | `src/main/services/stt/local.ts:95-103,197-213` | Settle pending requests on worker exit/disposal |

### CR-001 — False-success type-check gate

The root tsconfig has `files: []` and project references. `tsc --noEmit` does not traverse these referenced projects as a build. The documented command succeeds while direct checks fail with 11 diagnostics: 4 in the main project and 7 in the renderer project. These include invalid `.ts` imports in tests, a `string | boolean | null` settings value passed to string encryption, an invalid settings input value type, an unused variable, two PDF render parameter errors, and Node test imports included in the web project.

Observed reproduction: `npm run typecheck` succeeds; `npx tsc --noEmit -p tsconfig.node.json` and `npx tsc --noEmit -p tsconfig.web.json` fail. Acceptance: the public typecheck command checks both projects, all current diagnostics are resolved, and an intentional type error in either project fails the gate. Fix test project boundaries as part of remediation.

### CR-002 — Unrestricted document file read capability

`readDocumentBytes` directly calls `readFileSync(filePath)` on renderer input; `getDocumentHtml` similarly reads arbitrary non-DOCX paths. Neither ties the path to a prior file selection nor validates the IPC sender. The preload exposes both calls. A compromised renderer can therefore read any file accessible to the application account, without the user choosing that file. This finding requires renderer compromise or another untrusted caller; this review does not establish a standalone remote exploit.

Acceptance: main-owned document handles or a canonical-path allowlist restrict access to files explicitly authorized through the picker, sender/frame checks reject unauthorized callers, and a synthetic unrelated file cannot be read through either endpoint. Test with temporary fixtures, never real private files.

### CR-003 — Silent plaintext key storage

`encryptValue` returns the original key when `safeStorage.isEncryptionAvailable()` is false or throws. `writeSettings` then writes that key into JSON. This contradicts the README's encrypted-storage promise and exposes keys at rest on systems without an available encryption backend.

Acceptance: with encryption mocked unavailable, saving a key either reports an actionable failure or keeps it only in memory; no plaintext secret is persisted. Verify encrypted round trips when encryption is available and document the chosen unavailable-backend behavior.

### CR-004 — Audio startup lacks rollback

Both startup functions start main-process STT before requesting a media stream. If permissions are denied or stream/processor setup fails, no catch/finally stops STT. Runtime resource references are assigned only after all setup succeeds; stop functions return immediately while `active` is false and `context` is null. Thus `stopAll` cannot clean up failed startup. Failures after stream acquisition can additionally leave live tracks or AudioContexts untracked.

Acceptance: inject rejection at media acquisition, context resume and processor construction for each source. Each acquired resource must be released, main STT stopped, and a subsequent start must succeed without leaked connections or tracks.

### CR-005 — Startup failure has no direct recovery

The initial `capture.startSystem()` rejection only sets the error message. It does not set `systemAudioIssue`, which gates the visible Retry button. For a synchronous STT rejection such as a missing key with unavailable fallback, the listening watchdog never starts, so it cannot expose recovery later. After correcting settings, the current session has no direct Retry action for this state.

Acceptance: force initial `sttStart` rejection, confirm a Retry action is visible immediately, correct the configuration, and recover in the same session. Keep the action available after a failed retry.

### CR-006 — Selected offline model checked too late

When no AssemblyAI key exists, `start` calls `local.modelStatus()` before applying `settings.sttModel`. A newly created local service initially points at the hardcoded default model. If only a different selected model is cached and no earlier status request configured it, startup incorrectly rejects with the missing-key/download message. The cloud-error fallback branch already configures before checking, but the no-key branch does not.

Acceptance: create a fresh router with no cloud key, fallback enabled, only a non-default selected model cached, and no preceding status query. Starting a source must select local successfully. Also test a genuinely missing selected model.

### CR-007 — Worker exit leaves model-download promise pending

`ensureModel` resolves only when its watcher receives `model-ready` or `model-error`. The child `exit` handler updates status but does not notify/settle these watchers; disposal and model-switch shutdown likewise do not settle them. A crash during download can leave the IPC invocation and awaiting UI operation pending indefinitely.

Acceptance: terminate a worker during an outstanding ensure-model request and verify that the promise resolves with an actionable failure. Verify disposal and model replacement settle pending work, remove watchers and allow a clean retry.

## Validation ledger

| ID | Date | Check | Observed result |
| --- | --- | --- | --- |
| V-001 | 2026-09-16 | `npm test` | PASS: 23 tests, 0 failures across PPTX extraction, endpointing and schemas |
| V-002 | 2026-09-16 | `npm run build` | PASS: main, preload, worker and renderer bundles generated |
| V-003 | 2026-09-16 | `npm run typecheck` | Exit success, but invalid as an application gate; see CR-001 |
| V-004 | 2026-09-16 | `npx tsc --noEmit -p tsconfig.node.json` | FAIL: 4 diagnostics |
| V-005 | 2026-09-16 | `npx tsc --noEmit -p tsconfig.web.json` | FAIL: 7 diagnostics |

The reported 99.46% test line coverage covers modules loaded by these tests, including test files; it is not whole-application coverage. IPC, persistence, capture lifecycle and provider integration are not validated by this suite. Tests also emitted Node module-type warnings. Compiler-generated tracked build-info changes from review checks were restored to baseline.

## Decisions and change history

| ID | Date | Decision/change | Rationale/outcome |
| --- | --- | --- | --- |
| MEM-001 | 2026-09-16 | Establish this file as mandatory project memory | Explicit user instruction to document anything and everything and use a live delivery register |
| REV-001 | 2026-09-16 | Review active application and run tests/build/real type checks | Seven open findings, with evidence and closure criteria above |
| DOC-001 | 2026-09-16 | Add root `AGENTS.md` and README link | Make the memory requirement discoverable to future contributors and agents |
| SCOPE-001 | 2026-09-16 | Deliver review and documentation; leave application code unchanged | Requested output was issues with severity and a populated project memory register |

## Next handoff

1. Real cached-model transcription and successful same-session retry now pass; broaden acceptance to representative accents, noisy audio and long sessions before making accuracy/performance claims. Only synthetic speech was transcribed; no cloud inference requests were made.
2. Exercise a native file picker and LibreOffice conversion on a machine with LibreOffice installed; formatted DOCX fallback and Chromium PDF rendering already passed.
3. Complete install/upgrade/uninstall acceptance and signing before distribution. The unsigned installer build and setup screens passed; its unpacked application was tested without installation.
4. Preserve the distinction between actual device acquisition (passed) and hardware disconnect/OS permission/keychain-lock failure scenarios (injected checks passed, physical scenarios pending).

Supporting context: [README](README.md), [BRD](docs/BRD.md), [FRD](docs/FRD.md), [HLD](docs/HLD.md), [LLD](docs/LLD.md), [Solution Design](docs/Solution-Design.md), [Enhancement Plan](docs/plans/2026-09-06-sarathi-enhancement-plan-v2.md), [Changelog](CHANGELOG.md). These documents were located as context references; their requirements were not exhaustively reconciled in this review.


## Remediation ledger — 2026-09-16

User follow-up: "next". Interpreted as proceeding with the seven recorded fixes. This supersedes the review-only scope decision SCOPE-001 for this follow-up; the earlier review remains historical evidence.

| ID | Status | Implementation and validation | Remaining verification |
| --- | --- | --- | --- |
| CR-001 | VERIFIED | Public typecheck checks main, renderer and dedicated test projects. Tests excluded from production compiler projects. Narrow API-key field types, remove unused selectors and use the installed PDF renderer parameter shape. All three projects pass. Temporary intentional type errors in main and renderer each made the public command fail with exit 1; probes removed afterward. | None for compiler gate |
| CR-002 | FIXED / AUTOMATED CHECKS PASSED | Main-owned canonical document allowlist in src/main/documents/access.ts; picker grants selected files or conversion output; HTML/byte handlers enforce the allowlist and owning main frame. Overlay navigation and popup creation blocked. Regression checks reject unselected fixtures, invalid input, other senders and subframes, and allow selected fixtures. | Actual Electron picker, DOCX conversion and PDF viewer flow |
| CR-003 | FIXED / AUTOMATED CHECKS PASSED | Secret persistence throws when encryption is unavailable or its availability check throws. Settings UI displays the save failure. Narrow key-field typing prevents boolean values reaching encryption. Tests verify no new file on failed save, preservation of existing settings, and a mocked encrypted round trip. | Actual OS keychain unavailable/available behavior and error display |
| CR-004 | FIXED / AUTOMATED CHECKS PASSED | Capture records stream/context ownership immediately and rolls back after failed startup, resets queued samples and stops main STT. Six tests inject media/resume/processor failures for mic and system, verify resource counts return to zero, and prove restart works. | Real microphone/loopback permission and device failure tests |
| CR-005 | FIXED / AUTOMATED CHECKS PASSED | Initial system startup rejection sets the recovery flag as well as the error. Hook failure-injection test verifies recovery state, failed retry retaining recovery and successful retry clearing the error. | Actual Retry button rendering and interactive same-session recovery |
| CR-006 | FIXED / AUTOMATED CHECKS PASSED | No-key route configures the selected model before readiness check. Fresh-router tests cover cached non-default model and genuinely missing model. | Actual cached model on disk and local engine startup |
| CR-007 | FIXED / AUTOMATED CHECKS PASSED | Worker exit, shutdown, disposal and model replacement settle pending download requests. Startup exceptions become structured failures. Disposed service rejects new work and stale worker messages are ignored. Tests cover exit/dispose/model replacement and clean retry where applicable. | Real utility-process crash/download integration |

### Additional validation

- V-006: Public typecheck PASS for main, renderer and tests after fixes; 11 baseline diagnostics resolved.
- V-007: Intentional main and renderer type-error probes each rejected with exit 1; temporary files removed and clean typecheck passed afterward.
- V-008: Full suite PASS at 36 tests after the first 13 regression tests. A subsequent focused run passed all 14 regression tests after adding the initial-failure/retry hook case. These tests use real application modules with mocked OS/provider boundaries, synthetic fixtures and no private data.
- V-009: Production build PASS for main, STT worker, preload and renderer after application changes.
- V-010: Final full suite PASS: 37 tests, 0 failures (14 new regression tests plus 23 existing tests). git diff --check PASS. Review-generated tracked TypeScript build-info changes restored; temporary sentinel files removed. Working changes contain application fixes, regression tests, compiler configuration and project documentation only.

### Decisions, limitations and implementation notes

- FIX-001: Added a dedicated tsconfig.tests.json so Node-based tests are checked without placing them in the browser compiler environment.
- FIX-002: Chose a picker-authorized canonical-path allowlist, including generated PDFs, to preserve existing renderer API shape while restricting filesystem access. Sender checks and blocked document navigation protect the owning-frame boundary; this is not a whole-IPC security audit.
- FIX-003: Chose explicit save failure over plaintext fallback. Existing legacy files are not deleted or rewritten merely because the keychain is unavailable. Unlock/re-enable secure storage and retry saving. No credentials were read or printed during testing.
- FIX-004: Failure tests transform modules with the existing esbuild dependency and replace OS/provider boundaries. They do not prove native Electron behavior. Coverage includes loaded modules only and must not be presented as whole-application coverage.
- DEV-001: An initial scripted edit stopped on a CRLF-sensitive match after partial edits; remaining edits were reapplied using normalized matching and validated. An initial compiler rerun exposed a now-unused answerCards selector after its sole consumer was removed; the selector was removed and subsequent type checks pass.
- DOC-002: README updated with unavailable-keychain behavior; this register updated with implementation, validation, owner and remaining integration checks. No commit, deployment or installer publication performed.


## Integration and packaging ledger — 2026-09-16

User follow-up: "go ahead" authorized the remaining integration and packaging checks. Owner: Codex. See [validation report](docs/validation/2026-09-16/report.md), [Electron results](docs/validation/2026-09-16/electron-results.json) and [packaged results](docs/validation/2026-09-16/packaged-results.json).

| Evidence | Outcome | Scope |
| --- | --- | --- |
| V-011 | PASS: 13/13 real Electron checks | Production renderer/preload/IPC; real Windows safeStorage; authorized TXT and unauthorized file reads; actual DOCX parser fallback; PDF canvas; rendered key-save error and Retry; two killed utility processes; microphone and system-loopback tracks and worklet acquisition/release |
| V-012 | PASS: 7/7 packaged checks | ASAR assets, actual Sarathi.exe renderer/preload, isolated native encryption, file authorization, actionable STT errors, production worker loaded from inside ASAR and reporting a missing model |
| V-013 | PASS: npm run dist:win | NSIS x64 installer generated; 239,435,958 bytes |
| V-014 | PASS: native installer wizard smoke | Installation-options and destination screens opened. Current-user scope and configurable destination shown. Cancel closed setup before installation. No installed app, shortcut or registry installation lifecycle was tested. |
| V-015 | NotSigned | Windows Authenticode check: installer unsigned. No signing certificate configured; builder's signing log does not mean a signed artifact. |
| V-016 | PASS: cleanup / diff | Test application processes exited, installer window closed, and git diff --check passed. Synthetic fixtures retained in ignored cache; durable redacted/synthetic evidence copied into docs/validation. |

Installer: dist-installer/Sarathi Setup 1.8.0.exe. SHA-256: 034DA6735E73AC2537B93B70932E1D22E9012648A1F88EFAB51B02F2DFD6268F.

### Finding verification update

- CR-002: Real main/preload/renderer IPC denies unrelated fixture files and admits picker-authorized TXT/DOCX/PDF. PDF canvas visibly rendered. Selection was injected at the native dialog boundary; native picker interaction and LibreOffice conversion remain unverified. Prior sender/subframe rejection unit checks remain applicable.
- CR-003: Native Windows encryption and isolated on-disk round trip passed in development and packaged runtimes. Unavailable encryption was injected in Electron and the real Settings UI showed the failure. The OS keychain was not locked or otherwise modified.
- CR-004: Real microphone and loopback tracks plus the worklet were acquired and immediately released; no recording, speech content or provider transfer. Startup failure rollback remains validated by the six injected regression cases, not a physical device removal experiment.
- CR-005: Real production renderer showed Retry after initial missing-key failure and retained it after a failed retry. Successful recovery is covered by the regression test; no live configured transcription backend was used.
- CR-006: Selected non-default cached-model selection remains verified by regression tests. The real packaged engine reports missing-model state correctly. Inference against actual downloaded model weights is still pending.
- CR-007: Actual utility-process termination settled the model request twice, allowing a fresh retry. A separate packaged-runtime probe booted the production worker from ASAR with downloads disabled and received its expected missing-model response. Crash settlement is VERIFIED within this tested scope; model-switch/disposal paths also retain unit coverage.

### Decisions and limitations

- INT-001: Added reproducible scripts/electron-smoke.cjs and scripts/packaged-smoke.cjs. Both use fresh isolated profiles and synthetic keys/documents. Packaged checks attach only to the locally spawned test process through ephemeral loopback debugging ports, which close when the process exits.
- INT-002: The Windows computer-use tool could not enumerate Sarathi's toolbar-style window, even after enabling test taskbar visibility. Real renderer assertions/screenshots instead use Electron test APIs. The standard NSIS installer window was accessible and its screens were inspected through native computer use.
- INT-003: LibreOffice was not found by the application; DOCX returned the supported formatted-document fallback. No software installation or model download was performed to change test prerequisites.
- INT-004: Simulated unavailable-keychain checks intentionally emit a main-process error log; the harness reports PASS only when the expected UI error appears. Synthetic test keys were cleared afterward. No normal user-data profile was accessed.
- INT-005: Installer creation, setup-screen verification and running the packaged executable are complete. Actual installation/upgrade/uninstallation and trusted signing are distinct release checks, still pending. No publication or deployment occurred.
- INT-006: Prior V-010 remains the latest full regression/type-check evidence; this turn changed test harnesses and documentation, not application code. Packaging rebuilt the production bundles successfully.


## Offline inference acceptance — 2026-09-16

User follow-up: "next". Owner: Codex. Next acceptance work is real cached-model inference and recovery using locally synthesized speech, not personal audio. No cached model was found in the checked project/app model directories. A synthetic 16 kHz mono PCM speech fixture was generated with Windows System.Speech, and an isolated non-default Xenova/whisper-small model cache is being prepared through the application's own download flow.

- CR-008 (Medium/P2): First-time model download falsely fails because ensureModel registers a watcher, sends an offline init to a new worker, then sends ensure-model. The offline init emits the expected missing-model error first, prematurely resolving the download request as a failure. Reproduced in real Electron: cache/offline-stt-VLyoMJ/results.json. Fixed by initializing a fresh download worker with allowDownload=true and sending ensure-model only to an existing worker. Added a regression test reproducing the offline-init response race. Initial status: FIXED / regression passed; actual download/inference verification underway. Final status is VERIFIED below.
- V-017: Typecheck PASS, 38 tests PASS (including the CR-008 regression), production build PASS after this fix.
- DEV-002: Initial test harness returned an IPC unsubscribe function from executeJavaScript, which Electron could not clone. The harness now returns void; this was a test-harness issue, not an application defect.
- ART-001: The previously built installer predates CR-008 and must be rebuilt before being offered as the latest artifact.


### Offline acceptance completion

- CR-008: VERIFIED. The first download completed successfully through real Electron after the initialization fix. 251,875,316 bytes reported by the downloader; the model cache lives in ignored cache/offline-validation/models and is not bundled into the installer. The earlier real failure report is retained in docs/validation/2026-09-16/offline-download-before-fix.json.
- CR-006: VERIFIED for a fresh router with no cloud key and only the selected non-default Xenova/whisper-small cache present. Native ONNX produced the expected transcript. No preceding model-status query or download request primed that fresh router.
- CR-005: VERIFIED for actual same-session recovery: render an initial no-key/fallback-disabled failure, enable local fallback through real settings IPC, click the real Retry button, observe local listening and removal of the error. A recovery screenshot is retained.
- V-018: Model download and native model load PASS. Fresh-process offline checks PASS 4/4: non-default fallback selection, synthetic speech transcription, backend restart, real UI Retry recovery.
- V-019: Exact synthetic transcript: "The project team will review the delivery schedule tomorrow morning. Please confirm the next meeting time." Development final arrived in 3,001 ms after buffered PCM submission. This is one synthetic fixture and is not a general latency or accuracy benchmark.
- V-020: Post-fix Electron smoke suite PASS 13/13. Packaged suite with offline inference PASS 8/8, including the actual bundled ONNX runtime and worker transcribing the same phrase exactly. No cloud transcription or LLM call was made.
- V-021: Updated npm run dist:win PASS. Latest installer: dist-installer/Sarathi Setup 1.8.0.exe, 239,435,825 bytes. SHA-256: 5EF5DEF1CFDC295928D41DB77190B6DA072CCAA3813E49C8BA694E276A11DFEB. Still NotSigned. This artifact supersedes ART-001 and the earlier 034DA673... checksum; earlier results are historical evidence.
- V-022: Latest compiler/regression gate remains PASS: 38 tests and all three TypeScript projects. Generated build-info changes restored after checks; git diff --check passed. Smoke-test processes exited.
- DOC-003: Added scripts/create-speech-fixture.ps1 and scripts/offline-stt-smoke.cjs; extended packaged-smoke.cjs with --offline. Updated [offline acceptance report](docs/validation/2026-09-16/offline-report.md) with repeatable commands, machine-readable reports and scope limits. Model files and synthetic WAV remain in ignored cache; only safe report/screenshot evidence is versionable.
- INT-007: Model weights were downloaded through the existing application loader from its configured model host, then inference ran from the local cache with downloads disabled. The speech fixture was generated locally using Windows speech synthesis; it contains no personal audio. The final UI recovery briefly acquired system loopback through the normal app capture path; the test then stopped it and exited. Synthetic provider keys were cleared.

Remaining release acceptance: native file-picker interactions; LibreOffice conversion on an appropriately provisioned test machine; physical hardware/OS permission/keychain failure scenarios; representative speech and endurance testing; full install/upgrade/uninstall and signing. Do not describe the unsigned artifact as release-certified.


## Speech lifecycle acceptance — 2026-09-16

User follow-up: "next". Owner: Codex. Exercising repeated turns, explicit stop before silence, and rapid restart using the existing local synthetic fixture and cached model.

- CR-009 (Medium/P2): Explicit local-STT stop loses the final utterance. Reproduced after five successfully transcribed turns: the seventh expected final (speech followed by stop without trailing silence) never arrived. Evidence: cache/offline-stt-Oh4IbD/results.json. Main stopped/disposed the worker immediately; worker stop also cleared queued finals. A running job could additionally deliver output into a newly restarted source because it carried no generation identity.
- Implemented drain acknowledgement and per-source generations: worker retains finals on stop, suppresses obsolete-generation results/errors and confirms completion; main waits for the current acknowledgement before shutting down. A 30-second drain timeout provides a bounded failure path. Normal app disposal still shuts down immediately. Other active sources remain running.
- Added four deterministic regressions for queued/in-flight final draining, obsolete results and obsolete errors after restart, and matching main-process acknowledgements. Initial targeted run passed 19 regression cases; the first real lifecycle rerun passed stop-before-silence recovery. Extended dual-source rapid restart check is underway.
- The prior installer predates CR-009 and requires rebuilding before being treated as current.


### Speech lifecycle acceptance completion

- CR-009: VERIFIED for the exercised stop/restart paths. Native inference now returns the final utterance when stopping without trailing silence. Rapid restart with both sources active suppresses the obsolete system result while mic transcription continues. Four deterministic regression cases also verify queued-final draining, stale result/error suppression, generation-matched acknowledgement and a 30-second bounded timeout. Full application disposal is intentionally immediate cancellation, not a flush guarantee.
- V-023: Complete suite PASS 42/42. Type checks PASS for main, renderer and tests. Focused 19-case regression rerun also PASS after adding explicit timeout verification.
- V-024: Real Electron speech lifecycle acceptance PASS 7/7 (including five repeated turns, explicit-stop final delivery and dual-source rapid restart). The pre-fix failure and post-fix results are retained under docs/validation/2026-09-16. This is a short synthetic sequence, not an endurance/accuracy certification.
- V-025: Post-fix Electron smoke PASS 13/13; packaged --offline --lifecycle checks PASS 9/9, including native ONNX inference and explicit-stop final delivery from the packaged worker.
- V-026: Updated Windows NSIS build PASS. Latest artifact: dist-installer/Sarathi Setup 1.8.0.exe; 239,436,368 bytes. SHA-256: 924CB9026EA02821C844E525A3E703A4A0083153AAE54EBAC29210C81C82C614. Authenticode status remains NotSigned. This supersedes the prior 5EF5DEF1... checksum and previous installer; no publication or installation occurred.
- V-027: git diff --check PASS. Compiler-generated tracked build-info changes restored. No test Electron/Sarathi processes remained after the checks.
- DOC-004: Updated README, regression tests, worker protocol and both lifecycle harnesses. [Lifecycle report](docs/validation/2026-09-16/lifecycle-report.md), [native results](docs/validation/2026-09-16/lifecycle-results.json), [packaged results](docs/validation/2026-09-16/packaged-lifecycle-results.json) and [pre-fix failure](docs/validation/2026-09-16/lifecycle-before-fix.json) preserve the evidence. Prior report counts and checksums are historical checkpoints.

Next release work remains native document picker / LibreOffice conversion acceptance, representative long-session speech tests and physical OS/device failure checks, followed by install/upgrade/uninstall validation and signing. All nine recorded code findings have implemented fixes; acceptance scope limits above remain explicit.

- WORKSPACE-001: Final status also showed concurrent deletions of legacy assets/app_icon_*.ico and other assets images, plus an untracked assets/chakra_icon_pack/ directory. These changes were not made by this lifecycle task and were preserved. The build configuration uses resources/icon.ico; no icon-asset edits were made during this work.

## Document import acceptance — 2026-09-16

User follow-up: "next". Owner: Codex.

- CR-010 (Medium/P2): Missing selected PDFs and native-picker failures reject document:getFilePath instead of returning the declared error result; the renderer also lacked a catch. Reproduced through real Electron IPC in cache/electron-smoke-YknGfQ/results.json. Added structured main-process error handling and a renderer error toast. Converted PPTX text extraction now remains best-effort if its secondary parser fails, matching DOCX behavior.
- CR-011 (Medium/P2): Replacing a loaded PDF with a text document that disappears before HTML extraction clears the old PDF path and changes content mode prematurely. Reproduced by deleting a synthetic selected TXT between picker completion and the real HTML handler; the old PDF subsequently failed to render. Move state mutation after successful HTML loading and disable Replace while loading.
- V-028: Pre-fix Electron run reproduced both findings (four failed assertions, including downstream canvas failure). Post-fix run passed 16/16 checks; expanded invalid-DOCX, unsupported-extension and cancellation checks also passed in the ongoing native-picker attempt. Regression fixtures use only synthetic content and an isolated userData directory.
- Native Windows picker automation currently has no targetable Electron/dialog window in either Computer Use window or app inventory. Do not claim native selection/cancellation acceptance from the stubbed-picker checks. All prior user icon-asset changes remain preserved. Final gates and package rebuild pending.

### Document import acceptance completion

- CR-010 / CR-011: VERIFIED for the reproduced IPC errors and failed-replacement paths. Source: src/main/ipc.ts and src/renderer/src/features/session/CreateSessionScreen.tsx. The 20-check Electron harness now proves that a failed import preserves the previous PDF, that Replace becomes usable again, and that a subsequent TXT import and return to PDF succeed. Converted-PPTX best-effort text behavior is implemented but awaits conversion acceptance.
- V-029: npm run typecheck PASS (main, renderer, tests); npm test PASS 42/42. Expanded Electron acceptance PASS 20/20 with --without-libreoffice. Existing native safeStorage, worker-crash settlement, device/worklet and Retry checks remain passing. Latest source evidence: cache/electron-smoke-fLiBJY/results.json, copied to [document results](docs/validation/2026-09-16/document-results.json).
- V-030: Native picker attempt INCOMPLETE: actual selection/cancellation could not be automated because Computer Use exposed no matching Electron/dialog target. The 180-second watchdog closed the test app. The retained old attempt report says 45 seconds due to a harness message bug, now corrected. [Attempt evidence](docs/validation/2026-09-16/native-picker-attempt.json). This is a tooling limit, not a diagnosed native-picker defect.
- V-031: npm run dist:win PASS. Latest artifact: dist-installer/Sarathi Setup 1.8.0.exe, 239,436,470 bytes; SHA-256 03FA3453CDBD05FEF26876E6CA4A3E2069D93A31F15130235A07A69AD93B54DA; signature NotSigned. Supersedes V-026 artifact/checksum. No installation or publication performed.
- V-032: Rebuilt packaged --offline --lifecycle acceptance PASS 9/9, including cached-model inference and final delivery on stop. [Packaged results](docs/validation/2026-09-16/packaged-document-results.json).
- DOC-005: Added [document acceptance report](docs/validation/2026-09-16/document-report.md), retained pre-fix failure evidence, expanded the repeatable Electron harness and README. Updated the current-status paragraph while preserving original-review history. Documentation remains mandatory project memory for all relevant work.
- RISK-004 (Medium/P2) VERIFIED for stuck subprocess handling: Static inspection found no deadlines on LibreOffice discovery/conversion subprocesses; a hung process could leave importing pending. Added 3-second probe and 60-second conversion deadlines, killing stuck children and returning a structured timeout error. Deterministic regression tests cover stuck `--version` probing and stuck conversion. Actual successful visual conversion remains unverified because LibreOffice is absent; only DOCX fallback, PPTX missing-dependency routing and subprocess timeout behavior were exercised. See [LibreOffice timeout acceptance](docs/validation/2026-09-16/libreoffice-timeout-report.md).

Next actions: provisioned LibreOffice conversion/timeout acceptance, manual native picker selection/cancellation, representative speech endurance and OS/device failure checks, then install/upgrade/uninstall and signing. All eleven numbered code findings have implemented fixes; the explicit unverified branches and release limits above remain open acceptance work.
- V-033: Final git diff --check PASS; generated tracked build-info restored. No Electron/Sarathi test processes remained. WORKSPACE-001 concurrent icon changes preserved.

## UI/UX and themes — 2026-09-16

Owner: Codex. User requested design improvements, interactive/intuitive UI and icons aligned with Google guidance, a dark/light toggle next to Home or Settings, live UAT, and individual register updates.

- UX-001 IN PROGRESS: Semantic light/dark colors across setup, Settings and presentation, persistent theme choice, initial OS preference, adjacent Sun/Moon theme control. Acceptance: switching and reload persistence work in the real app without losing content.
- UX-002 IN PROGRESS: Consistent outlined icons, visible persona labels at narrow widths, selected-state semantics, larger navigation targets and keyboard focus. Preserve existing brand assets and screen-capture behavior.
- UX-003 IN PROGRESS: Settings focus management and accessible labels, keyboard-operable dropdowns/toggles and reduced-motion support.
- UX-004 PLANNED: Live Electron UAT with screenshots in both themes, narrow-window layout, keyboard flows, persistence and document/presentation checks; build and package validation. Agent-executed acceptance is not a claim of independent human usability sign-off.
- Design reference: https://developer.android.com/codelabs/m3-design-theming (semantic color roles, typography, surfaces and hierarchy), https://m3.material.io/components/icon-buttons/guidelines and https://m3.material.io/foundations/interaction/states/overview. Apply Material-informed principles to this desktop app; do not claim Google certification.

### UI/UX implementation and live UAT results

- UX-001 VERIFIED: Shared semantic themes, OS initial choice, local persistence, theme-aware toast and Sun/Moon controls beside Settings/Home plus inside Settings. UAT-01 through UAT-06 cover initial choice, both palettes, reload persistence, semantic contrast and keyboard activation. No provider settings or content reset on theme changes.
- UX-002 VERIFIED for exercised flows: Consistent Lucide persona/timer/navigation icons, visible labels at 360px, 48px main navigation targets, larger slide actions and stacked narrow layouts. UAT-07/08 exercise persona selection, slide creation/deletion, teacher timer and mirror state. Brand assets preserved.
- UX-003 VERIFIED for exercised flows: API-key labels, Settings modal role/focus trap/Escape/return focus, switch states, dropdown arrow navigation/Enter/return focus. UAT-09 through UAT-11 pass. Reduced-motion CSS implemented; full screen-reader and WCAG audit is not claimed.
- UX-004 LIVE UAT PASS 12/12: UAT-12 verifies actual presentation, content preservation through both theme changes and narrow layout bounds. [Each scenario and screenshots](docs/validation/2026-09-16/ui-uat/report.md), [results](docs/validation/2026-09-16/ui-uat/results.json). Agent-executed acceptance, pending human usability feedback.
- UX-005 (Low/P3) FIXED and visually verified: Settings z-index conflicted with persona buttons, allowing background controls to paint above the modal. Corrected stacking. Also resolved clipped presentation status/Ask AI controls by reducing redundant navigation and constraining input widths.
- V-034: Main/renderer/test typechecks PASS; npm test PASS 42/42; expanded Electron integration PASS 20/20 after theme changes. Source: cache/electron-smoke-xUjJdj/results.json. Production build PASS; updated installer packaging in progress.
- DEV-003: Corrected a transient implementation selector typo caught by compilation. UAT harness corrections: CSS shorthand hex parsing, Enter character event, explicit minimum-size override plus actual-width assertion, and escaped slide selector. Initial harness failures are preserved and must not be described as product defects.
- DOC-006: Added scripts/ui-uat.cjs and the linked per-scenario acceptance report. Shared color migration covers renderer components; dormant legacy dialogs received tokens but were not comprehensively exercised. Native file dialogs, LibreOffice, signing and installation lifecycle remain open as previously recorded.

### UI/UX delivery completion

- V-035: npm run dist:win PASS. Latest installer: dist-installer/Sarathi Setup 1.8.0.exe; 239,438,441 bytes; SHA-256 6D5E30991803CD20FE446F19762F53E409D8DEBF7EAC1C7125FE91877F29AD5F; NotSigned. Supersedes V-031 artifact. No installation or publication.
- V-036: Packaged acceptance PASS 10/10, including light/dark switching and persisted explicit preference, plus existing offline speech lifecycle checks. [Results](docs/validation/2026-09-16/ui-uat/packaged-results.json). Initial theme test incorrectly assumed an OS-derived initial theme should already have been saved; adjusted the harness to perform an explicit switch. Product persistence behavior was correct.
- V-037: git diff --check PASS; tracked generated build-info restored. No Sarathi test process remained; unrelated app processes and concurrent user asset changes were preserved.
- Handoff: requested UI/theme implementation and agent-run live UAT are complete with individually recorded evidence. Human usability feedback, full screen-reader/WCAG audit, native picker, LibreOffice, physical-device testing, signing and installation lifecycle remain explicit acceptance limits. The register remains mandatory project memory and must be updated for every subsequent relevant change, failure, test and decision.

## LibreOffice subprocess timeout — 2026-09-16

User follow-up: "next". Owner: Codex. Source risk: RISK-004 from the document import acceptance ledger.

- RISK-004 status: VERIFIED for hung subprocess behavior. `src/main/documents/convert-to-pdf.ts` now bounds PATH discovery probes to 3 seconds and conversion runs to 60 seconds. On timeout Sarathi kills the child process and returns `LibreOffice conversion timed out.` instead of leaving the document import pending indefinitely.
- V-038: Added two deterministic regression tests in `src/main/review-regressions.test.ts`: stuck LibreOffice PATH probing times out and kills the child; stuck conversion times out, kills the child and uses the expected `--headless --convert-to pdf` command path. Focused run `npm test -- --test-name-pattern RISK-004` PASS.
- V-039: Full validation after the fix: `npm run typecheck` PASS; `npm test` PASS 44/44; `npm run build` PASS; `node scripts/electron-smoke.cjs --without-libreoffice` PASS 20/20 with result copied to [libreoffice-timeout-electron-results.json](docs/validation/2026-09-16/libreoffice-timeout-electron-results.json); `node scripts/packaged-smoke.cjs --offline --lifecycle` PASS 10/10 with result copied to [libreoffice-timeout-packaged-results.json](docs/validation/2026-09-16/libreoffice-timeout-packaged-results.json).
- V-040: `npm run dist:win` PASS. Latest installer: `dist-installer/Sarathi Setup 1.8.0.exe`; 239,438,797 bytes; SHA-256 `2C05E2C3B5DA4E20493CBAE3758872DE794151B1372F7DB82231DD210155DA55`; Authenticode NotSigned. Supersedes V-035 artifact. No installation or publication performed.
- V-041: `git diff --check` PASS, with only existing line-ending warnings. Generated tracked build-info files restored. Concurrent user asset deletions and `assets/chakra_icon_pack/` remain preserved.
- DOC-007: Added [LibreOffice timeout acceptance report](docs/validation/2026-09-16/libreoffice-timeout-report.md) and updated the prior document report to mark the timeout risk fixed while preserving the remaining conversion-fidelity limit.
- Handoff: Actual successful LibreOffice visual conversion still needs a machine with LibreOffice installed. Native picker manual acceptance, full install/upgrade/uninstall, signing, physical device/OS failure checks and human usability feedback remain open release acceptance work.

## Manual teleprompter navigation — 2026-10-28

- UX-006 — Low/P3, implemented and verified. Owner: Copilot. Source requirement: user requested manual scrolling, scroll-down, and an option to stop auto-scrolling in the presentation view.
- Acceptance criteria: script and document presentation modes provide visible pause/resume, scroll-up, and scroll-down controls; a manual step pauses auto-scroll; wheel/touch gestures pause auto-scroll for direct manual navigation; keyboard shortcuts remain discoverable. Carousel and PDF behavior remains unchanged.
- Changes: added visible controls and pause-on-manual-input behavior in `src/renderer/src/features/overlay/OverlayHUD.tsx`; documented arrow-key manual scrolling in `src/renderer/src/features/overlay/ShortcutCheatsheet.tsx`; updated [FRD](docs/FRD.md) and [README](README.md); extended the live Electron UAT in `scripts/ui-uat.cjs`.
- Validation observed 2026-10-28: `npm run typecheck` PASS; `npm run build` PASS; `node scripts/ui-uat.cjs` PASS 13/13, including manual pause/down/up/resume behavior; `git diff --check` PASS with existing line-ending warnings. Detailed UAT results: [manual-scroll-results.json](docs/validation/2026-10-28/manual-scroll-results.json).
- Risks/limits: agent-executed UAT validates UI behavior in Electron; human usability feedback and physical touch-device validation remain unverified. Next action: none for this request; incorporate user feedback if provided.

## Co-pilot panel and question detection — 2026-10-28

- UX-007 — Low/P3, implemented and verified. Owner: Copilot. Source requirement: user reported that the question-and-answer side panel occupies presentation space when unnecessary and asked to be able to turn off question detection.
- Acceptance criteria: co-pilot starts collapsed when it has no answer or actionable error; answers/errors open it; users can manually collapse/reopen it; question detection can be switched on/off while the panel is either collapsed or expanded; disabling detection clears pending automatic question work but keeps transcription and manual capture available; setup selection initializes the feature consistently.
- Changes: added a collapsible co-pilot with a compact persistent control rail; added an independent question-detection state/toggle; gated the automatic question pipeline and cancel pending buffers on disable; synchronized both detection and auto-answer with the setup-screen listener option. Updated the FRD, README, and Electron UAT.
- Affected files: `src/renderer/src/features/overlay/OverlayHUD.tsx`, `TranscriptStrip.tsx`, `useLiveTranscription.ts`, `src/renderer/src/stores/overlay-store.ts`, `src/renderer/src/features/session/CreateSessionScreen.tsx`, `scripts/ui-uat.cjs`, `docs/FRD.md`, `README.md`.
- Validation observed 2026-10-28: `npm run typecheck` PASS; `npm run build` PASS; `npm test` PASS 44/44; `node scripts/ui-uat.cjs` PASS 14/14; `git diff --check` PASS with existing line-ending warnings. Live UAT injected a synthetic system transcript while detection was off and confirmed transcript display continued, no detection indicator/answer appeared, and the panel stayed collapsed; it also verified panel opening/collapsing, the setup setting, and question-detection controls in both states. Detailed results: [copilot-panel-results.json](docs/validation/2026-10-28/copilot-panel-results.json).
- Risks/limits: disabling automatic question detection deliberately leaves transcription and manual capture available; this distinction is stated in the control tooltip. Synthetic UAT is not live-call audio acceptance. Human usability feedback remains unverified. Next action: none for this request; incorporate user feedback if provided.

## PDF viewer clarity — 2026-10-28

- UX-008 — Medium/P2, implemented and verified. Owner: Copilot. Source requirement: user reported that the PDF viewer output looked shrunken and blurred and requested a fix.
- Acceptance criteria: PDF pages use available viewer space without overflow; fit sizing responds to resizes; users can zoom and restore fit; canvas backing resolution is higher than CSS display resolution on high-DPI displays.
- Changes: added fit-page scaling and resize observation; rendered PDF.js canvases at device pixel ratio capped at 2 while keeping logical CSS dimensions; added visible zoom-in, zoom-out and Fit page controls with a 25–400% range; improved rendering error reporting. Added pure utility tests and a synthetic-PDF Electron acceptance scenario. Updated [FRD](docs/FRD.md).
- Affected files: `src/renderer/src/features/viewer/PdfViewerPanel.tsx`, `src/renderer/src/features/viewer/pdf-viewer-utils.ts`, `src/renderer/src/features/viewer/pdf-viewer-utils.test.ts`, `scripts/ui-uat.cjs`, `docs/FRD.md`.
- Validation observed 2026-10-28: `npm run typecheck` PASS; `npm run build` PASS; `npm test` PASS 47/47; `node scripts/ui-uat.cjs` PASS 15/15, including synthetic PDF fit sizing, no viewer overflow, high-DPI backing resolution, zoom-in and Fit page reset; `git diff --check` PASS with existing line-ending warnings. Detailed UAT results: [pdf-viewer-results.json](docs/validation/2026-10-28/pdf-viewer-results.json).
- UAT fixture decision: the harness now mocks the existing document IPC handlers in the Electron main process rather than trying to mutate the context-isolated preload API. This keeps the production bridge unchanged while testing the real renderer and PDF.js path.
- Risks/limits: verification used a synthetic one-page PDF and agent-executed Electron UAT, not a representative user-supplied PDF, large-document performance run, or human visual review across display hardware. Next action: invite user confirmation with their PDFs/device if clarity still differs from expectation.
