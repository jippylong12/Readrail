// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReaderControls } from '../components/ReaderControls'
import type { BaselineAssessmentResult, PageLayout } from '../types/domain'

const baselineResult: BaselineAssessmentResult = {
  id: 'baseline-1',
  storyTitle: 'Test story',
  storySource: 'default',
  wordCount: 250,
  durationSeconds: 60,
  rawWpm: 250,
  comprehensionPercent: 82,
  adjustedWpm: 205,
  recommendedWpm: 225,
  explanation: 'Start conservatively.',
  questionResults: [],
  completedAt: new Date().toISOString(),
  appliedWpmAt: new Date().toISOString(),
}

function renderControls({
  onChunkSizeChange = vi.fn(),
  onWpmChange = vi.fn(),
  pageLayout = 1,
}: {
  onChunkSizeChange?: (chunkSize: number) => void
  onWpmChange?: (wpm: number) => void
  pageLayout?: PageLayout
} = {}) {
  const onPageLayoutChange = vi.fn()
  render(
    <ReaderControls
      baselineResult={baselineResult}
      chunkSize={4}
      isFocusMode={false}
      isRunning={false}
      isTestAvailable
      mode="rail"
      pageLayout={pageLayout}
      canGoNextPane
      canGoPreviousPane={false}
      onChunkSizeChange={onChunkSizeChange}
      onFocusModeToggle={vi.fn()}
      onModeChange={vi.fn()}
      onNextPane={vi.fn()}
      onPageLayoutChange={onPageLayoutChange}
      onPreviousPane={vi.fn()}
      onTest={vi.fn()}
      onToggleRunning={vi.fn()}
      onWpmChange={onWpmChange}
      targetWpm={225}
    />,
  )
  return { onChunkSizeChange, onPageLayoutChange, onWpmChange }
}

afterEach(() => {
  cleanup()
})

describe('ReaderControls', () => {
  it('explains each reader mode from the mode selector info button', async () => {
    const user = userEvent.setup()

    renderControls()

    expect(screen.getByRole('group', { name: 'Reading mode' })).toBeTruthy()
    expect(screen.queryByText(/Recommended default: guided lines and phrase highlights/i)).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Explain reader modes' }))

    expect(screen.getByText(/Recommended default: guided lines and phrase highlights/i)).toBeTruthy()
    expect(screen.getByText(/Phrase grouping practice/i)).toBeTruthy()
    expect(screen.getByText(/Optional focused drill: less context and less rereading/i)).toBeTruthy()
    expect(screen.getByText(/Baseline: 250 raw WPM, 82% comprehension/i)).toBeTruthy()
    expect(screen.getByText(/do not optimize raw speed alone/i)).toBeTruthy()
  })

  it('renders a 1/2/3/4 pane layout picker', () => {
    renderControls({ pageLayout: 1 })

    expect(screen.getByRole('group', { name: 'Pane count' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '1 pane' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '2 panes' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '3 panes' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '4 panes' })).toBeTruthy()
  })

  it('marks the active pane count button as pressed', () => {
    renderControls({ pageLayout: 3 })

    const button3 = screen.getByRole('button', { name: '3 panes' })
    expect(button3.getAttribute('aria-pressed')).toBe('true')

    const button1 = screen.getByRole('button', { name: '1 pane' })
    expect(button1.getAttribute('aria-pressed')).toBe('false')
  })

  it('calls onPageLayoutChange with the chosen count', async () => {
    const user = userEvent.setup()
    const { onPageLayoutChange } = renderControls({ pageLayout: 1 })

    await user.click(screen.getByRole('button', { name: '4 panes' }))

    expect(onPageLayoutChange).toHaveBeenCalledWith(4)
  })

  it('lets WPM values be typed before clamping on commit', async () => {
    const user = userEvent.setup()
    const onWpmChange = vi.fn()
    renderControls({ onWpmChange })

    const input = screen.getByRole('spinbutton', { name: 'WPM' })
    await user.clear(input)
    await user.type(input, '500')

    expect((input as HTMLInputElement).value).toBe('500')
    expect(onWpmChange).toHaveBeenCalledWith(500)

    await user.tab()

    expect(onWpmChange).toHaveBeenCalledWith(500)
  })

  it('clamps numeric control values after editing is committed', async () => {
    const user = userEvent.setup()
    const onWpmChange = vi.fn()
    renderControls({ onWpmChange })

    const input = screen.getByRole('spinbutton', { name: 'WPM' })
    await user.clear(input)
    await user.type(input, '5')
    expect((input as HTMLInputElement).value).toBe('5')
    expect(onWpmChange).not.toHaveBeenCalled()

    await user.tab()

    expect(onWpmChange).toHaveBeenCalledWith(80)
  })
})
