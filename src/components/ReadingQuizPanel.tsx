import type { GeminiQuiz } from '../lib/ai/geminiQuiz'
import { calculateActualWpm } from '../lib/reading/pacing'
import { type FormEvent, useState } from 'react'

type ReadingQuizPanelProps = {
  error: string | null
  isLoading: boolean
  onCancel: () => void
  onManualSubmit: (comprehensionPercent: number) => void
  onRetry: () => void
  onSubmit: (answers: Record<string, string>) => void
  quiz: GeminiQuiz | null
  wordsRead: number
  durationSeconds: number
}

export function ReadingQuizPanel({
  error,
  isLoading,
  onCancel,
  onManualSubmit,
  onRetry,
  onSubmit,
  quiz,
  wordsRead,
  durationSeconds,
}: ReadingQuizPanelProps) {
  const [showManualEntry, setShowManualEntry] = useState(false)
  const actualWpm = calculateActualWpm(wordsRead, durationSeconds)

  if (isLoading) {
    return (
      <section className="panel quiz-panel" data-tour="session-quiz">
        <span className="eyebrow">Test</span>
        <h2>Creating comprehension quiz</h2>
        <div className="quiz-loading" role="status">
          <span />
          <p>Gemini is building questions from the reading you just completed.</p>
        </div>
        <SessionMetrics actualWpm={actualWpm} wordsRead={wordsRead} />
      </section>
    )
  }

  if (error) {
    return (
      <section className="panel quiz-panel" data-tour="session-quiz">
        <span className="eyebrow">Test</span>
        <h2>Quiz unavailable</h2>
        <div className="empty-state">
          <strong>Cannot create the quiz</strong>
          <span>{error}</span>
        </div>
        <div className="summary-actions">
          <button className="secondary-button" onClick={onCancel} type="button">
            Back to reader
          </button>
          <button className="primary-button" onClick={onRetry} type="button">
            Try again
          </button>
        </div>
        <ManualComprehensionForm
          actualWpm={actualWpm}
          onSubmit={onManualSubmit}
          wordsRead={wordsRead}
        />
      </section>
    )
  }

  if (!quiz) {
    return null
  }

  function submitAnswers(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const answers: Record<string, string> = {}
    const formData = new FormData(event.currentTarget)
    quiz?.questions.forEach((question) => {
      const answer = formData.get(question.id)
      if (typeof answer === 'string') {
        answers[question.id] = answer
      }
    })
    onSubmit(answers)
  }

  return (
    <section className="panel quiz-panel" data-tour="session-quiz">
      <div className="panel-header compact">
        <div>
          <span className="eyebrow">Test</span>
          <h2>{quiz.title}</h2>
        </div>
      </div>

      <SessionMetrics actualWpm={actualWpm} wordsRead={wordsRead} />

      <form className="question-list generated-question-list" onSubmit={submitAnswers}>
        {quiz.questions.map((question, questionIndex) => (
          <article className="question-card" key={question.id}>
            <h3 className="question-title">
              {questionIndex + 1}. {question.prompt}
            </h3>
            <div className="answer-list">
              {question.options.map((option) => (
                <label className="answer-option" key={option.id}>
                  <input name={question.id} required type="radio" value={option.id} />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </article>
        ))}
        <div className="summary-actions">
          <button className="secondary-button" onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="secondary-button" onClick={() => setShowManualEntry((visible) => !visible)} type="button">
            {showManualEntry ? 'Hide manual score' : 'Enter manual score'}
          </button>
          <button className="primary-button" type="submit">
            Save quiz result
          </button>
        </div>
      </form>

      {showManualEntry && (
        <ManualComprehensionForm
          actualWpm={actualWpm}
          onSubmit={onManualSubmit}
          wordsRead={wordsRead}
        />
      )}
    </section>
  )
}

function ManualComprehensionForm({
  actualWpm,
  onSubmit,
  wordsRead,
}: {
  actualWpm: number
  onSubmit: (comprehensionPercent: number) => void
  wordsRead: number
}) {
  const [comprehensionPercent, setComprehensionPercent] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submitManualScore(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const parsedScore = Number(comprehensionPercent)
    if (comprehensionPercent.trim() === '' || !Number.isFinite(parsedScore)) {
      setError('Enter a comprehension score from 0 to 100.')
      return
    }
    if (parsedScore < 0 || parsedScore > 100) {
      setError('Comprehension score must be between 0 and 100.')
      return
    }

    setError(null)
    onSubmit(Math.round(parsedScore))
  }

  return (
    <form className="manual-check-form" noValidate onSubmit={submitManualScore}>
      <div>
        <span className="eyebrow">Manual check</span>
        <h3>Save comprehension without Gemini</h3>
      </div>
      <div className="summary-grid compact-summary-grid">
        <div className="metric">
          <span>Raw pace</span>
          <strong>{actualWpm} WPM</strong>
        </div>
        <div className="metric">
          <span>Words tested</span>
          <strong>{wordsRead}</strong>
        </div>
      </div>
      <label className="field">
        Comprehension percent
        <input
          inputMode="numeric"
          max={100}
          min={0}
          onChange={(event) => setComprehensionPercent(event.target.value)}
          placeholder="85"
          type="number"
          value={comprehensionPercent}
        />
      </label>
      {error && <p className="form-message error">{error}</p>}
      <div className="summary-actions">
        <span className="form-message">Use your own rubric or a teacher-scored check.</span>
        <button className="primary-button" type="submit">
          Save manual check
        </button>
      </div>
    </form>
  )
}

function SessionMetrics({ actualWpm, wordsRead }: { actualWpm: number; wordsRead: number }) {
  return (
    <div className="summary-grid">
      <div className="metric">
        <span>Actual WPM</span>
        <strong>{actualWpm}</strong>
      </div>
      <div className="metric">
        <span>Words tested</span>
        <strong>{wordsRead}</strong>
      </div>
    </div>
  )
}
