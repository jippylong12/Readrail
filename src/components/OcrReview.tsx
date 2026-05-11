import { useMemo, useState } from 'react'
import { runGeminiOcrFromFiles } from '../lib/ai/geminiOcr'
import { cleanReadingText } from '../lib/text/cleanup'
import { countWords } from '../lib/text/wordCount'
import type { OcrPageInput } from '../app/store'
import type { OcrPipelineProgress, OcrPipelineStage } from '../lib/ai/geminiOcr'
import type { DocumentRecord, OcrReviewStatus } from '../types/domain'

type OcrReviewProps = {
  hasKey: boolean
  documents: DocumentRecord[]
  preservePageBreaks: boolean
  loadApiKey: () => Promise<string | null>
  onCreateDocument: (title: string, pages: OcrPageInput[]) => void
  onAppendPages: (documentId: string, pages: OcrPageInput[]) => void
}

type OcrPageDraft = OcrPageInput & {
  id: string
}

type OcrStageState = OcrPipelineProgress['status'] | 'pending'

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
  preservePageBreaks,
  loadApiKey,
  onCreateDocument,
  onAppendPages,
}: OcrReviewProps) {
  const [files, setFiles] = useState<File[]>([])
  const [status, setStatus] = useState<'idle' | 'running' | 'review' | 'failed'>('idle')
  const [pageDrafts, setPageDrafts] = useState<OcrPageDraft[]>([])
  const [title, setTitle] = useState('')
  const [appendDocumentId, setAppendDocumentId] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState('')
  const [progressMessage, setProgressMessage] = useState('')
  const [progressState, setProgressState] = useState<Record<OcrPipelineStage, OcrStageState>>(initialProgressState)
  const availableDocuments = documents.filter((document) => !document.archivedAt)
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

  async function startOcr(selectedFiles = files): Promise<void> {
    if (!selectedFiles.length || !hasKey) {
      return
    }

    setStatus('running')
    setError('')
    setWarnings([])
    resetProgress()
    setFiles(selectedFiles)
    setPageDrafts([])

    try {
      const apiKey = await loadApiKey()
      if (!apiKey) {
        throw new Error('Add a Gemini API key in Settings before running OCR.')
      }

      const result = await runGeminiOcrFromFiles(apiKey, selectedFiles, { onProgress: updateProgress })
      setTitle(result.titleGuess ?? selectedFiles[0]?.name.replace(/\.[^.]+$/, '') ?? 'OCR import')
      setWarnings(result.warnings)
      setPageDrafts(
        result.pages.map((page, index) => {
          const sourceFile = selectedFiles.length === 1 ? selectedFiles[0] : selectedFiles[index]
          return {
            id: `ocr-page-${page.pageNumber}-${index}`,
            pageNumber: index + 1,
            text: page.text,
            reviewStatus: inferReviewStatus(page.uncertainSpans.length, page.confidence, page.notes),
            sourcePageNumber: page.sourcePageNumber ?? page.pageNumber,
            ocrConfidence: page.confidence,
            ocrNotes: page.notes,
            uncertainSpans: page.uncertainSpans,
            sourceFileName: page.sourceFileName ?? sourceFile?.name ?? null,
            sourceKind: sourceFile ? inferSourceKind(sourceFile) : null,
          }
        }),
      )
      setAppendDocumentId(availableDocuments[0]?.id ?? '')
      setProgressMessage('Ready for review.')
      setStatus('review')
    } catch (ocrError) {
      setError(ocrError instanceof Error ? ocrError.message : 'OCR failed')
      setStatus('failed')
    }
  }

  function selectFiles(selectedFiles: File[]): void {
    setFiles(selectedFiles)
    setError('')
    setWarnings([])
    resetProgress()
    if (!selectedFiles.length) {
      setStatus('idle')
      return
    }

    if (hasKey) {
      void startOcr(selectedFiles)
    }
  }

  function updatePageDraft(pageId: string, updates: Partial<OcrPageDraft>): void {
    setPageDrafts((pages) => pages.map((page) => (page.id === pageId ? { ...page, ...updates } : page)))
  }

  function toReviewedPages(): OcrPageInput[] {
    return pageDrafts.map((page) => ({
      pageNumber: page.pageNumber,
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
          <h2>Photos or scanned PDFs</h2>
        </div>
        <span className={hasKey ? 'status-pill ok' : 'status-pill'}>{hasKey ? 'Key ready' : 'Key missing'}</span>
      </div>

      <p className="notice">
        Choose scans or PDFs here. If your Gemini key is available, OCR starts immediately and sends the selected files directly to Google using your key.
      </p>

      <label className={hasKey ? 'ocr-file-dropzone' : 'ocr-file-dropzone disabled'}>
        <span>Choose scans or PDFs</span>
        <strong>{hasKey ? 'Select files to start OCR' : 'Add a Gemini key in Settings to enable OCR'}</strong>
        <input
          accept="image/*,application/pdf"
          disabled={!hasKey || status === 'running'}
          multiple
          onChange={(event) => selectFiles(Array.from(event.target.files ?? []))}
          type="file"
        />
      </label>

      {files.length > 0 && <span>{files.length} file(s) selected</span>}
      {error && <span className="error-text">{error}</span>}
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
          <label className="field">
            Title
            <input onChange={(event) => setTitle(event.target.value)} value={title} />
          </label>
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
              <button
                className="primary-button"
                disabled={totalWords === 0}
                onClick={() => onCreateDocument(title, toReviewedPages())}
                type="button"
              >
                Save as new OCR document
              </button>
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
              <button
                className="secondary-button"
                disabled={totalWords === 0 || !appendDocumentId}
                onClick={() => onAppendPages(appendDocumentId, toReviewedPages())}
                type="button"
              >
                Append pages
              </button>
            </div>
          </div>
        </>
      ) : (
        <button
          className="secondary-button"
          disabled={!hasKey || files.length === 0 || status === 'running'}
          onClick={() => void startOcr()}
          type="button"
        >
          {status === 'running' ? 'Running OCR...' : files.length > 0 ? 'Run OCR again' : 'OCR disabled until files are selected'}
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
