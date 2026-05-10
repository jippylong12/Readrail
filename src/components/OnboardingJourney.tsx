import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_BASELINE_STORY,
  buildBaselineAssessmentResult,
  getBaselineQuestions,
} from '../lib/reading/baseline'
import { formatDuration } from '../lib/reading/pacing'
import type { BaselineAssessmentResult, BaselineQuestion } from '../types/domain'

type OnboardingStep =
  | 'intro'
  | 'baseline_setup'
  | 'baseline_ready'
  | 'baseline_read'
  | 'baseline_questions'
  | 'baseline_result'
  | 'modes'

type OnboardingJourneyProps = {
  baselineResult: BaselineAssessmentResult | null
  onBaselineComplete: (result: BaselineAssessmentResult) => void
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
    body: 'Readrail recommends a conservative reader default from pace and comprehension together.',
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

export function OnboardingJourney({
  baselineResult,
  onBaselineComplete,
  onComplete,
  onSkip,
}: OnboardingJourneyProps) {
  const [step, setStep] = useState<OnboardingStep>('intro')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [answerError, setAnswerError] = useState('')
  const [latestResult, setLatestResult] = useState<BaselineAssessmentResult | null>(baselineResult)

  const story = DEFAULT_BASELINE_STORY
  const questions = useMemo(() => getBaselineQuestions('default'), [])
  const result = latestResult ?? baselineResult

  useEffect(() => {
    if (step !== 'baseline_read' || !startedAt) {
      return
    }

    const intervalId = window.setInterval(() => {
      setElapsedSeconds(Math.max(1, Math.round((Date.now() - startedAt) / 1000)))
    }, 250)

    return () => window.clearInterval(intervalId)
  }, [startedAt, step])

  function startReading(): void {
    const now = Date.now()
    setStartedAt(now)
    setDurationSeconds(null)
    setElapsedSeconds(1)
    setAnswers({})
    setAnswerError('')
    setLatestResult(null)
    setStep('baseline_read')
  }

  function finishReading(): void {
    const elapsedSeconds = Math.max(1, Math.round((Date.now() - (startedAt ?? Date.now())) / 1000))
    setDurationSeconds(elapsedSeconds)
    setStep('baseline_questions')
  }

  function updateAnswer(questionId: string, optionId: string): void {
    setAnswers((currentAnswers) => ({ ...currentAnswers, [questionId]: optionId }))
    setAnswerError('')
  }

  function scoreAssessment(): void {
    const unansweredQuestion = questions.find((question) => !answers[question.id])

    if (unansweredQuestion) {
      setAnswerError('Answer all five questions before viewing your result.')
      return
    }

    const assessmentResult = buildBaselineAssessmentResult({
      storyTitle: story.title,
      storySource: 'default',
      storyText: story.content,
      durationSeconds: durationSeconds ?? 1,
      answers,
      completedAt: new Date().toISOString(),
    })

    onBaselineComplete(assessmentResult)
    setLatestResult({ ...assessmentResult, appliedWpmAt: new Date().toISOString() })
    setStep('baseline_result')
  }

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
                Readrail works best when pace and comprehension are measured together. This learner journey starts with a
                story assessment, explains the reader modes, and then moves you into the local library.
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
              <button className="primary-button" onClick={() => setStep('baseline_setup')} type="button">
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

        {step === 'baseline_setup' && (
          <>
            <div className="onboarding-copy">
              <span className="eyebrow">Baseline setup</span>
              <h1 id="onboarding-title">Choose the story for your timed read.</h1>
              <p>
                This baseline uses a fixed story with objective questions, so WPM is tied to comprehension instead of
                speed alone.
              </p>
            </div>

            <div className="baseline-choice">
              <div className="baseline-source-grid" aria-label="Story source">
                <article className="story-source-card active">
                  <span className="eyebrow">Baseline story</span>
                  <h2>{story.title}</h2>
                  <p>Objective questions are already paired with this passage.</p>
                </article>
                <article className="story-source-card muted">
                  <span className="eyebrow">Custom story</span>
                  <h2>Question generation needed</h2>
                  <p>
                    A custom baseline needs generated or teacher-written questions. Without that, the result would only
                    measure speed, not comprehension.
                  </p>
                </article>
              </div>

              <article className="baseline-preview">
                <div>
                  <span className="eyebrow">Before you read</span>
                  <h2>{story.title}</h2>
                  <p>
                    The passage stays hidden until the timer starts. The next step explains the timing, then the story
                    opens by itself.
                  </p>
                </div>
              </article>
            </div>

            <div className="onboarding-actions">
              <button className="primary-button" onClick={() => setStep('baseline_ready')} type="button">
                Continue
              </button>
              <button className="secondary-button" onClick={() => setStep('intro')} type="button">
                Back
              </button>
            </div>
          </>
        )}

        {step === 'baseline_ready' && (
          <>
            <div className="onboarding-copy">
              <span className="eyebrow">Timed baseline</span>
              <h1 id="onboarding-title">Begin when you are ready to read.</h1>
              <p>
                The timer starts after you press Begin. Read the full story at a normal comprehension pace, then answer
                five questions without rereading.
              </p>
            </div>

            <div className="baseline-ready-card">
              <span className="eyebrow">Next passage</span>
              <h2>{story.title}</h2>
              <p>Story first, questions second. Your starting WPM will be based on both time and comprehension.</p>
            </div>

            <div className="onboarding-actions">
              <button className="primary-button" onClick={startReading} type="button">
                Begin
              </button>
              <button className="secondary-button" onClick={() => setStep('baseline_setup')} type="button">
                Back
              </button>
            </div>
          </>
        )}

        {step === 'baseline_read' && (
          <>
            <div className="assessment-timer-bar">
              <h1 id="onboarding-title">{story.title}</h1>
              <span aria-live="polite">{formatDuration(elapsedSeconds)}</span>
            </div>

            <article className="assessment-reading-surface">{story.content}</article>

            <div className="onboarding-actions">
              <button className="primary-button" onClick={finishReading} type="button">
                I finished reading
              </button>
              <button className="secondary-button" onClick={() => setStep('baseline_setup')} type="button">
                Restart setup
              </button>
            </div>
          </>
        )}

        {step === 'baseline_questions' && (
          <>
            <div className="onboarding-copy">
              <span className="eyebrow">Comprehension check</span>
              <h1 id="onboarding-title">Answer five questions before seeing your WPM.</h1>
              <p>
                Your reading time was {formatDuration(durationSeconds ?? 0)}. Choose the best answer without rereading so
                the baseline reflects this session.
              </p>
            </div>

            <div className="question-list">
              {questions.map((question, index) => (
                <QuestionBlock
                  answer={answers[question.id] ?? ''}
                  index={index}
                  key={question.id}
                  onAnswer={updateAnswer}
                  question={question}
                />
              ))}
            </div>

            {answerError && <span className="error-text">{answerError}</span>}

            <div className="onboarding-actions">
              <button className="primary-button" onClick={scoreAssessment} type="button">
                View baseline result
              </button>
              <button className="secondary-button" onClick={() => setStep('baseline_read')} type="button">
                Back to story
              </button>
            </div>
          </>
        )}

        {step === 'baseline_result' && result && (
          <>
            <div className="onboarding-copy">
              <span className="eyebrow">Baseline result</span>
              <h1 id="onboarding-title">Start at {result.recommendedWpm} WPM.</h1>
              <p>{result.explanation}</p>
            </div>

            <div className="summary-grid">
              <Metric label="Raw WPM" value={result.rawWpm} />
              <Metric label="Comprehension" value={`${result.comprehensionPercent}%`} />
              <Metric label="Adjusted WPM" value={result.adjustedWpm} />
              <Metric label="Recommended" value={`${result.recommendedWpm} WPM`} />
            </div>

            <div className="onboarding-actions">
              <button className="secondary-button" onClick={onComplete} type="button">
                Continue to Readrail
              </button>
              <button className="ghost-button" onClick={() => setStep('modes')} type="button">
                Review reader modes
              </button>
            </div>

            <p className="settings-note">This recommendation has been applied to your reader defaults.</p>
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
              <button className="primary-button" onClick={() => setStep('baseline_setup')} type="button">
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

function QuestionBlock({
  answer,
  index,
  onAnswer,
  question,
}: {
  answer: string
  index: number
  onAnswer: (questionId: string, optionId: string) => void
  question: BaselineQuestion
}) {
  return (
    <article className="question-card" role="group" aria-labelledby={`${question.id}-title`}>
      <h2 className="question-title" id={`${question.id}-title`}>
        {index + 1}. {question.prompt}
      </h2>
      <div className="answer-list" role="radiogroup" aria-labelledby={`${question.id}-title`}>
        {question.options.map((option) => (
          <label className="answer-option" key={option.id}>
            <input
              checked={answer === option.id}
              name={question.id}
              onChange={() => onAnswer(question.id, option.id)}
              type="radio"
            />
            {option.label}
          </label>
        ))}
      </div>
    </article>
  )
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
