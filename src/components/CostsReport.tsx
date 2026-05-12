import { useMemo, useState } from 'react'
import {
  AI_COST_CONFIDENCE_LABELS,
  AI_USAGE_STAGE_LABELS,
  AI_USAGE_STATUS_LABELS,
  buildCostReport,
  exportCostReportCsv,
  exportCostReportJson,
  type CostReportFilters,
  type CostReportTimePeriod,
  type CostRollupRow,
} from '../lib/ai/costReport'
import type { AiCostConfidence, AiUsageLineItem, AiUsageStage, AiUsageStatus, DocumentRecord, OcrJob } from '../types/domain'

type CostsReportProps = {
  documents: DocumentRecord[]
  lineItems: AiUsageLineItem[]
  ocrJobs: OcrJob[]
}

const STAGE_OPTIONS: AiUsageStage[] = ['ocr_extraction', 'ocr_cleaner', 'ocr_formatter', 'generated_quiz']
const STATUS_OPTIONS: AiUsageStatus[] = ['running', 'succeeded', 'failed']
const CONFIDENCE_OPTIONS: AiCostConfidence[] = ['estimated', 'unknown', 'exact']

export function CostsReport({ documents, lineItems, ocrJobs }: CostsReportProps) {
  const [filters, setFilters] = useState<CostReportFilters>({})
  const [timePeriod, setTimePeriod] = useState<CostReportTimePeriod>('day')
  const report = useMemo(
    () => buildCostReport({ documents, filters, lineItems, ocrJobs, timePeriod }),
    [documents, filters, lineItems, ocrJobs, timePeriod],
  )
  const documentOptions = useMemo(() => buildDocumentOptions(documents, lineItems), [documents, lineItems])
  const ocrJobOptions = useMemo(() => buildOcrJobOptions(ocrJobs, lineItems), [ocrJobs, lineItems])
  const modelOptions = useMemo(() => uniqueSorted(lineItems.map((lineItem) => lineItem.model)), [lineItems])
  const hasUsageRecords = lineItems.length > 0

  function updateFilter<Key extends keyof CostReportFilters>(key: Key, value: CostReportFilters[Key]): void {
    setFilters((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function exportReport(kind: 'csv' | 'json'): void {
    const contents = kind === 'json' ? exportCostReportJson(report) : exportCostReportCsv(report)
    const type = kind === 'json' ? 'application/json' : 'text/csv'
    const blob = new Blob([contents], { type })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `readrail-costs.${kind}`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="panel costs-panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">Costs</span>
          <h1>AI usage costs</h1>
        </div>
        <div className="button-row" data-tour="cost-exports">
          <button className="secondary-button" disabled={!report.lineItems.length} onClick={() => exportReport('csv')} type="button">
            Export CSV
          </button>
          <button className="secondary-button" disabled={!report.lineItems.length} onClick={() => exportReport('json')} type="button">
            Export JSON
          </button>
        </div>
      </div>

      <div className="cost-filter-grid" aria-label="Cost report filters" data-tour="cost-filters">
        <label className="field">
          Start date
          <input
            onChange={(event) => updateFilter('startDate', event.target.value)}
            type="date"
            value={filters.startDate ?? ''}
          />
        </label>
        <label className="field">
          End date
          <input
            onChange={(event) => updateFilter('endDate', event.target.value)}
            type="date"
            value={filters.endDate ?? ''}
          />
        </label>
        <label className="field">
          Document
          <select onChange={(event) => updateFilter('documentId', event.target.value)} value={filters.documentId ?? ''}>
            <option value="">All documents</option>
            {documentOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          OCR job
          <select onChange={(event) => updateFilter('ocrJobId', event.target.value)} value={filters.ocrJobId ?? ''}>
            <option value="">All OCR jobs</option>
            {ocrJobOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Stage
          <select onChange={(event) => updateFilter('stage', event.target.value as AiUsageStage | '')} value={filters.stage ?? ''}>
            <option value="">All stages</option>
            {STAGE_OPTIONS.map((stage) => (
              <option key={stage} value={stage}>
                {AI_USAGE_STAGE_LABELS[stage]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Model
          <select onChange={(event) => updateFilter('model', event.target.value)} value={filters.model ?? ''}>
            <option value="">All models</option>
            {modelOptions.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Status
          <select onChange={(event) => updateFilter('status', event.target.value as AiUsageStatus | '')} value={filters.status ?? ''}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {AI_USAGE_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Confidence
          <select
            onChange={(event) => updateFilter('confidence', event.target.value as AiCostConfidence | '')}
            value={filters.confidence ?? ''}
          >
            <option value="">All confidence</option>
            {CONFIDENCE_OPTIONS.map((confidence) => (
              <option key={confidence} value={confidence}>
                {AI_COST_CONFIDENCE_LABELS[confidence]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="summary-grid" data-tour="cost-summary">
        <Metric label="Estimated spend" value={formatCurrency(report.summary.estimatedTotalCost, report.summary.currency)} />
        <Metric label="Usage records" value={report.summary.recordCount} />
        <Metric label="Tokens" value={report.summary.totalTokens.toLocaleString()} />
        <Metric label="Unknown costs" value={report.summary.unknownCostCount} />
        <Metric label="Failed calls" value={report.summary.failedCount} />
      </div>

      {!hasUsageRecords ? (
        <div className="empty-state">
          <strong>No AI usage records yet</strong>
          <span>Run OCR or generate a comprehension quiz to populate cost and token reports.</span>
        </div>
      ) : report.lineItems.length === 0 ? (
        <div className="empty-state">
          <strong>No matching usage records</strong>
          <span>Adjust filters to widen the report window.</span>
        </div>
      ) : (
        <>
          <div className="cost-rollup-grid" data-tour="cost-rollups">
            <RollupTable rows={report.rollups.byDocument} title="By document" />
            <RollupTable rows={report.rollups.byOcrJob} title="By OCR job" />
            <RollupTable rows={report.rollups.byStage} title="By stage" />
            <RollupTable rows={report.rollups.byModel} title="By model" />
            <section className="cost-rollup-block">
              <div className="cost-rollup-header">
                <h2>By time period</h2>
                <select
                  aria-label="Time rollup"
                  onChange={(event) => setTimePeriod(event.target.value as CostReportTimePeriod)}
                  value={timePeriod}
                >
                  <option value="day">Daily</option>
                  <option value="month">Monthly</option>
                </select>
              </div>
              <RollupRows rows={report.rollups.byTimePeriod} />
            </section>
          </div>

          <section className="recent-sessions">
            <div className="panel-header compact" data-tour="cost-line-items">
              <div>
                <span className="eyebrow">Line items</span>
                <h2>Filtered usage records</h2>
              </div>
            </div>
            <div className="attempt-table-wrap">
              <table className="attempt-table cost-detail-table">
                <thead>
                  <tr>
                    <th>Started</th>
                    <th>Document</th>
                    <th>OCR job</th>
                    <th>Stage</th>
                    <th>Model</th>
                    <th>Status</th>
                    <th>Tokens</th>
                    <th>Cost</th>
                    <th>Confidence</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {report.lineItems.map((lineItem) => (
                    <tr key={lineItem.id}>
                      <td>{formatShortDateTime(lineItem.startedAt)}</td>
                      <td>{lineItem.documentTitle}</td>
                      <td>{lineItem.ocrJobLabel}</td>
                      <td>{AI_USAGE_STAGE_LABELS[lineItem.stage]}</td>
                      <td>{lineItem.model}</td>
                      <td>{AI_USAGE_STATUS_LABELS[lineItem.status]}</td>
                      <td>{lineItem.totalTokens?.toLocaleString() ?? 'Unknown'}</td>
                      <td>{formatCurrency(lineItem.estimatedTotalCost, lineItem.currency)}</td>
                      <td>
                        <span className={`confidence-badge ${lineItem.confidence}`}>
                          {AI_COST_CONFIDENCE_LABELS[lineItem.confidence]}
                        </span>
                      </td>
                      <td>{lineItem.sourceFileName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </section>
  )
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function RollupTable({ rows, title }: { rows: CostRollupRow[]; title: string }) {
  return (
    <section className="cost-rollup-block">
      <h2>{title}</h2>
      <RollupRows rows={rows} />
    </section>
  )
}

function RollupRows({ rows }: { rows: CostRollupRow[] }) {
  return (
    <div className="attempt-table-wrap">
      <table className="attempt-table cost-rollup-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Calls</th>
            <th>Tokens</th>
            <th>Cost</th>
            <th>Unknown</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.label}</td>
              <td>{row.recordCount}</td>
              <td>{row.totalTokens.toLocaleString()}</td>
              <td>{formatCurrency(row.estimatedTotalCost, row.currency)}</td>
              <td>{row.unknownCostCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function buildDocumentOptions(documents: DocumentRecord[], lineItems: AiUsageLineItem[]): Array<{ value: string; label: string }> {
  const documentById = new Map(documents.map((document) => [document.id, document.title]))
  const optionByValue = new Map<string, string>()
  for (const document of documents) {
    optionByValue.set(document.id, document.title)
  }
  for (const lineItem of lineItems) {
    const value = lineItem.documentId ?? 'unattributed'
    optionByValue.set(value, lineItem.documentId ? documentById.get(lineItem.documentId) ?? 'Unknown document' : 'Unattributed')
  }
  return [...optionByValue.entries()].map(([value, label]) => ({ value, label })).sort((left, right) => left.label.localeCompare(right.label))
}

function buildOcrJobOptions(ocrJobs: OcrJob[], lineItems: AiUsageLineItem[]): Array<{ value: string; label: string }> {
  const jobById = new Map(ocrJobs.map((job) => [job.id, `OCR job ${formatDate(job.createdAt)}`]))
  const optionByValue = new Map<string, string>()
  for (const job of ocrJobs) {
    optionByValue.set(job.id, jobById.get(job.id) ?? job.id)
  }
  for (const lineItem of lineItems) {
    const value = lineItem.ocrJobId ?? 'none'
    optionByValue.set(value, lineItem.ocrJobId ? jobById.get(lineItem.ocrJobId) ?? 'Unknown OCR job' : 'No OCR job')
  }
  return [...optionByValue.entries()].map(([value, label]) => ({ value, label })).sort((left, right) => left.label.localeCompare(right.label))
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

function formatCurrency(value: number | null, currency: string | null): string {
  if (value === null) {
    return 'Unknown'
  }

  return new Intl.NumberFormat(undefined, {
    currency: currency ?? 'USD',
    maximumFractionDigits: 6,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(value)
}

function formatShortDateTime(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return 'Unknown'
  }

  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return 'unknown date'
  }

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
