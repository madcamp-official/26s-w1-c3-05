import type { CampusZoneRow, CatIdentificationCandidateRow, CatPlacementRow, CatRow, CatSightingRow, GalleryPhotoRow, UserCatCollectionRow, UserRow } from '../db/types.js'
import { buildingModelAsset, resolveBuildingModelKey } from './buildingModels.js'
import { BUSH_MODEL, modelAsset, resolveModelKey } from './catModels.js'

export const publicUser = (user: UserRow) => ({
  id: String(user.id),
  username: user.username,
  nickname: user.nickname,
  nicknameOnboarded: Boolean(user.nickname_onboarded),
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
  customName: row.custom_name ?? null,
  displayName: row.custom_name ?? row.name ?? null,
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

export const mapCat = (placement: CatPlacementRow, isDiscovered: boolean) => {
  const modelKey = resolveModelKey({ model_key: placement.model_key, pattern: placement.pattern })
  const asset = modelAsset(modelKey)
  return {
    catId: String(placement.cat_id),
    displayType: isDiscovered ? 'discovered_cat' : 'undiscovered_recent',
    name: isDiscovered ? placement.name : null,
    lat: placement.latitude,
    lng: placement.longitude,
    // Undiscovered cats are hidden as a bush; discovered cats show their coat model.
    modelType: isDiscovered ? 'cat' : 'bush',
    modelKey: isDiscovered ? modelKey : 'bush',
    modelUrl: isDiscovered ? asset.assetUrl : BUSH_MODEL.assetUrl,
    modelScale: isDiscovered ? asset.scale : BUSH_MODEL.scale,
    markerLabel: isDiscovered ? placement.name ?? '고양이' : '???',
    mainImageUrl: isDiscovered ? placement.representative_photo_url ?? null : null,
  }
}

export const catActor = (placement: CatPlacementRow, isDiscovered: boolean, distanceMeters: number) => {
  const modelKey = resolveModelKey({ model_key: placement.model_key, pattern: placement.pattern })
  const asset = modelAsset(modelKey)
  return {
    catId: String(placement.cat_id),
    displayType: isDiscovered ? 'discovered_cat' : 'undiscovered_recent',
    name: isDiscovered ? placement.name : null,
    lat: placement.latitude,
    lng: placement.longitude,
    distanceMeters: Number(distanceMeters.toFixed(2)),
    zoneId: placement.zone_id == null ? null : String(placement.zone_id),
    zoneName: placement.zone_name ?? null,
    zoneType: placement.zone_type ?? null,
    surface: placement.surface,
    anchorKey: placement.anchor_key,
    heightOffsetMeters: placement.height_offset_meters,
    movementRadiusMeters: placement.movement_radius_meters,
    modelType: isDiscovered ? 'cat' : 'bush',
    modelKey: isDiscovered ? modelKey : 'bush',
    modelUrl: isDiscovered ? asset.assetUrl : BUSH_MODEL.assetUrl,
    modelScale: isDiscovered ? asset.scale : BUSH_MODEL.scale,
    animationKey: isDiscovered ? placement.animation_key : 'idle',
    animationStartedAt: placement.animation_started_at,
    animationExpiresAt: placement.animation_expires_at,
    mainImageUrl: isDiscovered ? placement.representative_photo_url ?? null : null,
  }
}

export const mapObject = (zone: CampusZoneRow, distanceMeters: number) => {
  const modelKey = resolveBuildingModelKey(zone)
  const asset = buildingModelAsset(modelKey)
  return {
    id: String(zone.id),
    type: zone.type,
    name: zone.name,
    lat: zone.latitude,
    lng: zone.longitude,
    distanceMeters: Number(distanceMeters.toFixed(2)),
    modelType: zone.model_type ?? 'building',
    modelKey,
    modelUrl: asset.assetUrl,
    modelScale: asset.scale,
    rotationY: asset.rotationY,
    radiusMeters: zone.radius_meters,
    description: zone.description,
  }
}

export const candidate = (row: CatIdentificationCandidateRow) => ({
  catId: String(row.cat_id),
  name: row.name,
  mainImageUrl: row.representative_photo_url,
  representativePhotoUrl: row.representative_photo_url,
  pattern: row.pattern,
  imageSimilarityScore: row.image_similarity_score,
  locationScore: row.location_score,
  recentSeenScore: row.recent_seen_score,
  patternScore: row.pattern_score,
  distanceMeters: row.distance_meters,
  finalScore: row.final_score,
  lastSeenAt: row.last_seen_at ?? null,
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
  modelKey: cat.model_key,
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

export const uploadedCandidate = (cat: CatRow) => ({
  catId: String(cat.id),
  name: cat.name,
  imageUrl: cat.representative_photo_url,
  latitude: cat.default_latitude,
  longitude: cat.default_longitude,
  firstSeenAt: cat.first_seen_at,
  lastSeenAt: cat.last_seen_at,
  createdAt: cat.created_at,
  status: cat.status,
})
