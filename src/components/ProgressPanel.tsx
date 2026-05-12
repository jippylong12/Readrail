import { type FormEvent, useMemo, useState } from 'react'
import { CheckCircle2, CircleDot, XCircle } from 'lucide-react'
import { buildCoachingProgressSummary, type CoachingTrendMetric } from '../lib/reading/coaching'
import type { CoachingState, DocumentRecord, QuizAttempt, QuizQuestionReview, ReadingSession } from '../types/domain'

export type ManualRetestInput = {
  documentId: string
  wordCount: number
  durationSeconds: number
  targetWpm: number
  comprehensionPercent: number
}

type ProgressPanelProps = {
  coaching: CoachingState
  documents: DocumentRecord[]
  quizAttempts: QuizAttempt[]
  sessions: ReadingSession[]
  onOpenReader: (documentId: string) => void
  onSaveRetest: (input: ManualRetestInput) => void
}

export function ProgressPanel({
  coaching,
  documents,
  quizAttempts,
  sessions,
  onOpenReader,
  onSaveRetest,
}: ProgressPanelProps) {
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(quizAttempts[0]?.id ?? null)
  const [isRetestOpen, setIsRetestOpen] = useState(false)
  const progressSummary = useMemo(
    () => buildCoachingProgressSummary(quizAttempts, sessions, coaching.recommendedWpm),
    [coaching.recommendedWpm, quizAttempts, sessions],
  )
  const selectedAttempt = quizAttempts.find((attempt) => attempt.id === selectedAttemptId) ?? quizAttempts[0] ?? null
  const latestAttempt = progressSummary.latestAttempt
  const documentById = useMemo(
    () => new Map(documents.map((document) => [document.id, document])),
    [documents],
  )
  const sessionById = useMemo(
    () => new Map(sessions.map((session) => [session.id, session])),
    [sessions],
  )

  return (
    <div className="content-stack progress-view">
      <section className="panel progress-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Progress</span>
            <h1>Coaching progress</h1>
          </div>
          <button
            className="secondary-button"
            disabled={documents.length === 0}
            onClick={() => setIsRetestOpen((open) => !open)}
            type="button"
          >
            {isRetestOpen ? 'Hide retest' : 'Manual retest'}
          </button>
        </div>

        <div className="summary-grid" data-tour="progress-summary">
          <Metric label="Recommended WPM" value={`${progressSummary.recommendation.recommendedWpm} WPM`} />
          <Metric label="Last quiz score" value={latestAttempt ? `${latestAttempt.comprehensionPercent}%` : 'N/A'} />
          <Metric label="Last raw pace" value={latestAttempt ? `${latestAttempt.rawWpm} WPM` : 'N/A'} />
          <Metric label="Attempts" value={progressSummary.attempts.total} />
        </div>

        {latestAttempt ? (
          <div className={`recommendation-callout ${progressSummary.recommendation.action}`}>
            <div className="recommendation-header">
              <div>
                <span className="eyebrow">WPM adjustment</span>
                <h2>{formatRecommendationAction(progressSummary.recommendation.action)}</h2>
              </div>
              <span className="status-badge">{formatAttemptKind(latestAttempt.kind)}</span>
            </div>
            <p>{progressSummary.recommendation.explanation}</p>
            <ul className="recommendation-evidence">
              {progressSummary.recommendation.evidence.map((evidence) => (
                <li key={evidence}>{evidence}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="empty-state">
            <strong>No comprehension checks yet</strong>
            <span>Start reading, then use Test from the reader when a segment is ready.</span>
          </div>
        )}

        {isRetestOpen && (
          <ManualRetestForm
            defaultTargetWpm={coaching.recommendedWpm}
            documents={documents}
            onSave={(input) => {
              onSaveRetest(input)
              setIsRetestOpen(false)
            }}
          />
        )}
      </section>

      <section className="panel progress-panel">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Trends</span>
            <h2>Comprehension-aware growth</h2>
          </div>
        </div>

        <div className="trend-grid">
          <TrendCard label="Raw WPM" metric={progressSummary.trends.rawWpm} suffix=" WPM" />
          <TrendCard label="Adjusted WPM" metric={progressSummary.trends.adjustedWpm} suffix=" WPM" />
          <TrendCard label="Comprehension" metric={progressSummary.trends.comprehension} suffix="%" />
          <TrendCard label="Words tested" metric={progressSummary.trends.wordsTested} />
        </div>

        <div className="coaching-rollup-grid">
          <Metric label="Total words read" value={progressSummary.readingVolume.totalWords.toLocaleString()} />
          <Metric label="Last 7 days" value={progressSummary.readingVolume.recentWords.toLocaleString()} />
          <Metric label="Reading sessions" value={progressSummary.readingVolume.totalSessions} />
          <Metric label="Streak" value={`${progressSummary.readingVolume.streakDays} days`} />
        </div>

        <div className="attempt-kind-rollup" aria-label="Attempt kinds">
          <KindCount label="Generated quizzes" value={progressSummary.attempts.generated} />
          <KindCount label="Manual checks" value={progressSummary.attempts.manual} />
          <KindCount label="Retests" value={progressSummary.attempts.retest} />
        </div>
      </section>

      <section className="panel progress-panel" data-tour="progress-history">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">History</span>
            <h2>Comprehension attempts</h2>
          </div>
        </div>

        {quizAttempts.length === 0 ? (
          <div className="empty-state">
            <strong>No quiz history</strong>
            <span>Completed tests will appear here with answer review.</span>
          </div>
        ) : (
          <div className="attempt-table-wrap">
            <table className="attempt-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Reading</th>
                  <th>Words</th>
                  <th>Score</th>
                  <th>Raw</th>
                  <th>Adjusted</th>
                  <th>Recommended</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {quizAttempts.map((attempt) => {
                  const document = documentById.get(attempt.documentId)
                  const session = attempt.readingSessionId ? sessionById.get(attempt.readingSessionId) ?? null : null
                  return (
                    <tr className={attempt.id === selectedAttempt?.id ? 'active' : ''} key={attempt.id}>
                      <td>{formatDate(attempt.createdAt)}</td>
                      <td>{formatAttemptKind(attempt.kind)}</td>
                      <td>{formatAttemptReadingLabel(document?.title ?? 'Unknown reading', attempt, session)}</td>
                      <td>{`${attempt.startWordIndex}-${attempt.endWordIndex}`}</td>
                      <td>{`${attempt.comprehensionPercent}%`}</td>
                      <td>{`${attempt.rawWpm} WPM`}</td>
                      <td>{`${attempt.adjustedWpm} WPM`}</td>
                      <td>{`${attempt.recommendedWpm} WPM`}</td>
                      <td>
                        <button className="secondary-button compact-button" onClick={() => setSelectedAttemptId(attempt.id)} type="button">
                          Open
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedAttempt && (
        <QuizReview
          attempt={selectedAttempt}
          documentTitle={documentById.get(selectedAttempt.documentId)?.title ?? 'Unknown reading'}
          session={selectedAttempt.readingSessionId ? sessionById.get(selectedAttempt.readingSessionId) ?? null : null}
          onOpenReader={() => onOpenReader(selectedAttempt.documentId)}
        />
      )}
    </div>
  )
}

function ManualRetestForm({
  defaultTargetWpm,
  documents,
  onSave,
}: {
  defaultTargetWpm: number
  documents: DocumentRecord[]
  onSave: (input: ManualRetestInput) => void
}) {
  const [documentId, setDocumentId] = useState(documents[0]?.id ?? '')
  const [wordCount, setWordCount] = useState('')
  const [durationSeconds, setDurationSeconds] = useState('')
  const [targetWpm, setTargetWpm] = useState(defaultTargetWpm.toString())
  const [comprehensionPercent, setComprehensionPercent] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submitRetest(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const parsedWordCount = Number(wordCount)
    const parsedDurationSeconds = Number(durationSeconds)
    const parsedTargetWpm = Number(targetWpm)
    const parsedComprehension = Number(comprehensionPercent)

    if (!documentId) {
      setError('Choose a reading for this retest.')
      return
    }
    if (wordCount.trim() === '' || !Number.isFinite(parsedWordCount) || parsedWordCount <= 0) {
      setError('Enter a tested word count greater than 0.')
      return
    }
    if (durationSeconds.trim() === '' || !Number.isFinite(parsedDurationSeconds) || parsedDurationSeconds <= 0) {
      setError('Enter a retest duration greater than 0 seconds.')
      return
    }
    if (targetWpm.trim() === '' || !Number.isFinite(parsedTargetWpm) || parsedTargetWpm <= 0) {
      setError('Enter a target WPM greater than 0.')
      return
    }
    if (comprehensionPercent.trim() === '' || !Number.isFinite(parsedComprehension)) {
      setError('Enter a comprehension score from 0 to 100.')
      return
    }
    if (parsedComprehension < 0 || parsedComprehension > 100) {
      setError('Comprehension score must be between 0 and 100.')
      return
    }

    setError(null)
    onSave({
      documentId,
      wordCount: Math.round(parsedWordCount),
      durationSeconds: Math.round(parsedDurationSeconds),
      targetWpm: Math.round(parsedTargetWpm),
      comprehensionPercent: Math.round(parsedComprehension),
    })
  }

  return (
    <form className="manual-retest-form" noValidate onSubmit={submitRetest}>
      <div>
        <span className="eyebrow">Retest</span>
        <h2>Manual speed and comprehension retest</h2>
      </div>
      <div className="retest-fields">
        <label className="field">
          Reading
          <select onChange={(event) => setDocumentId(event.target.value)} value={documentId}>
            {documents.map((document) => (
              <option key={document.id} value={document.id}>
                {document.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Words tested
          <input
            inputMode="numeric"
            min={1}
            onChange={(event) => setWordCount(event.target.value)}
            placeholder="600"
            type="number"
            value={wordCount}
          />
        </label>
        <label className="field">
          Duration seconds
          <input
            inputMode="numeric"
            min={1}
            onChange={(event) => setDurationSeconds(event.target.value)}
            placeholder="180"
            type="number"
            value={durationSeconds}
          />
        </label>
        <label className="field">
          Target WPM
          <input
            inputMode="numeric"
            min={1}
            onChange={(event) => setTargetWpm(event.target.value)}
            placeholder="250"
            type="number"
            value={targetWpm}
          />
        </label>
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
      </div>
      {error && <p className="form-message error">{error}</p>}
      <div className="summary-actions">
        <span className="form-message">This saves a retest point without creating a new reading session.</span>
        <button className="primary-button" type="submit">
          Save retest
        </button>
      </div>
    </form>
  )
}

function QuizReview({
  attempt,
  documentTitle,
  session,
  onOpenReader,
}: {
  attempt: QuizAttempt
  documentTitle: string
  session: ReadingSession | null
  onOpenReader: () => void
}) {
  return (
    <section className="panel progress-panel" data-tour="progress-review">
      <div className="panel-header compact">
        <div>
          <span className="eyebrow">{formatAttemptKind(attempt.kind)} review</span>
          <h2>{formatAttemptReadingLabel(documentTitle, attempt, session)}</h2>
        </div>
        <button className="secondary-button" onClick={onOpenReader} type="button">
          Open reader
        </button>
      </div>

      <div className="summary-grid">
        <Metric label="Date" value={formatDate(attempt.createdAt)} />
        <Metric label="Word range" value={`${attempt.startWordIndex}-${attempt.endWordIndex}`} />
        <Metric label="Words tested" value={attempt.wordCount} />
        <Metric label="Target WPM" value={`${attempt.targetWpm} WPM`} />
        <Metric label="Raw WPM" value={`${attempt.rawWpm} WPM`} />
        <Metric label="Adjusted WPM" value={`${attempt.adjustedWpm} WPM`} />
      </div>

      {attempt.questions?.length ? (
        <div className="review-question-list">
          {attempt.questions.map((question, index) => (
            <ReviewQuestion index={index} key={question.questionId} question={question} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>{attempt.kind === 'generated' ? 'Question details unavailable' : 'Manual score recorded'}</strong>
          <span>
            {attempt.kind === 'generated'
              ? 'This older attempt has a score, but not full answer review data.'
              : 'This attempt stores timing, pace, comprehension, and recommendation data without generated questions.'}
          </span>
        </div>
      )}
    </section>
  )
}

function ReviewQuestion({ question, index }: { question: QuizQuestionReview; index: number }) {
  return (
    <article className="review-question">
      <div className="review-question-header">
        <strong>{`${index + 1}. ${question.prompt}`}</strong>
        <span>{question.score === question.maxScore ? 'Correct' : 'Review'}</span>
      </div>
      <div className="answer-list review-answer-list">
        {question.options.map((option) => {
          const isSelected = option.id === question.selectedOptionId
          const isCorrect = option.id === question.correctOptionId
          const isIncorrectSelection = isSelected && !isCorrect
          return (
            <div
              className={`answer-option review-answer${isSelected ? ' selected' : ''}${isCorrect ? ' correct' : ''}${isIncorrectSelection ? ' incorrect' : ''}`}
              key={option.id}
            >
              <span>{option.label}</span>
              <div className="review-answer-status">
                {isSelected && (
                  <span className={`status-badge selected-badge${isCorrect ? ' selected-correct-badge' : ' selected-incorrect-badge'}`}>
                    <CircleDot aria-hidden="true" size={14} strokeWidth={2.4} />
                    Selected
                  </span>
                )}
                {isCorrect && (
                  <span className="status-badge correct-badge">
                    <CheckCircle2 aria-hidden="true" size={14} strokeWidth={2.4} />
                    Correct
                  </span>
                )}
                {isIncorrectSelection && (
                  <span className="status-badge incorrect-badge">
                    <XCircle aria-hidden="true" size={14} strokeWidth={2.4} />
                    Incorrect
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </article>
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

function TrendCard({ label, metric, suffix = '' }: { label: string; metric: CoachingTrendMetric; suffix?: string }) {
  return (
    <div className={`trend-card ${metric.direction}`}>
      <span>{label}</span>
      <strong>{formatMetricValue(metric.current, suffix)}</strong>
      <small>{formatMetricDelta(metric, suffix)}</small>
    </div>
  )
}

function KindCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="kind-count">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function formatMetricValue(value: number | null, suffix: string): string {
  return value === null ? 'N/A' : `${value.toLocaleString()}${suffix}`
}

function formatMetricDelta(metric: CoachingTrendMetric, suffix: string): string {
  if (metric.current === null) {
    return 'No checks yet'
  }

  if (metric.delta === null) {
    return 'No prior check'
  }

  if (metric.delta === 0) {
    return `No change from ${formatMetricValue(metric.previous, suffix)}`
  }

  const sign = metric.delta > 0 ? '+' : ''
  return `${sign}${metric.delta.toLocaleString()}${suffix} from previous`
}

function formatDate(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatReadingLabel(documentTitle: string, session: ReadingSession | null): string {
  if (!session?.scopeLabel || session.scopeType === 'document') {
    return documentTitle
  }

  return `${documentTitle} - ${session.scopeLabel}`
}

function formatAttemptReadingLabel(
  documentTitle: string,
  attempt: QuizAttempt,
  session: ReadingSession | null,
): string {
  if (session) {
    return formatReadingLabel(documentTitle, session)
  }

  if (!attempt.scopeLabel || attempt.scopeType === 'document') {
    return documentTitle
  }

  return `${documentTitle} - ${attempt.scopeLabel}`
}

function formatAttemptKind(kind: QuizAttempt['kind']): string {
  if (kind === 'manual') {
    return 'Manual check'
  }
  if (kind === 'retest') {
    return 'Retest'
  }
  return 'Generated quiz'
}

function formatRecommendationAction(action: 'check' | 'reduce' | 'hold' | 'increase'): string {
  if (action === 'reduce') {
    return 'Reduce pace'
  }
  if (action === 'increase') {
    return 'Small increase'
  }
  if (action === 'hold') {
    return 'Hold pace'
  }
  return 'Check comprehension'
}
