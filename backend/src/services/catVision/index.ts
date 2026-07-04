import { HttpCatVisionService } from './httpCatVisionService.js'
import { MockCatVisionService } from './mockCatVisionService.js'

const provider = process.env.VISION_PROVIDER ?? 'mock'

export const catVisionService =
  provider === 'http'
    ? new HttpCatVisionService(
        process.env.VISION_SERVICE_URL ?? 'http://localhost:8001',
        process.env.VISION_HTTP_FALLBACK_TO_MOCK !== 'false',
      )
    : new MockCatVisionService()
