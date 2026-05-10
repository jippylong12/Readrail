import { beforeEach, describe, expect, it } from 'vitest'
import { defaultOnboardingState, defaultTourProgressState, useAppStore } from '../app/store'

describe('onboarding state', () => {
  beforeEach(() => {
    useAppStore.setState({
      documents: [],
      sessions: [],
      activeDocumentId: null,
      onboarding: defaultOnboardingState,
      tourProgress: defaultTourProgressState,
      baselineResult: null,
    })
  })

  it('defaults to the first-run learner journey', () => {
    expect(useAppStore.getState().onboarding).toEqual(defaultOnboardingState)
  })

  it('stores skipped onboarding state locally', () => {
    useAppStore.getState().skipOnboarding()

    const onboarding = useAppStore.getState().onboarding
    expect(onboarding.status).toBe('skipped')
    expect(onboarding.introCompletedAt).toBeNull()
    expect(Date.parse(onboarding.skippedAt ?? '')).not.toBeNaN()
  })

  it('stores completed intro state and can reopen the journey', () => {
    useAppStore.getState().completeOnboardingIntro()

    const completed = useAppStore.getState().onboarding
    expect(completed.status).toBe('intro_completed')
    expect(completed.skippedAt).toBeNull()
    expect(Date.parse(completed.introCompletedAt ?? '')).not.toBeNaN()

    useAppStore.getState().reopenOnboarding()

    expect(useAppStore.getState().onboarding).toEqual(defaultOnboardingState)
  })

  it('stores baseline result and automatically applies recommended WPM', () => {
    useAppStore.getState().saveBaselineResult({
      id: 'baseline-1',
      storyTitle: 'Test story',
      storySource: 'default',
      wordCount: 250,
      durationSeconds: 60,
      rawWpm: 250,
      comprehensionPercent: 80,
      adjustedWpm: 200,
      recommendedWpm: 225,
      explanation: 'Test explanation.',
      questionResults: [],
      completedAt: new Date().toISOString(),
      appliedWpmAt: null,
    })

    const state = useAppStore.getState()
    expect(state.baselineResult?.recommendedWpm).toBe(225)
    expect(state.baselineResult?.appliedWpmAt).not.toBeNull()
    expect(state.settings.reader.defaultWpm).toBe(225)
  })

  it('stores completed walkthrough tours locally and can replay them', () => {
    useAppStore.getState().completeTour('library')
    useAppStore.getState().completeTour('library')

    expect(useAppStore.getState().tourProgress.completedTourIds).toEqual(['library'])

    useAppStore.getState().resetTour('library')

    expect(useAppStore.getState().tourProgress.completedTourIds).toEqual([])
  })

  it('can reset all completed walkthrough tours', () => {
    useAppStore.getState().completeTour('library')
    useAppStore.getState().completeTour('reader')
    useAppStore.getState().resetAllTours()

    expect(useAppStore.getState().tourProgress).toEqual(defaultTourProgressState)
  })
})
