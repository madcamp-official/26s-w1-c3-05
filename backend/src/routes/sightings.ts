import { mkdirSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import multer from 'multer'
import { Router } from 'express'
import { z } from 'zod'
import {
  createCandidate,
  createPhoto,
  createSighting,
  findActiveCats,
  findCandidatesByPhoto,
  findCatById,
  findPhotoById,
  findSightingsByUser,
  nowIso,
  updatePhotoMatch,
  upsertCollection,
} from '../db/repositories.js'
import { getCurrentUser, requireAuth, type AuthRequest } from '../lib/auth.js'
import { findZoneId, locationScore } from '../lib/geo.js'
import { HttpError } from '../lib/httpError.js'
import { candidate, sighting } from '../lib/serializers.js'

export const sightingsRouter = Router()

const uploadDir = resolve(process.cwd(), 'uploads')
mkdirSync(uploadDir, { recursive: true })

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

sightingsRouter.post('/sightings', requireAuth, upload.single('image'), async (req: AuthRequest, res, next) => {
  try {
    const user = getCurrentUser(req)
    const body = z.object({
      latitude: z.coerce.number().min(-90).max(90),
      longitude: z.coerce.number().min(-180).max(180),
      catId: z.coerce.number().int().positive().optional(),
      isCat: z.coerce.boolean().optional(),
      forceConfirmation: z.coerce.boolean().optional(),
      imageUrl: z.string().url().optional(),
    }).parse(req.body)

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : body.imageUrl
    if (!imageUrl) throw new HttpError(400, 'image 파일이 필요합니다.', 'VALIDATION_ERROR')

    const isCat = body.isCat ?? true
    const zoneId = await findZoneId(body.latitude, body.longitude)
    const takenAt = nowIso()

    if (!isCat) {
      const photo = await createPhoto({
        userId: user.id,
        imageUrl,
        latitude: body.latitude,
        longitude: body.longitude,
        zoneId,
        takenAt,
        isCat: false,
        catDetectionConfidence: 0.05,
        isGalleryVisible: false,
        identificationStatus: 'rejected',
      })
      return res.status(201).json({ sightingId: String(photo.id), detectionStatus: 'rejected', cat: null, message: '고양이가 인식되지 않았습니다.' })
    }

    const match = await pickMockMatch(body.catId, body.latitude, body.longitude)
    const needsConfirmation = body.forceConfirmation || match.status === 'needs_user_confirmation'
    const status = needsConfirmation ? 'needs_user_confirmation' : match.status
    const photo = await createPhoto({
      userId: user.id,
      catId: status === 'matched' ? match.cat?.id ?? null : null,
      imageUrl,
      latitude: body.latitude,
      longitude: body.longitude,
      zoneId,
      takenAt,
      isCat: true,
      catDetectionConfidence: 0.94,
      catIdentificationConfidence: status === 'matched' ? match.bestScore : null,
      identificationStatus: status,
    })

    match.candidates.forEach((item, index) => {
      void createCandidate({
        photoId: photo.id,
        catId: item.cat.id,
        imageSimilarityScore: item.imageScore,
        locationScore: item.locationScoreValue,
        finalScore: item.finalScore,
        rankOrder: index + 1,
      })
    })

    if (status === 'new_cat_candidate') {
      return res.status(201).json({ sightingId: String(photo.id), detectionStatus: 'new_cat_candidate', cat: null, message: '새로운 고양이 후보로 등록되었습니다.' })
    }

    if (status === 'needs_user_confirmation') {
      return res.status(201).json({ detectionStatus: 'needs_user_confirmation', photoId: String(photo.id), candidates: (await findCandidatesByPhoto(photo.id)).map(candidate) })
    }

    const cat = match.cat!
    const createdSighting = await createSighting({ catId: cat.id, userId: user.id, photoId: photo.id, latitude: body.latitude, longitude: body.longitude, zoneId, seenAt: takenAt })
    const { isNew } = await upsertCollection({ userId: user.id, catId: cat.id, photoId: photo.id, seenAt: takenAt })
    res.status(201).json({
      sightingId: String(createdSighting.id),
      detectionStatus: 'matched',
      cat: { id: String(cat.id), name: cat.name, mainImageUrl: cat.representative_photo_url, isNewCollection: isNew },
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

    if (body.isNewCatCandidate || body.selectedCatId == null) {
      await updatePhotoMatch(photoId, { catId: null, status: 'new_cat_candidate' })
      return res.json({ detectionStatus: 'new_cat_candidate', photoId: String(photoId), cat: null, message: '새로운 고양이 후보로 등록되었습니다.' })
    }

    const selected = (await findCandidatesByPhoto(photoId)).find((item) => item.cat_id === body.selectedCatId)
    if (!selected) throw new HttpError(400, '후보 목록에 없는 고양이입니다.', 'VALIDATION_ERROR')
    const cat = await findCatById(selected.cat_id)
    if (!cat) throw new HttpError(404, '고양이를 찾을 수 없습니다.', 'NOT_FOUND')
    await updatePhotoMatch(photoId, { catId: cat.id, confidence: selected.final_score, status: 'matched' })
    const createdSighting = await createSighting({ catId: cat.id, userId: user.id, photoId, latitude: Number(photo.latitude), longitude: Number(photo.longitude), zoneId: photo.zone_id, seenAt: String(photo.taken_at) })
    const { isNew } = await upsertCollection({ userId: user.id, catId: cat.id, photoId, seenAt: String(photo.taken_at) })
    res.json({ detectionStatus: 'matched', photoId: String(photoId), sightingId: String(createdSighting.id), cat: { id: String(cat.id), name: cat.name, isNewCollection: isNew } })
  } catch (error) {
    next(error)
  }
})

const pickMockMatch = async (requestedCatId: number | undefined, latitude: number, longitude: number) => {
  const cats = await findActiveCats()
  if (cats.length === 0) return { status: 'new_cat_candidate' as const, cat: null, candidates: [], bestScore: 0 }

  const scored = cats.map((cat, index) => {
    const imageScore = requestedCatId === cat.id ? 0.96 : Math.max(0.62, 0.9 - index * 0.08)
    const distance = cat.default_latitude == null || cat.default_longitude == null ? null : Math.hypot((Number(cat.default_latitude) - latitude) * 111000, (Number(cat.default_longitude) - longitude) * 88800)
    const locationScoreValue = locationScore(distance)
    return { cat, imageScore, locationScoreValue, finalScore: Number((imageScore * 0.75 + locationScoreValue * 0.25).toFixed(4)) }
  }).sort((a, b) => b.finalScore - a.finalScore)

  const best = scored[0]
  const second = scored[1]
  if (!best || best.imageScore < 0.6) return { status: 'new_cat_candidate' as const, cat: null, candidates: [], bestScore: 0 }
  if (best.finalScore >= 0.8 && (!second || best.finalScore - second.finalScore >= 0.07)) {
    return { status: 'matched' as const, cat: best.cat, candidates: scored.slice(0, 3), bestScore: best.finalScore }
  }
  return { status: 'needs_user_confirmation' as const, cat: null, candidates: scored.slice(0, 3), bestScore: best.finalScore }
}
