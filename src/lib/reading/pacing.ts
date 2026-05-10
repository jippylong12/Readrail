export function calculateActualWpm(wordsRead: number, durationSeconds: number): number {
  if (wordsRead <= 0 || durationSeconds <= 0) {
    return 0
  }

  return Math.round(wordsRead / (durationSeconds / 60))
}

export function calculateAdjustedWpm(actualWpm: number, comprehensionScore: number | null): number | null {
  if (comprehensionScore === null) {
    return null
  }

  const normalizedScore = Math.min(100, Math.max(0, comprehensionScore))
  return Math.round(actualWpm * (normalizedScore / 100))
}

export function clampWpm(wpm: number): number {
  return Math.min(900, Math.max(80, Math.round(wpm)))
}

export function roundWpmToNearestFive(wpm: number): number {
  if (wpm <= 0) {
    return 0
  }

  return Math.round(wpm / 5) * 5
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
