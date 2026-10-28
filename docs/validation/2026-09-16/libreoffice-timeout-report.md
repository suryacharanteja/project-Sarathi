# LibreOffice Timeout Acceptance

Date: 2026-09-16, Asia/Dubai. Owner: Codex.

## Result

RISK-004 is fixed for stuck subprocess handling. LibreOffice discovery now times out stuck `soffice --version` probes after 3 seconds, and document conversion now times out stuck LibreOffice conversions after 60 seconds, kills the child process and returns a structured error instead of leaving import pending indefinitely.

This does not certify visual PPTX/DOCX conversion fidelity. LibreOffice is not installed in this environment, so actual successful conversion remains pending on a provisioned machine.

## Evidence

- `npm run typecheck`: PASS for main, renderer and tests.
- `npm test -- --test-name-pattern RISK-004`: PASS; both deterministic subprocess timeout regressions pass.
- `npm test`: PASS 44/44.
- `npm run build`: PASS.
- `node scripts/electron-smoke.cjs --without-libreoffice`: PASS 20/20. Result: `libreoffice-timeout-electron-results.json`.
- `npm run dist:win`: PASS.
- `node scripts/packaged-smoke.cjs --offline --lifecycle`: PASS 10/10. Result: `libreoffice-timeout-packaged-results.json`.
- `git diff --check`: PASS; only existing line-ending warnings were emitted.

Latest installer after this fix:

- Path: `dist-installer/Sarathi Setup 1.8.0.exe`
- Size: 239,438,797 bytes
- SHA-256: `2C05E2C3B5DA4E20493CBAE3758872DE794151B1372F7DB82231DD210155DA55`
- Authenticode: NotSigned

## Scope Limits

Native file-picker automation, actual LibreOffice visual conversion, full install/upgrade/uninstall, trusted signing, physical device failure testing and human usability feedback remain separate acceptance work.
