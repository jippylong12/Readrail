export type SourceType = 'paste' | 'text_file' | 'pdf_text' | 'photo_ocr' | 'manual'

export type ReaderMode = 'rail' | 'chunk' | 'rsvp'
export type ReadingScopeType = 'document' | 'chapter' | 'pages'

export type PageLayout = 1 | 2 | 3 | 4

export type ThemeMode = 'system' | 'light' | 'dark'

export type OnboardingStatus = 'not_started' | 'skipped' | 'intro_completed'

export type OnboardingState = {
  status: OnboardingStatus
  skippedAt: string | null
  introCompletedAt: string | null
}

export type TourProgressState = {
  completedTourIds: string[]
}

export type BaselineStorySource = 'default' | 'custom'

export type BaselineQuestionKind = 'main_idea' | 'detail' | 'sequence_cause' | 'inference' | 'confidence'

export type BaselineQuestionOption = {
  id: string
  label: string
  score: number
}

export type BaselineQuestion = {
  id: string
  kind: BaselineQuestionKind
  prompt: string
  options: BaselineQuestionOption[]
}

export type BaselineQuestionResult = {
  questionId: string
  selectedOptionId: string
  score: number
  maxScore: number
}

export type QuizQuestionReview = {
  questionId: string
  kind: Exclude<BaselineQuestionKind, 'confidence'>
  prompt: string
  options: Array<{
    id: string
    label: string
  }>
  correctOptionId: string
  selectedOptionId: string
  score: number
  maxScore: number
}

export type BaselineAssessmentResult = {
  id: string
  storyTitle: string
  storySource: BaselineStorySource
  wordCount: number
  durationSeconds: number
  rawWpm: number
  comprehensionPercent: number
  adjustedWpm: number
  recommendedWpm: number
  explanation: string
  questionResults: BaselineQuestionResult[]
  completedAt: string
  appliedWpmAt: string | null
}

export type DocumentRecord = {
  id: string
  title: string
  sourceType: SourceType
  content: string
  wordCount: number
  estimatedPages: number
  language: string
  structureVersion: number
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export type OcrReviewStatus = 'unreviewed' | 'reviewed' | 'needs_attention'
export type OcrJobPageReviewStatus = OcrReviewStatus | 'skipped'

export type OcrUncertainSpan = {
  text: string
  startIndex: number | null
  endIndex: number | null
  confidence: number | null
  note: string | null
}

export type DocumentChapterRecord = {
  id: string
  documentId: string
  title: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type DocumentPageRecord = {
  id: string
  documentId: string
  chapterId: string
  sortOrder: number
  pageNumber: number
  sourcePageNumber: number | null
  title: string | null
  text: string
  wordCount: number
  reviewStatus: OcrReviewStatus
  ocrConfidence: number | null
  ocrNotes: string | null
  uncertainSpans: OcrUncertainSpan[]
  sourceFileId: string | null
  sourceFileName: string | null
  sourceKind: SourceFileRecord['kind'] | null
  sourceLocalPath: string | null
  sourceSha256: string | null
  createdAt: string
  updatedAt: string
}

export type ReadingSession = {
  id: string
  documentId: string
  scopeType?: ReadingScopeType
  scopeLabel?: string | null
  chapterId?: string | null
  chapterTitle?: string | null
  pageIds?: string[]
  pageNumbers?: number[]
  sourcePageNumbers?: Array<number | null>
  mode: ReaderMode
  targetWpm: number
  actualWpm: number
  adjustedWpm: number | null
  wordsRead: number
  durationSeconds: number
  startPosition: number
  endPosition: number
  pauseCount: number
  regressionCount: number
  comprehensionScore: number | null
  selfRating: number | null
  notes: string
  startedAt: string
  endedAt: string
}

export type ReaderSettings = {
  defaultWpm: number
  defaultMode: ReaderMode
  defaultPageLayout: PageLayout
  chunkSize: number
  fontFamily: 'system' | 'atkinson' | 'charter' | 'georgia'
  fontSize: number
  lineHeight: number
  theme: ThemeMode
  reducedMotion: boolean
}

export type PrivacySettings = {
  retainSourceImages: boolean
  confirmRemoteOcrEachTime: boolean
  stripImageMetadataBeforeOcr: boolean
}

export type OcrSettings = {
  modelId: 'gemini-3.1-flash-lite'
  preservePageBreaks: boolean
}

export type AppSettings = {
  reader: ReaderSettings
  privacy: PrivacySettings
  ocr: OcrSettings
}

export type CoachingSegmentState = {
  startWordIndex: number
  startedAt: string | null
  targetWpm: number | null
}

export type ReaderResumeSlot = {
  scopeType: ReadingScopeType
  chapterId: string | null
  startPageNumber: number | null
  endPageNumber: number | null
  wordIndex: number
  chunkSize: number
  updatedAt: string
}

export type ReaderResumeMemory = Partial<Record<ReadingScopeType, ReaderResumeSlot>>

export type CoachingState = {
  recommendedWpm: number
  lastResetWordIndexByDocument: Record<string, number>
  activeSegmentByDocument: Record<string, CoachingSegmentState>
  readerResumeByDocument: Record<string, ReaderResumeMemory>
}

export type SourceFileRecord = {
  id: string
  documentId: string | null
  kind: 'image' | 'pdf' | 'text'
  displayName: string
  localPath: string | null
  sha256: string | null
  createdAt: string
}

export type OcrJob = {
  id: string
  documentId: string | null
  targetChapterId: string | null
  status: 'queued' | 'running' | 'review' | 'saved' | 'failed' | 'cancelled'
  modelId: string
  inputFileCount: number
  promptVersion: string
  warnings: string[]
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export type OcrJobItemStatus = 'queued' | 'running' | 'review' | 'failed' | 'skipped'

export type OcrJobItemPage = {
  pageNumber: number
  sourcePageNumber: number | null
  title: string | null
  text: string
  reviewStatus: OcrJobPageReviewStatus
  ocrConfidence: number | null
  ocrNotes: string | null
  uncertainSpans: OcrUncertainSpan[]
  sourceFileName: string | null
  sourceKind: SourceFileRecord['kind'] | null
}

export type OcrJobItem = {
  id: string
  jobId: string
  orderIndex: number
  sourceFileName: string
  sourceFileType: string
  sourceFileSize: number
  sourceFileLastModified: number
  sourcePageNumber: number | null
  title: string | null
  status: OcrJobItemStatus
  ocrText: string | null
  pages: OcrJobItemPage[]
  warnings: string[]
  failureReason: string | null
  createdAt: string
  updatedAt: string
}

export type AiUsageStage = 'ocr_extraction' | 'ocr_cleaner' | 'ocr_formatter' | 'generated_quiz'

export type AiUsageStatus = 'running' | 'succeeded' | 'failed'

export type AiCostConfidence = 'exact' | 'estimated' | 'unknown'

export type AiUsageTokenBreakdown = {
  inputTokens: number | null
  outputTokens: number | null
  thinkingTokens: number | null
  totalTokens: number | null
  cachedInputTokens: number | null
  textInputTokens: number | null
  imageInputTokens: number | null
  audioInputTokens: number | null
  videoInputTokens: number | null
  documentInputTokens: number | null
  textOutputTokens: number | null
  imageOutputTokens: number | null
  audioOutputTokens: number | null
  videoOutputTokens: number | null
  documentOutputTokens: number | null
  cachedTextInputTokens: number | null
  cachedImageInputTokens: number | null
  cachedAudioInputTokens: number | null
  cachedVideoInputTokens: number | null
  cachedDocumentInputTokens: number | null
}

export type AiPricingSnapshot = {
  effectiveDate: string | null
  modelId: string | null
  currency: string | null
  inputRatePerMillionTokens: number | null
  outputRatePerMillionTokens: number | null
  thinkingRatePerMillionTokens: number | null
  estimatedInputCost: number | null
  estimatedOutputCost: number | null
  estimatedThinkingCost: number | null
  estimatedTotalCost: number | null
  confidence: AiCostConfidence
}

export type AiUsageLineItem = {
  id: string
  documentId: string | null
  ocrJobId: string | null
  ocrItemId: string | null
  sourceFileName: string | null
  stage: AiUsageStage
  provider: string
  model: string
  status: AiUsageStatus
  startedAt: string
  completedAt: string | null
  failureMessage: string | null
  rawProviderMetadata: Record<string, unknown> | null
  tokenBreakdown: AiUsageTokenBreakdown
  pricingSnapshot: AiPricingSnapshot | null
}

export type QuizAttemptKind = 'generated' | 'manual' | 'retest'

export type QuizAttempt = {
  id: string
  documentId: string
  readingSessionId: string | null
  kind: QuizAttemptKind
  scopeType: ReadingScopeType
  scopeLabel: string | null
  chapterId: string | null
  chapterTitle: string | null
  pageIds: string[]
  pageNumbers: number[]
  sourcePageNumbers: Array<number | null>
  startWordIndex: number
  endWordIndex: number
  wordCount: number
  durationSeconds: number
  targetWpm: number
  rawWpm: number
  comprehensionPercent: number
  adjustedWpm: number
  recommendedWpm: number
  explanation: string
  questionResults?: BaselineQuestionResult[]
  questions?: QuizQuestionReview[]
  createdAt: string
}
