import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { buildTrendRows, summarizeSessions } from '../lib/reading/stats'
import type { BaselineAssessmentResult, DocumentRecord, ReadingSession } from '../types/domain'

type StatsChartProps = {
  baselineResult: BaselineAssessmentResult | null
  documents: DocumentRecord[]
  sessions: ReadingSession[]
}

export function StatsChart({ baselineResult, documents, sessions }: StatsChartProps) {
  const summary = summarizeSessions(sessions)
  const trends = buildTrendRows(sessions)

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

      {sessions.length === 0 ? (
        <div className="empty-state" data-tour="stats-charts">
          <strong>No sessions yet</strong>
          <span>Use Test after a reader session to populate comprehension-adjusted trends.</span>
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
