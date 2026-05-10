const WORD_PATTERN = /[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu

export function countWords(text: string): number {
  return text.match(WORD_PATTERN)?.length ?? 0
}

export function estimatePages(wordCount: number, wordsPerPage = 275): number {
  if (wordCount === 0) {
    return 0
  }

  return Math.round((wordCount / wordsPerPage) * 10) / 10
}

export function estimateReadingMinutes(wordCount: number, wpm: number): number {
  if (wordCount === 0 || wpm <= 0) {
    return 0
  }

  return Math.max(1, Math.ceil(wordCount / wpm))
}
