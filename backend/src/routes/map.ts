import { Router } from 'express'
import { z } from 'zod'
import { findCollectionItem, findPlacements } from '../db/repositories.js'
import { getCurrentUser, requireAuth, type AuthRequest } from '../lib/auth.js'
import { distanceMeters } from '../lib/geo.js'
import { mapCat } from '../lib/serializers.js'

export const mapRouter = Router()

mapRouter.get('/map/cats', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = getCurrentUser(req)
    const query = z.object({
      lat: z.coerce.number().min(-90).max(90),
      lng: z.coerce.number().min(-180).max(180),
      radius: z.coerce.number().positive().default(500),
    }).parse(req.query)
    const cats = await Promise.all((await findPlacements())
      .filter((placement) => distanceMeters({ latitude: query.lat, longitude: query.lng }, { latitude: Number(placement.latitude), longitude: Number(placement.longitude) }) <= query.radius)
      .map(async (placement) => mapCat(placement, Boolean(await findCollectionItem(user.id, placement.cat_id)))))
    res.json({ cats })
  } catch (error) {
    next(error)
  }
})
