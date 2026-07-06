export interface UserRow {
  id: number
  username: string
  password_hash: string
  nickname: string
  email: string | null
  profile_image_url: string | null
  role: 'user' | 'admin'
  created_at: string
  updated_at: string
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
  status: 'active' | 'hidden' | 'inactive'
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
  selected_at: string
  updated_at: string
  name?: string | null
  representative_photo_url?: string | null
  pattern?: string | null
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
  created_at: string
}

export interface CatIdentificationCandidateRow {
  id: number
  photo_id: number
  cat_id: number
  image_similarity_score: number
  location_score: number | null
  final_score: number
  rank_order: number
  created_at: string
  name?: string | null
  representative_photo_url?: string | null
  pattern?: string | null
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
  created_at: string
  updated_at: string
}

export interface GalleryPhotoRow extends CatPhotoRow {
  cat_name: string | null
}

export type DetectionStatus = 'pending' | 'matched' | 'needs_user_confirmation' | 'new_cat_candidate' | 'rejected'
