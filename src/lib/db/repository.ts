import type { DocumentRecord, ReadingSession } from '../../types/domain'
import { getDatabase } from './migrations'

export async function saveDocumentToDatabase(document: DocumentRecord): Promise<void> {
  const database = await getDatabase()
  if (!database) {
    return
  }

  await database.execute(
    `INSERT INTO documents (
      id, title, source_type, content, word_count, estimated_pages, language, created_at, updated_at, archived_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      source_type = excluded.source_type,
      content = excluded.content,
      word_count = excluded.word_count,
      estimated_pages = excluded.estimated_pages,
      language = excluded.language,
      updated_at = excluded.updated_at,
      archived_at = excluded.archived_at`,
    [
      document.id,
      document.title,
      document.sourceType,
      document.content,
      document.wordCount,
      document.estimatedPages,
      document.language,
      document.createdAt,
      document.updatedAt,
      document.archivedAt,
    ],
  )
}

export async function saveSessionToDatabase(session: ReadingSession): Promise<void> {
  const database = await getDatabase()
  if (!database) {
    return
  }

  await database.execute(
    `INSERT INTO reading_sessions (
      id, document_id, mode, target_wpm, actual_wpm, adjusted_wpm, words_read, duration_seconds,
      start_position, end_position, pause_count, regression_count, comprehension_score, self_rating,
      notes, started_at, ended_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    ON CONFLICT(id) DO UPDATE SET
      comprehension_score = excluded.comprehension_score,
      self_rating = excluded.self_rating,
      notes = excluded.notes`,
    [
      session.id,
      session.documentId,
      session.mode,
      session.targetWpm,
      session.actualWpm,
      session.adjustedWpm,
      session.wordsRead,
      session.durationSeconds,
      session.startPosition,
      session.endPosition,
      session.pauseCount,
      session.regressionCount,
      session.comprehensionScore,
      session.selfRating,
      session.notes,
      session.startedAt,
      session.endedAt,
    ],
  )
}
