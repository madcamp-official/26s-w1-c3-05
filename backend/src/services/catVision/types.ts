import type { CatRow, DetectionBbox, DetectionStatus } from '../../db/types.js'

export interface CatVisionInput {
  imageUrl: string
  latitude: number
  longitude: number
  requestedCatId?: number
  isCatOverride?: boolean
  forceConfirmation?: boolean
}

export interface CatDetectionResult {
  isCat: boolean
  confidence: number
}

export interface CatVisionCandidate {
  cat: CatRow
  imageSimilarityScore: number
  locationScore: number
  recentSeenScore: number
  patternScore: number
  finalScore: number
  distanceMeters: number | null
  lastSeenAt: string | null
}

/** Persistable artifacts produced by the vision pipeline for the uploaded photo. */
export interface CatVisionArtifacts {
  bbox: DetectionBbox | null
  qualityScore: number | null
  qualityReason: string | null
  /** Coarse coat color from the crop, used to pick a 3D model and to score patterns. */
  dominantColor: string | null
  modelName: string | null
  /** L2-normalized embedding of the query crop, or null when unavailable (mock/no cat). */
  embedding: number[] | null
  /** Cropped cat as a data URL, to be persisted by the caller. */
  cropImageDataUrl: string | null
}

export interface CatVisionResult extends CatVisionArtifacts {
  status: Exclude<DetectionStatus, 'pending' | 'admin_review' | 'failed'>
  isCat: boolean
  catDetectionConfidence: number
  matchedCat: CatRow | null
  candidates: CatVisionCandidate[]
  bestScore: number | null
}

export interface CatVisionService {
  analyze(input: CatVisionInput): Promise<CatVisionResult>
}
