export type TextChunk = {
  id: string
  text: string
  startWord: number
  endWord: number
  startsNewParagraph?: boolean
}

const WORD_TOKEN_PATTERN = /[\p{L}\p{N}]+(?:[-'\u2019][\p{L}\p{N}]+)*/gu

export function chunkText(text: string, chunkSize: number): TextChunk[] {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0)
  const normalizedSize = Math.max(1, Math.floor(chunkSize))
  const chunks: TextChunk[] = []
  let globalWordIndex = 0

  for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex++) {
    const words = tokenizeReadableWords(paragraphs[paragraphIndex])
    let isFirstChunkInParagraph = true

    for (let index = 0; index < words.length; index += normalizedSize) {
      const slice = words.slice(index, index + normalizedSize)
      chunks.push({
        id: `chunk_${globalWordIndex}`,
        text: normalizePunctuationSpacing(slice.join(' ')),
        startWord: globalWordIndex,
        endWord: globalWordIndex + slice.length,
        startsNewParagraph: isFirstChunkInParagraph && paragraphIndex > 0,
      })
      globalWordIndex += slice.length
      isFirstChunkInParagraph = false
    }
  }

  return chunks
}

export function tokenizeReadableWords(text: string): string[] {
  const words: string[] = []
  let previousWordEnd = 0

  for (const match of text.matchAll(WORD_TOKEN_PATTERN)) {
    const word = match[0]
    const wordStart = match.index ?? 0
    const betweenWords = text.slice(previousWordEnd, wordStart)
    let { leadingPunctuation, trailingPunctuation } = splitInterWordPunctuation(betweenWords)

    if (words.length === 0 && trailingPunctuation) {
      leadingPunctuation = trailingPunctuation
      trailingPunctuation = ''
    }

    if (trailingPunctuation && words.length > 0) {
      words[words.length - 1] = `${words[words.length - 1]}${trailingPunctuation}`
    }

    words.push(`${leadingPunctuation}${word}`)
    previousWordEnd = wordStart + word.length
  }

  const trailingPunctuation = text.slice(previousWordEnd).trim()
  if (trailingPunctuation && words.length > 0) {
    words[words.length - 1] = `${words[words.length - 1]}${trailingPunctuation}`
  }

  return words
}

export function getChunkDurationMs(chunkWordCount: number, targetWpm: number): number {
  if (targetWpm <= 0) {
    return 1000
  }

  return Math.max(280, Math.round((chunkWordCount / targetWpm) * 60_000))
}

function normalizePunctuationSpacing(value: string): string {
  return value
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([(])\s+/g, '$1')
    .replace(/\s+([)])+/g, '$1')
}

function splitInterWordPunctuation(value: string): { leadingPunctuation: string; trailingPunctuation: string } {
  if (value.trim().length === 0) {
    return { leadingPunctuation: '', trailingPunctuation: '' }
  }

  const firstWhitespaceIndex = value.search(/\s/u)
  if (firstWhitespaceIndex === -1) {
    return { leadingPunctuation: '', trailingPunctuation: value.trim() }
  }

  return {
    leadingPunctuation: value.slice(firstWhitespaceIndex).trim(),
    trailingPunctuation: value.slice(0, firstWhitespaceIndex).trim(),
  }
}
