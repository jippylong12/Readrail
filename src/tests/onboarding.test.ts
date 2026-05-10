import { beforeEach, describe, expect, it } from 'vitest'
import { defaultOnboardingState, useAppStore } from '../app/store'

describe('onboarding state', () => {
  beforeEach(() => {
    useAppStore.setState({
      documents: [],
      sessions: [],
      activeDocumentId: null,
      onboarding: defaultOnboardingState,
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
})
