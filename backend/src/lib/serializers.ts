import type { CampusZoneRow, CatIdentificationCandidateRow, CatPhotoRow, CatPlacementRow, CatRow, CatSightingRow, GalleryPhotoRow, UserCatCollectionRow, UserRow } from '../db/types.js'

export const publicUser = (user: UserRow) => ({
  id: String(user.id),
  username: user.username,
  nickname: user.nickname,
  email: user.email,
  profileImageUrl: user.profile_image_url,
})

export const catListItem = (cat: CatRow, isDiscovered: boolean) => ({
  id: String(cat.id),
  name: isDiscovered ? cat.name : null,
  mainImageUrl: isDiscovered ? cat.representative_photo_url : null,
  pattern: isDiscovered ? cat.pattern : null,
  description: isDiscovered ? cat.description : null,
  isDiscovered,
})

export const catDetail = (cat: CatRow, collection?: UserCatCollectionRow) => {
  const isDiscovered = Boolean(collection)
  return {
    id: String(cat.id),
    name: isDiscovered ? cat.name : null,
    mainImageUrl: isDiscovered ? cat.representative_photo_url : null,
    pattern: isDiscovered ? cat.pattern : null,
    personality: isDiscovered ? cat.personality : null,
    description: isDiscovered ? cat.description : null,
    isDiscovered,
    ...(isDiscovered
      ? { discoveredAt: collection?.first_discovered_at }
      : { displayName: '???' }),
  }
}

export const collectionCat = (row: UserCatCollectionRow & Partial<CatRow>) => ({
  catId: String(row.cat_id),
  name: row.name ?? null,
  mainImageUrl: row.representative_photo_url ?? null,
  pattern: row.pattern ?? null,
  discoveredAt: row.first_discovered_at,
  isFavorite: Boolean(row.is_favorite),
})

export const galleryPhoto = (photo: GalleryPhotoRow) => ({
  sightingId: String(photo.id),
  catId: photo.cat_id == null ? null : String(photo.cat_id),
  catName: photo.cat_name ?? null,
  imageUrl: photo.image_url,
  latitude: photo.latitude,
  longitude: photo.longitude,
  takenAt: photo.taken_at,
  isRepresentative: Boolean(photo.is_representative),
})

export const sighting = (row: CatSightingRow) => ({
  id: String(row.id),
  catId: String(row.cat_id),
  catName: row.cat_name ?? null,
  imageUrl: row.image_url ?? null,
  latitude: row.latitude,
  longitude: row.longitude,
  detectionStatus: 'matched',
  createdAt: row.created_at,
})

export const catSighting = (row: CatSightingRow) => ({
  id: String(row.id),
  imageUrl: row.image_url ?? null,
  latitude: row.latitude,
  longitude: row.longitude,
  createdAt: row.created_at,
})

export const mapCat = (placement: CatPlacementRow, isDiscovered: boolean) => ({
  catId: String(placement.cat_id),
  displayType: isDiscovered ? 'discovered_cat' : 'undiscovered_recent',
  name: isDiscovered ? placement.name : null,
  lat: placement.latitude,
  lng: placement.longitude,
  modelType: isDiscovered ? 'cat' : 'bush',
  markerLabel: isDiscovered ? placement.name ?? '고양이' : '???',
  mainImageUrl: isDiscovered ? placement.representative_photo_url ?? null : null,
})

export const candidate = (row: CatIdentificationCandidateRow) => ({
  catId: String(row.cat_id),
  name: row.name,
  representativePhotoUrl: row.representative_photo_url,
  pattern: row.pattern,
  lastSeenLocation: null,
  imageSimilarityScore: row.image_similarity_score,
  locationScore: row.location_score,
  finalScore: row.final_score,
})

export const adminCat = (cat: CatRow) => ({
  id: String(cat.id),
  name: cat.name,
  description: cat.description,
  mainImageUrl: cat.representative_photo_url,
  pattern: cat.pattern,
  personality: cat.personality,
  defaultLatitude: cat.default_latitude,
  defaultLongitude: cat.default_longitude,
  status: cat.status,
})

export const zone = (row: CampusZoneRow) => ({
  id: String(row.id),
  name: row.name,
  type: row.type,
  latitude: row.latitude,
  longitude: row.longitude,
  radiusMeters: row.radius_meters,
  modelType: row.model_type,
  description: row.description,
})

export const uploadedCandidate = (photo: CatPhotoRow) => ({
  sightingId: String(photo.id),
  imageUrl: photo.image_url,
  latitude: photo.latitude,
  longitude: photo.longitude,
  createdAt: photo.created_at,
})
