export function comprehensionBand(score: number | null): 'none' | 'review' | 'steady' | 'strong' {
  if (score === null) {
    return 'none'
  }

  if (score < 70) {
    return 'review'
  }

  if (score < 85) {
    return 'steady'
  }

  return 'strong'
}

export function recommendedNextWpm(currentWpm: number, comprehensionScore: number | null): number {
  if (comprehensionScore === null) {
    return currentWpm
  }

  if (comprehensionScore < 70) {
    return Math.max(80, currentWpm - 25)
  }

  if (comprehensionScore >= 90) {
    return Math.min(900, currentWpm + 15)
  }

  return currentWpm
}
