import bcrypt from 'bcryptjs'
import { OAuth2Client } from 'google-auth-library'
import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { createOAuthUser, createUser, findUserByOAuthIdentity, findUserByUsername, toPublicUser } from '../db/repositories.js'
import { getCurrentUser, requireAuth, signAccessToken, type AuthRequest } from '../lib/auth.js'
import { HttpError } from '../lib/httpError.js'

export const authRouter = Router()
const googleOAuthClient = new OAuth2Client()

const signupSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(100),
  nickname: z.string().min(1).max(50),
})

const googleLoginSchema = z.object({
  idToken: z.string().min(1),
})

const kakaoLoginSchema = z.object({
  accessToken: z.string().min(1),
})

interface KakaoUserResponse {
  id?: number | string
  properties?: {
    nickname?: string
    profile_image?: string
    thumbnail_image?: string
  }
  kakao_account?: {
    email?: string
    profile?: {
      nickname?: string
      profile_image_url?: string
      thumbnail_image_url?: string
    }
  }
}

const getGoogleClientIds = () =>
  (process.env.GOOGLE_CLIENT_ID ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

const getKakaoUser = async (accessToken: string) => {
  const response = await fetch('https://kapi.kakao.com/v2/user/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) throw new HttpError(401, 'Invalid Kakao token.', 'INVALID_KAKAO_TOKEN')

  const body = (await response.json()) as KakaoUserResponse
  if (!body.id) throw new HttpError(401, 'Invalid Kakao token.', 'INVALID_KAKAO_TOKEN')

  return body
}

const createUniqueOAuthUsername = async (provider: 'google' | 'kakao' | 'guest', providerUserId: string) => {
  const base = `${provider}_${providerUserId.replace(/[^a-zA-Z0-9_]/g, '_')}`.slice(0, 50)
  if (!(await findUserByUsername(base))) return base

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `${provider}_${randomUUID().replace(/-/g, '').slice(0, 16)}`
    if (!(await findUserByUsername(candidate))) return candidate
  }

  throw new HttpError(500, 'OAuth username allocation failed.', 'OAUTH_USERNAME_ALLOCATION_FAILED')
}

authRouter.post('/auth/signup', async (req, res, next) => {
  try {
    const body = signupSchema.parse(req.body)
    if (await findUserByUsername(body.username)) throw new HttpError(409, '이미 존재하는 아이디입니다.', 'DUPLICATED_USERNAME')

    const passwordHash = await bcrypt.hash(body.password, 10)
    const user = await createUser({ username: body.username, passwordHash, nickname: body.nickname })
    res.status(201).json({ user: toPublicUser(user), accessToken: signAccessToken(user) })
  } catch (error) {
    next(error)
  }
})

authRouter.post('/auth/login', async (req, res, next) => {
  try {
    const body = signupSchema.pick({ username: true, password: true }).parse(req.body)
    const user = await findUserByUsername(body.username)
    if (!user) throw new HttpError(401, '아이디 또는 비밀번호가 올바르지 않습니다.', 'INVALID_CREDENTIALS')

    const isValid = await bcrypt.compare(body.password, user.password_hash)
    if (!isValid) throw new HttpError(401, '아이디 또는 비밀번호가 올바르지 않습니다.', 'INVALID_CREDENTIALS')

    res.json({ user: toPublicUser(user), accessToken: signAccessToken(user) })
  } catch (error) {
    next(error)
  }
})

authRouter.post('/auth/guest', async (_req, res, next) => {
  try {
    const guestId = randomUUID()
    const user = await createOAuthUser({
      username: await createUniqueOAuthUsername('guest', guestId),
      authProvider: 'guest',
      providerUserId: guestId,
      nickname: `Guest ${guestId.slice(0, 6)}`,
    })

    res.status(201).json({ user: toPublicUser(user), accessToken: signAccessToken(user) })
  } catch (error) {
    next(error)
  }
})

authRouter.post('/auth/google', async (req, res, next) => {
  try {
    const body = googleLoginSchema.parse(req.body)
    const googleClientIds = getGoogleClientIds()
    if (googleClientIds.length === 0) throw new HttpError(500, 'GOOGLE_CLIENT_ID is not configured.', 'OAUTH_NOT_CONFIGURED')

    const ticket = await googleOAuthClient.verifyIdToken({
      idToken: body.idToken,
      audience: googleClientIds.length === 1 ? googleClientIds[0] : googleClientIds,
    })
    const payload = ticket.getPayload()
    if (!payload?.sub) throw new HttpError(401, 'Invalid Google token.', 'INVALID_GOOGLE_TOKEN')
    if (!payload.email_verified) throw new HttpError(401, 'Google email is not verified.', 'GOOGLE_EMAIL_NOT_VERIFIED')

    const existingUser = await findUserByOAuthIdentity('google', payload.sub)
    const user =
      existingUser ??
      (await createOAuthUser({
        username: await createUniqueOAuthUsername('google', payload.sub),
        email: payload.email ?? null,
        authProvider: 'google',
        providerUserId: payload.sub,
        nickname: (payload.name ?? payload.email?.split('@')[0] ?? 'Google user').slice(0, 50),
        profileImageUrl: payload.picture ?? null,
      }))

    res.json({ user: toPublicUser(user), accessToken: signAccessToken(user) })
  } catch (error) {
    next(error)
  }
})

authRouter.post('/auth/kakao', async (req, res, next) => {
  try {
    const body = kakaoLoginSchema.parse(req.body)
    const kakaoUser = await getKakaoUser(body.accessToken)
    const kakaoUserId = String(kakaoUser.id)
    const existingUser = await findUserByOAuthIdentity('kakao', kakaoUserId)
    const profile = kakaoUser.kakao_account?.profile
    const properties = kakaoUser.properties
    const nickname = profile?.nickname ?? properties?.nickname ?? `Kakao ${kakaoUserId.slice(-6)}`
    const profileImageUrl = profile?.profile_image_url ?? properties?.profile_image ?? profile?.thumbnail_image_url ?? properties?.thumbnail_image ?? null
    const user =
      existingUser ??
      (await createOAuthUser({
        username: await createUniqueOAuthUsername('kakao', kakaoUserId),
        email: kakaoUser.kakao_account?.email ?? null,
        authProvider: 'kakao',
        providerUserId: kakaoUserId,
        nickname: nickname.slice(0, 50),
        profileImageUrl,
      }))

    res.json({ user: toPublicUser(user), accessToken: signAccessToken(user) })
  } catch (error) {
    next(error)
  }
})

authRouter.get('/auth/me', requireAuth, (req: AuthRequest, res) => {
  res.json(toPublicUser(getCurrentUser(req)))
})

authRouter.post('/auth/logout', requireAuth, (_req, res) => {
  res.json({ message: '로그아웃되었습니다.' })
})
