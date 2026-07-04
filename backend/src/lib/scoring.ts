import { locationScore } from './geo.js'

// Final identification score is a convex combination of four signals, so it stays in [0, 1].
export const SCORE_WEIGHTS = {
  image: 0.65,
  location: 0.2,
  recentSeen: 0.1,
  pattern: 0.05,
} as const

export const NEUTRAL_SCORE = 0.5

/** More recent sightings nudge the score up; unknown recency is neutral. */
export const recentSeenScore = (lastSeenAt: Date | string | null, now: Date = new Date()): number => {
  if (!lastSeenAt) return NEUTRAL_SCORE
  const seen = lastSeenAt instanceof Date ? lastSeenAt : new Date(lastSeenAt)
  if (Number.isNaN(seen.getTime())) return NEUTRAL_SCORE

  const hours = (now.getTime() - seen.getTime()) / 3_600_000
  if (hours <= 1) return 1.0
  if (hours <= 6) return 0.85
  if (hours <= 24) return 0.7
  if (hours <= 72) return 0.5
  if (hours <= 168) return 0.3
  return 0.2
}

/**
 * Pattern agreement. Without a pattern classifier or user input the predicted
 * pattern is null, so this stays neutral and does not affect ranking yet.
 */
export const patternScore = (predictedPattern: string | null, catPattern: string | null): number => {
  if (!predictedPattern || !catPattern) return NEUTRAL_SCORE
  return predictedPattern === catPattern ? 1.0 : 0.2
}

export interface ScoreParts {
  imageSimilarityScore: number
  locationScore: number
  recentSeenScore: number
  patternScore: number
}

export const computeFinalScore = (parts: ScoreParts): number =>
  Number(
    (
      parts.imageSimilarityScore * SCORE_WEIGHTS.image +
      parts.locationScore * SCORE_WEIGHTS.location +
      parts.recentSeenScore * SCORE_WEIGHTS.recentSeen +
      parts.patternScore * SCORE_WEIGHTS.pattern
    ).toFixed(4),
  )

export { locationScore }
