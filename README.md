# Readrail

Readrail is a local-first Tauri desktop app for practicing evidence-aware speed reading. It supports pasted text and local text files without any network calls, optional Gemini OCR with a user-owned API key, comprehension-adjusted session tracking, and exportable reading history.

## Current Prototype

- Tauri 2, React 19, TypeScript, Vite, Tailwind CSS 4
- Local document library with paste and `.txt` / `.md` import
- Rail, chunk, and optional RSVP drill reader modes
- Session summary with comprehension score, adjusted WPM, self-rating, and notes
- Stats dashboard with WPM, adjusted WPM, minutes, words, and streak summaries
- CSV and JSON progress export
- SQLite schema initialization through `@tauri-apps/plugin-sql`
- Gemini API key commands backed by the OS keychain
- Optional Gemini 2.5 Flash-Lite OCR review flow

## Development

```bash
pnpm install
pnpm dev
```

Run the desktop shell:

```bash
pnpm tauri dev
```

Run checks:

```bash
pnpm lint
pnpm test
pnpm build
```

Build a local desktop artifact:

```bash
pnpm tauri build
```

## Privacy Model

Readrail has no hosted backend and no telemetry. Documents and session data are stored locally. The Gemini key is entered in Settings and stored through Rust-side keychain commands under service `readrail` and account `gemini_api_key`. OCR requires explicit user action and sends selected files directly to Google's Gemini API using the user's key.

## Reading Science Positioning

Readrail optimizes for comprehension-adjusted speed rather than raw WPM. The default reader mode keeps normal context visible through guided line or phrase highlighting. RSVP is available as a focused drill and is not the primary training mode.

Research references for product copy and future docs:

- Schotter, Tran, and Rayner, "Don't Believe What You Read (Only Once): Comprehension Is Supported by Regressions During Reading", Psychological Science, 2014.
- RSVP and speed-reading comprehension tradeoffs: https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0153786
- Gemini model docs: https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite
