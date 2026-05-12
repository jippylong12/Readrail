import { useState } from 'react'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import {
  getDocumentPageDisplayTitle,
  getOrderedChapterPages,
  getOrderedDocumentChapters,
} from '../app/structuredDocuments'
import type { DocumentChapterRecord, DocumentPageRecord, DocumentRecord } from '../types/domain'

type DocumentOrganizerProps = {
  document: DocumentRecord
  chapters: DocumentChapterRecord[]
  pages: DocumentPageRecord[]
  onCreateChapter: (documentId: string, title?: string) => void
  onRenameChapter: (chapterId: string, title: string) => void
  onMoveChapter: (documentId: string, chapterId: string, direction: -1 | 1) => void
  onDeleteChapter: (chapterId: string) => void
  onMovePage: (pageId: string, targetChapterId: string, targetIndex: number) => void
  onDeletePage: (pageId: string) => void
  onDeletePages: (pageIds: string[]) => number
  onSelectChapter: (chapterId: string) => void
  onSelectPage: (pageNumber: number) => void
  onUpdatePageMetadata: (
    pageId: string,
    updates: Partial<Pick<DocumentPageRecord, 'sourcePageNumber' | 'title'>>,
  ) => void
  pageNumber: number
  pagesPerPage: number
  selectedChapterId: string | null
}

export function DocumentOrganizer({
  document,
  chapters,
  pages,
  onCreateChapter,
  onRenameChapter,
  onMoveChapter,
  onDeleteChapter,
  onMovePage,
  onDeletePage,
  onDeletePages,
  onSelectChapter,
  onSelectPage,
  onUpdatePageMetadata,
  pageNumber,
  pagesPerPage,
  selectedChapterId,
}: DocumentOrganizerProps) {
  const [newChapterTitle, setNewChapterTitle] = useState('')
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null)
  const [chapterTitleDraft, setChapterTitleDraft] = useState('')
  const [pageLabelDrafts, setPageLabelDrafts] = useState<Record<string, string>>({})
  const [sourcePageDrafts, setSourcePageDrafts] = useState<Record<string, string>>({})
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(() => new Set())
  const orderedChapters = getOrderedDocumentChapters(document.id, chapters)
  const selectedChapter = orderedChapters.find((chapter) => chapter.id === selectedChapterId) ?? orderedChapters[0] ?? null
  const selectedChapterIndex = selectedChapter
    ? orderedChapters.findIndex((chapter) => chapter.id === selectedChapter.id)
    : -1
  const selectedChapterPages = selectedChapter ? getOrderedChapterPages(selectedChapter.id, pages) : []
  const paginationPageCount = Math.max(1, Math.ceil(selectedChapterPages.length / pagesPerPage))
  const currentPageNumber = Math.min(Math.max(1, pageNumber), paginationPageCount)
  const visibleStartIndex = (currentPageNumber - 1) * pagesPerPage
  const visiblePages = selectedChapterPages.slice(visibleStartIndex, visibleStartIndex + pagesPerPage)
  const selectedChapterWords = selectedChapterPages.reduce((total, page) => total + page.wordCount, 0)
  const validSelectedPageIds = new Set(pages.filter((page) => selectedPageIds.has(page.id)).map((page) => page.id))
  const visibleSelectablePageIds = visiblePages.map((page) => page.id)
  const selectedVisiblePageCount = visibleSelectablePageIds.filter((pageId) => validSelectedPageIds.has(pageId)).length
  const selectedPageCount = validSelectedPageIds.size
  const selectedPageDeleteDisabled = selectedPageCount === 0 || selectedPageCount >= pages.length

  function submitChapter(): void {
    onCreateChapter(document.id, newChapterTitle)
    setNewChapterTitle('')
  }

  function saveChapterTitle(chapterId: string): void {
    onRenameChapter(chapterId, chapterTitleDraft)
    setEditingChapterId(null)
    setChapterTitleDraft('')
  }

  function pageLabelValue(page: DocumentPageRecord): string {
    return pageLabelDrafts[page.id] ?? page.title ?? ''
  }

  function sourcePageValue(page: DocumentPageRecord): string {
    return sourcePageDrafts[page.id] ?? page.sourcePageNumber?.toString() ?? ''
  }

  function confirmPageDelete(page: DocumentPageRecord): void {
    const displayTitle = getDocumentPageDisplayTitle(page)
    if (!window.confirm(`Delete ${displayTitle}? This removes its text from the document.`)) {
      return
    }

    setPageLabelDrafts((drafts) => {
      const nextDrafts = { ...drafts }
      delete nextDrafts[page.id]
      return nextDrafts
    })
    setSourcePageDrafts((drafts) => {
      const nextDrafts = { ...drafts }
      delete nextDrafts[page.id]
      return nextDrafts
    })
    setSelectedPageIds((pageIds) => {
      const nextPageIds = new Set(pageIds)
      nextPageIds.delete(page.id)
      return nextPageIds
    })
    onDeletePage(page.id)
  }

  function togglePageSelection(pageId: string): void {
    setSelectedPageIds((currentPageIds) => {
      const nextPageIds = new Set(currentPageIds)
      if (nextPageIds.has(pageId)) {
        nextPageIds.delete(pageId)
      } else {
        nextPageIds.add(pageId)
      }
      return nextPageIds
    })
  }

  function toggleVisiblePageSelection(): void {
    setSelectedPageIds((currentPageIds) => {
      const nextPageIds = new Set(currentPageIds)
      const allVisibleSelected = visibleSelectablePageIds.every((pageId) => nextPageIds.has(pageId))
      for (const pageId of visibleSelectablePageIds) {
        if (allVisibleSelected) {
          nextPageIds.delete(pageId)
        } else {
          nextPageIds.add(pageId)
        }
      }
      return nextPageIds
    })
  }

  function clearPageSelection(): void {
    setSelectedPageIds(new Set())
  }

  function confirmSelectedPageDelete(): void {
    const pageIds = Array.from(validSelectedPageIds)
    if (pageIds.length === 0 || pageIds.length >= pages.length) {
      return
    }

    if (!window.confirm(`Delete ${pageIds.length} pages? This removes their text from the document.`)) {
      return
    }

    const deletedCount = onDeletePages(pageIds)
    if (deletedCount > 0) {
      clearPageSelection()
    }
  }

  return (
    <section className="document-organizer" aria-label={`Organize ${document.title}`}>
      <form
        className="organizer-add-chapter"
        onSubmit={(event) => {
          event.preventDefault()
          submitChapter()
        }}
      >
        <label className="field">
          New chapter
          <input
            onChange={(event) => setNewChapterTitle(event.target.value)}
            placeholder={`Chapter ${orderedChapters.length + 1}`}
            value={newChapterTitle}
          />
        </label>
        <button className="secondary-button" type="submit">
          Add chapter
        </button>
      </form>

      <div className="organizer-browser">
        <nav className="organizer-chapter-nav" aria-label="Document chapters">
          {orderedChapters.map((chapter, chapterIndex) => {
            const chapterPages = getOrderedChapterPages(chapter.id, pages)
            const isSelected = chapter.id === selectedChapter?.id
            return (
              <button
                aria-current={isSelected ? 'page' : undefined}
                className={isSelected ? 'organizer-chapter-tab active' : 'organizer-chapter-tab'}
                key={chapter.id}
                onClick={() => onSelectChapter(chapter.id)}
                type="button"
              >
                <span className="eyebrow">Chapter {chapterIndex + 1}</span>
                <strong>{chapter.title}</strong>
                <span>{chapterPages.length} page(s)</span>
              </button>
            )
          })}
        </nav>

        {selectedChapter ? (
          <article className="organizer-chapter">
            <div className="organizer-chapter-header">
              {editingChapterId === selectedChapter.id ? (
                <form
                  className="organizer-title-edit"
                  onSubmit={(event) => {
                    event.preventDefault()
                    saveChapterTitle(selectedChapter.id)
                  }}
                >
                  <label className="field">
                    Chapter title
                    <input
                      autoFocus
                      onChange={(event) => setChapterTitleDraft(event.target.value)}
                      value={chapterTitleDraft}
                    />
                  </label>
                  <div className="button-row compact">
                    <button className="primary-button" type="submit">
                      Save
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => setEditingChapterId(null)}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div>
                    <span className="eyebrow">Chapter {selectedChapterIndex + 1}</span>
                    <h3>{selectedChapter.title}</h3>
                    <span>
                      {selectedChapterPages.length} page(s) - {selectedChapterWords.toLocaleString()} words
                    </span>
                  </div>
                  <div className="organizer-actions">
                    <button
                      className="ghost-button"
                      disabled={selectedChapterIndex <= 0}
                      onClick={() => onMoveChapter(document.id, selectedChapter.id, -1)}
                      type="button"
                    >
                      Up
                    </button>
                    <button
                      className="ghost-button"
                      disabled={selectedChapterIndex === orderedChapters.length - 1}
                      onClick={() => onMoveChapter(document.id, selectedChapter.id, 1)}
                      type="button"
                    >
                      Down
                    </button>
                    <button
                      className="ghost-button"
                      onClick={() => {
                        setEditingChapterId(selectedChapter.id)
                        setChapterTitleDraft(selectedChapter.title)
                      }}
                      type="button"
                    >
                      Rename
                    </button>
                    <button
                      className="danger-button"
                      disabled={orderedChapters.length <= 1}
                      onClick={() => onDeleteChapter(selectedChapter.id)}
                      title="Pages move to the nearest chapter."
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="organizer-pagination" aria-label="Chapter page navigation">
              <button
                className="ghost-button"
                disabled={currentPageNumber <= 1}
                onClick={() => onSelectPage(currentPageNumber - 1)}
                type="button"
              >
                Previous page
              </button>
              <span>
                Page {currentPageNumber} of {paginationPageCount}
                {selectedChapterPages.length > 0
                  ? ` - showing ${visibleStartIndex + 1}-${visibleStartIndex + visiblePages.length} of ${selectedChapterPages.length}`
                  : ' - no pages'}
              </span>
              <button
                className="ghost-button"
                disabled={currentPageNumber >= paginationPageCount}
                onClick={() => onSelectPage(currentPageNumber + 1)}
                type="button"
              >
                Next page
              </button>
            </div>

            <div className="organizer-page-list">
              {visiblePages.length === 0 ? (
                <div className="empty-state compact">
                  <strong>Empty chapter</strong>
                  <span>Move pages here or delete it.</span>
                </div>
              ) : (
                <>
                  <div className="organizer-page-selection">
                    <label className="organizer-select-visible">
                      <input
                        checked={visiblePages.length > 0 && selectedVisiblePageCount === visiblePages.length}
                        onChange={toggleVisiblePageSelection}
                        type="checkbox"
                      />
                      Select visible
                    </label>
                    {selectedPageCount > 0 && (
                      <div className="organizer-selected-actions">
                        <span>{selectedPageCount} selected</span>
                        <button className="ghost-button" onClick={clearPageSelection} type="button">
                          Clear
                        </button>
                        <button
                          aria-label={`Delete ${selectedPageCount} selected pages`}
                          className="icon-button danger"
                          disabled={selectedPageDeleteDisabled}
                          onClick={confirmSelectedPageDelete}
                          title={selectedPageDeleteDisabled ? 'Keep at least one page' : 'Delete selected'}
                          type="button"
                        >
                          <Trash2 aria-hidden="true" size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                  {visiblePages.map((page, visiblePageIndex) => {
                    const pageIndex = visibleStartIndex + visiblePageIndex
                    const displayTitle = getDocumentPageDisplayTitle(page)
                    const isSelected = validSelectedPageIds.has(page.id)
                    return (
                      <article className={isSelected ? 'organizer-page selected' : 'organizer-page'} key={page.id}>
                        <label className="organizer-page-select">
                          <input
                            aria-label={`Select ${displayTitle}`}
                            checked={isSelected}
                            onChange={() => togglePageSelection(page.id)}
                            type="checkbox"
                          />
                        </label>
                        <div className="organizer-page-summary">
                          <strong>{displayTitle}</strong>
                          <span>
                            {page.wordCount.toLocaleString()} words - source page {page.sourcePageNumber ?? 'unset'} - {page.reviewStatus}
                          </span>
                        </div>
                        <div className="organizer-page-controls">
                        <div className="organizer-page-toolbar" aria-label={`${displayTitle} page actions`}>
                          <button
                            aria-label={`Move page ${page.pageNumber} up`}
                            className="icon-button"
                            disabled={pageIndex === 0}
                            onClick={() => onMovePage(page.id, selectedChapter.id, pageIndex - 1)}
                            title="Move up"
                            type="button"
                          >
                            <ArrowUp aria-hidden="true" size={16} />
                          </button>
                          <button
                            aria-label={`Move page ${page.pageNumber} down`}
                            className="icon-button"
                            disabled={pageIndex === selectedChapterPages.length - 1}
                            onClick={() => onMovePage(page.id, selectedChapter.id, pageIndex + 1)}
                            title="Move down"
                            type="button"
                          >
                            <ArrowDown aria-hidden="true" size={16} />
                          </button>
                          <button
                            aria-label={`Delete ${displayTitle}`}
                            className="icon-button danger"
                            disabled={pages.length <= 1}
                            onClick={() => confirmPageDelete(page)}
                            title={pages.length <= 1 ? 'Keep at least one page' : 'Delete'}
                            type="button"
                          >
                            <Trash2 aria-hidden="true" size={16} />
                          </button>
                        </div>
                        <div className="organizer-page-fields">
                          <label className="field compact">
                            Move to
                            <select
                              aria-label={`Move page ${page.pageNumber} to chapter`}
                              onChange={(event) => {
                                const nextChapterId = event.target.value
                                if (nextChapterId !== selectedChapter.id) {
                                  const nextChapterPageCount = getOrderedChapterPages(nextChapterId, pages).length
                                  onMovePage(page.id, nextChapterId, nextChapterPageCount)
                                }
                              }}
                              value={selectedChapter.id}
                            >
                              {orderedChapters.map((candidate) => (
                                <option key={candidate.id} value={candidate.id}>
                                  {candidate.title}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="field compact">
                            Label
                            <input
                              aria-label={`Label for page ${page.pageNumber}`}
                              onBlur={() => onUpdatePageMetadata(page.id, { title: pageLabelValue(page) })}
                              onChange={(event) =>
                                setPageLabelDrafts((drafts) => ({ ...drafts, [page.id]: event.target.value }))
                              }
                              placeholder={displayTitle}
                              value={pageLabelValue(page)}
                            />
                          </label>
                          <label className="field compact">
                            Source page
                            <input
                              aria-label={`Source page for page ${page.pageNumber}`}
                              inputMode="numeric"
                              onBlur={() =>
                                onUpdatePageMetadata(page.id, { sourcePageNumber: parseOptionalPageNumber(sourcePageValue(page)) })
                              }
                              onChange={(event) =>
                                setSourcePageDrafts((drafts) => ({ ...drafts, [page.id]: event.target.value }))
                              }
                              value={sourcePageValue(page)}
                            />
                          </label>
                        </div>
                        </div>
                      </article>
                    )
                  })}
                </>
              )}
            </div>
          </article>
        ) : (
          <div className="empty-state compact">
            <strong>No chapters yet</strong>
            <span>Add a chapter to start organizing this document.</span>
          </div>
        )}
      </div>
    </section>
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
