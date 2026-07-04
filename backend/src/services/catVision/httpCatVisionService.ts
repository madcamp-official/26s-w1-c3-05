import { findEmbeddedCats, findLatestSightingByCatIds } from '../../db/repositories.js'
import { colorArchetype } from '../../lib/catModels.js'
import { cosineSimilarity } from '../../lib/vector.js'
import type { CatRow, CatSightingRow, DetectionBbox } from '../../db/types.js'
import { buildCandidate } from './candidateScoring.js'
import { MockCatVisionService } from './mockCatVisionService.js'
import type { CatVisionArtifacts, CatVisionCandidate, CatVisionInput, CatVisionResult, CatVisionService } from './types.js'

// Thresholds are in raw cosine-similarity space and calibrated for MegaDescriptor
// (same-cat ~0.4-0.6, different-cat ~0.2). Env-overridable so they can be tuned on
// real data without a code change. If you swap the identity model, recalibrate these.
const num = (key: string, fallback: number) => {
  const value = Number(process.env[key])
  return Number.isFinite(value) ? value : fallback
}
// Below this best image similarity we assume it is a cat we have never seen.
const IMAGE_MATCH_THRESHOLD = num('MATCH_IMAGE_MIN', 0.4)
// Auto-match only when the top cat is clearly similar and clearly ahead of the rest.
const AUTO_MATCH_IMAGE_THRESHOLD = num('MATCH_IMAGE_AUTO', 0.62)
const IMAGE_GAP_THRESHOLD = num('MATCH_IMAGE_GAP', 0.08)
const SCORE_GAP_THRESHOLD = num('MATCH_FINAL_GAP', 0.07)

interface AnalyzeResponse {
  isCat?: unknown
  confidence?: unknown
  bbox?: unknown
  qualityScore?: unknown
  qualityReason?: unknown
  dominantColor?: unknown
  modelName?: unknown
  embedding?: unknown
  cropImage?: unknown
}

const emptyArtifacts: CatVisionArtifacts = {
  bbox: null,
  qualityScore: null,
  qualityReason: null,
  dominantColor: null,
  modelName: null,
  embedding: null,
  cropImageDataUrl: null,
}

export class HttpCatVisionService implements CatVisionService {
  private readonly mockService = new MockCatVisionService()

  constructor(
    private readonly baseUrl: string,
    private readonly fallbackToMock: boolean,
  ) {}

  async analyze(input: CatVisionInput): Promise<CatVisionResult> {
    if (input.isCatOverride === false) {
      return { ...emptyArtifacts, status: 'rejected', isCat: false, catDetectionConfidence: 0.05, matchedCat: null, candidates: [], bestScore: null }
    }

    try {
      const analysis = await this.requestAnalysis(input.imageUrl)

      if (!analysis.isCat) {
        return { ...emptyArtifacts, status: 'rejected', isCat: false, catDetectionConfidence: analysis.confidence, matchedCat: null, candidates: [], bestScore: null }
      }

      const artifacts: CatVisionArtifacts = {
        bbox: analysis.bbox,
        qualityScore: analysis.qualityScore,
        qualityReason: analysis.qualityReason,
        dominantColor: analysis.dominantColor,
        modelName: analysis.modelName,
        embedding: analysis.embedding,
        cropImageDataUrl: analysis.cropImage,
      }

      // Cat detected but the crop is too small/dark/blurry to identify reliably.
      if (analysis.qualityReason) {
        return { ...artifacts, status: 'low_quality', isCat: true, catDetectionConfidence: analysis.confidence, matchedCat: null, candidates: [], bestScore: null }
      }

      return this.identify(input, analysis.confidence, artifacts)
    } catch (error) {
      if (!this.fallbackToMock) throw error
      return this.mockService.analyze(input)
    }
  }

  private async identify(input: CatVisionInput, catDetectionConfidence: number, artifacts: CatVisionArtifacts): Promise<CatVisionResult> {
    const candidates = await this.scoreCandidates(input, artifacts.embedding, artifacts.modelName, artifacts.dominantColor)
    const best = candidates[0]
    const second = candidates[1]

    if (!best || best.imageSimilarityScore < IMAGE_MATCH_THRESHOLD) {
      return { ...artifacts, status: 'new_cat_candidate', isCat: true, catDetectionConfidence, matchedCat: null, candidates: [], bestScore: best?.finalScore ?? null }
    }

    // Gate auto-match on image similarity (robust to location inflating the final
    // score); require a clear lead over the runner-up in both image and final score.
    const shouldAutoMatch =
      !input.forceConfirmation &&
      best.imageSimilarityScore >= AUTO_MATCH_IMAGE_THRESHOLD &&
      (!second || best.imageSimilarityScore - second.imageSimilarityScore >= IMAGE_GAP_THRESHOLD) &&
      (!second || best.finalScore - second.finalScore >= SCORE_GAP_THRESHOLD)

    if (shouldAutoMatch) {
      return { ...artifacts, status: 'matched', isCat: true, catDetectionConfidence, matchedCat: best.cat, candidates: candidates.slice(0, 3), bestScore: best.finalScore }
    }

    return { ...artifacts, status: 'needs_user_confirmation', isCat: true, catDetectionConfidence, matchedCat: null, candidates: candidates.slice(0, 3), bestScore: best.finalScore }
  }

  /** Nearest-cat search over stored embeddings (max similarity per cat), scored with location/recency/color. */
  private async scoreCandidates(input: CatVisionInput, queryEmbedding: number[] | null, modelName: string | null, dominantColor: string | null): Promise<CatVisionCandidate[]> {
    if (!queryEmbedding || queryEmbedding.length === 0 || !modelName) return []

    const rows = await findEmbeddedCats(modelName)
    const bestByCat = new Map<number, { cat: CatRow; imageSimilarityScore: number }>()

    for (const row of rows) {
      const { embedding, ...cat } = row
      const similarity = cosineSimilarity(queryEmbedding, embedding)
      const current = bestByCat.get(cat.id)
      if (!current || similarity > current.imageSimilarityScore) {
        bestByCat.set(cat.id, { cat: cat as CatRow, imageSimilarityScore: similarity })
      }
    }

    const latestByCat = await this.latestSightingsByCat([...bestByCat.keys()])
    const queryArchetype = colorArchetype(dominantColor)
    const now = new Date()

    return [...bestByCat.values()]
      .map(({ cat, imageSimilarityScore }) => buildCandidate(cat, imageSimilarityScore, input, latestByCat.get(cat.id), now, queryArchetype))
      .sort((a, b) => b.finalScore - a.finalScore)
  }

  private async latestSightingsByCat(catIds: number[]): Promise<Map<number, CatSightingRow>> {
    const sightings = await findLatestSightingByCatIds(catIds)
    return new Map(sightings.map((row) => [Number(row.cat_id), row]))
  }

  private async requestAnalysis(imageUrl: string) {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl: this.resolveImageUrl(imageUrl), includeCrop: true }),
    })

    if (!response.ok) throw new Error(`Vision service /analyze failed with ${response.status}`)

    const data = (await response.json()) as AnalyzeResponse
    if (typeof data.isCat !== 'boolean' || typeof data.confidence !== 'number') {
      throw new Error('Vision service returned invalid /analyze response')
    }

    return {
      isCat: data.isCat,
      confidence: Math.min(1, Math.max(0, data.confidence)),
      bbox: this.toBbox(data.bbox),
      qualityScore: typeof data.qualityScore === 'number' ? data.qualityScore : null,
      qualityReason: typeof data.qualityReason === 'string' ? data.qualityReason : null,
      dominantColor: typeof data.dominantColor === 'string' ? data.dominantColor : null,
      modelName: typeof data.modelName === 'string' ? data.modelName : null,
      embedding: Array.isArray(data.embedding) ? data.embedding.map(Number).filter((value) => Number.isFinite(value)) : null,
      cropImage: typeof data.cropImage === 'string' ? data.cropImage : null,
    }
  }

  private toBbox(value: unknown): DetectionBbox | null {
    if (!value || typeof value !== 'object') return null
    const box = value as Record<string, unknown>
    const keys: (keyof DetectionBbox)[] = ['x1', 'y1', 'x2', 'y2']
    if (!keys.every((key) => typeof box[key] === 'number')) return null
    return { x1: Number(box.x1), y1: Number(box.y1), x2: Number(box.x2), y2: Number(box.y2) }
  }

  private resolveImageUrl(imageUrl: string): string {
    if (/^https?:\/\//i.test(imageUrl)) return imageUrl
    const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`
    return new URL(imageUrl, publicBaseUrl).toString()
  }
}
