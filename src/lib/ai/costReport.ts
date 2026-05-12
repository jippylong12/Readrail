import type {
  AiCostConfidence,
  AiUsageLineItem,
  AiUsageStage,
  AiUsageStatus,
  DocumentRecord,
  OcrJob,
} from '../../types/domain'

export type CostReportFilters = {
  startDate?: string
  endDate?: string
  documentId?: string
  ocrJobId?: string
  stage?: AiUsageStage | ''
  model?: string
  status?: AiUsageStatus | ''
  confidence?: AiCostConfidence | ''
}

export type CostReportTimePeriod = 'day' | 'month'

export type CostReportInput = {
  lineItems: AiUsageLineItem[]
  documents: DocumentRecord[]
  ocrJobs: OcrJob[]
  filters?: CostReportFilters
  timePeriod?: CostReportTimePeriod
}

export type CostReportLineItem = {
  id: string
  documentId: string | null
  documentTitle: string
  ocrJobId: string | null
  ocrJobLabel: string
  ocrItemId: string | null
  ocrItemLabel: string
  sourceFileName: string
  stage: AiUsageStage
  provider: string
  model: string
  status: AiUsageStatus
  startedAt: string
  completedAt: string | null
  failureMessage: string | null
  confidence: AiCostConfidence
  currency: string | null
  inputTokens: number | null
  outputTokens: number | null
  thinkingTokens: number | null
  totalTokens: number | null
  estimatedTotalCost: number | null
}

export type CostRollupRow = {
  key: string
  label: string
  recordCount: number
  failedCount: number
  unknownCostCount: number
  totalTokens: number
  estimatedTotalCost: number
  currency: string | null
}

export type CostReportSummary = {
  recordCount: number
  failedCount: number
  unknownCostCount: number
  totalTokens: number
  estimatedTotalCost: number
  currency: string | null
}

export type CostReport = {
  filters: CostReportFilters
  summary: CostReportSummary
  rollups: {
    byDocument: CostRollupRow[]
    byOcrJob: CostRollupRow[]
    byStage: CostRollupRow[]
    byModel: CostRollupRow[]
    byTimePeriod: CostRollupRow[]
  }
  lineItems: CostReportLineItem[]
}

export const AI_USAGE_STAGE_LABELS: Record<AiUsageStage, string> = {
  ocr_extraction: 'OCR extraction',
  ocr_cleaner: 'OCR cleaner',
  ocr_formatter: 'OCR formatter',
  generated_quiz: 'Generated quiz',
}

export const AI_USAGE_STATUS_LABELS: Record<AiUsageStatus, string> = {
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
}

export const AI_COST_CONFIDENCE_LABELS: Record<AiCostConfidence, string> = {
  exact: 'Exact',
  estimated: 'Estimated',
  unknown: 'Unknown',
}

export function buildCostReport(input: CostReportInput): CostReport {
  const filters = normalizeFilters(input.filters)
  const documentById = new Map(input.documents.map((document) => [document.id, document]))
  const ocrJobById = new Map(input.ocrJobs.map((job) => [job.id, job]))
  const timePeriod = input.timePeriod ?? 'day'
  const lineItems = input.lineItems
    .map((lineItem) => enrichLineItem(lineItem, documentById, ocrJobById))
    .filter((lineItem) => matchesFilters(lineItem, filters))
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))

  return {
    filters,
    summary: summarizeCostRows(lineItems),
    rollups: {
      byDocument: rollupRows(lineItems, (lineItem) => ({
        key: lineItem.documentId ?? 'unattributed',
        label: lineItem.documentTitle,
      })),
      byOcrJob: rollupRows(lineItems, (lineItem) => ({
        key: lineItem.ocrJobId ?? 'none',
        label: lineItem.ocrJobLabel,
      })),
      byStage: rollupRows(lineItems, (lineItem) => ({
        key: lineItem.stage,
        label: AI_USAGE_STAGE_LABELS[lineItem.stage],
      })),
      byModel: rollupRows(lineItems, (lineItem) => ({
        key: `${lineItem.provider}:${lineItem.model}`,
        label: `${lineItem.provider} / ${lineItem.model}`,
      })),
      byTimePeriod: rollupRows(lineItems, (lineItem) => ({
        key: getTimePeriodKey(lineItem.startedAt, timePeriod),
        label: getTimePeriodLabel(lineItem.startedAt, timePeriod),
      })),
    },
    lineItems,
  }
}

export function exportCostReportJson(report: CostReport): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      filters: report.filters,
      summary: report.summary,
      rollups: report.rollups,
      lineItems: report.lineItems,
    },
    null,
    2,
  )
}

export function exportCostReportCsv(report: CostReport): string {
  const header = [
    'usage_id',
    'started_at',
    'completed_at',
    'document_id',
    'document_title',
    'ocr_job_id',
    'ocr_job_label',
    'ocr_item_id',
    'ocr_item_label',
    'source_file_name',
    'stage',
    'provider',
    'model',
    'status',
    'cost_confidence',
    'currency',
    'input_tokens',
    'output_tokens',
    'thinking_tokens',
    'total_tokens',
    'estimated_total_cost',
    'failure_message',
  ]
  const rows = report.lineItems.map((lineItem) =>
    [
      lineItem.id,
      lineItem.startedAt,
      lineItem.completedAt ?? '',
      lineItem.documentId ?? '',
      lineItem.documentTitle,
      lineItem.ocrJobId ?? '',
      lineItem.ocrJobLabel,
      lineItem.ocrItemId ?? '',
      lineItem.ocrItemLabel,
      lineItem.sourceFileName,
      lineItem.stage,
      lineItem.provider,
      lineItem.model,
      lineItem.status,
      lineItem.confidence,
      lineItem.currency ?? '',
      lineItem.inputTokens ?? '',
      lineItem.outputTokens ?? '',
      lineItem.thinkingTokens ?? '',
      lineItem.totalTokens ?? '',
      lineItem.estimatedTotalCost ?? '',
      lineItem.failureMessage ?? '',
    ]
      .map(csvEscape)
      .join(','),
  )

  return [header.join(','), ...rows].join('\n')
}

export function normalizeCostConfidence(lineItem: AiUsageLineItem): AiCostConfidence {
  const snapshot = lineItem.pricingSnapshot
  if (!snapshot || snapshot.estimatedTotalCost === null || lineItem.tokenBreakdown.totalTokens === null) {
    return 'unknown'
  }

  return snapshot.confidence
}

function normalizeFilters(filters: CostReportFilters | undefined): CostReportFilters {
  return {
    startDate: filters?.startDate || '',
    endDate: filters?.endDate || '',
    documentId: filters?.documentId || '',
    ocrJobId: filters?.ocrJobId || '',
    stage: filters?.stage || '',
    model: filters?.model || '',
    status: filters?.status || '',
    confidence: filters?.confidence || '',
  }
}

function enrichLineItem(
  lineItem: AiUsageLineItem,
  documentById: Map<string, DocumentRecord>,
  ocrJobById: Map<string, OcrJob>,
): CostReportLineItem {
  const confidence = normalizeCostConfidence(lineItem)
  const estimatedTotalCost = confidence === 'unknown' ? null : lineItem.pricingSnapshot?.estimatedTotalCost ?? null

  return {
    id: lineItem.id,
    documentId: lineItem.documentId,
    documentTitle: getDocumentLabel(lineItem.documentId, documentById),
    ocrJobId: lineItem.ocrJobId,
    ocrJobLabel: getOcrJobLabel(lineItem.ocrJobId, ocrJobById),
    ocrItemId: lineItem.ocrItemId,
    ocrItemLabel: getOcrItemLabel(lineItem.ocrItemId),
    sourceFileName: lineItem.sourceFileName ?? 'No source file',
    stage: lineItem.stage,
    provider: lineItem.provider,
    model: lineItem.model,
    status: lineItem.status,
    startedAt: lineItem.startedAt,
    completedAt: lineItem.completedAt,
    failureMessage: lineItem.failureMessage,
    confidence,
    currency: confidence === 'unknown' ? null : lineItem.pricingSnapshot?.currency ?? null,
    inputTokens: lineItem.tokenBreakdown.inputTokens,
    outputTokens: lineItem.tokenBreakdown.outputTokens,
    thinkingTokens: lineItem.tokenBreakdown.thinkingTokens,
    totalTokens: lineItem.tokenBreakdown.totalTokens,
    estimatedTotalCost,
  }
}

function matchesFilters(lineItem: CostReportLineItem, filters: CostReportFilters): boolean {
  const startedDate = toLocalDateKey(lineItem.startedAt)
  return (
    (!filters.startDate || startedDate >= filters.startDate) &&
    (!filters.endDate || startedDate <= filters.endDate) &&
    (!filters.documentId || (lineItem.documentId ?? 'unattributed') === filters.documentId) &&
    (!filters.ocrJobId || (lineItem.ocrJobId ?? 'none') === filters.ocrJobId) &&
    (!filters.stage || lineItem.stage === filters.stage) &&
    (!filters.model || lineItem.model === filters.model) &&
    (!filters.status || lineItem.status === filters.status) &&
    (!filters.confidence || lineItem.confidence === filters.confidence)
  )
}

function summarizeCostRows(rows: CostReportLineItem[]): CostReportSummary {
  return rows.reduce<CostReportSummary>(
    (summary, row) => ({
      recordCount: summary.recordCount + 1,
      failedCount: summary.failedCount + (row.status === 'failed' ? 1 : 0),
      unknownCostCount: summary.unknownCostCount + (row.confidence === 'unknown' ? 1 : 0),
      totalTokens: summary.totalTokens + (row.totalTokens ?? 0),
      estimatedTotalCost: summary.estimatedTotalCost + (row.estimatedTotalCost ?? 0),
      currency: summary.currency ?? row.currency,
    }),
    {
      recordCount: 0,
      failedCount: 0,
      unknownCostCount: 0,
      totalTokens: 0,
      estimatedTotalCost: 0,
      currency: null,
    },
  )
}

function rollupRows(
  rows: CostReportLineItem[],
  getGroup: (row: CostReportLineItem) => { key: string; label: string },
): CostRollupRow[] {
  const grouped = new Map<string, CostRollupRow>()
  for (const row of rows) {
    const group = getGroup(row)
    const current =
      grouped.get(group.key) ??
      ({
        key: group.key,
        label: group.label,
        recordCount: 0,
        failedCount: 0,
        unknownCostCount: 0,
        totalTokens: 0,
        estimatedTotalCost: 0,
        currency: null,
      } satisfies CostRollupRow)

    current.recordCount += 1
    current.failedCount += row.status === 'failed' ? 1 : 0
    current.unknownCostCount += row.confidence === 'unknown' ? 1 : 0
    current.totalTokens += row.totalTokens ?? 0
    current.estimatedTotalCost += row.estimatedTotalCost ?? 0
    current.currency = current.currency ?? row.currency
    grouped.set(group.key, current)
  }

  return [...grouped.values()].sort((left, right) => {
    if (right.estimatedTotalCost !== left.estimatedTotalCost) {
      return right.estimatedTotalCost - left.estimatedTotalCost
    }
    return left.label.localeCompare(right.label)
  })
}

function getDocumentLabel(documentId: string | null, documentById: Map<string, DocumentRecord>): string {
  if (!documentId) {
    return 'Unattributed'
  }

  return documentById.get(documentId)?.title ?? 'Unknown document'
}

function getOcrJobLabel(ocrJobId: string | null, ocrJobById: Map<string, OcrJob>): string {
  if (!ocrJobId) {
    return 'No OCR job'
  }

  const job = ocrJobById.get(ocrJobId)
  if (!job) {
    return 'Unknown OCR job'
  }

  return `OCR job ${formatDateTime(job.createdAt)}`
}

function getOcrItemLabel(ocrItemId: string | null): string {
  return ocrItemId ?? 'No OCR item'
}

function getTimePeriodKey(isoDate: string, period: CostReportTimePeriod): string {
  const dateKey = toLocalDateKey(isoDate)
  return period === 'month' ? dateKey.slice(0, 7) : dateKey
}

function getTimePeriodLabel(isoDate: string, period: CostReportTimePeriod): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return 'Unknown date'
  }

  return date.toLocaleDateString(undefined, period === 'month' ? { month: 'short', year: 'numeric' } : {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function toLocalDateKey(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDateTime(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return 'unknown date'
  }

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function csvEscape(value: string | number): string {
  const text = String(value)
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }

  return text
}
