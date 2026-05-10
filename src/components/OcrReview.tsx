import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { runGeminiOcrFromFiles } from '../lib/ai/geminiOcr'
import { isTauriRuntime } from '../lib/db/migrations'

type OcrReviewProps = {
  hasKey: boolean
  preservePageBreaks: boolean
  onCreateDocument: (title: string, content: string) => void
}

export function OcrReview({ hasKey, preservePageBreaks, onCreateDocument }: OcrReviewProps) {
  const [files, setFiles] = useState<File[]>([])
  const [status, setStatus] = useState<'idle' | 'confirm' | 'running' | 'review' | 'failed'>('idle')
  const [reviewText, setReviewText] = useState('')
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')

  async function startOcr(): Promise<void> {
    if (!files.length || !hasKey) {
      return
    }

    setStatus('running')
    setError('')

    try {
      const apiKey = isTauriRuntime()
        ? await invoke<string>('keychain_get_gemini_key_for_ocr', { reason: 'ocr' })
        : window.prompt('Gemini API key for this OCR run') || ''
      const result = await runGeminiOcrFromFiles(apiKey, files)
      setTitle(result.titleGuess ?? files[0]?.name.replace(/\.[^.]+$/, '') ?? 'OCR import')
      setReviewText(
        result.pages
          .map((page) => (preservePageBreaks ? `--- Page ${page.pageNumber} ---\n${page.text}` : page.text))
          .join('\n\n'),
      )
      setStatus('review')
    } catch (ocrError) {
      setError(ocrError instanceof Error ? ocrError.message : 'OCR failed')
      setStatus('failed')
    }
  }

  return (
    <section className="panel ocr-panel" data-tour="ocr">
      <div className="panel-header compact">
        <div>
          <span className="eyebrow">OCR</span>
          <h2>Photos or scanned PDFs</h2>
        </div>
        <span className={hasKey ? 'status-pill ok' : 'status-pill'}>{hasKey ? 'Key ready' : 'Key missing'}</span>
      </div>

      <p className="notice">
        OCR sends selected files directly to Google Gemini using your key. Readrail does not include a developer key or backend proxy.
      </p>

      <input
        accept="image/*,application/pdf"
        multiple
        onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
        type="file"
      />

      {files.length > 0 && <span>{files.length} file(s) selected</span>}
      {error && <span className="error-text">{error}</span>}

      {status === 'review' ? (
        <>
          <label className="field">
            Title
            <input onChange={(event) => setTitle(event.target.value)} value={title} />
          </label>
          <label className="field">
            OCR text
            <textarea onChange={(event) => setReviewText(event.target.value)} value={reviewText} />
          </label>
          <button className="primary-button" onClick={() => onCreateDocument(title, reviewText)} type="button">
            Save OCR document
          </button>
        </>
      ) : (
        <button
          className="secondary-button"
          disabled={!hasKey || files.length === 0 || status === 'running'}
          onClick={() => {
            if (status === 'confirm') {
              void startOcr()
            } else {
              setStatus('confirm')
            }
          }}
          type="button"
        >
          {status === 'running' ? 'Running OCR...' : status === 'confirm' ? 'Confirm and send to Gemini' : 'Start OCR'}
        </button>
      )}
    </section>
  )
}
