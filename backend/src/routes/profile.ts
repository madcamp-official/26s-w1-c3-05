import { Router } from 'express'
import { z } from 'zod'
import { findCollection, findGalleryPhotos, updateUserProfile } from '../db/repositories.js'
import { getCurrentUser, requireAuth, type AuthRequest } from '../lib/auth.js'
import { publicUser } from '../lib/serializers.js'

export const profileRouter = Router()

profileRouter.get('/profile/me', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = getCurrentUser(req)
    const discoveredCount = (await findCollection(user.id)).length
    const sightingCount = (await findGalleryPhotos({ userId: user.id, limit: 1, offset: 0 })).total
    res.json({ ...publicUser(user), discoveredCount, sightingCount, createdAt: user.created_at })
  } catch (error) {
    next(error)
  }
})

profileRouter.patch('/profile/me', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = getCurrentUser(req)
    const body = z.object({ nickname: z.string().min(1).max(50).optional(), profileImageUrl: z.string().url().nullable().optional() }).parse(req.body)
    const updated = (await updateUserProfile(user.id, body))!
    res.json(publicUser(updated))
  } catch (error) {
    next(error)
  }
})
