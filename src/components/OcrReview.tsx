import { useMemo, useState } from 'react'
import { runGeminiOcrFromFiles } from '../lib/ai/geminiOcr'
import { stripImageMetadata } from '../lib/files/imageMetadata'
import { cleanReadingText } from '../lib/text/cleanup'
import { countWords } from '../lib/text/wordCount'
import type { OcrPageInput } from '../app/store'
import type { OcrPipelineProgress, OcrPipelineStage } from '../lib/ai/geminiOcr'
import type { DocumentChapterRecord, DocumentRecord, OcrReviewStatus } from '../types/domain'

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
}

type OcrPageDraft = OcrPageInput & {
  id: string
}

type OcrFileDraft = {
  id: string
  file: File
  title: string
  sourcePageNumber: number | null
}

type OcrStageState = OcrPipelineProgress['status'] | 'pending'

const MAX_OCR_FILES = 25

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
}: OcrReviewProps) {
  const [fileDrafts, setFileDrafts] = useState<OcrFileDraft[]>([])
  const [status, setStatus] = useState<'idle' | 'running' | 'review' | 'failed'>('idle')
  const [pageDrafts, setPageDrafts] = useState<OcrPageDraft[]>([])
  const [title, setTitle] = useState('')
  const [appendDocumentId, setAppendDocumentId] = useState('')
  const [appendChapterId, setAppendChapterId] = useState(appendTargetChapterId ?? '')
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState('')
  const [progressMessage, setProgressMessage] = useState('')
  const [progressState, setProgressState] = useState<Record<OcrPipelineStage, OcrStageState>>(initialProgressState)
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
  const completedProgressSteps = ocrProgressSteps.filter(({ stage }) =>
    ['done', 'failed'].includes(progressState[stage]),
  ).length
  const progressPercent =
    status === 'review' ? 100 : Math.round((completedProgressSteps / ocrProgressSteps.length) * 100)
  const totalWords = useMemo(
    () =>
      pageDrafts.reduce(
        (total, page) => total + countWords(cleanReadingText(page.text, { preservePageBreaks })),
        0,
      ),
    [pageDrafts, preservePageBreaks],
  )

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
    setPageDrafts([])

    try {
      const apiKey = await loadApiKey()
      if (!apiKey) {
        throw new Error('Add a Gemini API key in Settings before running OCR.')
      }

      const preparedFiles = await prepareFilesForOcr(selectedDrafts.map((draft) => draft.file), stripImageMetadataBeforeOcr)
      const result = await runGeminiOcrFromFiles(apiKey, preparedFiles.files, { onProgress: updateProgress })
      const selectedFiles = preparedFiles.files
      setTitle(result.titleGuess ?? selectedFiles[0]?.name.replace(/\.[^.]+$/, '') ?? 'OCR import')
      setWarnings([...preparedFiles.warnings, ...result.warnings])
      setPageDrafts(
        result.pages.map((page, index) => {
          const fileDraft = selectedDrafts[index] ?? (selectedDrafts.length === 1 ? selectedDrafts[0] : null)
          const sourceFile = fileDraft?.file ?? selectedFiles[index] ?? (selectedFiles.length === 1 ? selectedFiles[0] : null)
          return {
            id: `ocr-page-${page.pageNumber}-${index}`,
            pageNumber: index + 1,
            title: fileDraft?.title || null,
            text: page.text,
            reviewStatus: inferReviewStatus(page.uncertainSpans.length, page.confidence, page.notes),
            sourcePageNumber:
              page.sourcePageNumber ??
              (selectedDrafts.length === result.pages.length ? fileDraft?.sourcePageNumber : null) ??
              page.pageNumber,
            ocrConfidence: page.confidence,
            ocrNotes: page.notes,
            uncertainSpans: page.uncertainSpans,
            sourceFileName: page.sourceFileName ?? sourceFile?.name ?? null,
            sourceKind: sourceFile ? inferSourceKind(sourceFile) : null,
          }
        }),
      )
      setAppendDocumentId(appendTargetDocumentId ?? availableDocuments[0]?.id ?? '')
      setAppendChapterId(selectedAppendChapterId ?? '')
      setProgressMessage('Ready for review.')
      setStatus('review')
    } catch (ocrError) {
      setError(ocrError instanceof Error ? ocrError.message : 'OCR failed')
      setStatus('failed')
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
    setError('')
    setWarnings(selectedFiles.length > MAX_OCR_FILES ? [`Only the first ${MAX_OCR_FILES} files will be processed.`] : [])
    resetProgress()
    setPageDrafts([])
    if (!limitedFiles.length) {
      setStatus('idle')
      return
    }

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

  function updatePageDraft(pageId: string, updates: Partial<OcrPageDraft>): void {
    setPageDrafts((pages) => pages.map((page) => (page.id === pageId ? { ...page, ...updates } : page)))
  }

  function toReviewedPages(): OcrPageInput[] {
    return pageDrafts.map((page) => ({
      pageNumber: page.pageNumber,
      title: page.title,
      text: preservePageBreaks ? page.text : page.text.replace(/\f/g, '\n'),
      reviewStatus: page.reviewStatus,
      sourcePageNumber: page.sourcePageNumber,
      ocrConfidence: page.ocrConfidence,
      ocrNotes: page.ocrNotes?.trim() || null,
      uncertainSpans: page.uncertainSpans,
      sourceFileName: page.sourceFileName,
      sourceKind: page.sourceKind,
    }))
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

      {status === 'review' ? (
        <>
          {!appendTargetDocumentId && (
            <label className="field">
              Document title
              <input onChange={(event) => setTitle(event.target.value)} value={title} />
            </label>
          )}
          {pageDrafts.length === 0 ? (
            <div className="empty-state">
              <strong>No OCR pages returned</strong>
              <span>Try another file or edit the scan before running OCR again.</span>
            </div>
          ) : (
            <div className="ocr-page-list">
              {warnings.length > 0 && (
                <div className="ocr-warning-list" role="status">
                  {warnings.map((warning) => (
                    <span key={warning}>{warning}</span>
                  ))}
                </div>
              )}
              {pageDrafts.map((page, index) => {
                const cleanedText = cleanReadingText(page.text, { preservePageBreaks })
                const wordCount = countWords(cleanedText)
                return (
                  <article className="ocr-page-card" key={page.id}>
                    <div className="ocr-page-header">
                      <div>
                        <span className="eyebrow">Page {index + 1}</span>
                        <h3>{page.sourceFileName ?? `Source page ${page.sourcePageNumber ?? index + 1}`}</h3>
                      </div>
                      <span className="status-pill">
                        {wordCount.toLocaleString()} words
                      </span>
                    </div>
                    <div className="ocr-page-meta">
                      <span>Source page {page.sourcePageNumber ?? index + 1}</span>
                      {page.sourceFileName && <span>{page.sourceFileName}</span>}
                      {page.ocrConfidence !== null && <span>{Math.round(page.ocrConfidence * 100)}% confidence</span>}
                      {page.uncertainSpans.length > 0 && (
                        <span>{page.uncertainSpans.length} uncertain span(s)</span>
                      )}
                    </div>
                    <label className="field">
                      Review status
                      <select
                        onChange={(event) =>
                          updatePageDraft(page.id, { reviewStatus: event.target.value as OcrReviewStatus })
                        }
                        value={page.reviewStatus}
                      >
                        <option value="reviewed">Reviewed</option>
                        <option value="needs_attention">Needs attention</option>
                        <option value="unreviewed">Unreviewed</option>
                      </select>
                    </label>
                    <label className="field">
                      Page title (optional)
                      <input
                        onChange={(event) => updatePageDraft(page.id, { title: event.target.value })}
                        placeholder="Shown in organizer"
                        value={page.title ?? ''}
                      />
                    </label>
                    <label className="field">
                      Notes
                      <input
                        onChange={(event) => updatePageDraft(page.id, { ocrNotes: event.target.value })}
                        placeholder="OCR notes or review notes"
                        value={page.ocrNotes ?? ''}
                      />
                    </label>
                    <label className="field">
                      Source page number
                      <input
                        inputMode="numeric"
                        onChange={(event) =>
                          updatePageDraft(page.id, { sourcePageNumber: normalizeSourcePageNumber(event.target.value) })
                        }
                        placeholder="Optional"
                        type="text"
                        value={page.sourcePageNumber ?? ''}
                      />
                    </label>
                    <label className="field">
                      Page text
                      <textarea
                        className="ocr-page-textarea"
                        onChange={(event) => updatePageDraft(page.id, { text: event.target.value })}
                        value={page.text}
                      />
                    </label>
                  </article>
                )
              })}
            </div>
          )}
          <div className="ocr-save-actions">
            <span>{totalWords.toLocaleString()} total words across {pageDrafts.length} page(s)</span>
            <div className="button-row">
              {!appendTargetDocumentId && (
                <button
                  className="primary-button"
                  disabled={totalWords === 0}
                  onClick={() => onCreateDocument(title, toReviewedPages())}
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
                disabled={totalWords === 0 || !(appendTargetDocumentId ?? appendDocumentId)}
                onClick={() =>
                  onAppendPages(appendTargetDocumentId ?? appendDocumentId, toReviewedPages(), selectedAppendChapterId)
                }
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
