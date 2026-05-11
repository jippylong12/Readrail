import { useMemo, useState } from 'react'
import type { DocumentRecord } from '../types/domain'

type LibraryListProps = {
  documents: DocumentRecord[]
  activeDocumentId: string | null
  onSelect: (id: string) => void
  onUpdateDocument: (id: string, updates: Partial<Pick<DocumentRecord, 'title' | 'content'>>) => void
  onArchive: (id: string) => void
  onOpenJourney: () => void
}

export function LibraryList({
  documents,
  activeDocumentId,
  onSelect,
  onUpdateDocument,
  onArchive,
  onOpenJourney,
}: LibraryListProps) {
  const [query, setQuery] = useState('')
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')

  const visibleDocuments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return documents
      .filter((document) => !document.archivedAt)
      .filter((document) => {
        if (!normalizedQuery) {
          return true
        }

        return `${document.title} ${document.content}`.toLowerCase().includes(normalizedQuery)
      })
  }, [documents, query])

  return (
    <section className="panel library-panel" data-tour="library-list">
      <div className="panel-header">
        <div>
          <span className="eyebrow">Local Library</span>
          <h1>Reading documents</h1>
        </div>
        <div className="header-actions">
          <button className="secondary-button" onClick={onOpenJourney} type="button">
            Learner journey
          </button>
          <input
            aria-label="Search documents"
            className="search-input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            type="search"
            value={query}
          />
        </div>
      </div>

      {visibleDocuments.length === 0 ? (
        <div className="empty-state">
          <strong>No saved readings yet</strong>
          <span>Paste text or import a local file. OCR stays disabled until you add your Gemini key.</span>
        </div>
      ) : (
        <div className="document-list">
          {visibleDocuments.map((document) => (
            <article className={document.id === activeDocumentId ? 'document-row active' : 'document-row'} key={document.id}>
              {editingDocumentId === document.id ? (
                <form
                  className="document-title-edit"
                  onSubmit={(event) => {
                    event.preventDefault()
                    onUpdateDocument(document.id, { title: draftTitle })
                    setEditingDocumentId(null)
                  }}
                >
                  <label className="field">
                    Title
                    <input
                      autoFocus
                      onChange={(event) => setDraftTitle(event.target.value)}
                      value={draftTitle}
                    />
                  </label>
                  <div className="button-row compact">
                    <button className="primary-button" type="submit">
                      Save title
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => setEditingDocumentId(null)}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button onClick={() => onSelect(document.id)} type="button">
                  <strong>{document.title}</strong>
                  <span>
                    {document.wordCount.toLocaleString()} words - {document.estimatedPages} pages - {document.sourceType}
                  </span>
                </button>
              )}
              <div className="document-row-actions">
                <span>{new Date(document.updatedAt).toLocaleDateString()}</span>
                <button
                  className="ghost-button"
                  onClick={() => {
                    setEditingDocumentId(document.id)
                    setDraftTitle(document.title)
                  }}
                  type="button"
                >
                  Edit
                </button>
                <button className="ghost-button" onClick={() => onArchive(document.id)} type="button">
                  Archive
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
