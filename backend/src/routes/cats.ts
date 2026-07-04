import { Router } from 'express'
import { z } from 'zod'
import { findActiveCats, findCatById, findCollectionItem, findSightingsByCat } from '../db/repositories.js'
import { getCurrentUser, requireAuth, type AuthRequest } from '../lib/auth.js'
import { HttpError } from '../lib/httpError.js'
import { catDetail, catListItem, catSighting } from '../lib/serializers.js'

export const catsRouter = Router()

catsRouter.get('/cats', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = getCurrentUser(req)
    const cats = await Promise.all((await findActiveCats()).map(async (cat) => catListItem(cat, Boolean(await findCollectionItem(user.id, cat.id)))))
    res.json({ cats })
  } catch (error) {
    next(error)
  }
})

catsRouter.get('/cats/:catId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = getCurrentUser(req)
    const catId = z.coerce.number().int().positive().parse(req.params.catId)
    const cat = await findCatById(catId)
    if (!cat || cat.status !== 'active') throw new HttpError(404, '고양이를 찾을 수 없습니다.', 'NOT_FOUND')
    res.json(catDetail(cat, await findCollectionItem(user.id, cat.id)))
  } catch (error) {
    next(error)
  }
})

catsRouter.get('/cats/:catId/sightings', requireAuth, async (req, res, next) => {
  try {
    const catId = z.coerce.number().int().positive().parse(req.params.catId)
    const cat = await findCatById(catId)
    if (!cat) throw new HttpError(404, '고양이를 찾을 수 없습니다.', 'NOT_FOUND')
    res.json({ sightings: (await findSightingsByCat(catId)).map(catSighting) })
  } catch (error) {
    next(error)
  }
})
