# Sarathi — AI-Powered Teleprompter & Webinar Co-Pilot

> **Sarathi** (Sanskrit: सारथी) — *"Thus it happened."* The charioteer who guided the greatest warriors. Now guiding you through every presentation.

Sarathi is an open-source desktop teleprompter for webinars and live talks. It scrolls your script while an AI co-pilot listens to your audience in real time, detects questions, and surfaces concise answers — without interrupting your flow.

---

## Features

- **Teleprompter** — Smooth auto-scroll with adjustable speed, font size, and optional horizontal mirror flip (for physical glass rigs)
- **AI Listener** — Captures system audio, transcribes your audience's questions, and streams AI answers into a side panel
- **Multi-provider AI** — Gemini, OpenAI, DeepSeek, and free OpenCode Zen; automatic failover if a provider is down
- **Offline STT fallback** — AssemblyAI in the cloud, with local Whisper as an automatic backup
- **Document viewer** — Open PDF, DOCX, PPTX, TXT, and Markdown files; DOCX and PPTX files use LibreOffice conversion when available for faithful visual previews
- **Slide builder** — Import formatted DOCX/PPTX content, split Markdown into presentation slides, preview the deck, and export slide content
- **Presentation overlay** — Use slide navigation, shortcut help, minimized overlay controls, and presenter-focused viewer controls while speaking
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
3. Keys are encrypted with your OS keychain and stored in `%AppData%/sarathi-settings.json` — **never in the repository**

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
