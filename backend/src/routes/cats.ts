import { Router } from 'express'
import { z } from 'zod'
import {
  createBushClue,
  findActiveCats,
  findBushClue,
  findCatById,
  findCollectionItem,
  findSightingsByCat,
  setCatName,
  setCollectionCustomName,
} from '../db/repositories.js'
import { getCurrentUser, requireAuth, type AuthRequest } from '../lib/auth.js'
import { HttpError } from '../lib/httpError.js'
import { assetUrl, bushClue, catDetail, catListItem, catSighting } from '../lib/serializers.js'

export const catsRouter = Router()

// Name a cat you just discovered (candidate). The official name is set by an admin
// on approval; this lets the finder give the new cat its first name.
catsRouter.patch('/cats/:catId/name', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = getCurrentUser(req)
    const catId = z.coerce.number().int().positive().parse(req.params.catId)
    const body = z.object({ name: z.string().min(1).max(50) }).parse(req.body)

    const cat = await findCatById(catId)
    if (!cat) throw new HttpError(404, '고양이를 찾을 수 없습니다.', 'NOT_FOUND')
    if (cat.status !== 'candidate') throw new HttpError(400, '아직 확정되지 않은 후보 고양이만 이름을 지을 수 있습니다.', 'VALIDATION_ERROR')
    if (!(await findCollectionItem(user.id, catId))) throw new HttpError(403, '이 고양이를 발견한 사용자만 이름을 지을 수 있습니다.', 'FORBIDDEN')

    const updated = await setCatName(catId, body.name)
    res.json({
      cat: { id: String(catId), name: updated?.name ?? body.name, mainImageUrl: cat.representative_photo_url, status: cat.status, isNewCollection: true },
      message: '고양이 이름이 저장되었습니다.',
    })
  } catch (error) {
    next(error)
  }
})

// Private per-user nickname; does not touch the official cats.name.
catsRouter.patch('/cats/:catId/nickname', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = getCurrentUser(req)
    const catId = z.coerce.number().int().positive().parse(req.params.catId)
    const body = z.object({ customName: z.string().min(1).max(50).nullable() }).parse(req.body)

    const updated = await setCollectionCustomName(user.id, catId, body.customName)
    if (!updated) throw new HttpError(404, '도감에 등록된 고양이가 아닙니다.', 'NOT_FOUND')
    res.json({ catId: String(catId), customName: updated.custom_name, message: '별명이 저장되었습니다.' })
  } catch (error) {
    next(error)
  }
})

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
    if (!cat || (cat.status !== 'active' && cat.status !== 'candidate')) throw new HttpError(404, '고양이를 찾을 수 없습니다.', 'NOT_FOUND')
    res.json(catDetail(cat, await findCollectionItem(user.id, cat.id)))
  } catch (error) {
    next(error)
  }
})

// 덤불(=아직 도감에 없는 고양이)을 눌렀을 때 주는 사진 조각 힌트. 조각은 (user, cat)당
// 한 번만 랜덤으로 뽑혀 저장되고, 같은 덤불을 다시 눌러도 같은 조각이 반환된다.
catsRouter.post('/cats/:catId/bush-clue', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = getCurrentUser(req)
    const catId = z.coerce.number().int().positive().parse(req.params.catId)

    const cat = await findCatById(catId)
    if (!cat || (cat.status !== 'active' && cat.status !== 'candidate')) throw new HttpError(404, '고양이를 찾을 수 없습니다.', 'NOT_FOUND')
    if (await findCollectionItem(user.id, catId)) throw new HttpError(400, '이미 도감에 등록된 고양이입니다.', 'ALREADY_DISCOVERED')

    let clue = await findBushClue(user.id, catId)
    if (!clue) {
      // 정사각형 조각 하나(전체 사진의 40~60% 크기)를 사진 안 랜덤 위치에서 오려낸다.
      const size = 0.4 + Math.random() * 0.2
      const cropX = Math.random() * (1 - size)
      const cropY = Math.random() * (1 - size)
      clue = await createBushClue({ userId: user.id, catId, cropX, cropY, cropSize: size })
    }

    res.json({
      message: '모르는 고양이예요. 이 주변에 있을지도 모르니 찾아보세요!',
      ...bushClue(clue, assetUrl(cat.representative_photo_url)),
    })
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
