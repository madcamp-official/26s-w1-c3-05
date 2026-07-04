import { Router } from 'express'
import { z } from 'zod'
import { approveCandidateCat, createCat, findCandidateCats, findCatById, mergeCandidateCat, updateCat } from '../db/repositories.js'
import { requireAdmin, requireAuth } from '../lib/auth.js'
import { HttpError } from '../lib/httpError.js'
import { adminCat, uploadedCandidate } from '../lib/serializers.js'

export const adminRouter = Router()

const catBody = z.object({
  name: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  mainImageUrl: z.string().url().nullable().optional(),
  pattern: z.string().nullable().optional(),
  personality: z.string().nullable().optional(),
  defaultLatitude: z.number().min(-90).max(90).nullable().optional(),
  defaultLongitude: z.number().min(-180).max(180).nullable().optional(),
  status: z.enum(['active', 'candidate', 'merged', 'hidden', 'inactive']).optional(),
  modelKey: z.string().max(40).nullable().optional(),
})

adminRouter.post('/admin/cats', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const body = catBody.parse(req.body)
    const cat = await createCat({
      name: body.name,
      description: body.description,
      representativePhotoUrl: body.mainImageUrl,
      pattern: body.pattern,
      personality: body.personality,
      defaultLatitude: body.defaultLatitude,
      defaultLongitude: body.defaultLongitude,
      status: body.status,
      modelKey: body.modelKey,
    })
    res.status(201).json(adminCat(cat))
  } catch (error) {
    next(error)
  }
})

adminRouter.patch('/admin/cats/:catId', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const catId = z.coerce.number().int().positive().parse(req.params.catId)
    const body = catBody.parse(req.body)
    const cat = await updateCat(catId, {
      name: body.name,
      description: body.description,
      representative_photo_url: body.mainImageUrl,
      pattern: body.pattern,
      personality: body.personality,
      default_latitude: body.defaultLatitude,
      default_longitude: body.defaultLongitude,
      status: body.status,
      model_key: body.modelKey,
    })
    if (!cat) throw new HttpError(404, '고양이를 찾을 수 없습니다.', 'NOT_FOUND')
    res.json(adminCat(cat))
  } catch (error) {
    next(error)
  }
})

adminRouter.get('/admin/cat-candidates', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    res.json({ candidates: (await findCandidateCats()).map(uploadedCandidate) })
  } catch (error) {
    next(error)
  }
})

adminRouter.post('/admin/cat-candidates/:catId/approve', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const catId = z.coerce.number().int().positive().parse(req.params.catId)
    const body = z.object({
      officialName: z.string().min(1).max(50).optional(),
      pattern: z.string().max(30).nullable().optional(),
      description: z.string().nullable().optional(),
    }).parse(req.body)

    const cat = await findCatById(catId)
    if (!cat) throw new HttpError(404, '고양이를 찾을 수 없습니다.', 'NOT_FOUND')
    if (cat.status !== 'candidate') throw new HttpError(400, '후보 상태의 고양이가 아닙니다.', 'VALIDATION_ERROR')

    const approved = await approveCandidateCat(catId, { name: body.officialName, pattern: body.pattern, description: body.description })
    if (!approved) throw new HttpError(409, '이미 처리된 후보입니다.', 'CONFLICT')
    res.json({ cat: adminCat(approved), message: '새 고양이가 공식 등록되었습니다.' })
  } catch (error) {
    next(error)
  }
})

adminRouter.post('/admin/cat-candidates/:catId/merge', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const catId = z.coerce.number().int().positive().parse(req.params.catId)
    const body = z.object({ targetCatId: z.coerce.number().int().positive() }).parse(req.body)
    if (body.targetCatId === catId) throw new HttpError(400, '자기 자신과 병합할 수 없습니다.', 'VALIDATION_ERROR')

    const source = await findCatById(catId)
    if (!source) throw new HttpError(404, '후보 고양이를 찾을 수 없습니다.', 'NOT_FOUND')
    if (source.status !== 'candidate') throw new HttpError(400, '후보 상태의 고양이가 아닙니다.', 'VALIDATION_ERROR')

    const target = await findCatById(body.targetCatId)
    if (!target) throw new HttpError(404, '대상 고양이를 찾을 수 없습니다.', 'NOT_FOUND')
    if (target.status === 'merged') throw new HttpError(400, '이미 병합된 고양이에는 병합할 수 없습니다.', 'VALIDATION_ERROR')

    await mergeCandidateCat(catId, body.targetCatId)
    res.json({ sourceCatId: String(catId), targetCatId: String(body.targetCatId), message: '기존 고양이와 병합되었습니다.' })
  } catch (error) {
    next(error)
  }
})
