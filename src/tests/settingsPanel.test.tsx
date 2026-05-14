// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsPanel } from '../components/SettingsPanel'
import type { AppSettings } from '../types/domain'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

const settings: AppSettings = {
  ocr: {
    modelId: 'gemini-3.1-flash-lite',
    preservePageBreaks: true,
    concurrentItemLimit: 10,
    processingMode: 'interactive',
    batchDisclaimerAcceptedAt: null,
  },
  privacy: {
    confirmRemoteOcrEachTime: true,
    retainSourceImages: false,
    stripImageMetadataBeforeOcr: true,
  },
  reader: {
    chunkSize: 4,
    defaultMode: 'rail',
    defaultPageLayout: 2,
    defaultWpm: 240,
    fontFamily: 'system',
    fontSize: 20,
    lineHeight: 1.65,
    reducedMotion: false,
    theme: 'system',
  },
}

afterEach(() => {
  cleanup()
})

describe('SettingsPanel', () => {
  it('labels the default reader layout as panes and saves the selected count', async () => {
    const user = userEvent.setup()
    const onSettingsChange = vi.fn()

    render(
      <SettingsPanel
        baselineResult={null}
        settings={settings}
        onKeyStateChange={vi.fn()}
        onOpenJourney={vi.fn()}
        onReplayTour={vi.fn()}
        onResetData={vi.fn()}
        onResetTours={vi.fn()}
        onSettingsChange={onSettingsChange}
      />,
    )

    await user.selectOptions(screen.getByLabelText('Default pane layout'), '4')

    expect(screen.getByRole('option', { name: '4 panes' })).toBeTruthy()
    expect(onSettingsChange).toHaveBeenCalledWith({
      reader: expect.objectContaining({ defaultPageLayout: 4 }),
    })
  })

  it('saves the selected OCR concurrency with direct rate-limit copy', () => {
    const onSettingsChange = vi.fn()

    render(
      <SettingsPanel
        baselineResult={null}
        settings={settings}
        onKeyStateChange={vi.fn()}
        onOpenJourney={vi.fn()}
        onReplayTour={vi.fn()}
        onResetData={vi.fn()}
        onResetTours={vi.fn()}
        onSettingsChange={onSettingsChange}
      />,
    )

    expect(screen.getByText('Higher values send more Gemini requests at once. Interactive OCR supports up to 25 selected files.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Interactive OCR concurrency'), { target: { value: '25' } })

    expect(onSettingsChange).toHaveBeenCalledWith({
      ocr: expect.objectContaining({ concurrentItemLimit: 25 }),
    })
  })

  it('replaces interactive concurrency with the batch file limit when Batch OCR is enabled', () => {
    render(
      <SettingsPanel
        baselineResult={null}
        settings={{
          ...settings,
          ocr: {
            ...settings.ocr,
            processingMode: 'batch',
            batchDisclaimerAcceptedAt: '2026-05-14T12:00:00.000Z',
          },
        }}
        onKeyStateChange={vi.fn()}
        onOpenJourney={vi.fn()}
        onReplayTour={vi.fn()}
        onResetData={vi.fn()}
        onResetTours={vi.fn()}
        onSettingsChange={vi.fn()}
      />,
    )

    expect(screen.queryByLabelText('Interactive OCR concurrency')).toBeNull()
    expect(screen.getByLabelText('Batch OCR import limit').textContent).toContain('500 files')
  })
})
