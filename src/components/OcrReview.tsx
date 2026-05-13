import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Filter, GripVertical } from 'lucide-react'
import { cleanReadingText } from '../lib/text/cleanup'
import { countWords } from '../lib/text/wordCount'
import { getDefaultPageTitle } from '../app/structuredDocuments'
import {
  OCR_PROGRESS_STEPS,
  initialOcrProgressState,
  useAppStore,
  type OcrFileInput,
  type OcrPageInput,
  type OcrStageState,
} from '../app/store'
import type { OcrPipelineStage } from '../lib/ai/geminiOcr'
import type {
  DocumentChapterRecord,
  DocumentRecord,
  OcrJob,
  OcrJobItem,
  OcrJobItemPage,
  OcrJobItemStatus,
  OcrJobPageReviewStatus,
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
  onOpenJobCosts?: (ocrJobId: string) => void
}

type OcrFileDraft = OcrFileInput & {
  id: string
}

type OcrReviewEntryStatus = 'pending' | 'approved' | 'needs_attention' | 'skipped' | 'failed'

type OcrReviewPageEntry = {
  id: string
  type: 'page'
  item: OcrJobItem
  page: OcrJobItemPage
  pageIndex: number
  status: OcrReviewEntryStatus
}

type OcrReviewItemEntry = {
  id: string
  type: 'item'
  item: OcrJobItem
  status: OcrReviewEntryStatus
}

type OcrReviewEntry = OcrReviewPageEntry | OcrReviewItemEntry

type OcrReviewSummary = Record<OcrReviewEntryStatus, number>
type OcrFileSortMode = 'name_asc' | 'name_desc' | 'modified_asc' | 'modified_desc' | 'manual'

const MAX_OCR_FILES = 25
const fileNameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const OCR_FILE_SORT_OPTIONS: Array<{ mode: OcrFileSortMode; label: string }> = [
  { mode: 'name_asc', label: 'Filename A-Z' },
  { mode: 'name_desc', label: 'Filename Z-A' },
  { mode: 'modified_asc', label: 'Modified oldest first' },
  { mode: 'modified_desc', label: 'Modified newest first' },
  { mode: 'manual', label: 'Manual order' },
]

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
  onOpenJobCosts,
}: OcrReviewProps) {
  const [fileDrafts, setFileDrafts] = useState<OcrFileDraft[]>([])
  const [appendDocumentId, setAppendDocumentId] = useState('')
  const [fileSortMode, setFileSortMode] = useState<OcrFileSortMode>('name_asc')
  const [startSourcePageDraft, setStartSourcePageDraft] = useState(() =>
    Math.max(1, Math.round(appendStartSourcePageNumber)).toString(),
  )
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false)
  const [draggedFileDraftId, setDraggedFileDraftId] = useState<string | null>(null)
  const [fileDragOverId, setFileDragOverId] = useState<string | null>(null)
  const [focusedReviewId, setFocusedReviewId] = useState<string | null>(null)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [selectionWarnings, setSelectionWarnings] = useState<string[]>([])
  const replacementInputs = useRef<Record<string, HTMLInputElement | null>>({})
  const startSourcePageTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ocrJobs = useAppStore((state) => state.ocrJobs)
  const ocrJobItems = useAppStore((state) => state.ocrJobItems)
  const ocrRuntimeJobs = useAppStore((state) => state.ocrRuntimeJobs)
  const startOcrJob = useAppStore((state) => state.startOcrJob)
  const retryOcrJobItem = useAppStore((state) => state.retryOcrJobItem)
  const replaceOcrJobItemFile = useAppStore((state) => state.replaceOcrJobItemFile)
  const skipOcrJobItem = useAppStore((state) => state.skipOcrJobItem)
  const approveAllOcrJobReviewPages = useAppStore((state) => state.approveAllOcrJobReviewPages)
  const updateOcrJobPage = useAppStore((state) => state.updateOcrJobPage)
  const markOcrJobSaved = useAppStore((state) => state.markOcrJobSaved)
  const setOcrJobDocumentTitle = useAppStore((state) => state.setOcrJobDocumentTitle)
  const availableDocuments = documents.filter((document) => !document.archivedAt)
  const appendTargetDocument = appendTargetDocumentId
    ? availableDocuments.find((document) => document.id === appendTargetDocumentId) ?? null
    : null
  const appendTargetChapters = appendTargetDocumentId
    ? documentChapters
        .filter((chapter) => chapter.documentId === appendTargetDocumentId)
        .sort((left, right) => left.sortOrder - right.sortOrder)
    : []
  const selectedAppendChapterIdBeforeJob = appendTargetDocumentId
    ? appendTargetChapterId || appendTargetChapters[appendTargetChapters.length - 1]?.id || null
    : null
  const scopedJobs = useMemo(
    () =>
      ocrJobs
        .filter(
          (job) =>
            job.documentId === (appendTargetDocumentId ?? null) &&
            job.status !== 'saved' &&
            job.status !== 'cancelled',
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [appendTargetDocumentId, ocrJobs],
  )
  const activeJob =
    selectedJobId && scopedJobs.some((job) => job.id === selectedJobId)
      ? scopedJobs.find((job) => job.id === selectedJobId) ?? null
      : scopedJobs[0] ?? null
  const runtimeJob = activeJob ? ocrRuntimeJobs[activeJob.id] : null
  const selectedAppendChapterId = activeJob?.targetChapterId ?? selectedAppendChapterIdBeforeJob
  const selectedAppendChapter =
    appendTargetChapters.find((chapter) => chapter.id === selectedAppendChapterId) ??
    appendTargetChapters[appendTargetChapters.length - 1] ??
    null
  const jobItems = useMemo(
    () =>
      activeJob
        ? ocrJobItems
            .filter((item) => item.jobId === activeJob.id)
            .sort((left, right) => left.orderIndex - right.orderIndex)
        : [],
    [activeJob, ocrJobItems],
  )
  const reviewEntries = useMemo(() => buildReviewEntries(jobItems), [jobItems])
  const focusedReviewEntry =
    reviewEntries.find((entry) => entry.id === focusedReviewId) ??
    reviewEntries.find((entry) => entry.type === 'page' && entry.item.id === focusedReviewId) ??
    reviewEntries[0] ??
    null
  const focusedReviewIndex = focusedReviewEntry
    ? reviewEntries.findIndex((entry) => entry.id === focusedReviewEntry.id)
    : -1
  const reviewSummary = useMemo(() => summarizeReviewEntries(reviewEntries), [reviewEntries])
  const reviewablePageCount = useMemo(() => countReviewablePages(jobItems), [jobItems])
  const pagesForSave = useMemo(() => buildReviewedPages(jobItems, preservePageBreaks), [jobItems, preservePageBreaks])
  const hasBlockingItems = jobItems.some((item) => item.status === 'queued' || item.status === 'running' || item.status === 'failed')
  const hasUnapprovedPages = jobItems.some(
    (item) =>
      item.status === 'review' &&
      item.pages.some((page) => page.reviewStatus !== 'reviewed' && page.reviewStatus !== 'skipped'),
  )
  const isReviewAvailable = Boolean(activeJob) && activeJob?.status !== 'queued'
  const totalWords = useMemo(
    () => pagesForSave.reduce((total, page) => total + countWords(cleanReadingText(page.text, { preservePageBreaks })), 0),
    [pagesForSave, preservePageBreaks],
  )
  const canSavePages = totalWords > 0 && !hasBlockingItems && !hasUnapprovedPages
  const progressState = runtimeJob?.progressState ?? deriveProgressState(activeJob, jobItems)
  const progressMessage = runtimeJob?.progressMessage || formatJobProgressMessage(activeJob)
  const progressPercent = calculateProgressPercent(activeJob?.status ?? 'idle', jobItems, progressState)
  const isRunning = activeJob?.status === 'running' || jobItems.some((item) => item.status === 'queued' || item.status === 'running')
  const warnings = activeJob?.warnings ?? selectionWarnings
  const error = runtimeJob?.error ?? activeJob?.errorMessage ?? ''
  const documentTitle = activeJob ? runtimeJob?.documentTitle || inferDocumentTitle(jobItems, fileDrafts) : ''

  const appendDocumentValue = appendDocumentId || availableDocuments[0]?.id || ''

  useEffect(
    () => () => {
      if (startSourcePageTimer.current) {
        clearTimeout(startSourcePageTimer.current)
      }
    },
    [],
  )

  function startOcr(selectedDrafts = fileDrafts): void {
    if (!selectedDrafts.length || !hasKey) {
      return
    }

    const jobId = startOcrJob({
      files: selectedDrafts,
      documentId: appendTargetDocumentId ?? null,
      targetChapterId: selectedAppendChapterIdBeforeJob,
      loadApiKey,
      stripImageMetadataBeforeOcr,
    })
    if (!jobId) {
      return
    }
    setSelectedJobId(jobId)
    setFocusedReviewId(null)
    setSelectionWarnings([])
    setFileDrafts([])
  }

  function selectFiles(selectedFiles: File[]): void {
    const limitedFiles = sortFilesByMode(selectedFiles, 'name_asc').slice(0, MAX_OCR_FILES)
    const sourcePageStart = Math.max(1, Math.round(appendStartSourcePageNumber))
    setStartSourcePageDraft(sourcePageStart.toString())
    setFileDrafts(
      limitedFiles.map((file, index) => ({
        id: `${file.name}-${file.lastModified}-${index}`,
        file,
        title: '',
        sourcePageNumber: sourcePageStart + index,
      })),
    )
    setFileSortMode('name_asc')
    setIsSortMenuOpen(false)
    setFocusedReviewId(null)
    setSelectionWarnings(selectedFiles.length > MAX_OCR_FILES ? [`Only the first ${MAX_OCR_FILES} files will be processed.`] : [])
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
      return renumberFileDrafts(nextDrafts, appendStartSourcePageNumber)
    })
    setFileSortMode('manual')
  }

  function applyFileSort(mode: OcrFileSortMode): void {
    setFileDrafts((drafts) => {
      const sortedDrafts = sortFileDraftsByMode(drafts, mode)
      return renumberFileDrafts(sortedDrafts, appendStartSourcePageNumber)
    })
    setFileSortMode(mode)
    setIsSortMenuOpen(false)
  }

  function applyStartSourcePage(value: string): void {
    const startPage = normalizeSourcePageNumber(value)
    if (startSourcePageTimer.current) {
      clearTimeout(startSourcePageTimer.current)
      startSourcePageTimer.current = null
    }
    if (startPage === null) {
      return
    }

    setFileDrafts((drafts) => renumberFileDraftsFromStart(drafts, startPage))
  }

  function scheduleStartSourcePage(value: string): void {
    if (startSourcePageTimer.current) {
      clearTimeout(startSourcePageTimer.current)
    }
    startSourcePageTimer.current = setTimeout(() => {
      applyStartSourcePage(value)
    }, 2000)
  }

  function moveFileDraftTo(fileId: string, targetFileId: string): void {
    if (fileId === targetFileId) {
      return
    }

    setFileDrafts((drafts) => {
      const currentIndex = drafts.findIndex((draft) => draft.id === fileId)
      const targetIndex = drafts.findIndex((draft) => draft.id === targetFileId)
      if (currentIndex < 0 || targetIndex < 0) {
        return drafts
      }

      const nextDrafts = [...drafts]
      const [movedDraft] = nextDrafts.splice(currentIndex, 1)
      nextDrafts.splice(targetIndex, 0, movedDraft)
      return renumberFileDrafts(nextDrafts, appendStartSourcePageNumber)
    })
    setFileSortMode('manual')
  }

  function handleCreateDocument(): void {
    if (!activeJob) {
      return
    }
    markOcrJobSaved(activeJob.id)
    onCreateDocument(documentTitle, pagesForSave)
  }

  function handleAppendPages(): void {
    if (!activeJob) {
      return
    }
    markOcrJobSaved(activeJob.id)
    onAppendPages(appendTargetDocumentId ?? appendDocumentValue, pagesForSave, selectedAppendChapterId)
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
        </div>
      )}

      {scopedJobs.length > 0 && (
        <div className="ocr-job-status-list" aria-label="OCR jobs">
          {scopedJobs.map((job, index) => {
            const items = ocrJobItems.filter((item) => item.jobId === job.id)
            return (
              <button
                aria-current={activeJob?.id === job.id ? 'page' : undefined}
                className={`ocr-job-status ${activeJob?.id === job.id ? 'active' : ''}`}
                key={job.id}
                onClick={() => {
                  setSelectedJobId(job.id)
                  setFocusedReviewId(null)
                }}
                type="button"
              >
                <span className="eyebrow">OCR job {index + 1}</span>
                <strong>{formatJobStatus(job.status)}</strong>
                <span>{summarizeJobItems(items)}</span>
              </button>
            )
          })}
        </div>
      )}

      <label className={hasKey ? 'ocr-file-dropzone' : 'ocr-file-dropzone disabled'}>
        <span>Choose scans or PDFs</span>
        <strong>{hasKey ? `Select up to ${MAX_OCR_FILES} files, then set their order` : 'Add a Gemini key in Settings to enable OCR'}</strong>
        <input
          accept="image/*,application/pdf"
          disabled={!hasKey || isRunning}
          multiple
          onChange={(event) => selectFiles(Array.from(event.target.files ?? []))}
          type="file"
        />
      </label>

      {fileDrafts.length > 0 && !isRunning && !isReviewAvailable && (
        <div className="ocr-file-list" aria-label="Selected OCR file order">
          <div className="ocr-file-list-header">
            <div>
              <strong>{fileDrafts.length} file(s) selected</strong>
              <span>Set the reading order and source page metadata before OCR.</span>
              <span>Page title is optional; use it only when a page needs a short name in the organizer.</span>
            </div>
            <label className="field compact ocr-start-page-field">
              Start page
              <input
                aria-label="Starting source page"
                inputMode="numeric"
                onBlur={() => applyStartSourcePage(startSourcePageDraft)}
                onChange={(event) => {
                  setStartSourcePageDraft(event.target.value)
                  scheduleStartSourcePage(event.target.value)
                }}
                value={startSourcePageDraft}
              />
            </label>
            <div className="ocr-sort-menu">
              <button
                aria-label="Sort OCR files"
                aria-expanded={isSortMenuOpen}
                aria-haspopup="menu"
                className="icon-button"
                onClick={() => setIsSortMenuOpen((isOpen) => !isOpen)}
                title="Sort OCR files"
                type="button"
              >
                <Filter aria-hidden="true" size={16} />
              </button>
              {isSortMenuOpen && (
                <div className="ocr-sort-popout" role="menu">
                  {OCR_FILE_SORT_OPTIONS.map((option) => (
                    <button
                      aria-current={fileSortMode === option.mode ? 'true' : undefined}
                      key={option.mode}
                      onClick={() => applyFileSort(option.mode)}
                      role="menuitem"
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {fileDrafts.map((draft, index) => (
            <article
              className={`ocr-file-row ${draggedFileDraftId === draft.id ? 'dragging' : ''} ${fileDragOverId === draft.id ? 'drag-over' : ''}`}
              draggable
              key={draft.id}
              onDragEnd={() => {
                setDraggedFileDraftId(null)
                setFileDragOverId(null)
              }}
              onDragOver={(event) => {
                event.preventDefault()
                setFileDragOverId(draft.id)
              }}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', draft.id)
                setDraggedFileDraftId(draft.id)
              }}
              onDrop={(event) => {
                event.preventDefault()
                const movedFileId = event.dataTransfer.getData('text/plain') || draggedFileDraftId
                if (movedFileId) {
                  moveFileDraftTo(movedFileId, draft.id)
                }
                setDraggedFileDraftId(null)
                setFileDragOverId(null)
              }}
            >
              <div>
                <span className="eyebrow">
                  <GripVertical aria-hidden="true" size={14} /> Item {index + 1}
                </span>
                <strong>{draft.file.name}</strong>
              </div>
              <div className="ocr-file-controls">
                <button
                  aria-label={`Move ${draft.file.name} up`}
                  className="icon-button"
                  disabled={index === 0}
                  onClick={() => moveFileDraft(draft.id, -1)}
                  title="Move up"
                  type="button"
                >
                  <ArrowUp aria-hidden="true" size={16} />
                </button>
                <button
                  aria-label={`Move ${draft.file.name} down`}
                  className="icon-button"
                  disabled={index === fileDrafts.length - 1}
                  onClick={() => moveFileDraft(draft.id, 1)}
                  title="Move down"
                  type="button"
                >
                  <ArrowDown aria-hidden="true" size={16} />
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
      {warnings.length > 0 && !isReviewAvailable && (
        <div className="ocr-warning-list" role="status">
          {warnings.map((warning) => (
            <span key={warning}>{warning}</span>
          ))}
        </div>
      )}
      {activeJob && (
        <div className="ocr-progress" aria-label="OCR progress">
          <div className="ocr-progress-header">
            <strong>{progressMessage || 'Preparing OCR.'}</strong>
            {onOpenJobCosts && (
              <button className="ghost-button" onClick={() => onOpenJobCosts(activeJob.id)} type="button">
                View job costs
              </button>
            )}
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
            {OCR_PROGRESS_STEPS.map((step) => (
              <span className={`ocr-progress-step ${progressState[step.stage]}`} key={step.stage}>
                {step.label}: {formatStageStatus(progressState[step.stage])}
              </span>
            ))}
          </div>
        </div>
      )}

      {isReviewAvailable && activeJob ? (
        <>
          {!appendTargetDocumentId && (
            <label className="field">
              Document title
              <input onChange={(event) => setOcrJobDocumentTitle(activeJob.id, event.target.value)} value={documentTitle} />
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
                {reviewablePageCount > 0 && (
                  <button
                    className="secondary-button ocr-accept-all-button"
                    onClick={() => approveAllOcrJobReviewPages(activeJob.id)}
                    type="button"
                  >
                    Accept all
                  </button>
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
                            {runtimeJob?.filesByItemId[focusedReviewEntry.item.id] && (
                              <button
                                className="secondary-button"
                                disabled={!hasKey}
                                onClick={() =>
                                  retryOcrJobItem(activeJob.id, focusedReviewEntry.item.id, {
                                    loadApiKey,
                                    stripImageMetadataBeforeOcr,
                                  })
                                }
                                type="button"
                              >
                                Retry
                              </button>
                            )}
                            <button
                              className="ghost-button"
                              onClick={() => skipOcrJobItem(activeJob.id, focusedReviewEntry.item.id)}
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
                                  replaceOcrJobItemFile(activeJob.id, focusedReviewEntry.item.id, replacement, {
                                    loadApiKey,
                                    stripImageMetadataBeforeOcr,
                                  })
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
                      onUpdatePage={(itemId, pageNumber, updates) => updateOcrJobPage(activeJob.id, itemId, pageNumber, updates)}
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
                    value={appendDocumentValue}
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
                disabled={!canSavePages || !(appendTargetDocumentId ?? appendDocumentValue)}
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
          disabled={!hasKey || fileDrafts.length === 0 || isRunning}
          onClick={() => startOcr()}
          type="button"
        >
          {isRunning
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
  onUpdatePage: (itemId: string, pageNumber: number, updates: Partial<OcrJobItemPage>) => void
  preservePageBreaks: boolean
}) {
  const cleanedText = cleanReadingText(entry.page.text, { preservePageBreaks })
  const wordCount = countWords(cleanedText)
  const displayTitle = entry.page.title?.trim() || getDefaultPageTitle(entry.page)

  return (
    <article className="ocr-page-card">
      <div className="ocr-page-header">
        <div>
          <span className="eyebrow">Page {entry.page.pageNumber}</span>
          <h3>{displayTitle}</h3>
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
          onChange={(event) =>
            onUpdatePage(entry.item.id, entry.page.pageNumber, {
              reviewStatus: event.target.value as OcrJobPageReviewStatus,
            })
          }
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
          onChange={(event) => onUpdatePage(entry.item.id, entry.page.pageNumber, { title: event.target.value })}
          placeholder={getDefaultPageTitle(entry.page)}
          value={entry.page.title ?? ''}
        />
      </label>
      <label className="field">
        Notes
        <input
          onChange={(event) => onUpdatePage(entry.item.id, entry.page.pageNumber, { ocrNotes: event.target.value })}
          placeholder="OCR notes or review notes"
          value={entry.page.ocrNotes ?? ''}
        />
      </label>
      <label className="field">
        Source page number
        <input
          inputMode="numeric"
          onChange={(event) =>
            onUpdatePage(entry.item.id, entry.page.pageNumber, {
              sourcePageNumber: normalizeSourcePageNumber(event.target.value),
            })
          }
          placeholder="Optional"
          type="text"
          value={entry.page.sourcePageNumber ?? ''}
        />
      </label>
      <label className="field">
        Page text
        <textarea
          className="ocr-page-textarea"
          onChange={(event) => onUpdatePage(entry.item.id, entry.page.pageNumber, { text: event.target.value })}
          value={entry.page.text}
        />
      </label>
    </article>
  )
}

function buildReviewEntries(items: OcrJobItem[]): OcrReviewEntry[] {
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

function countReviewablePages(items: OcrJobItem[]): number {
  return items
    .filter((item) => item.status === 'review')
    .reduce(
      (total, item) =>
        total + item.pages.filter((page) => page.reviewStatus !== 'reviewed' && page.reviewStatus !== 'skipped').length,
      0,
    )
}

function buildReviewedPages(items: OcrJobItem[], preservePageBreaks: boolean): OcrPageInput[] {
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
  status: OcrJob['status'] | 'idle',
  items: OcrJobItem[],
  progressState: Record<OcrPipelineStage, OcrStageState>,
): number {
  if (status === 'review' || status === 'saved') {
    return 100
  }
  if (!items.length) {
    return 0
  }

  const completedItems = items.filter((item) => item.status === 'review' || item.status === 'failed' || item.status === 'skipped').length
  const runningItem = items.some((item) => item.status === 'running') ? 1 : 0
  const completedStages = OCR_PROGRESS_STEPS.filter(({ stage }) => ['done', 'failed'].includes(progressState[stage])).length
  const runningProgress = runningItem ? completedStages / OCR_PROGRESS_STEPS.length : 0
  return Math.round(((completedItems + runningProgress) / items.length) * 100)
}

function deriveProgressState(
  job: OcrJob | null,
  items: OcrJobItem[],
): Record<OcrPipelineStage, OcrStageState> {
  if (!job || !items.some((item) => item.status === 'running')) {
    return { ...initialOcrProgressState }
  }

  return {
    ...initialOcrProgressState,
    ocr: 'running',
  }
}

function inferDocumentTitle(items: OcrJobItem[], fallbackDrafts: OcrFileDraft[]): string {
  const firstReviewItem = items.find((item) => item.status === 'review')
  return firstReviewItem?.sourceFileName.replace(/\.[^.]+$/, '') ?? fallbackDrafts[0]?.file.name.replace(/\.[^.]+$/, '') ?? 'OCR import'
}

function sortFilesByMode(files: File[], mode: OcrFileSortMode): File[] {
  return [...files].sort((left, right) => compareFilesByMode(left, right, mode))
}

function sortFileDraftsByMode(drafts: OcrFileDraft[], mode: OcrFileSortMode): OcrFileDraft[] {
  if (mode === 'manual') {
    return [...drafts]
  }

  return [...drafts].sort((left, right) => compareFilesByMode(left.file, right.file, mode))
}

function compareFilesByMode(left: File, right: File, mode: OcrFileSortMode): number {
  switch (mode) {
    case 'name_desc':
      return fileNameCollator.compare(right.name, left.name) || right.lastModified - left.lastModified
    case 'modified_asc':
      return left.lastModified - right.lastModified || fileNameCollator.compare(left.name, right.name)
    case 'modified_desc':
      return right.lastModified - left.lastModified || fileNameCollator.compare(left.name, right.name)
    case 'manual':
    case 'name_asc':
      return fileNameCollator.compare(left.name, right.name) || left.lastModified - right.lastModified
  }
}

function renumberFileDrafts(drafts: OcrFileDraft[], fallbackStartPage: number): OcrFileDraft[] {
  const sourcePageNumbers = drafts
    .map((draft) => draft.sourcePageNumber)
    .filter((pageNumber): pageNumber is number => typeof pageNumber === 'number' && Number.isFinite(pageNumber))
  const firstPage = sourcePageNumbers.length
    ? Math.max(1, Math.round(Math.min(...sourcePageNumbers)))
    : Math.max(1, Math.round(fallbackStartPage))

  return renumberFileDraftsFromStart(drafts, firstPage)
}

function renumberFileDraftsFromStart(drafts: OcrFileDraft[], firstPage: number): OcrFileDraft[] {
  return drafts.map((draft, index) => ({
    ...draft,
    sourcePageNumber: firstPage + index,
  }))
}

function pageKey(item: OcrJobItem, page: OcrJobItemPage): string {
  return `${item.id}:page:${page.pageNumber}`
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

function formatJobStatus(status: OcrJob['status']): string {
  switch (status) {
    case 'queued':
      return 'Queued'
    case 'running':
      return 'Running'
    case 'review':
      return 'Review ready'
    case 'saved':
      return 'Saved'
    case 'failed':
      return 'Failed'
    case 'cancelled':
      return 'Cancelled'
  }
}

function formatJobProgressMessage(job: OcrJob | null): string {
  if (!job) {
    return ''
  }
  if (job.status === 'review') {
    return 'Ready for review.'
  }
  if (job.status === 'failed') {
    return job.errorMessage ?? 'OCR failed.'
  }
  if (job.status === 'running') {
    return 'OCR is running.'
  }
  return 'Preparing OCR.'
}

function summarizeJobItems(items: OcrJobItem[]): string {
  const complete = items.filter((item) => item.status === 'review' || item.status === 'failed' || item.status === 'skipped').length
  return `${complete} of ${items.length} item(s) processed`
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

  return entry.page.title?.trim() || getDefaultPageTitle(entry.page)
}

function normalizeSourcePageNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}
