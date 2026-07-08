import { mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import multer from 'multer'
import { Router } from 'express'
import { z } from 'zod'
import {
  createCandidate,
  createCandidateCatFromPhoto,
  createPhoto,
  createSighting,
  findCandidatesByPhoto,
  findCatById,
  findPhotoById,
  findSightingsByUser,
  insertEmbedding,
  nowIso,
  setCatModelKeyIfNull,
  setEmbeddingCatForPhoto,
  updatePhotoMatch,
  upsertCollection,
  findPlacementByCatId,
} from '../db/repositories.js'
import { getCurrentUser, requireAuth, type AuthRequest } from '../lib/auth.js'
import { resolveModelKey } from '../lib/catModels.js'
import { findZoneId, distanceMeters } from '../lib/geo.js'
import { HttpError } from '../lib/httpError.js'
import { assetUrl, candidate, sighting } from '../lib/serializers.js'
import { catVisionService } from '../services/catVision/index.js'
import type { CatVisionResult } from '../services/catVision/types.js'

export const sightingsRouter = Router()

// z.coerce.boolean() is Boolean(value) under the hood, so multipart/query string
// fields like "false" coerce to true. Parse "true"/"false" text explicitly instead.
const booleanish = z.preprocess((value) => (typeof value === 'string' ? value.toLowerCase() === 'true' : value), z.boolean())

const uploadDir = resolve(process.cwd(), 'uploads')
const cropDir = join(uploadDir, 'crops')
mkdirSync(cropDir, { recursive: true })

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${extname(file.originalname) || '.jpg'}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return cb(new HttpError(400, '지원하지 않는 이미지 형식입니다.', 'VALIDATION_ERROR'))
    cb(null, true)
  },
})

const newCatResponse = (input: {
  photoId: number
  sightingId: number
  cat: { id: number; name: string | null; representative_photo_url: string | null; status: string }
  isNewCollection: boolean
  placement: { latitude: number; longitude: number }
}) => ({
  photoId: String(input.photoId),
  sightingId: String(input.sightingId),
  detectionStatus: 'new_cat_candidate',
  requiresUserConfirmation: false,
  cat: {
    id: String(input.cat.id),
    name: input.cat.name,
    mainImageUrl: assetUrl(input.cat.representative_photo_url),
    isNewCollection: input.isNewCollection,
    status: input.cat.status,
  },
  placement: input.placement,
  message: '새로운 고양이로 등록되었습니다.',
})

// Decode the vision service crop (a JPEG data URL) into a served file.
const persistCropImage = async (dataUrl: string | null): Promise<string | null> => {
  if (!dataUrl) return null
  const match = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(dataUrl)
  if (!match) return null
  const extension = match[1].toLowerCase().startsWith('jp') ? 'jpg' : match[1].toLowerCase()
  const filename = `crop-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`
  await writeFile(join(cropDir, filename), Buffer.from(match[2], 'base64'))
  return `/uploads/crops/${filename}`
}

// Store the query embedding so this photo becomes a reference for future matches.
const persistEmbedding = async (photoId: number, catId: number | null, result: CatVisionResult, cropImageUrl: string | null) => {
  if (!result.embedding || result.embedding.length === 0) return
  await insertEmbedding({
    photoId,
    catId,
    modelName: result.modelName ?? 'unknown',
    embedding: result.embedding,
    cropImageUrl,
    qualityScore: result.qualityScore,
  })
}

sightingsRouter.post('/sightings', requireAuth, upload.single('image'), async (req: AuthRequest, res, next) => {
  try {
    const user = getCurrentUser(req)
    const body = z.object({
      latitude: z.coerce.number().min(-90).max(90),
      longitude: z.coerce.number().min(-180).max(180),
      catId: z.coerce.number().int().positive().optional(),
      isCat: booleanish.optional(),
      forceConfirmation: booleanish.optional(),
      imageUrl: z.string().url().optional(),
      captureMode: z.enum(['real_camera', 'virtual_3d']).optional().default('real_camera'),
    }).parse(req.body)

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : body.imageUrl
    if (!imageUrl) throw new HttpError(400, 'image 파일이 필요합니다.', 'VALIDATION_ERROR')

    const zoneId = await findZoneId(body.latitude, body.longitude)
    const takenAt = nowIso()

    if (body.captureMode === 'virtual_3d') {
      const catId = body.catId ? Number(body.catId) : null
      if (!catId) {
        throw new HttpError(400, '3D 가상 카메라 촬영 시 고양이 ID(catId)는 필수입니다.', 'VALIDATION_ERROR')
      }

      const cat = await findCatById(catId)
      if (!cat) {
        throw new HttpError(404, '지정된 고양이를 찾을 수 없습니다.', 'NOT_FOUND')
      }

      const placement = await findPlacementByCatId(catId)
      if (!placement) {
        throw new HttpError(400, '현재 월드에 배치되지 않은 고양이입니다.', 'VALIDATION_ERROR')
      }

      const dist = distanceMeters(
        { latitude: body.latitude, longitude: body.longitude },
        { latitude: Number(placement.latitude), longitude: Number(placement.longitude) }
      )
      if (dist > 100) {
        throw new HttpError(400, '고양이가 너무 멀리 있어 촬영할 수 없습니다.', 'VALIDATION_ERROR')
      }

      const photo = await createPhoto({
        userId: user.id,
        catId: cat.id,
        imageUrl,
        latitude: body.latitude,
        longitude: body.longitude,
        zoneId,
        takenAt,
        isCat: true,
        isGalleryVisible: true,
        identificationStatus: 'matched',
        captureSource: 'virtual_3d',
      })

      const createdSighting = await createSighting({
        catId: cat.id,
        userId: user.id,
        photoId: photo.id,
        latitude: body.latitude,
        longitude: body.longitude,
        zoneId,
        seenAt: takenAt,
        // 3D 카메라는 월드에 이미 서 있는 고양이를 찍은 것이다. 랜덤 재배치를 하면
        // 찍을 때마다 고양이가 6~10m씩 순간이동한다.
        placement: { latitude: Number(placement.latitude), longitude: Number(placement.longitude) },
      })

      const { isNew } = await upsertCollection({
        userId: user.id,
        catId: cat.id,
        photoId: photo.id,
        seenAt: takenAt,
      })

      await setCatModelKeyIfNull(cat.id, resolveModelKey(cat, 'orange'))

      return res.status(201).json({
        photoId: String(photo.id),
        sightingId: String(createdSighting.id),
        detectionStatus: 'matched',
        cat: {
          id: String(cat.id),
          name: cat.name,
          mainImageUrl: assetUrl(cat.representative_photo_url),
          isNewCollection: isNew,
        },
        placement: {
          latitude: createdSighting.placementLatitude,
          longitude: createdSighting.placementLongitude,
        },
      })
    }
    const result = await catVisionService.analyze({
      imageUrl,
      latitude: body.latitude,
      longitude: body.longitude,
      requestedCatId: body.catId,
      isCatOverride: body.isCat,
      forceConfirmation: body.forceConfirmation,
    })

    if (!result.isCat) {
      const photo = await createPhoto({
        userId: user.id,
        imageUrl,
        latitude: body.latitude,
        longitude: body.longitude,
        zoneId,
        takenAt,
        isCat: false,
        catDetectionConfidence: result.catDetectionConfidence,
        isGalleryVisible: false,
        identificationStatus: 'rejected',
      })
      return res.status(201).json({
        photoId: String(photo.id),
        sightingId: null,
        detectionStatus: 'rejected',
        cat: null,
        message: '고양이가 인식되지 않았습니다.',
        debug: { catDetectionConfidence: result.catDetectionConfidence },
      })
    }

    const cropImageUrl = await persistCropImage(result.cropImageDataUrl)

    if (result.status === 'low_quality') {
      const photo = await createPhoto({
        userId: user.id,
        imageUrl,
        latitude: body.latitude,
        longitude: body.longitude,
        zoneId,
        takenAt,
        isCat: true,
        catDetectionConfidence: result.catDetectionConfidence,
        isGalleryVisible: false,
        identificationStatus: 'low_quality',
        cropImageUrl,
        detectionBbox: result.bbox,
        qualityScore: result.qualityScore,
      })
      await persistEmbedding(photo.id, null, result, cropImageUrl)
      return res.status(201).json({
        photoId: String(photo.id),
        sightingId: null,
        detectionStatus: 'low_quality',
        cat: null,
        message: '고양이는 감지되었지만 사진이 흐리거나 너무 작아 식별하기 어렵습니다.',
        quality: { reason: result.qualityReason, qualityScore: result.qualityScore },
      })
    }

    const matchedCatId = result.status === 'matched' ? result.matchedCat?.id ?? null : null
    const photo = await createPhoto({
      userId: user.id,
      catId: matchedCatId,
      imageUrl,
      latitude: body.latitude,
      longitude: body.longitude,
      zoneId,
      takenAt,
      isCat: true,
      catDetectionConfidence: result.catDetectionConfidence,
      catIdentificationConfidence: result.status === 'matched' ? result.bestScore : null,
      identificationStatus: result.status,
      cropImageUrl,
      detectionBbox: result.bbox,
      qualityScore: result.qualityScore,
    })

    await persistEmbedding(photo.id, matchedCatId, result, cropImageUrl)

    await Promise.all(result.candidates.map((item, index) =>
      createCandidate({
        photoId: photo.id,
        catId: item.cat.id,
        imageSimilarityScore: item.imageSimilarityScore,
        locationScore: item.locationScore,
        recentSeenScore: item.recentSeenScore,
        patternScore: item.patternScore,
        distanceMeters: item.distanceMeters,
        finalScore: item.finalScore,
        rankOrder: index + 1,
      }),
    ))

    if (result.status === 'new_cat_candidate') {
      const created = await createCandidateCatFromPhoto({
        userId: user.id,
        photoId: photo.id,
        imageUrl,
        latitude: body.latitude,
        longitude: body.longitude,
        zoneId,
        takenAt,
        confidence: result.bestScore,
      })
      await setEmbeddingCatForPhoto(photo.id, created.cat.id)
      await setCatModelKeyIfNull(created.cat.id, resolveModelKey(created.cat, result.dominantColor))
      return res.status(201).json(newCatResponse({
        photoId: photo.id,
        sightingId: created.sighting.id,
        cat: created.cat,
        isNewCollection: created.collection.isNew,
        placement: { latitude: created.sighting.placementLatitude, longitude: created.sighting.placementLongitude },
      }))
    }

    if (result.status === 'needs_user_confirmation') {
      return res.status(201).json({
        detectionStatus: 'needs_user_confirmation',
        requiresUserConfirmation: true,
        photoId: String(photo.id),
        cat: null,
        candidates: (await findCandidatesByPhoto(photo.id)).map(candidate),
        newCatOption: { enabled: true, label: '처음 보는 고양이 같아요' },
        message: '비슷한 고양이를 찾았어요. 어떤 고양이인지 선택해주세요.',
      })
    }

    const cat = result.matchedCat!
    const createdSighting = await createSighting({ catId: cat.id, userId: user.id, photoId: photo.id, latitude: body.latitude, longitude: body.longitude, zoneId, seenAt: takenAt })
    const { isNew } = await upsertCollection({ userId: user.id, catId: cat.id, photoId: photo.id, seenAt: takenAt })
    await setCatModelKeyIfNull(cat.id, resolveModelKey(cat, result.dominantColor))
    res.status(201).json({
      photoId: String(photo.id),
      sightingId: String(createdSighting.id),
      detectionStatus: 'matched',
      cat: { id: String(cat.id), name: cat.name, mainImageUrl: assetUrl(cat.representative_photo_url), isNewCollection: isNew },
      placement: { latitude: createdSighting.placementLatitude, longitude: createdSighting.placementLongitude },
    })
  } catch (error) {
    next(error)
  }
})

sightingsRouter.get('/sightings/me', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = getCurrentUser(req)
    res.json({ sightings: (await findSightingsByUser(user.id)).map(sighting) })
  } catch (error) {
    next(error)
  }
})

sightingsRouter.post('/sightings/:photoId/confirm-cat', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = getCurrentUser(req)
    const photoId = z.coerce.number().int().positive().parse(req.params.photoId)
    const body = z.object({ selectedCatId: z.coerce.number().int().positive().nullable(), isNewCatCandidate: z.boolean().optional() }).parse(req.body)
    const photo = await findPhotoById(photoId)
    if (!photo || photo.user_id !== user.id) throw new HttpError(404, '사진을 찾을 수 없습니다.', 'NOT_FOUND')
    if (photo.identification_status !== 'needs_user_confirmation') throw new HttpError(400, '후보 선택이 필요한 사진이 아닙니다.', 'VALIDATION_ERROR')

    // pg returns TIMESTAMPTZ columns as Date objects; normalize to ISO for re-insertion.
    const takenAt = new Date(photo.taken_at).toISOString()

    if (body.isNewCatCandidate || body.selectedCatId == null) {
      const created = await createCandidateCatFromPhoto({
        userId: user.id,
        photoId,
        imageUrl: photo.image_url,
        latitude: Number(photo.latitude),
        longitude: Number(photo.longitude),
        zoneId: photo.zone_id,
        takenAt,
        confidence: photo.cat_identification_confidence,
      })
      await setEmbeddingCatForPhoto(photoId, created.cat.id)
      await setCatModelKeyIfNull(created.cat.id, resolveModelKey(created.cat, null))
      return res.json(newCatResponse({
        photoId,
        sightingId: created.sighting.id,
        cat: created.cat,
        isNewCollection: created.collection.isNew,
        placement: { latitude: created.sighting.placementLatitude, longitude: created.sighting.placementLongitude },
      }))
    }

    const selected = (await findCandidatesByPhoto(photoId)).find((item) => item.cat_id === body.selectedCatId)
    if (!selected) throw new HttpError(400, '후보 목록에 없는 고양이입니다.', 'VALIDATION_ERROR')
    const cat = await findCatById(selected.cat_id)
    if (!cat) throw new HttpError(404, '고양이를 찾을 수 없습니다.', 'NOT_FOUND')
    await updatePhotoMatch(photoId, { catId: cat.id, confidence: selected.final_score, status: 'matched' })
    await setEmbeddingCatForPhoto(photoId, cat.id)
    await setCatModelKeyIfNull(cat.id, resolveModelKey(cat, null))
    const createdSighting = await createSighting({ catId: cat.id, userId: user.id, photoId, latitude: Number(photo.latitude), longitude: Number(photo.longitude), zoneId: photo.zone_id, seenAt: takenAt })
    const { isNew } = await upsertCollection({ userId: user.id, catId: cat.id, photoId, seenAt: takenAt })
    res.json({
      detectionStatus: 'matched',
      photoId: String(photoId),
      sightingId: String(createdSighting.id),
      cat: { id: String(cat.id), name: cat.name, isNewCollection: isNew },
      placement: { latitude: createdSighting.placementLatitude, longitude: createdSighting.placementLongitude },
    })
  } catch (error) {
    next(error)
  }
})
