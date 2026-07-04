import { Router } from 'express'
import { z } from 'zod'
import { findCatById, findCollection, setFavorite, upsertCollection } from '../db/repositories.js'
import { getCurrentUser, requireAuth, type AuthRequest } from '../lib/auth.js'
import { HttpError } from '../lib/httpError.js'
import { collectionCat } from '../lib/serializers.js'

export const collectionRouter = Router()

collectionRouter.get('/collection', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = getCurrentUser(req)
    res.json({ cats: (await findCollection(user.id)).map(collectionCat) })
  } catch (error) {
    next(error)
  }
})

collectionRouter.post('/collection', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = getCurrentUser(req)
    const body = z.object({ catId: z.coerce.number().int().positive(), sightingId: z.union([z.string(), z.number()]).optional() }).parse(req.body)
    const cat = await findCatById(body.catId)
    if (!cat) throw new HttpError(404, '고양이를 찾을 수 없습니다.', 'NOT_FOUND')
    const { item } = await upsertCollection({ userId: user.id, catId: body.catId })
    res.status(201).json({
      message: '도감에 등록되었습니다.',
      cat: {
        id: String(cat.id),
        name: cat.name,
        mainImageUrl: cat.representative_photo_url,
        discoveredAt: item.first_discovered_at,
      },
    })
  } catch (error) {
    next(error)
  }
})

collectionRouter.patch('/collection/:catId/favorite', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = getCurrentUser(req)
    const catId = z.coerce.number().int().positive().parse(req.params.catId)
    const body = z.object({ isFavorite: z.boolean() }).parse(req.body)
    const item = await setFavorite(user.id, catId, body.isFavorite)
    if (!item) throw new HttpError(404, '도감에 등록된 고양이가 아닙니다.', 'NOT_FOUND')
    res.json({ catId: String(catId), isFavorite: Boolean(item.is_favorite) })
  } catch (error) {
    next(error)
  }
})
