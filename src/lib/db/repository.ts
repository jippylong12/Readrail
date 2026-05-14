import type {
  AiPricingSnapshot,
  AiUsageLineItem,
  AiUsageStage,
  AiUsageStatus,
  AiUsageTokenBreakdown,
  BaselineQuestionResult,
  DocumentChapterRecord,
  DocumentPageRecord,
  DocumentRecord,
  OcrBatchRun,
  OcrJob,
  OcrJobItem,
  OcrJobItemPage,
  OcrReviewStatus,
  OcrUncertainSpan,
  QuizAttempt,
  QuizAttemptKind,
  QuizQuestionReview,
  ReadingScopeType,
  ReadingSession,
  SourceFileRecord,
  SourceType,
} from '../../types/domain'
import { getDatabase } from './migrations'

type StructuredDocumentRecords = {
  chapters?: DocumentChapterRecord[]
  pages?: DocumentPageRecord[]
}

export type AiUsageLineItemQuery = {
  documentId?: string | null
  ocrJobId?: string | null
  ocrItemId?: string | null
  stage?: AiUsageStage
  provider?: string
  model?: string
  status?: AiUsageStatus
}

export type QuizAttemptQuery = {
  documentId?: string | null
  readingSessionId?: string | null
  kind?: QuizAttemptKind
}

export type DurableDatabaseState = {
  documents: DocumentRecord[]
  documentChapters: DocumentChapterRecord[]
  documentPages: DocumentPageRecord[]
  ocrJobs: OcrJob[]
  ocrJobItems: OcrJobItem[]
  ocrBatchRuns: OcrBatchRun[]
  sessions: ReadingSession[]
  quizAttempts: QuizAttempt[]
  aiUsageLineItems: AiUsageLineItem[]
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

export async function deleteDocumentPageFromDatabase(pageId: string): Promise<void> {
  const database = await getDatabase()
  if (!database) {
    return
  }

  await database.execute('DELETE FROM document_pages WHERE id = $1', [pageId])
}

export async function clearDurableStateFromDatabase(): Promise<void> {
  const database = await getDatabase()
  if (!database) {
    return
  }

  await database.execute('DELETE FROM ai_usage_line_items')
  await database.execute('DELETE FROM quiz_attempts')
  await database.execute('DELETE FROM comprehension_checks')
  await database.execute('DELETE FROM reading_sessions')
  await database.execute('DELETE FROM ocr_batch_runs')
  await database.execute('DELETE FROM ocr_job_items')
  await database.execute('DELETE FROM ocr_jobs')
  await database.execute('DELETE FROM source_files')
  await database.execute('DELETE FROM document_pages')
  await database.execute('DELETE FROM document_chapters')
  await database.execute('DELETE FROM documents')
}

export async function saveSessionToDatabase(session: ReadingSession): Promise<void> {
  const database = await getDatabase()
  if (!database) {
    return
  }

  await database.execute(
    `INSERT INTO reading_sessions (
      id, document_id, scope_type, scope_label, chapter_id, chapter_title, page_ids_json,
      page_numbers_json, source_page_numbers_json, mode, target_wpm, actual_wpm, adjusted_wpm, words_read, duration_seconds,
      start_position, end_position, pause_count, regression_count, comprehension_score, self_rating,
      notes, started_at, ended_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
    ON CONFLICT(id) DO UPDATE SET
      scope_type = excluded.scope_type,
      scope_label = excluded.scope_label,
      chapter_id = excluded.chapter_id,
      chapter_title = excluded.chapter_title,
      page_ids_json = excluded.page_ids_json,
      page_numbers_json = excluded.page_numbers_json,
      source_page_numbers_json = excluded.source_page_numbers_json,
      comprehension_score = excluded.comprehension_score,
      self_rating = excluded.self_rating,
      notes = excluded.notes`,
    [
      session.id,
      session.documentId,
      session.scopeType ?? 'document',
      session.scopeLabel ?? null,
      session.chapterId ?? null,
      session.chapterTitle ?? null,
      JSON.stringify(session.pageIds ?? []),
      JSON.stringify(session.pageNumbers ?? []),
      JSON.stringify(session.sourcePageNumbers ?? []),
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

export async function saveOcrJobToDatabase(job: OcrJob, items: OcrJobItem[]): Promise<void> {
  const database = await getDatabase()
  if (!database) {
    return
  }

  await database.execute(
    `INSERT INTO ocr_jobs (
      id, document_id, target_chapter_id, status, concurrent_item_limit, processing_mode, model_id, input_file_count, prompt_version,
      warnings_json, error_message, created_at, updated_at, completed_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    ON CONFLICT(id) DO UPDATE SET
      document_id = excluded.document_id,
      target_chapter_id = excluded.target_chapter_id,
      status = excluded.status,
      concurrent_item_limit = excluded.concurrent_item_limit,
      processing_mode = excluded.processing_mode,
      input_file_count = excluded.input_file_count,
      warnings_json = excluded.warnings_json,
      error_message = excluded.error_message,
      updated_at = excluded.updated_at,
      completed_at = excluded.completed_at`,
    [
      job.id,
      job.documentId,
      job.targetChapterId,
      job.status,
      job.concurrentItemLimit,
      job.processingMode,
      job.modelId,
      job.inputFileCount,
      job.promptVersion,
      JSON.stringify(job.warnings),
      job.errorMessage,
      job.createdAt,
      job.updatedAt,
      job.completedAt,
    ],
  )

  for (const item of items) {
    await database.execute(
      `INSERT INTO ocr_job_items (
        id, job_id, order_index, source_file_name, source_file_type, source_file_size,
        source_file_last_modified, source_page_number, title, status, ocr_text, pages_json,
        warnings_json, failure_reason, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT(id) DO UPDATE SET
        order_index = excluded.order_index,
        source_file_name = excluded.source_file_name,
        source_file_type = excluded.source_file_type,
        source_file_size = excluded.source_file_size,
        source_file_last_modified = excluded.source_file_last_modified,
        source_page_number = excluded.source_page_number,
        title = excluded.title,
        status = excluded.status,
        ocr_text = excluded.ocr_text,
        pages_json = excluded.pages_json,
        warnings_json = excluded.warnings_json,
        failure_reason = excluded.failure_reason,
        updated_at = excluded.updated_at`,
      [
        item.id,
        item.jobId,
        item.orderIndex,
        item.sourceFileName,
        item.sourceFileType,
        item.sourceFileSize,
        item.sourceFileLastModified,
        item.sourcePageNumber,
        item.title,
        item.status,
        item.ocrText,
        JSON.stringify(item.pages),
        JSON.stringify(item.warnings),
        item.failureReason,
        item.createdAt,
        item.updatedAt,
      ],
    )
  }
}

export async function saveOcrBatchRunToDatabase(batchRun: OcrBatchRun): Promise<void> {
  const database = await getDatabase()
  if (!database) {
    return
  }

  await database.execute(
    `INSERT INTO ocr_batch_runs (
      id, job_id, stage, status, provider_batch_name, provider_state, request_count,
      completed_request_count, failed_request_count, item_ids_json, remote_file_names_json,
      error_message, cleanup_warning, created_at, submitted_at, updated_at, completed_at, last_polled_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      provider_batch_name = excluded.provider_batch_name,
      provider_state = excluded.provider_state,
      request_count = excluded.request_count,
      completed_request_count = excluded.completed_request_count,
      failed_request_count = excluded.failed_request_count,
      item_ids_json = excluded.item_ids_json,
      remote_file_names_json = excluded.remote_file_names_json,
      error_message = excluded.error_message,
      cleanup_warning = excluded.cleanup_warning,
      submitted_at = excluded.submitted_at,
      updated_at = excluded.updated_at,
      completed_at = excluded.completed_at,
      last_polled_at = excluded.last_polled_at`,
    [
      batchRun.id,
      batchRun.jobId,
      batchRun.stage,
      batchRun.status,
      batchRun.providerBatchName,
      batchRun.providerState,
      batchRun.requestCount,
      batchRun.completedRequestCount,
      batchRun.failedRequestCount,
      JSON.stringify(batchRun.itemIds),
      JSON.stringify(batchRun.remoteFileNames),
      batchRun.errorMessage,
      batchRun.cleanupWarning,
      batchRun.createdAt,
      batchRun.submittedAt,
      batchRun.updatedAt,
      batchRun.completedAt,
      batchRun.lastPolledAt,
    ],
  )
}

export async function saveAiUsageLineItemToDatabase(lineItem: AiUsageLineItem): Promise<void> {
  const database = await getDatabase()
  if (!database) {
    return
  }

  await database.execute(
    `INSERT INTO ai_usage_line_items (
      id, document_id, ocr_job_id, ocr_item_id, source_file_name, stage, billing_mode, provider, model,
      status, started_at, completed_at, failure_message, raw_provider_metadata_json,
      token_breakdown_json, pricing_snapshot_json
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    ON CONFLICT(id) DO UPDATE SET
      document_id = excluded.document_id,
      ocr_job_id = excluded.ocr_job_id,
      ocr_item_id = excluded.ocr_item_id,
      source_file_name = excluded.source_file_name,
      stage = excluded.stage,
      billing_mode = excluded.billing_mode,
      provider = excluded.provider,
      model = excluded.model,
      status = excluded.status,
      completed_at = excluded.completed_at,
      failure_message = excluded.failure_message,
      raw_provider_metadata_json = excluded.raw_provider_metadata_json,
      token_breakdown_json = excluded.token_breakdown_json,
      pricing_snapshot_json = excluded.pricing_snapshot_json`,
    [
      lineItem.id,
      lineItem.documentId,
      lineItem.ocrJobId,
      lineItem.ocrItemId,
      lineItem.sourceFileName,
      lineItem.stage,
      lineItem.billingMode ?? 'interactive',
      lineItem.provider,
      lineItem.model,
      lineItem.status,
      lineItem.startedAt,
      lineItem.completedAt,
      lineItem.failureMessage,
      stringifyNullableJson(lineItem.rawProviderMetadata),
      JSON.stringify(lineItem.tokenBreakdown),
      stringifyNullableJson(lineItem.pricingSnapshot),
    ],
  )
}

export async function saveQuizAttemptToDatabase(attempt: QuizAttempt): Promise<void> {
  const database = await getDatabase()
  if (!database) {
    return
  }

  await database.execute(
    `INSERT INTO quiz_attempts (
      id, document_id, reading_session_id, kind, scope_type, scope_label, chapter_id, chapter_title,
      page_ids_json, page_numbers_json, source_page_numbers_json, start_word_index, end_word_index,
      word_count, duration_seconds, target_wpm, raw_wpm, adjusted_wpm, comprehension_percent,
      recommended_wpm, explanation, question_results_json, questions_json, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
    ON CONFLICT(id) DO UPDATE SET
      document_id = excluded.document_id,
      reading_session_id = excluded.reading_session_id,
      kind = excluded.kind,
      scope_type = excluded.scope_type,
      scope_label = excluded.scope_label,
      chapter_id = excluded.chapter_id,
      chapter_title = excluded.chapter_title,
      page_ids_json = excluded.page_ids_json,
      page_numbers_json = excluded.page_numbers_json,
      source_page_numbers_json = excluded.source_page_numbers_json,
      start_word_index = excluded.start_word_index,
      end_word_index = excluded.end_word_index,
      word_count = excluded.word_count,
      duration_seconds = excluded.duration_seconds,
      target_wpm = excluded.target_wpm,
      raw_wpm = excluded.raw_wpm,
      adjusted_wpm = excluded.adjusted_wpm,
      comprehension_percent = excluded.comprehension_percent,
      recommended_wpm = excluded.recommended_wpm,
      explanation = excluded.explanation,
      question_results_json = excluded.question_results_json,
      questions_json = excluded.questions_json,
      created_at = excluded.created_at`,
    [
      attempt.id,
      attempt.documentId,
      attempt.readingSessionId,
      attempt.kind,
      attempt.scopeType,
      attempt.scopeLabel,
      attempt.chapterId,
      attempt.chapterTitle,
      JSON.stringify(attempt.pageIds),
      JSON.stringify(attempt.pageNumbers),
      JSON.stringify(attempt.sourcePageNumbers),
      attempt.startWordIndex,
      attempt.endWordIndex,
      attempt.wordCount,
      attempt.durationSeconds,
      attempt.targetWpm,
      attempt.rawWpm,
      attempt.adjustedWpm,
      attempt.comprehensionPercent,
      attempt.recommendedWpm,
      attempt.explanation,
      JSON.stringify(attempt.questionResults ?? []),
      JSON.stringify(attempt.questions ?? []),
      attempt.createdAt,
    ],
  )
}

export async function queryQuizAttemptsFromDatabase(query: QuizAttemptQuery = {}): Promise<QuizAttempt[]> {
  const database = await getDatabase()
  if (!database) {
    return []
  }

  const where: string[] = []
  const parameters: Array<string | null> = []
  addNullableFilter(where, parameters, 'document_id', query.documentId)
  addNullableFilter(where, parameters, 'reading_session_id', query.readingSessionId)
  addValueFilter(where, parameters, 'kind', query.kind)

  const rows = await database.select<QuizAttemptRow[]>(
    `SELECT * FROM quiz_attempts${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC`,
    parameters,
  )
  return rows.map(quizAttemptFromRow)
}

export async function queryAiUsageLineItemsFromDatabase(
  query: AiUsageLineItemQuery = {},
): Promise<AiUsageLineItem[]> {
  const database = await getDatabase()
  if (!database) {
    return []
  }

  const where: string[] = []
  const parameters: Array<string | null> = []
  addNullableFilter(where, parameters, 'document_id', query.documentId)
  addNullableFilter(where, parameters, 'ocr_job_id', query.ocrJobId)
  addNullableFilter(where, parameters, 'ocr_item_id', query.ocrItemId)
  addValueFilter(where, parameters, 'stage', query.stage)
  addValueFilter(where, parameters, 'provider', query.provider)
  addValueFilter(where, parameters, 'model', query.model)
  addValueFilter(where, parameters, 'status', query.status)

  const rows = await database.select<AiUsageLineItemRow[]>(
    `SELECT * FROM ai_usage_line_items${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY started_at DESC`,
    parameters,
  )
  return rows.map(aiUsageLineItemFromRow)
}

export async function loadDurableStateFromDatabase(): Promise<DurableDatabaseState | null> {
  const database = await getDatabase()
  if (!database) {
    return null
  }

  const [
    documentRows,
    chapterRows,
    pageRows,
    ocrJobRows,
    ocrJobItemRows,
    ocrBatchRunRows,
    sessionRows,
    quizAttemptRows,
    aiUsageLineItemRows,
  ] = await Promise.all([
    database.select<DocumentRow[]>('SELECT * FROM documents ORDER BY updated_at DESC'),
    database.select<DocumentChapterRow[]>('SELECT * FROM document_chapters ORDER BY document_id ASC, sort_order ASC'),
    database.select<DocumentPageRow[]>('SELECT * FROM document_pages ORDER BY document_id ASC, sort_order ASC'),
    database.select<OcrJobRow[]>('SELECT * FROM ocr_jobs ORDER BY updated_at DESC, created_at DESC'),
    database.select<OcrJobItemRow[]>('SELECT * FROM ocr_job_items ORDER BY job_id ASC, order_index ASC'),
    database.select<OcrBatchRunRow[]>('SELECT * FROM ocr_batch_runs ORDER BY updated_at DESC, created_at DESC'),
    database.select<ReadingSessionRow[]>('SELECT * FROM reading_sessions ORDER BY started_at DESC'),
    database.select<QuizAttemptRow[]>('SELECT * FROM quiz_attempts ORDER BY created_at DESC'),
    database.select<AiUsageLineItemRow[]>('SELECT * FROM ai_usage_line_items ORDER BY started_at DESC'),
  ])

  return {
    documents: documentRows.map(documentFromRow),
    documentChapters: chapterRows.map(documentChapterFromRow),
    documentPages: pageRows.map(documentPageFromRow),
    ocrJobs: ocrJobRows.map(ocrJobFromRow),
    ocrJobItems: ocrJobItemRows.map(ocrJobItemFromRow),
    ocrBatchRuns: ocrBatchRunRows.map(ocrBatchRunFromRow),
    sessions: sessionRows.map(readingSessionFromRow),
    quizAttempts: quizAttemptRows.map(quizAttemptFromRow),
    aiUsageLineItems: aiUsageLineItemRows.map(aiUsageLineItemFromRow),
  }
}

type DocumentRow = {
  id: string
  title: string
  source_type: SourceType
  content: string
  word_count: number
  estimated_pages: number | null
  language: string | null
  structure_version: number | null
  created_at: string
  updated_at: string
  archived_at: string | null
}

type DocumentChapterRow = {
  id: string
  document_id: string
  title: string
  sort_order: number
  created_at: string
  updated_at: string
}

type DocumentPageRow = {
  id: string
  document_id: string
  chapter_id: string
  sort_order: number
  page_number: number
  source_page_number: number | null
  title: string | null
  text: string
  word_count: number
  review_status: OcrReviewStatus
  ocr_confidence: number | null
  ocr_notes: string | null
  uncertain_spans_json: string | null
  source_file_id: string | null
  source_file_name: string | null
  source_kind: SourceFileRecord['kind'] | null
  source_local_path: string | null
  source_sha256: string | null
  created_at: string
  updated_at: string
}

type OcrJobRow = {
  id: string
  document_id: string | null
  target_chapter_id: string | null
  status: OcrJob['status']
  concurrent_item_limit: number | null
  processing_mode: OcrJob['processingMode'] | null
  model_id: string
  input_file_count: number
  prompt_version: string
  warnings_json: string | null
  error_message: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

type OcrBatchRunRow = {
  id: string
  job_id: string
  stage: OcrBatchRun['stage']
  status: OcrBatchRun['status']
  provider_batch_name: string | null
  provider_state: string | null
  request_count: number
  completed_request_count: number | null
  failed_request_count: number | null
  item_ids_json: string | null
  remote_file_names_json: string | null
  error_message: string | null
  cleanup_warning: string | null
  created_at: string
  submitted_at: string | null
  updated_at: string
  completed_at: string | null
  last_polled_at: string | null
}

type OcrJobItemRow = {
  id: string
  job_id: string
  order_index: number
  source_file_name: string
  source_file_type: string
  source_file_size: number
  source_file_last_modified: number
  source_page_number: number | null
  title: string | null
  status: OcrJobItem['status']
  ocr_text: string | null
  pages_json: string | null
  warnings_json: string | null
  failure_reason: string | null
  created_at: string
  updated_at: string
}

type ReadingSessionRow = {
  id: string
  document_id: string
  scope_type: ReadingScopeType | null
  scope_label: string | null
  chapter_id: string | null
  chapter_title: string | null
  page_ids_json: string | null
  page_numbers_json: string | null
  source_page_numbers_json: string | null
  mode: ReadingSession['mode']
  target_wpm: number
  actual_wpm: number
  adjusted_wpm: number | null
  words_read: number
  duration_seconds: number
  start_position: number
  end_position: number
  pause_count: number | null
  regression_count: number | null
  comprehension_score: number | null
  self_rating: number | null
  notes: string | null
  started_at: string
  ended_at: string
}

type AiUsageLineItemRow = {
  id: string
  document_id: string | null
  ocr_job_id: string | null
  ocr_item_id: string | null
  source_file_name: string | null
  stage: AiUsageStage
  billing_mode: AiUsageLineItem['billingMode'] | null
  provider: string
  model: string
  status: AiUsageStatus
  started_at: string
  completed_at: string | null
  failure_message: string | null
  raw_provider_metadata_json: string | null
  token_breakdown_json: string | null
  pricing_snapshot_json: string | null
}

type QuizAttemptRow = {
  id: string
  document_id: string
  reading_session_id: string | null
  kind: QuizAttemptKind
  scope_type: ReadingScopeType | null
  scope_label: string | null
  chapter_id: string | null
  chapter_title: string | null
  page_ids_json: string | null
  page_numbers_json: string | null
  source_page_numbers_json: string | null
  start_word_index: number
  end_word_index: number
  word_count: number
  duration_seconds: number
  target_wpm: number
  raw_wpm: number
  adjusted_wpm: number
  comprehension_percent: number
  recommended_wpm: number
  explanation: string
  question_results_json: string | null
  questions_json: string | null
  created_at: string
}

function documentFromRow(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    title: row.title,
    sourceType: normalizeSourceType(row.source_type),
    content: row.content,
    wordCount: normalizeNumber(row.word_count, 0),
    estimatedPages: normalizeNumber(row.estimated_pages, 0),
    language: row.language || 'en',
    structureVersion: normalizeNumber(row.structure_version, 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  }
}

function documentChapterFromRow(row: DocumentChapterRow): DocumentChapterRecord {
  return {
    id: row.id,
    documentId: row.document_id,
    title: row.title,
    sortOrder: normalizeNumber(row.sort_order, 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function documentPageFromRow(row: DocumentPageRow): DocumentPageRecord {
  return {
    id: row.id,
    documentId: row.document_id,
    chapterId: row.chapter_id,
    sortOrder: normalizeNumber(row.sort_order, 0),
    pageNumber: normalizeNumber(row.page_number, 1),
    sourcePageNumber: normalizeNullableNumber(row.source_page_number),
    title: row.title,
    text: row.text,
    wordCount: normalizeNumber(row.word_count, 0),
    reviewStatus: normalizeOcrReviewStatus(row.review_status),
    ocrConfidence: normalizeNullableNumber(row.ocr_confidence),
    ocrNotes: row.ocr_notes,
    uncertainSpans: normalizeUncertainSpans(parseNullableJson<unknown>(row.uncertain_spans_json, [])),
    sourceFileId: row.source_file_id,
    sourceFileName: row.source_file_name,
    sourceKind: normalizeSourceFileKind(row.source_kind),
    sourceLocalPath: row.source_local_path,
    sourceSha256: row.source_sha256,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function ocrJobFromRow(row: OcrJobRow): OcrJob {
  return {
    id: row.id,
    documentId: row.document_id,
    targetChapterId: row.target_chapter_id,
    status: normalizeOcrJobStatus(row.status),
    concurrentItemLimit: normalizeOcrConcurrentItemLimit(row.concurrent_item_limit),
    processingMode: normalizeOcrProcessingMode(row.processing_mode),
    modelId: row.model_id,
    inputFileCount: normalizeNumber(row.input_file_count, 0),
    promptVersion: row.prompt_version,
    warnings: normalizeStringArray(parseNullableJson<unknown>(row.warnings_json, [])),
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    completedAt: row.completed_at,
  }
}

function ocrBatchRunFromRow(row: OcrBatchRunRow): OcrBatchRun {
  return {
    id: row.id,
    jobId: row.job_id,
    stage: normalizeOcrBatchStage(row.stage),
    status: normalizeOcrBatchRunStatus(row.status),
    providerBatchName: row.provider_batch_name,
    providerState: row.provider_state,
    requestCount: normalizeNumber(row.request_count, 0),
    completedRequestCount: normalizeNumber(row.completed_request_count, 0),
    failedRequestCount: normalizeNumber(row.failed_request_count, 0),
    itemIds: normalizeStringArray(parseNullableJson<unknown>(row.item_ids_json, [])),
    remoteFileNames: normalizeStringArray(parseNullableJson<unknown>(row.remote_file_names_json, [])),
    errorMessage: row.error_message,
    cleanupWarning: row.cleanup_warning,
    createdAt: row.created_at,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at || row.created_at,
    completedAt: row.completed_at,
    lastPolledAt: row.last_polled_at,
  }
}

function ocrJobItemFromRow(row: OcrJobItemRow): OcrJobItem {
  return {
    id: row.id,
    jobId: row.job_id,
    orderIndex: normalizeNumber(row.order_index, 0),
    sourceFileName: row.source_file_name,
    sourceFileType: row.source_file_type,
    sourceFileSize: normalizeNumber(row.source_file_size, 0),
    sourceFileLastModified: normalizeNumber(row.source_file_last_modified, 0),
    sourcePageNumber: normalizeNullableNumber(row.source_page_number),
    title: row.title,
    status: normalizeOcrJobItemStatus(row.status),
    ocrText: row.ocr_text,
    pages: normalizeOcrJobItemPages(parseNullableJson<unknown>(row.pages_json, [])),
    warnings: normalizeStringArray(parseNullableJson<unknown>(row.warnings_json, [])),
    failureReason: row.failure_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function readingSessionFromRow(row: ReadingSessionRow): ReadingSession {
  return {
    id: row.id,
    documentId: row.document_id,
    scopeType: normalizeReadingScopeType(row.scope_type),
    scopeLabel: row.scope_label,
    chapterId: row.chapter_id,
    chapterTitle: row.chapter_title,
    pageIds: normalizeStringArray(parseNullableJson<unknown>(row.page_ids_json, [])),
    pageNumbers: normalizeNumberArray(parseNullableJson<unknown>(row.page_numbers_json, [])),
    sourcePageNumbers: normalizeNullableNumberArray(parseNullableJson<unknown>(row.source_page_numbers_json, [])),
    mode: normalizeReaderMode(row.mode),
    targetWpm: normalizeNumber(row.target_wpm, 0),
    actualWpm: normalizeNumber(row.actual_wpm, 0),
    adjustedWpm: normalizeNullableNumber(row.adjusted_wpm),
    wordsRead: normalizeNumber(row.words_read, 0),
    durationSeconds: normalizeNumber(row.duration_seconds, 0),
    startPosition: normalizeNumber(row.start_position, 0),
    endPosition: normalizeNumber(row.end_position, 0),
    pauseCount: normalizeNumber(row.pause_count, 0),
    regressionCount: normalizeNumber(row.regression_count, 0),
    comprehensionScore: normalizeNullableNumber(row.comprehension_score),
    selfRating: normalizeNullableNumber(row.self_rating),
    notes: row.notes ?? '',
    startedAt: row.started_at,
    endedAt: row.ended_at,
  }
}

function aiUsageLineItemFromRow(row: AiUsageLineItemRow): AiUsageLineItem {
  return {
    id: row.id,
    documentId: row.document_id,
    ocrJobId: row.ocr_job_id,
    ocrItemId: row.ocr_item_id,
    sourceFileName: row.source_file_name,
    stage: row.stage,
    billingMode: normalizeAiBillingMode(row.billing_mode),
    provider: row.provider,
    model: row.model,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    failureMessage: row.failure_message,
    rawProviderMetadata: parseNullableJson<Record<string, unknown> | null>(row.raw_provider_metadata_json, null),
    tokenBreakdown: normalizeTokenBreakdown(parseNullableJson<Partial<AiUsageTokenBreakdown>>(row.token_breakdown_json, {})),
    pricingSnapshot: normalizePricingSnapshot(
      parseNullableJson<Partial<AiPricingSnapshot> | null>(row.pricing_snapshot_json, null),
    ),
  }
}

function quizAttemptFromRow(row: QuizAttemptRow): QuizAttempt {
  return {
    id: row.id,
    documentId: row.document_id,
    readingSessionId: row.reading_session_id,
    kind: normalizeQuizAttemptKind(row.kind),
    scopeType: normalizeReadingScopeType(row.scope_type),
    scopeLabel: row.scope_label,
    chapterId: row.chapter_id,
    chapterTitle: row.chapter_title,
    pageIds: normalizeStringArray(parseNullableJson<unknown>(row.page_ids_json, [])),
    pageNumbers: normalizeNumberArray(parseNullableJson<unknown>(row.page_numbers_json, [])),
    sourcePageNumbers: normalizeNullableNumberArray(parseNullableJson<unknown>(row.source_page_numbers_json, [])),
    startWordIndex: normalizeNumber(row.start_word_index, 0),
    endWordIndex: normalizeNumber(row.end_word_index, 0),
    wordCount: normalizeNumber(row.word_count, 0),
    durationSeconds: normalizeNumber(row.duration_seconds, 0),
    targetWpm: normalizeNumber(row.target_wpm, 0),
    rawWpm: normalizeNumber(row.raw_wpm, 0),
    adjustedWpm: normalizeNumber(row.adjusted_wpm, 0),
    comprehensionPercent: normalizeNumber(row.comprehension_percent, 0),
    recommendedWpm: normalizeNumber(row.recommended_wpm, 0),
    explanation: row.explanation,
    questionResults: parseNullableJson<BaselineQuestionResult[]>(row.question_results_json, []),
    questions: parseNullableJson<QuizQuestionReview[]>(row.questions_json, []),
    createdAt: row.created_at,
  }
}

function normalizeSourceType(sourceType: string): SourceType {
  if (sourceType === 'text_file' || sourceType === 'pdf_text' || sourceType === 'photo_ocr' || sourceType === 'manual') {
    return sourceType
  }
  return 'paste'
}

function normalizeReaderMode(mode: string): ReadingSession['mode'] {
  if (mode === 'chunk' || mode === 'rsvp') {
    return mode
  }
  return 'rail'
}

function normalizeOcrReviewStatus(status: string | null | undefined): OcrReviewStatus {
  if (status === 'unreviewed' || status === 'needs_attention') {
    return status
  }
  return 'reviewed'
}

function normalizeSourceFileKind(kind: string | null | undefined): SourceFileRecord['kind'] | null {
  if (kind === 'image' || kind === 'pdf' || kind === 'text') {
    return kind
  }
  return null
}

function normalizeOcrJobStatus(status: string): OcrJob['status'] {
  if (status === 'queued' || status === 'running' || status === 'review' || status === 'saved' || status === 'failed') {
    return status
  }
  return 'cancelled'
}

function normalizeOcrProcessingMode(mode: string | null | undefined): OcrJob['processingMode'] {
  return mode === 'batch' ? 'batch' : 'interactive'
}

function normalizeOcrBatchStage(stage: string | null | undefined): OcrBatchRun['stage'] {
  if (stage === 'cleaner' || stage === 'formatter') {
    return stage
  }
  return 'ocr'
}

function normalizeOcrBatchRunStatus(status: string | null | undefined): OcrBatchRun['status'] {
  if (
    status === 'creating' ||
    status === 'submitted' ||
    status === 'running' ||
    status === 'succeeded' ||
    status === 'failed' ||
    status === 'cancelled' ||
    status === 'expired'
  ) {
    return status
  }
  return 'creating'
}

function normalizeAiBillingMode(mode: string | null | undefined): AiUsageLineItem['billingMode'] {
  return mode === 'batch' ? 'batch' : 'interactive'
}

function normalizeOcrConcurrentItemLimit(value: unknown): number {
  return Math.min(25, Math.max(1, Math.round(normalizeNumber(value, 10))))
}

function normalizeOcrJobItemStatus(status: string): OcrJobItem['status'] {
  if (status === 'queued' || status === 'running' || status === 'review' || status === 'failed') {
    return status
  }
  return 'skipped'
}

function normalizeQuizAttemptKind(kind: string): QuizAttemptKind {
  if (kind === 'manual' || kind === 'retest') {
    return kind
  }
  return 'generated'
}

function normalizeReadingScopeType(scopeType: string | null | undefined): ReadingScopeType {
  if (scopeType === 'chapter' || scopeType === 'pages') {
    return scopeType
  }
  return 'document'
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function normalizeUncertainSpans(value: unknown): OcrUncertainSpan[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((span) => {
    const candidate = span as Partial<OcrUncertainSpan>
    return {
      text: typeof candidate.text === 'string' ? candidate.text : '',
      startIndex: normalizeNullableNumber(candidate.startIndex),
      endIndex: normalizeNullableNumber(candidate.endIndex),
      confidence: normalizeNullableNumber(candidate.confidence),
      note: typeof candidate.note === 'string' ? candidate.note : null,
    }
  })
}

function normalizeOcrJobItemPages(value: unknown): OcrJobItemPage[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((page) => {
    const candidate = page as Partial<OcrJobItemPage>
    return {
      pageNumber: normalizeNumber(candidate.pageNumber, 1),
      sourcePageNumber: normalizeNullableNumber(candidate.sourcePageNumber),
      title: typeof candidate.title === 'string' ? candidate.title : null,
      text: typeof candidate.text === 'string' ? candidate.text : '',
      reviewStatus:
        candidate.reviewStatus === 'skipped' ? 'skipped' : normalizeOcrReviewStatus(candidate.reviewStatus),
      ocrConfidence: normalizeNullableNumber(candidate.ocrConfidence),
      ocrNotes: typeof candidate.ocrNotes === 'string' ? candidate.ocrNotes : null,
      uncertainSpans: normalizeUncertainSpans(candidate.uncertainSpans),
      sourceFileName: typeof candidate.sourceFileName === 'string' ? candidate.sourceFileName : null,
      sourceKind: normalizeSourceFileKind(candidate.sourceKind),
    }
  })
}

function normalizeNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item)) : []
}

function normalizeNullableNumberArray(value: unknown): Array<number | null> {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === 'number' && Number.isFinite(item) ? item : null))
    : []
}

function addNullableFilter(
  where: string[],
  parameters: Array<string | null>,
  column: string,
  value: string | null | undefined,
): void {
  if (value === undefined) {
    return
  }
  if (value === null) {
    where.push(`${column} IS NULL`)
    return
  }
  parameters.push(value)
  where.push(`${column} = $${parameters.length}`)
}

function addValueFilter(
  where: string[],
  parameters: Array<string | null>,
  column: string,
  value: string | undefined,
): void {
  if (value === undefined) {
    return
  }
  parameters.push(value)
  where.push(`${column} = $${parameters.length}`)
}

function stringifyNullableJson(value: unknown | null): string | null {
  return value === null ? null : JSON.stringify(value)
}

function parseNullableJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback
  }
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function normalizeTokenBreakdown(value: Partial<AiUsageTokenBreakdown> | null): AiUsageTokenBreakdown {
  return {
    inputTokens: normalizeNullableNumber(value?.inputTokens),
    outputTokens: normalizeNullableNumber(value?.outputTokens),
    thinkingTokens: normalizeNullableNumber(value?.thinkingTokens),
    totalTokens: normalizeNullableNumber(value?.totalTokens),
    cachedInputTokens: normalizeNullableNumber(value?.cachedInputTokens),
    textInputTokens: normalizeNullableNumber(value?.textInputTokens),
    imageInputTokens: normalizeNullableNumber(value?.imageInputTokens),
    audioInputTokens: normalizeNullableNumber(value?.audioInputTokens),
    videoInputTokens: normalizeNullableNumber(value?.videoInputTokens),
    documentInputTokens: normalizeNullableNumber(value?.documentInputTokens),
    textOutputTokens: normalizeNullableNumber(value?.textOutputTokens),
    imageOutputTokens: normalizeNullableNumber(value?.imageOutputTokens),
    audioOutputTokens: normalizeNullableNumber(value?.audioOutputTokens),
    videoOutputTokens: normalizeNullableNumber(value?.videoOutputTokens),
    documentOutputTokens: normalizeNullableNumber(value?.documentOutputTokens),
    cachedTextInputTokens: normalizeNullableNumber(value?.cachedTextInputTokens),
    cachedImageInputTokens: normalizeNullableNumber(value?.cachedImageInputTokens),
    cachedAudioInputTokens: normalizeNullableNumber(value?.cachedAudioInputTokens),
    cachedVideoInputTokens: normalizeNullableNumber(value?.cachedVideoInputTokens),
    cachedDocumentInputTokens: normalizeNullableNumber(value?.cachedDocumentInputTokens),
  }
}

function normalizePricingSnapshot(value: Partial<AiPricingSnapshot> | null): AiPricingSnapshot | null {
  if (!value) {
    return null
  }

  return {
    effectiveDate: typeof value.effectiveDate === 'string' ? value.effectiveDate : null,
    modelId: typeof value.modelId === 'string' ? value.modelId : null,
    currency: typeof value.currency === 'string' ? value.currency : null,
    billingMode: value.billingMode === 'batch' ? 'batch' : 'interactive',
    costMultiplier: typeof value.costMultiplier === 'number' && Number.isFinite(value.costMultiplier) ? value.costMultiplier : 1,
    inputRatePerMillionTokens: normalizeNullableNumber(value.inputRatePerMillionTokens),
    outputRatePerMillionTokens: normalizeNullableNumber(value.outputRatePerMillionTokens),
    thinkingRatePerMillionTokens: normalizeNullableNumber(value.thinkingRatePerMillionTokens),
    estimatedInputCost: normalizeNullableNumber(value.estimatedInputCost),
    estimatedOutputCost: normalizeNullableNumber(value.estimatedOutputCost),
    estimatedThinkingCost: normalizeNullableNumber(value.estimatedThinkingCost),
    estimatedTotalCost: normalizeNullableNumber(value.estimatedTotalCost),
    confidence:
      value.confidence === 'exact' || value.confidence === 'estimated' || value.confidence === 'unknown'
        ? value.confidence
        : 'unknown',
  }
}

function normalizeNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
