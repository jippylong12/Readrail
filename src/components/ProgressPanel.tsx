import { useMemo, useState } from 'react'
import { CheckCircle2, CircleDot, XCircle } from 'lucide-react'
import type { CoachingState, DocumentRecord, QuizAttempt, QuizQuestionReview, ReadingSession } from '../types/domain'

type ProgressPanelProps = {
  coaching: CoachingState
  documents: DocumentRecord[]
  quizAttempts: QuizAttempt[]
  sessions: ReadingSession[]
  onOpenReader: (documentId: string) => void
}

export function ProgressPanel({ coaching, documents, quizAttempts, sessions, onOpenReader }: ProgressPanelProps) {
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(quizAttempts[0]?.id ?? null)
  const selectedAttempt = quizAttempts.find((attempt) => attempt.id === selectedAttemptId) ?? quizAttempts[0] ?? null
  const latestAttempt = quizAttempts[0] ?? null
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
        </div>

        <div className="summary-grid" data-tour="progress-summary">
          <Metric label="Recommended WPM" value={`${coaching.recommendedWpm} WPM`} />
          <Metric label="Last quiz score" value={latestAttempt ? `${latestAttempt.comprehensionPercent}%` : 'N/A'} />
          <Metric label="Last raw pace" value={latestAttempt ? `${latestAttempt.rawWpm} WPM` : 'N/A'} />
          <Metric label="Attempts" value={quizAttempts.length} />
        </div>

        {latestAttempt ? (
          <div className="recommendation-callout">
            <span className="eyebrow">WPM adjustment</span>
            <p>{latestAttempt.explanation}</p>
          </div>
        ) : (
          <div className="empty-state">
            <strong>No comprehension checks yet</strong>
            <span>Start reading, then use Test from the reader when a segment is ready.</span>
          </div>
        )}
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
                      <td>{formatReadingLabel(document?.title ?? 'Unknown reading', session)}</td>
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
          <span className="eyebrow">Quiz review</span>
          <h2>{formatReadingLabel(documentTitle, session)}</h2>
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
          <strong>Question details unavailable</strong>
          <span>This older attempt has a score, but not full answer review data.</span>
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

function formatDate(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatReadingLabel(documentTitle: string, session: ReadingSession | null): string {
  if (!session?.scopeLabel || session.scopeType === 'document') {
    return documentTitle
  }

  return `${documentTitle} - ${session.scopeLabel}`
}
