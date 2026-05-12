import { useEffect } from 'react'
import { DocumentOrganizer } from './DocumentOrganizer'
import { OcrReview } from './OcrReview'
import { getOrderedChapterPages, getOrderedDocumentChapters } from '../app/structuredDocuments'
import type { OcrPageInput } from '../app/store'
import type { DocumentChapterRecord, DocumentPageRecord, DocumentRecord } from '../types/domain'

type DocumentDetailProps = {
  document: DocumentRecord | null
  documents: DocumentRecord[]
  chapters: DocumentChapterRecord[]
  pages: DocumentPageRecord[]
  hasKey: boolean
  preservePageBreaks: boolean
  stripImageMetadataBeforeOcr: boolean
  loadApiKey: () => Promise<string | null>
  routeChapterId?: string | null
  routePageNumber?: number | null
  onBack: () => void
  onDocumentViewChange: (
    documentId: string,
    chapterId: string | null,
    pageNumber: number,
    options?: { replace?: boolean },
  ) => void
  onOpenReader: (documentId: string) => void
  onCreateChapter: (documentId: string, title?: string) => void
  onRenameChapter: (chapterId: string, title: string) => void
  onMoveChapter: (documentId: string, chapterId: string, direction: -1 | 1) => void
  onDeleteChapter: (chapterId: string) => void
  onMovePage: (pageId: string, targetChapterId: string, targetIndex: number) => void
  onDeletePage: (pageId: string) => void
  onDeletePages: (pageIds: string[]) => number
  onUpdatePageMetadata: (
    pageId: string,
    updates: Partial<Pick<DocumentPageRecord, 'sourcePageNumber' | 'title'>>,
  ) => void
  onAppendPages: (documentId: string, pages: OcrPageInput[], chapterId?: string | null) => void
  onCreateDocument: (title: string, pages: OcrPageInput[]) => void
}

export function DocumentDetail({
  document,
  documents,
  chapters,
  pages,
  hasKey,
  preservePageBreaks,
  stripImageMetadataBeforeOcr,
  loadApiKey,
  routeChapterId,
  routePageNumber,
  onBack,
  onDocumentViewChange,
  onOpenReader,
  onCreateChapter,
  onRenameChapter,
  onMoveChapter,
  onDeleteChapter,
  onMovePage,
  onDeletePage,
  onDeletePages,
  onUpdatePageMetadata,
  onAppendPages,
  onCreateDocument,
}: DocumentDetailProps) {
  const documentChapters = document ? chapters.filter((chapter) => chapter.documentId === document.id) : []
  const documentPages = document ? pages.filter((page) => page.documentId === document.id) : []
  const orderedChapters = document ? getOrderedDocumentChapters(document.id, documentChapters) : []
  const selectedChapter =
    orderedChapters.find((chapter) => chapter.id === routeChapterId) ?? orderedChapters[0] ?? null
  const selectedChapterPages = selectedChapter ? getOrderedChapterPages(selectedChapter.id, documentPages) : []
  const pageCount = Math.max(1, Math.ceil(selectedChapterPages.length / DOCUMENT_DETAIL_PAGE_SIZE))
  const selectedPageNumber = Math.min(Math.max(1, routePageNumber ?? 1), pageCount)

  useEffect(() => {
    if (!document || !selectedChapter) {
      return
    }
    if (routeChapterId !== selectedChapter.id || routePageNumber !== selectedPageNumber) {
      onDocumentViewChange(document.id, selectedChapter.id, selectedPageNumber, { replace: true })
    }
  }, [document, onDocumentViewChange, routeChapterId, routePageNumber, selectedChapter, selectedPageNumber])

  if (!document) {
    return (
      <section className="panel">
        <span className="eyebrow">Document</span>
        <h1>Document not found</h1>
        <div className="empty-state">
          <strong>Return to the Library</strong>
          <span>The selected document is no longer available.</span>
        </div>
        <button className="secondary-button" onClick={onBack} type="button">
          Back to library
        </button>
      </section>
    )
  }

  const nextSourcePageNumber =
    documentPages.reduce((highestPageNumber, page) => {
      const candidate = page.sourcePageNumber ?? page.pageNumber
      return Number.isFinite(candidate) ? Math.max(highestPageNumber, candidate) : highestPageNumber
    }, 0) + 1

  return (
    <div className="content-stack">
      <section className="panel document-detail-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Document</span>
            <h1>{document.title}</h1>
          </div>
          <div className="reader-header-actions">
            <button className="secondary-button" onClick={onBack} type="button">
              Back to library
            </button>
            <button className="primary-button" onClick={() => onOpenReader(document.id)} type="button">
              Open reader
            </button>
          </div>
        </div>
        <div className="document-detail-metrics">
          <span>{document.wordCount.toLocaleString()} words</span>
          <span>{document.estimatedPages} estimated pages</span>
          <span>{documentPages.length} organized page(s)</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Structure</span>
            <h2>Chapters and pages</h2>
          </div>
        </div>
        <DocumentOrganizer
          chapters={orderedChapters}
          document={document}
          onCreateChapter={onCreateChapter}
          onDeleteChapter={onDeleteChapter}
          onDeletePage={onDeletePage}
          onDeletePages={onDeletePages}
          onMoveChapter={onMoveChapter}
          onMovePage={onMovePage}
          onSelectChapter={(chapterId) => onDocumentViewChange(document.id, chapterId, 1)}
          onSelectPage={(pageNumber) => onDocumentViewChange(document.id, selectedChapter?.id ?? null, pageNumber)}
          onRenameChapter={onRenameChapter}
          onUpdatePageMetadata={onUpdatePageMetadata}
          pages={documentPages}
          pageNumber={selectedPageNumber}
          pagesPerPage={DOCUMENT_DETAIL_PAGE_SIZE}
          selectedChapterId={selectedChapter?.id ?? null}
        />
      </section>

      <OcrReview
        appendTargetDocumentId={document.id}
        appendTargetChapterId={documentChapters[documentChapters.length - 1]?.id ?? null}
        appendStartSourcePageNumber={nextSourcePageNumber}
        documents={documents}
        documentChapters={chapters}
        hasKey={hasKey}
        loadApiKey={loadApiKey}
        onAppendPages={onAppendPages}
        onCreateDocument={onCreateDocument}
        preservePageBreaks={preservePageBreaks}
        stripImageMetadataBeforeOcr={stripImageMetadataBeforeOcr}
      />
    </div>
  )
}

const DOCUMENT_DETAIL_PAGE_SIZE = 8
