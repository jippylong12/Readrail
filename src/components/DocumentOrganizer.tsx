import { useState } from 'react'
import { getOrderedChapterPages, getOrderedDocumentChapters } from '../app/structuredDocuments'
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
  onUpdatePageMetadata: (
    pageId: string,
    updates: Partial<Pick<DocumentPageRecord, 'sourcePageNumber' | 'title'>>,
  ) => void
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
  onUpdatePageMetadata,
}: DocumentOrganizerProps) {
  const [newChapterTitle, setNewChapterTitle] = useState('')
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null)
  const [chapterTitleDraft, setChapterTitleDraft] = useState('')
  const [pageLabelDrafts, setPageLabelDrafts] = useState<Record<string, string>>({})
  const [sourcePageDrafts, setSourcePageDrafts] = useState<Record<string, string>>({})
  const orderedChapters = getOrderedDocumentChapters(document.id, chapters)

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

      <div className="organizer-chapter-list">
        {orderedChapters.map((chapter, chapterIndex) => {
          const chapterPages = getOrderedChapterPages(chapter.id, pages)
          const isEditingChapter = editingChapterId === chapter.id
          return (
            <article className="organizer-chapter" key={chapter.id}>
              <div className="organizer-chapter-header">
                {isEditingChapter ? (
                  <form
                    className="organizer-title-edit"
                    onSubmit={(event) => {
                      event.preventDefault()
                      saveChapterTitle(chapter.id)
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
                      <span className="eyebrow">Chapter {chapterIndex + 1}</span>
                      <h3>{chapter.title}</h3>
                      <span>{chapterPages.length} page(s)</span>
                    </div>
                    <div className="organizer-actions">
                      <button
                        className="ghost-button"
                        disabled={chapterIndex === 0}
                        onClick={() => onMoveChapter(document.id, chapter.id, -1)}
                        type="button"
                      >
                        Up
                      </button>
                      <button
                        className="ghost-button"
                        disabled={chapterIndex === orderedChapters.length - 1}
                        onClick={() => onMoveChapter(document.id, chapter.id, 1)}
                        type="button"
                      >
                        Down
                      </button>
                      <button
                        className="ghost-button"
                        onClick={() => {
                          setEditingChapterId(chapter.id)
                          setChapterTitleDraft(chapter.title)
                        }}
                        type="button"
                      >
                        Rename
                      </button>
                      <button
                        className="danger-button"
                        disabled={orderedChapters.length <= 1}
                        onClick={() => onDeleteChapter(chapter.id)}
                        title="Pages move to the nearest chapter."
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="organizer-page-list">
                {chapterPages.length === 0 ? (
                  <div className="empty-state compact">
                    <strong>Empty chapter</strong>
                    <span>Move pages here or delete it.</span>
                  </div>
                ) : (
                  chapterPages.map((page, pageIndex) => (
                    <article className="organizer-page" key={page.id}>
                      <div className="organizer-page-summary">
                        <strong>{page.title || `Page ${page.pageNumber}`}</strong>
                        <span>
                          {page.wordCount.toLocaleString()} words - source page {page.sourcePageNumber ?? 'unset'} - {page.reviewStatus}
                        </span>
                      </div>
                      <div className="organizer-page-controls">
                        <button
                          className="ghost-button"
                          disabled={pageIndex === 0}
                          onClick={() => onMovePage(page.id, chapter.id, pageIndex - 1)}
                          type="button"
                        >
                          Up
                        </button>
                        <button
                          className="ghost-button"
                          disabled={pageIndex === chapterPages.length - 1}
                          onClick={() => onMovePage(page.id, chapter.id, pageIndex + 1)}
                          type="button"
                        >
                          Down
                        </button>
                        <label className="field compact">
                          Move to
                          <select
                            aria-label={`Move page ${page.pageNumber} to chapter`}
                            onChange={(event) => {
                              const nextChapterId = event.target.value
                              if (nextChapterId !== chapter.id) {
                                const nextChapterPageCount = getOrderedChapterPages(nextChapterId, pages).length
                                onMovePage(page.id, nextChapterId, nextChapterPageCount)
                              }
                            }}
                            value={chapter.id}
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
                    </article>
                  ))
                )}
              </div>
            </article>
          )
        })}
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
