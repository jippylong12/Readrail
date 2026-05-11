import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { buildTrendRows, summarizeSessions } from '../lib/reading/stats'
import type { BaselineAssessmentResult, DocumentRecord, QuizAttempt, ReadingSession } from '../types/domain'

type StatsChartProps = {
  baselineResult: BaselineAssessmentResult | null
  documents: DocumentRecord[]
  sessions: ReadingSession[]
  quizAttempts: QuizAttempt[]
  hasGeminiKey: boolean
}

export function StatsChart({ baselineResult, documents, sessions, quizAttempts, hasGeminiKey }: StatsChartProps) {
  const summary = summarizeSessions(sessions)
  const trends = buildTrendRows(sessions)
  const latestQuiz = hasGeminiKey ? quizAttempts[0] : null
  const previousQuiz = hasGeminiKey ? quizAttempts[1] : null
  const coachingAttempts = hasGeminiKey ? quizAttempts : []
  const latestSource = latestQuiz ? documents.find((document) => document.id === latestQuiz.documentId)?.title : null

  const speedDelta = latestQuiz && previousQuiz ? latestQuiz.recommendedWpm - previousQuiz.recommendedWpm : null
  const comprehensionDelta = latestQuiz && previousQuiz ? latestQuiz.comprehensionPercent - previousQuiz.comprehensionPercent : null

  return (
    <section className="panel stats-panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">Stats</span>
          <h1>Progress trends</h1>
        </div>
        <span>{documents.filter((document) => !document.archivedAt).length} active documents</span>
      </div>

      <div className="summary-grid" data-tour="stats-summary">
        <Metric label="Sessions" value={summary.totalSessions} />
        <Metric label="Words read" value={summary.totalWords.toLocaleString()} />
        <Metric label="Minutes" value={summary.totalMinutes} />
        <Metric label="Avg WPM" value={summary.averageWpm} />
        <Metric label="Avg comp." value={summary.averageComprehension ? `${summary.averageComprehension}%` : 'N/A'} />
        <Metric label="Streak" value={`${summary.streakDays} days`} />
      </div>

      {baselineResult && (
        <section className="baseline-summary" data-tour="baseline-summary">
          <div>
            <span className="eyebrow">Baseline</span>
            <h2>{baselineResult.storyTitle}</h2>
            <p>{baselineResult.explanation}</p>
          </div>
          <div className="summary-grid">
            <Metric label="Raw WPM" value={baselineResult.rawWpm} />
            <Metric label="Comprehension" value={`${baselineResult.comprehensionPercent}%`} />
            <Metric label="Adjusted WPM" value={baselineResult.adjustedWpm} />
            <Metric label="Starting pace" value={`${baselineResult.recommendedWpm} WPM`} />
          </div>
        </section>
      )}

      <section className="coaching-summary" data-tour="coaching-summary">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Active Coaching</span>
            <h2>Latest Recommendation</h2>
          </div>
        </div>

        {!hasGeminiKey ? (
          <div className="empty-state">
            <strong>Coaching is disabled</strong>
            <span>
              Add a Gemini API key in Settings to enable generated quiz attempts and AI-based coaching recommendations in this panel.
            </span>
          </div>
        ) : latestQuiz ? (
          <>
            <p>{latestQuiz.explanation}</p>
            <div className="summary-grid">
              <Metric label="Recommended WPM" value={`${latestQuiz.recommendedWpm} WPM`} />
              <Metric label="Speed trend" value={formatDelta(speedDelta, 'WPM')} />
              <Metric label="Comprehension trend" value={formatDelta(comprehensionDelta, '%')} />
              <Metric label="Latest source" value={latestSource ?? 'Unknown reading'} />
              <Metric label="Assessment type" value={latestQuiz.kind === 'manual' ? 'Manual check' : 'Generated quiz'} />
              <Metric label="Latest raw pace" value={`${latestQuiz.rawWpm} WPM`} />
            </div>

            <section className="coaching-history" data-tour="coaching-history">
              <div className="panel-header compact">
                <div>
                  <span className="eyebrow">Coaching history</span>
                  <h2>Recent attempts</h2>
                </div>
              </div>

              {quizAttempts.length === 1 ? (
                <div className="empty-state">
                  <strong>One assessment recorded</strong>
                  <span>Complete one more check after a reading session to track pace and comprehension movement.</span>
                </div>
              ) : (
                <div className="summary-grid">
                  {coachingAttempts.slice(0, 5).map((attempt) => (
                    <div className="metric" key={attempt.id}>
                      <span>{coachingAttemptDate(attempt.createdAt)}</span>
                      <strong>{attempt.kind === 'manual' ? 'Manual' : 'Generated'} </strong>
                      <span>{`${attempt.recommendedWpm} WPM · ${attempt.comprehensionPercent}% comp.`}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          <div className="empty-state">
            <strong>No recent assessments</strong>
            <span>
              Complete a manual or generated comprehension check after a reading session to update your coaching recommendation.
            </span>
          </div>
        )}
      </section>

      {sessions.length === 0 ? (
        <div className="empty-state" data-tour="stats-charts">
          <strong>No sessions yet</strong>
          <span>Finish a reader session and save the comprehension check to populate trends.</span>
        </div>
      ) : (
        <div className="chart-grid" data-tour="stats-charts">
          <div className="chart-block">
            <h2>WPM and adjusted WPM</h2>
            <ResponsiveContainer height={260} width="100%">
              <LineChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line dataKey="wpm" stroke="#2563eb" strokeWidth={2} type="monotone" />
                <Line dataKey="adjusted" stroke="#16a34a" strokeWidth={2} type="monotone" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-block">
            <h2>Reading minutes</h2>
            <ResponsiveContainer height={260} width="100%">
              <AreaChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Area dataKey="minutes" fill="#bfdbfe" stroke="#2563eb" type="monotone" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
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

function formatDelta(delta: number | null, unit: string): string {
  if (delta === null) {
    return 'First data point'
  }

  if (delta > 0) {
    return `+${delta} ${unit}`
  }

  if (delta < 0) {
    return `${delta} ${unit}`
  }

  return `0 ${unit}`
}

function coachingAttemptDate(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
