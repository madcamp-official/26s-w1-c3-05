import { Router } from 'express'
import { z } from 'zod'
import { findCatActors, findCollectionItem, findPlacements, findZones } from '../db/repositories.js'
import { getCurrentUser, requireAuth, type AuthRequest } from '../lib/auth.js'
import { distanceMeters } from '../lib/geo.js'
import { catActor, mapCat, mapObject } from '../lib/serializers.js'

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

mapRouter.get('/map/objects', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const query = z.object({
      lat: z.coerce.number().min(-90).max(90),
      lng: z.coerce.number().min(-180).max(180),
      // Cat towers sit at fixed building coordinates rather than being picked from
      // a nearby-distance band, so this is just "what's within camera view" —
      // the frontend passes the ground radius visible at max pinch-out zoom.
      radius: z.coerce.number().positive().default(300),
      // Safety cap only; the actual object count is small and fixed (curated
      // building placements), not sampled down to fit a UI limit.
      limit: z.coerce.number().int().positive().max(200).default(200),
      modelType: z.string().max(50).default('building'),
    }).parse(req.query)

    const origin = { latitude: query.lat, longitude: query.lng }
    const objects = (await findZones())
      .filter((zone) => zone.model_type === query.modelType)
      .map((zone) => ({
        zone,
        distance: distanceMeters(origin, { latitude: Number(zone.latitude), longitude: Number(zone.longitude) }),
      }))
      .filter((item) => item.distance <= query.radius)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, query.limit)
      .map((item) => mapObject(item.zone, item.distance))

    res.json({ objects })
  } catch (error) {
    next(error)
  }
})

mapRouter.get('/map/cat-actors', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = getCurrentUser(req)
    const query = z.object({
      lat: z.coerce.number().min(-90).max(90),
      lng: z.coerce.number().min(-180).max(180),
      radius: z.coerce.number().positive().default(500),
      limit: z.coerce.number().int().positive().max(100).default(30),
      includeUndiscovered: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
    }).parse(req.query)

    const origin = { latitude: query.lat, longitude: query.lng }
    const actors = await Promise.all((await findCatActors())
      .map(async (placement) => ({
        placement,
        distance: distanceMeters(origin, { latitude: Number(placement.latitude), longitude: Number(placement.longitude) }),
        isDiscovered: Boolean(await findCollectionItem(user.id, placement.cat_id)),
      })))

    res.json({
      cats: actors
        .filter((item) => item.distance <= query.radius)
        .filter((item) => query.includeUndiscovered || item.isDiscovered)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, query.limit)
        .map((item) => catActor(item.placement, item.isDiscovered, item.distance)),
    })
  } catch (error) {
    next(error)
  }
})
