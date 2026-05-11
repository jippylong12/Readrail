import type { DocumentChapterRecord, DocumentPageRecord, DocumentRecord, ReadingSession } from '../../types/domain'
import { getDatabase } from './migrations'

type StructuredDocumentRecords = {
  chapters?: DocumentChapterRecord[]
  pages?: DocumentPageRecord[]
}

export async function saveDocumentToDatabase(
  document: DocumentRecord,
  structuredRecords: StructuredDocumentRecords = {},
): Promise<void> {
  const database = await getDatabase()
  if (!database) {
    return
  }

  await database.execute(
    `INSERT INTO documents (
      id, title, source_type, content, word_count, estimated_pages, language, structure_version,
      created_at, updated_at, archived_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      source_type = excluded.source_type,
      content = excluded.content,
      word_count = excluded.word_count,
      estimated_pages = excluded.estimated_pages,
      language = excluded.language,
      structure_version = excluded.structure_version,
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
      document.structureVersion,
      document.createdAt,
      document.updatedAt,
      document.archivedAt,
    ],
  )

  for (const chapter of structuredRecords.chapters ?? []) {
    await database.execute(
      `INSERT INTO document_chapters (
        id, document_id, title, sort_order, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        sort_order = excluded.sort_order,
        updated_at = excluded.updated_at`,
      [chapter.id, chapter.documentId, chapter.title, chapter.sortOrder, chapter.createdAt, chapter.updatedAt],
    )
  }

  for (const page of structuredRecords.pages ?? []) {
    await database.execute(
      `INSERT INTO document_pages (
        id, document_id, chapter_id, sort_order, page_number, source_page_number, title, text,
        word_count, review_status, ocr_confidence, ocr_notes, uncertain_spans_json, source_file_id,
        source_file_name, source_kind, source_local_path, source_sha256, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      ON CONFLICT(id) DO UPDATE SET
        chapter_id = excluded.chapter_id,
        sort_order = excluded.sort_order,
        page_number = excluded.page_number,
        source_page_number = excluded.source_page_number,
        title = excluded.title,
        text = excluded.text,
        word_count = excluded.word_count,
        review_status = excluded.review_status,
        ocr_confidence = excluded.ocr_confidence,
        ocr_notes = excluded.ocr_notes,
        uncertain_spans_json = excluded.uncertain_spans_json,
        source_file_id = excluded.source_file_id,
        source_file_name = excluded.source_file_name,
        source_kind = excluded.source_kind,
        source_local_path = excluded.source_local_path,
        source_sha256 = excluded.source_sha256,
        updated_at = excluded.updated_at`,
      [
        page.id,
        page.documentId,
        page.chapterId,
        page.sortOrder,
        page.pageNumber,
        page.sourcePageNumber,
        page.title,
        page.text,
        page.wordCount,
        page.reviewStatus,
        page.ocrConfidence,
        page.ocrNotes,
        JSON.stringify(page.uncertainSpans),
        page.sourceFileId,
        page.sourceFileName,
        page.sourceKind,
        page.sourceLocalPath,
        page.sourceSha256,
        page.createdAt,
        page.updatedAt,
      ],
    )
  }
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
