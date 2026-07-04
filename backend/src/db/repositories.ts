import { query } from './database.js'
import type { QueryResultRow } from 'pg'
import type {
  CampusZoneRow,
  CatIdentificationCandidateRow,
  CatPhotoRow,
  CatPlacementRow,
  CatRow,
  CatSightingRow,
  GalleryPhotoRow,
  UserCatCollectionRow,
  UserRow,
} from './types.js'

export const one = async <T extends QueryResultRow>(sql: string, params: unknown[] = []) => {
  const result = await query<T>(sql, params)
  return result.rows[0]
}

export const many = async <T extends QueryResultRow>(sql: string, params: unknown[] = []) => {
  const result = await query<T>(sql, params)
  return result.rows
}

export const run = async (sql: string, params: unknown[] = []) => query(sql, params)

export const toPublicUser = (user: UserRow) => ({
  id: String(user.id),
  username: user.username,
  nickname: user.nickname,
  profileImageUrl: user.profile_image_url,
})

export const findUserById = (id: number) => one<UserRow>('SELECT * FROM users WHERE id = $1', [id])
export const findUserByUsername = (username: string) => one<UserRow>('SELECT * FROM users WHERE username = $1', [username])

export const createUser = async (input: { username: string; passwordHash: string; nickname: string; role?: string }) => {
  const result = await query<UserRow>(
    `INSERT INTO users (username, password_hash, nickname, role)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.username, input.passwordHash, input.nickname, input.role ?? 'user'],
  )
  return result.rows[0]
}

export const updateUserProfile = async (userId: number, input: { nickname?: string; profileImageUrl?: string | null }) => {
  const current = await findUserById(userId)
  if (!current) return undefined
  return one<UserRow>(
    `UPDATE users
     SET nickname = $1, profile_image_url = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3
     RETURNING *`,
    [
      input.nickname ?? current.nickname,
      input.profileImageUrl === undefined ? current.profile_image_url : input.profileImageUrl,
      userId,
    ],
  )
}

export const findActiveCats = () => many<CatRow>("SELECT * FROM cats WHERE status = 'active' ORDER BY COALESCE(last_seen_at, created_at) DESC")
export const findCatById = (catId: number) => one<CatRow>('SELECT * FROM cats WHERE id = $1', [catId])

export const createCat = async (input: {
  name?: string | null
  description?: string | null
  representativePhotoUrl?: string | null
  pattern?: string | null
  personality?: string | null
  defaultLatitude?: number | null
  defaultLongitude?: number | null
  defaultZoneId?: number | null
  status?: string
}) => {
  const result = await query<CatRow>(
    `INSERT INTO cats
      (name, description, representative_photo_url, pattern, personality, default_latitude, default_longitude, default_zone_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.name ?? null,
      input.description ?? null,
      input.representativePhotoUrl ?? null,
      input.pattern ?? null,
      input.personality ?? null,
      input.defaultLatitude ?? null,
      input.defaultLongitude ?? null,
      input.defaultZoneId ?? null,
      input.status ?? 'active',
    ],
  )
  return result.rows[0]
}

export const updateCat = async (catId: number, input: Partial<CatRow>) => {
  const current = await findCatById(catId)
  if (!current) return undefined
  return one<CatRow>(
    `UPDATE cats SET
      name = $1, description = $2, representative_photo_url = $3, pattern = $4, personality = $5,
      default_latitude = $6, default_longitude = $7, status = $8, updated_at = CURRENT_TIMESTAMP
     WHERE id = $9
     RETURNING *`,
    [
      input.name ?? current.name,
      input.description ?? current.description,
      input.representative_photo_url ?? current.representative_photo_url,
      input.pattern ?? current.pattern,
      input.personality ?? current.personality,
      input.default_latitude ?? current.default_latitude,
      input.default_longitude ?? current.default_longitude,
      input.status ?? current.status,
      catId,
    ],
  )
}

export const findCollection = (userId: number) =>
  many<UserCatCollectionRow & CatRow>(
    `SELECT uc.*, c.name, c.pattern, c.representative_photo_url, c.description, c.personality
     FROM user_cat_collections uc
     JOIN cats c ON c.id = uc.cat_id
     WHERE uc.user_id = $1
     ORDER BY uc.first_discovered_at DESC`,
    [userId],
  )

export const findCollectionItem = (userId: number, catId: number) =>
  one<UserCatCollectionRow>('SELECT * FROM user_cat_collections WHERE user_id = $1 AND cat_id = $2', [userId, catId])

export const upsertCollection = async (input: { userId: number; catId: number; photoId?: number | null; seenAt?: string }) => {
  const seenAt = input.seenAt ?? nowIso()
  const result = await query<UserCatCollectionRow>(
    `INSERT INTO user_cat_collections
      (user_id, cat_id, first_discovered_at, last_seen_at, discovery_photo_id, representative_photo_id)
     VALUES ($1, $2, $3, $3, $4, $4)
     ON CONFLICT (user_id, cat_id) DO UPDATE SET
      last_seen_at = EXCLUDED.last_seen_at,
      representative_photo_id = COALESCE(user_cat_collections.representative_photo_id, EXCLUDED.representative_photo_id)
     RETURNING *, (xmax = 0) AS inserted`,
    [input.userId, input.catId, seenAt, input.photoId ?? null],
  )
  const row = result.rows[0] as UserCatCollectionRow & { inserted?: boolean }
  return { item: row, isNew: Boolean(row.inserted) }
}

export const setFavorite = async (userId: number, catId: number, isFavorite: boolean) =>
  one<UserCatCollectionRow>(
    `UPDATE user_cat_collections SET is_favorite = $1
     WHERE user_id = $2 AND cat_id = $3
     RETURNING *`,
    [isFavorite, userId, catId],
  )

export const createPhoto = async (input: {
  userId: number
  catId?: number | null
  imageUrl: string
  latitude: number
  longitude: number
  zoneId?: number | null
  takenAt: string
  isCat: boolean
  catDetectionConfidence?: number | null
  catIdentificationConfidence?: number | null
  isGalleryVisible?: boolean
  identificationStatus: string
}) => {
  const result = await query<CatPhotoRow>(
    `INSERT INTO cat_photos
      (user_id, cat_id, image_url, latitude, longitude, zone_id, taken_at, is_cat,
       cat_detection_confidence, cat_identification_confidence, is_gallery_visible, identification_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      input.userId,
      input.catId ?? null,
      input.imageUrl,
      input.latitude,
      input.longitude,
      input.zoneId ?? null,
      input.takenAt,
      input.isCat,
      input.catDetectionConfidence ?? null,
      input.catIdentificationConfidence ?? null,
      input.isGalleryVisible !== false,
      input.identificationStatus,
    ],
  )
  return result.rows[0]
}

export const updatePhotoMatch = (photoId: number, input: { catId: number | null; confidence?: number | null; status: string }) =>
  one<CatPhotoRow>(
    `UPDATE cat_photos
     SET cat_id = $1, cat_identification_confidence = $2, identification_status = $3
     WHERE id = $4
     RETURNING *`,
    [input.catId, input.confidence ?? null, input.status, photoId],
  )

export const findPhotoById = (photoId: number) => one<CatPhotoRow>('SELECT * FROM cat_photos WHERE id = $1', [photoId])

export const createSighting = async (input: { catId: number; userId: number; photoId: number; latitude: number; longitude: number; zoneId?: number | null; seenAt: string }) => {
  const result = await query<CatSightingRow>(
    `INSERT INTO cat_sightings (cat_id, user_id, photo_id, latitude, longitude, zone_id, seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [input.catId, input.userId, input.photoId, input.latitude, input.longitude, input.zoneId ?? null, input.seenAt],
  )
  const sighting = result.rows[0]
  await updateCatSeen(input.catId, input.seenAt)
  await upsertPlacement({ catId: input.catId, sourceSightingId: sighting.id, latitude: input.latitude, longitude: input.longitude, zoneId: input.zoneId ?? null })
  return sighting
}

export const updateCatSeen = (catId: number, seenAt: string) =>
  run(
    `UPDATE cats
     SET first_seen_at = COALESCE(first_seen_at, $1), last_seen_at = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [seenAt, catId],
  )

export const upsertPlacement = (input: { catId: number; sourceSightingId?: number | null; latitude: number; longitude: number; zoneId?: number | null }) =>
  run(
    `INSERT INTO cat_placements (cat_id, source_sighting_id, latitude, longitude, zone_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (cat_id) DO UPDATE SET
       source_sighting_id = EXCLUDED.source_sighting_id,
       latitude = EXCLUDED.latitude,
       longitude = EXCLUDED.longitude,
       zone_id = EXCLUDED.zone_id,
       updated_at = CURRENT_TIMESTAMP`,
    [input.catId, input.sourceSightingId ?? null, input.latitude, input.longitude, input.zoneId ?? null],
  )

export const findSightingsByUser = (userId: number) =>
  many<CatSightingRow>(
    `SELECT s.*, p.image_url, c.name AS cat_name
     FROM cat_sightings s
     JOIN cat_photos p ON p.id = s.photo_id
     JOIN cats c ON c.id = s.cat_id
     WHERE s.user_id = $1
     ORDER BY s.created_at DESC`,
    [userId],
  )

export const findSightingsByCat = (catId: number) =>
  many<CatSightingRow>(
    `SELECT s.*, p.image_url
     FROM cat_sightings s
     JOIN cat_photos p ON p.id = s.photo_id
     WHERE s.cat_id = $1
     ORDER BY s.seen_at DESC
     LIMIT 20`,
    [catId],
  )

export const findGalleryPhotos = async (input: { userId: number; catId?: number; limit: number; offset: number }) => {
  const params: unknown[] = [input.userId]
  const where = ['p.user_id = $1', 'p.is_gallery_visible = TRUE', 'p.is_cat = TRUE']
  if (input.catId) {
    params.push(input.catId)
    where.push(`p.cat_id = $${params.length}`)
  }
  const whereSql = where.join(' AND ')
  const rows = await many<GalleryPhotoRow>(
    `SELECT p.*, c.name AS cat_name
     FROM cat_photos p
     LEFT JOIN cats c ON c.id = p.cat_id
     WHERE ${whereSql}
     ORDER BY p.taken_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, input.limit, input.offset],
  )
  const total = await one<{ count: string }>(`SELECT COUNT(*) AS count FROM cat_photos p WHERE ${whereSql}`, params)
  return { rows, total: Number(total?.count ?? 0) }
}

export const findPlacements = () =>
  many<CatPlacementRow>(
    `SELECT cp.*, c.name, c.representative_photo_url, c.pattern
     FROM cat_placements cp
     JOIN cats c ON c.id = cp.cat_id
     WHERE c.status = 'active'
     ORDER BY cp.updated_at DESC`,
  )

export const findZones = () => many<CampusZoneRow>('SELECT * FROM campus_zones ORDER BY id ASC')

export const createCandidate = (input: { photoId: number; catId: number; imageSimilarityScore: number; locationScore: number; finalScore: number; rankOrder: number }) =>
  run(
    `INSERT INTO cat_identification_candidates
      (photo_id, cat_id, image_similarity_score, location_score, final_score, rank_order)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [input.photoId, input.catId, input.imageSimilarityScore, input.locationScore, input.finalScore, input.rankOrder],
  )

export const findCandidatesByPhoto = (photoId: number) =>
  many<CatIdentificationCandidateRow>(
    `SELECT cic.*, c.name, c.representative_photo_url, c.pattern
     FROM cat_identification_candidates cic
     JOIN cats c ON c.id = cic.cat_id
     WHERE cic.photo_id = $1
     ORDER BY cic.rank_order ASC`,
    [photoId],
  )

export const findNewCatCandidates = () =>
  many<CatPhotoRow>(
    `SELECT * FROM cat_photos
     WHERE identification_status = 'new_cat_candidate'
     ORDER BY created_at DESC`,
  )

export const findRankings = () =>
  many<{ user_id: number; nickname: string; discovered_count: string }>(
    `SELECT u.id AS user_id, u.nickname, COUNT(uc.cat_id) AS discovered_count
     FROM users u
     LEFT JOIN user_cat_collections uc ON uc.user_id = u.id
     GROUP BY u.id
     ORDER BY discovered_count DESC, u.created_at ASC`,
  )

export const nowIso = () => new Date().toISOString()
