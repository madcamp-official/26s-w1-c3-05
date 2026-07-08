// Standalone mock of the myocatmongo backend REST API — no Postgres, no vision
// service, no real auth. Lets the frontend run against realistic-shaped JSON
// entirely in memory so a teammate can develop the UI without setting up the
// full docker-compose stack.
//
// Usage:
//   cd backend && node tools/mock-api-server.mjs
// Then point the frontend at it (default port matches the real backend, so
// frontend/.env's default `VITE_API_BASE_URL=http://localhost:4000` just works).
//
// Login always succeeds as the same mock user, regardless of what's posted.
// Photo uploads always resolve as `detectionStatus: 'matched'` against a fixed
// mock cat — the "needs confirmation" / "new cat" branches are not simulated.

import express from 'express'
import cors from 'cors'
import multer from 'multer'

const PORT = Number(process.env.MOCK_API_PORT ?? 4000)
const upload = multer({ storage: multer.memoryStorage() })

const app = express()
app.use(cors({ origin: true }))
app.use(express.json())

// ── Fixed placeholder photo (no real uploads are ever stored) ──
const PLACEHOLDER_IMAGE = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#e8f3ea"/><text x="50" y="62" font-size="52" text-anchor="middle">🐱</text></svg>'
).toString('base64')}`

// ── In-memory "database" ──
const DEFAULT_LAT = 36.3727
const DEFAULT_LNG = 127.3602

const MOCK_USER = {
  id: '1',
  username: 'mockuser',
  nickname: '테스트집사',
  nicknameOnboarded: true,
  email: 'mock@example.com',
  profileImageUrl: null,
  createdAt: new Date().toISOString(),
}
const MOCK_TOKEN = 'mock-token'

const cats = [
  {
    id: 1,
    name: '나비',
    pattern: 'orange_tabby',
    modelKey: 'orange_tabby',
    description: '캠퍼스 중앙도서관 근처에서 자주 보여요.',
    personality: '사람을 좋아해요',
    mainImageUrl: PLACEHOLDER_IMAGE,
    latOffset: 0.00016,
    lngOffset: 0.00014,
    zoneName: '중앙도서관',
    status: 'active',
    discovered: true,
    isFavorite: true,
  },
  {
    id: 2,
    name: '초코',
    pattern: 'black',
    modelKey: 'black',
    description: '밤에 주로 활동해요.',
    personality: '낯을 가려요',
    mainImageUrl: PLACEHOLDER_IMAGE,
    latOffset: -0.0002,
    lngOffset: -0.00011,
    zoneName: '학생회관',
    status: 'active',
    discovered: true,
    isFavorite: false,
  },
  {
    id: 3,
    name: null,
    pattern: 'calico',
    modelKey: 'calico',
    description: null,
    personality: null,
    mainImageUrl: null,
    latOffset: 0.0003,
    lngOffset: -0.00022,
    zoneName: 'IT융합빌딩',
    status: 'active',
    discovered: false,
    isFavorite: false,
  },
  {
    id: 4,
    name: '보리',
    pattern: 'gray_tabby',
    modelKey: 'gray_tabby',
    description: '캣타워 위에서 낮잠 자는 걸 좋아해요.',
    personality: '느긋해요',
    mainImageUrl: PLACEHOLDER_IMAGE,
    latOffset: -0.00008,
    lngOffset: 0.0003,
    zoneName: '교양분관',
    status: 'active',
    discovered: true,
    isFavorite: false,
  },
]

const sightingsByCat = new Map(
  cats.map((cat) => [
    cat.id,
    cat.discovered
      ? [1, 2].map((n) => ({
          id: cat.id * 100 + n,
          catId: cat.id,
          imageUrl: PLACEHOLDER_IMAGE,
          latitude: DEFAULT_LAT + cat.latOffset,
          longitude: DEFAULT_LNG + cat.lngOffset,
          createdAt: new Date(Date.now() - n * 86_400_000).toISOString(),
        }))
      : [],
  ])
)

const CAT_MODEL_URL = {
  orange_tabby: '/models/cats/cat_cute_tabby_orange_01.glb',
  black: '/models/cats/cat_cute_black_01.glb',
  calico: '/models/cats/cat_cute_calico_01.glb',
  gray_tabby: '/models/cats/cat_cute_tabby_gray_01.glb',
}
const BUSH_MODEL_URL = '/models/bush_01.glb'

const buildings = [
  { id: 1, type: 'landmark', name: '캣타워 A', latOffset: 0.00012, lngOffset: 0.00009, modelKey: 'blue', description: '' },
  { id: 2, type: 'landmark', name: '캣타워 B', latOffset: -0.00015, lngOffset: -0.00018, modelKey: 'green', description: '' },
].map((building) => ({ ...building, rotationY: Math.random() * Math.PI * 2 }))
const TOWER_MODEL_URL = {
  blue: '/models/tower/cat_tower_blue_01_muted_unlit.glb',
  green: '/models/tower/cat_tower_green_01_muted_unlit.glb',
}

// ── Serializers (mirror backend/src/lib/serializers.ts field names) ──
const catListItem = (cat) => ({
  id: String(cat.id),
  name: cat.discovered ? cat.name : null,
  mainImageUrl: cat.discovered ? cat.mainImageUrl : null,
  pattern: cat.discovered ? cat.pattern : null,
  description: cat.discovered ? cat.description : null,
  isDiscovered: cat.discovered,
})

const catDetail = (cat) => ({
  id: String(cat.id),
  name: cat.discovered ? cat.name : null,
  mainImageUrl: cat.discovered ? cat.mainImageUrl : null,
  pattern: cat.discovered ? cat.pattern : null,
  personality: cat.discovered ? cat.personality : null,
  description: cat.discovered ? cat.description : null,
  isDiscovered: cat.discovered,
  ...(cat.discovered ? { discoveredAt: new Date(Date.now() - 5 * 86_400_000).toISOString() } : { displayName: '???' }),
})

const catSighting = (row) => ({
  id: String(row.id),
  imageUrl: row.imageUrl,
  latitude: row.latitude,
  longitude: row.longitude,
  createdAt: row.createdAt,
})

const collectionCat = (cat) => ({
  catId: String(cat.id),
  name: cat.name,
  customName: null,
  displayName: cat.name,
  mainImageUrl: cat.mainImageUrl,
  pattern: cat.pattern,
  discoveredAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
  isFavorite: cat.isFavorite,
  discoveryLocation: {
    latitude: DEFAULT_LAT + cat.latOffset,
    longitude: DEFAULT_LNG + cat.lngOffset,
    zoneId: null,
    zoneName: cat.zoneName,
  },
})

const catActor = (cat, origin) => ({
  catId: String(cat.id),
  displayType: cat.discovered ? 'discovered_cat' : 'undiscovered_recent',
  name: cat.discovered ? cat.name : null,
  lat: origin.lat + cat.latOffset,
  lng: origin.lng + cat.lngOffset,
  distanceMeters: 50,
  zoneId: null,
  zoneName: cat.zoneName,
  zoneType: null,
  surface: 'ground',
  anchorKey: null,
  heightOffsetMeters: 0,
  movementRadiusMeters: 4,
  modelType: cat.discovered ? 'cat' : 'bush',
  modelKey: cat.discovered ? cat.modelKey : 'bush',
  modelUrl: cat.discovered ? CAT_MODEL_URL[cat.modelKey] : BUSH_MODEL_URL,
  modelScale: 1,
  animationKey: cat.discovered ? 'idle' : 'idle',
  animationStartedAt: new Date().toISOString(),
  animationExpiresAt: null,
  mainImageUrl: cat.discovered ? cat.mainImageUrl : null,
})

const mapObjectItem = (building, origin) => ({
  id: String(building.id),
  type: building.type,
  name: building.name,
  lat: origin.lat + building.latOffset,
  lng: origin.lng + building.lngOffset,
  distanceMeters: 100,
  modelType: 'building',
  modelKey: building.modelKey,
  modelUrl: TOWER_MODEL_URL[building.modelKey],
  modelScale: 1,
  rotationY: building.rotationY,
  radiusMeters: 5,
  description: building.description,
})

const authResponse = (statusIsNew = false) => ({
  user: MOCK_USER,
  accessToken: MOCK_TOKEN,
  isNewUser: statusIsNew,
  needsNickname: false,
})

// ── Auth (always succeeds) ──
app.post('/api/auth/guest', (_req, res) => res.status(201).json(authResponse(false)))
app.post('/api/auth/signup/send-code', (_req, res) => res.json({ message: '인증 코드를 전송했습니다. (mock)', expiresInSeconds: 600 }))
app.post('/api/auth/signup', (_req, res) => res.status(201).json(authResponse(true)))
app.post('/api/auth/login', (_req, res) => res.json(authResponse(false)))
app.post('/api/auth/google', (_req, res) => res.json(authResponse(false)))
app.post('/api/auth/kakao', (_req, res) => res.json(authResponse(false)))
app.get('/api/auth/me', (_req, res) => res.json(MOCK_USER))
app.post('/api/auth/logout', (_req, res) => res.json({ message: '로그아웃되었습니다.' }))

// ── Cats ──
app.get('/api/cats', (_req, res) => res.json({ cats: cats.map(catListItem) }))

app.get('/api/cats/:catId', (req, res) => {
  const cat = cats.find((item) => String(item.id) === req.params.catId)
  if (!cat) return res.status(404).json({ message: '고양이를 찾을 수 없습니다.', code: 'NOT_FOUND' })
  res.json(catDetail(cat))
})

app.get('/api/cats/:catId/sightings', (req, res) => {
  const cat = cats.find((item) => String(item.id) === req.params.catId)
  if (!cat) return res.status(404).json({ message: '고양이를 찾을 수 없습니다.', code: 'NOT_FOUND' })
  res.json({ sightings: (sightingsByCat.get(cat.id) ?? []).map(catSighting) })
})

app.patch('/api/cats/:catId/name', (req, res) => {
  const cat = cats.find((item) => String(item.id) === req.params.catId)
  if (!cat) return res.status(404).json({ message: '고양이를 찾을 수 없습니다.', code: 'NOT_FOUND' })
  cat.name = req.body?.name ?? cat.name
  cat.discovered = true
  res.json({ cat: { id: String(cat.id), name: cat.name, mainImageUrl: cat.mainImageUrl, status: cat.status, isNewCollection: true }, message: '고양이 이름이 저장되었습니다. (mock)' })
})

app.patch('/api/cats/:catId/nickname', (req, res) => {
  const cat = cats.find((item) => String(item.id) === req.params.catId)
  if (!cat) return res.status(404).json({ message: '도감에 등록된 고양이가 아닙니다.', code: 'NOT_FOUND' })
  res.json({ catId: String(cat.id), customName: req.body?.customName ?? null, message: '별명이 저장되었습니다. (mock)' })
})

// 덤불 힌트: (cat)당 한 번만 랜덤 조각을 뽑아 저장 — 실제 backend/src/routes/cats.ts와 동일한
// upsert-once 동작을 인메모리로 흉내낸다. 목 서버라 유저 구분이 없어 catId만으로 키를 잡는다.
const bushClues = new Map()

app.post('/api/cats/:catId/bush-clue', (req, res) => {
  const cat = cats.find((item) => String(item.id) === req.params.catId)
  if (!cat) return res.status(404).json({ message: '고양이를 찾을 수 없습니다.', code: 'NOT_FOUND' })
  if (cat.discovered) return res.status(400).json({ message: '이미 도감에 등록된 고양이입니다.', code: 'ALREADY_DISCOVERED' })

  let clue = bushClues.get(cat.id)
  if (!clue) {
    const size = 0.4 + Math.random() * 0.2
    clue = { cropX: Math.random() * (1 - size), cropY: Math.random() * (1 - size), cropSize: size }
    bushClues.set(cat.id, clue)
  }
  res.json({
    message: '모르는 고양이예요. 이 주변에 있을지도 모르니 찾아보세요!',
    catId: String(cat.id),
    imageUrl: PLACEHOLDER_IMAGE,
    crop: { x: clue.cropX, y: clue.cropY, size: clue.cropSize },
  })
})

// ── Collection (도감) ──
app.get('/api/collection', (_req, res) => res.json({ cats: cats.filter((cat) => cat.discovered).map(collectionCat) }))

app.patch('/api/collection/:catId/favorite', (req, res) => {
  const cat = cats.find((item) => String(item.id) === req.params.catId)
  if (!cat) return res.status(404).json({ message: '도감에 등록된 고양이가 아닙니다.', code: 'NOT_FOUND' })
  cat.isFavorite = Boolean(req.body?.isFavorite)
  res.json({ catId: String(cat.id), isFavorite: cat.isFavorite })
})

// ── Gallery ──
app.get('/api/gallery/me', (req, res) => {
  const allPhotos = cats
    .filter((cat) => cat.discovered)
    .flatMap((cat) => (sightingsByCat.get(cat.id) ?? []).map((row) => ({ ...row, catName: cat.name })))
  const limit = Number(req.query.limit ?? 20)
  res.json({
    photos: allPhotos.slice(0, limit).map((row) => ({
      sightingId: String(row.id),
      catId: String(row.catId),
      catName: row.catName,
      imageUrl: row.imageUrl,
      latitude: row.latitude,
      longitude: row.longitude,
      takenAt: row.createdAt,
    })),
    pagination: { page: 1, limit, totalCount: allPhotos.length, totalPages: 1 },
  })
})

// ── Profile ──
app.get('/api/profile/me', (_req, res) =>
  res.json({ ...MOCK_USER, discoveredCount: cats.filter((cat) => cat.discovered).length, sightingCount: [...sightingsByCat.values()].flat().length })
)
app.patch('/api/profile/me', (req, res) => {
  if (req.body?.nickname) MOCK_USER.nickname = req.body.nickname
  if ('profileImageUrl' in (req.body ?? {})) MOCK_USER.profileImageUrl = req.body.profileImageUrl
  res.json(MOCK_USER)
})

// ── Sightings — upload always resolves as "matched" against a fixed cat ──
app.get('/api/sightings/me', (_req, res) => {
  const allSightings = cats.filter((cat) => cat.discovered).flatMap((cat) => (sightingsByCat.get(cat.id) ?? []).map((row) => ({ ...row, catName: cat.name })))
  res.json({
    sightings: allSightings.map((row) => ({
      id: String(row.id),
      catId: String(row.catId),
      catName: row.catName,
      imageUrl: row.imageUrl,
      latitude: row.latitude,
      longitude: row.longitude,
      detectionStatus: 'matched',
      createdAt: row.createdAt,
    })),
  })
})

const MATCHED_CAT_ID = 1
let nextSightingId = 1000

const matchedSightingResponse = (latitude, longitude) => {
  const cat = cats.find((item) => item.id === MATCHED_CAT_ID)
  const r = 4 + Math.random() * 3
  const theta = Math.random() * Math.PI * 2
  const placementLatitude = latitude + (r * Math.cos(theta)) / 111000
  const placementLongitude = longitude + (r * Math.sin(theta)) / (111000 * Math.cos((latitude * Math.PI) / 180))
  return {
    photoId: String(nextSightingId),
    sightingId: String(nextSightingId++),
    detectionStatus: 'matched',
    cat: { id: String(cat.id), name: cat.name, mainImageUrl: cat.mainImageUrl, isNewCollection: false },
    placement: { latitude: placementLatitude, longitude: placementLongitude },
  }
}

app.post('/api/sightings', upload.single('image'), (req, res) => {
  const latitude = Number(req.body?.latitude ?? DEFAULT_LAT)
  const longitude = Number(req.body?.longitude ?? DEFAULT_LNG)
  res.status(201).json(matchedSightingResponse(latitude, longitude))
})

app.post('/api/sightings/:photoId/confirm-cat', (_req, res) => res.json(matchedSightingResponse(DEFAULT_LAT, DEFAULT_LNG)))

// ── Map ──
// 캣타워/고양이는 항상 "요청한 위치(실제 GPS 등)" 기준 상대 오프셋으로 배치한다.
// lat/lng 쿼리를 무시하고 고정 좌표를 내려주면, 캠퍼스가 아닌 곳에서 접속했을 때
// 마커가 사용자 주변이 아니라 엉뚱한 곳(먼 거리)에 나타나 버린다.
function resolveOrigin(req) {
  const lat = Number(req.query.lat)
  const lng = Number(req.query.lng)
  return {
    lat: Number.isFinite(lat) ? lat : DEFAULT_LAT,
    lng: Number.isFinite(lng) ? lng : DEFAULT_LNG,
  }
}

app.get('/api/map/objects', (req, res) => {
  const origin = resolveOrigin(req)
  res.json({ objects: buildings.map((building) => mapObjectItem(building, origin)) })
})

app.get('/api/map/cat-actors', (req, res) => {
  const origin = resolveOrigin(req)
  const includeUndiscovered = req.query.includeUndiscovered !== 'false'
  res.json({
    cats: cats.filter((cat) => includeUndiscovered || cat.discovered).map((cat) => catActor(cat, origin)),
  })
})

// ── Misc ──
app.get('/api/health', (_req, res) => res.json({ status: 'ok', mock: true }))

app.use((req, res) => res.status(404).json({ message: `Mock endpoint not implemented: ${req.method} ${req.path}`, code: 'MOCK_NOT_IMPLEMENTED' }))

app.listen(PORT, () => {
  console.log(`Mock API server listening on http://localhost:${PORT}`)
  console.log('Login always succeeds; sighting uploads always resolve as matched.')
})
