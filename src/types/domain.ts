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

export type CoachingState = {
  recommendedWpm: number
  lastResetWordIndexByDocument: Record<string, number>
  activeSegmentByDocument: Record<string, CoachingSegmentState>
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

export type QuizAttempt = {
  id: string
  documentId: string
  readingSessionId: string | null
  kind: 'generated' | 'manual'
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
