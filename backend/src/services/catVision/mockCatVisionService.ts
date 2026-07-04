import { findActiveCats, findLatestSightingByCatIds } from '../../db/repositories.js'
import type { CatSightingRow } from '../../db/types.js'
import { buildCandidate } from './candidateScoring.js'
import type { CatVisionArtifacts, CatVisionCandidate, CatVisionInput, CatVisionResult, CatVisionService } from './types.js'

const IMAGE_MATCH_THRESHOLD = 0.6
const AUTO_MATCH_THRESHOLD = 0.8
const SCORE_GAP_THRESHOLD = 0.07

// The mock does not run a real model, so it produces no persistable artifacts.
const noArtifacts: CatVisionArtifacts = {
  bbox: null,
  qualityScore: null,
  qualityReason: null,
  dominantColor: null,
  modelName: 'mock',
  embedding: null,
  cropImageDataUrl: null,
}

export class MockCatVisionService implements CatVisionService {
  async analyze(input: CatVisionInput): Promise<CatVisionResult> {
    if (input.isCatOverride === false) {
      return { ...noArtifacts, status: 'rejected', isCat: false, catDetectionConfidence: 0.05, matchedCat: null, candidates: [], bestScore: null }
    }

    const candidates = await this.scoreCandidates(input)
    const best = candidates[0]
    const second = candidates[1]

    if (!best || best.imageSimilarityScore < IMAGE_MATCH_THRESHOLD) {
      return { ...noArtifacts, status: 'new_cat_candidate', isCat: true, catDetectionConfidence: 0.94, matchedCat: null, candidates: [], bestScore: best?.finalScore ?? null }
    }

    const shouldAutoMatch =
      !input.forceConfirmation &&
      best.finalScore >= AUTO_MATCH_THRESHOLD &&
      (!second || best.finalScore - second.finalScore >= SCORE_GAP_THRESHOLD)

    if (shouldAutoMatch) {
      return { ...noArtifacts, status: 'matched', isCat: true, catDetectionConfidence: 0.94, matchedCat: best.cat, candidates: candidates.slice(0, 3), bestScore: best.finalScore }
    }

    return { ...noArtifacts, status: 'needs_user_confirmation', isCat: true, catDetectionConfidence: 0.94, matchedCat: null, candidates: candidates.slice(0, 3), bestScore: best.finalScore }
  }

  private async scoreCandidates(input: CatVisionInput): Promise<CatVisionCandidate[]> {
    const cats = await findActiveCats()
    const sightings = await findLatestSightingByCatIds(cats.map((cat) => cat.id))
    const latestByCat = new Map<number, CatSightingRow>(sightings.map((row) => [Number(row.cat_id), row]))
    const now = new Date()

    return cats
      .map((cat, index) => {
        const imageSimilarityScore = input.requestedCatId === cat.id ? 0.96 : Math.max(0.62, 0.9 - index * 0.08)
        return buildCandidate(cat, imageSimilarityScore, input, latestByCat.get(cat.id), now)
      })
      .sort((a, b) => b.finalScore - a.finalScore)
  }
}
