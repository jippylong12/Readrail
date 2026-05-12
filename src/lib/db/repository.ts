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
  OcrJob,
  OcrJobItem,
  QuizAttempt,
  QuizAttemptKind,
  QuizQuestionReview,
  ReadingScopeType,
  ReadingSession,
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
      id, document_id, target_chapter_id, status, model_id, input_file_count, prompt_version,
      warnings_json, error_message, created_at, updated_at, completed_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT(id) DO UPDATE SET
      document_id = excluded.document_id,
      target_chapter_id = excluded.target_chapter_id,
      status = excluded.status,
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

export async function saveAiUsageLineItemToDatabase(lineItem: AiUsageLineItem): Promise<void> {
  const database = await getDatabase()
  if (!database) {
    return
  }

  await database.execute(
    `INSERT INTO ai_usage_line_items (
      id, document_id, ocr_job_id, ocr_item_id, source_file_name, stage, provider, model,
      status, started_at, completed_at, failure_message, raw_provider_metadata_json,
      token_breakdown_json, pricing_snapshot_json
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    ON CONFLICT(id) DO UPDATE SET
      document_id = excluded.document_id,
      ocr_job_id = excluded.ocr_job_id,
      ocr_item_id = excluded.ocr_item_id,
      source_file_name = excluded.source_file_name,
      stage = excluded.stage,
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

type AiUsageLineItemRow = {
  id: string
  document_id: string | null
  ocr_job_id: string | null
  ocr_item_id: string | null
  source_file_name: string | null
  stage: AiUsageStage
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

function aiUsageLineItemFromRow(row: AiUsageLineItemRow): AiUsageLineItem {
  return {
    id: row.id,
    documentId: row.document_id,
    ocrJobId: row.ocr_job_id,
    ocrItemId: row.ocr_item_id,
    sourceFileName: row.source_file_name,
    stage: row.stage,
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
