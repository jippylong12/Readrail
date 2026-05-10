import { useState } from 'react'
import { calculateAdjustedWpm, calculateActualWpm } from '../lib/reading/pacing'
import { recommendedNextWpm } from '../lib/reading/comprehension'
import type { ReaderMode } from '../types/domain'

type PendingSession = {
  mode: ReaderMode
  targetWpm: number
  wordsRead: number
  durationSeconds: number
  pauseCount: number
  regressionCount: number
}

type SessionSummaryProps = {
  pendingSession: PendingSession | null
  onSave: (input: PendingSession & { comprehensionScore: number | null; selfRating: number | null; notes: string }) => void
  onDiscard: () => void
}

export function SessionSummary({ pendingSession, onSave, onDiscard }: SessionSummaryProps) {
  const [comprehensionScore, setComprehensionScore] = useState(85)
  const [selfRating, setSelfRating] = useState(4)
  const [notes, setNotes] = useState('')

  if (!pendingSession) {
    return null
  }

  const actualWpm = calculateActualWpm(pendingSession.wordsRead, pendingSession.durationSeconds)
  const adjustedWpm = calculateAdjustedWpm(actualWpm, comprehensionScore)

  return (
    <section className="panel summary-panel" data-tour="session-summary">
      <div>
        <span className="eyebrow">Session Summary</span>
        <h2>Comprehension check</h2>
      </div>
      <div className="summary-grid">
        <Metric label="Actual WPM" value={actualWpm} />
        <Metric label="Adjusted WPM" value={adjustedWpm ?? 'N/A'} />
        <Metric label="Words" value={pendingSession.wordsRead} />
        <Metric label="Next target" value={recommendedNextWpm(pendingSession.targetWpm, comprehensionScore)} />
      </div>
      <label className="field">
        Comprehension score
        <input
          max={100}
          min={0}
          onChange={(event) => setComprehensionScore(Number(event.target.value))}
          type="range"
          value={comprehensionScore}
        />
        <strong>{comprehensionScore}%</strong>
      </label>
      <label className="field">
        Self rating
        <input max={5} min={1} onChange={(event) => setSelfRating(Number(event.target.value))} type="number" value={selfRating} />
      </label>
      <label className="field">
        Notes
        <textarea onChange={(event) => setNotes(event.target.value)} placeholder="What was clear? What needs rereading?" value={notes} />
      </label>
      <div className="summary-actions">
        <button className="secondary-button" onClick={onDiscard} type="button">
          Discard
        </button>
        <button className="primary-button" onClick={() => onSave({ ...pendingSession, comprehensionScore, selfRating, notes })} type="button">
          Save session
        </button>
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
