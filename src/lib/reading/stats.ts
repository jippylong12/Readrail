import type { ReadingSession } from '../../types/domain'

export type StatsSummary = {
  totalSessions: number
  totalWords: number
  totalMinutes: number
  averageWpm: number
  averageComprehension: number | null
  bestAdjustedWpm: number | null
  streakDays: number
}

export function summarizeSessions(sessions: ReadingSession[]): StatsSummary {
  const totalWords = sessions.reduce((sum, session) => sum + session.wordsRead, 0)
  const totalSeconds = sessions.reduce((sum, session) => sum + session.durationSeconds, 0)
  const comprehensionScores = sessions
    .map((session) => session.comprehensionScore)
    .filter((score): score is number => score !== null)
  const adjustedScores = sessions
    .map((session) => session.adjustedWpm)
    .filter((score): score is number => score !== null)

  return {
    totalSessions: sessions.length,
    totalWords,
    totalMinutes: Math.round(totalSeconds / 60),
    averageWpm: sessions.length ? Math.round((totalWords / (totalSeconds / 60 || 1)) * 10) / 10 : 0,
    averageComprehension: average(comprehensionScores),
    bestAdjustedWpm: adjustedScores.length ? Math.max(...adjustedScores) : null,
    streakDays: calculateStreakDays(sessions),
  }
}

export function buildTrendRows(sessions: ReadingSession[]) {
  return sessions
    .slice()
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map((session) => ({
      date: new Date(session.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      wpm: session.actualWpm,
      adjusted: session.adjustedWpm ?? 0,
      comprehension: session.comprehensionScore ?? 0,
      minutes: Math.round(session.durationSeconds / 60),
      words: session.wordsRead,
    }))
}

function average(values: number[]): number | null {
  if (!values.length) {
    return null
  }

  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
}

function calculateStreakDays(sessions: ReadingSession[]): number {
  const days = new Set(sessions.map((session) => session.startedAt.slice(0, 10)))
  let streak = 0
  const cursor = new Date()

  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }

  return streak
}
