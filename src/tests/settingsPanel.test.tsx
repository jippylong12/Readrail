// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
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
})
