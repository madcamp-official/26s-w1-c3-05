import { Router } from 'express'
import { findRankings } from '../db/repositories.js'
import { getCurrentUser, requireAuth, type AuthRequest } from '../lib/auth.js'

export const rankingsRouter = Router()

rankingsRouter.get('/rankings', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = getCurrentUser(req)
    const ranked = (await findRankings()).map((row, index) => ({ rank: index + 1, nickname: row.nickname, discoveredCount: Number(row.discovered_count), userId: row.user_id }))
    const myRanking = ranked.find((row) => row.userId === user.id)
    res.json({
      rankings: ranked.map(({ userId: _userId, ...row }) => row),
      myRanking: myRanking ? { rank: myRanking.rank, nickname: myRanking.nickname, discoveredCount: myRanking.discoveredCount } : null,
    })
  } catch (error) {
    next(error)
  }
})
