import { GoogleGenAI } from '@google/genai'

export type OcrResult = {
  titleGuess: string | null
  pages: Array<{
    pageNumber: number
    text: string
    uncertainSpans: string[]
  }>
  warnings: string[]
}

export async function runGeminiOcrFromFiles(apiKey: string, files: File[]): Promise<OcrResult> {
  const ai = new GoogleGenAI({ apiKey })
  const fileParts = await Promise.all(files.map(fileToInlinePart))

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              'Perform faithful OCR only. Preserve headings, paragraph breaks, lists, page breaks, and reading order. ' +
              'Mark uncertain words with [?word]. Return strict JSON with titleGuess, pages, and warnings. Do not summarize or add missing content.',
          },
          ...fileParts,
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 256 },
    },
  })

  const text = response.text ?? '{}'
  return normalizeOcrResult(JSON.parse(text) as Partial<OcrResult>)
}

export function normalizeOcrResult(result: Partial<OcrResult>): OcrResult {
  return {
    titleGuess: result.titleGuess ?? null,
    pages: Array.isArray(result.pages)
      ? result.pages.map((page, index) => ({
          pageNumber: Number(page.pageNumber ?? index + 1),
          text: String(page.text ?? ''),
          uncertainSpans: Array.isArray(page.uncertainSpans) ? page.uncertainSpans.map(String) : [],
        }))
      : [],
    warnings: Array.isArray(result.warnings) ? result.warnings.map(String) : [],
  }
}

async function fileToInlinePart(file: File) {
  const data = await fileToBase64(file)
  return {
    inlineData: {
      mimeType: file.type || 'application/octet-stream',
      data,
    },
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const value = String(reader.result)
      resolve(value.slice(value.indexOf(',') + 1))
    }
    reader.readAsDataURL(file)
  })
}
