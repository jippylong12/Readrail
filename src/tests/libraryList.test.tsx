// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryList } from '../components/LibraryList'
import type { DocumentChapterRecord, DocumentPageRecord, DocumentRecord } from '../types/domain'

const activeDocument: DocumentRecord = {
  id: 'doc-active',
  title: 'Active structured reading',
  sourceType: 'photo_ocr',
  content: 'Visible flat text.',
  wordCount: 6,
  estimatedPages: 1,
  language: 'en',
  structureVersion: 1,
  createdAt: '2026-05-11T12:00:00.000Z',
  updatedAt: '2026-05-11T12:00:00.000Z',
  archivedAt: null,
}

const archivedDocument: DocumentRecord = {
  ...activeDocument,
  id: 'doc-archived',
  title: 'Archived structured reading',
  archivedAt: '2026-05-11T13:00:00.000Z',
}

const chapters: DocumentChapterRecord[] = [
  {
    id: 'chapter-active',
    documentId: activeDocument.id,
    title: 'Glacier Notes',
    sortOrder: 0,
    createdAt: activeDocument.createdAt,
    updatedAt: activeDocument.updatedAt,
  },
  {
    id: 'chapter-archived',
    documentId: archivedDocument.id,
    title: 'Archived Match',
    sortOrder: 0,
    createdAt: archivedDocument.createdAt,
    updatedAt: archivedDocument.updatedAt,
  },
]

const pages: DocumentPageRecord[] = [
  {
    id: 'page-active',
    documentId: activeDocument.id,
    chapterId: 'chapter-active',
    sortOrder: 0,
    pageNumber: 1,
    sourcePageNumber: 12,
    title: 'Field Page',
    text: 'A shimmer phrase appears only on the structured page.',
    wordCount: 9,
    reviewStatus: 'reviewed',
    ocrConfidence: null,
    ocrNotes: null,
    uncertainSpans: [],
    sourceFileId: null,
    sourceFileName: null,
    sourceKind: 'image',
    sourceLocalPath: null,
    sourceSha256: null,
    createdAt: activeDocument.createdAt,
    updatedAt: activeDocument.updatedAt,
  },
  {
    id: 'page-archived',
    documentId: archivedDocument.id,
    chapterId: 'chapter-archived',
    sortOrder: 0,
    pageNumber: 1,
    sourcePageNumber: null,
    title: 'Archived Page',
    text: 'hidden structured match',
    wordCount: 3,
    reviewStatus: 'reviewed',
    ocrConfidence: null,
    ocrNotes: null,
    uncertainSpans: [],
    sourceFileId: null,
    sourceFileName: null,
    sourceKind: 'image',
    sourceLocalPath: null,
    sourceSha256: null,
    createdAt: archivedDocument.createdAt,
    updatedAt: archivedDocument.updatedAt,
  },
]

afterEach(() => {
  cleanup()
})

describe('LibraryList structured search', () => {
  it('finds active structured documents by chapter title, page title, and page text', async () => {
    const user = userEvent.setup()
    renderLibraryList()

    await user.type(screen.getByLabelText('Search documents'), 'glacier')
    expect(screen.getByText('Active structured reading')).toBeTruthy()

    await user.clear(screen.getByLabelText('Search documents'))
    await user.type(screen.getByLabelText('Search documents'), 'field page')
    expect(screen.getByText('Active structured reading')).toBeTruthy()

    await user.clear(screen.getByLabelText('Search documents'))
    await user.type(screen.getByLabelText('Search documents'), 'shimmer phrase')
    expect(screen.getByText('Active structured reading')).toBeTruthy()
  })

  it('keeps archived structured documents out of search results', async () => {
    const user = userEvent.setup()
    renderLibraryList()

    await user.type(screen.getByLabelText('Search documents'), 'hidden structured match')

    expect(screen.queryByText('Archived structured reading')).toBeNull()
    expect(screen.getByText('No saved readings yet')).toBeTruthy()
  })
})

function renderLibraryList(): void {
  render(
    <LibraryList
      activeDocumentId={null}
      documentChapters={chapters}
      documentPages={pages}
      documents={[activeDocument, archivedDocument]}
      onArchive={vi.fn()}
      onOpenDocument={vi.fn()}
      onOpenJourney={vi.fn()}
      onOpenReader={vi.fn()}
      onUpdateDocument={vi.fn()}
    />,
  )
}
