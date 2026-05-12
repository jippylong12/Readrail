import { useRef, useState } from 'react'
import { cleanReadingText } from '../lib/text/cleanup'
import { countWords, estimateReadingMinutes } from '../lib/text/wordCount'

type ImportPanelProps = {
  defaultWpm: number
  onCreateDocument: (input: {
    title: string
    chapterTitle: string
    pageTitle: string
    sourcePageNumber: number | null
    content: string
  }) => void
}

const sampleText =
  'Paste the first page of this document here. Readrail cleans broken line endings, repairs hyphenation, estimates reading time, and keeps the original reading material local.'

export function ImportPanel({ defaultWpm, onCreateDocument }: ImportPanelProps) {
  const [title, setTitle] = useState('')
  const [chapterTitle, setChapterTitle] = useState('')
  const [pageTitle, setPageTitle] = useState('')
  const [sourcePageNumber, setSourcePageNumber] = useState('')
  const [content, setContent] = useState(sampleText)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cleaned = cleanReadingText(content)
  const wordCount = countWords(cleaned)
  const canSave = title.trim().length > 0 && wordCount > 0

  async function importFile(file: File): Promise<void> {
    const text = await file.text()
    setTitle(file.name.replace(/\.(txt|md)$/i, ''))
    setPageTitle(file.name.replace(/\.(txt|md)$/i, ''))
    setContent(text)
  }

  return (
    <section className="panel import-panel" data-tour="import">
      <div className="panel-header compact">
        <div>
          <span className="eyebrow">Manual</span>
          <h2>Create document</h2>
        </div>
        <button className="secondary-button" onClick={() => fileInputRef.current?.click()} type="button">
          Load text file
        </button>
      </div>

      <input
        accept=".txt,.md,text/plain,text/markdown"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            void importFile(file)
          }
        }}
        ref={fileInputRef}
        type="file"
      />

      <label className="field">
        Document title
        <input onChange={(event) => setTitle(event.target.value)} placeholder="The Great Book" value={title} />
      </label>

      <div className="manual-document-grid">
        <label className="field">
          First chapter
          <input
            onChange={(event) => setChapterTitle(event.target.value)}
            placeholder="Chapter 1"
            value={chapterTitle}
          />
        </label>

        <label className="field">
          First page label
          <input onChange={(event) => setPageTitle(event.target.value)} placeholder="Opening page" value={pageTitle} />
        </label>

        <label className="field">
          Source page
          <input
            inputMode="numeric"
            onChange={(event) => setSourcePageNumber(event.target.value)}
            placeholder="1"
            value={sourcePageNumber}
          />
        </label>
      </div>

      <label className="field">
        First page text
        <textarea onChange={(event) => setContent(event.target.value)} value={content} />
      </label>

      <div className="import-footer">
        <span>
          {wordCount.toLocaleString()} words - about {estimateReadingMinutes(wordCount, defaultWpm)} min at {defaultWpm} WPM
        </span>
        <button
          className="primary-button"
          disabled={!canSave}
          onClick={() =>
            onCreateDocument({
              title,
              chapterTitle,
              pageTitle,
              sourcePageNumber: parseOptionalPageNumber(sourcePageNumber),
              content: cleaned,
            })
          }
          type="button"
        >
          Save manual document
        </button>
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
  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : null
}
