import { MockCatVisionService } from './mockCatVisionService.js'
import type { CatDetectionResult, CatVisionInput, CatVisionResult, CatVisionService } from './types.js'

interface VisionServiceResponse {
  isCat?: unknown
  confidence?: unknown
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

      const result = await this.mockService.analyze(input)

      return {
        ...result,
        isCat: true,
        catDetectionConfidence: detection.confidence,
      }
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

  private resolveImageUrl(imageUrl: string): string {
    if (/^https?:\/\//i.test(imageUrl)) {
      return imageUrl
    }

    const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`
    return new URL(imageUrl, publicBaseUrl).toString()
  }
}
