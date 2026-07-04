import jwt from 'jsonwebtoken'
import type { NextFunction, Request, Response } from 'express'
import { HttpError } from './httpError.js'
import { findUserById } from '../db/repositories.js'
import type { UserRow } from '../db/types.js'

const jwtSecret = process.env.JWT_SECRET ?? 'dev-myocatmongo-secret'

export interface AuthRequest extends Request {
  currentUser?: UserRow
}

export const signAccessToken = (user: Pick<UserRow, 'id' | 'role'>) => {
  return jwt.sign({ sub: String(user.id), role: user.role }, jwtSecret, { expiresIn: '7d' })
}

export const requireAuth = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  try {
    const header = req.header('authorization')
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined

    if (!token) throw new HttpError(401, '로그인이 필요합니다.', 'UNAUTHORIZED')

    const payload = jwt.verify(token, jwtSecret)
    if (typeof payload !== 'object' || !payload.sub) throw new HttpError(401, '토큰이 유효하지 않습니다.', 'INVALID_TOKEN')

    const user = await findUserById(Number(payload.sub))
    if (!user) throw new HttpError(401, '토큰이 유효하지 않습니다.', 'INVALID_TOKEN')

    req.currentUser = user
    next()
  } catch (error) {
    if (error instanceof HttpError) return next(error)
    return next(new HttpError(401, '토큰이 유효하지 않습니다.', 'INVALID_TOKEN'))
  }
}

export const requireAdmin = (req: AuthRequest, _res: Response, next: NextFunction) => {
  if (req.currentUser?.role !== 'admin') return next(new HttpError(403, '관리자 권한이 필요합니다.', 'FORBIDDEN'))
  next()
}

export const getCurrentUser = (req: AuthRequest) => {
  if (!req.currentUser) throw new HttpError(401, '로그인이 필요합니다.', 'UNAUTHORIZED')
  return req.currentUser
}
