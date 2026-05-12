import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import {
  captureGeminiUsage,
  type GeminiUsageAttribution,
  type GeminiUsageRecorder,
} from './geminiUsage'

export type GeminiQuizOption = {
  id: string
  label: string
}

export type GeminiQuizQuestion = {
  id: string
  kind: 'main_idea' | 'detail' | 'sequence_cause' | 'inference'
  prompt: string
  options: GeminiQuizOption[]
  correctOptionId: string
}

export type GeminiQuiz = {
  title: string
  questions: GeminiQuizQuestion[]
}

type NormalizedQuestion = {
  id?: unknown
  kind?: unknown
  prompt?: unknown
  options?: unknown
  correctOptionId?: unknown
  correctOptionIndex?: unknown
}

type RawGeminiQuiz = {
  title?: unknown
  questions?: unknown
}

type GeminiQuizClient = Pick<GoogleGenAI['models'], 'generateContent'>

export type GenerateQuizFromReadingOptions = {
  recordUsage?: GeminiUsageRecorder
  usageAttribution?: GeminiUsageAttribution
  client?: GoogleGenAI | { models: GeminiQuizClient }
}

export const GEMINI_QUIZ_MODEL = 'gemini-3-flash-preview'

function buildQuizResponseJsonSchema(questionCount: number): unknown {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'questions'],
    properties: {
      title: {
        type: 'string',
        description: 'Short title for the quiz.',
      },
      questions: {
        type: 'array',
        minItems: questionCount,
        maxItems: questionCount,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'kind', 'prompt', 'options', 'correctOptionIndex'],
          properties: {
            id: {
              type: 'string',
              description: 'Stable lowercase identifier such as q1.',
            },
            kind: {
              type: 'string',
              enum: ['main_idea', 'detail', 'sequence_cause', 'inference'],
              description: 'The comprehension skill being tested.',
            },
            prompt: {
              type: 'string',
              description: 'Question prompt testing comprehension of meaning, not spelling, word position, or punctuation.',
            },
            options: {
              type: 'array',
              minItems: 4,
              maxItems: 4,
              items: {
                type: 'string',
              },
            },
            correctOptionIndex: {
              type: 'integer',
              minimum: 0,
              maximum: 3,
              description: 'Zero-based index of the correct option.',
            },
          },
        },
      },
    },
  }
}

const QUIZ_PROMPT = [
  'Create a strong comprehension quiz for a completed reading-speed session.',
  'Return only JSON matching the provided response schema.',
  'Each question must have exactly four options.',
  'Questions must test meaning: main idea, important detail, sequence/cause, or inference.',
  'For two-question quizzes, use one main_idea question and one inference or important-detail question.',
  'Every option must be plausible, but exactly one option must be clearly supported by the reading.',
  'Do not explain the answers.',
  'Avoid trick questions and avoid facts not present in the reading.',
  'Never ask about surface text trivia: final word, first word, exact punctuation, sentence count, word count, snippet position, title wording, or whether a word appears.',
  'Never write prompts that refer to "the provided text", "the snippet", "the passage says the word", or other meta descriptions of the text object.',
].join('\n')

const bannedPromptPatterns = [
  /\bfinal word\b/i,
  /\bfirst word\b/i,
  /\blast word\b/i,
  /\bword present\b/i,
  /\bexact word\b/i,
  /\bhow many (words|sentences|paragraphs)\b/i,
  /\bpunctuation\b/i,
  /\bspelled\b/i,
  /\bsnippet\b/i,
  /\bprovided text\b/i,
  /\btext says\b/i,
  /\btitle\b/i,
]

const validQuestionKinds = ['main_idea', 'detail', 'sequence_cause', 'inference'] as const

export function getQuizQuestionCount(wordCount: number): number {
  if (wordCount <= 350) {
    return 2
  }

  if (wordCount <= 900) {
    return 3
  }

  if (wordCount <= 1600) {
    return 4
  }

  return 5
}

export async function generateQuizFromReading(
  apiKey: string,
  title: string,
  content: string,
  wordCount: number,
  options: GenerateQuizFromReadingOptions = {},
): Promise<GeminiQuiz> {
  const ai = options.client ?? new GoogleGenAI({ apiKey })
  const questionCount = getQuizQuestionCount(wordCount)

  return captureGeminiUsage({
    model: GEMINI_QUIZ_MODEL,
    stage: 'generated_quiz',
    attribution: options.usageAttribution,
    recordUsage: options.recordUsage,
    generateContent: () =>
      ai.models.generateContent({
        model: GEMINI_QUIZ_MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${QUIZ_PROMPT}\n\nGenerate exactly ${questionCount} questions.\n\nTitle: ${title}\n\nReading:\n${content.slice(0, 12000)}`,
              },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: buildQuizResponseJsonSchema(questionCount),
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      }),
    consumeResponse: (response) => normalizeGeminiQuiz(JSON.parse(response.text ?? '{}') as RawGeminiQuiz, title, questionCount),
  })
}

export function normalizeGeminiQuiz(raw: RawGeminiQuiz, fallbackTitle: string, expectedQuestionCount?: number): GeminiQuiz {
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : fallbackTitle
  const questions = Array.isArray(raw.questions)
    ? raw.questions.map((question, index) => normalizeQuestion(question as NormalizedQuestion, index))
    : []

  if (questions.length === 0) {
    throw new Error('Gemini did not return any quiz questions.')
  }

  if (expectedQuestionCount !== undefined && questions.length !== expectedQuestionCount) {
    throw new Error(`Gemini returned ${questions.length} questions instead of ${expectedQuestionCount}.`)
  }

  return {
    title,
    questions: questions.slice(0, expectedQuestionCount ?? 5),
  }
}

function normalizeQuestion(question: NormalizedQuestion, index: number): GeminiQuizQuestion {
  const id = normalizeId(question.id, `question-${index + 1}`)
  const kind = normalizeQuestionKind(question.kind)
  const prompt = typeof question.prompt === 'string' && question.prompt.trim() ? question.prompt.trim() : `Question ${index + 1}`
  const options = normalizeOptions(question.options, id)
  const correctOptionId = normalizeCorrectOptionId(question.correctOptionId, question.correctOptionIndex, options)

  validateComprehensionPrompt(prompt)
  validateComprehensionOptions(options, correctOptionId)

  return {
    id,
    kind,
    prompt,
    options,
    correctOptionId,
  }
}

function normalizeQuestionKind(kind: unknown): GeminiQuizQuestion['kind'] {
  if (typeof kind === 'string' && validQuestionKinds.includes(kind as GeminiQuizQuestion['kind'])) {
    return kind as GeminiQuizQuestion['kind']
  }

  throw new Error('Gemini quiz question is missing a valid comprehension kind.')
}

function validateComprehensionPrompt(prompt: string): void {
  if (bannedPromptPatterns.some((pattern) => pattern.test(prompt))) {
    throw new Error('Gemini returned a text-trivia question instead of a comprehension question.')
  }
}

function validateComprehensionOptions(options: GeminiQuizOption[], correctOptionId: string): void {
  const labels = options.map((option) => option.label.trim().toLowerCase())
  const uniqueLabels = new Set(labels)
  if (uniqueLabels.size !== labels.length) {
    throw new Error('Gemini quiz questions must include four distinct options.')
  }

  if (!options.some((option) => option.id === correctOptionId)) {
    throw new Error('Gemini quiz question is missing a matching correct option.')
  }
}

function normalizeOptions(rawOptions: unknown, questionId: string): GeminiQuizOption[] {
  const options = Array.isArray(rawOptions) ? rawOptions : []
  const normalized = options.map((option, index) => {
    if (typeof option === 'string') {
      return {
        id: `${questionId}-option-${index + 1}`,
        label: option,
      }
    }

    const optionRecord = option as Partial<GeminiQuizOption>
    return {
      id: normalizeId(optionRecord.id, `${questionId}-option-${index + 1}`),
      label:
        typeof optionRecord.label === 'string' && optionRecord.label.trim()
          ? optionRecord.label.trim()
          : `Option ${index + 1}`,
    }
  })

  if (normalized.length !== 4) {
    throw new Error('Gemini quiz questions must include exactly four options.')
  }

  return normalized
}

function normalizeCorrectOptionId(
  rawCorrectOptionId: unknown,
  rawCorrectOptionIndex: unknown,
  options: GeminiQuizOption[],
): string {
  if (typeof rawCorrectOptionId === 'string') {
    const matchingOption = options.find((option) => option.id === rawCorrectOptionId.trim())
    if (matchingOption) {
      return matchingOption.id
    }
  }

  const optionIndex = Number(rawCorrectOptionIndex)
  if (Number.isInteger(optionIndex) && optionIndex >= 0 && optionIndex < options.length) {
    return options[optionIndex].id
  }

  throw new Error('Gemini quiz question is missing a valid correct answer.')
}

function normalizeId(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '')
  return normalized || fallback
}
