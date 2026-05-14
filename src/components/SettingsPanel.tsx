import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { OCR_CONCURRENT_ITEM_LIMIT_MAX, OCR_CONCURRENT_ITEM_LIMIT_MIN } from '../app/store'
import type { TourId } from '../app/tours'
import type { AppSettings, BaselineAssessmentResult, PageLayout, ReaderMode, ThemeMode } from '../types/domain'
import { isTauriRuntime } from '../lib/db/migrations'

type SettingsPanelProps = {
  baselineResult: BaselineAssessmentResult | null
  settings: AppSettings
  onSettingsChange: (settings: Partial<AppSettings>) => void
  onResetData: () => void
  onOpenJourney: () => void
  onReplayTour: (tourId: TourId) => void
  onResetTours: () => void
  onKeyStateChange: (hasKey: boolean, apiKey?: string) => void
}

export function SettingsPanel({
  baselineResult,
  settings,
  onSettingsChange,
  onResetData,
  onOpenJourney,
  onReplayTour,
  onResetTours,
  onKeyStateChange,
}: SettingsPanelProps) {
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [message, setMessage] = useState('')
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false)

  useEffect(() => {
    if (!isTauriRuntime()) {
      return
    }

    void invoke<{ hasKey: boolean }>('keychain_has_gemini_key').then((result) => {
      setHasKey(result.hasKey)
      onKeyStateChange(result.hasKey)
    })
  }, [onKeyStateChange])

  async function saveKey(): Promise<void> {
    if (!apiKey.trim()) {
      return
    }

    if (isTauriRuntime()) {
      await invoke('keychain_set_gemini_key', { apiKey: apiKey.trim() })
      setMessage('Gemini key saved to the OS keychain.')
    } else {
      setMessage('Gemini key available for this browser session.')
    }

    setApiKey('')
    setHasKey(true)
    onKeyStateChange(true, apiKey.trim())
  }

  async function deleteKey(): Promise<void> {
    if (isTauriRuntime()) {
      await invoke('keychain_delete_gemini_key')
    }
    setHasKey(false)
    onKeyStateChange(false, '')
    setMessage('Gemini key deleted.')
  }

  function enableBatchOcr(): void {
    onSettingsChange({
      ocr: {
        ...settings.ocr,
        processingMode: 'batch',
        batchDisclaimerAcceptedAt: new Date().toISOString(),
      },
    })
    setIsBatchDialogOpen(false)
  }

  function toggleBatchOcr(isEnabled: boolean): void {
    if (!isEnabled) {
      onSettingsChange({ ocr: { ...settings.ocr, processingMode: 'interactive' } })
      return
    }
    if (settings.ocr.batchDisclaimerAcceptedAt) {
      onSettingsChange({ ocr: { ...settings.ocr, processingMode: 'batch' } })
      return
    }
    setIsBatchDialogOpen(true)
  }

  return (
    <section className="panel settings-panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">Settings</span>
          <h1>Privacy and defaults</h1>
        </div>
        <span className={hasKey ? 'status-pill ok' : 'status-pill'}>{hasKey ? 'Gemini key stored' : 'No Gemini key'}</span>
      </div>

      <div className="settings-grid">
        <section data-tour="settings-key">
          <h2>Gemini API key</h2>
          <label className="field">
            API key
            <input
              autoComplete="off"
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="AIza..."
              type="password"
              value={apiKey}
            />
          </label>
          <div className="button-row">
            <button className="primary-button" onClick={() => void saveKey()} type="button">
              Save key
            </button>
            <button className="secondary-button" onClick={() => void deleteKey()} type="button">
              Delete key
            </button>
          </div>
          {message && <span className="form-message">{message}</span>}
        </section>

        <section data-tour="settings-reader">
          <h2>Reader defaults</h2>
          <label className="field">
            Default WPM
            <input
              max={900}
              min={80}
              onChange={(event) =>
                onSettingsChange({ reader: { ...settings.reader, defaultWpm: Number(event.target.value) } })
              }
              type="number"
              value={settings.reader.defaultWpm}
            />
          </label>
          <label className="field">
            Default mode
            <select
              onChange={(event) =>
                onSettingsChange({ reader: { ...settings.reader, defaultMode: event.target.value as ReaderMode } })
              }
              value={settings.reader.defaultMode}
            >
              <option value="rail">Rail</option>
              <option value="chunk">Chunk</option>
              <option value="rsvp">RSVP drill</option>
            </select>
          </label>
          <label className="field">
            Default pane layout
            <select
              onChange={(event) =>
                onSettingsChange({ reader: { ...settings.reader, defaultPageLayout: Number(event.target.value) as PageLayout } })
              }
              value={settings.reader.defaultPageLayout}
            >
              <option value={1}>1 pane</option>
              <option value={2}>2 panes</option>
              <option value={3}>3 panes</option>
              <option value={4}>4 panes</option>
            </select>
          </label>
          <label className="field">
            Theme
            <select
              onChange={(event) => onSettingsChange({ reader: { ...settings.reader, theme: event.target.value as ThemeMode } })}
              value={settings.reader.theme}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </section>

        <section data-tour="settings-ocr">
          <h2>OCR and data</h2>
          <label className="toggle">
            <input
              checked={settings.privacy.retainSourceImages}
              onChange={(event) => onSettingsChange({ privacy: { ...settings.privacy, retainSourceImages: event.target.checked } })}
              type="checkbox"
            />
            Retain OCR source images locally
          </label>
          <label className="toggle">
            <input
              checked={settings.privacy.stripImageMetadataBeforeOcr}
              onChange={(event) =>
                onSettingsChange({
                  privacy: { ...settings.privacy, stripImageMetadataBeforeOcr: event.target.checked },
                })
              }
              type="checkbox"
            />
            Strip image metadata before OCR upload
          </label>
          <p className="settings-note">
            Supported image files are re-encoded locally before Gemini OCR. PDFs and unsupported image formats are sent unchanged.
          </p>
          <label className="toggle">
            <input
              checked={settings.ocr.processingMode === 'batch'}
              onChange={(event) => toggleBatchOcr(event.target.checked)}
              type="checkbox"
            />
            Use Gemini Batch OCR
          </label>
          <p className="settings-note">
            Batch OCR reduces estimated Gemini OCR costs by 50%, raises imports to 500 files, and can take 24-48 hours.
          </p>
          {settings.ocr.processingMode === 'batch' ? (
            <div className="settings-readout" aria-label="Batch OCR import limit">
              <span>Batch OCR import limit</span>
              <strong>500 files</strong>
            </div>
          ) : (
            <>
              <label className="field">
                Interactive OCR concurrency
                <input
                  max={OCR_CONCURRENT_ITEM_LIMIT_MAX}
                  min={OCR_CONCURRENT_ITEM_LIMIT_MIN}
                  onChange={(event) =>
                    onSettingsChange({
                      ocr: { ...settings.ocr, concurrentItemLimit: Number(event.target.value) },
                    })
                  }
                  type="number"
                  value={settings.ocr.concurrentItemLimit}
                />
              </label>
              <p className="settings-note">
                Higher values send more Gemini requests at once. Interactive OCR supports up to 25 selected files.
              </p>
            </>
          )}
          <button className="danger-button" onClick={onResetData} type="button">
            Delete local app data
          </button>
        </section>

        <section data-tour="settings-guidance">
          <h2>Guidance</h2>
          <p className="settings-note">
            Revisit the learner journey, baseline setup, and mode overview before a practice session.
          </p>
          {baselineResult && (
            <p className="settings-note">
              Baseline: {baselineResult.rawWpm} raw WPM, {baselineResult.comprehensionPercent}% comprehension,{' '}
              {baselineResult.recommendedWpm} WPM recommended.
            </p>
          )}
          <button className="secondary-button" onClick={onOpenJourney} type="button">
            Open learner journey
          </button>
          <div className="tour-replay-grid" aria-label="Replay walkthroughs">
            {(['library-saved', 'reader', 'progress', 'stats', 'settings'] as const).map((tourId) => (
              <button className="secondary-button" key={tourId} onClick={() => onReplayTour(tourId)} type="button">
                {tourId === 'library-saved' ? 'Library' : `${tourId[0].toUpperCase()}${tourId.slice(1)}`}
              </button>
            ))}
          </div>
          <button className="ghost-button" onClick={onResetTours} type="button">
            Show walkthroughs again automatically
          </button>
        </section>
      </div>
      {isBatchDialogOpen && (
        <div className="modal-backdrop" role="presentation">
          <section aria-labelledby="batch-ocr-title" className="modal-card" role="dialog">
            <div className="panel-header compact">
              <div>
                <span className="eyebrow">Gemini Batch OCR</span>
                <h2 id="batch-ocr-title">Use delayed batch processing</h2>
              </div>
            </div>
            <p className="settings-note">
              Batch OCR can cut Gemini OCR cost estimates by 50% and raises the import limit to 500 files.
            </p>
            <p className="settings-note">
              Gemini targets completion within 24 hours, but jobs can take 24-48 hours depending on provider load and may expire.
            </p>
            <p className="settings-note">
              Readrail can resume polling after reopen. The next OCR stage only starts while the app is open and your Gemini key is available.
            </p>
            <p className="settings-note">
              Provider limits still apply, including File API storage, concurrent batch jobs, and model-specific queued token limits.
            </p>
            <div className="button-row">
              <button className="primary-button" onClick={enableBatchOcr} type="button">
                Enable Batch OCR
              </button>
              <button className="secondary-button" onClick={() => setIsBatchDialogOpen(false)} type="button">
                Keep interactive OCR
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
