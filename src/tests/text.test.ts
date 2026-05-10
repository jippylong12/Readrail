import { describe, expect, it } from 'vitest'
import { cleanReadingText } from '../lib/text/cleanup'
import { chunkText, getChunkDurationMs, tokenizeReadableWords } from '../lib/text/chunking'
import { countWords, estimatePages, estimateReadingMinutes } from '../lib/text/wordCount'

describe('text processing', () => {
  it('repairs broken hyphenation and merges soft line breaks', () => {
    const input = 'This para-\ngraph should be joined\nwithout losing meaning.\n\nNext paragraph.'

    expect(cleanReadingText(input)).toBe('This paragraph should be joined without losing meaning.\n\nNext paragraph.')
  })

  it('preserves page breaks when requested', () => {
    expect(cleanReadingText('Page one\fPage two', { preservePageBreaks: true })).toContain('--- Page Break ---')
  })

  it('counts words with apostrophes and hyphenated terms', () => {
    expect(countWords("Reader's evidence-aware practice works.")).toBe(4)
    expect(countWords('Mara\u2019s evidence-aware practice works.')).toBe(4)
  })

  it('estimates pages and duration', () => {
    expect(estimatePages(550)).toBe(2)
    expect(estimateReadingMinutes(500, 250)).toBe(2)
  })

  it('chunks text and computes pace duration', () => {
    const chunks = chunkText('One two three four five six.', 3)

    expect(chunks).toHaveLength(2)
    expect(chunks[0].text).toBe('One two three')
    expect(getChunkDurationMs(3, 300)).toBe(600)
  })

  it('keeps contractions as single readable words', () => {
    expect(tokenizeReadableWords("It's fine. Don't split can't, I'm sure you're ready; we'll go.")).toEqual([
      "It's",
      'fine.',
      "Don't",
      'split',
      "can't,",
      "I'm",
      'sure',
      "you're",
      'ready;',
      "we'll",
      'go.',
    ])
  })

  it('keeps possessives, quotes, and punctuation attached to words', () => {
    expect(tokenizeReadableWords(`Mara's note said, "Don't stop."`)).toEqual([
      "Mara's",
      'note',
      'said,',
      '"Don\'t',
      'stop."',
    ])
  })

  it('does not create standalone punctuation chunks', () => {
    const chunks = chunkText(`Wait... "I'm ready," Mara said.`, 1)

    expect(chunks.map((chunk) => chunk.text)).toEqual(['Wait...', '"I\'m', 'ready,"', 'Mara', 'said.'])
    expect(chunks.every((chunk) => /[\p{L}\p{N}]/u.test(chunk.text))).toBe(true)
  })
})
