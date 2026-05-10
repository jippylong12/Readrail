import type { BaselineAssessmentResult, BaselineQuestion, BaselineQuestionOption, BaselineStorySource } from '../../types/domain'
import { countWords } from '../text/wordCount'
import { calculateActualWpm, calculateAdjustedWpm, clampWpm, roundWpmToNearestFive } from './pacing'

export const DEFAULT_BASELINE_STORY = {
  title: 'Mara and the Lantern Map',
  source: 'default' as const,
  content: `Mara worked in the town archive, a quiet room above the bakery where old maps slept in flat wooden drawers. On rainy afternoons, she repaired torn corners and copied faded labels so travelers could still find the mountain roads.

One evening, a delivery runner brought in a cracked brass lantern with a note tied to its handle. The note said the lantern belonged with the oldest map in the archive. Mara found the map at the bottom of a drawer, but it showed only blank paper until she lit the lantern.

Warm lines appeared across the page. They did not mark roads. They marked sounds: the bell at the river bridge, the mill wheel near the east field, and the gulls that circled the harbor at dawn. Mara realized the map was made for fog, when landmarks disappeared and sound became the safest guide.

The next morning, thick fog rolled in before the ferry returned. The harbor crew could hear the boat but could not see the channel. Mara carried the lantern map to the pier and called out each sound marker in order. The ferry followed the bell, then the mill wheel, then the gulls, and reached the dock without scraping the rocks.

Afterward, Mara copied the map onto fresh paper. She wrote a new label in careful ink: "Use when the town cannot be seen, but can still be heard."`,
}

export const DEFAULT_BASELINE_QUESTIONS: BaselineQuestion[] = [
  {
    id: 'main-idea',
    kind: 'main_idea',
    prompt: 'What is the main idea of the story?',
    options: [
      option('archive-practice', 'Mara learns that careful archive work can help solve a real town problem.', 1),
      option('sound-map', 'The old map matters because it can guide people by sound when sight is unreliable.', 0.65),
      option('careful-copy', 'Mara preserves knowledge by copying old records before they fade.', 0.45),
      option('bakery', 'The bakery becomes the most important building in town.', 0.1),
      option('ferry-sale', 'The harbor crew decides to sell the ferry after a foggy morning.', 0),
    ],
  },
  {
    id: 'detail-recall',
    kind: 'detail',
    prompt: 'Which object made the old map reveal its markings?',
    options: [
      option('brass-lantern', 'A cracked brass lantern.', 1),
      option('lantern-note', 'The note tied to the lantern, once Mara matched it with the old map.', 0.65),
      option('oldest-map', 'The oldest map in the archive after Mara pulled it from the drawer.', 0.45),
      option('fresh-paper', 'A sheet of fresh paper.', 0),
      option('wooden-drawer', 'A flat wooden drawer.', 0.1),
    ],
  },
  {
    id: 'sequence-cause',
    kind: 'sequence_cause',
    prompt: 'Why did Mara bring the lantern map to the pier?',
    options: [
      option('fog-channel', 'Fog hid the channel, and the map could guide the ferry by sound.', 1),
      option('heard-boat', 'The harbor crew could hear the ferry but needed help locating the safe path.', 0.65),
      option('test-map', 'Mara wanted to test whether the sound markers matched the town.', 0.45),
      option('meet-runner', 'The delivery runner asked her to return the lantern.', 0),
      option('repair-map', 'The map needed to be repaired before it could be stored.', 0.1),
    ],
  },
  {
    id: 'inference',
    kind: 'inference',
    prompt: 'What can you infer about the person who created the old map?',
    options: [
      option('knew-fog', 'They understood the town well enough to navigate when fog covered landmarks.', 1),
      option('valued-sound', 'They knew sound could be a reliable guide when roads and buildings were hidden.', 0.65),
      option('helped-travelers', 'They probably wanted travelers to have another way to move safely through town.', 0.45),
      option('hid-treasure', 'They were hiding treasure in the archive.', 0),
      option('disliked-harbor', 'They wanted travelers to avoid the harbor completely.', 0.1),
    ],
  },
  {
    id: 'confidence',
    kind: 'confidence',
    prompt: 'How confident are you in your answers without rereading?',
    options: [
      option('confident-evidence', 'Confident: I can explain my answers with specific story evidence.', 1),
      option('confident-general', 'Mostly confident: I know the story shape but may miss one detail.', 0.75),
      option('mixed', 'Mixed: I remember the main idea but guessed on some details.', 0.5),
      option('low', 'Low: I recognized a few facts but would need to reread before increasing pace.', 0.25),
      option('lost', 'Not confident: I could not explain the story without rereading.', 0),
    ],
  },
]

export function getBaselineQuestions(source: BaselineStorySource): BaselineQuestion[] {
  return source === 'default' ? DEFAULT_BASELINE_QUESTIONS : []
}

export function scoreBaselineAnswers(
  questions: BaselineQuestion[],
  answers: Record<string, string>,
): Pick<BaselineAssessmentResult, 'comprehensionPercent' | 'questionResults'> {
  const questionResults = questions.map((question) => {
    const selectedOptionId = answers[question.id] ?? ''
    const selectedOption = question.options.find((currentOption) => currentOption.id === selectedOptionId)

    return {
      questionId: question.id,
      selectedOptionId,
      score: selectedOption?.score ?? 0,
      maxScore: 1,
    }
  })
  const earned = questionResults.reduce((total, result) => total + result.score, 0)
  const possible = questionResults.reduce((total, result) => total + result.maxScore, 0)

  return {
    comprehensionPercent: possible > 0 ? Math.round((earned / possible) * 100) : 0,
    questionResults,
  }
}

export function recommendBaselineStartingWpm(rawWpm: number, comprehensionPercent: number): number {
  if (rawWpm <= 0) {
    return 0
  }

  let recommendedWpm: number

  if (comprehensionPercent < 60) {
    recommendedWpm = rawWpm * Math.max(0.4, comprehensionPercent / 100) * 0.9
  } else if (comprehensionPercent < 75) {
    recommendedWpm = rawWpm * (comprehensionPercent / 100)
  } else if (comprehensionPercent < 90) {
    recommendedWpm = rawWpm * 0.9
  } else {
    const strongComprehensionFactor = Math.min(1, 0.95 + (comprehensionPercent - 90) / 200)
    recommendedWpm = rawWpm * strongComprehensionFactor
  }

  return roundWpmToNearestFive(clampWpm(recommendedWpm))
}

export function explainBaselineRecommendation(rawWpm: number, comprehensionPercent: number, recommendedWpm: number): string {
  if (rawWpm <= 0) {
    return 'Readrail needs a timed reading result before recommending a pace.'
  }

  if (rawWpm > 900) {
    return `Your raw pace was ${rawWpm} WPM. Readrail caps reader defaults at 900 WPM, so start at ${recommendedWpm} WPM and retake the baseline during a normal reading pass if this result came from a quick test.`
  }

  if (comprehensionPercent < 60) {
    return `Your raw pace was ${rawWpm} WPM, but comprehension was still developing. Start at ${recommendedWpm} WPM and focus on recall before increasing speed.`
  }

  if (comprehensionPercent < 75) {
    return `Your raw pace was ${rawWpm} WPM with partial comprehension. Starting at ${recommendedWpm} WPM gives you room to stabilize accuracy.`
  }

  if (comprehensionPercent < 90) {
    return `Your raw pace was ${rawWpm} WPM with steady comprehension. ${recommendedWpm} WPM keeps practice close to your pace while protecting comprehension.`
  }

  return `Your raw pace was ${rawWpm} WPM with strong comprehension. ${recommendedWpm} WPM is close to that pace, so practice can begin without a large jump.`
}

export function buildBaselineAssessmentResult(input: {
  storyTitle: string
  storySource: BaselineStorySource
  storyText: string
  durationSeconds: number
  answers: Record<string, string>
  completedAt: string
}): BaselineAssessmentResult {
  const wordCount = countWords(input.storyText)
  const rawWpm = calculateActualWpm(wordCount, input.durationSeconds)
  const questions = getBaselineQuestions(input.storySource)
  const scoring = scoreBaselineAnswers(questions, input.answers)
  const adjustedWpm = calculateAdjustedWpm(rawWpm, scoring.comprehensionPercent) ?? 0
  const recommendedWpm = recommendBaselineStartingWpm(rawWpm, scoring.comprehensionPercent)

  return {
    id: crypto.randomUUID(),
    storyTitle: input.storyTitle,
    storySource: input.storySource,
    wordCount,
    durationSeconds: input.durationSeconds,
    rawWpm,
    comprehensionPercent: scoring.comprehensionPercent,
    adjustedWpm,
    recommendedWpm,
    explanation: explainBaselineRecommendation(rawWpm, scoring.comprehensionPercent, recommendedWpm),
    questionResults: scoring.questionResults,
    completedAt: input.completedAt,
    appliedWpmAt: null,
  }
}

function option(id: string, label: string, score: number): BaselineQuestionOption {
  return { id, label, score }
}
