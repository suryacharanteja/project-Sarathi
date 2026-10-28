# Speech lifecycle validation

Date: 2026-09-16. Windows x64, Electron 43.4.1, cached `Xenova/whisper-small`.

## Defect and fix

**CR-009, Medium/P2:** stopping local transcription before the silence detector ended the turn lost the final utterance. The main process immediately disposed the worker, and the worker cleared queued finals during stop. An in-flight decode also lacked an identity tying it to the transcription run that produced it, allowing stale results after restart when another source kept the worker alive.

The worker now drains queued/in-flight finals and acknowledges stop. The main process waits for that acknowledgement, with a 30-second timeout that reports failure instead of waiting indefinitely. Source generations suppress stale results, errors and acknowledgements after restart. Other active sources remain running. Full application disposal still cancels work immediately.

## Evidence

- [Before-fix failure](lifecycle-before-fix.json): five consecutive turns passed, but the final utterance after explicit stop did not arrive.
- [After-fix lifecycle checks](lifecycle-results.json): **7/7 passed**, including five repeated turns, stop without trailing silence, rapid restart with another source still active, native inference and Retry recovery.
- [Post-fix Electron smoke checks](electron-results-after-lifecycle-fix.json): **13/13 passed**.
- Four added deterministic regression cases cover draining queued and in-flight finals, suppression of stale results and errors, acknowledgement matching and the bounded timeout. **42 total tests passed**. A later focused rerun of all **19 regression cases passed**, including the timeout branch; all three TypeScript projects passed.

These are short synthetic lifecycle checks, not long-session or representative-accent certification. Synthetic PCM is injected through the real STT IPC into native ONNX inference; it is not a recording of the user's speech.

## Repeat the checks

With the local fixture and cached model prepared as described in the [offline report](offline-report.md):

```powershell
npm run build
node scripts/offline-stt-smoke.cjs --lifecycle
node scripts/electron-smoke.cjs
npm run dist:win
node scripts/packaged-smoke.cjs --offline --lifecycle
```

## Scope limits

Native picker interaction, LibreOffice visual conversion, physical hardware/OS permission/keychain failures, representative speech/endurance testing and full installation/upgrade/uninstallation remain separate acceptance checks. Signing is not configured. The authoritative artifact checksum and final packaged-check result are recorded in the [delivery register](../../../live_project_delivery_register.md).


## Final packaged result and artifact

[Packaged lifecycle checks](packaged-lifecycle-results.json): **9/9 PASS**, including native inference and delivery of the final utterance after explicit Stop. NSIS rebuild succeeded.

Latest installer: dist-installer/Sarathi Setup 1.8.0.exe; 239,436,368 bytes; **unsigned**.

SHA-256: 924CB9026EA02821C844E525A3E703A4A0083153AAE54EBAC29210C81C82C614.
