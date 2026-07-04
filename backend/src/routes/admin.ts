import { Router } from 'express'
import { z } from 'zod'
import { createCat, findNewCatCandidates, updateCat } from '../db/repositories.js'
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
  status: z.enum(['active', 'hidden', 'inactive']).optional(),
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
    })
    if (!cat) throw new HttpError(404, '고양이를 찾을 수 없습니다.', 'NOT_FOUND')
    res.json(adminCat(cat))
  } catch (error) {
    next(error)
  }
})

adminRouter.get('/admin/cat-candidates', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    res.json({ candidates: (await findNewCatCandidates()).map(uploadedCandidate) })
  } catch (error) {
    next(error)
  }
})
