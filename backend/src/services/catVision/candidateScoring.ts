import { resolveModelKey } from '../../lib/catModels.js'
import { distanceMeters } from '../../lib/geo.js'
import { NEUTRAL_SCORE, computeFinalScore, locationScore, recentSeenScore } from '../../lib/scoring.js'
import type { CatRow, CatSightingRow } from '../../db/types.js'
import type { CatVisionCandidate, CatVisionInput } from './types.js'

// Compare the query's coat archetype to the candidate cat's. Neutral when either
// side is unknown or generic, so it never penalizes cats we can't color-classify.
const colorPatternScore = (queryArchetype: string | null, cat: CatRow): number => {
  if (!queryArchetype || queryArchetype === 'default') return NEUTRAL_SCORE
  const catArchetype = resolveModelKey({ model_key: cat.model_key, pattern: cat.pattern })
  if (catArchetype === 'default') return NEUTRAL_SCORE
  return queryArchetype === catArchetype ? 1.0 : 0.2
}

/**
 * Combine visual similarity with location, recency and pattern signals for one
 * candidate cat. Location/recency prefer the cat's most recent sighting and fall
 * back to its default placement when it has never been sighted (reference-only cats).
 */
export const buildCandidate = (
  cat: CatRow,
  imageSimilarityScore: number,
  input: CatVisionInput,
  latestSighting: CatSightingRow | undefined,
  now: Date = new Date(),
  queryColorArchetype: string | null = null,
): CatVisionCandidate => {
  const refLat = latestSighting ? Number(latestSighting.latitude) : cat.default_latitude == null ? null : Number(cat.default_latitude)
  const refLng = latestSighting ? Number(latestSighting.longitude) : cat.default_longitude == null ? null : Number(cat.default_longitude)
  const distance =
    refLat == null || refLng == null
      ? null
      : distanceMeters({ latitude: input.latitude, longitude: input.longitude }, { latitude: refLat, longitude: refLng })

  const lastSeenAt = latestSighting?.seen_at ?? cat.last_seen_at ?? null
  const locationScoreValue = locationScore(distance)
  const recentSeenScoreValue = recentSeenScore(lastSeenAt, now)
  const patternScoreValue = colorPatternScore(queryColorArchetype, cat)

  const finalScore = computeFinalScore({
    imageSimilarityScore,
    locationScore: locationScoreValue,
    recentSeenScore: recentSeenScoreValue,
    patternScore: patternScoreValue,
  })

  return {
    cat,
    imageSimilarityScore: Number(imageSimilarityScore.toFixed(4)),
    locationScore: locationScoreValue,
    recentSeenScore: recentSeenScoreValue,
    patternScore: patternScoreValue,
    finalScore,
    distanceMeters: distance == null ? null : Number(distance.toFixed(2)),
    lastSeenAt: lastSeenAt == null ? null : new Date(lastSeenAt).toISOString(),
  }
}
