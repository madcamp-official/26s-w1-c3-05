import { query, withTransaction } from './database.js'
import type { QueryResultRow } from 'pg'
import type {
  CampusZoneRow,
  CatIdentificationCandidateRow,
  CatPhotoRow,
  CatPlacementRow,
  CatRow,
  CatSightingRow,
  DetectionBbox,
  EmailVerificationRow,
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
  email: user.email,
  authProvider: user.auth_provider,
  nickname: user.nickname,
  nicknameOnboarded: Boolean(user.nickname_onboarded),
  profileImageUrl: user.profile_image_url,
})

export const findUserById = (id: number) => one<UserRow>('SELECT * FROM users WHERE id = $1', [id])
export const findUserByUsername = (username: string) => one<UserRow>('SELECT * FROM users WHERE username = $1', [username])
export const findUserByEmail = (email: string) => one<UserRow>('SELECT * FROM users WHERE email = $1', [email])
export const findUserByOAuthIdentity = (provider: string, providerUserId: string) =>
  one<UserRow>('SELECT * FROM users WHERE auth_provider = $1 AND provider_user_id = $2', [provider, providerUserId])

export const createUser = async (input: { username: string; passwordHash: string; nickname: string; email: string; nicknameOnboarded?: boolean; role?: string }) => {
  const result = await query<UserRow>(
    `INSERT INTO users (username, password_hash, nickname, email, nickname_onboarded, role)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [input.username, input.passwordHash, input.nickname, input.email, input.nicknameOnboarded ?? true, input.role ?? 'user'],
  )
  return result.rows[0]
}

export const createEmailVerification = (input: { email: string; codeHash: string; expiresAt: string }) =>
  one<EmailVerificationRow>(
    `INSERT INTO email_verifications (email, code_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [input.email, input.codeHash, input.expiresAt],
  )

export const findLatestEmailVerification = (email: string) =>
  one<EmailVerificationRow>('SELECT * FROM email_verifications WHERE email = $1 ORDER BY created_at DESC LIMIT 1', [email])

export const consumeEmailVerification = (id: number) =>
  run('UPDATE email_verifications SET consumed_at = CURRENT_TIMESTAMP WHERE id = $1', [id])

export const incrementEmailVerificationAttempts = (id: number) =>
  run('UPDATE email_verifications SET attempts = attempts + 1 WHERE id = $1', [id])

export const createOAuthUser = async (input: {
  username: string
  email?: string | null
  authProvider: 'google' | 'kakao' | 'guest'
  providerUserId: string
  nickname: string
  nicknameOnboarded?: boolean
  profileImageUrl?: string | null
  role?: string
}) => {
  const result = await query<UserRow>(
    `INSERT INTO users
      (username, password_hash, email, auth_provider, provider_user_id, nickname, nickname_onboarded, profile_image_url, role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.username,
      `oauth:${input.authProvider}`,
      input.email ?? null,
      input.authProvider,
      input.providerUserId,
      input.nickname,
      input.nicknameOnboarded ?? true,
      input.profileImageUrl ?? null,
      input.role ?? 'user',
    ],
  )
  return result.rows[0]
}

export const updateUserProfile = async (userId: number, input: { nickname?: string; profileImageUrl?: string | null }) => {
  const current = await findUserById(userId)
  if (!current) return undefined
  return one<UserRow>(
    `UPDATE users
     SET nickname = $1,
         nickname_onboarded = CASE WHEN $4::text IS NULL THEN nickname_onboarded ELSE TRUE END,
         profile_image_url = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3
     RETURNING *`,
    [
      input.nickname ?? current.nickname,
      input.profileImageUrl === undefined ? current.profile_image_url : input.profileImageUrl,
      userId,
      input.nickname ?? null,
    ],
  )
}

export const findActiveCats = () => many<CatRow>("SELECT * FROM cats WHERE status = 'active' ORDER BY COALESCE(last_seen_at, created_at) DESC")
export const findCatById = (catId: number) => one<CatRow>('SELECT * FROM cats WHERE id = $1', [catId])

export const findCatReferencePhotoUrls = (catIds: number[], limitPerCat = 5) => {
  if (catIds.length === 0) {
    return Promise.resolve([])
  }

  return many<{ cat_id: number; image_url: string }>(
    `SELECT cat_id, image_url
     FROM (
       SELECT
         cat_id,
         image_url,
         ROW_NUMBER() OVER (
           PARTITION BY cat_id
           ORDER BY is_representative DESC, cat_identification_confidence DESC NULLS LAST, taken_at DESC
         ) AS row_number
       FROM cat_photos
       WHERE cat_id = ANY($1::bigint[])
         AND is_cat = TRUE
         AND identification_status = 'matched'
         AND is_gallery_visible = TRUE
     ) ranked
     WHERE row_number <= $2
     ORDER BY cat_id, row_number`,
    [catIds, limitPerCat],
  )
}

export const createCat = async (input: {
  name?: string | null
  description?: string | null
  representativePhotoId?: number | null
  representativePhotoUrl?: string | null
  firstSeenAt?: string | null
  lastSeenAt?: string | null
  pattern?: string | null
  personality?: string | null
  defaultLatitude?: number | null
  defaultLongitude?: number | null
  defaultZoneId?: number | null
  status?: string
  modelKey?: string | null
}) => {
  const result = await query<CatRow>(
    `INSERT INTO cats
      (name, description, representative_photo_id, representative_photo_url, first_seen_at, last_seen_at,
       pattern, personality, default_latitude, default_longitude, default_zone_id, status, model_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      input.name ?? null,
      input.description ?? null,
      input.representativePhotoId ?? null,
      input.representativePhotoUrl ?? null,
      input.firstSeenAt ?? null,
      input.lastSeenAt ?? null,
      input.pattern ?? null,
      input.personality ?? null,
      input.defaultLatitude ?? null,
      input.defaultLongitude ?? null,
      input.defaultZoneId ?? null,
      input.status ?? 'active',
      input.modelKey ?? null,
    ],
  )
  return result.rows[0]
}

/** Assign a 3D model to a cat only if one is not already set (keeps it stable / admin-overridable). */
export const setCatModelKeyIfNull = (catId: number, modelKey: string) =>
  run('UPDATE cats SET model_key = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND model_key IS NULL', [catId, modelKey])

export const createCandidateCatFromPhoto = async (input: {
  userId: number
  photoId: number
  imageUrl: string
  latitude: number
  longitude: number
  zoneId?: number | null
  takenAt: string
  confidence?: number | null
}) => {
  const cat = await createCat({
    representativePhotoId: input.photoId,
    representativePhotoUrl: input.imageUrl,
    firstSeenAt: input.takenAt,
    lastSeenAt: input.takenAt,
    defaultLatitude: input.latitude,
    defaultLongitude: input.longitude,
    defaultZoneId: input.zoneId ?? null,
    status: 'candidate',
  })

  await updatePhotoMatch(input.photoId, {
    catId: cat.id,
    confidence: input.confidence ?? null,
    status: 'new_cat_candidate',
  })

  const createdSighting = await createSighting({
    catId: cat.id,
    userId: input.userId,
    photoId: input.photoId,
    latitude: input.latitude,
    longitude: input.longitude,
    zoneId: input.zoneId ?? null,
    seenAt: input.takenAt,
  })
  const collection = await upsertCollection({
    userId: input.userId,
    catId: cat.id,
    photoId: input.photoId,
    seenAt: input.takenAt,
  })

  return { cat, sighting: createdSighting, collection }
}

export const updateCat = async (catId: number, input: Partial<CatRow>) => {
  const current = await findCatById(catId)
  if (!current) return undefined
  return one<CatRow>(
    `UPDATE cats SET
      name = $1, description = $2, representative_photo_url = $3, pattern = $4, personality = $5,
      default_latitude = $6, default_longitude = $7, status = $8, model_key = $9, updated_at = CURRENT_TIMESTAMP
     WHERE id = $10
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
      input.model_key ?? current.model_key,
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
  cropImageUrl?: string | null
  detectionBbox?: DetectionBbox | null
  qualityScore?: number | null
}) => {
  const result = await query<CatPhotoRow>(
    `INSERT INTO cat_photos
      (user_id, cat_id, image_url, latitude, longitude, zone_id, taken_at, is_cat,
       cat_detection_confidence, cat_identification_confidence, is_gallery_visible, identification_status,
       crop_image_url, detection_bbox_json, quality_score)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
      input.cropImageUrl ?? null,
      input.detectionBbox ? JSON.stringify(input.detectionBbox) : null,
      input.qualityScore ?? null,
    ],
  )
  return result.rows[0]
}

export const insertEmbedding = (input: {
  photoId: number
  catId?: number | null
  modelName: string
  embedding: number[]
  cropImageUrl?: string | null
  qualityScore?: number | null
}) =>
  run(
    `INSERT INTO cat_photo_embeddings (photo_id, cat_id, model_name, embedding, crop_image_url, quality_score)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (photo_id, model_name) DO UPDATE SET
       cat_id = EXCLUDED.cat_id,
       embedding = EXCLUDED.embedding,
       crop_image_url = EXCLUDED.crop_image_url,
       quality_score = EXCLUDED.quality_score`,
    [input.photoId, input.catId ?? null, input.modelName, input.embedding, input.cropImageUrl ?? null, input.qualityScore ?? null],
  )

export const setEmbeddingCatForPhoto = (photoId: number, catId: number) =>
  run('UPDATE cat_photo_embeddings SET cat_id = $1 WHERE photo_id = $2', [catId, photoId])

export const hasEmbedding = async (photoId: number, modelName: string) => {
  const row = await one<{ id: number }>('SELECT id FROM cat_photo_embeddings WHERE photo_id = $1 AND model_name = $2', [photoId, modelName])
  return Boolean(row)
}

/**
 * Reference embeddings for cats eligible to be matched, one row per stored photo.
 * Filtered by model_name so vectors from different models are never compared
 * (cosine across embedding spaces is meaningless).
 */
export const findEmbeddedCats = (modelName: string, statuses: string[] = ['active', 'candidate']) =>
  many<CatRow & { embedding: number[] }>(
    `SELECT c.*, e.embedding
     FROM cat_photo_embeddings e
     JOIN cats c ON c.id = e.cat_id
     WHERE e.cat_id IS NOT NULL AND e.model_name = $1 AND c.status = ANY($2::text[])`,
    [modelName, statuses],
  )

export const findMatchedPhotosMissingEmbedding = (modelName: string) =>
  many<CatPhotoRow>(
    `SELECT p.*
     FROM cat_photos p
     LEFT JOIN cat_photo_embeddings e ON e.photo_id = p.id AND e.model_name = $1
     WHERE p.is_cat = TRUE
       AND p.cat_id IS NOT NULL
       AND p.identification_status = 'matched'
       AND e.id IS NULL
     ORDER BY p.id ASC`,
    [modelName],
  )

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

  // Shift placement coordinates by 4.0 - 7.0 meters in a random direction
  // so the cat/bush model doesn't overlap exactly with the user avatar.
  const r = 4.0 + Math.random() * 3.0;
  const theta = Math.random() * Math.PI * 2;
  const latOffset = (r * Math.cos(theta)) / 111000;
  const lngOffset = (r * Math.sin(theta)) / (111000 * Math.cos((input.latitude) * Math.PI / 180));

  await upsertPlacement({
    catId: input.catId,
    sourceSightingId: sighting.id,
    latitude: input.latitude + latOffset,
    longitude: input.longitude + lngOffset,
    zoneId: input.zoneId ?? null
  })
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
    `SELECT cp.*, c.name, c.representative_photo_url, c.pattern, c.model_key
     FROM cat_placements cp
     JOIN cats c ON c.id = cp.cat_id
     WHERE c.status IN ('active', 'candidate')
     ORDER BY cp.updated_at DESC`,
  )

export const findCatActors = () =>
  many<CatPlacementRow>(
    `SELECT
       cp.*,
       c.name,
       c.representative_photo_url,
       c.pattern,
       c.model_key,
       z.name AS zone_name,
       z.type AS zone_type,
       z.model_type AS zone_model_type
     FROM cat_placements cp
     JOIN cats c ON c.id = cp.cat_id
     LEFT JOIN campus_zones z ON z.id = cp.zone_id
     WHERE c.status IN ('active', 'candidate')
     ORDER BY cp.updated_at DESC`,
  )

export const findZones = () => many<CampusZoneRow>('SELECT * FROM campus_zones ORDER BY id ASC')

export const createCandidate = (input: {
  photoId: number
  catId: number
  imageSimilarityScore: number
  locationScore: number
  recentSeenScore?: number | null
  patternScore?: number | null
  distanceMeters?: number | null
  finalScore: number
  rankOrder: number
}) =>
  run(
    `INSERT INTO cat_identification_candidates
      (photo_id, cat_id, image_similarity_score, location_score, recent_seen_score, pattern_score, distance_meters, final_score, rank_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.photoId,
      input.catId,
      input.imageSimilarityScore,
      input.locationScore,
      input.recentSeenScore ?? null,
      input.patternScore ?? null,
      input.distanceMeters ?? null,
      input.finalScore,
      input.rankOrder,
    ],
  )

export const findCandidatesByPhoto = (photoId: number) =>
  many<CatIdentificationCandidateRow>(
    `SELECT cic.*, c.name, c.representative_photo_url, c.pattern, c.last_seen_at
     FROM cat_identification_candidates cic
     JOIN cats c ON c.id = cic.cat_id
     WHERE cic.photo_id = $1
     ORDER BY cic.rank_order ASC`,
    [photoId],
  )

/** Most recent sighting per cat (for location/recency scoring). */
export const findLatestSightingByCatIds = (catIds: number[]) => {
  if (catIds.length === 0) return Promise.resolve([] as CatSightingRow[])
  return many<CatSightingRow>(
    `SELECT DISTINCT ON (cat_id) cat_id, latitude, longitude, zone_id, seen_at
     FROM cat_sightings
     WHERE cat_id = ANY($1::bigint[])
     ORDER BY cat_id, seen_at DESC`,
    [catIds],
  )
}

export const findCandidateCats = () =>
  many<CatRow>(
    `SELECT * FROM cats
     WHERE status = 'candidate'
     ORDER BY COALESCE(first_seen_at, created_at) DESC`,
  )

/** Promote a candidate cat to an official (active) cat. No-op if it is not a candidate. */
export const approveCandidateCat = (catId: number, input: { name?: string | null; pattern?: string | null; description?: string | null }) =>
  one<CatRow>(
    `UPDATE cats SET
       name = COALESCE($2, name),
       pattern = COALESCE($3, pattern),
       description = COALESCE($4, description),
       status = 'active',
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'candidate'
     RETURNING *`,
    [catId, input.name ?? null, input.pattern ?? null, input.description ?? null],
  )

/** Set the global (official) name of a cat. */
export const setCatName = (catId: number, name: string) =>
  one<CatRow>('UPDATE cats SET name = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *', [catId, name])

/** Set a user's private nickname for a cat they have collected. */
export const setCollectionCustomName = (userId: number, catId: number, customName: string | null) =>
  one<UserCatCollectionRow>(
    'UPDATE user_cat_collections SET custom_name = $3 WHERE user_id = $1 AND cat_id = $2 RETURNING *',
    [userId, catId, customName],
  )

/**
 * Fold a duplicate candidate cat into an existing target cat: reassign its photos,
 * sightings, embeddings and collections, then mark the source as merged.
 */
export const mergeCandidateCat = (sourceCatId: number, targetCatId: number) =>
  withTransaction(async (client) => {
    await client.query('UPDATE cat_photos SET cat_id = $2 WHERE cat_id = $1', [sourceCatId, targetCatId])
    await client.query('UPDATE cat_sightings SET cat_id = $2 WHERE cat_id = $1', [sourceCatId, targetCatId])
    await client.query('UPDATE cat_photo_embeddings SET cat_id = $2 WHERE cat_id = $1', [sourceCatId, targetCatId])

    // Merge collections, honoring the UNIQUE(user_id, cat_id) constraint.
    await client.query(
      `UPDATE user_cat_collections t SET
         first_discovered_at = LEAST(t.first_discovered_at, s.first_discovered_at),
         last_seen_at = GREATEST(COALESCE(t.last_seen_at, s.last_seen_at), COALESCE(s.last_seen_at, t.last_seen_at))
       FROM user_cat_collections s
       WHERE t.cat_id = $2 AND s.cat_id = $1 AND s.user_id = t.user_id`,
      [sourceCatId, targetCatId],
    )
    await client.query(
      'DELETE FROM user_cat_collections WHERE cat_id = $1 AND user_id IN (SELECT user_id FROM user_cat_collections WHERE cat_id = $2)',
      [sourceCatId, targetCatId],
    )
    await client.query('UPDATE user_cat_collections SET cat_id = $2 WHERE cat_id = $1', [sourceCatId, targetCatId])

    // Target keeps its own placement; drop the now-stale source placement.
    await client.query('DELETE FROM cat_placements WHERE cat_id = $1', [sourceCatId])
    await client.query("UPDATE cats SET status = 'merged', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [sourceCatId])
  })

export const findRankings = () =>
  many<{ user_id: number; nickname: string; discovered_count: string }>(
    `SELECT u.id AS user_id, u.nickname, COUNT(uc.cat_id) AS discovered_count
     FROM users u
     LEFT JOIN user_cat_collections uc ON uc.user_id = u.id
     GROUP BY u.id
     ORDER BY discovered_count DESC, u.created_at ASC`,
  )

export const nowIso = () => new Date().toISOString()
