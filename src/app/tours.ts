import type { AppRoute } from './routes'

export type TourId = Exclude<AppRoute, 'test'>

export type TourStep = {
  target: string
  title: string
  body: string
}

export type TourDefinition = {
  id: TourId
  title: string
  steps: TourStep[]
}

export const TOUR_DEFINITIONS: Record<TourId, TourDefinition> = {
  library: {
    id: 'library',
    title: 'Library walkthrough',
    steps: [
      {
        target: '[data-tour="import"]',
        title: 'Import reading material',
        body: 'Paste text or import a local text file. Readrail cleans the text and estimates the practice time from your current WPM.',
      },
      {
        target: '[data-tour="ocr"]',
        title: 'OCR entry point',
        body: 'Photos and scanned PDFs can become editable text after you add your own Gemini key. Remote OCR is explicit before files are sent.',
      },
      {
        target: '[data-tour="library-list"]',
        title: 'Local document storage',
        body: 'Saved readings stay in your local library. Search narrows active documents, and Archive removes a reading from the active list without deleting progress history.',
      },
    ],
  },
  reader: {
    id: 'reader',
    title: 'Reader walkthrough',
    steps: [
      {
        target: '[data-tour="reader-controls"]',
        title: 'Pace and mode controls',
        body: 'WPM sets the target pace. Rail is the default guided line, Chunk groups phrases, and RSVP is a focused drill with less surrounding context.',
      },
      {
        target: '[data-tour="reader-actions"]',
        title: 'Pause, rewind, and reread',
        body: 'Use Pause when attention drops, Rewind to step back several chunks, and Reread to mark a regression without hiding it from your session summary.',
      },
      {
        target: '[data-tour="reader-surface"]',
        title: 'Reading surface',
        body: 'The highlight advances at your selected pace. Keep comprehension ahead of raw speed, especially when increasing WPM.',
      },
      {
        target: '[data-tour="reader-actions"]',
        title: 'Test comprehension',
        body: 'Test creates an AI-generated quiz from the reading you just completed, then uses the result for comprehension-adjusted progress.',
      },
    ],
  },
  progress: {
    id: 'progress',
    title: 'Progress walkthrough',
    steps: [
      {
        target: '[data-tour="progress-summary"]',
        title: 'Current recommendation',
        body: 'Progress shows the current recommended WPM, latest quiz score, and the adjustment context from comprehension checks.',
      },
      {
        target: '[data-tour="progress-history"]',
        title: 'Comprehension history',
        body: 'Each completed test is saved with the reading, word range, score, raw WPM, adjusted WPM, and recommendation.',
      },
      {
        target: '[data-tour="progress-review"]',
        title: 'Answer review',
        body: 'Review each quiz question with selected and correct answers so comprehension feedback is inspectable.',
      },
    ],
  },
  stats: {
    id: 'stats',
    title: 'Stats walkthrough',
    steps: [
      {
        target: '[data-tour="stats-summary"]',
        title: 'Session totals',
        body: 'Totals show sessions, words, minutes, average WPM, comprehension, and streaks so speed stays tied to consistent practice.',
      },
      {
        target: '[data-tour="baseline-summary"]',
        title: 'Baseline context',
        body: 'When available, baseline raw WPM, comprehension, adjusted WPM, and starting pace explain why your recommendation is conservative.',
      },
      {
        target: '[data-tour="stats-charts"]',
        title: 'Trend charts',
        body: 'WPM and adjusted WPM are shown together. Adjusted WPM helps keep comprehension from being treated as optional.',
      },
      {
        target: '[data-tour="export"]',
        title: 'Progress exports',
        body: 'Exports create CSV or JSON backups from local progress data for review outside Readrail.',
      },
    ],
  },
  settings: {
    id: 'settings',
    title: 'Settings walkthrough',
    steps: [
      {
        target: '[data-tour="settings-key"]',
        title: 'Gemini API key',
        body: 'Your Gemini key is stored in the operating system keychain in the desktop app. Browser preview cannot save it there.',
      },
      {
        target: '[data-tour="settings-reader"]',
        title: 'Reader defaults',
        body: 'Defaults set the starting WPM, mode, and theme for new sessions. Your baseline can update the default WPM automatically.',
      },
      {
        target: '[data-tour="settings-ocr"]',
        title: 'OCR and local data',
        body: 'OCR privacy controls cover remote confirmation and image retention. Delete local app data resets documents, sessions, and onboarding state.',
      },
      {
        target: '[data-tour="settings-guidance"]',
        title: 'Replay guidance',
        body: 'Reopen the learner journey or replay any screen walkthrough whenever you want a refresher.',
      },
    ],
  },
}
