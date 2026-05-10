export type TextChunk = {
  id: string
  text: string
  startWord: number
  endWord: number
}

export function chunkText(text: string, chunkSize: number): TextChunk[] {
  const words = text.match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)?|[^\s]/gu) ?? []
  const normalizedSize = Math.max(1, Math.floor(chunkSize))
  const chunks: TextChunk[] = []

  for (let index = 0; index < words.length; index += normalizedSize) {
    const slice = words.slice(index, index + normalizedSize)
    chunks.push({
      id: `chunk_${index}`,
      text: normalizePunctuationSpacing(slice.join(' ')),
      startWord: index,
      endWord: Math.min(index + normalizedSize, words.length),
    })
  }

  return chunks
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
