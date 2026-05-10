import { useRef, useState } from 'react'
import { cleanReadingText } from '../lib/text/cleanup'
import { countWords, estimateReadingMinutes } from '../lib/text/wordCount'

type ImportPanelProps = {
  defaultWpm: number
  onCreateDocument: (title: string, content: string, sourceType: 'paste' | 'text_file') => void
}

const sampleText =
  'Paste a chapter, article, or note here. Readrail cleans broken line endings, repairs hyphenation, estimates reading time, and keeps the original reading material local.'

export function ImportPanel({ defaultWpm, onCreateDocument }: ImportPanelProps) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState(sampleText)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cleaned = cleanReadingText(content)
  const wordCount = countWords(cleaned)

  async function importFile(file: File): Promise<void> {
    const text = await file.text()
    setTitle(file.name.replace(/\.(txt|md)$/i, ''))
    setContent(text)
  }

  return (
    <section className="panel import-panel">
      <div className="panel-header compact">
        <div>
          <span className="eyebrow">Import</span>
          <h2>Paste or text file</h2>
        </div>
        <button className="secondary-button" onClick={() => fileInputRef.current?.click()} type="button">
          Import file
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
        Title
        <input onChange={(event) => setTitle(event.target.value)} placeholder="Chapter 4 notes" value={title} />
      </label>

      <label className="field">
        Text
        <textarea onChange={(event) => setContent(event.target.value)} value={content} />
      </label>

      <div className="import-footer">
        <span>
          {wordCount.toLocaleString()} words - about {estimateReadingMinutes(wordCount, defaultWpm)} min at {defaultWpm} WPM
        </span>
        <button
          className="primary-button"
          disabled={wordCount === 0}
          onClick={() => onCreateDocument(title, cleaned, title ? 'text_file' : 'paste')}
          type="button"
        >
          Save document
        </button>
      </div>
    </section>
  )
}
