import { useState } from 'react'
import type { BaselineAssessmentResult, ReaderMode } from '../types/domain'

type ReaderControlsProps = {
  baselineResult: BaselineAssessmentResult | null
  mode: ReaderMode
  targetWpm: number
  chunkSize: number
  isRunning: boolean
  onModeChange: (mode: ReaderMode) => void
  onWpmChange: (wpm: number) => void
  onChunkSizeChange: (chunkSize: number) => void
  onToggleRunning: () => void
  onRewind: () => void
  onRegression: () => void
  onFinish: () => void
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
    return 'Start with Rail near a comfortable pace, then only raise WPM when recall and notes stay steady.'
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
  onModeChange,
  onWpmChange,
  onChunkSizeChange,
  onToggleRunning,
  onRewind,
  onRegression,
  onFinish,
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
          <button className="finish-button" onClick={onFinish} type="button">
            Finish
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
