import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import morgan from 'morgan'
import swaggerUi from 'swagger-ui-express'
import { ZodError } from 'zod'
import { adminRouter } from './routes/admin.js'
import { authRouter } from './routes/auth.js'
import { catsRouter } from './routes/cats.js'
import { collectionRouter } from './routes/collection.js'
import { galleryRouter } from './routes/gallery.js'
import { healthRouter } from './routes/health.js'
import { mapRouter } from './routes/map.js'
import { profileRouter } from './routes/profile.js'
import { rankingsRouter } from './routes/rankings.js'
import { sightingsRouter } from './routes/sightings.js'
import { HttpError } from './lib/httpError.js'
import { pool } from './db/database.js'
import { openApiDocument } from './openapi.js'

const app = express()
const port = Number(process.env.PORT ?? 4000)
// Comma-separated so local dev can allow both the Vite origin and a LAN IP
// (for testing on a phone) at once, e.g. "http://localhost:5199,http://10.0.0.5:5199".
const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((value) => value.trim())

app.use(helmet())
app.use(cors({ origin: corsOrigins }))
app.use(express.json({ limit: '2mb' }))
// helmet's default Cross-Origin-Resource-Policy (same-origin) blocks the
// frontend (a different origin) from loading these images at all — CORS
// headers alone don't satisfy it, the browser drops the response client-side.
app.use('/uploads', (_req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  next()
}, express.static('uploads'))
app.use(morgan('dev'))
app.get('/api/openapi.json', (_req, res) => res.json(openApiDocument))
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, { explorer: true }))

app.get('/', (_req, res) => {
  res.json({
    service: 'myocatmongo-backend',
    apiBase: '/api',
    endpoints: [
      '/api/health',
      '/api/openapi.json',
      '/api-docs',
      '/api/auth/signup/send-code',
      '/api/auth/signup',
      '/api/auth/login',
      '/api/auth/logout',
      '/api/auth/me',
      '/api/cats',
      '/api/cats/:catId',
      '/api/cats/:catId/sightings',
      '/api/cats/:catId/bush-clue',
      '/api/collection',
      '/api/collection/:catId/favorite',
      '/api/gallery/me',
      '/api/gallery/me/cats/:catId',
      '/api/sightings',
      '/api/sightings/me',
      '/api/sightings/:photoId/confirm-cat',
      '/api/map/cats',
      '/api/map/objects',
      '/api/map/cat-actors',
      '/api/profile/me',
      '/api/profile/me/image',
      '/api/rankings',
      '/api/admin/cats',
      '/api/admin/cat-candidates',
    ],
  })
})

app.use('/api', healthRouter)
app.use('/api', authRouter)
app.use('/api', catsRouter)
app.use('/api', collectionRouter)
app.use('/api', galleryRouter)
app.use('/api', sightingsRouter)
app.use('/api', mapRouter)
app.use('/api', profileRouter)
app.use('/api', rankingsRouter)
app.use('/api', adminRouter)

app.use(healthRouter)
app.use(authRouter)
app.use(catsRouter)
app.use(collectionRouter)
app.use(galleryRouter)
app.use(sightingsRouter)
app.use(mapRouter)
app.use(profileRouter)
app.use(rankingsRouter)
app.use(adminRouter)

app.use((_req, _res, next) => {
  next(new HttpError(404, 'Route not found'))
})

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    return res.status(400).json({
      message: '요청 데이터 형식이 올바르지 않습니다.',
      code: 'VALIDATION_ERROR',
      issues: error.issues,
    })
  }

  if (error instanceof HttpError) {
    return res.status(error.status).json({ message: error.message, code: error.code })
  }

  console.error(error)
  return res.status(500).json({ message: '서버 내부 오류입니다.', code: 'INTERNAL_ERROR' })
})

const server = app.listen(port, () => {
  console.log(`Myocatmongo backend listening on http://localhost:${port}`)
})

const shutdown = async () => {
  server.close()
  await pool.end()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
