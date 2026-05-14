import { useEffect, useState } from 'react'
import { DocumentOrganizer } from './DocumentOrganizer'
import { getOrderedChapterPages, getOrderedDocumentChapters } from '../app/structuredDocuments'
import type { OcrPageInput } from '../app/store'
import type { DocumentChapterRecord, DocumentPageRecord, DocumentRecord } from '../types/domain'

type DocumentDetailProps = {
  document: DocumentRecord | null
  chapters: DocumentChapterRecord[]
  pages: DocumentPageRecord[]
  routeChapterId?: string | null
  routePageNumber?: number | null
  onBack: () => void
  onOpenCosts: (documentId: string) => void
  onDocumentViewChange: (
    documentId: string,
    chapterId: string | null,
    pageNumber: number,
    options?: { replace?: boolean },
  ) => void
  onOpenReader: (documentId: string, chapterId?: string | null) => void
  onCreateChapter: (documentId: string, title?: string) => void
  onRenameChapter: (chapterId: string, title: string) => void
  onMoveChapter: (documentId: string, chapterId: string, direction: -1 | 1) => void
  onDeleteChapter: (chapterId: string) => void
  onMovePage: (pageId: string, targetChapterId: string, targetIndex: number) => void
  onDeletePage: (pageId: string) => void
  onDeletePages: (pageIds: string[]) => number
  onUpdatePageMetadata: (
    pageId: string,
    updates: Partial<Pick<DocumentPageRecord, 'ocrNotes' | 'reviewStatus' | 'sourcePageNumber' | 'text' | 'title'>>,
  ) => void
  onAppendPages: (documentId: string, pages: OcrPageInput[], chapterId?: string | null) => void
  onOpenPageDetail: (documentId: string, pageId: string) => void
}

export function DocumentDetail({
  document,
  chapters,
  pages,
  routeChapterId,
  routePageNumber,
  onBack,
  onOpenCosts,
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
  onOpenPageDetail,
}: DocumentDetailProps) {
  const documentChapters = document ? chapters.filter((chapter) => chapter.documentId === document.id) : []
  const documentPages = document ? pages.filter((page) => page.documentId === document.id) : []
  const orderedChapters = document ? getOrderedDocumentChapters(document.id, documentChapters) : []
  const selectedChapter =
    orderedChapters.find((chapter) => chapter.id === routeChapterId) ?? orderedChapters[0] ?? null
  const selectedChapterPages = selectedChapter ? getOrderedChapterPages(selectedChapter.id, documentPages) : []
  const [pagesPerPage, setPagesPerPage] = useState(10)
  const pageCount = Math.max(1, Math.ceil(selectedChapterPages.length / pagesPerPage))
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
            <button className="secondary-button" onClick={() => onOpenCosts(document.id)} type="button">
              View AI costs
            </button>
            <button className="primary-button" onClick={() => onOpenReader(document.id, selectedChapter?.id ?? null)} type="button">
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
          onAddPage={(documentId, chapterId, input) => {
            const nextChapterPageNumber = getOrderedChapterPages(chapterId, documentPages).length + 1
            onAppendPages(
              documentId,
              [
                {
                  pageNumber: nextChapterPageNumber,
                  text: input.text,
                  title: input.title,
                  reviewStatus: 'reviewed',
                  sourcePageNumber: input.sourcePageNumber,
                  ocrConfidence: null,
                  ocrNotes: null,
                  uncertainSpans: [],
                  sourceFileName: null,
                  sourceKind: 'text',
                },
              ],
              chapterId,
            )
          }}
          onCreateChapter={onCreateChapter}
          onDeleteChapter={onDeleteChapter}
          onDeletePage={onDeletePage}
          onDeletePages={onDeletePages}
          onMoveChapter={onMoveChapter}
          onMovePage={onMovePage}
          onSelectChapter={(chapterId) => onDocumentViewChange(document.id, chapterId, 1)}
          onSelectPage={(pageNumber) => onDocumentViewChange(document.id, selectedChapter?.id ?? null, pageNumber)}
          onOpenPageDetail={(pageId) => onOpenPageDetail(document.id, pageId)}
          onRenameChapter={onRenameChapter}
          onUpdatePageMetadata={onUpdatePageMetadata}
          pages={documentPages}
          pageNumber={selectedPageNumber}
          onPagesPerPageChange={(nextPagesPerPage) => {
            setPagesPerPage(nextPagesPerPage)
            onDocumentViewChange(document.id, selectedChapter?.id ?? null, 1, { replace: true })
          }}
          pagesPerPage={pagesPerPage}
          selectedChapterId={selectedChapter?.id ?? null}
        />
      </section>
    </div>
  )
}
