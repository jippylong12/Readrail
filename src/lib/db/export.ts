import type { DocumentRecord, ReadingSession } from '../../types/domain'

export function exportProgressJson(documents: DocumentRecord[], sessions: ReadingSession[]): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      documents,
      sessions,
    },
    null,
    2,
  )
}

export function exportProgressCsv(sessions: ReadingSession[]): string {
  const header = [
    'session_id',
    'document_id',
    'mode',
    'target_wpm',
    'actual_wpm',
    'adjusted_wpm',
    'words_read',
    'duration_seconds',
    'comprehension_score',
    'self_rating',
    'started_at',
    'ended_at',
  ]

  const rows = sessions.map((session) =>
    [
      session.id,
      session.documentId,
      session.mode,
      session.targetWpm,
      session.actualWpm,
      session.adjustedWpm ?? '',
      session.wordsRead,
      session.durationSeconds,
      session.comprehensionScore ?? '',
      session.selfRating ?? '',
      session.startedAt,
      session.endedAt,
    ]
      .map(csvEscape)
      .join(','),
  )

  return [header.join(','), ...rows].join('\n')
}

function csvEscape(value: string | number): string {
  const text = String(value)
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }

  return text
}
