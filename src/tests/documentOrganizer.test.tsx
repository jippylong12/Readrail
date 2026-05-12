// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DocumentOrganizer } from '../components/DocumentOrganizer'
import type { DocumentChapterRecord, DocumentPageRecord, DocumentRecord } from '../types/domain'

const now = '2026-05-11T12:00:00.000Z'

const documentRecord: DocumentRecord = {
  id: 'document-1',
  title: 'Existing book',
  sourceType: 'paste',
  content: 'First introduction page.\n\n\f\n\nSecond introduction page.',
  wordCount: 6,
  estimatedPages: 1,
  language: 'en',
  structureVersion: 1,
  createdAt: now,
  updatedAt: now,
  archivedAt: null,
}

const chapters: DocumentChapterRecord[] = [
  {
    id: 'chapter-intro',
    documentId: documentRecord.id,
    title: 'Introduction',
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  },
]

const pages: DocumentPageRecord[] = [
  buildPage({
    id: 'page-intro-1',
    pageNumber: 1,
    sortOrder: 0,
    sourcePageNumber: 21,
    text: 'First introduction page.',
  }),
  buildPage({
    id: 'page-intro-2',
    pageNumber: 2,
    sortOrder: 1,
    sourcePageNumber: 22,
    text: 'Second introduction page.',
  }),
]

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('DocumentOrganizer', () => {
  it('opens an inline page content preview when a page row is clicked', async () => {
    const user = userEvent.setup()
    renderOrganizer()

    await user.click(screen.getByText('Page 21'))

    expect(screen.getByRole('region', { name: 'Page 21 content preview' })).toBeTruthy()
    expect(screen.getByLabelText('Page content')).toHaveProperty('value', 'First introduction page.')
    expect(screen.getByText('Document page 1')).toBeTruthy()
  })

  it('does not open the page preview when selecting a page checkbox', async () => {
    const user = userEvent.setup()
    renderOrganizer()

    await user.click(screen.getByLabelText('Select Page 22'))

    expect(screen.queryByRole('region', { name: 'Page 22 content preview' })).toBeNull()
    expect(screen.queryByText('Second introduction page.')).toBeNull()
    expect(screen.getByText('1 selected')).toBeTruthy()
  })

  it('reorders pages with native drag and drop inside the selected chapter', () => {
    const onMovePage = vi.fn()
    renderOrganizer({ onMovePage })

    const firstRow = screen.getByText('Page 21').closest('article')
    const secondRow = screen.getByText('Page 22').closest('article')
    const dataTransfer = buildDataTransfer('page-intro-1')
    expect(firstRow).toBeTruthy()
    expect(secondRow).toBeTruthy()

    fireEvent.dragStart(firstRow!, { dataTransfer })
    fireEvent.dragOver(secondRow!, { dataTransfer })
    fireEvent.drop(secondRow!, { dataTransfer })

    expect(onMovePage).toHaveBeenCalledWith('page-intro-1', 'chapter-intro', 1)
  })

  it('edits page metadata and content from the organizer', async () => {
    const user = userEvent.setup()
    const onUpdatePageMetadata = vi.fn()
    renderOrganizer({ onUpdatePageMetadata })

    await user.click(screen.getByText('Page 21'))
    await user.clear(screen.getByLabelText('Label for page 1'))
    await user.type(screen.getByLabelText('Label for page 1'), 'Opening page')
    fireEvent.blur(screen.getByLabelText('Label for page 1'))
    await user.clear(screen.getByLabelText('Source page for page 1'))
    await user.type(screen.getByLabelText('Source page for page 1'), '163')
    fireEvent.blur(screen.getByLabelText('Source page for page 1'))
    await user.clear(screen.getByLabelText('Page content'))
    await user.type(screen.getByLabelText('Page content'), 'Edited page text.')
    fireEvent.blur(screen.getByLabelText('Page content'))

    expect(onUpdatePageMetadata).toHaveBeenCalledWith('page-intro-1', { title: 'Opening page' })
    expect(onUpdatePageMetadata).toHaveBeenCalledWith('page-intro-1', { sourcePageNumber: 163 })
    expect(onUpdatePageMetadata).toHaveBeenCalledWith('page-intro-1', { text: 'Edited page text.' })
  })

  it('allows selecting the number of pages shown in the document table', async () => {
    const user = userEvent.setup()
    const onPagesPerPageChange = vi.fn()
    renderOrganizer({ onPagesPerPageChange, pagesPerPage: 10 })

    await user.selectOptions(screen.getByLabelText('Pages per table'), '25')

    expect(onPagesPerPageChange).toHaveBeenCalledWith(25)
  })
})

function renderOrganizer(overrides: Partial<ComponentProps<typeof DocumentOrganizer>> = {}) {
  return render(
    <DocumentOrganizer
      chapters={chapters}
      document={documentRecord}
      onCreateChapter={vi.fn()}
      onDeleteChapter={vi.fn()}
      onDeletePage={vi.fn()}
      onDeletePages={vi.fn(() => 0)}
      onMoveChapter={vi.fn()}
      onMovePage={vi.fn()}
      onPagesPerPageChange={vi.fn()}
      onRenameChapter={vi.fn()}
      onSelectChapter={vi.fn()}
      onSelectPage={vi.fn()}
      onUpdatePageMetadata={vi.fn()}
      pageNumber={1}
      pages={pages}
      pagesPerPage={10}
      selectedChapterId="chapter-intro"
      {...overrides}
    />,
  )
}

function buildPage(overrides: Partial<DocumentPageRecord>): DocumentPageRecord {
  return {
    id: 'page',
    documentId: documentRecord.id,
    chapterId: 'chapter-intro',
    sortOrder: 0,
    pageNumber: 1,
    sourcePageNumber: null,
    title: null,
    text: '',
    wordCount: 3,
    reviewStatus: 'reviewed',
    ocrConfidence: null,
    ocrNotes: null,
    uncertainSpans: [],
    sourceFileId: null,
    sourceFileName: null,
    sourceKind: null,
    sourceLocalPath: null,
    sourceSha256: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function buildDataTransfer(pageId: string): DataTransfer {
  const values = new Map<string, string>()
  values.set('text/plain', pageId)
  return {
    effectAllowed: 'move',
    getData: vi.fn((type: string) => values.get(type) ?? ''),
    setData: vi.fn((type: string, value: string) => {
      values.set(type, value)
    }),
  } as unknown as DataTransfer
}
