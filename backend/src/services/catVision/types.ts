import type { CatRow, DetectionStatus } from '../../db/types.js'

export interface CatVisionInput {
  imageUrl: string
  latitude: number
  longitude: number
  requestedCatId?: number
  isCatOverride?: boolean
  forceConfirmation?: boolean
}

export interface CatVisionCandidate {
  cat: CatRow
  imageSimilarityScore: number
  locationScore: number
  finalScore: number
}

export interface CatVisionResult {
  status: Exclude<DetectionStatus, 'pending'>
  isCat: boolean
  catDetectionConfidence: number
  matchedCat: CatRow | null
  candidates: CatVisionCandidate[]
  bestScore: number | null
}

export interface CatVisionService {
  analyze(input: CatVisionInput): Promise<CatVisionResult>
}
