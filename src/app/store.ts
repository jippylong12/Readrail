import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AiPricingSnapshot,
  AiUsageLineItem,
  AiUsageStage,
  AiUsageStatus,
  AiUsageTokenBreakdown,
  AppSettings,
  BaselineAssessmentResult,
  CoachingState,
  DocumentChapterRecord,
  DocumentPageRecord,
  DocumentRecord,
  OcrJob,
  OcrJobItem,
  OcrJobItemPage,
  OcrReviewStatus,
  OcrUncertainSpan,
  OnboardingState,
  PageLayout,
  ReaderMode,
  ReaderResumeMemory,
  ReaderResumeSlot,
  ReaderResumeSlotInput,
  ReadingSession,
  ReadingScopeType,
  SourceType,
  TourProgressState,
  QuizAttempt,
  QuizAttemptKind,
} from '../types/domain'
import { runGeminiOcrFromFiles } from '../lib/ai/geminiOcr'
import type { OcrPipelineProgress, OcrPipelineStage, OcrResultPage } from '../lib/ai/geminiOcr'
import { stripImageMetadata } from '../lib/files/imageMetadata'
import { calculateAdjustedWpm, calculateActualWpm } from '../lib/reading/pacing'
import { cleanReadingText } from '../lib/text/cleanup'
import { countWords, estimatePages } from '../lib/text/wordCount'
import {
  clearDurableStateFromDatabase,
  deleteDocumentPageFromDatabase,
  loadDurableStateFromDatabase,
  saveAiUsageLineItemToDatabase,
  saveDocumentToDatabase,
  saveOcrJobToDatabase,
  saveQuizAttemptToDatabase,
  saveSessionToDatabase,
} from '../lib/db/repository'
import type { AiUsageLineItemQuery } from '../lib/db/repository'
import {
  STRUCTURED_DOCUMENT_VERSION,
  createDefaultDocumentStructure,
  defaultDocumentChapterId,
  defaultDocumentPageId,
  ensureStructuredDocumentCollections,
  getOrderedDocumentChapters,
  normalizeDocumentStructureOrder,
  renderStructuredContent,
} from './structuredDocuments'
import type { ReaderSessionScopeMetadata } from './readerScopes'

type CreateDocumentInput = {
  title: string
  content: string
  sourceType: SourceType
  chapterTitle?: string
  pageTitle?: string | null
  sourcePageNumber?: number | null
}

export type OcrPageInput = {
  pageNumber: number
  text: string
  title?: string | null
  reviewStatus: OcrReviewStatus
  sourcePageNumber: number | null
  ocrConfidence: number | null
  ocrNotes: string | null
  uncertainSpans: OcrUncertainSpan[]
  sourceFileName: string | null
  sourceKind: DocumentPageRecord['sourceKind']
}

type CreateOcrDocumentInput = {
  title: string
  pages: OcrPageInput[]
}

export type OcrFileInput = {
  file: File
  title: string
  sourcePageNumber: number | null
}

export type OcrStageState = OcrPipelineProgress['status'] | 'pending'

export type OcrRuntimeJobState = {
  jobId: string
  filesByItemId: Record<string, File>
  progressMessage: string
  progressState: Record<OcrPipelineStage, OcrStageState>
  titleGuess: string | null
  documentTitle: string
  error: string | null
}

type StartOcrJobInput = {
  files: OcrFileInput[]
  documentId: string | null
  targetChapterId: string | null
  loadApiKey: () => Promise<string | null>
  stripImageMetadataBeforeOcr: boolean
}

type RetryOcrJobItemInput = {
  loadApiKey: () => Promise<string | null>
  stripImageMetadataBeforeOcr: boolean
}

type CompleteSessionInput = {
  documentId: string
  scope?: ReaderSessionScopeMetadata
  mode: ReaderMode
  targetWpm: number
  wordsRead: number
  durationSeconds: number
  startPosition?: number
  endPosition?: number
  pauseCount: number
  regressionCount: number
  comprehensionScore: number | null
  selfRating: number | null
  notes: string
}

export type CreateAiUsageLineItemInput = {
  id?: string
  documentId?: string | null
  ocrJobId?: string | null
  ocrItemId?: string | null
  sourceFileName?: string | null
  stage: AiUsageStage
  provider: string
  model: string
  status?: AiUsageStatus
  startedAt?: string
  completedAt?: string | null
  failureMessage?: string | null
  rawProviderMetadata?: Record<string, unknown> | null
  tokenBreakdown?: Partial<AiUsageTokenBreakdown> | null
  pricingSnapshot?: AiPricingSnapshot | null
}

export type UpdateAiUsageLineItemInput = Partial<
  Omit<AiUsageLineItem, 'id' | 'rawProviderMetadata' | 'tokenBreakdown' | 'pricingSnapshot'>
> & {
  rawProviderMetadata?: Record<string, unknown> | null
  tokenBreakdown?: Partial<AiUsageTokenBreakdown> | null
  pricingSnapshot?: AiPricingSnapshot | null
}

type AppState = {
  documents: DocumentRecord[]
  documentChapters: DocumentChapterRecord[]
  documentPages: DocumentPageRecord[]
  ocrJobs: OcrJob[]
  ocrJobItems: OcrJobItem[]
  ocrRuntimeJobs: Record<string, OcrRuntimeJobState>
  sessions: ReadingSession[]
  activeDocumentId: string | null
  settings: AppSettings
  onboarding: OnboardingState
  tourProgress: TourProgressState
  baselineResult: BaselineAssessmentResult | null
  quizAttempts: QuizAttempt[]
  coaching: CoachingState
  aiUsageLineItems: AiUsageLineItem[]
  createDocument: (input: CreateDocumentInput) => DocumentRecord
  createOcrDocument: (input: CreateOcrDocumentInput) => DocumentRecord
  appendOcrPagesToDocument: (
    documentId: string,
    pages: OcrPageInput[],
    targetChapterId?: string | null,
  ) => DocumentRecord | null
  saveOcrJob: (job: OcrJob, items: OcrJobItem[]) => void
  createAiUsageLineItem: (input: CreateAiUsageLineItemInput) => AiUsageLineItem
  updateAiUsageLineItem: (id: string, updates: UpdateAiUsageLineItemInput) => AiUsageLineItem | null
  queryAiUsageLineItems: (query?: AiUsageLineItemQuery) => AiUsageLineItem[]
  startOcrJob: (input: StartOcrJobInput) => string | null
  retryOcrJobItem: (jobId: string, itemId: string, input: RetryOcrJobItemInput) => void
  replaceOcrJobItemFile: (jobId: string, itemId: string, file: File, input: RetryOcrJobItemInput) => void
  skipOcrJobItem: (jobId: string, itemId: string) => void
  approveAllOcrJobReviewPages: (jobId: string) => void
  updateOcrJobPage: (jobId: string, itemId: string, pageNumber: number, updates: Partial<OcrJobItemPage>) => void
  markOcrJobSaved: (jobId: string) => void
  setOcrJobDocumentTitle: (jobId: string, title: string) => void
  recoverInterruptedOcrJobs: () => void
  createChapter: (documentId: string, title?: string) => DocumentChapterRecord | null
  renameChapter: (chapterId: string, title: string) => void
  moveChapter: (documentId: string, chapterId: string, direction: -1 | 1) => void
  deleteChapter: (chapterId: string) => boolean
  movePage: (pageId: string, targetChapterId: string, targetIndex: number) => void
  deletePage: (pageId: string) => boolean
  deletePages: (pageIds: string[]) => number
  updatePageMetadata: (
    pageId: string,
    updates: Partial<Pick<DocumentPageRecord, 'ocrNotes' | 'reviewStatus' | 'sourcePageNumber' | 'text' | 'title'>>,
  ) => void
  updateDocument: (id: string, updates: Partial<Pick<DocumentRecord, 'title' | 'content'>>) => void
  archiveDocument: (id: string) => void
  setActiveDocument: (id: string | null) => void
  completeSession: (input: CompleteSessionInput) => ReadingSession
  updateSettings: (settings: Partial<AppSettings>) => void
  saveBaselineResult: (result: BaselineAssessmentResult) => void
  skipOnboarding: () => void
  completeOnboardingIntro: () => void
  reopenOnboarding: () => void
  completeTour: (tourId: string) => void
  resetTour: (tourId: string) => void
  resetAllTours: () => void
  addQuizAttempt: (attempt: QuizAttempt) => void
  resetCoachingSegment: (documentId: string, wordIndex: number) => void
  startCoachingSegment: (documentId: string, segment: CoachingState['activeSegmentByDocument'][string]) => void
  updateReaderResume: (documentId: string, slot: ReaderResumeSlotInput) => void
  resetAllData: () => void
  recoverDurableStateFromDatabase: () => Promise<boolean>
}

const defaultSettings: AppSettings = {
  reader: {
    defaultWpm: 250,
    defaultMode: 'rail',
    defaultPageLayout: 1 as PageLayout,
    chunkSize: 4,
    fontFamily: 'system',
    fontSize: 20,
    lineHeight: 1.65,
    theme: 'system',
    reducedMotion: false,
  },
  privacy: {
    retainSourceImages: false,
    confirmRemoteOcrEachTime: true,
    stripImageMetadataBeforeOcr: true,
  },
  ocr: {
    modelId: 'gemini-3.1-flash-lite',
    preservePageBreaks: true,
  },
}

const OCR_PROMPT_VERSION = 'structured-import-v1'
const OCR_MODEL_ID = 'gemini-3.1-flash-lite'
const OCR_INTERRUPTED_MESSAGE = 'OCR was interrupted while the app was closed. Replace the file to retry or skip this item.'

export const OCR_PROGRESS_STEPS: Array<{ stage: OcrPipelineStage; label: string }> = [
  { stage: 'ocr', label: 'OCR' },
  { stage: 'cleaner', label: 'Cleaner' },
  { stage: 'formatter', label: 'Formatter' },
]

export const initialOcrProgressState: Record<OcrPipelineStage, OcrStageState> = {
  ocr: 'pending',
  cleaner: 'pending',
  formatter: 'pending',
}

export const defaultOnboardingState: OnboardingState = {
  status: 'not_started',
  skippedAt: null,
  introCompletedAt: null,
}

export const defaultTourProgressState: TourProgressState = {
  completedTourIds: [],
}

export const defaultAiUsageTokenBreakdown: AiUsageTokenBreakdown = {
  inputTokens: null,
  outputTokens: null,
  thinkingTokens: null,
  totalTokens: null,
  cachedInputTokens: null,
  textInputTokens: null,
  imageInputTokens: null,
  audioInputTokens: null,
  videoInputTokens: null,
  documentInputTokens: null,
  textOutputTokens: null,
  imageOutputTokens: null,
  audioOutputTokens: null,
  videoOutputTokens: null,
  documentOutputTokens: null,
  cachedTextInputTokens: null,
  cachedImageInputTokens: null,
  cachedAudioInputTokens: null,
  cachedVideoInputTokens: null,
  cachedDocumentInputTokens: null,
}

function buildAiUsageLineItem(input: CreateAiUsageLineItemInput): AiUsageLineItem {
  return {
    id: input.id ?? crypto.randomUUID(),
    documentId: input.documentId ?? null,
    ocrJobId: input.ocrJobId ?? null,
    ocrItemId: input.ocrItemId ?? null,
    sourceFileName: input.sourceFileName ?? null,
    stage: input.stage,
    provider: input.provider,
    model: input.model,
    status: input.status ?? 'running',
    startedAt: input.startedAt ?? new Date().toISOString(),
    completedAt: input.completedAt ?? null,
    failureMessage: input.failureMessage ?? null,
    rawProviderMetadata: input.rawProviderMetadata ?? null,
    tokenBreakdown: mergeAiUsageTokenBreakdown(undefined, input.tokenBreakdown),
    pricingSnapshot: input.pricingSnapshot ?? null,
  }
}

function mergeAiUsageLineItem(
  lineItem: AiUsageLineItem,
  updates: UpdateAiUsageLineItemInput,
): AiUsageLineItem {
  return {
    ...lineItem,
    ...updates,
    rawProviderMetadata:
      updates.rawProviderMetadata === undefined ? lineItem.rawProviderMetadata : updates.rawProviderMetadata,
    tokenBreakdown: mergeAiUsageTokenBreakdown(lineItem.tokenBreakdown, updates.tokenBreakdown),
    pricingSnapshot: updates.pricingSnapshot === undefined ? lineItem.pricingSnapshot : updates.pricingSnapshot,
  }
}

function mergeAiUsageTokenBreakdown(
  current: AiUsageTokenBreakdown | undefined,
  updates: Partial<AiUsageTokenBreakdown> | null | undefined,
): AiUsageTokenBreakdown {
  const base = current ?? defaultAiUsageTokenBreakdown
  if (updates === undefined) {
    return { ...base }
  }
  if (updates === null) {
    return { ...defaultAiUsageTokenBreakdown }
  }
  return {
    ...base,
    ...updates,
  }
}

function queryAiUsageLineItemsFromState(
  lineItems: AiUsageLineItem[],
  query: AiUsageLineItemQuery = {},
): AiUsageLineItem[] {
  return lineItems
    .filter((lineItem) => query.documentId === undefined || lineItem.documentId === query.documentId)
    .filter((lineItem) => query.ocrJobId === undefined || lineItem.ocrJobId === query.ocrJobId)
    .filter((lineItem) => query.ocrItemId === undefined || lineItem.ocrItemId === query.ocrItemId)
    .filter((lineItem) => query.stage === undefined || lineItem.stage === query.stage)
    .filter((lineItem) => query.provider === undefined || lineItem.provider === query.provider)
    .filter((lineItem) => query.model === undefined || lineItem.model === query.model)
    .filter((lineItem) => query.status === undefined || lineItem.status === query.status)
}

function buildDefaultCoachingState(recommendedWpm = defaultSettings.reader.defaultWpm): CoachingState {
  return {
    recommendedWpm,
    lastResetWordIndexByDocument: {},
    activeSegmentByDocument: {},
    readerResumeByDocument: {},
  }
}

function normalizeCoachingState(coaching: Partial<CoachingState> | undefined, fallbackWpm: number): CoachingState {
  const readerResumeByDocument = Object.fromEntries(
    Object.entries(coaching?.readerResumeByDocument ?? {}).map(([documentId, memory]) => [
      documentId,
      normalizeReaderResumeMemory(memory, fallbackWpm),
    ]),
  )

  return {
    ...buildDefaultCoachingState(fallbackWpm),
    ...(coaching ?? {}),
    lastResetWordIndexByDocument: coaching?.lastResetWordIndexByDocument ?? {},
    activeSegmentByDocument: coaching?.activeSegmentByDocument ?? {},
    readerResumeByDocument,
  }
}

function normalizeReaderResumeMemory(memory: ReaderResumeMemory | Partial<Record<ReadingScopeType, ReaderResumeSlot>> | undefined, fallbackWpm: number): ReaderResumeMemory {
  const normalizedMemory = memory as ReaderResumeMemory & Partial<Record<ReadingScopeType, ReaderResumeSlot>>
  const documentSlot = normalizedMemory.document
  const chapterSlots = normalizedMemory.chapters ?? {}
  const pageRangeSlots = normalizedMemory.pageRanges ?? {}
  const legacyChapterSlot = normalizedMemory.chapter
  const legacyPagesSlot = normalizedMemory.pages

  return {
    document: documentSlot ? normalizeReaderResumeSlot(documentSlot, fallbackWpm) : undefined,
    chapters: normalizeReaderResumeSlotMap({
      ...chapterSlots,
      ...(legacyChapterSlot?.chapterId ? { [legacyChapterSlot.chapterId]: legacyChapterSlot } : {}),
    }, fallbackWpm),
    pageRanges: normalizeReaderResumeSlotMap({
      ...pageRangeSlots,
      ...(legacyPagesSlot ? { [getReaderResumePageRangeKey(legacyPagesSlot)]: legacyPagesSlot } : {}),
    }, fallbackWpm),
  }
}

function normalizeReaderResumeSlotMap(slots: Record<string, ReaderResumeSlot>, fallbackWpm: number): Record<string, ReaderResumeSlot> | undefined {
  const normalizedSlots = Object.fromEntries(
    Object.entries(slots)
      .filter((entry): entry is [string, ReaderResumeSlot] => Boolean(entry[1]))
      .map(([key, slot]) => [key, normalizeReaderResumeSlot(slot, fallbackWpm)]),
  )

  return Object.keys(normalizedSlots).length > 0 ? normalizedSlots : undefined
}

function normalizeReaderResumeSlot(slot: ReaderResumeSlot | ReaderResumeSlotInput, fallbackWpm: number): ReaderResumeSlot {
  const wordIndex = Math.max(0, Math.round(slot.wordIndex))
  const cursorWordIndex = Math.max(0, Math.round(slot.cursorWordIndex ?? wordIndex))
  const readThroughWordIndex = Math.max(cursorWordIndex, Math.round(slot.readThroughWordIndex ?? wordIndex))
  const segmentStartWordIndex = Math.max(0, Math.round(slot.segmentStartWordIndex ?? cursorWordIndex))
  const elapsedSeconds = Math.max(0, Math.round(slot.elapsedSeconds ?? 0))
  return {
    scopeType: slot.scopeType,
    chapterId: slot.chapterId ?? null,
    startPageNumber: slot.startPageNumber ?? null,
    endPageNumber: slot.endPageNumber ?? null,
    cursorWordIndex,
    readThroughWordIndex,
    segmentStartWordIndex,
    elapsedSeconds,
    segmentStartElapsedSeconds: Math.max(0, Math.min(elapsedSeconds, Math.round(slot.segmentStartElapsedSeconds ?? 0))),
    pauseCount: Math.max(0, Math.round(slot.pauseCount ?? 0)),
    regressionCount: Math.max(0, Math.round(slot.regressionCount ?? 0)),
    wordIndex: readThroughWordIndex,
    chunkSize: Math.max(1, Math.round(slot.chunkSize)),
    mode: slot.mode ?? defaultSettings.reader.defaultMode,
    pageLayout: normalizePageLayout(slot.pageLayout ?? defaultSettings.reader.defaultPageLayout),
    targetWpm: Math.max(1, Math.round(slot.targetWpm ?? fallbackWpm)),
    updatedAt: slot.updatedAt ?? new Date().toISOString(),
  }
}

function getReaderResumePageRangeKey(slot: Pick<ReaderResumeSlot, 'chapterId' | 'endPageNumber' | 'startPageNumber'>): string {
  return `${slot.chapterId ?? 'unknown'}:${slot.startPageNumber ?? 'start'}-${slot.endPageNumber ?? slot.startPageNumber ?? 'end'}`
}

function saveReaderResumeSlot(memory: ReaderResumeMemory, slot: ReaderResumeSlot): ReaderResumeMemory {
  if (slot.scopeType === 'document') {
    return { ...memory, document: slot }
  }

  if (slot.scopeType === 'chapter' && slot.chapterId) {
    return {
      ...memory,
      chapters: {
        ...(memory.chapters ?? {}),
        [slot.chapterId]: slot,
      },
    }
  }

  if (slot.scopeType === 'pages') {
    return {
      ...memory,
      pageRanges: {
        ...(memory.pageRanges ?? {}),
        [getReaderResumePageRangeKey(slot)]: slot,
      },
    }
  }

  return memory
}

function normalizePageLayout(pageLayout: PageLayout | undefined): PageLayout {
  return ([1, 2, 3, 4] as PageLayout[]).includes(pageLayout ?? 1) ? (pageLayout ?? 1) : 1
}

function seedSessionScopeMetadata(sessions: ReadingSession[] | undefined): ReadingSession[] {
  return (sessions ?? []).map((session) => ({
    ...session,
    scopeType: session.scopeType ?? 'document',
    scopeLabel: session.scopeLabel ?? null,
    chapterId: session.chapterId ?? null,
    chapterTitle: session.chapterTitle ?? null,
    pageIds: session.pageIds ?? [],
    pageNumbers: session.pageNumbers ?? [],
    sourcePageNumbers: session.sourcePageNumbers ?? [],
  }))
}

export function normalizeQuizAttemptsForPersistence(
  attempts: QuizAttempt[] | undefined,
  sessions: ReadingSession[] | undefined,
  fallbackWpm: number,
): QuizAttempt[] {
  const sessionById = new Map((sessions ?? []).map((session) => [session.id, session]))
  return (attempts ?? []).map((attempt) => {
    const session = attempt.readingSessionId ? sessionById.get(attempt.readingSessionId) ?? null : null
    const startWordIndex = normalizeInteger(attempt.startWordIndex, session?.startPosition ?? 0)
    const endWordIndex = normalizeInteger(attempt.endWordIndex, session?.endPosition ?? attempt.wordCount ?? startWordIndex)
    const wordCount = normalizeInteger(attempt.wordCount, Math.max(0, endWordIndex - startWordIndex))

    return {
      ...attempt,
      kind: normalizeQuizAttemptKind(attempt.kind),
      scopeType: normalizeReadingScopeType(attempt.scopeType ?? session?.scopeType),
      scopeLabel: normalizeNullableString(attempt.scopeLabel ?? session?.scopeLabel),
      chapterId: normalizeNullableString(attempt.chapterId ?? session?.chapterId),
      chapterTitle: normalizeNullableString(attempt.chapterTitle ?? session?.chapterTitle),
      pageIds: normalizeStringArray(attempt.pageIds ?? session?.pageIds),
      pageNumbers: normalizeNumberArray(attempt.pageNumbers ?? session?.pageNumbers),
      sourcePageNumbers: normalizeNullableNumberArray(attempt.sourcePageNumbers ?? session?.sourcePageNumbers),
      startWordIndex,
      endWordIndex,
      wordCount,
      durationSeconds: normalizeInteger(attempt.durationSeconds, session?.durationSeconds ?? 1),
      targetWpm: normalizeInteger(attempt.targetWpm, session?.targetWpm ?? attempt.recommendedWpm ?? fallbackWpm),
      rawWpm: normalizeInteger(attempt.rawWpm, session?.actualWpm ?? 0),
      adjustedWpm: normalizeInteger(attempt.adjustedWpm, session?.adjustedWpm ?? 0),
      comprehensionPercent: normalizeInteger(attempt.comprehensionPercent, session?.comprehensionScore ?? 0),
      recommendedWpm: normalizeInteger(attempt.recommendedWpm, fallbackWpm),
      explanation: typeof attempt.explanation === 'string' ? attempt.explanation : '',
      questionResults: attempt.questionResults ?? [],
      questions: attempt.questions ?? [],
      createdAt: typeof attempt.createdAt === 'string' ? attempt.createdAt : new Date().toISOString(),
    }
  })
}

function normalizeQuizAttemptKind(kind: QuizAttemptKind | string | undefined): QuizAttemptKind {
  if (kind === 'manual' || kind === 'retest') {
    return kind
  }
  return 'generated'
}

function normalizeReadingScopeType(scopeType: ReadingScopeType | string | undefined): ReadingScopeType {
  if (scopeType === 'chapter' || scopeType === 'pages') {
    return scopeType
  }
  return 'document'
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
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

function normalizeInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : Math.round(fallback)
}

function buildOcrPages(
  documentId: string,
  chapterId: string,
  pages: OcrPageInput[],
  now: string,
  startSortOrder = 0,
  startPageNumber = 1,
): DocumentPageRecord[] {
  return pages.map((page, index) => {
    const text = cleanReadingText(page.text, { preservePageBreaks: true })
    return {
      id: crypto.randomUUID(),
      documentId,
      chapterId,
      sortOrder: startSortOrder + index,
      pageNumber: startPageNumber + index,
      sourcePageNumber: page.sourcePageNumber ?? page.pageNumber ?? null,
      title: page.title?.trim() || null,
      text,
      wordCount: countWords(text),
      reviewStatus: page.reviewStatus,
      ocrConfidence: page.ocrConfidence,
      ocrNotes: page.ocrNotes,
      uncertainSpans: page.uncertainSpans,
      sourceFileId: null,
      sourceFileName: page.sourceFileName,
      sourceKind: page.sourceKind,
      sourceLocalPath: null,
      sourceSha256: null,
      createdAt: now,
      updatedAt: now,
    }
  })
}

function rebuildDocumentFromStructure(
  document: DocumentRecord,
  chapters: DocumentChapterRecord[],
  pages: DocumentPageRecord[],
  updatedAt: string,
): {
  document: DocumentRecord
  chapters: DocumentChapterRecord[]
  pages: DocumentPageRecord[]
} {
  const normalized = normalizeDocumentStructureOrder(document.id, chapters, pages, updatedAt)
  const wordCount = normalized.pages.reduce((total, page) => total + page.wordCount, 0)
  return {
    chapters: normalized.chapters,
    pages: normalized.pages,
    document: {
      ...document,
      content: renderStructuredContent(document.id, normalized.chapters, normalized.pages),
      wordCount,
      estimatedPages: estimatePages(wordCount),
      updatedAt,
    },
  }
}

function createOcrJobRecords(
  fileInputs: OcrFileInput[],
  documentId: string | null,
  targetChapterId: string | null,
): { job: OcrJob; items: OcrJobItem[]; filesByItemId: Record<string, File> } {
  const now = new Date().toISOString()
  const jobId = crypto.randomUUID()
  const filesByItemId: Record<string, File> = {}
  const items = fileInputs.map((input, index) => {
    const itemId = crypto.randomUUID()
    filesByItemId[itemId] = input.file
    return {
      id: itemId,
      jobId,
      orderIndex: index,
      sourceFileName: input.file.name,
      sourceFileType: input.file.type,
      sourceFileSize: input.file.size,
      sourceFileLastModified: input.file.lastModified,
      sourcePageNumber: input.sourcePageNumber,
      title: input.title.trim() || null,
      status: 'queued' as const,
      ocrText: null,
      pages: [],
      warnings: [],
      failureReason: null,
      createdAt: now,
      updatedAt: now,
    }
  })

  return {
    job: {
      id: jobId,
      documentId,
      targetChapterId,
      status: 'queued',
      modelId: OCR_MODEL_ID,
      inputFileCount: fileInputs.length,
      promptVersion: OCR_PROMPT_VERSION,
      warnings: [],
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    },
    items,
    filesByItemId,
  }
}

function getOcrJobSnapshot(jobId: string): { job: OcrJob; items: OcrJobItem[] } | null {
  const state = useAppStore.getState()
  const job = state.ocrJobs.find((candidate) => candidate.id === jobId)
  if (!job) {
    return null
  }

  return {
    job,
    items: state.ocrJobItems
      .filter((item) => item.jobId === jobId)
      .sort((left, right) => left.orderIndex - right.orderIndex),
  }
}

function setOcrRuntimeState(jobId: string, updates: Partial<OcrRuntimeJobState>): void {
  useAppStore.setState((state) => {
    const currentRuntime =
      state.ocrRuntimeJobs[jobId] ??
      ({
        jobId,
        filesByItemId: {},
        progressMessage: '',
        progressState: { ...initialOcrProgressState },
        titleGuess: null,
        documentTitle: '',
        error: null,
      } satisfies OcrRuntimeJobState)

    return {
      ocrRuntimeJobs: {
        ...state.ocrRuntimeJobs,
        [jobId]: {
          ...currentRuntime,
          ...updates,
          progressState: updates.progressState ?? currentRuntime.progressState,
          filesByItemId: updates.filesByItemId ?? currentRuntime.filesByItemId,
        },
      },
    }
  })
}

async function runOcrJob(jobId: string, input: RetryOcrJobItemInput): Promise<void> {
  try {
    const apiKey = await input.loadApiKey()
    if (!apiKey) {
      throw new Error('Add a Gemini API key in Settings before running OCR.')
    }

    let snapshot = getOcrJobSnapshot(jobId)
    if (!snapshot) {
      return
    }

    for (const item of snapshot.items) {
      if (item.status !== 'queued') {
        continue
      }
      await processOcrJobItem(jobId, item.id, apiKey, input.stripImageMetadataBeforeOcr)
      snapshot = getOcrJobSnapshot(jobId)
      if (!snapshot) {
        return
      }
    }

    finalizeOcrJob(jobId)
  } catch (error) {
    const message = formatOcrErrorMessage(error)
    const snapshot = getOcrJobSnapshot(jobId)
    if (!snapshot) {
      return
    }
    const now = new Date().toISOString()
    useAppStore.getState().saveOcrJob(
      {
        ...snapshot.job,
        status: 'failed',
        errorMessage: message,
        updatedAt: now,
        completedAt: now,
      },
      snapshot.items,
    )
    setOcrRuntimeState(jobId, { error: message, progressMessage: message })
  }
}

async function processOcrJobItem(
  jobId: string,
  itemId: string,
  apiKey: string,
  shouldStripImageMetadata: boolean,
): Promise<void> {
  const startedAt = new Date().toISOString()
  const snapshot = getOcrJobSnapshot(jobId)
  const runtime = useAppStore.getState().ocrRuntimeJobs[jobId]
  const activeItem = snapshot?.items.find((item) => item.id === itemId)
  const activeFile = runtime?.filesByItemId[itemId]
  if (!snapshot || !activeItem || !activeFile) {
    markOcrItemFailed(jobId, itemId, 'Replace the source file before retrying this OCR item.')
    return
  }

  useAppStore.getState().saveOcrJob(
    { ...snapshot.job, status: 'running', errorMessage: null, updatedAt: startedAt, completedAt: null },
    snapshot.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            status: 'running',
            failureReason: null,
            warnings: [],
            pages: [],
            ocrText: null,
            updatedAt: startedAt,
          }
        : item,
    ),
  )

  const itemProgressPrefix = `Processing item ${activeItem.orderIndex + 1} of ${snapshot.items.length}`
  setOcrRuntimeState(jobId, {
    error: null,
    progressMessage: `${itemProgressPrefix}.`,
    progressState: { ...initialOcrProgressState },
  })

  try {
    const preparedFiles = await prepareFilesForOcr([activeFile], shouldStripImageMetadata)
    const result = await runGeminiOcrFromFiles(apiKey, preparedFiles.files, {
      usageAttribution: {
        documentId: snapshot.job.documentId,
        ocrJobId: jobId,
        ocrItemId: itemId,
        sourceFileName: activeItem.sourceFileName,
      },
      recordUsage: (lineItem) => {
        useAppStore.getState().createAiUsageLineItem(lineItem)
      },
      onProgress: (progress) =>
        setOcrRuntimeState(jobId, {
          progressMessage: `${itemProgressPrefix}: ${progress.message}`,
          progressState: {
            ...(useAppStore.getState().ocrRuntimeJobs[jobId]?.progressState ?? initialOcrProgressState),
            [progress.stage]: progress.status,
          },
        }),
    })
    const selectedFile = preparedFiles.files[0] ?? activeFile
    const finishedAt = new Date().toISOString()
    const pages = result.pages.map((page, pageIndex) =>
      buildOcrJobItemPage(page, activeItem, selectedFile, pageIndex, result.pages.length),
    )
    const itemWarnings = [...preparedFiles.warnings, ...result.warnings]
    const nextSnapshot = getOcrJobSnapshot(jobId)
    if (!nextSnapshot) {
      return
    }

    const nextRuntime = useAppStore.getState().ocrRuntimeJobs[jobId]
    useAppStore.getState().saveOcrJob(
      {
        ...nextSnapshot.job,
        warnings: uniqueStrings([...nextSnapshot.job.warnings, ...itemWarnings]),
        updatedAt: finishedAt,
      },
      nextSnapshot.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              status: 'review',
              pages,
              ocrText: pages.map((page) => page.text).join('\n\n\f\n\n'),
              warnings: itemWarnings,
              failureReason: null,
              updatedAt: finishedAt,
            }
          : item,
      ),
    )
    const inferredTitle = result.titleGuess || inferOcrDocumentTitle(getOcrJobSnapshot(jobId)?.items ?? [])
    setOcrRuntimeState(jobId, {
      titleGuess: nextRuntime?.titleGuess ?? result.titleGuess,
      documentTitle: nextRuntime?.documentTitle || inferredTitle,
    })
  } catch (error) {
    markOcrItemFailed(jobId, itemId, formatOcrErrorMessage(error))
  }
}

function markOcrItemFailed(jobId: string, itemId: string, failureReason: string): void {
  const snapshot = getOcrJobSnapshot(jobId)
  const failedItem = snapshot?.items.find((item) => item.id === itemId)
  if (!snapshot || !failedItem) {
    return
  }
  const failedAt = new Date().toISOString()
  useAppStore.getState().saveOcrJob(
    {
      ...snapshot.job,
      warnings: uniqueStrings([...snapshot.job.warnings, `${failedItem.sourceFileName}: ${failureReason}`]),
      updatedAt: failedAt,
    },
    snapshot.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            status: 'failed',
            failureReason,
            pages: [],
            ocrText: null,
            updatedAt: failedAt,
          }
        : item,
    ),
  )
}

function finalizeOcrJob(jobId: string): void {
  const snapshot = getOcrJobSnapshot(jobId)
  if (!snapshot) {
    return
  }

  const now = new Date().toISOString()
  const hasRunningItems = snapshot.items.some((item) => item.status === 'queued' || item.status === 'running')
  const hasReviewItems = snapshot.items.some((item) => item.status === 'review')
  const hasFailedItems = snapshot.items.some((item) => item.status === 'failed')
  const status: OcrJob['status'] = hasRunningItems ? 'running' : hasReviewItems || hasFailedItems ? 'review' : 'failed'
  useAppStore.getState().saveOcrJob(
    {
      ...snapshot.job,
      status,
      errorMessage: hasReviewItems || hasFailedItems ? null : 'No OCR pages returned.',
      updatedAt: now,
      completedAt: hasRunningItems ? null : now,
    },
    snapshot.items,
  )
  setOcrRuntimeState(jobId, {
    progressMessage: status === 'review' ? 'Ready for review.' : 'OCR finished without reviewable pages.',
  })
}

async function retryOcrJobItemInBackground(jobId: string, itemId: string, input: RetryOcrJobItemInput): Promise<void> {
  try {
    const apiKey = await input.loadApiKey()
    if (!apiKey) {
      throw new Error('Add a Gemini API key in Settings before running OCR.')
    }

    const snapshot = getOcrJobSnapshot(jobId)
    if (!snapshot) {
      return
    }
    const now = new Date().toISOString()
    useAppStore.getState().saveOcrJob(
      { ...snapshot.job, status: 'running', errorMessage: null, completedAt: null, updatedAt: now },
      snapshot.items.map((item) =>
        item.id === itemId
          ? { ...item, status: 'queued', failureReason: null, warnings: [], pages: [], ocrText: null, updatedAt: now }
          : item,
      ),
    )
    await processOcrJobItem(jobId, itemId, apiKey, input.stripImageMetadataBeforeOcr)
    finalizeOcrJob(jobId)
  } catch (error) {
    setOcrRuntimeState(jobId, { error: formatOcrErrorMessage(error), progressMessage: formatOcrErrorMessage(error) })
    finalizeOcrJob(jobId)
  }
}

function buildOcrJobItemPage(
  page: OcrResultPage,
  item: OcrJobItem,
  sourceFile: File,
  pageIndex: number,
  itemPageCount: number,
): OcrJobItemPage {
  return {
    pageNumber: pageIndex + 1,
    title: itemPageCount === 1 ? item.title : item.title ? `${item.title} ${pageIndex + 1}` : null,
    text: page.text,
    reviewStatus: inferOcrReviewStatus(page.uncertainSpans.length, page.confidence, page.notes),
    sourcePageNumber:
      page.sourcePageNumber ??
      (itemPageCount === 1 && item.sourcePageNumber !== null ? item.sourcePageNumber : null) ??
      page.pageNumber,
    ocrConfidence: page.confidence,
    ocrNotes: page.notes,
    uncertainSpans: page.uncertainSpans,
    sourceFileName: page.sourceFileName ?? item.sourceFileName,
    sourceKind: inferOcrSourceKind(sourceFile),
  }
}

async function prepareFilesForOcr(
  files: File[],
  shouldStripImageMetadata: boolean,
): Promise<{ files: File[]; warnings: string[] }> {
  if (!shouldStripImageMetadata) {
    return { files, warnings: [] }
  }

  const results = await Promise.all(files.map(stripImageMetadata))
  return {
    files: results.map((result) => result.file),
    warnings: results.flatMap((result) => (result.warning ? [result.warning] : [])),
  }
}

function inferOcrDocumentTitle(items: OcrJobItem[]): string {
  const firstReviewItem = items.find((item) => item.status === 'review')
  return firstReviewItem?.sourceFileName.replace(/\.[^.]+$/, '') ?? items[0]?.sourceFileName.replace(/\.[^.]+$/, '') ?? 'OCR import'
}

function inferOcrReviewStatus(
  uncertainSpanCount: number,
  confidence: number | null,
  notes: string | null,
): OcrReviewStatus {
  if (uncertainSpanCount > 0 || notes || (confidence !== null && confidence < 0.8)) {
    return 'needs_attention'
  }

  return 'reviewed'
}

function inferOcrSourceKind(file: File): OcrPageInput['sourceKind'] {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    return 'pdf'
  }

  if (file.type.startsWith('image/')) {
    return 'image'
  }

  return null
}

function formatOcrErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'OCR failed'
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      documents: [],
      documentChapters: [],
      documentPages: [],
      ocrJobs: [],
      ocrJobItems: [],
      ocrRuntimeJobs: {},
      sessions: [],
      activeDocumentId: null,
      settings: defaultSettings,
      onboarding: defaultOnboardingState,
      tourProgress: defaultTourProgressState,
      baselineResult: null,
      quizAttempts: [],
      coaching: buildDefaultCoachingState(),
      aiUsageLineItems: [],
      createDocument: (input) => {
        const now = new Date().toISOString()
        const content = cleanReadingText(input.content, { preservePageBreaks: true })
        const wordCount = countWords(content)
        const document: DocumentRecord = {
          id: crypto.randomUUID(),
          title: input.title.trim() || 'Untitled reading',
          sourceType: input.sourceType,
          content,
          wordCount,
          estimatedPages: estimatePages(wordCount),
          language: 'en',
          structureVersion: STRUCTURED_DOCUMENT_VERSION,
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
        }
        const structure = createDefaultDocumentStructure(document, {
          chapterTitle: input.chapterTitle,
          pageTitle: input.pageTitle,
          sourcePageNumber: input.sourcePageNumber,
        })

        set((state) => ({
          documents: [document, ...state.documents],
          documentChapters: [structure.chapter, ...state.documentChapters],
          documentPages: [structure.page, ...state.documentPages],
          activeDocumentId: document.id,
        }))
        void saveDocumentToDatabase(document, {
          chapters: [structure.chapter],
          pages: [structure.page],
        })

        return document
      },
      createOcrDocument: (input) => {
        const now = new Date().toISOString()
        const documentId = crypto.randomUUID()
        const chapter: DocumentChapterRecord = {
          id: defaultDocumentChapterId(documentId),
          documentId,
          title: 'Main text',
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        }
        const pages = buildOcrPages(documentId, chapter.id, input.pages, now)
        const content = renderStructuredContent(documentId, [chapter], pages)
        const wordCount = pages.reduce((total, page) => total + page.wordCount, 0)
        const document: DocumentRecord = {
          id: documentId,
          title: input.title.trim() || 'Untitled OCR import',
          sourceType: 'photo_ocr',
          content,
          wordCount,
          estimatedPages: estimatePages(wordCount),
          language: 'en',
          structureVersion: STRUCTURED_DOCUMENT_VERSION,
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
        }

        set((state) => ({
          documents: [document, ...state.documents],
          documentChapters: [chapter, ...state.documentChapters],
          documentPages: [...pages, ...state.documentPages],
          activeDocumentId: document.id,
        }))
        void saveDocumentToDatabase(document, {
          chapters: [chapter],
          pages,
        })

        return document
      },
      appendOcrPagesToDocument: (documentId, inputPages, targetChapterId) => {
        const now = new Date().toISOString()
        let changedDocument: DocumentRecord | null = null
        let changedChapter: DocumentChapterRecord | null = null
        let addedPages: DocumentPageRecord[] = []
        let changedChapters: DocumentChapterRecord[] = []
        let changedPages: DocumentPageRecord[] = []

        set((state) => {
          const document = state.documents.find((candidate) => candidate.id === documentId)
          if (!document) {
            return state
          }

          const documentChapters = state.documentChapters
            .filter((chapter) => chapter.documentId === documentId)
            .sort((left, right) => left.sortOrder - right.sortOrder)
          const fallbackChapter: DocumentChapterRecord = {
            id: defaultDocumentChapterId(documentId),
            documentId,
            title: 'Main text',
            sortOrder: 0,
            createdAt: document.createdAt,
            updatedAt: now,
          }
          const targetChapter =
            documentChapters.find((chapter) => chapter.id === targetChapterId) ??
            documentChapters[documentChapters.length - 1] ??
            fallbackChapter
          changedChapter = documentChapters.length === 0 ? targetChapter : null

          const existingPages = state.documentPages.filter((page) => page.documentId === documentId)
          const targetChapterPages = existingPages
            .filter((page) => page.chapterId === targetChapter.id)
            .sort((left, right) => left.sortOrder - right.sortOrder)
          const maxSortOrder = targetChapterPages.reduce((max, page) => Math.max(max, page.sortOrder), -1)
          const maxPageNumber = existingPages.reduce((max, page) => Math.max(max, page.pageNumber), 0)
          addedPages = buildOcrPages(documentId, targetChapter.id, inputPages, now, maxSortOrder + 1, maxPageNumber + 1)
          const nextPages = [...existingPages, ...addedPages]
          const rebuilt = rebuildDocumentFromStructure(
            document,
            [...documentChapters, ...(changedChapter ? [changedChapter] : [])],
            nextPages,
            now,
          )
          changedDocument = rebuilt.document
          changedChapters = rebuilt.chapters
          changedPages = rebuilt.pages
          addedPages = rebuilt.pages.filter((page) => addedPages.some((addedPage) => addedPage.id === page.id))

          return {
            documents: state.documents.map((candidate) => (candidate.id === documentId ? rebuilt.document : candidate)),
            documentChapters: [
              ...state.documentChapters.filter((chapter) => chapter.documentId !== documentId),
              ...rebuilt.chapters,
            ],
            documentPages: [
              ...state.documentPages.filter((page) => page.documentId !== documentId),
              ...rebuilt.pages,
            ],
            activeDocumentId: documentId,
          }
        })

        if (changedDocument) {
          void saveDocumentToDatabase(changedDocument, {
            chapters: changedChapter ? changedChapters : undefined,
            pages: changedPages,
          })
        }

        return changedDocument
      },
      saveOcrJob: (job, items) => {
        set((state) => ({
          ocrJobs: [job, ...state.ocrJobs.filter((candidate) => candidate.id !== job.id)],
          ocrJobItems: [
            ...state.ocrJobItems.filter((item) => item.jobId !== job.id),
            ...items.sort((left, right) => left.orderIndex - right.orderIndex),
          ],
        }))
        void saveOcrJobToDatabase(job, items)
      },
      createAiUsageLineItem: (input) => {
        const lineItem = buildAiUsageLineItem(input)
        set((state) => ({
          aiUsageLineItems: [lineItem, ...state.aiUsageLineItems.filter((candidate) => candidate.id !== lineItem.id)],
        }))
        void saveAiUsageLineItemToDatabase(lineItem)
        return lineItem
      },
      updateAiUsageLineItem: (id, updates) => {
        let changedLineItem: AiUsageLineItem | null = null
        set((state) => {
          let found = false
          const aiUsageLineItems = state.aiUsageLineItems.map((lineItem) => {
            if (lineItem.id !== id) {
              return lineItem
            }
            found = true
            changedLineItem = mergeAiUsageLineItem(lineItem, updates)
            return changedLineItem
          })
          return found ? { aiUsageLineItems } : state
        })
        if (changedLineItem) {
          void saveAiUsageLineItemToDatabase(changedLineItem)
        }
        return changedLineItem
      },
      queryAiUsageLineItems: (query = {}) => queryAiUsageLineItemsFromState(get().aiUsageLineItems, query),
      startOcrJob: (input) => {
        if (!input.files.length) {
          return null
        }

        const records = createOcrJobRecords(input.files, input.documentId, input.targetChapterId)
        set((state) => ({
          ocrRuntimeJobs: {
            ...state.ocrRuntimeJobs,
            [records.job.id]: {
              jobId: records.job.id,
              filesByItemId: records.filesByItemId,
              progressMessage: input.stripImageMetadataBeforeOcr
                ? 'Preparing images and removing metadata.'
                : 'Preparing OCR.',
              progressState: { ...initialOcrProgressState },
              titleGuess: null,
              documentTitle: '',
              error: null,
            },
          },
        }))
        useAppStore.getState().saveOcrJob(records.job, records.items)
        void runOcrJob(records.job.id, input)
        return records.job.id
      },
      retryOcrJobItem: (jobId, itemId, input) => {
        void retryOcrJobItemInBackground(jobId, itemId, input)
      },
      replaceOcrJobItemFile: (jobId, itemId, file, input) => {
        const snapshot = getOcrJobSnapshot(jobId)
        if (!snapshot) {
          return
        }
        const replacedAt = new Date().toISOString()
        setOcrRuntimeState(jobId, {
          filesByItemId: {
            ...(useAppStore.getState().ocrRuntimeJobs[jobId]?.filesByItemId ?? {}),
            [itemId]: file,
          },
        })
        useAppStore.getState().saveOcrJob(
          { ...snapshot.job, status: 'review', errorMessage: null, completedAt: null, updatedAt: replacedAt },
          snapshot.items.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  sourceFileName: file.name,
                  sourceFileType: file.type,
                  sourceFileSize: file.size,
                  sourceFileLastModified: file.lastModified,
                  status: 'queued',
                  ocrText: null,
                  pages: [],
                  warnings: [],
                  failureReason: null,
                  updatedAt: replacedAt,
                }
              : item,
          ),
        )
        void retryOcrJobItemInBackground(jobId, itemId, input)
      },
      skipOcrJobItem: (jobId, itemId) => {
        const snapshot = getOcrJobSnapshot(jobId)
        if (!snapshot) {
          return
        }
        const skippedAt = new Date().toISOString()
        useAppStore.getState().saveOcrJob(
          snapshot.job,
          snapshot.items.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  status: 'skipped',
                  pages: [],
                  ocrText: null,
                  updatedAt: skippedAt,
                }
              : item,
          ),
        )
        finalizeOcrJob(jobId)
      },
      approveAllOcrJobReviewPages: (jobId) => {
        const snapshot = getOcrJobSnapshot(jobId)
        if (!snapshot) {
          return
        }
        const updatedAt = new Date().toISOString()
        let changed = false
        const changedItems = snapshot.items.map((item) => {
          if (item.status !== 'review') {
            return item
          }

          let itemChanged = false
          const pages = item.pages.map((page) => {
            if (page.reviewStatus === 'reviewed' || page.reviewStatus === 'skipped') {
              return page
            }
            itemChanged = true
            changed = true
            return { ...page, reviewStatus: 'reviewed' as const }
          })

          return itemChanged ? { ...item, pages, updatedAt } : item
        })

        if (!changed) {
          return
        }

        useAppStore.getState().saveOcrJob({ ...snapshot.job, updatedAt }, changedItems)
      },
      updateOcrJobPage: (jobId, itemId, pageNumber, updates) => {
        const snapshot = getOcrJobSnapshot(jobId)
        if (!snapshot) {
          return
        }
        const updatedAt = new Date().toISOString()
        useAppStore.getState().saveOcrJob(
          { ...snapshot.job, updatedAt },
          snapshot.items.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  pages: item.pages.map((page) => (page.pageNumber === pageNumber ? { ...page, ...updates } : page)),
                  updatedAt,
                }
              : item,
          ),
        )
      },
      markOcrJobSaved: (jobId) => {
        const snapshot = getOcrJobSnapshot(jobId)
        if (!snapshot) {
          return
        }
        const savedAt = new Date().toISOString()
        useAppStore.getState().saveOcrJob(
          {
            ...snapshot.job,
            status: 'saved',
            errorMessage: null,
            updatedAt: savedAt,
            completedAt: savedAt,
          },
          snapshot.items,
        )
      },
      setOcrJobDocumentTitle: (jobId, title) => {
        setOcrRuntimeState(jobId, { documentTitle: title })
      },
      recoverInterruptedOcrJobs: () => {
        const now = new Date().toISOString()
        const state = useAppStore.getState()
        for (const job of state.ocrJobs) {
          if (job.status !== 'queued' && job.status !== 'running') {
            continue
          }
          const items = state.ocrJobItems.filter((item) => item.jobId === job.id)
          const recoveredItems = items.map((item) =>
            item.status === 'queued' || item.status === 'running'
              ? {
                  ...item,
                  status: 'failed' as const,
                  failureReason: OCR_INTERRUPTED_MESSAGE,
                  updatedAt: now,
                }
              : item,
          )
          useAppStore.getState().saveOcrJob(
            {
              ...job,
              status: 'review',
              errorMessage: null,
              warnings: uniqueStrings([...job.warnings, OCR_INTERRUPTED_MESSAGE]),
              updatedAt: now,
              completedAt: now,
            },
            recoveredItems,
          )
        }
      },
      createChapter: (documentId, title) => {
        const now = new Date().toISOString()
        let changedDocument: DocumentRecord | null = null
        let changedChapters: DocumentChapterRecord[] = []
        let changedPages: DocumentPageRecord[] = []
        let createdChapter: DocumentChapterRecord | null = null

        set((state) => {
          const document = state.documents.find((candidate) => candidate.id === documentId)
          if (!document) {
            return state
          }

          const currentChapters = state.documentChapters.filter((chapter) => chapter.documentId === documentId)
          const documentPages = state.documentPages.filter((page) => page.documentId === documentId)
          const newChapter: DocumentChapterRecord = {
            id: crypto.randomUUID(),
            documentId,
            title: title?.trim() || `Chapter ${currentChapters.length + 1}`,
            sortOrder: currentChapters.length,
            createdAt: now,
            updatedAt: now,
          }
          const rebuilt = rebuildDocumentFromStructure(document, [...currentChapters, newChapter], documentPages, now)
          changedDocument = rebuilt.document
          changedChapters = rebuilt.chapters
          changedPages = rebuilt.pages
          createdChapter = rebuilt.chapters.find((chapter) => chapter.id === newChapter.id) ?? newChapter

          return {
            documents: state.documents.map((candidate) => (candidate.id === documentId ? rebuilt.document : candidate)),
            documentChapters: [
              ...state.documentChapters.filter((chapter) => chapter.documentId !== documentId),
              ...rebuilt.chapters,
            ],
            documentPages: [
              ...state.documentPages.filter((page) => page.documentId !== documentId),
              ...rebuilt.pages,
            ],
          }
        })

        if (changedDocument) {
          void saveDocumentToDatabase(changedDocument, {
            chapters: changedChapters,
            pages: changedPages,
          })
        }

        return createdChapter
      },
      renameChapter: (chapterId, title) => {
        const now = new Date().toISOString()
        let changedDocument: DocumentRecord | null = null
        let changedChapters: DocumentChapterRecord[] = []
        let changedPages: DocumentPageRecord[] = []

        set((state) => {
          const chapter = state.documentChapters.find((candidate) => candidate.id === chapterId)
          if (!chapter) {
            return state
          }
          const document = state.documents.find((candidate) => candidate.id === chapter.documentId)
          if (!document) {
            return state
          }

          const nextTitle = title.trim() || 'Untitled chapter'
          const documentChapters = state.documentChapters
            .filter((candidate) => candidate.documentId === chapter.documentId)
            .map((candidate) =>
              candidate.id === chapterId ? { ...candidate, title: nextTitle, updatedAt: now } : candidate,
            )
          const documentPages = state.documentPages.filter((page) => page.documentId === chapter.documentId)
          const rebuilt = rebuildDocumentFromStructure(document, documentChapters, documentPages, now)
          changedDocument = rebuilt.document
          changedChapters = rebuilt.chapters
          changedPages = rebuilt.pages

          return {
            documents: state.documents.map((candidate) => (candidate.id === document.id ? rebuilt.document : candidate)),
            documentChapters: [
              ...state.documentChapters.filter((candidate) => candidate.documentId !== document.id),
              ...rebuilt.chapters,
            ],
            documentPages: [
              ...state.documentPages.filter((page) => page.documentId !== document.id),
              ...rebuilt.pages,
            ],
          }
        })

        if (changedDocument) {
          void saveDocumentToDatabase(changedDocument, {
            chapters: changedChapters,
            pages: changedPages,
          })
        }
      },
      moveChapter: (documentId, chapterId, direction) => {
        const now = new Date().toISOString()
        let changedDocument: DocumentRecord | null = null
        let changedChapters: DocumentChapterRecord[] = []
        let changedPages: DocumentPageRecord[] = []

        set((state) => {
          const document = state.documents.find((candidate) => candidate.id === documentId)
          if (!document) {
            return state
          }

          const orderedChapters = getOrderedDocumentChapters(documentId, state.documentChapters)
          const currentIndex = orderedChapters.findIndex((chapter) => chapter.id === chapterId)
          const targetIndex = currentIndex + direction
          if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderedChapters.length) {
            return state
          }

          const nextChapters = [...orderedChapters]
          const [movedChapter] = nextChapters.splice(currentIndex, 1)
          nextChapters.splice(targetIndex, 0, movedChapter)
          const reorderedChapters = nextChapters.map((chapter, index) => ({
            ...chapter,
            sortOrder: index,
            updatedAt: now,
          }))
          const documentPages = state.documentPages.filter((page) => page.documentId === documentId)
          const rebuilt = rebuildDocumentFromStructure(document, reorderedChapters, documentPages, now)
          changedDocument = rebuilt.document
          changedChapters = rebuilt.chapters
          changedPages = rebuilt.pages

          return {
            documents: state.documents.map((candidate) => (candidate.id === documentId ? rebuilt.document : candidate)),
            documentChapters: [
              ...state.documentChapters.filter((chapter) => chapter.documentId !== documentId),
              ...rebuilt.chapters,
            ],
            documentPages: [
              ...state.documentPages.filter((page) => page.documentId !== documentId),
              ...rebuilt.pages,
            ],
          }
        })

        if (changedDocument) {
          void saveDocumentToDatabase(changedDocument, {
            chapters: changedChapters,
            pages: changedPages,
          })
        }
      },
      deleteChapter: (chapterId) => {
        const now = new Date().toISOString()
        let changedDocument: DocumentRecord | null = null
        let changedChapters: DocumentChapterRecord[] = []
        let changedPages: DocumentPageRecord[] = []
        let deleted = false

        set((state) => {
          const chapter = state.documentChapters.find((candidate) => candidate.id === chapterId)
          if (!chapter) {
            return state
          }
          const document = state.documents.find((candidate) => candidate.id === chapter.documentId)
          if (!document) {
            return state
          }

          const orderedChapters = getOrderedDocumentChapters(chapter.documentId, state.documentChapters)
          if (orderedChapters.length <= 1) {
            return state
          }

          const chapterIndex = orderedChapters.findIndex((candidate) => candidate.id === chapterId)
          const targetChapter = orderedChapters[chapterIndex - 1] ?? orderedChapters[chapterIndex + 1]
          const targetChapterPageCount = state.documentPages.filter((page) => page.chapterId === targetChapter.id).length
          const movedPages = state.documentPages
            .filter((page) => page.chapterId === chapterId)
            .sort((left, right) => left.sortOrder - right.sortOrder)
            .map((page, index) => ({
              ...page,
              chapterId: targetChapter.id,
              sortOrder: targetChapterPageCount + index,
              updatedAt: now,
            }))
          const movedPageIds = new Set(movedPages.map((page) => page.id))
          const documentPages = state.documentPages
            .filter((page) => page.documentId === chapter.documentId && page.chapterId !== chapterId && !movedPageIds.has(page.id))
            .concat(movedPages)
          const documentChapters = orderedChapters.filter((candidate) => candidate.id !== chapterId)
          const rebuilt = rebuildDocumentFromStructure(document, documentChapters, documentPages, now)
          changedDocument = rebuilt.document
          changedChapters = rebuilt.chapters
          changedPages = rebuilt.pages
          deleted = true

          return {
            documents: state.documents.map((candidate) => (candidate.id === document.id ? rebuilt.document : candidate)),
            documentChapters: [
              ...state.documentChapters.filter((candidate) => candidate.documentId !== document.id),
              ...rebuilt.chapters,
            ],
            documentPages: [
              ...state.documentPages.filter((page) => page.documentId !== document.id),
              ...rebuilt.pages,
            ],
          }
        })

        if (changedDocument) {
          void saveDocumentToDatabase(changedDocument, {
            chapters: changedChapters,
            pages: changedPages,
          })
        }

        return deleted
      },
      movePage: (pageId, targetChapterId, targetIndex) => {
        const now = new Date().toISOString()
        let changedDocument: DocumentRecord | null = null
        let changedChapters: DocumentChapterRecord[] = []
        let changedPages: DocumentPageRecord[] = []

        set((state) => {
          const page = state.documentPages.find((candidate) => candidate.id === pageId)
          const targetChapter = state.documentChapters.find((candidate) => candidate.id === targetChapterId)
          if (!page || !targetChapter || page.documentId !== targetChapter.documentId) {
            return state
          }
          const document = state.documents.find((candidate) => candidate.id === page.documentId)
          if (!document) {
            return state
          }

          const documentChapters = state.documentChapters.filter((chapter) => chapter.documentId === page.documentId)
          const pagesByChapter = new Map<string, DocumentPageRecord[]>()
          for (const chapter of documentChapters) {
            pagesByChapter.set(
              chapter.id,
              state.documentPages
                .filter((candidate) => candidate.chapterId === chapter.id)
                .sort((left, right) => left.sortOrder - right.sortOrder),
            )
          }

          const sourcePages = (pagesByChapter.get(page.chapterId) ?? []).filter((candidate) => candidate.id !== pageId)
          pagesByChapter.set(page.chapterId, sourcePages)

          const targetPages = [...(pagesByChapter.get(targetChapterId) ?? [])]
          const normalizedTargetIndex = Math.max(0, Math.min(Math.round(targetIndex), targetPages.length))
          targetPages.splice(normalizedTargetIndex, 0, {
            ...page,
            chapterId: targetChapterId,
            updatedAt: now,
          })
          pagesByChapter.set(
            targetChapterId,
            targetPages.map((candidate, index) => ({ ...candidate, sortOrder: index })),
          )

          const documentPages = documentChapters.flatMap((chapter) => pagesByChapter.get(chapter.id) ?? [])
          const rebuilt = rebuildDocumentFromStructure(document, documentChapters, documentPages, now)
          changedDocument = rebuilt.document
          changedChapters = rebuilt.chapters
          changedPages = rebuilt.pages

          return {
            documents: state.documents.map((candidate) => (candidate.id === document.id ? rebuilt.document : candidate)),
            documentChapters: [
              ...state.documentChapters.filter((chapter) => chapter.documentId !== document.id),
              ...rebuilt.chapters,
            ],
            documentPages: [
              ...state.documentPages.filter((candidate) => candidate.documentId !== document.id),
              ...rebuilt.pages,
            ],
          }
        })

        if (changedDocument) {
          void saveDocumentToDatabase(changedDocument, {
            chapters: changedChapters,
            pages: changedPages,
          })
        }
      },
      deletePage: (pageId) => {
        const now = new Date().toISOString()
        let changedDocument: DocumentRecord | null = null
        let changedChapters: DocumentChapterRecord[] = []
        let changedPages: DocumentPageRecord[] = []
        let deletedPageId: string | null = null
        let deleted = false

        set((state) => {
          const page = state.documentPages.find((candidate) => candidate.id === pageId)
          if (!page) {
            return state
          }
          const document = state.documents.find((candidate) => candidate.id === page.documentId)
          if (!document) {
            return state
          }

          const documentPages = state.documentPages.filter((candidate) => candidate.documentId === page.documentId)
          if (documentPages.length <= 1) {
            return state
          }

          const documentChapters = state.documentChapters.filter((chapter) => chapter.documentId === page.documentId)
          const remainingPages = documentPages.filter((candidate) => candidate.id !== pageId)
          const rebuilt = rebuildDocumentFromStructure(document, documentChapters, remainingPages, now)
          changedDocument = rebuilt.document
          changedChapters = rebuilt.chapters
          changedPages = rebuilt.pages
          deletedPageId = pageId
          deleted = true

          return {
            documents: state.documents.map((candidate) => (candidate.id === document.id ? rebuilt.document : candidate)),
            documentChapters: [
              ...state.documentChapters.filter((chapter) => chapter.documentId !== document.id),
              ...rebuilt.chapters,
            ],
            documentPages: [
              ...state.documentPages.filter((candidate) => candidate.documentId !== document.id),
              ...rebuilt.pages,
            ],
          }
        })

        if (changedDocument && deletedPageId) {
          void deleteDocumentPageFromDatabase(deletedPageId)
          void saveDocumentToDatabase(changedDocument, {
            chapters: changedChapters,
            pages: changedPages,
          })
        }

        return deleted
      },
      deletePages: (pageIds) => {
        const pageIdSet = new Set(pageIds)
        if (pageIdSet.size === 0) {
          return 0
        }

        const now = new Date().toISOString()
        let changedDocument: DocumentRecord | null = null
        let changedChapters: DocumentChapterRecord[] = []
        let changedPages: DocumentPageRecord[] = []
        let deletedPageIds: string[] = []

        set((state) => {
          const firstPage = state.documentPages.find((candidate) => pageIdSet.has(candidate.id))
          if (!firstPage) {
            return state
          }
          const document = state.documents.find((candidate) => candidate.id === firstPage.documentId)
          if (!document) {
            return state
          }

          const documentPages = state.documentPages.filter((candidate) => candidate.documentId === firstPage.documentId)
          const deletedIds = documentPages.filter((page) => pageIdSet.has(page.id)).map((page) => page.id)
          if (deletedIds.length === 0 || deletedIds.length >= documentPages.length) {
            return state
          }

          const deletedIdSet = new Set(deletedIds)
          const documentChapters = state.documentChapters.filter((chapter) => chapter.documentId === firstPage.documentId)
          const remainingPages = documentPages.filter((page) => !deletedIdSet.has(page.id))
          const rebuilt = rebuildDocumentFromStructure(document, documentChapters, remainingPages, now)
          changedDocument = rebuilt.document
          changedChapters = rebuilt.chapters
          changedPages = rebuilt.pages
          deletedPageIds = deletedIds

          return {
            documents: state.documents.map((candidate) => (candidate.id === document.id ? rebuilt.document : candidate)),
            documentChapters: [
              ...state.documentChapters.filter((chapter) => chapter.documentId !== document.id),
              ...rebuilt.chapters,
            ],
            documentPages: [
              ...state.documentPages.filter((candidate) => candidate.documentId !== document.id),
              ...rebuilt.pages,
            ],
          }
        })

        if (changedDocument && deletedPageIds.length > 0) {
          for (const deletedPageId of deletedPageIds) {
            void deleteDocumentPageFromDatabase(deletedPageId)
          }
          void saveDocumentToDatabase(changedDocument, {
            chapters: changedChapters,
            pages: changedPages,
          })
        }

        return deletedPageIds.length
      },
      updatePageMetadata: (pageId, updates) => {
        const now = new Date().toISOString()
        let changedDocument: DocumentRecord | null = null
        let changedChapters: DocumentChapterRecord[] = []
        let changedPages: DocumentPageRecord[] = []

        set((state) => {
          const page = state.documentPages.find((candidate) => candidate.id === pageId)
          if (!page) {
            return state
          }
          const document = state.documents.find((candidate) => candidate.id === page.documentId)
          if (!document) {
            return state
          }

          const documentChapters = state.documentChapters.filter((chapter) => chapter.documentId === page.documentId)
          const documentPages = state.documentPages
            .filter((candidate) => candidate.documentId === page.documentId)
            .map((candidate) =>
              candidate.id === pageId
                ? {
                    ...candidate,
                    sourcePageNumber:
                      updates.sourcePageNumber !== undefined ? updates.sourcePageNumber : candidate.sourcePageNumber,
                    text:
                      updates.text !== undefined
                        ? cleanReadingText(updates.text, { preservePageBreaks: true })
                        : candidate.text,
                    title: updates.title !== undefined ? updates.title?.trim() || null : candidate.title,
                    reviewStatus:
                      updates.reviewStatus !== undefined ? updates.reviewStatus : candidate.reviewStatus,
                    ocrNotes: updates.ocrNotes !== undefined ? updates.ocrNotes?.trim() || null : candidate.ocrNotes,
                    wordCount:
                      updates.text !== undefined
                        ? countWords(cleanReadingText(updates.text, { preservePageBreaks: true }))
                        : candidate.wordCount,
                    updatedAt: now,
                  }
                : candidate,
            )
          const rebuilt = rebuildDocumentFromStructure(document, documentChapters, documentPages, now)
          changedDocument = rebuilt.document
          changedChapters = rebuilt.chapters
          changedPages = rebuilt.pages

          return {
            documents: state.documents.map((candidate) => (candidate.id === document.id ? rebuilt.document : candidate)),
            documentChapters: [
              ...state.documentChapters.filter((chapter) => chapter.documentId !== document.id),
              ...rebuilt.chapters,
            ],
            documentPages: [
              ...state.documentPages.filter((candidate) => candidate.documentId !== document.id),
              ...rebuilt.pages,
            ],
          }
        })

        if (changedDocument) {
          void saveDocumentToDatabase(changedDocument, {
            chapters: changedChapters,
            pages: changedPages,
          })
        }
      },
      updateDocument: (id, updates) => {
        const updatedAt = new Date().toISOString()
        let changedDocument: DocumentRecord | null = null
        let changedPage: DocumentPageRecord | null = null

        set((state) => {
          return {
            documents: state.documents.map((document) => {
              if (document.id !== id) {
                return document
              }

              const content =
                updates.content !== undefined
                  ? cleanReadingText(updates.content, { preservePageBreaks: true })
                  : document.content
              const title = updates.title !== undefined ? updates.title.trim() || 'Untitled reading' : document.title
              const wordCount = countWords(content)
              changedDocument = {
                ...document,
                title,
                content,
                wordCount,
                estimatedPages: estimatePages(wordCount),
                updatedAt,
              }
              return changedDocument
            }),
            documentPages:
              updates.content === undefined
                ? state.documentPages
                : state.documentPages.map((page) => {
                    if (page.id !== defaultDocumentPageId(id)) {
                      return page
                    }

                    const content = cleanReadingText(updates.content ?? '', { preservePageBreaks: true })
                    changedPage = {
                      ...page,
                      text: content,
                      wordCount: countWords(content),
                      updatedAt,
                    }
                    return changedPage
                  }),
          }
        })

        if (changedDocument) {
          void saveDocumentToDatabase(changedDocument, changedPage ? { pages: [changedPage] } : undefined)
        }
      },
      archiveDocument: (id) => {
        const updatedAt = new Date().toISOString()
        let changedDocument: DocumentRecord | null = null

        set((state) => ({
          documents: state.documents.map((document) => {
            if (document.id !== id) {
              return document
            }

            changedDocument = { ...document, archivedAt: updatedAt, updatedAt }
            return changedDocument
          }),
          activeDocumentId: state.activeDocumentId === id ? null : state.activeDocumentId,
        }))

        if (changedDocument) {
          void saveDocumentToDatabase(changedDocument)
        }
      },
      setActiveDocument: (id) => set({ activeDocumentId: id }),
      completeSession: (input) => {
        const now = new Date()
        const actualWpm = calculateActualWpm(input.wordsRead, input.durationSeconds)
        const session: ReadingSession = {
          id: crypto.randomUUID(),
          documentId: input.documentId,
          scopeType: input.scope?.scopeType ?? 'document',
          scopeLabel: input.scope?.scopeLabel ?? null,
          chapterId: input.scope?.chapterId ?? null,
          chapterTitle: input.scope?.chapterTitle ?? null,
          pageIds: input.scope?.pageIds ?? [],
          pageNumbers: input.scope?.pageNumbers ?? [],
          sourcePageNumbers: input.scope?.sourcePageNumbers ?? [],
          mode: input.mode,
          targetWpm: input.targetWpm,
          actualWpm,
          adjustedWpm: calculateAdjustedWpm(actualWpm, input.comprehensionScore),
          wordsRead: input.wordsRead,
          durationSeconds: input.durationSeconds,
          startPosition: input.startPosition ?? 0,
          endPosition: input.endPosition ?? input.wordsRead,
          pauseCount: input.pauseCount,
          regressionCount: input.regressionCount,
          comprehensionScore: input.comprehensionScore,
          selfRating: input.selfRating,
          notes: input.notes,
          startedAt: new Date(now.getTime() - input.durationSeconds * 1000).toISOString(),
          endedAt: now.toISOString(),
        }

        set((state) => ({ sessions: [session, ...state.sessions] }))
        void saveSessionToDatabase(session)

        return session
      },
      updateSettings: (settings) => {
        set((state) => ({
          settings: {
            reader: { ...state.settings.reader, ...settings.reader },
            privacy: { ...state.settings.privacy, ...settings.privacy },
            ocr: { ...state.settings.ocr, ...settings.ocr },
          },
        }))
      },
      saveBaselineResult: (result) => {
        set((state) => ({
          baselineResult: {
            ...result,
            appliedWpmAt: new Date().toISOString(),
          },
          settings: {
            ...state.settings,
            reader: {
              ...state.settings.reader,
              defaultWpm: result.recommendedWpm,
            },
          },
          coaching: {
            ...state.coaching,
            recommendedWpm: result.recommendedWpm,
          },
        }))
      },
      skipOnboarding: () => {
        set({
          onboarding: {
            status: 'skipped',
            skippedAt: new Date().toISOString(),
            introCompletedAt: null,
          },
        })
      },
      completeOnboardingIntro: () => {
        set({
          onboarding: {
            status: 'intro_completed',
            skippedAt: null,
            introCompletedAt: new Date().toISOString(),
          },
        })
      },
      reopenOnboarding: () => set({ onboarding: defaultOnboardingState }),
      completeTour: (tourId) => {
        set((state) => {
          if (state.tourProgress.completedTourIds.includes(tourId)) {
            return state
          }

          return {
            tourProgress: {
              completedTourIds: [...state.tourProgress.completedTourIds, tourId],
            },
          }
        })
      },
      resetTour: (tourId) => {
        set((state) => ({
          tourProgress: {
            completedTourIds: state.tourProgress.completedTourIds.filter((completedTourId) => completedTourId !== tourId),
          },
        }))
      },
      resetAllTours: () => set({ tourProgress: defaultTourProgressState }),
      addQuizAttempt: (attempt) => {
        set((state) => ({
          quizAttempts: [attempt, ...state.quizAttempts],
          coaching: {
            ...state.coaching,
            recommendedWpm: attempt.recommendedWpm,
            lastResetWordIndexByDocument: {
              ...state.coaching.lastResetWordIndexByDocument,
              [attempt.documentId]: attempt.endWordIndex,
            },
            activeSegmentByDocument: {
              ...state.coaching.activeSegmentByDocument,
              [attempt.documentId]: {
                startWordIndex: attempt.endWordIndex,
                startedAt: null,
                targetWpm: attempt.recommendedWpm,
              },
            },
          },
        }))
        void saveQuizAttemptToDatabase(attempt)
      },
      resetCoachingSegment: (documentId, wordIndex) =>
        set((state) => ({
          coaching: {
            ...state.coaching,
            lastResetWordIndexByDocument: {
              ...state.coaching.lastResetWordIndexByDocument,
              [documentId]: Math.max(0, Math.round(wordIndex)),
            },
            activeSegmentByDocument: {
              ...state.coaching.activeSegmentByDocument,
              [documentId]: {
                startWordIndex: Math.max(0, Math.round(wordIndex)),
                startedAt: null,
                targetWpm: state.coaching.recommendedWpm,
              },
            },
          },
        })),
      startCoachingSegment: (documentId, segment) =>
        set((state) => ({
          coaching: {
            ...state.coaching,
            activeSegmentByDocument: {
              ...state.coaching.activeSegmentByDocument,
              [documentId]: segment,
            },
          },
        })),
      updateReaderResume: (documentId, slot) =>
        set((state) => {
          const normalizedSlot = normalizeReaderResumeSlot(slot, state.coaching.recommendedWpm ?? defaultSettings.reader.defaultWpm)
          const currentMemory = state.coaching.readerResumeByDocument[documentId] ?? {}
          const nextMemory = saveReaderResumeSlot(currentMemory, normalizedSlot)

          return {
            coaching: {
              ...state.coaching,
              lastResetWordIndexByDocument: {
                ...state.coaching.lastResetWordIndexByDocument,
                [documentId]: normalizedSlot.segmentStartWordIndex,
              },
              readerResumeByDocument: {
                ...state.coaching.readerResumeByDocument,
                [documentId]: nextMemory,
              },
            },
          }
        }),
      resetAllData: () => {
        set({
          documents: [],
          documentChapters: [],
          documentPages: [],
          ocrJobs: [],
          ocrJobItems: [],
          ocrRuntimeJobs: {},
          sessions: [],
          activeDocumentId: null,
          onboarding: defaultOnboardingState,
          tourProgress: defaultTourProgressState,
          baselineResult: null,
          quizAttempts: [],
          coaching: buildDefaultCoachingState(),
          aiUsageLineItems: [],
        })
        void clearDurableStateFromDatabase()
      },
      recoverDurableStateFromDatabase: async () => {
        const currentState = get()
        const hasDurableState =
          currentState.documents.length > 0 ||
          currentState.sessions.length > 0 ||
          currentState.quizAttempts.length > 0 ||
          currentState.aiUsageLineItems.length > 0

        if (hasDurableState) {
          return false
        }

        const databaseState = await loadDurableStateFromDatabase()
        if (!databaseState) {
          return false
        }

        const hasRecoveredState =
          databaseState.documents.length > 0 ||
          databaseState.sessions.length > 0 ||
          databaseState.quizAttempts.length > 0 ||
          databaseState.aiUsageLineItems.length > 0

        if (!hasRecoveredState) {
          return false
        }

        set((state) => ({
          documents: databaseState.documents,
          documentChapters: databaseState.documentChapters,
          documentPages: databaseState.documentPages,
          ocrJobs: databaseState.ocrJobs,
          ocrJobItems: databaseState.ocrJobItems,
          sessions: databaseState.sessions,
          activeDocumentId:
            state.activeDocumentId ??
            databaseState.documents.find((document) => document.archivedAt === null)?.id ??
            databaseState.documents[0]?.id ??
            null,
          quizAttempts: databaseState.quizAttempts,
          aiUsageLineItems: databaseState.aiUsageLineItems,
        }))

        return true
      },
    }),
    {
      name: 'readrail-local-state',
      version: 10,
      migrate: (persistedState: unknown, fromVersion: number) => {
        const state = persistedState as Record<string, unknown>
        const settings = state.settings as AppSettings | undefined
        if (settings?.privacy && settings.privacy.stripImageMetadataBeforeOcr === undefined) {
          settings.privacy.stripImageMetadataBeforeOcr = defaultSettings.privacy.stripImageMetadataBeforeOcr
        }
        // v1 → v2: seed defaultPageLayout for existing users
        if (fromVersion < 2) {
          const migratedSettings = state.settings as Record<string, unknown> | undefined
          const reader = migratedSettings?.reader as Record<string, unknown> | undefined
          if (reader && reader.defaultPageLayout === undefined) {
            reader.defaultPageLayout = 1
          }
        }
        // v2 → v3: seed quizAttempts
        if (fromVersion < 3) {
          state.quizAttempts = state.quizAttempts || []
        }
        // v3 → v4: seed persistent coaching state and reviewable quiz metadata defaults.
        if (fromVersion < 4) {
          const reader = settings?.reader
          const fallbackWpm = reader?.defaultWpm ?? defaultSettings.reader.defaultWpm
          state.coaching = normalizeCoachingState(state.coaching as Partial<CoachingState> | undefined, fallbackWpm)

          const quizAttempts = (state.quizAttempts as QuizAttempt[] | undefined) ?? []
          state.quizAttempts = quizAttempts.map((attempt) => ({
            ...attempt,
            startWordIndex: attempt.startWordIndex ?? 0,
            endWordIndex: attempt.endWordIndex ?? attempt.wordCount,
            targetWpm: attempt.targetWpm ?? attempt.recommendedWpm ?? fallbackWpm,
          }))
        }
        // v4 → v5: seed structured document children while preserving document identity.
        if (fromVersion < 5) {
          const structured = ensureStructuredDocumentCollections({
            documents: state.documents as DocumentRecord[] | undefined,
            documentChapters: state.documentChapters as DocumentChapterRecord[] | undefined,
            documentPages: state.documentPages as DocumentPageRecord[] | undefined,
          })
          state.documents = structured.documents
          state.documentChapters = structured.documentChapters
          state.documentPages = structured.documentPages
        }
        // v5 -> v6: seed OCR job collections.
        if (fromVersion < 6) {
          state.ocrJobs = state.ocrJobs || []
          state.ocrJobItems = state.ocrJobItems || []
        }
        // v6 -> v7: seed Reader scope metadata for legacy sessions.
        if (fromVersion < 7) {
          state.sessions = seedSessionScopeMetadata(state.sessions as ReadingSession[] | undefined)
        }
        // v7 -> v8: seed durable AI usage ledger collection.
        if (fromVersion < 8) {
          state.aiUsageLineItems = state.aiUsageLineItems || []
        }
        // v8 -> v9: seed durable coaching attempt scope metadata.
        if (fromVersion < 9) {
          const reader = settings?.reader
          const fallbackWpm = reader?.defaultWpm ?? defaultSettings.reader.defaultWpm
          state.quizAttempts = normalizeQuizAttemptsForPersistence(
            state.quizAttempts as QuizAttempt[] | undefined,
            state.sessions as ReadingSession[] | undefined,
            fallbackWpm,
          )
        }
        // v9 -> v10: seed per-document Reader resume memory.
        if (fromVersion < 10) {
          const reader = settings?.reader
          const fallbackWpm = reader?.defaultWpm ?? defaultSettings.reader.defaultWpm
          state.coaching = normalizeCoachingState(state.coaching as Partial<CoachingState> | undefined, fallbackWpm)
        }
        return state
      },
      partialize: (state) => ({
        documents: state.documents,
        documentChapters: state.documentChapters,
        documentPages: state.documentPages,
        ocrJobs: state.ocrJobs,
        ocrJobItems: state.ocrJobItems,
        sessions: state.sessions,
        activeDocumentId: state.activeDocumentId,
        settings: state.settings,
        onboarding: state.onboarding,
        tourProgress: state.tourProgress,
        baselineResult: state.baselineResult,
        quizAttempts: state.quizAttempts,
        coaching: state.coaching,
        aiUsageLineItems: state.aiUsageLineItems,
      }),
    },
  ),
)

export function selectActiveDocument(state: AppState): DocumentRecord | null {
  return state.documents.find((document) => document.id === state.activeDocumentId) ?? null
}
