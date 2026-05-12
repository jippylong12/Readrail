import { useEffect, useMemo, useRef, useState } from 'react'
import { countWords } from '../lib/text/wordCount'
import {
  getDocumentPageDisplayTitle,
  getOrderedChapterPages,
  getOrderedDocumentChapters,
} from '../app/structuredDocuments'
import type { DocumentChapterRecord, DocumentPageRecord, DocumentRecord } from '../types/domain'

type PageDetailProps = {
  document: DocumentRecord | null
  chapters: DocumentChapterRecord[]
  pages: DocumentPageRecord[]
  pageId: string | null
  onBackToDocument: (documentId: string, chapterId: string | null) => void
  onOpenPage: (documentId: string, pageId: string) => void
  onOpenReader: (documentId: string, chapterId?: string | null) => void
  onDeletePage: (pageId: string) => void
  onUpdatePageMetadata: (
    pageId: string,
    updates: Partial<Pick<DocumentPageRecord, 'ocrNotes' | 'reviewStatus' | 'sourcePageNumber' | 'text' | 'title'>>,
  ) => void
}

export function PageDetail({
  document,
  chapters,
  pages,
  pageId,
  onBackToDocument,
  onOpenPage,
  onOpenReader,
  onDeletePage,
  onUpdatePageMetadata,
}: PageDetailProps) {
  const page = pageId ? pages.find((candidate) => candidate.id === pageId) ?? null : null
  const pageDocument = document && page?.documentId === document.id ? document : null
  const orderedChapters = pageDocument ? getOrderedDocumentChapters(pageDocument.id, chapters) : []
  const chapter = page ? orderedChapters.find((candidate) => candidate.id === page.chapterId) ?? null : null
  const chapterPages = chapter ? getOrderedChapterPages(chapter.id, pages) : []
  const pageIndex = page ? chapterPages.findIndex((candidate) => candidate.id === page.id) : -1
  const previousPage = pageIndex > 0 ? chapterPages[pageIndex - 1] : null
  const nextPage = pageIndex >= 0 && pageIndex < chapterPages.length - 1 ? chapterPages[pageIndex + 1] : null

  if (!pageDocument || !page) {
    return (
      <section className="panel">
        <span className="eyebrow">Page</span>
        <h1>Page not found</h1>
        <div className="empty-state">
          <strong>Return to the document</strong>
          <span>The selected page is no longer available.</span>
        </div>
        {document && (
          <button className="secondary-button" onClick={() => onBackToDocument(document.id, null)} type="button">
            Back to document
          </button>
        )}
      </section>
    )
  }

  return (
    <PageDetailEditor
      chapter={chapter}
      document={pageDocument}
      nextPage={nextPage}
      onBackToDocument={onBackToDocument}
      onDeletePage={onDeletePage}
      onOpenPage={onOpenPage}
      onOpenReader={onOpenReader}
      onUpdatePageMetadata={onUpdatePageMetadata}
      page={page}
      pageIndex={pageIndex}
      previousPage={previousPage}
      totalChapterPages={chapterPages.length}
    />
  )
}

function PageDetailEditor({
  chapter,
  document,
  nextPage,
  onBackToDocument,
  onDeletePage,
  onOpenPage,
  onOpenReader,
  onUpdatePageMetadata,
  page,
  pageIndex,
  previousPage,
  totalChapterPages,
}: {
  chapter: DocumentChapterRecord | null
  document: DocumentRecord
  nextPage: DocumentPageRecord | null
  onBackToDocument: (documentId: string, chapterId: string | null) => void
  onDeletePage: (pageId: string) => void
  onOpenPage: (documentId: string, pageId: string) => void
  onOpenReader: (documentId: string, chapterId?: string | null) => void
  onUpdatePageMetadata: PageDetailProps['onUpdatePageMetadata']
  page: DocumentPageRecord
  pageIndex: number
  previousPage: DocumentPageRecord | null
  totalChapterPages: number
}) {
  const [titleDraft, setTitleDraft] = useState(page.title ?? '')
  const [sourcePageDraft, setSourcePageDraft] = useState(page.sourcePageNumber?.toString() ?? '')
  const [notesDraft, setNotesDraft] = useState(page.ocrNotes ?? '')
  const [textDraft, setTextDraft] = useState(page.text)
  const textSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const displayTitle = getDocumentPageDisplayTitle(page)
  const draftWordCount = useMemo(() => countWords(textDraft), [textDraft])

  useEffect(
    () => () => {
      if (textSaveTimer.current) {
        clearTimeout(textSaveTimer.current)
      }
    },
    [],
  )

  function saveTitle(): void {
    if ((page.title ?? '') !== titleDraft) {
      onUpdatePageMetadata(page.id, { title: titleDraft })
    }
  }

  function saveSourcePage(): void {
    const nextSourcePageNumber = parseOptionalPageNumber(sourcePageDraft)
    if ((page.sourcePageNumber ?? null) !== nextSourcePageNumber) {
      onUpdatePageMetadata(page.id, { sourcePageNumber: nextSourcePageNumber })
    }
  }

  function saveNotes(): void {
    if ((page.ocrNotes ?? '') !== notesDraft) {
      onUpdatePageMetadata(page.id, { ocrNotes: notesDraft })
    }
  }

  function saveText(text = textDraft): void {
    if (textSaveTimer.current) {
      clearTimeout(textSaveTimer.current)
      textSaveTimer.current = null
    }
    if (text !== page.text) {
      onUpdatePageMetadata(page.id, { text })
    }
  }

  function scheduleTextSave(text: string): void {
    if (textSaveTimer.current) {
      clearTimeout(textSaveTimer.current)
    }
    textSaveTimer.current = setTimeout(() => saveText(text), 2000)
  }

  function confirmDelete(): void {
    if (!window.confirm(`Delete ${displayTitle}? This removes its text from the document.`)) {
      return
    }
    onDeletePage(page.id)
    onBackToDocument(document.id, chapter?.id ?? null)
  }

  return (
    <div className="content-stack">
      <section className="panel page-detail-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Page detail</span>
            <h1>{displayTitle}</h1>
            <div className="page-detail-subtitle">
              <span>{document.title}</span>
              {chapter && <span>{chapter.title}</span>}
              {pageIndex >= 0 && <span>Page {pageIndex + 1} of {totalChapterPages}</span>}
            </div>
          </div>
          <div className="reader-header-actions">
            <button className="secondary-button" onClick={() => onBackToDocument(document.id, chapter?.id ?? null)} type="button">
              Back to document
            </button>
            <button className="secondary-button" onClick={() => onOpenReader(document.id, chapter?.id ?? null)} type="button">
              Open reader
            </button>
            <button className="danger-button" onClick={confirmDelete} type="button">
              Delete page
            </button>
          </div>
        </div>
        <div className="document-detail-metrics">
          <span>{draftWordCount.toLocaleString()} words</span>
          <span>Document page {page.pageNumber}</span>
          <span>Source page {page.sourcePageNumber ?? 'unset'}</span>
          <span>{page.reviewStatus}</span>
          {page.sourceFileName && <span>{page.sourceFileName}</span>}
        </div>
      </section>

      <section className="panel page-detail-edit-panel">
        <div className="page-detail-grid">
          <label className="field">
            Page label
            <input
              onBlur={saveTitle}
              onChange={(event) => setTitleDraft(event.target.value)}
              placeholder={displayTitle}
              value={titleDraft}
            />
          </label>
          <label className="field">
            Source page
            <input
              inputMode="numeric"
              onBlur={saveSourcePage}
              onChange={(event) => setSourcePageDraft(event.target.value)}
              value={sourcePageDraft}
            />
          </label>
          <label className="field">
            Review status
            <select
              onChange={(event) =>
                onUpdatePageMetadata(page.id, {
                  reviewStatus: event.target.value as DocumentPageRecord['reviewStatus'],
                })
              }
              value={page.reviewStatus}
            >
              <option value="reviewed">Reviewed</option>
              <option value="needs_attention">Needs attention</option>
              <option value="unreviewed">Unreviewed</option>
              <option value="skipped">Skipped</option>
            </select>
          </label>
          <label className="field">
            OCR notes
            <input
              onBlur={saveNotes}
              onChange={(event) => setNotesDraft(event.target.value)}
              placeholder="OCR or review notes"
              value={notesDraft}
            />
          </label>
        </div>
        <label className="field page-content-field">
          Page content
          <textarea
            onBlur={() => saveText()}
            onChange={(event) => {
              const text = event.target.value
              setTextDraft(text)
              scheduleTextSave(text)
            }}
            value={textDraft}
          />
        </label>
      </section>

      <section className="panel page-detail-nav">
        <button
          className="secondary-button"
          disabled={!previousPage}
          onClick={() => previousPage && onOpenPage(document.id, previousPage.id)}
          type="button"
        >
          Previous page
        </button>
        <button
          className="secondary-button"
          disabled={!nextPage}
          onClick={() => nextPage && onOpenPage(document.id, nextPage.id)}
          type="button"
        >
          Next page
        </button>
      </section>
    </div>
  )
}

function parseOptionalPageNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}
