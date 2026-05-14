import { useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useAppStore } from '../app/store'
import type { DocumentRecord, OcrBatchRun, OcrJob, OcrJobItem } from '../types/domain'

type OcrJobsPanelProps = {
  documents: DocumentRecord[]
  loadApiKey: () => Promise<string | null>
  onOpenImport: () => void
  onOpenJobCosts: (ocrJobId: string) => void
}

type OcrJobRow = {
  job: OcrJob
  items: OcrJobItem[]
  batchRun: OcrBatchRun | null
  documentTitle: string
}

export function OcrJobsPanel({ documents, loadApiKey, onOpenImport, onOpenJobCosts }: OcrJobsPanelProps) {
  const [refreshingScope, setRefreshingScope] = useState<'visible' | 'all' | null>(null)
  const ocrJobs = useAppStore((state) => state.ocrJobs)
  const ocrJobItems = useAppStore((state) => state.ocrJobItems)
  const ocrBatchRuns = useAppStore((state) => state.ocrBatchRuns)
  const refreshOcrBatchJobs = useAppStore((state) => state.refreshOcrBatchJobs)
  const documentsById = useMemo(() => new Map(documents.map((document) => [document.id, document])), [documents])
  const rows = useMemo(
    () =>
      ocrJobs
        .filter((job) => job.status !== 'saved' && job.status !== 'cancelled')
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map((job) => ({
          job,
          items: ocrJobItems.filter((item) => item.jobId === job.id).sort((left, right) => left.orderIndex - right.orderIndex),
          batchRun:
            ocrBatchRuns
              .filter((run) => run.jobId === job.id)
              .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null,
          documentTitle: job.documentId ? documentsById.get(job.documentId)?.title ?? 'Linked document' : 'New document import',
        })),
    [documentsById, ocrBatchRuns, ocrJobItems, ocrJobs],
  )
  const visibleRows = rows.slice(0, 25)
  const hasActiveBatchJobs = rows.some((row) => row.job.processingMode === 'batch' && (row.job.status === 'queued' || row.job.status === 'running'))

  async function refreshVisible(): Promise<void> {
    setRefreshingScope('visible')
    try {
      await refreshOcrBatchJobs({ loadApiKey, jobIds: visibleRows.map((row) => row.job.id) })
    } finally {
      setRefreshingScope(null)
    }
  }

  async function refreshAll(): Promise<void> {
    setRefreshingScope('all')
    try {
      await refreshOcrBatchJobs({ loadApiKey })
    } finally {
      setRefreshingScope(null)
    }
  }

  return (
    <section className="panel ocr-jobs-panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">OCR Jobs</span>
          <h1>Batch and import progress</h1>
        </div>
        <div className="button-row">
          {hasActiveBatchJobs && (
            <>
              <button className="secondary-button" disabled={refreshingScope !== null} onClick={() => void refreshVisible()} type="button">
                <RefreshCw aria-hidden="true" size={15} />
                {refreshingScope === 'visible' ? 'Refreshing visible' : 'Refresh visible'}
              </button>
              <button className="ghost-button" disabled={refreshingScope !== null} onClick={() => void refreshAll()} type="button">
                <RefreshCw aria-hidden="true" size={15} />
                {refreshingScope === 'all' ? 'Refreshing all' : 'Refresh all'}
              </button>
            </>
          )}
          <button className="primary-button" onClick={onOpenImport} type="button">
            New OCR import
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <strong>No OCR jobs yet</strong>
          <span>Start an OCR import to track extraction, cleanup, formatting, review, and costs here.</span>
        </div>
      ) : (
        <div className="ocr-job-table-wrap">
          <table className="ocr-job-table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Destination</th>
                <th>Status</th>
                <th>Current stage</th>
                <th>Items</th>
                <th>Last checked</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={row.job.id}>
                  <td>
                    <strong>OCR job {index + 1}</strong>
                    <span>{new Date(row.job.createdAt).toLocaleString()}</span>
                  </td>
                  <td>{row.documentTitle}</td>
                  <td>{formatJobStatus(row.job)}</td>
                  <td>{formatCurrentStage(row)}</td>
                  <td>{summarizeItems(row.items)}</td>
                  <td>{row.batchRun?.lastPolledAt ? new Date(row.batchRun.lastPolledAt).toLocaleString() : 'Not checked'}</td>
                  <td>
                    <button className="ghost-button" onClick={() => onOpenJobCosts(row.job.id)} type="button">
                      Costs
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function formatJobStatus(job: OcrJob): string {
  const prefix = job.processingMode === 'batch' ? 'Batch ' : ''
  switch (job.status) {
    case 'queued':
      return `${prefix}Queued`
    case 'running':
      return `${prefix}Running`
    case 'review':
      return 'Ready for review'
    case 'failed':
      return 'Failed'
    case 'saved':
      return 'Saved'
    case 'cancelled':
      return 'Cancelled'
  }
}

function formatCurrentStage(row: OcrJobRow): string {
  if (!row.batchRun) {
    if (row.job.processingMode === 'batch' && (row.job.status === 'queued' || row.job.status === 'running')) {
      return 'Not submitted'
    }
    return row.job.status === 'review' ? 'Review' : 'Interactive OCR'
  }

  const stage = row.batchRun.stage === 'ocr' ? 'OCR extraction' : row.batchRun.stage === 'cleaner' ? 'Cleaner' : 'Formatter'
  if (!row.batchRun.providerBatchName) {
    return `${stage} - creating`
  }
  if (row.batchRun.status === 'submitted' || row.batchRun.status === 'running') {
    return `${stage} - waiting for Gemini`
  }
  if (row.batchRun.status === 'succeeded') {
    return `${stage} - complete`
  }
  return `${stage} - ${row.batchRun.status}`
}

function summarizeItems(items: OcrJobItem[]): string {
  const complete = items.filter((item) => item.status === 'review' || item.status === 'failed' || item.status === 'skipped').length
  const running = items.filter((item) => item.status === 'running').length
  const queued = items.filter((item) => item.status === 'queued').length
  return `${complete} complete · ${running} running · ${queued} queued`
}
