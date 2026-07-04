import { findActiveCats } from '../../db/repositories.js'
import { locationScore } from '../../lib/geo.js'
import { MockCatVisionService } from './mockCatVisionService.js'
import type { CatDetectionResult, CatVisionCandidate, CatVisionInput, CatVisionResult, CatVisionService } from './types.js'

const IMAGE_MATCH_THRESHOLD = 0.6
const AUTO_MATCH_THRESHOLD = 0.8
const SCORE_GAP_THRESHOLD = 0.07
const IMAGE_WEIGHT = 0.75
const LOCATION_WEIGHT = 0.25

interface VisionServiceResponse {
  isCat?: unknown
  confidence?: unknown
}

interface IdentificationCandidateResponse {
  catId?: unknown
  imageSimilarityScore?: unknown
}

interface IdentificationResponse {
  candidates?: unknown
}

export class HttpCatVisionService implements CatVisionService {
  private readonly mockService = new MockCatVisionService()

  constructor(
    private readonly baseUrl: string,
    private readonly fallbackToMock: boolean,
  ) {}

  async analyze(input: CatVisionInput): Promise<CatVisionResult> {
    try {
      const detection = await this.detectCat(input.imageUrl)

      if (!detection.isCat) {
        return {
          status: 'rejected',
          isCat: false,
          catDetectionConfidence: detection.confidence,
          matchedCat: null,
          candidates: [],
          bestScore: null,
        }
      }

      return this.identifyCat(input, detection.confidence)
    } catch (error) {
      if (!this.fallbackToMock) {
        throw error
      }

      return this.mockService.analyze(input)
    }
  }

  private async detectCat(imageUrl: string): Promise<CatDetectionResult> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/cat-detection`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageUrl: this.resolveImageUrl(imageUrl),
      }),
    })

    if (!response.ok) {
      throw new Error(`Vision service request failed with ${response.status}`)
    }

    const data = (await response.json()) as VisionServiceResponse

    if (typeof data.isCat !== 'boolean' || typeof data.confidence !== 'number') {
      throw new Error('Vision service returned invalid cat-detection response')
    }

    return {
      isCat: data.isCat,
      confidence: Math.min(1, Math.max(0, data.confidence)),
    }
  }

  private async identifyCat(input: CatVisionInput, catDetectionConfidence: number): Promise<CatVisionResult> {
    const cats = await findActiveCats()
    const candidateCats = cats.filter((cat) => cat.representative_photo_url)

    if (candidateCats.length === 0) {
      return {
        status: 'new_cat_candidate',
        isCat: true,
        catDetectionConfidence,
        matchedCat: null,
        candidates: [],
        bestScore: null,
      }
    }

    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/cat-identification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageUrl: this.resolveImageUrl(input.imageUrl),
        candidates: candidateCats.map((cat) => ({
          catId: cat.id,
          imageUrls: [this.resolveImageUrl(cat.representative_photo_url!)],
        })),
      }),
    })

    if (!response.ok) {
      throw new Error(`Vision service identification request failed with ${response.status}`)
    }

    const data = (await response.json()) as IdentificationResponse
    if (!Array.isArray(data.candidates)) {
      throw new Error('Vision service returned invalid cat-identification response')
    }

    const catById = new Map(cats.map((cat) => [cat.id, cat]))
    const candidates: CatVisionCandidate[] = data.candidates
      .map((item) => this.toCandidate(item as IdentificationCandidateResponse, catById, input))
      .filter((item): item is CatVisionCandidate => item !== null)
      .sort((a, b) => b.finalScore - a.finalScore)

    const best = candidates[0]
    const second = candidates[1]

    if (!best || best.imageSimilarityScore < IMAGE_MATCH_THRESHOLD) {
      return {
        status: 'new_cat_candidate',
        isCat: true,
        catDetectionConfidence,
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
        catDetectionConfidence,
        matchedCat: best.cat,
        candidates: candidates.slice(0, 3),
        bestScore: best.finalScore,
      }
    }

    return {
      status: 'needs_user_confirmation',
      isCat: true,
      catDetectionConfidence,
      matchedCat: null,
      candidates: candidates.slice(0, 3),
      bestScore: best.finalScore,
    }
  }

  private toCandidate(item: IdentificationCandidateResponse, catById: Map<number, CatVisionCandidate['cat']>, input: CatVisionInput): CatVisionCandidate | null {
    if (typeof item.catId !== 'number' || typeof item.imageSimilarityScore !== 'number') {
      return null
    }

    const cat = catById.get(item.catId)
    if (!cat) {
      return null
    }

    const imageSimilarityScore = Math.min(1, Math.max(0, item.imageSimilarityScore))
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
  }

  private resolveImageUrl(imageUrl: string): string {
    if (/^https?:\/\//i.test(imageUrl)) {
      return imageUrl
    }

    const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`
    return new URL(imageUrl, publicBaseUrl).toString()
  }
}
