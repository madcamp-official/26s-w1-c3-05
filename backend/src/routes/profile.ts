import { mkdirSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import multer from 'multer'
import { Router } from 'express'
import { z } from 'zod'
import { findCollection, findGalleryPhotos, updateUserProfile } from '../db/repositories.js'
import { getCurrentUser, requireAuth, type AuthRequest } from '../lib/auth.js'
import { HttpError } from '../lib/httpError.js'
import { publicUser } from '../lib/serializers.js'

export const profileRouter = Router()

// 프로필 사진은 갤러리 사진(/uploads/*)과 같은 디렉터리에 저장한다 — server.ts가
// 이미 /uploads를 정적 서빙하고 CORP 헤더도 붙여준다.
const uploadDir = resolve(process.cwd(), 'uploads')
mkdirSync(uploadDir, { recursive: true })

const profileImageUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => cb(null, `profile-${Date.now()}-${Math.random().toString(36).slice(2)}${extname(file.originalname) || '.jpg'}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return cb(new HttpError(400, '지원하지 않는 이미지 형식입니다.', 'VALIDATION_ERROR'))
    }
    cb(null, true)
  },
})

const profileImageUrlSchema = z
  .string()
  .refine((value) => {
    if (value.startsWith('/uploads/')) return true
    try {
      const url = new URL(value)
      return ['http:', 'https:'].includes(url.protocol)
    } catch {
      return false
    }
  }, 'profileImageUrl must be an http(s) URL or an /uploads path')

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
    const body = z.object({ nickname: z.string().min(1).max(50).optional(), profileImageUrl: profileImageUrlSchema.nullable().optional() }).parse(req.body)
    const updated = (await updateUserProfile(user.id, body))!
    res.json(publicUser(updated))
  } catch (error) {
    next(error)
  }
})

// 기기에서 고른 사진을 프로필 이미지로 올린다. 갤러리 사진 중에서 고르는 기존 방식
// (PATCH /profile/me { profileImageUrl })과 별개로, 임의의 사진을 쓸 수 있게 한다.
profileRouter.post('/profile/me/image', requireAuth, profileImageUpload.single('image'), async (req: AuthRequest, res, next) => {
  try {
    if (!req.file) throw new HttpError(400, '이미지 파일이 필요합니다.', 'VALIDATION_ERROR')
    const user = getCurrentUser(req)
    const updated = (await updateUserProfile(user.id, { profileImageUrl: `/uploads/${req.file.filename}` }))!
    res.status(201).json(publicUser(updated))
  } catch (error) {
    next(error)
  }
})
