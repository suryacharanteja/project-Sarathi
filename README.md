# Sarathi — AI-Powered Teleprompter & Webinar Co-Pilot

Project memory: [Live Project Delivery Register](live_project_delivery_register.md). All project work, decisions, issues, changes and validation must be documented there; contributors and agents must read it before starting work. See [AGENTS.md](AGENTS.md).

> **Sarathi** (Sanskrit: सारथी) — *"Thus it happened."* The charioteer who guided the greatest warriors. Now guiding you through every presentation.

Sarathi is an open-source desktop teleprompter for webinars and live talks. It scrolls your script while an AI co-pilot listens to your audience in real time, detects questions, and surfaces concise answers — without interrupting your flow.

---

## Features

- **Teleprompter** — Smooth auto-scroll with adjustable speed, visible pause/resume and manual scroll controls, font size, and optional horizontal mirror flip (for physical glass rigs)
- **AI Listener** — Captures system audio, transcribes your audience's questions, and streams AI answers into a side panel
- **Multi-provider AI** — Gemini, OpenAI, DeepSeek, and free OpenCode Zen; automatic failover if a provider is down
- **Offline STT fallback** — AssemblyAI in the cloud, with local Whisper as an automatic backup
- **Document viewer** — Open PDF, DOCX, PPTX, TXT, and Markdown files; DOCX and PPTX files use LibreOffice conversion when available for faithful visual previews
- **Slide builder** — Import formatted DOCX/PPTX content, split Markdown into presentation slides, preview the deck, and export slide content
- **Presentation overlay** — Use slide navigation, shortcut help, a co-pilot panel that stays collapsed until needed, independent question-detection controls, and presenter-focused viewer controls while speaking
- **Secure by design** — API keys are stored in your OS keychain via Electron safeStorage; **nothing is committed to this repo**
- **Cross-platform** — Windows (NSIS installer), macOS, Linux

---

## Quick Start

```bash
git clone https://github.com/<you>/sarathi.git
cd sarathi
npm install
npm run dev
```

### Documents and slides

The document picker accepts PDF, DOCX, PPTX, TXT, and Markdown files. PDF files open directly in the viewer. DOCX and PPTX files are converted to PDF with LibreOffice when it is installed, preserving their original visual layout; DOCX text remains available for slide generation and AI context. Without LibreOffice, DOCX files fall back to formatted text and PPTX files report that visual conversion is unavailable.

Slide Builder imports headings, paragraphs, lists, and bold text from supported documents. Imported content can be reviewed as a deck and exported from the app.

### Adding API keys

1. Launch the app and click the **Settings** (⚙) icon
2. Paste your API keys (Gemini, OpenAI, AssemblyAI, etc.)
3. Keys are encrypted with your OS keychain and stored in the app's user-data directory — **never in the repository**. If secure storage is unavailable, saving keys fails with an error; unlock your OS keychain and retry. Keys are not silently saved as plaintext.

---

## Building

```bash
npm run build          # compile
npm run dist:win       # Windows NSIS installer → dist-installer/
```

### Testing

```bash
npm run typecheck      # TypeScript validation
npm test               # Run the complete test suite with coverage
npm run test:pptx      # Test PPTX extraction
npm run test:schemas   # Test shared IPC and settings schemas
npm run test:stt       # Test speech endpointing
```

After building, `node scripts/electron-smoke.cjs` runs isolated Electron integration checks (including brief microphone/loopback acquisition without recording). After `npm run dist:win`, `node scripts/packaged-smoke.cjs` checks the packaged executable without installing it. See the [validation report](docs/validation/2026-09-16/report.md) for results and verification limits.

For real offline speech inference and Retry recovery, see the [offline acceptance report](docs/validation/2026-09-16/offline-report.md). It includes the local synthetic-speech fixture, model-download step, and packaged `--offline` check.

The [speech lifecycle report](docs/validation/2026-09-16/lifecycle-report.md) adds `--lifecycle` checks for repeated turns, final-utterance delivery on stop, and stale-result suppression after restart.

---

## How it works

```
┌────────────────────────────────────────────┐
│  Sarathi Overlay Window (always-on-top)    │
│  ┌──────────────────┐  ┌───────────────┐  │
│  │  Teleprompter    │  │  AI Co-Pilot  │  │
│  │  auto-scroll     │  │  TranscriptStrip│ │
│  │  mirror flip     │  │  AnswerCards  │  │
│  │  font size       │  │  AskAiBar     │  │
│  └──────────────────┘  └───────────────┘  │
└────────────────────────────────────────────┘
          ↑ system audio loopback
   audience questions → STT → question detector → LLM → answer card
```

---

## Security

- API keys use `electron.safeStorage` (OS-level encryption). They live in `%AppData%/sarathi-settings.json`, which is **outside the repository** and protected by your user account.
- `.env` holds only runtime flags (not keys) and is gitignored.
- `cache/` and `*-settings.json` are gitignored.
- The overlay window sets `contentProtection: true` so it is hidden from screen-capture and OBS by default.

---

## Contributing

Pull requests are welcome. Please open an issue first for large changes.

1. Fork the repo
2. Create a feature branch
3. `npm run dev` to test locally
4. Open a PR against `master`

### Contributors

- [sejalkaul29-ux](https://github.com/sejalkaul29-ux)

---

## License

MIT © [CharanTheAIGuy](https://github.com/CharanTheAIGuy)

Document-import validation: [report and limitations](docs/validation/2026-09-16/document-report.md). After building, run `node scripts/electron-smoke.cjs`; add `--without-libreoffice` only on a machine without LibreOffice, or `--native-picker` for an interactive selection/cancellation check.

Appearance: use the Sun/Moon button next to Settings or Home to switch light/dark themes. The choice is saved on this device; first launch follows the OS theme. [UI/UX live acceptance and screenshots](docs/validation/2026-09-16/ui-uat/report.md). Run `node scripts/ui-uat.cjs` after building to repeat the isolated theme/keyboard/layout checks.
