import { useMemo, useRef, useState } from 'react'
import { runGeminiOcrFromFiles } from '../lib/ai/geminiOcr'
import { stripImageMetadata } from '../lib/files/imageMetadata'
import { cleanReadingText } from '../lib/text/cleanup'
import { countWords } from '../lib/text/wordCount'
import type { OcrPageInput } from '../app/store'
import type { OcrPipelineProgress, OcrPipelineStage, OcrResultPage } from '../lib/ai/geminiOcr'
import type {
  DocumentChapterRecord,
  DocumentRecord,
  OcrJob,
  OcrJobItem,
  OcrJobItemPage,
  OcrJobItemStatus,
  OcrJobPageReviewStatus,
  OcrReviewStatus,
} from '../types/domain'

type OcrReviewProps = {
  hasKey: boolean
  documents: DocumentRecord[]
  documentChapters?: DocumentChapterRecord[]
  preservePageBreaks: boolean
  stripImageMetadataBeforeOcr: boolean
  appendTargetDocumentId?: string
  appendTargetChapterId?: string | null
  appendStartSourcePageNumber?: number
  loadApiKey: () => Promise<string | null>
  onCreateDocument: (title: string, pages: OcrPageInput[]) => void
  onAppendPages: (documentId: string, pages: OcrPageInput[], chapterId?: string | null) => void
  onSaveOcrJob?: (job: OcrJob, items: OcrJobItem[]) => void
}

type OcrFileDraft = {
  id: string
  file: File
  title: string
  sourcePageNumber: number | null
}

type OcrJobItemDraft = OcrJobItem & {
  file: File
}

type OcrJobDraft = {
  job: OcrJob
  items: OcrJobItemDraft[]
  titleGuess: string | null
}

type OcrStageState = OcrPipelineProgress['status'] | 'pending'
type OcrReviewEntryStatus = 'pending' | 'approved' | 'needs_attention' | 'skipped' | 'failed'

type OcrReviewPageEntry = {
  id: string
  type: 'page'
  item: OcrJobItemDraft
  page: OcrJobItemPage
  pageIndex: number
  status: OcrReviewEntryStatus
}

type OcrReviewItemEntry = {
  id: string
  type: 'item'
  item: OcrJobItemDraft
  status: OcrReviewEntryStatus
}

type OcrReviewEntry = OcrReviewPageEntry | OcrReviewItemEntry

type OcrReviewSummary = Record<OcrReviewEntryStatus, number>

const MAX_OCR_FILES = 25
const OCR_PROMPT_VERSION = 'structured-import-v1'
const OCR_MODEL_ID = 'gemini-3.1-flash-lite'

const ocrProgressSteps: Array<{ stage: OcrPipelineStage; label: string }> = [
  { stage: 'ocr', label: 'OCR' },
  { stage: 'cleaner', label: 'Cleaner' },
  { stage: 'formatter', label: 'Formatter' },
]

const initialProgressState: Record<OcrPipelineStage, OcrStageState> = {
  ocr: 'pending',
  cleaner: 'pending',
  formatter: 'pending',
}

export function OcrReview({
  hasKey,
  documents,
  documentChapters = [],
  preservePageBreaks,
  stripImageMetadataBeforeOcr,
  appendTargetDocumentId,
  appendTargetChapterId,
  appendStartSourcePageNumber = 1,
  loadApiKey,
  onCreateDocument,
  onAppendPages,
  onSaveOcrJob,
}: OcrReviewProps) {
  const [fileDrafts, setFileDrafts] = useState<OcrFileDraft[]>([])
  const [jobDraft, setJobDraft] = useState<OcrJobDraft | null>(null)
  const latestJobDraftRef = useRef<OcrJobDraft | null>(null)
  const [status, setStatus] = useState<'idle' | 'running' | 'review' | 'failed'>('idle')
  const [title, setTitle] = useState('')
  const [appendDocumentId, setAppendDocumentId] = useState('')
  const [appendChapterId, setAppendChapterId] = useState(appendTargetChapterId ?? '')
  const [focusedReviewId, setFocusedReviewId] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState('')
  const [progressMessage, setProgressMessage] = useState('')
  const [progressState, setProgressState] = useState<Record<OcrPipelineStage, OcrStageState>>(initialProgressState)
  const replacementInputs = useRef<Record<string, HTMLInputElement | null>>({})
  const availableDocuments = documents.filter((document) => !document.archivedAt)
  const appendTargetDocument = appendTargetDocumentId
    ? availableDocuments.find((document) => document.id === appendTargetDocumentId) ?? null
    : null
  const appendTargetChapters = appendTargetDocumentId
    ? documentChapters
        .filter((chapter) => chapter.documentId === appendTargetDocumentId)
        .sort((left, right) => left.sortOrder - right.sortOrder)
    : []
  const selectedAppendChapterId = appendTargetDocumentId
    ? appendChapterId || appendTargetChapterId || appendTargetChapters[appendTargetChapters.length - 1]?.id || null
    : null
  const selectedAppendChapter =
    appendTargetChapters.find((chapter) => chapter.id === selectedAppendChapterId) ??
    appendTargetChapters[appendTargetChapters.length - 1] ??
    null
  const jobItems = useMemo(() => jobDraft?.items ?? [], [jobDraft])
  const reviewEntries = useMemo(() => buildReviewEntries(jobItems), [jobItems])
  const focusedReviewEntry =
    reviewEntries.find((entry) => entry.id === focusedReviewId) ?? reviewEntries[0] ?? null
  const focusedReviewIndex = focusedReviewEntry
    ? reviewEntries.findIndex((entry) => entry.id === focusedReviewEntry.id)
    : -1
  const reviewSummary = useMemo(() => summarizeReviewEntries(reviewEntries), [reviewEntries])
  const pagesForSave = useMemo(() => buildReviewedPages(jobItems, preservePageBreaks), [jobItems, preservePageBreaks])
  const hasBlockingItems = jobItems.some((item) => item.status === 'queued' || item.status === 'running' || item.status === 'failed')
  const hasUnapprovedPages = jobItems.some(
    (item) =>
      item.status === 'review' &&
      item.pages.some((page) => page.reviewStatus !== 'reviewed' && page.reviewStatus !== 'skipped'),
  )
  const isReviewAvailable = Boolean(jobDraft) && (status === 'running' || status === 'review')
  const totalWords = useMemo(
    () => pagesForSave.reduce((total, page) => total + countWords(cleanReadingText(page.text, { preservePageBreaks })), 0),
    [pagesForSave, preservePageBreaks],
  )
  const canSavePages = totalWords > 0 && !hasBlockingItems && !hasUnapprovedPages
  const progressPercent = calculateProgressPercent(status, jobItems, progressState)

  function resetProgress(): void {
    setProgressMessage('')
    setProgressState({ ...initialProgressState })
  }

  function updateProgress(progress: OcrPipelineProgress): void {
    setProgressMessage(progress.message)
    setProgressState((currentProgress) => ({
      ...currentProgress,
      [progress.stage]: progress.status,
    }))
  }

  function commitJob(nextJobDraftOrUpdater: OcrJobDraft | ((currentJobDraft: OcrJobDraft | null) => OcrJobDraft)): OcrJobDraft {
    const nextJobDraft =
      typeof nextJobDraftOrUpdater === 'function'
        ? nextJobDraftOrUpdater(latestJobDraftRef.current)
        : nextJobDraftOrUpdater
    const savedItems = nextJobDraft.items.map(stripRuntimeFile)
    latestJobDraftRef.current = nextJobDraft
    setJobDraft(nextJobDraft)
    onSaveOcrJob?.(nextJobDraft.job, savedItems)
    return nextJobDraft
  }

  async function startOcr(selectedDrafts = fileDrafts): Promise<void> {
    if (!selectedDrafts.length || !hasKey) {
      return
    }

    setStatus('running')
    setError('')
    setWarnings([])
    resetProgress()
    setProgressMessage(stripImageMetadataBeforeOcr ? 'Preparing images and removing metadata.' : 'Preparing OCR.')
    setFileDrafts(selectedDrafts)

    try {
      const apiKey = await loadApiKey()
      if (!apiKey) {
        throw new Error('Add a Gemini API key in Settings before running OCR.')
      }

      const initialJob = commitJob(createJobDraft(selectedDrafts, appendTargetDocumentId ?? null, selectedAppendChapterId))
      let currentJob = initialJob
      for (const item of initialJob.items.sort((left, right) => left.orderIndex - right.orderIndex)) {
        currentJob = await processJobItem(currentJob, item.id, apiKey)
      }

      const finalizedJob = finalizeJobAfterProcessing(currentJob)
      commitJob(finalizedJob)
      setTitle((currentTitle) => currentTitle || inferDocumentTitle(finalizedJob, selectedDrafts))
      setWarnings(finalizedJob.job.warnings)
      setAppendDocumentId(appendTargetDocumentId ?? availableDocuments[0]?.id ?? '')
      setAppendChapterId(selectedAppendChapterId ?? '')
      setProgressMessage('Ready for review.')
      setStatus('review')
    } catch (ocrError) {
      const message = formatErrorMessage(ocrError)
      setError(message)
      setStatus('failed')
      const currentJob = latestJobDraftRef.current
      if (currentJob) {
        commitJob({
          ...currentJob,
          job: {
            ...currentJob.job,
            status: 'failed',
            errorMessage: message,
            updatedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          },
        })
      }
    }
  }

  async function retryJobItem(itemId: string, sourceJobDraft = jobDraft): Promise<void> {
    if (!sourceJobDraft || !hasKey) {
      return
    }

    setStatus('running')
    setError('')
    resetProgress()
    setProgressMessage(stripImageMetadataBeforeOcr ? 'Preparing images and removing metadata.' : 'Preparing OCR.')

    try {
      const apiKey = await loadApiKey()
      if (!apiKey) {
        throw new Error('Add a Gemini API key in Settings before running OCR.')
      }

      const runningJob = commitJob({
        ...sourceJobDraft,
        job: {
          ...sourceJobDraft.job,
          status: 'running',
          errorMessage: null,
          completedAt: null,
          updatedAt: new Date().toISOString(),
        },
      })
      const retriedJob = await processJobItem(runningJob, itemId, apiKey)
      const finalizedJob = finalizeJobAfterProcessing(retriedJob)
      commitJob(finalizedJob)
      const retriedItem = finalizedJob.items.find((item) => item.id === itemId)
      setFocusedReviewId(retriedItem?.pages[0] ? pageKey(retriedItem, retriedItem.pages[0]) : itemId)
      setWarnings(finalizedJob.job.warnings)
      setProgressMessage('Ready for review.')
      setStatus('review')
    } catch (retryError) {
      setError(formatErrorMessage(retryError))
      setStatus('review')
    }
  }

  async function replaceJobItemFile(itemId: string, file: File): Promise<void> {
    if (!jobDraft) {
      return
    }

    const replacedAt = new Date().toISOString()
    const replacedJob = commitJob({
      ...jobDraft,
      job: { ...jobDraft.job, status: 'review', errorMessage: null, completedAt: null, updatedAt: replacedAt },
      items: jobDraft.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              file,
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
    })
    setJobDraft(replacedJob)
    await retryJobItem(itemId, replacedJob)
  }

  function skipJobItem(itemId: string): void {
    if (!jobDraft) {
      return
    }

    const skippedAt = new Date().toISOString()
    const skippedJob = commitJob((currentJob) => {
      const baseJob = currentJob ?? jobDraft
      return finalizeJobAfterProcessing({
        ...baseJob,
        items: baseJob.items.map((item) =>
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
      })
    })
    setWarnings(skippedJob.job.warnings)
  }

  async function processJobItem(currentJob: OcrJobDraft, itemId: string, apiKey: string): Promise<OcrJobDraft> {
    const startedAt = new Date().toISOString()
    const runningJob = commitJob((latestJob) => {
      const baseJob = latestJob ?? currentJob
      return {
        ...baseJob,
        job: { ...baseJob.job, status: 'running', errorMessage: null, updatedAt: startedAt },
        items: baseJob.items.map((item) =>
          item.id === itemId
            ? { ...item, status: 'running', failureReason: null, warnings: [], pages: [], ocrText: null, updatedAt: startedAt }
            : item,
        ),
      }
    })

    resetProgress()
    const activeItem = runningJob.items.find((item) => item.id === itemId)
    if (!activeItem) {
      return runningJob
    }
    const itemProgressPrefix = `Processing item ${activeItem.orderIndex + 1} of ${runningJob.items.length}`
    setProgressMessage(`${itemProgressPrefix}.`)

    try {
      const preparedFiles = await prepareFilesForOcr([activeItem.file], stripImageMetadataBeforeOcr)
      const result = await runGeminiOcrFromFiles(apiKey, preparedFiles.files, {
        onProgress: (progress) =>
          updateProgress({
            ...progress,
            message: `${itemProgressPrefix}: ${progress.message}`,
          }),
      })
      const selectedFile = preparedFiles.files[0] ?? activeItem.file
      const finishedAt = new Date().toISOString()
      const pages = result.pages.map((page, pageIndex) =>
        buildJobItemPage(page, activeItem, selectedFile, pageIndex, result.pages.length),
      )
      const itemWarnings = [...preparedFiles.warnings, ...result.warnings]

      const reviewedJob = commitJob((latestJob) => {
        const baseJob = latestJob ?? runningJob
        return {
          ...baseJob,
          titleGuess: baseJob.titleGuess ?? result.titleGuess,
          job: {
            ...baseJob.job,
            warnings: uniqueStrings([...baseJob.job.warnings, ...itemWarnings]),
            updatedAt: finishedAt,
          },
          items: baseJob.items.map((item) =>
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
        }
      })
      setTitle((currentTitle) => currentTitle || result.titleGuess || inferDocumentTitle(reviewedJob, fileDrafts))
      return reviewedJob
    } catch (itemError) {
      const failedAt = new Date().toISOString()
      const failureReason = formatErrorMessage(itemError)
      return commitJob((latestJob) => {
        const baseJob = latestJob ?? runningJob
        return {
          ...baseJob,
          job: {
            ...baseJob.job,
            warnings: uniqueStrings([...baseJob.job.warnings, `${activeItem.sourceFileName}: ${failureReason}`]),
            updatedAt: failedAt,
          },
          items: baseJob.items.map((item) =>
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
        }
      })
    }
  }

  function selectFiles(selectedFiles: File[]): void {
    const limitedFiles = selectedFiles.slice(0, MAX_OCR_FILES)
    const sourcePageStart = Math.max(1, Math.round(appendStartSourcePageNumber))
    setFileDrafts(
      limitedFiles.map((file, index) => ({
        id: `${file.name}-${file.lastModified}-${index}`,
        file,
        title: '',
        sourcePageNumber: sourcePageStart + index,
      })),
    )
    setJobDraft(null)
    latestJobDraftRef.current = null
    setFocusedReviewId(null)
    setError('')
    setWarnings(selectedFiles.length > MAX_OCR_FILES ? [`Only the first ${MAX_OCR_FILES} files will be processed.`] : [])
    resetProgress()
    setStatus('idle')
  }

  function updateFileDraft(fileId: string, updates: Partial<OcrFileDraft>): void {
    setFileDrafts((drafts) => drafts.map((draft) => (draft.id === fileId ? { ...draft, ...updates } : draft)))
  }

  function moveFileDraft(fileId: string, direction: -1 | 1): void {
    setFileDrafts((drafts) => {
      const currentIndex = drafts.findIndex((draft) => draft.id === fileId)
      const targetIndex = currentIndex + direction
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= drafts.length) {
        return drafts
      }

      const nextDrafts = [...drafts]
      const [movedDraft] = nextDrafts.splice(currentIndex, 1)
      nextDrafts.splice(targetIndex, 0, movedDraft)
      return nextDrafts
    })
  }

  function updatePageDraft(pageId: string, updates: Partial<OcrJobItemPage>): void {
    if (!jobDraft) {
      return
    }

    const updatedAt = new Date().toISOString()
    commitJob({
      ...jobDraft,
      job: { ...jobDraft.job, updatedAt },
      items: jobDraft.items.map((item) => ({
        ...item,
        pages: item.pages.map((page) => (pageKey(item, page) === pageId ? { ...page, ...updates } : page)),
        updatedAt: item.pages.some((page) => pageKey(item, page) === pageId) ? updatedAt : item.updatedAt,
      })),
    })
  }

  function handleCreateDocument(): void {
    if (!jobDraft) {
      return
    }
    markJobSaved()
    onCreateDocument(title, pagesForSave)
  }

  function handleAppendPages(): void {
    if (!jobDraft) {
      return
    }
    markJobSaved()
    onAppendPages(appendTargetDocumentId ?? appendDocumentId, pagesForSave, selectedAppendChapterId)
  }

  function markJobSaved(): void {
    if (!jobDraft) {
      return
    }

    const savedAt = new Date().toISOString()
    commitJob({
      ...jobDraft,
      job: {
        ...jobDraft.job,
        status: 'saved',
        errorMessage: null,
        updatedAt: savedAt,
        completedAt: savedAt,
      },
    })
  }

  return (
    <section className="panel ocr-panel" data-tour="ocr">
      <div className="panel-header compact">
        <div>
          <span className="eyebrow">OCR</span>
          <h2>Import pages from scans</h2>
        </div>
        <span className={hasKey ? 'status-pill ok' : 'status-pill'}>{hasKey ? 'Key ready' : 'Key missing'}</span>
      </div>

      <p className="notice">
        Choose scans or PDFs here. Files go directly to Google with your Gemini key, then return as reviewed pages you can save into a document.
      </p>
      {stripImageMetadataBeforeOcr && (
        <p className="notice">
          Supported image files are re-encoded locally before OCR so embedded metadata is removed before upload.
        </p>
      )}

      {appendTargetDocumentId && (
        <div className="ocr-destination-panel">
          <div>
            <span className="eyebrow">Destination</span>
            <strong>{appendTargetDocument?.title ?? 'Selected document'}</strong>
            <span>
              {selectedAppendChapter
                ? `New pages will be added to ${selectedAppendChapter.title}.`
                : 'New pages will be added to this document.'}
            </span>
          </div>
          {appendTargetChapters.length > 0 && (
            <label className="field append-target-field">
              Add to chapter
              <select
                onChange={(event) => setAppendChapterId(event.target.value)}
                value={selectedAppendChapterId ?? ''}
              >
                {appendTargetChapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.title}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      <label className={hasKey ? 'ocr-file-dropzone' : 'ocr-file-dropzone disabled'}>
        <span>Choose scans or PDFs</span>
        <strong>{hasKey ? `Select up to ${MAX_OCR_FILES} files, then set their order` : 'Add a Gemini key in Settings to enable OCR'}</strong>
        <input
          accept="image/*,application/pdf"
          disabled={!hasKey || status === 'running'}
          multiple
          onChange={(event) => selectFiles(Array.from(event.target.files ?? []))}
          type="file"
        />
      </label>

      {fileDrafts.length > 0 && status !== 'running' && status !== 'review' && (
        <div className="ocr-file-list" aria-label="Selected OCR file order">
          <div className="ocr-file-list-header">
            <strong>{fileDrafts.length} file(s) selected</strong>
            <span>Set the reading order and source page metadata before OCR.</span>
            <span>Page title is optional; use it only when a page needs a short name in the organizer.</span>
          </div>
          {fileDrafts.map((draft, index) => (
            <article className="ocr-file-row" key={draft.id}>
              <div>
                <span className="eyebrow">Item {index + 1}</span>
                <strong>{draft.file.name}</strong>
              </div>
              <div className="ocr-file-controls">
                <button
                  className="ghost-button"
                  disabled={index === 0}
                  onClick={() => moveFileDraft(draft.id, -1)}
                  type="button"
                >
                  Up
                </button>
                <button
                  className="ghost-button"
                  disabled={index === fileDrafts.length - 1}
                  onClick={() => moveFileDraft(draft.id, 1)}
                  type="button"
                >
                  Down
                </button>
                <label className="field compact">
                  Page title (optional)
                  <input
                    aria-label={`Page title for ${draft.file.name}`}
                    onChange={(event) => updateFileDraft(draft.id, { title: event.target.value })}
                    placeholder="Shown in organizer"
                    value={draft.title}
                  />
                </label>
                <label className="field compact">
                  Source page
                  <input
                    aria-label={`Source page for ${draft.file.name}`}
                    inputMode="numeric"
                    onChange={(event) =>
                      updateFileDraft(draft.id, { sourcePageNumber: normalizeSourcePageNumber(event.target.value) })
                    }
                    value={draft.sourcePageNumber ?? ''}
                  />
                </label>
              </div>
            </article>
          ))}
        </div>
      )}
      {error && <span className="error-text">{error}</span>}
      {warnings.length > 0 && status !== 'review' && (
        <div className="ocr-warning-list" role="status">
          {warnings.map((warning) => (
            <span key={warning}>{warning}</span>
          ))}
        </div>
      )}
      {(status === 'running' || status === 'review') && (
        <div className="ocr-progress" aria-label="OCR progress">
          <div className="ocr-progress-header">
            <strong>{progressMessage || 'Preparing OCR.'}</strong>
            <span>{progressPercent}%</span>
          </div>
          <div
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={progressPercent}
            className="ocr-progress-bar"
            role="progressbar"
          >
            <span style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="ocr-progress-steps">
            {ocrProgressSteps.map((step) => (
              <span className={`ocr-progress-step ${progressState[step.stage]}`} key={step.stage}>
                {step.label}: {formatStageStatus(progressState[step.stage])}
              </span>
            ))}
          </div>
        </div>
      )}

      {isReviewAvailable ? (
        <>
          {!appendTargetDocumentId && (
            <label className="field">
              Document title
              <input onChange={(event) => setTitle(event.target.value)} value={title} />
            </label>
          )}
          {reviewEntries.length === 0 ? (
            <div className="empty-state">
              <strong>No OCR pages returned</strong>
              <span>Try another file or edit the scan before running OCR again.</span>
            </div>
          ) : (
            <div className="ocr-review-carousel">
              {warnings.length > 0 && (
                <div className="ocr-warning-list" role="status">
                  {warnings.map((warning) => (
                    <span key={warning}>{warning}</span>
                  ))}
                </div>
              )}
              <div className="ocr-review-summary" aria-label="OCR page review overview">
                {(['pending', 'approved', 'needs_attention', 'skipped', 'failed'] as OcrReviewEntryStatus[]).map(
                  (entryStatus) => (
                    <span className={`ocr-review-count ${entryStatus}`} key={entryStatus}>
                      {formatReviewEntryStatus(entryStatus)} {reviewSummary[entryStatus]}
                    </span>
                  ),
                )}
              </div>
              <div className="ocr-review-strip" aria-label="OCR review pages">
                {reviewEntries.map((entry, index) => (
                  <button
                    aria-current={focusedReviewEntry?.id === entry.id ? 'page' : undefined}
                    className={`ocr-review-step ${entry.status} ${focusedReviewEntry?.id === entry.id ? 'active' : ''}`}
                    key={entry.id}
                    onClick={() => setFocusedReviewId(entry.id)}
                    type="button"
                  >
                    <span>{index + 1}</span>
                    <strong>{formatReviewEntryStatus(entry.status)}</strong>
                  </button>
                ))}
              </div>
              {focusedReviewEntry && (
                <article className="ocr-job-item">
                  <div className="ocr-page-header">
                    <div>
                      <span className="eyebrow">
                        Review {focusedReviewIndex + 1} of {reviewEntries.length}
                      </span>
                      <h3>{formatReviewEntryTitle(focusedReviewEntry)}</h3>
                    </div>
                    <span className={`status-pill ${focusedReviewEntry.status === 'approved' ? 'ok' : ''}`}>
                      {formatReviewEntryStatus(focusedReviewEntry.status)}
                    </span>
                  </div>
                  <div className="ocr-review-nav">
                    <button
                      className="ghost-button"
                      disabled={focusedReviewIndex <= 0}
                      onClick={() => setFocusedReviewId(reviewEntries[focusedReviewIndex - 1]?.id ?? null)}
                      type="button"
                    >
                      Previous
                    </button>
                    <button
                      className="ghost-button"
                      disabled={focusedReviewIndex < 0 || focusedReviewIndex >= reviewEntries.length - 1}
                      onClick={() => setFocusedReviewId(reviewEntries[focusedReviewIndex + 1]?.id ?? null)}
                      type="button"
                    >
                      Next
                    </button>
                  </div>
                  {focusedReviewEntry.type === 'item' ? (
                    <>
                      <div className="ocr-page-meta">
                        <span>Item {focusedReviewEntry.item.orderIndex + 1}</span>
                        <span>Source page {focusedReviewEntry.item.sourcePageNumber ?? focusedReviewEntry.item.orderIndex + 1}</span>
                        {focusedReviewEntry.item.title && <span>{focusedReviewEntry.item.title}</span>}
                        {focusedReviewEntry.item.warnings.map((warning) => (
                          <span key={warning}>{warning}</span>
                        ))}
                      </div>
                      {focusedReviewEntry.item.status === 'failed' && (
                        <div className="ocr-warning-list" role="alert">
                          <span>{focusedReviewEntry.item.failureReason ?? 'OCR failed for this item.'}</span>
                          <div className="button-row">
                            <button
                              className="secondary-button"
                              onClick={() => void retryJobItem(focusedReviewEntry.item.id)}
                              type="button"
                            >
                              Retry
                            </button>
                            <button
                              className="ghost-button"
                              onClick={() => skipJobItem(focusedReviewEntry.item.id)}
                              type="button"
                            >
                              Skip
                            </button>
                            <button
                              className="ghost-button"
                              onClick={() => replacementInputs.current[focusedReviewEntry.item.id]?.click()}
                              type="button"
                            >
                              Replace file
                            </button>
                            <input
                              accept="image/*,application/pdf"
                              aria-label={`Replacement file for ${focusedReviewEntry.item.sourceFileName}`}
                              className="visually-hidden"
                              onChange={(event) => {
                                const replacement = event.target.files?.[0]
                                event.target.value = ''
                                if (replacement) {
                                  void replaceJobItemFile(focusedReviewEntry.item.id, replacement)
                                }
                              }}
                              ref={(element) => {
                                replacementInputs.current[focusedReviewEntry.item.id] = element
                              }}
                              type="file"
                            />
                          </div>
                        </div>
                      )}
                      {focusedReviewEntry.item.status === 'skipped' && (
                        <div className="empty-state">
                          <strong>Skipped</strong>
                          <span>This item will not be included when pages are saved.</span>
                        </div>
                      )}
                      {(focusedReviewEntry.item.status === 'queued' || focusedReviewEntry.item.status === 'running') && (
                        <div className="empty-state">
                          <strong>{formatItemStatus(focusedReviewEntry.item.status)}</strong>
                          <span>This item is still waiting for OCR output.</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <OcrFocusedPageEditor
                      entry={focusedReviewEntry}
                      onUpdatePage={updatePageDraft}
                      preservePageBreaks={preservePageBreaks}
                    />
                  )}
                </article>
              )}
            </div>
          )}
          <div className="ocr-save-actions">
            <span>
              {totalWords.toLocaleString()} total words across {pagesForSave.length} page(s)
              {hasBlockingItems ? ' - finish or resolve all items before saving' : ''}
              {!hasBlockingItems && hasUnapprovedPages ? ' - approve or skip every included page before saving' : ''}
            </span>
            <div className="button-row">
              {!appendTargetDocumentId && (
                <button
                  className="primary-button"
                  disabled={!canSavePages}
                  onClick={handleCreateDocument}
                  type="button"
                >
                  Create document from pages
                </button>
              )}
              {appendTargetDocumentId ? (
                <span className="append-target-note">
                  Adding to {appendTargetDocument?.title ?? 'selected document'}
                  {selectedAppendChapter ? ` / ${selectedAppendChapter.title}` : ''}
                </span>
              ) : (
                <label className="field append-target-field">
                  Append to
                  <select
                    disabled={availableDocuments.length === 0}
                    onChange={(event) => setAppendDocumentId(event.target.value)}
                    value={appendDocumentId}
                  >
                    {availableDocuments.length === 0 ? (
                      <option value="">No documents available</option>
                    ) : (
                      availableDocuments.map((document) => (
                        <option key={document.id} value={document.id}>
                          {document.title}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              )}
              <button
                className={appendTargetDocumentId ? 'primary-button' : 'secondary-button'}
                disabled={!canSavePages || !(appendTargetDocumentId ?? appendDocumentId)}
                onClick={handleAppendPages}
                type="button"
              >
                {appendTargetDocumentId ? 'Add reviewed pages' : 'Append pages'}
              </button>
            </div>
          </div>
        </>
      ) : (
        <button
          className="secondary-button"
          disabled={!hasKey || fileDrafts.length === 0 || status === 'running'}
          onClick={() => void startOcr()}
          type="button"
        >
          {status === 'running'
            ? 'Running OCR...'
            : fileDrafts.length > 0
              ? `Process ${fileDrafts.length} page(s)`
              : 'OCR disabled until files are selected'}
        </button>
      )}
    </section>
  )
}

function OcrFocusedPageEditor({
  entry,
  onUpdatePage,
  preservePageBreaks,
}: {
  entry: OcrReviewPageEntry
  onUpdatePage: (pageId: string, updates: Partial<OcrJobItemPage>) => void
  preservePageBreaks: boolean
}) {
  const cleanedText = cleanReadingText(entry.page.text, { preservePageBreaks })
  const wordCount = countWords(cleanedText)
  const pageId = pageKey(entry.item, entry.page)

  return (
    <article className="ocr-page-card">
      <div className="ocr-page-header">
        <div>
          <span className="eyebrow">Page {entry.page.pageNumber}</span>
          <h3>{entry.page.sourceFileName ?? `Source page ${entry.page.sourcePageNumber ?? entry.pageIndex + 1}`}</h3>
        </div>
        <span className="status-pill">{wordCount.toLocaleString()} words</span>
      </div>
      <div className="ocr-page-meta">
        <span>Item {entry.item.orderIndex + 1}</span>
        <span>Source page {entry.page.sourcePageNumber ?? entry.pageIndex + 1}</span>
        {entry.page.sourceFileName && <span>{entry.page.sourceFileName}</span>}
        {entry.page.ocrConfidence !== null && <span>{Math.round(entry.page.ocrConfidence * 100)}% confidence</span>}
        {entry.page.uncertainSpans.length > 0 && <span>{entry.page.uncertainSpans.length} uncertain span(s)</span>}
      </div>
      {entry.page.reviewStatus === 'skipped' && (
        <div className="empty-state compact">
          <strong>Skipped page</strong>
          <span>This page is preserved in the OCR job but excluded from save.</span>
        </div>
      )}
      <label className="field">
        Review status
        <select
          onChange={(event) => onUpdatePage(pageId, { reviewStatus: event.target.value as OcrJobPageReviewStatus })}
          value={entry.page.reviewStatus}
        >
          <option value="reviewed">Approved</option>
          <option value="needs_attention">Needs attention</option>
          <option value="unreviewed">Unreviewed</option>
          <option value="skipped">Skipped</option>
        </select>
      </label>
      <label className="field">
        Page title (optional)
        <input
          onChange={(event) => onUpdatePage(pageId, { title: event.target.value })}
          placeholder="Shown in organizer"
          value={entry.page.title ?? ''}
        />
      </label>
      <label className="field">
        Notes
        <input
          onChange={(event) => onUpdatePage(pageId, { ocrNotes: event.target.value })}
          placeholder="OCR notes or review notes"
          value={entry.page.ocrNotes ?? ''}
        />
      </label>
      <label className="field">
        Source page number
        <input
          inputMode="numeric"
          onChange={(event) => onUpdatePage(pageId, { sourcePageNumber: normalizeSourcePageNumber(event.target.value) })}
          placeholder="Optional"
          type="text"
          value={entry.page.sourcePageNumber ?? ''}
        />
      </label>
      <label className="field">
        Page text
        <textarea
          className="ocr-page-textarea"
          onChange={(event) => onUpdatePage(pageId, { text: event.target.value })}
          value={entry.page.text}
        />
      </label>
    </article>
  )
}

function createJobDraft(
  fileDrafts: OcrFileDraft[],
  documentId: string | null,
  targetChapterId: string | null,
): OcrJobDraft {
  const now = new Date().toISOString()
  const jobId = crypto.randomUUID()
  return {
    job: {
      id: jobId,
      documentId,
      targetChapterId,
      status: 'queued',
      modelId: OCR_MODEL_ID,
      inputFileCount: fileDrafts.length,
      promptVersion: OCR_PROMPT_VERSION,
      warnings: [],
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    },
    titleGuess: null,
    items: fileDrafts.map((draft, index) => ({
      id: crypto.randomUUID(),
      jobId,
      orderIndex: index,
      sourceFileName: draft.file.name,
      sourceFileType: draft.file.type,
      sourceFileSize: draft.file.size,
      sourceFileLastModified: draft.file.lastModified,
      sourcePageNumber: draft.sourcePageNumber,
      title: draft.title.trim() || null,
      status: 'queued',
      ocrText: null,
      pages: [],
      warnings: [],
      failureReason: null,
      createdAt: now,
      updatedAt: now,
      file: draft.file,
    })),
  }
}

function finalizeJobAfterProcessing(jobDraft: OcrJobDraft): OcrJobDraft {
  const now = new Date().toISOString()
  const hasRunningItems = jobDraft.items.some((item) => item.status === 'queued' || item.status === 'running')
  const hasReviewItems = jobDraft.items.some((item) => item.status === 'review')
  const hasFailedItems = jobDraft.items.some((item) => item.status === 'failed')
  const status: OcrJob['status'] = hasRunningItems ? 'running' : hasReviewItems || hasFailedItems ? 'review' : 'failed'

  return {
    ...jobDraft,
    job: {
      ...jobDraft.job,
      status,
      errorMessage: hasReviewItems || hasFailedItems ? null : 'No OCR pages returned.',
      updatedAt: now,
      completedAt: hasRunningItems ? null : now,
    },
  }
}

function buildJobItemPage(
  page: OcrResultPage,
  item: OcrJobItemDraft,
  sourceFile: File,
  pageIndex: number,
  itemPageCount: number,
): OcrJobItemPage {
  return {
    pageNumber: pageIndex + 1,
    title: itemPageCount === 1 ? item.title : item.title ? `${item.title} ${pageIndex + 1}` : null,
    text: page.text,
    reviewStatus: inferReviewStatus(page.uncertainSpans.length, page.confidence, page.notes),
    sourcePageNumber:
      page.sourcePageNumber ??
      (itemPageCount === 1 && item.sourcePageNumber !== null ? item.sourcePageNumber : null) ??
      page.pageNumber,
    ocrConfidence: page.confidence,
    ocrNotes: page.notes,
    uncertainSpans: page.uncertainSpans,
    sourceFileName: page.sourceFileName ?? item.sourceFileName,
    sourceKind: inferSourceKind(sourceFile),
  }
}

function buildReviewEntries(items: OcrJobItemDraft[]): OcrReviewEntry[] {
  return [...items]
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .flatMap((item): OcrReviewEntry[] => {
      if (item.status === 'queued' || item.status === 'running') {
        return [{ id: item.id, type: 'item', item, status: 'pending' as const }]
      }

      if (item.status === 'failed') {
        return [{ id: item.id, type: 'item', item, status: 'failed' as const }]
      }

      if (item.status === 'skipped') {
        return [{ id: item.id, type: 'item', item, status: 'skipped' as const }]
      }

      return item.pages.map((page, pageIndex) => ({
        id: pageKey(item, page),
        type: 'page' as const,
        item,
        page,
        pageIndex,
        status: formatPageReviewEntryStatus(page.reviewStatus),
      }))
    })
}

function summarizeReviewEntries(entries: OcrReviewEntry[]): OcrReviewSummary {
  return entries.reduce<OcrReviewSummary>(
    (summary, entry) => ({
      ...summary,
      [entry.status]: summary[entry.status] + 1,
    }),
    {
      pending: 0,
      approved: 0,
      needs_attention: 0,
      skipped: 0,
      failed: 0,
    },
  )
}

function buildReviewedPages(items: OcrJobItemDraft[], preservePageBreaks: boolean): OcrPageInput[] {
  let nextPageNumber = 1
  return items
    .filter((item) => item.status === 'review')
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .flatMap((item) =>
      item.pages.filter((page) => page.reviewStatus === 'reviewed').map((page) => {
        const reviewedPage: OcrPageInput = {
          pageNumber: nextPageNumber,
          title: page.title,
          text: preservePageBreaks ? page.text : page.text.replace(/\f/g, '\n'),
          reviewStatus: 'reviewed',
          sourcePageNumber: page.sourcePageNumber,
          ocrConfidence: page.ocrConfidence,
          ocrNotes: page.ocrNotes?.trim() || null,
          uncertainSpans: page.uncertainSpans,
          sourceFileName: page.sourceFileName,
          sourceKind: page.sourceKind,
        }
        nextPageNumber += 1
        return reviewedPage
      }),
    )
}

function calculateProgressPercent(
  status: 'idle' | 'running' | 'review' | 'failed',
  items: OcrJobItemDraft[],
  progressState: Record<OcrPipelineStage, OcrStageState>,
): number {
  if (status === 'review') {
    return 100
  }
  if (!items.length) {
    return 0
  }

  const completedItems = items.filter((item) => item.status === 'review' || item.status === 'failed' || item.status === 'skipped').length
  const runningItem = items.some((item) => item.status === 'running') ? 1 : 0
  const completedStages = ocrProgressSteps.filter(({ stage }) => ['done', 'failed'].includes(progressState[stage])).length
  const runningProgress = runningItem ? completedStages / ocrProgressSteps.length : 0
  return Math.round(((completedItems + runningProgress) / items.length) * 100)
}

function inferDocumentTitle(jobDraft: OcrJobDraft, fallbackDrafts: OcrFileDraft[]): string {
  if (jobDraft.titleGuess) {
    return jobDraft.titleGuess
  }

  const firstReviewItem = jobDraft.items.find((item) => item.status === 'review')
  return firstReviewItem?.sourceFileName.replace(/\.[^.]+$/, '') ?? fallbackDrafts[0]?.file.name.replace(/\.[^.]+$/, '') ?? 'OCR import'
}

function pageKey(item: OcrJobItem, page: OcrJobItemPage): string {
  return `${item.id}:page:${page.pageNumber}`
}

function stripRuntimeFile(item: OcrJobItemDraft): OcrJobItem {
  const serializableItem = { ...item } as Partial<OcrJobItemDraft>
  delete serializableItem.file
  return serializableItem as OcrJobItem
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function formatStageStatus(status: OcrStageState): string {
  if (status === 'done') {
    return 'done'
  }
  if (status === 'failed') {
    return 'fallback'
  }
  if (status === 'running') {
    return 'running'
  }

  return 'waiting'
}

function formatItemStatus(status: OcrJobItemStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued'
    case 'running':
      return 'Running'
    case 'review':
      return 'Ready'
    case 'failed':
      return 'Failed'
    case 'skipped':
      return 'Skipped'
  }
}

function formatPageReviewEntryStatus(status: OcrJobPageReviewStatus): OcrReviewEntryStatus {
  if (status === 'reviewed') {
    return 'approved'
  }
  if (status === 'skipped') {
    return 'skipped'
  }

  return 'needs_attention'
}

function formatReviewEntryStatus(status: OcrReviewEntryStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending'
    case 'approved':
      return 'Approved'
    case 'needs_attention':
      return 'Needs attention'
    case 'skipped':
      return 'Skipped'
    case 'failed':
      return 'Failed'
  }
}

function formatReviewEntryTitle(entry: OcrReviewEntry): string {
  if (entry.type === 'item') {
    return entry.item.sourceFileName
  }

  return entry.page.title?.trim() || entry.page.sourceFileName || `Source page ${entry.page.sourcePageNumber ?? entry.pageIndex + 1}`
}

function normalizeSourcePageNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
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

function inferReviewStatus(
  uncertainSpanCount: number,
  confidence: number | null,
  notes: string | null,
): OcrReviewStatus {
  if (uncertainSpanCount > 0 || notes || (confidence !== null && confidence < 0.8)) {
    return 'needs_attention'
  }

  return 'reviewed'
}

function inferSourceKind(file: File): OcrPageInput['sourceKind'] {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    return 'pdf'
  }

  if (file.type.startsWith('image/')) {
    return 'image'
  }

  return null
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'OCR failed'
}
