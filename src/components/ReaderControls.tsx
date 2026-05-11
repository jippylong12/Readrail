import { useState } from 'react'
import type { BaselineAssessmentResult, PageLayout, ReaderMode } from '../types/domain'

type ReaderControlsProps = {
  baselineResult: BaselineAssessmentResult | null
  mode: ReaderMode
  targetWpm: number
  chunkSize: number
  isRunning: boolean
  isFocusMode: boolean
  isTestAvailable: boolean
  pageLayout: PageLayout
  onModeChange: (mode: ReaderMode) => void
  onWpmChange: (wpm: number) => void
  onChunkSizeChange: (chunkSize: number) => void
  onPageLayoutChange: (layout: PageLayout) => void
  onToggleRunning: () => void
  onFocusModeToggle: () => void
  onRewind: () => void
  onRegression: () => void
  onTest: () => void
}

const modeGuidance: Array<{
  mode: ReaderMode
  title: string
  body: string
}> = [
  {
    mode: 'rail',
    title: 'Rail',
    body: 'Recommended default: guided lines and phrase highlights keep surrounding text available.',
  },
  {
    mode: 'chunk',
    title: 'Chunk',
    body: 'Phrase grouping practice for building rhythm without hiding the rest of the passage.',
  },
  {
    mode: 'rsvp',
    title: 'RSVP',
    body: 'Optional focused drill: less context and less rereading, so use it sparingly.',
  },
]

function baselineRecommendation(baselineResult: BaselineAssessmentResult | null): string {
  if (!baselineResult) {
    return 'Start with Rail near a comfortable pace, then only raise WPM when quiz results stay steady.'
  }

  const { comprehensionPercent, rawWpm, recommendedWpm } = baselineResult
  const baselineSummary = `Baseline: ${rawWpm} raw WPM, ${comprehensionPercent}% comprehension.`

  if (comprehensionPercent < 70) {
    return `${baselineSummary} Use Rail at about ${recommendedWpm} WPM and prioritize recall before speed.`
  }

  if (comprehensionPercent < 90) {
    return `${baselineSummary} Rail at ${recommendedWpm} WPM is the safest starting point; add Chunk after comprehension feels stable.`
  }

  return `${baselineSummary} Start near ${recommendedWpm} WPM in Rail or Chunk; keep RSVP to short drills.`
}

export function ReaderControls({
  baselineResult,
  mode,
  targetWpm,
  chunkSize,
  isRunning,
  isFocusMode,
  isTestAvailable,
  pageLayout,
  onModeChange,
  onWpmChange,
  onChunkSizeChange,
  onPageLayoutChange,
  onToggleRunning,
  onFocusModeToggle,
  onRewind,
  onRegression,
  onTest,
}: ReaderControlsProps) {
  const [isGuidanceOpen, setIsGuidanceOpen] = useState(false)

  return (
    <div className="reader-controls" data-tour="reader-controls">
      <div className="reader-control-strip">
        <div className="mode-picker">
          <div className="segmented" aria-label="Reading mode" role="group">
            {modeGuidance.map((candidate) => (
              <button
                className={candidate.mode === mode ? 'active' : ''}
                key={candidate.mode}
                onClick={() => onModeChange(candidate.mode)}
                type="button"
              >
                {candidate.title}
              </button>
            ))}
          </div>
          <button
            aria-controls="reader-mode-guidance"
            aria-expanded={isGuidanceOpen}
            aria-label="Explain reader modes"
            className="info-button"
            onClick={() => setIsGuidanceOpen((open) => !open)}
            type="button"
          >
            i
          </button>
        </div>

        <div className="layout-picker" aria-label="Page layout">
          <span className="layout-picker-label">Pages</span>
          <div className="segmented layout-segmented" role="group" aria-label="Page count">
            {([1, 2, 3, 4] as PageLayout[]).map((count) => (
              <button
                className={count === pageLayout ? 'active' : ''}
                key={count}
                onClick={() => onPageLayoutChange(count)}
                type="button"
                aria-label={`${count} page${count > 1 ? 's' : ''}`}
                aria-pressed={count === pageLayout}
              >
                {count}
              </button>
            ))}
          </div>
        </div>

        <label className="wpm-control">
          <span>WPM</span>
          <input max={900} min={80} onChange={(event) => onWpmChange(Number(event.target.value))} type="range" value={targetWpm} />
          <strong>{targetWpm}</strong>
        </label>

        <label className="chunk-control">
          <span>Chunk</span>
          <input
            max={8}
            min={1}
            onChange={(event) => onChunkSizeChange(Number(event.target.value))}
            type="number"
            value={chunkSize}
          />
        </label>

        <div className="control-buttons" data-tour="reader-actions">
          <button className="primary-button" onClick={onToggleRunning} type="button">
            {isRunning ? 'Pause' : 'Play'}
          </button>
          <button className="secondary-button" onClick={onRewind} type="button">
            Rewind
          </button>
          <button className="secondary-button" onClick={onRegression} type="button">
            Reread
          </button>
          <button
            aria-pressed={isFocusMode}
            className="secondary-button focus-mode-toggle"
            onClick={onFocusModeToggle}
            type="button"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            {isFocusMode ? (
              <>
                <svg fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="16">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                </svg>
                Exit Focus
              </>
            ) : (
              <>
                <svg fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="16">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
                Focus
              </>
            )}
          </button>
          <button className="finish-button" disabled={!isTestAvailable} onClick={onTest} type="button">
            Test
          </button>
        </div>
      </div>

      {isGuidanceOpen && (
        <div className="mode-setup" data-tour="reader-mode-setup" id="reader-mode-guidance">
          <div className="mode-guidance" aria-label="Reader mode guidance">
            {modeGuidance.map((candidate) => (
              <article className={candidate.mode === mode ? 'active' : ''} key={candidate.mode}>
                <strong>{candidate.title}</strong>
                <p>{candidate.body}</p>
              </article>
            ))}
          </div>
          <div className="mode-notes">
            <p className="mode-recommendation">{baselineRecommendation(baselineResult)}</p>
            <p className="mode-warning">Progress is comprehension-adjusted; do not optimize raw speed alone.</p>
          </div>
        </div>
      )}
    </div>
  )
}
