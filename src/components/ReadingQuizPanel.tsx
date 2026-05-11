import type { GeminiQuiz } from '../lib/ai/geminiQuiz'
import { calculateActualWpm } from '../lib/reading/pacing'
import type { FormEvent } from 'react'

type ReadingQuizPanelProps = {
  error: string | null
  isLoading: boolean
  onCancel: () => void
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
  onRetry,
  onSubmit,
  quiz,
  wordsRead,
  durationSeconds,
}: ReadingQuizPanelProps) {
  const answers: Record<string, string> = {}
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
      </section>
    )
  }

  if (!quiz) {
    return null
  }

  function submitAnswers(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
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
          <button className="primary-button" type="submit">
            Save quiz result
          </button>
        </div>
      </form>
    </section>
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
