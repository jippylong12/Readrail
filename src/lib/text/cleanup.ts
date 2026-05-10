export type CleanupOptions = {
  preservePageBreaks?: boolean
}

export function cleanReadingText(input: string, options: CleanupOptions = {}): string {
  const pageBreakToken = '[[READRAIL_PAGE_BREAK]]'
  const withPageTokens = input
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, options.preservePageBreaks ? `\n${pageBreakToken}\n` : '\n')

  const lines = withPageTokens
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())

  const paragraphs: string[] = []
  let current = ''

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (!line) {
      pushParagraph(paragraphs, current)
      current = ''
      continue
    }

    if (line === pageBreakToken) {
      pushParagraph(paragraphs, current)
      current = ''
      if (options.preservePageBreaks) {
        paragraphs.push('--- Page Break ---')
      }
      continue
    }

    if (!current) {
      current = line
      continue
    }

    if (current.endsWith('-') && /^[a-z]/.test(line)) {
      current = `${current.slice(0, -1)}${line}`
      continue
    }

    const shouldMerge = !/[.!?:;"”)]$/.test(current) && /^[a-z(]/.test(line)
    current = shouldMerge ? `${current} ${line}` : `${current}\n${line}`
  }

  pushParagraph(paragraphs, current)

  return paragraphs
    .join('\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function pushParagraph(paragraphs: string[], value: string): void {
  const trimmed = value.trim()
  if (trimmed) {
    paragraphs.push(trimmed)
  }
}
