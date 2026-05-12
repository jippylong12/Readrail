import type { DocumentChapterRecord, DocumentPageRecord, DocumentRecord, QuizAttempt, ReadingSession } from '../../types/domain'
import { getOrderedDocumentPages } from '../../app/structuredDocuments'

export type ProgressExportInput = {
  documents: DocumentRecord[]
  sessions: ReadingSession[]
  quizAttempts: QuizAttempt[]
  documentChapters: DocumentChapterRecord[]
  documentPages: DocumentPageRecord[]
}

export function exportProgressJson(input: ProgressExportInput): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      documents: input.documents,
      sessions: input.sessions,
      quizAttempts: input.quizAttempts,
      documentChapters: input.documentChapters,
      documentPages: input.documentPages,
    },
    null,
    2,
  )
}

export function exportProgressCsv(input: ProgressExportInput): string {
  const documentById = new Map(input.documents.map((document) => [document.id, document]))
  const header = [
    'session_id',
    'document_id',
    'document_title',
    'scope_type',
    'scope_label',
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
    'chapter_ids',
    'chapter_titles',
    'page_numbers',
    'source_page_numbers',
    'page_titles',
    'record_type',
    'attempt_id',
    'attempt_kind',
    'attempt_scope_type',
    'attempt_scope_label',
    'attempt_chapter_id',
    'attempt_chapter_title',
    'attempt_page_ids',
    'attempt_page_numbers',
    'attempt_source_page_numbers',
    'attempt_start_word_index',
    'attempt_end_word_index',
    'attempt_word_count',
    'attempt_duration_seconds',
    'attempt_target_wpm',
    'attempt_raw_wpm',
    'attempt_adjusted_wpm',
    'attempt_comprehension_percent',
    'attempt_recommended_wpm',
    'attempt_explanation',
    'attempt_created_at',
  ]

  const rows = input.sessions.map((session) => {
    const document = documentById.get(session.documentId)
    const context = document ? getSessionStructuredContext(session, document, input.documentChapters, input.documentPages) : null

    return [
      session.id,
      session.documentId,
      document?.title ?? '',
      session.scopeType ?? 'document',
      session.scopeLabel ?? '',
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
      context?.chapterIds.join(';') ?? '',
      context?.chapterTitles.join(';') ?? '',
      context?.pageNumbers.join(';') ?? '',
      context?.sourcePageNumbers.join(';') ?? '',
      context?.pageTitles.join(';') ?? '',
      'session',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]
      .map(csvEscape)
      .join(',')
  })

  const attemptRows = input.quizAttempts.map((attempt) => {
    const document = documentById.get(attempt.documentId)

    return [
      '',
      attempt.documentId,
      document?.title ?? '',
      attempt.scopeType ?? 'document',
      attempt.scopeLabel ?? '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      attempt.chapterId ?? '',
      attempt.chapterTitle ?? '',
      attempt.pageNumbers.join(';'),
      attempt.sourcePageNumbers.map((pageNumber) => pageNumber?.toString() ?? '').join(';'),
      '',
      'attempt',
      attempt.id,
      attempt.kind,
      attempt.scopeType ?? 'document',
      attempt.scopeLabel ?? '',
      attempt.chapterId ?? '',
      attempt.chapterTitle ?? '',
      attempt.pageIds.join(';'),
      attempt.pageNumbers.join(';'),
      attempt.sourcePageNumbers.map((pageNumber) => pageNumber?.toString() ?? '').join(';'),
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
      attempt.createdAt,
    ]
      .map(csvEscape)
      .join(',')
  })

  return [header.join(','), ...rows, ...attemptRows].join('\n')
}

function getSessionStructuredContext(
  session: ReadingSession,
  document: DocumentRecord,
  chapters: DocumentChapterRecord[],
  pages: DocumentPageRecord[],
): {
  chapterIds: string[]
  chapterTitles: string[]
  pageNumbers: string[]
  sourcePageNumbers: string[]
  pageTitles: string[]
} {
  const orderedPages = getOrderedDocumentPages(document.id, chapters, pages)
  const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]))
  if (session.scopeType && session.scopeType !== 'document') {
    const matchingPages = session.pageIds?.length
      ? session.pageIds
          .map((pageId) => orderedPages.find((page) => page.id === pageId))
          .filter((page): page is DocumentPageRecord => Boolean(page))
      : []
    return {
      chapterIds: session.chapterId ? [session.chapterId] : uniqueStrings(matchingPages.map((page) => page.chapterId)),
      chapterTitles: session.chapterTitle ? [session.chapterTitle] : uniqueStrings(matchingPages.map((page) => chapterById.get(page.chapterId)?.title ?? '')),
      pageNumbers: session.pageNumbers?.map(String) ?? matchingPages.map((page) => String(page.pageNumber)),
      sourcePageNumbers: session.sourcePageNumbers?.map((pageNumber) => pageNumber?.toString() ?? '') ?? matchingPages.map((page) => page.sourcePageNumber?.toString() ?? ''),
      pageTitles: matchingPages.map((page) => page.title ?? ''),
    }
  }
  const sessionStart = Math.max(0, session.startPosition)
  const sessionEnd = Math.max(sessionStart, session.endPosition)
  let wordCursor = 0
  const matchingPages: DocumentPageRecord[] = []

  for (const page of orderedPages) {
    const pageStart = wordCursor
    const pageEnd = pageStart + page.wordCount
    wordCursor = pageEnd

    if (page.wordCount === 0) {
      continue
    }

    if (pageEnd > sessionStart && pageStart < sessionEnd) {
      matchingPages.push(page)
    }
  }

  return {
    chapterIds: uniqueStrings(matchingPages.map((page) => page.chapterId)),
    chapterTitles: uniqueStrings(matchingPages.map((page) => chapterById.get(page.chapterId)?.title ?? '')),
    pageNumbers: matchingPages.map((page) => String(page.pageNumber)),
    sourcePageNumbers: matchingPages.map((page) => page.sourcePageNumber?.toString() ?? ''),
    pageTitles: matchingPages.map((page) => page.title ?? ''),
  }
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index) => value && values.indexOf(value) === index)
}

function csvEscape(value: string | number): string {
  const text = String(value)
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }

  return text
}
