// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReaderControls } from '../components/ReaderControls'
import type { BaselineAssessmentResult } from '../types/domain'

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

afterEach(() => {
  cleanup()
})

describe('ReaderControls', () => {
  it('explains each reader mode from the mode selector info button', async () => {
    const user = userEvent.setup()

    render(
      <ReaderControls
        baselineResult={baselineResult}
        chunkSize={4}
        isRunning={false}
        mode="rail"
        onChunkSizeChange={vi.fn()}
        onFinish={vi.fn()}
        onModeChange={vi.fn()}
        onRegression={vi.fn()}
        onRewind={vi.fn()}
        onToggleRunning={vi.fn()}
        onWpmChange={vi.fn()}
        targetWpm={225}
      />,
    )

    expect(screen.getByRole('group', { name: 'Reading mode' })).toBeTruthy()
    expect(screen.queryByText(/Recommended default: guided lines and phrase highlights/i)).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Explain reader modes' }))

    expect(screen.getByText(/Recommended default: guided lines and phrase highlights/i)).toBeTruthy()
    expect(screen.getByText(/Phrase grouping practice/i)).toBeTruthy()
    expect(screen.getByText(/Optional focused drill: less context and less rereading/i)).toBeTruthy()
    expect(screen.getByText(/Baseline: 250 raw WPM, 82% comprehension/i)).toBeTruthy()
    expect(screen.getByText(/do not optimize raw speed alone/i)).toBeTruthy()
  })
})
