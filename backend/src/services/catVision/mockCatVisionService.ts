import { findActiveCats } from '../../db/repositories.js'
import { locationScore } from '../../lib/geo.js'
import type { CatVisionCandidate, CatVisionInput, CatVisionResult, CatVisionService } from './types.js'

const IMAGE_MATCH_THRESHOLD = 0.6
const AUTO_MATCH_THRESHOLD = 0.8
const SCORE_GAP_THRESHOLD = 0.07
const IMAGE_WEIGHT = 0.75
const LOCATION_WEIGHT = 0.25

export class MockCatVisionService implements CatVisionService {
  async analyze(input: CatVisionInput): Promise<CatVisionResult> {
    if (input.isCatOverride === false) {
      return {
        status: 'rejected',
        isCat: false,
        catDetectionConfidence: 0.05,
        matchedCat: null,
        candidates: [],
        bestScore: null,
      }
    }

    const candidates = await this.scoreCandidates(input)
    const best = candidates[0]
    const second = candidates[1]

    if (!best || best.imageSimilarityScore < IMAGE_MATCH_THRESHOLD) {
      return {
        status: 'new_cat_candidate',
        isCat: true,
        catDetectionConfidence: 0.94,
        matchedCat: null,
        candidates: [],
        bestScore: best?.finalScore ?? null,
      }
    }

    const shouldAutoMatch =
      !input.forceConfirmation &&
      best.finalScore >= AUTO_MATCH_THRESHOLD &&
      (!second || best.finalScore - second.finalScore >= SCORE_GAP_THRESHOLD)

    if (shouldAutoMatch) {
      return {
        status: 'matched',
        isCat: true,
        catDetectionConfidence: 0.94,
        matchedCat: best.cat,
        candidates: candidates.slice(0, 3),
        bestScore: best.finalScore,
      }
    }

    return {
      status: 'needs_user_confirmation',
      isCat: true,
      catDetectionConfidence: 0.94,
      matchedCat: null,
      candidates: candidates.slice(0, 3),
      bestScore: best.finalScore,
    }
  }

  private async scoreCandidates(input: CatVisionInput): Promise<CatVisionCandidate[]> {
    const cats = await findActiveCats()

    return cats
      .map((cat, index) => {
        const imageSimilarityScore = input.requestedCatId === cat.id ? 0.96 : Math.max(0.62, 0.9 - index * 0.08)
        const distance =
          cat.default_latitude == null || cat.default_longitude == null
            ? null
            : Math.hypot((Number(cat.default_latitude) - input.latitude) * 111000, (Number(cat.default_longitude) - input.longitude) * 88800)
        const locationScoreValue = locationScore(distance)
        const finalScore = Number((imageSimilarityScore * IMAGE_WEIGHT + locationScoreValue * LOCATION_WEIGHT).toFixed(4))

        return {
          cat,
          imageSimilarityScore,
          locationScore: locationScoreValue,
          finalScore,
        }
      })
      .sort((a, b) => b.finalScore - a.finalScore)
  }
}
