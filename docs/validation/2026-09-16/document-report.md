# Document import acceptance — 2026-09-16

Owner: Codex. Version: 1.8.0. Isolated profiles and synthetic fixtures only.

## Findings

- **CR-010 — Medium/P2, verified fix.** Missing selected PDFs and picker errors rejected IPC calls instead of returning a structured error; the browse handler did not catch rejections. Main now returns an error result, and the renderer catches unexpected rejections. Supplementary PPTX text extraction is now best-effort, consistent with DOCX; the converted-PPTX branch still needs a LibreOffice-enabled acceptance run.
- **CR-011 — Medium/P2, verified fix.** A failed HTML read during replacement cleared the prior PDF before the new document was ready. State now changes only after HTML loading succeeds. Replace is disabled during loading.

The pre-fix run failed both IPC error assertions, the preservation assertion and the downstream PDF canvas assertion. The post-fix run passes all 20 checks, including successful canvas rendering after failed replacement. [Before](document-before-fix.json) and [after](document-results.json) retain the evidence.

## Validation

- `npm run typecheck`: all three projects pass.
- `npm test`: 42 tests pass.
- `node scripts/electron-smoke.cjs --without-libreoffice`: 20 checks pass, including TXT, real DOCX fallback parsing, real PDF rendering, invalid DOCX, unsupported extension, missing PDF, cancellation and failed replacement.
- Picker results are stubbed except in the attempted native interaction run. HTML/file parsers and IPC handlers are real. For the replacement regression, the harness removes only its synthetic TXT just before the real HTML handler reads it.
- PPTX dependency routing reports the missing LibreOffice installation. Its fixture deliberately tests extension routing only; it does not validate PPTX conversion fidelity. Existing PPTX extraction unit tests cover slide ordering and formatting.

## Native picker limitation

`node scripts/electron-smoke.cjs --native-picker` reached the real picker request, but neither Windows Computer Use window nor app inventory exposed a targetable Electron/dialog window. No native selection or cancellation was performed. The watchdog ended the attempt after 180 seconds; its old message incorrectly says 45 seconds in the retained [attempt report](native-picker-attempt.json). The harness message is now corrected. This is incomplete automation acceptance, not proof the native dialog is broken. The optional mode remains available for a manual run: select the printed synthetic TXT, then cancel the next dialog.

LibreOffice visual conversion, installation/upgrade/uninstall and signing remain unverified. The earlier static follow-up about unbounded LibreOffice probe/conversion subprocesses is now fixed and covered by deterministic timeout tests; see [LibreOffice timeout acceptance](libreoffice-timeout-report.md). Actual successful LibreOffice visual conversion still needs a provisioned machine with LibreOffice installed.

## Final artifact and handoff

`npm run dist:win` passed. Updated installer: `dist-installer/Sarathi Setup 1.8.0.exe`, 239,436,470 bytes. SHA-256: `03FA3453CDBD05FEF26876E6CA4A3E2069D93A31F15130235A07A69AD93B54DA`. Authenticode: NotSigned. This supersedes the lifecycle report's installer checksum; that report remains historical evidence.

Packaged `--offline --lifecycle` validation passed 9/9 checks ([results](packaged-document-results.json)). The final 20-check Electron run additionally verified a successful TXT replacement after the failed import and switching back to PDF before presentation. No installer installation or publication occurred. Concurrent user asset deletions/additions were preserved.
