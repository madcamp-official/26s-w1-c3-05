import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { z } from 'zod'
import { createUser, findUserByUsername, toPublicUser } from '../db/repositories.js'
import { getCurrentUser, requireAuth, signAccessToken, type AuthRequest } from '../lib/auth.js'
import { HttpError } from '../lib/httpError.js'

export const authRouter = Router()

const signupSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(100),
  nickname: z.string().min(1).max(50),
})

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

authRouter.get('/auth/me', requireAuth, (req: AuthRequest, res) => {
  res.json(toPublicUser(getCurrentUser(req)))
})

authRouter.post('/auth/logout', requireAuth, (_req, res) => {
  res.json({ message: '로그아웃되었습니다.' })
})
