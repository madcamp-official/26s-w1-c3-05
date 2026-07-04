import { Router } from 'express'
import { z } from 'zod'
import { findCatById, findGalleryPhotos } from '../db/repositories.js'
import { getCurrentUser, requireAuth, type AuthRequest } from '../lib/auth.js'
import { HttpError } from '../lib/httpError.js'
import { galleryPhoto } from '../lib/serializers.js'

export const galleryRouter = Router()

const querySchema = z.object({
  catId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

galleryRouter.get('/gallery/me', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = getCurrentUser(req)
    const query = querySchema.parse(req.query)
    const { rows, total } = await findGalleryPhotos({ userId: user.id, catId: query.catId, limit: query.limit, offset: (query.page - 1) * query.limit })
    res.json({
      photos: rows.map(galleryPhoto),
      pagination: { page: query.page, limit: query.limit, totalCount: total, totalPages: Math.ceil(total / query.limit) },
    })
  } catch (error) {
    next(error)
  }
})

galleryRouter.get('/gallery/me/cats/:catId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = getCurrentUser(req)
    const catId = z.coerce.number().int().positive().parse(req.params.catId)
    const query = querySchema.omit({ catId: true }).parse(req.query)
    const cat = await findCatById(catId)
    if (!cat) throw new HttpError(404, '고양이를 찾을 수 없습니다.', 'NOT_FOUND')
    const { rows, total } = await findGalleryPhotos({ userId: user.id, catId, limit: query.limit, offset: (query.page - 1) * query.limit })
    res.json({
      cat: { id: String(cat.id), name: cat.name, mainImageUrl: cat.representative_photo_url },
      photos: rows.map((photo) => ({
        sightingId: String(photo.id),
        imageUrl: photo.image_url,
        latitude: photo.latitude,
        longitude: photo.longitude,
        takenAt: photo.taken_at,
        isRepresentative: Boolean(photo.is_representative),
      })),
      pagination: { page: query.page, limit: query.limit, totalCount: total, totalPages: Math.ceil(total / query.limit) },
    })
  } catch (error) {
    next(error)
  }
})
