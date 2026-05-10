import { useState } from 'react'

type OnboardingStep = 'intro' | 'baseline' | 'modes'

type OnboardingJourneyProps = {
  onComplete: () => void
  onSkip: () => void
}

const journeySteps = [
  {
    title: 'Read a short story',
    body: 'The baseline starts with a compact reading passage so pace is measured from a real task.',
  },
  {
    title: 'Answer five questions',
    body: 'Comprehension stays part of the result instead of treating raw speed as the goal.',
  },
  {
    title: 'Choose a starting pace',
    body: 'Readrail will recommend a conservative reader default after the assessment is available.',
  },
]

const modeSummaries = [
  {
    title: 'Rail',
    body: 'Guides attention line by line while the surrounding text remains visible.',
  },
  {
    title: 'Chunk',
    body: 'Highlights short phrase groups for deliberate pacing practice.',
  },
  {
    title: 'RSVP drill',
    body: 'Shows focused word groups one at a time as an optional drill, not the default measure of progress.',
  },
]

export function OnboardingJourney({ onComplete, onSkip }: OnboardingJourneyProps) {
  const [step, setStep] = useState<OnboardingStep>('intro')

  return (
    <main className="onboarding-shell">
      <section className="onboarding-panel" aria-labelledby="onboarding-title">
        <div className="onboarding-brand">
          <div className="brand-mark">R</div>
          <div>
            <strong>Readrail</strong>
            <span>Evidence-aware reading practice</span>
          </div>
        </div>

        {step === 'intro' && (
          <>
            <div className="onboarding-copy">
              <span className="eyebrow">First run</span>
              <h1 id="onboarding-title">Start with a baseline before the full app.</h1>
              <p>
                Readrail works best when pace and comprehension are measured together. This learner journey will prepare
                the story assessment, explain the reader modes, and then move you into the local library.
              </p>
            </div>

            <div className="journey-list" aria-label="Baseline path">
              {journeySteps.map((item, index) => (
                <article className="journey-item" key={item.title}>
                  <span>{index + 1}</span>
                  <div>
                    <h2>{item.title}</h2>
                    <p>{item.body}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className="onboarding-actions">
              <button className="primary-button" onClick={() => setStep('baseline')} type="button">
                Start baseline
              </button>
              <button className="secondary-button" onClick={onSkip} type="button">
                Skip for now
              </button>
              <button className="ghost-button" onClick={() => setStep('modes')} type="button">
                Learn how Readrail works
              </button>
            </div>
          </>
        )}

        {step === 'baseline' && (
          <>
            <div className="onboarding-copy">
              <span className="eyebrow">Baseline setup</span>
              <h1 id="onboarding-title">The story assessment is next.</h1>
              <p>
                The assessment will add a short story, five comprehension questions, and a measured WPM recommendation.
                For now, this shell records that you have seen the setup and lets you continue into Readrail.
              </p>
            </div>

            <div className="baseline-preview">
              <div>
                <span className="eyebrow">Coming next</span>
                <h2>Story, questions, and recommendation</h2>
                <p>
                  The next implementation step will time reading, score five deterministic answers, and recommend a
                  starting pace that respects comprehension.
                </p>
              </div>
            </div>

            <div className="onboarding-actions">
              <button className="primary-button" onClick={onComplete} type="button">
                Continue to Readrail
              </button>
              <button className="secondary-button" onClick={() => setStep('intro')} type="button">
                Back
              </button>
            </div>
          </>
        )}

        {step === 'modes' && (
          <>
            <div className="onboarding-copy">
              <span className="eyebrow">Reader modes</span>
              <h1 id="onboarding-title">Pick the practice view that fits the session.</h1>
              <p>
                Each mode is a pacing tool. Progress should be judged with comprehension, notes, and repeated sessions,
                not by raw WPM alone.
              </p>
            </div>

            <div className="mode-grid">
              {modeSummaries.map((mode) => (
                <article className="mode-card" key={mode.title}>
                  <h2>{mode.title}</h2>
                  <p>{mode.body}</p>
                </article>
              ))}
            </div>

            <div className="onboarding-actions">
              <button className="primary-button" onClick={() => setStep('baseline')} type="button">
                Start baseline
              </button>
              <button className="secondary-button" onClick={() => setStep('intro')} type="button">
                Back
              </button>
              <button className="ghost-button" onClick={onSkip} type="button">
                Skip for now
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
