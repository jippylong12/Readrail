import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { TourId } from '../app/tours'
import type { AppSettings, BaselineAssessmentResult, ReaderMode, ThemeMode } from '../types/domain'
import { isTauriRuntime } from '../lib/db/migrations'

type SettingsPanelProps = {
  baselineResult: BaselineAssessmentResult | null
  settings: AppSettings
  onSettingsChange: (settings: Partial<AppSettings>) => void
  onResetData: () => void
  onOpenJourney: () => void
  onReplayTour: (tourId: TourId) => void
  onResetTours: () => void
  onKeyStateChange: (hasKey: boolean) => void
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
      await invoke('keychain_set_gemini_key', { apiKey })
      setMessage('Gemini key saved to the OS keychain.')
    } else {
      setMessage('Browser preview cannot write to the OS keychain.')
    }

    setApiKey('')
    setHasKey(true)
    onKeyStateChange(true)
  }

  async function deleteKey(): Promise<void> {
    if (isTauriRuntime()) {
      await invoke('keychain_delete_gemini_key')
    }
    setHasKey(false)
    onKeyStateChange(false)
    setMessage('Gemini key deleted.')
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
              checked={settings.privacy.confirmRemoteOcrEachTime}
              onChange={(event) =>
                onSettingsChange({ privacy: { ...settings.privacy, confirmRemoteOcrEachTime: event.target.checked } })
              }
              type="checkbox"
            />
            Confirm before each remote OCR call
          </label>
          <label className="toggle">
            <input
              checked={settings.privacy.retainSourceImages}
              onChange={(event) => onSettingsChange({ privacy: { ...settings.privacy, retainSourceImages: event.target.checked } })}
              type="checkbox"
            />
            Retain OCR source images locally
          </label>
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
            {(['library', 'reader', 'stats', 'settings'] as const).map((tourId) => (
              <button className="secondary-button" key={tourId} onClick={() => onReplayTour(tourId)} type="button">
                {tourId[0].toUpperCase()}
                {tourId.slice(1)}
              </button>
            ))}
          </div>
          <button className="ghost-button" onClick={onResetTours} type="button">
            Show walkthroughs again automatically
          </button>
        </section>
      </div>
    </section>
  )
}
