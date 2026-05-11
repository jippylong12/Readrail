import type { PrimaryRoute } from './routes'

export type TourId = PrimaryRoute

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
  'library-saved': {
    id: 'library-saved',
    title: 'Library walkthrough',
    steps: [
      {
        target: '[data-tour="library-tabs"]',
        title: 'Choose a library task',
        body: 'Import, OCR, and saved readings are separated into tabs so each workflow has its own surface.',
      },
      {
        target: '[data-tour="library-list"]',
        title: 'Local document storage',
        body: 'Saved readings stay in your local library. Search narrows active documents, Learner journey reopens the first-run flow, and Archive hides a reading without deleting history.',
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
        body: 'WPM sets the target pace. Pages changes the reading layout, Rail remains the default, Chunk groups phrases, and RSVP is an optional focused drill.',
      },
      {
        target: '[data-tour="reader-actions"]',
        title: 'Pause, rewind, and reread',
        body: 'Play starts or resumes the current untested segment. Pause stops timing, Rewind steps back several chunks, and Reread records a regression for session context.',
      },
      {
        target: '[data-tour="reader-surface"]',
        title: 'Reading surface',
        body: 'The highlight advances at your selected pace across the chosen layout. Keep comprehension ahead of raw speed, especially when increasing WPM.',
      },
      {
        target: '[data-tour="reader-actions"]',
        title: 'Test comprehension',
        body: 'Test becomes available after reading starts. Readrail only suggests testing once an untested segment reaches 1000 words, but you can trigger it earlier.',
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
        body: 'Progress shows the current recommended WPM, latest Gemini quiz score, raw pace, and the adjustment context from comprehension checks.',
      },
      {
        target: '[data-tour="progress-history"]',
        title: 'Comprehension history',
        body: 'Each completed Test attempt is saved with the reading, tested word range, score, raw WPM, adjusted WPM, and recommendation.',
      },
      {
        target: '[data-tour="progress-review"]',
        title: 'Answer review',
        body: 'Open an attempt to review every generated question with selected and correct answers. This is the coaching surface for comprehension feedback.',
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
        body: 'Stats stays aggregate: sessions, words, minutes, average WPM, average comprehension, and streaks summarize practice volume and pace.',
      },
      {
        target: '[data-tour="baseline-summary"]',
        title: 'Baseline context',
        body: 'When available, baseline raw WPM, comprehension, adjusted WPM, and starting pace explain why your recommendation is conservative.',
      },
      {
        target: '[data-tour="stats-charts"]',
        title: 'Trend charts',
        body: 'WPM and adjusted WPM are shown together, with reading minutes beside them. Detailed answer review lives in Progress.',
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
        body: 'Your Gemini key powers OCR and comprehension tests. The desktop app stores it in the OS keychain; browser preview keeps it only for the session.',
      },
      {
        target: '[data-tour="settings-reader"]',
        title: 'Reader defaults',
        body: 'Defaults set starting WPM, reader mode, page layout, and theme. Your first-run baseline can update the default WPM automatically.',
      },
      {
        target: '[data-tour="settings-ocr"]',
        title: 'OCR and local data',
        body: 'OCR privacy controls cover source image retention and image metadata stripping before upload. Delete local app data resets documents, sessions, quizzes, tours, and onboarding state.',
      },
      {
        target: '[data-tour="settings-guidance"]',
        title: 'Replay guidance',
        body: 'Reopen the learner journey, replay any route walkthrough, or make tours appear automatically again whenever the workflow needs a refresher.',
      },
    ],
  },
}
