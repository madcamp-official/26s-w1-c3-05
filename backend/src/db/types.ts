export interface UserRow {
  id: number
  username: string
  password_hash: string
  email: string | null
  auth_provider: 'local' | 'google' | 'kakao' | 'guest'
  provider_user_id: string | null
  nickname: string
  nickname_onboarded: boolean
  profile_image_url: string | null
  role: 'user' | 'admin'
  exp: number
  level: number
  created_at: string
  updated_at: string
}

export interface UserExpEventRow {
  id: number
  user_id: number
  event_type: string
  exp_amount: number
  cat_id: number | null
  photo_id: number | null
  zone_id: number | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface EmailVerificationRow {
  id: number
  email: string
  code_hash: string
  expires_at: string
  consumed_at: string | null
  attempts: number
  created_at: string
}

export interface CatRow {
  id: number
  name: string | null
  description: string | null
  representative_photo_id: number | null
  representative_photo_url: string | null
  first_seen_at: string | null
  last_seen_at: string | null
  pattern: string | null
  personality: string | null
  default_latitude: number | null
  default_longitude: number | null
  default_zone_id: number | null
  status: 'active' | 'candidate' | 'merged' | 'hidden' | 'inactive'
  model_key: string | null
  created_at: string
  updated_at: string
}

export interface CatPhotoRow {
  id: number
  user_id: number
  cat_id: number | null
  image_url: string
  latitude: number
  longitude: number
  zone_id: number | null
  taken_at: string
  uploaded_at: string
  is_cat: number
  cat_detection_confidence: number | null
  cat_identification_confidence: number | null
  is_gallery_visible: number
  is_representative: number
  identification_status: DetectionStatus
  crop_image_url: string | null
  detection_bbox_json: DetectionBbox | null
  quality_score: number | null
  created_at: string
}

export interface DetectionBbox {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface CatPhotoEmbeddingRow {
  id: number
  photo_id: number
  cat_id: number | null
  model_name: string
  embedding: number[]
  crop_image_url: string | null
  quality_score: number | null
  created_at: string
}

export interface CatSightingRow {
  id: number
  cat_id: number
  user_id: number
  photo_id: number
  latitude: number
  longitude: number
  zone_id: number | null
  seen_at: string
  created_at: string
  image_url?: string
  cat_name?: string | null
}

export interface CatPlacementRow {
  id: number
  cat_id: number
  source_sighting_id: number | null
  latitude: number
  longitude: number
  zone_id: number | null
  surface: string
  anchor_key: string | null
  height_offset_meters: number
  movement_radius_meters: number
  animation_key: string
  animation_started_at: string
  animation_expires_at: string | null
  selected_at: string
  updated_at: string
  name?: string | null
  representative_photo_url?: string | null
  pattern?: string | null
  model_key?: string | null
  zone_name?: string | null
  zone_type?: string | null
  zone_model_type?: string | null
}

export interface BushClueRow {
  id: number
  user_id: number
  cat_id: number
  crop_x: number
  crop_y: number
  crop_size: number
  created_at: string
}

export interface UserCatCollectionRow {
  id: number
  user_id: number
  cat_id: number
  first_discovered_at: string
  last_seen_at: string | null
  discovery_photo_id: number | null
  representative_photo_id: number | null
  is_favorite: number
  custom_name: string | null
  created_at: string
  discovery_latitude?: number | null
  discovery_longitude?: number | null
  discovery_zone_id?: number | null
  discovery_zone_name?: string | null
}

export interface CatIdentificationCandidateRow {
  id: number
  photo_id: number
  cat_id: number
  image_similarity_score: number
  location_score: number | null
  recent_seen_score: number | null
  pattern_score: number | null
  distance_meters: number | null
  final_score: number
  rank_order: number
  created_at: string
  name?: string | null
  representative_photo_url?: string | null
  pattern?: string | null
  last_seen_at?: string | null
}

export interface CampusZoneRow {
  id: number
  name: string
  type: string
  latitude: number
  longitude: number
  radius_meters: number
  model_type: string | null
  description: string | null
  rotation_y: number
  created_at: string
  updated_at: string
}

export interface GalleryPhotoRow extends CatPhotoRow {
  cat_name: string | null
}

export type DetectionStatus =
  | 'pending'
  | 'matched'
  | 'needs_user_confirmation'
  | 'new_cat_candidate'
  | 'rejected'
  | 'low_quality'
  | 'admin_review'
  | 'failed'
