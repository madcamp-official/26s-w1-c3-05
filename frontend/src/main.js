import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { addFlowerDecorations } from './FlowerDecorations.js'
import { createAnimatedModelLayer } from './model-layer.js'
import { API_BASE_URL, authFetch, getStoredUser, hasSession, logout, updateStoredUser } from './auth.js'
import {
  getCat,
  getCats,
  getCatSightings,
  getCollection,
  getGallery,
  getMe,
  getMySightings,
  getProfile,
  setCatName,
  setCatNickname,
  setFavorite,
  updateProfile,
} from './api.js'

// 아직 GPS를 못 받았을 때 지도 조회에 쓰는 기본 위치 (KAIST 중앙도서관 부근).
const DEFAULT_QUERY_POSITION = { lat: 36.3727, lng: 127.3602 }
const PREVIEW_CAT_ACTORS = [
  {
    catId: 'preview-mango',
    displayType: 'discovered_cat',
    name: '망고',
    offsetEastMeters: 10,
    offsetNorthMeters: 18,
    lat: DEFAULT_QUERY_POSITION.lat,
    lng: DEFAULT_QUERY_POSITION.lng,
    distanceMeters: 0,
    zoneName: '중앙도서관',
    modelType: 'cat',
    modelUrl: '/models/cat.glb',
    modelScale: 1,
    animationKey: 'sit',
    heightOffsetMeters: 0,
    mainImageUrl: 'https://images.unsplash.com/photo-1574158622682-e40e69881006?auto=format&fit=crop&w=160&q=70',
  },
  {
    catId: 'preview-berry-bush',
    displayType: 'undiscovered_recent',
    name: null,
    offsetEastMeters: -14,
    offsetNorthMeters: 14,
    lat: DEFAULT_QUERY_POSITION.lat,
    lng: DEFAULT_QUERY_POSITION.lng,
    distanceMeters: 0,
    zoneName: 'N1',
    modelType: 'bush',
    modelUrl: '/models/bush_01.glb',
    modelScale: 1,
    animationKey: 'idle',
    heightOffsetMeters: 0,
    mainImageUrl: null,
  },
  {
    catId: 'preview-bami',
    displayType: 'discovered_cat',
    name: '밤이',
    offsetEastMeters: 18,
    offsetNorthMeters: -12,
    lat: DEFAULT_QUERY_POSITION.lat,
    lng: DEFAULT_QUERY_POSITION.lng,
    distanceMeters: 0,
    zoneName: '생활관',
    modelType: 'cat',
    modelUrl: '/models/cat.glb',
    modelScale: 1,
    animationKey: 'sleep',
    heightOffsetMeters: 0,
    mainImageUrl: 'https://images.unsplash.com/photo-1543852786-1cf6624b9987?auto=format&fit=crop&w=160&q=70',
  },
  {
    catId: 'preview-hidden-bush',
    displayType: 'undiscovered_recent',
    name: null,
    offsetEastMeters: -20,
    offsetNorthMeters: -16,
    lat: DEFAULT_QUERY_POSITION.lat,
    lng: DEFAULT_QUERY_POSITION.lng,
    distanceMeters: 0,
    zoneName: '산책로',
    modelType: 'bush',
    modelUrl: '/models/bush_01.glb',
    modelScale: 1,
    animationKey: 'idle',
    heightOffsetMeters: 0,
    mainImageUrl: null,
  },
]

// 백엔드 API 주소. 배포 시 VITE_API_BASE_URL 환경변수로 주입한다.
// (미설정 시 로컬 개발용 백엔드로 fallback)

// KAIST 본원 (대전) 중심 좌표: [경도, 위도]
const KAIST_CENTER = [127.3628, 36.3721]

// 초기: 캠퍼스만 화면에 담기는 시점 (캠퍼스 밖 불필요한 지역은 보이지 않게)
// 세로로 긴 폰 화면에서 서쪽 기숙사 지역까지 담기게 중심을 살짝 서쪽으로 둔다.
const OVERVIEW_VIEW = {
  center: [127.3623, 36.3699],
  zoom: 14.1,
  pitch: 25,
  bearing: -20,
}

// 마커 시점(1인칭)의 궤도 카메라 설정
// 줌이 낮을수록(축소) 카메라가 높고 멀리서 내려다보고,
// 줌이 높을수록(확대) 카메라가 낮아지며 마커를 옆에서 바라본다 → 곡선 궤도 느낌
const FOLLOW_MIN_ZOOM = 16 // 가장 축소(카메라 최대 높이)
const FOLLOW_MAX_ZOOM = 20 // 가장 확대(카메라 최저 높이)
const FOLLOW_PITCH_MIN = 15 // 최대 높이일 때 각도(거의 수직으로 내려다봄)
const FOLLOW_PITCH_MAX = 72 // 확대일 때 각도(옆에서, maxPitch 75 이내)
const FOLLOW_START_ZOOM = FOLLOW_MAX_ZOOM // 진입부터 하늘이 가장 많이 보이는 최대 pitch(72°)
const ORBIT_ROT_SPEED = 0.4 // 한 손가락 스와이프 1px당 회전 각도(도)
const PINCH_SENSITIVITY = 2.4 // 핀치 확대/축소 감도(클수록 민감)
const SWIPE_DEAD_ZONE_PX = 8 // 이만큼 움직이기 전에는 탭으로 간주 (튕김 방지)

const map = new maplibregl.Map({
  container: 'map',
  // 모뉴먼트 밸리 풍으로 변환한 커스텀 스타일 (public/monument-style.json)
  style: '/monument-style.json',
  ...OVERVIEW_VIEW,
  maxPitch: 75,
  minZoom: 13.9, // 캠퍼스 밖이 훤히 보일 만큼 축소되지 않게
  // 캠퍼스를 크게 벗어나지 못하게 제한 (서쪽 기숙사 지역까지 여유 포함)
  maxBounds: [
    [127.344, 36.359], // 남서쪽 모서리
    [127.378, 36.385], // 북동쪽 모서리
  ],
  attributionControl: { compact: true },
})

const animatedModelLayer = createAnimatedModelLayer(map)
const mockBuildingMarkers = new Map()
const catMarkers = new Map()
const MOCK_MAP_MODE = false

// 가까이서 볼 때(follow 시점 줌 범위) 고양이 마커가 3D 모델과 겹치지 않게 위쪽으로 띄운다.
const CAT_MARKER_DEFAULT_OFFSET = [0, -18]
const CAT_MARKER_FOLLOW_MIN_OFFSET = [0, -34]
const CAT_MARKER_CLOSE_OFFSET = [0, -92]
const CAT_MARKER_MIN_VISIBLE_ZOOM = 18.4

function catMarkerOffset() {
  if (!isFollowing) return CAT_MARKER_DEFAULT_OFFSET
  const t = clamp((map.getZoom() - FOLLOW_MIN_ZOOM) / (FOLLOW_MAX_ZOOM - FOLLOW_MIN_ZOOM), 0, 1)
  const eased = t * t * (3 - 2 * t)
  return [
    0,
    CAT_MARKER_FOLLOW_MIN_OFFSET[1] +
      (CAT_MARKER_CLOSE_OFFSET[1] - CAT_MARKER_FOLLOW_MIN_OFFSET[1]) * eased,
  ]
}

// 기본 더블탭 확대 동작 끄기 (우리가 직접 더블탭을 시점 전환에 사용)
map.doubleClickZoom.disable()

// ─────────────────────────────────────────────
// 텍스처: 잔디 / 건물부지(꽃밭) / 물 이미지를 fill-pattern으로 입힘
// 이미지는 public/textures/ 에 아래 파일명으로 저장돼 있어야 함
// ─────────────────────────────────────────────
const TEXTURES = [
  { name: 'tex-grass', url: '/textures/grass.png' },
  { name: 'tex-flowers', url: '/textures/flowers.png' },
  { name: 'tex-water', url: '/textures/water.png' },
]

// 스타일이 준비되기를 기다리는 동안 세 이미지를 동시에 미리 받는다.
// 기존처럼 한 장씩 기다리지 않아 첫 텍스처 표시까지의 지연이 짧아진다.
const textureLoadPromise = Promise.all(
  TEXTURES.map(async (texture) => {
    try {
      const image = await map.loadImage(texture.url)
      return { ...texture, image: image.data }
    } catch (error) {
      console.warn('텍스처 로드 실패:', texture.url, error)
      return null
    }
  })
)

// 잔디 텍스처를 입힐 초록색 지면 레이어들
const GRASS_LAYERS = [
  'park',
  'landuse_residential',
  'landcover_grass',
  'landcover_wood',
  'landcover_ice',
  'landcover_wetland',
  'landuse_pitch',
  'landuse_track',
  'landuse_cemetery',
  'landuse_hospital',
  'landuse_school',
  'landcover_sand',
]

async function applyTextures() {
  // 미리 병렬로 받아둔 이미지 등록
  const loadedTextures = await textureLoadPromise
  for (const texture of loadedTextures) {
    if (texture && !map.hasImage(texture.name)) {
      map.addImage(texture.name, texture.image)
    }
  }
  // 잔디: 배경 + 초록 지면 레이어 전부
  if (map.getLayer('background')) {
    map.setPaintProperty('background', 'background-pattern', 'tex-grass')
  }
  for (const id of GRASS_LAYERS) {
    if (map.getLayer(id)) map.setPaintProperty(id, 'fill-pattern', 'tex-grass')
  }
  // 건물부지: 꽃밭 텍스처
  if (map.getLayer('buildings-3d')) {
    map.setPaintProperty('buildings-3d', 'fill-pattern', 'tex-flowers')
  }
  // 물
  if (map.getLayer('water')) {
    map.setPaintProperty('water', 'fill-pattern', 'tex-water')
  }
  map.triggerRepaint() // 패턴 적용 후 즉시 다시 그리기
}

// 스타일이 파싱되면(레이어 생성 시점) 텍스처 적용.
// 'load' 이벤트는 sprite/glyphs 로딩이 느리면 지연될 수 있어 'styledata'로 트리거.
let sceneInited = false
function initScene() {
  if (sceneInited) return
  if (!map.getLayer('background')) return // 아직 스타일 파싱 전
  sceneInited = true
  applyTextures()
  try {
    addFlowerDecorations(map)
  } catch (error) {
    console.warn('꽃 장식 초기화 실패:', error)
  }
}
map.on('styledata', initScene)
map.on('load', initScene)
initScene()

function addMockBuildingMarker(object) {
  if (mockBuildingMarkers.has(object.id)) return

  const marker = document.createElement('button')
  marker.className = 'mock-building-marker'
  marker.type = 'button'
  marker.setAttribute('aria-label', `${object.name} mock building`)

  const tower = document.createElement('span')
  tower.className = 'mock-building-marker-tower'
  const label = document.createElement('span')
  label.className = 'mock-building-marker-label'
  label.textContent = object.name
  marker.append(tower, label)

  new maplibregl.Marker({
    element: marker,
    anchor: 'bottom',
    pitchAlignment: 'viewport',
    rotationAlignment: 'viewport',
    subpixelPositioning: true,
  })
    .setLngLat([object.lng, object.lat])
    .addTo(map)

  mockBuildingMarkers.set(object.id, marker)
}

function addCatMarker(cat) {
  if (catMarkers.has(cat.catId)) return

  const isDiscovered = cat.displayType === 'discovered_cat'
  const marker = document.createElement('button')
  marker.type = 'button'

  if (isDiscovered) {
    marker.className = 'mock-cat-info-marker mock-cat-map-marker'
    marker.setAttribute('aria-label', `${cat.name} latest sighting`)

    const image = document.createElement('img')
    image.src = cat.mainImageUrl
    image.alt = ''
    const content = document.createElement('span')
    content.className = 'mock-cat-info-content'
    const name = document.createElement('strong')
    name.textContent = cat.name
    const meta = document.createElement('small')
    meta.textContent = cat.zoneName ?? ''
    content.append(name, meta)
    marker.append(image, content)
  } else {
    // 아직 사진으로 발견하지 않은 고양이는 이름/사진 없이 "???"로만 표시한다.
    marker.className = 'mock-cat-unknown-marker mock-cat-map-marker'
    marker.setAttribute('aria-label', '아직 발견하지 않은 고양이')
    marker.textContent = '???'
  }

  const markerInstance = new maplibregl.Marker({
    element: marker,
    anchor: 'bottom',
    pitchAlignment: 'viewport',
    rotationAlignment: 'viewport',
    subpixelPositioning: true,
    offset: catMarkerOffset(),
  })
    .setLngLat([cat.lng, cat.lat])
    .addTo(map)

  catMarkers.set(cat.catId, markerInstance)
  setCatMarkerVisibility(isFollowing && !isTransitioning)
}

function syncCatMarkers(cats) {
  for (const cat of cats) {
    if (catMarkers.has(cat.catId)) {
      catMarkers.get(cat.catId).setLngLat([cat.lng, cat.lat])
    } else {
      addCatMarker(cat)
    }
  }
  setCatMarkerVisibility(isFollowing && !isTransitioning)
}

function setCatMarkerVisibility(visible) {
  const canPlaceMarker = map.getZoom() >= CAT_MARKER_MIN_VISIBLE_ZOOM
  const shouldShow = visible && canPlaceMarker
  catMarkers.forEach((marker) => {
    const element = marker.getElement()
    element.hidden = !shouldShow
    element.style.display = shouldShow ? '' : 'none'
  })
}

function updateCatMarkerPresentation() {
  const offset = catMarkerOffset()
  catMarkers.forEach((marker) => marker.setOffset(offset))
  setCatMarkerVisibility(isFollowing && !isTransitioning)
}

map.on('zoom', updateCatMarkerPresentation)

async function fetchMapObjects() {
  const params = new URLSearchParams({
    lat: String(DEFAULT_QUERY_POSITION.lat),
    lng: String(DEFAULT_QUERY_POSITION.lng),
    maxDistance: '2000',
    limit: '10',
  })
  const response = await authFetch(`/api/map/objects?${params}`)
  if (!response.ok) throw new Error('건물 정보를 불러오지 못했습니다.')
  return response.json()
}

async function fetchCatActors() {
  const params = new URLSearchParams({
    lat: String(DEFAULT_QUERY_POSITION.lat),
    lng: String(DEFAULT_QUERY_POSITION.lng),
    radius: '2000',
    includeUndiscovered: 'true',
  })
  const response = await authFetch(`/api/map/cat-actors?${params}`)
  if (!response.ok) throw new Error('고양이 정보를 불러오지 못했습니다.')
  return response.json()
}

let mapActorsInitialized = false

async function initMapActors() {
  if (mapActorsInitialized || !hasSession()) return
  mapActorsInitialized = true

  const [{ objects }, { cats }] = await Promise.all([
    fetchMapObjects(),
    fetchCatActors(),
  ])

  objects.forEach(addMockBuildingMarker)
  cats.forEach(addCatMarker)
  animatedModelLayer.setCatActors(cats)
  animatedModelLayer.setAvatarPosition([DEFAULT_QUERY_POSITION.lng, DEFAULT_QUERY_POSITION.lat])
}

function tryInitMapActors() {
  initMapActors().catch((error) => {
    mapActorsInitialized = false
    console.warn('map actors failed to initialize:', error)
  })
}

map.once('idle', tryInitMapActors)
window.addEventListener('catchme:enter-service', tryInitMapActors)

let userPos = null // 최근 GPS 위치 [lng, lat]
let userPosAccuracy = Infinity // 최근 GPS 정확도(미터)
let userPosUpdatedAt = 0 // 마지막으로 GPS를 받은 시각
let isFollowing = false // false = 전체 지도 시점, true = 마커 시점
let isTransitioning = false // flyTo 애니메이션 중인지

// 마커 시점 궤도 카메라 상태
let orbitBearing = 0 // 카메라가 마커를 도는 각도
let orbitZoom = FOLLOW_START_ZOOM // 카메라와 마커의 가까운 정도

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// 줌 값에 따라 카메라 각도(pitch)를 함께 결정 → 확대할수록 마커를 옆에서 보는 곡선 궤도
function pitchForZoom(z) {
  const t = clamp((z - FOLLOW_MIN_ZOOM) / (FOLLOW_MAX_ZOOM - FOLLOW_MIN_ZOOM), 0, 1)
  return FOLLOW_PITCH_MIN + t * (FOLLOW_PITCH_MAX - FOLLOW_PITCH_MIN)
}

function markerLngLat() {
  return userPos ?? [DEFAULT_QUERY_POSITION.lng, DEFAULT_QUERY_POSITION.lat] ?? KAIST_CENTER
}

// 현재 궤도 상태를 카메라에 즉시 반영 (마커를 항상 화면 중심에 두고 바라봄)
function applyOrbit() {
  map.jumpTo({
    center: markerLngLat(),
    zoom: orbitZoom,
    bearing: orbitBearing,
    pitch: pitchForZoom(orbitZoom),
  })
  updateCatMarkerPresentation()
}

map.on('moveend', () => {
  isTransitioning = false
  setCatMarkerVisibility(isFollowing)
})

// ─────────────────────────────────────────────
// GPS: 실시간 내 위치를 받아 마커를 이동
// ─────────────────────────────────────────────
function startPositionTracking() {
  if (MOCK_MAP_MODE) return
  if (!('geolocation' in navigator)) return
  navigator.geolocation.watchPosition(
    (pos) => {
      userPos = [pos.coords.longitude, pos.coords.latitude]
      userPosAccuracy = pos.coords.accuracy
      userPosUpdatedAt = Date.now()
      animatedModelLayer.setAvatarPosition(userPos)
      updatePreviewActors(userPos)
      // 마커 시점일 때는 카메라도 내 위치를 따라감.
      // GPS 좌표가 튀어도 화면이 순간이동하지 않게 부드럽게 이동한다.
      if (isFollowing && !isTransitioning) {
        map.easeTo({ center: userPos, duration: 800, essential: true })
      }
    },
    (err) => console.warn('위치 정보를 가져오지 못했습니다.', err),
    { enableHighAccuracy: true, maximumAge: 1000 }
  )
}

// 촬영 좌표는 watchPosition의 오래된 값이나 기본 좌표를 그대로 쓰지 않는다.
// 촬영 직전에 가능한 한 최신 고정밀 위치를 한 번 더 요청한다.
function refreshPositionForPhoto() {
  if (!('geolocation' in navigator)) return Promise.resolve(false)

  const isRecent = userPos && Date.now() - userPosUpdatedAt < 10_000
  const isAccurateEnough = Number.isFinite(userPosAccuracy) && userPosAccuracy <= 50
  if (isRecent && isAccurateEnough) return Promise.resolve(true)

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userPos = [pos.coords.longitude, pos.coords.latitude]
        userPosAccuracy = pos.coords.accuracy
        userPosUpdatedAt = Date.now()
        animatedModelLayer.setAvatarPosition(userPos)
        updatePreviewActors(userPos)
        resolve(true)
      },
      (error) => {
        console.warn('촬영 위치를 새로 가져오지 못했습니다.', error)
        resolve(Boolean(userPos))
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 6000 }
    )
  })
}

let positionTrackingStarted = false
let previewActorsInitialized = false

function initPreviewActors() {
  if (previewActorsInitialized) return
  previewActorsInitialized = true
  updatePreviewActors(markerLngLat())
}

function previewActorsAround(position) {
  const [lng, lat] = position
  const metersPerLngDegree = Math.cos((lat * Math.PI) / 180) * 111320
  return PREVIEW_CAT_ACTORS.map((actor) => ({
    ...actor,
    lng: lng + Number(actor.offsetEastMeters ?? 0) / metersPerLngDegree,
    lat: lat + Number(actor.offsetNorthMeters ?? 0) / 110540,
  }))
}

function updatePreviewActors(position) {
  if (!previewActorsInitialized) return
  const actors = previewActorsAround(position)
  syncCatMarkers(actors)
  animatedModelLayer.setCatActors(actors)
}

window.addEventListener('catchme:preview-map', () => {
  animatedModelLayer.setAvatarPosition([DEFAULT_QUERY_POSITION.lng, DEFAULT_QUERY_POSITION.lat])
  initPreviewActors()
  if (!positionTrackingStarted) {
    positionTrackingStarted = true
    startPositionTracking()
  }
  map.resize()
})

function enterApp() {
  const welcome = document.querySelector('#welcome')
  if (!welcome || welcome.classList.contains('is-leaving')) return

  welcome.classList.add('is-leaving')
  if (!positionTrackingStarted) {
    positionTrackingStarted = true
    startPositionTracking()
  }

  window.setTimeout(() => {
    welcome.remove()
    map.resize()
  }, 420)
}

document.querySelectorAll('[data-enter-app]').forEach((button) => {
  button.addEventListener('click', enterApp)
})

window.addEventListener('catchme:enter-service', enterApp)

// ─────────────────────────────────────────────
// 기본 제스처 핸들러 on/off
// 마커 시점에서는 우리가 직접 터치를 처리하므로 기본 팬/줌/회전을 끈다.
// ─────────────────────────────────────────────
const DEFAULT_HANDLERS = [
  'dragPan',
  'dragRotate',
  'touchZoomRotate',
  'touchPitch',
  'scrollZoom',
  'keyboard',
]
function setDefaultGestures(enabled) {
  for (const name of DEFAULT_HANDLERS) {
    if (enabled) map[name].enable()
    else map[name].disable()
  }
}

// ─────────────────────────────────────────────
// 시점 토글: 마커 시점 ↔ 전체 지도 시점
// ─────────────────────────────────────────────
// 추적 시점에서 카메라 초점을 화면 아래로 내리는 위쪽 패딩.
// 미쿠가 화면 하단에 서고 그 위로 풍경이 펼쳐지는 게임 카메라 구도가 된다.
function followPadding() {
  return {
    top: Math.round(map.getContainer().clientHeight * 0.5),
    bottom: 0,
    left: 0,
    right: 0,
  }
}

function toggleView() {
  if (isTransitioning) return // 전환 중 더블탭이 또 들어와 카메라가 튕기는 것 방지
  isFollowing = !isFollowing
  isTransitioning = true
  animatedModelLayer.setFollowing(isFollowing)
  setCatMarkerVisibility(false)

  if (isFollowing) {
    // 마커(내 위치) 시점으로: 궤도 카메라 초기화 + 기본 제스처 끄기.
    // 이동+줌인을 동시에 하면 easeTo(직선 보간)는 끝에서 옆으로 휙 쓸린다 →
    // flyTo의 최적 경로를 쓰되, 곡선 계수를 낮춰(기본 1.42) 뒤로 물러나는
    // 출렁임 없이 완만하게 파고들게 한다.
    // 방위는 현재 값을 유지해 줌인 중 화면이 돌지 않게 한다.
    orbitBearing = map.getBearing()
    orbitZoom = FOLLOW_START_ZOOM
    setDefaultGestures(false)
    map.flyTo({
      center: markerLngLat(),
      zoom: orbitZoom,
      bearing: orbitBearing,
      pitch: pitchForZoom(orbitZoom),
      padding: followPadding(),
      duration: 1500,
      curve: 1.1,
      essential: true,
    })
  } else {
    // 전체 캠퍼스 시점으로 복귀: 기본 제스처 다시 켜기.
    // 1인칭에서 돌려놓은 방위도 기본 시점(-20°)으로 함께 되돌린다.
    // 팬+줌아웃+회전은 flyTo의 상승 곡선에 맡기면 자연스럽게 섞인다.
    setDefaultGestures(true)
    map.flyTo({
      ...OVERVIEW_VIEW,
      padding: { top: 0, bottom: 0, left: 0, right: 0 },
      duration: 1500,
      essential: true,
    })
  }
}

// ─────────────────────────────────────────────
// 마커 시점 전용 제스처
//  · 한 손가락 스와이프 → 마커를 중심으로 카메라 궤도 회전(원운동)
//  · 두 손가락 핀치 → 확대/축소(줌+각도가 함께 변해 곡선 궤도로 다가감)
// ─────────────────────────────────────────────
const gestureTarget = map.getCanvasContainer()
let oneFingerActive = false
let lastTouchX = 0
let swipeDistance = 0 // 이번 터치에서 누적된 가로 이동량(px)
let pinchStartDist = 0
let pinchStartZoom = 0
// 스와이프/핀치 직후의 click만 무시하기 위한 마지막 제스처 시각.
// (플래그 방식은 스와이프 뒤 click이 안 오면 다음 더블탭의 첫 탭을 잡아먹는다)
let lastGestureTime = 0
const GESTURE_CLICK_IGNORE_MS = 300

function touchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  return Math.hypot(dx, dy)
}

gestureTarget.addEventListener(
  'touchstart',
  (e) => {
    if (!isFollowing || isTransitioning) return
    if (e.touches.length === 1) {
      oneFingerActive = true
      swipeDistance = 0
      lastTouchX = e.touches[0].clientX
    } else if (e.touches.length === 2) {
      oneFingerActive = false
      pinchStartDist = touchDistance(e.touches)
      pinchStartZoom = orbitZoom
      lastGestureTime = Date.now() // 핀치는 탭이 아님
    }
  },
  { passive: false }
)

gestureTarget.addEventListener(
  'touchmove',
  (e) => {
    if (!isFollowing || isTransitioning) return
    if (e.touches.length === 1 && oneFingerActive) {
      const x = e.touches[0].clientX
      const dx = x - lastTouchX
      lastTouchX = x
      // 탭할 때의 미세한 손 떨림이 회전(jumpTo)으로 이어져 화면이 튕기지 않게,
      // 누적 이동량이 데드존을 넘은 뒤부터 회전을 시작한다.
      swipeDistance += Math.abs(dx)
      if (swipeDistance < SWIPE_DEAD_ZONE_PX) return
      lastGestureTime = Date.now()
      // 손가락을 미는 방향으로 미쿠가 도는 것처럼 보이게 회전
      orbitBearing += dx * ORBIT_ROT_SPEED
      applyOrbit()
      e.preventDefault()
    } else if (e.touches.length === 2) {
      // 두 손가락 간격 비율 → 줌 변화(핀치 아웃=확대). 줌에 따라 각도도 함께 바뀜.
      const ratio = touchDistance(e.touches) / pinchStartDist
      orbitZoom = clamp(
        pinchStartZoom + Math.log2(ratio) * PINCH_SENSITIVITY,
        FOLLOW_MIN_ZOOM,
        FOLLOW_MAX_ZOOM
      )
      lastGestureTime = Date.now()
      applyOrbit()
      e.preventDefault()
    }
  },
  { passive: false }
)

gestureTarget.addEventListener(
  'touchend',
  (e) => {
    if (e.touches.length === 0) oneFingerActive = false
  },
  { passive: false }
)

// ─────────────────────────────────────────────
// 더블탭 감지 (직접 구현)
// maplibre의 기본 dblclick 이벤트는 모바일 터치에서 불안정하므로,
// click(탭/클릭 모두 발생) 사이 간격을 재서 직접 더블탭을 판정한다.
// ─────────────────────────────────────────────
const DOUBLE_TAP_MS = 400 // 두 탭 사이 최대 간격
const DOUBLE_TAP_DIST = 40 // 두 탭 사이 최대 픽셀 거리 (손가락 흔들림 허용)
let lastTapTime = 0
let lastTapPoint = null

map.on('click', (e) => {
  // 스와이프/핀치 직후의 click만 무시 (실수 토글 방지)
  if (Date.now() - lastGestureTime < GESTURE_CLICK_IGNORE_MS) return
  if (animatedModelLayer.isAvatarHit(e.point)) {
    if (animatedModelLayer.playAvatarAnimation('excited_jump')) {
      lastTapTime = 0
      lastTapPoint = null
      return
    }
  }
  const now = Date.now()
  const dt = now - lastTapTime
  const dist = lastTapPoint
    ? Math.hypot(e.point.x - lastTapPoint.x, e.point.y - lastTapPoint.y)
    : Infinity

  if (dt < DOUBLE_TAP_MS && dist < DOUBLE_TAP_DIST) {
    // 더블탭 성립
    lastTapTime = 0
    lastTapPoint = null
    toggleView()
  } else {
    // 첫 번째 탭 기록
    lastTapTime = now
    lastTapPoint = e.point
  }
})

// ─────────────────────────────────────────────
// 카메라 버튼 → 사진 촬영 → 촬영 위치에 사진 마커 + 내 고양이에 저장
// ─────────────────────────────────────────────
const cameraBtn = document.querySelector('#camera-btn')
const cameraInput = document.querySelector('#camera-input')
const photoView = document.querySelector('#photo-view')
const photoPreview = document.querySelector('#photo-preview')
const photoClose = document.querySelector('#photo-close')
const catGalleryBtn = document.querySelector('#cat-gallery-btn')
const catGallery = document.querySelector('#cat-gallery')
const galleryClose = document.querySelector('#gallery-close')
const galleryEmpty = document.querySelector('#gallery-empty')
const galleryGrid = document.querySelector('#gallery-grid')
const locationPhotos = document.querySelector('#location-photos')
const locationPhotosBackdrop = document.querySelector('#location-photos-backdrop')
const locationPhotosClose = document.querySelector('#location-photos-close')
const locationPhotoCount = document.querySelector('#location-photo-count')
const locationPhotoStrip = document.querySelector('#location-photo-strip')
const captureResult = document.querySelector('#capture-result')
const captureCandidateForm = document.querySelector('[data-capture-candidate-form]')
const captureConfirmButton = document.querySelector('[data-capture-confirm]')

const PHOTO_DB_NAME = 'kaist-cat-photos'
const PHOTO_STORE_NAME = 'photos'
const PHOTO_GROUP_RADIUS_METERS = 35
const PHOTO_GROUP_MAX_RADIUS_METERS = 140
const DEFAULT_GPS_ACCURACY_METERS = 40
const RECENT_PHOTO_SNAP_MS = 5 * 60 * 1000
const RECENT_PHOTO_SNAP_METERS = 250
let catPhotos = []
const photoMarkerGroups = new Map()
const newestPhotoFirst = (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
let pendingConfirmation = null
let pendingCapturedPhoto = null
let pendingNewCatId = null

function normalizedGpsAccuracy(accuracy) {
  if (!Number.isFinite(accuracy) || accuracy <= 0) return DEFAULT_GPS_ACCURACY_METERS
  return clamp(accuracy, 5, 80)
}

// 두 GPS 측정의 오차 원이 겹치면 같은 촬영 장소로 본다.
// 실내에서 위치가 튀는 상황을 위해 10m 여유를 더하되, 다른 건물까지 합쳐지지 않게 상한을 둔다.
function photoGroupRadius(firstAccuracy, secondAccuracy) {
  return clamp(
    normalizedGpsAccuracy(firstAccuracy) + normalizedGpsAccuracy(secondAccuracy) + 10,
    PHOTO_GROUP_RADIUS_METERS,
    PHOTO_GROUP_MAX_RADIUS_METERS
  )
}

// 큰 사진을 그대로 저장하면 휴대폰 저장 공간을 빠르게 차지하므로
// 긴 변을 1600px로 줄인 JPEG로 보관한다.
function imageFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      const maxSide = 1600
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(image.naturalWidth * scale)
      canvas.height = Math.round(image.naturalHeight * scale)
      const context = canvas.getContext('2d')
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(objectUrl)
      resolve(canvas.toDataURL('image/jpeg', 0.86))
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('사진을 읽지 못했습니다.'))
    }
    image.src = objectUrl
  })
}

function originalFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error ?? new Error('사진 원본을 읽지 못했습니다.'))
    reader.readAsDataURL(file)
  })
}

function openPhotoDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('이 브라우저는 사진 저장소를 지원하지 않습니다.'))
      return
    }

    const request = indexedDB.open(PHOTO_DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PHOTO_STORE_NAME)) {
        request.result.createObjectStore(PHOTO_STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readStoredPhotos() {
  const database = await openPhotoDatabase()
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(PHOTO_STORE_NAME, 'readonly')
      .objectStore(PHOTO_STORE_NAME)
      .getAll()
    request.onsuccess = () => {
      database.close()
      resolve(request.result)
    }
    request.onerror = () => {
      database.close()
      reject(request.error)
    }
  })
}

async function storePhoto(photo) {
  const database = await openPhotoDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PHOTO_STORE_NAME, 'readwrite')
    transaction.objectStore(PHOTO_STORE_NAME).put(photo)
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => {
      database.close()
      reject(transaction.error)
    }
  })
}

function showPhoto(dataUrl) {
  photoPreview.src = dataUrl
  photoView.hidden = false
}

function returnToMap() {
  photoView.hidden = true
  catGallery.hidden = true
  locationPhotos.hidden = true
  photoPreview.removeAttribute('src')
  window.hideCameraView?.()
}

function showLocationPhotos(photos) {
  const sortedPhotos = [...photos].sort(newestPhotoFirst)
  locationPhotoStrip.replaceChildren()
  locationPhotoCount.textContent = `${sortedPhotos.length}장`

  sortedPhotos.forEach((photo, index) => {
    const card = document.createElement('button')
    card.className = 'location-photo-card'
    card.type = 'button'
    card.setAttribute('aria-label', `${photoDateLabel(photo.createdAt)}에 찍은 사진 크게 보기`)

    const image = document.createElement('img')
    image.src = photo.dataUrl
    image.alt = '이 위치에서 촬영한 고양이'
    const date = document.createElement('time')
    date.dateTime = photo.createdAt
    date.textContent = photoDateLabel(photo.createdAt)
    card.append(image, date)
    card.addEventListener('click', () => showPhoto(photo.dataUrl))
    locationPhotoStrip.append(card)
  })

  locationPhotos.hidden = false

  // 모든 카드가 화면 아래 중앙의 한 카드 덱에서 한 장씩 나와 제자리로 가도록 연출한다.
  requestAnimationFrame(() => {
    const stripRect = locationPhotoStrip.getBoundingClientRect()
    const deckCenterX = stripRect.left + stripRect.width / 2
    const deckCenterY = stripRect.bottom - 18
    const cards = locationPhotoStrip.querySelectorAll('.location-photo-card')

    cards.forEach((card, index) => {
      const cardRect = card.getBoundingClientRect()
      const cardCenterX = cardRect.left + cardRect.width / 2
      const cardCenterY = cardRect.top + cardRect.height / 2
      card.style.setProperty('--deck-x', `${deckCenterX - cardCenterX}px`)
      card.style.setProperty('--deck-y', `${deckCenterY - cardCenterY}px`)
      card.style.setProperty('--deal-rotate', `${index % 2 === 0 ? -9 : 9}deg`)
      card.style.animationDelay = `${Math.min(index * 115, 920)}ms`
      card.style.zIndex = `${cards.length - index}`
      card.classList.add('is-dealt')
    })
  })
}

function nearestPhotoMarkerGroup(position, accuracy) {
  let nearestGroup = null
  let nearestDistance = Infinity

  for (const group of photoMarkerGroups.values()) {
    const distance = distanceInMeters(position, group.position)
    const groupingRadius = photoGroupRadius(accuracy, group.accuracy)
    if (distance <= groupingRadius && distance < nearestDistance) {
      nearestGroup = group
      nearestDistance = distance
    }
  }
  return nearestGroup
}

function addPhotoMarker(photo, animate = true) {
  const photoAccuracy = normalizedGpsAccuracy(photo.accuracy)
  const existingGroup = nearestPhotoMarkerGroup(photo.position, photoAccuracy)

  if (existingGroup) {
    existingGroup.photos.push(photo)
    existingGroup.photos.sort(newestPhotoFirst)
    existingGroup.count = existingGroup.photos.length
    existingGroup.accuracy = Math.max(existingGroup.accuracy, photoAccuracy)
    existingGroup.badge.textContent = existingGroup.count
    existingGroup.badge.hidden = false
    existingGroup.element.setAttribute(
      'aria-label',
      `이 위치에서 찍은 고양이 사진 ${existingGroup.count}장 보기`
    )

    // 해당 좌표에서 가장 최근에 찍은 사진을 항상 대표 이미지로 사용한다.
    if (new Date(photo.createdAt) > new Date(existingGroup.representativeCreatedAt)) {
      existingGroup.dataUrl = photo.dataUrl
      existingGroup.image.src = photo.dataUrl
      existingGroup.representativeCreatedAt = photo.createdAt
    }
    return
  }

  const element = document.createElement('button')
  element.className = 'photo-marker photo-marker--model'
  element.type = 'button'
  element.setAttribute('aria-label', '이 위치에서 찍은 고양이 사진 1장 보기')

  const bubble = document.createElement('span')
  bubble.className = 'photo-marker-bubble'
  if (!animate) bubble.classList.add('is-restored')

  const image = document.createElement('img')
  image.src = photo.dataUrl
  image.alt = ''
  const badge = document.createElement('span')
  badge.className = 'photo-marker-count'
  badge.hidden = true
  badge.textContent = '1'
  bubble.append(image, badge)
  element.append(bubble)

  const group = {
    count: 1,
    dataUrl: photo.dataUrl,
    representativeCreatedAt: photo.createdAt,
    photos: [photo],
    position: photo.position,
    accuracy: photoAccuracy,
    element,
    image,
    badge,
  }
  photoMarkerGroups.set(photo.id, group)
  animatedModelLayer.addCat(photo.id, photo.position)

  element.addEventListener('click', (event) => {
    event.stopPropagation()
    showLocationPhotos(group.photos)
  })

  new maplibregl.Marker({
    element,
    anchor: 'bottom',
    pitchAlignment: 'viewport',
    rotationAlignment: 'viewport',
    subpixelPositioning: true,
  })
    .setLngLat(photo.position)
    .addTo(map)
}

function distanceInMeters(from, to) {
  const radians = (degrees) => (degrees * Math.PI) / 180
  const earthRadius = 6371000
  const lat1 = radians(from[1])
  const lat2 = radians(to[1])
  const deltaLat = lat2 - lat1
  const deltaLng = radians(to[0] - from[0])
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2
  return 2 * earthRadius * Math.asin(Math.sqrt(a))
}

// 실내 GPS는 같은 자리에서도 좌표가 계속 흔들릴 수 있다.
// 촬영 시간과 관계없이 기존 사진 중 GPS 오차 범위 안의 가장 가까운 위치에 맞춘다.
function stablePhotoPosition() {
  const current = [...markerLngLat()]
  const currentAccuracy = normalizedGpsAccuracy(userPosAccuracy)
  let nearestPhoto = null
  let nearestDistance = Infinity

  for (const photo of catPhotos) {
    const distance = distanceInMeters(current, photo.position)
    const samePlaceRadius = photoGroupRadius(currentAccuracy, photo.accuracy)
    if (distance <= samePlaceRadius && distance < nearestDistance) {
      nearestPhoto = photo
      nearestDistance = distance
    }
  }
  if (nearestPhoto) return [...nearestPhoto.position]

  // 휴대폰 GPS가 순간적으로 크게 튀더라도, 짧은 시간 안에 같은 자리에서
  // 연속 촬영한 사진은 별개의 장소로 갈라지지 않게 최근 위치에 맞춘다.
  const mostRecentPhoto = catPhotos[0]
  if (mostRecentPhoto) {
    const elapsed = Date.now() - Date.parse(mostRecentPhoto.createdAt)
    const distance = distanceInMeters(current, mostRecentPhoto.position)
    if (elapsed <= RECENT_PHOTO_SNAP_MS && distance <= RECENT_PHOTO_SNAP_METERS) {
      return [...mostRecentPhoto.position]
    }
  }

  return current
}

function photoDateLabel(isoDate) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(isoDate))
}

function renderGallery() {
  galleryGrid.replaceChildren()
  galleryEmpty.hidden = catPhotos.length > 0

  for (const photo of catPhotos) {
    const card = document.createElement('button')
    card.className = 'gallery-card'
    card.type = 'button'
    card.setAttribute('aria-label', `${photoDateLabel(photo.createdAt)}에 찍은 고양이 사진`)

    const image = document.createElement('img')
    image.src = photo.dataUrl
    image.alt = '촬영한 고양이'
    const date = document.createElement('time')
    date.dateTime = photo.createdAt
    date.textContent = photoDateLabel(photo.createdAt)
    card.append(image, date)
    card.addEventListener('click', () => showPhoto(photo.dataUrl))
    galleryGrid.append(card)
  }
}

function formatPercent(value) {
  if (!Number.isFinite(Number(value))) return null
  return `${Math.round(Number(value) * 100)}%`
}

function capturePhotoUrl(data) {
  return data?.cat?.mainImageUrl || data?.cat?.representativePhotoUrl || data?.imageUrl || null
}

function setCaptureCopy(panelName, { kicker, title, description } = {}) {
  const panel = document.querySelector(`[data-capture-panel="${panelName}"]`)
  if (!panel) return
  const kickerElement = panel.querySelector('.capture-result-kicker')
  const titleElement = panel.querySelector('.capture-result-copy h1')
  const descriptionElement = panel.querySelector('.capture-result-copy p')
  if (kickerElement && kicker !== undefined) kickerElement.textContent = kicker
  if (titleElement && title) titleElement.textContent = title
  if (descriptionElement && description) descriptionElement.textContent = description
}

function renderMatchedCapture(data, imageUrl) {
  const catName = data?.cat?.name || '이 고양이'
  setCaptureCopy('existing', {
    kicker: data?.cat?.isNewCollection ? '도감에 새로 담겼어요!' : '도감에서 찾았어요!',
    title: `${catName}를 만났어요`,
    description: data?.message || '목격 기록과 도감이 업데이트됐어요.',
  })

  const badge = document.querySelector('.capture-match-badge')
  if (badge) badge.textContent = '일치 완료'

  const card = document.querySelector('.capture-cat-card')
  if (card) {
    const name = card.querySelector('h2')
    const description = card.querySelector('p')
    const index = card.querySelector('strong')
    if (name) {
      name.textContent = catName
      const paw = document.createElement('span')
      paw.textContent = ' 🐾'
      name.append(paw)
    }
    if (description) description.textContent = data?.cat?.isNewCollection ? '처음 만난 고양이로 도감에 추가됐어요.' : '이전에 만난 고양이와 일치했어요.'
    if (index) index.textContent = data?.cat?.id ? `도감 #${data.cat.id}` : '도감'
  }

  const foundInfo = document.querySelector('.capture-found-info')
  if (foundInfo) {
    foundInfo.replaceChildren(
      Object.assign(document.createElement('span'), { textContent: `📍 ${photoDateLabel(new Date().toISOString())}` }),
      Object.assign(document.createElement('span'), { textContent: `기록 #${data?.sightingId ?? '-'}` })
    )
  }

  window.showCaptureResult?.('existing', imageUrl || capturePhotoUrl(data))
}

function renderNewCatCapture(data, imageUrl) {
  // 이 고양이의 id를 기억해 두면 아래 이름짓기 폼(2-1)에서 바로 이름을 저장할 수 있다.
  pendingNewCatId = data?.cat?.id ?? null
  setCaptureCopy('new', {
    title: '새로운 고양이를 발견했어요!',
    description: data?.message || '처음 만난 고양이로 도감에 등록됐어요.',
  })
  const saveCopy = document.querySelector('.capture-save-copy')
  if (saveCopy) {
    const title = saveCopy.querySelector('h2')
    const description = saveCopy.querySelector('p')
    if (title) title.textContent = '이 고양이 이름을 지어주세요'
    if (description) description.textContent = '도감에 등록됐어요. 아래에서 이름을 지어주세요.'
  }
  // 이전 촬영에서 남은 입력/메시지를 초기화한다.
  const nameInput = document.querySelector('#new-cat-name-input')
  const nameMessage = document.querySelector('#new-cat-name-message')
  if (nameInput) nameInput.value = ''
  if (nameMessage) {
    nameMessage.textContent = ''
    nameMessage.hidden = true
  }
  window.showCaptureResult?.('new', imageUrl || capturePhotoUrl(data))
}

function renderFailureCapture(data, imageUrl) {
  const isLowQuality = data?.detectionStatus === 'low_quality'
  setCaptureCopy('failure', {
    title: isLowQuality ? '사진을 다시 찍어주세요' : '고양이를 감지하지 못했어요',
    description: data?.message || (isLowQuality ? '고양이는 보이지만 사진이 흐리거나 너무 작아요.' : '고양이가 화면 안에 잘 보이도록 다시 찍어주세요.'),
  })
  window.showCaptureResult?.('failure', imageUrl)
}

function renderCandidateOption(candidate) {
  const label = document.createElement('label')
  label.className = 'capture-candidate-item'

  const avatar = document.createElement('span')
  avatar.className = 'capture-candidate-avatar'
  avatar.setAttribute('aria-hidden', 'true')
  avatar.textContent = '🐱'

  const info = document.createElement('span')
  info.className = 'capture-candidate-info'
  const name = document.createElement('strong')
  name.textContent = candidate.name || `고양이 #${candidate.catId}`
  const meta = document.createElement('span')
  const score = formatPercent(candidate.finalScore)
  meta.textContent = [candidate.distanceMeters ? `📍 ${Math.round(candidate.distanceMeters)}m 근처` : null, score].filter(Boolean).join(' · ')
  info.append(name, meta)

  const input = document.createElement('input')
  input.type = 'radio'
  input.name = 'cat-candidate'
  input.value = candidate.catId
  input.dataset.catId = candidate.catId

  const radio = document.createElement('span')
  radio.className = 'capture-candidate-radio'
  radio.setAttribute('aria-hidden', 'true')
  label.append(avatar, info, input, radio)
  return label
}

function renderNewCatOption(labelText = '처음 보는 고양이 같아요') {
  const label = document.createElement('label')
  label.className = 'capture-candidate-item capture-candidate-item--muted'
  label.innerHTML = `
    <span class="capture-candidate-avatar capture-candidate-avatar--muted" aria-hidden="true">🐾</span>
    <span class="capture-candidate-info">
      <strong>${labelText}</strong>
      <span>목록에 없으면 새 고양이로 기록해요</span>
    </span>
    <input type="radio" name="cat-candidate" value="new-cat" data-new-cat="true" />
    <span class="capture-candidate-radio" aria-hidden="true"></span>
  `
  return label
}

function renderCandidatesCapture(data, imageUrl) {
  pendingConfirmation = { photoId: data.photoId, imageUrl, photo: pendingCapturedPhoto }
  setCaptureCopy('candidates', {
    title: '어떤 고양이인가요?',
    description: data?.message || '비슷한 고양이가 여러 마리 보여요. 가장 가까운 고양이를 골라주세요.',
  })

  captureCandidateForm?.replaceChildren(
    ...(data?.candidates ?? []).map(renderCandidateOption),
    renderNewCatOption(data?.newCatOption?.label)
  )
  window.showCaptureResult?.('candidates', imageUrl)
}

function renderCaptureResponse(data, imageUrl) {
  switch (data?.detectionStatus) {
    case 'matched':
      renderMatchedCapture(data, imageUrl)
      break
    case 'new_cat_candidate':
      renderNewCatCapture(data, imageUrl)
      break
    case 'needs_user_confirmation':
      renderCandidatesCapture(data, imageUrl)
      break
    case 'low_quality':
    case 'rejected':
    default:
      renderFailureCapture(data, imageUrl)
      break
  }
}

async function uploadSighting(file, position) {
  const formData = new FormData()
  formData.set('image', file)
  formData.set('longitude', String(position[0]))
  formData.set('latitude', String(position[1]))

  const response = await authFetch('/api/sightings', {
    method: 'POST',
    body: formData,
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message ?? '사진을 제출하지 못했습니다.')
  return data
}

async function confirmSightingCandidate(selected) {
  if (!pendingConfirmation?.photoId) throw new Error('확인할 사진 정보가 없습니다.')
  const body = selected?.dataset?.newCat === 'true'
    ? { selectedCatId: null, isNewCatCandidate: true }
    : { selectedCatId: Number(selected.dataset.catId || selected.value) }

  const response = await authFetch(`/api/sightings/${pendingConfirmation.photoId}/confirm-cat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message ?? '고양이를 확정하지 못했습니다.')
  return data
}

async function keepSuccessfulPhoto(photo) {
  if (!photo) return
  catPhotos.unshift(photo)
  addPhotoMarker(photo)
  renderGallery()

  try {
    await storePhoto(photo)
  } catch (error) {
    console.warn('고양이 사진을 브라우저에 저장하지 못했습니다.', error)
  }
}

async function restorePhotos() {
  try {
    const storedPhotos = await readStoredPhotos()
    catPhotos = storedPhotos
      .filter((photo) => Array.isArray(photo.position) && photo.dataUrl)
      .sort(newestPhotoFirst)
    catPhotos.forEach((photo) => addPhotoMarker(photo, false))
    renderGallery()
  } catch (error) {
    console.warn('저장한 고양이 사진을 불러오지 못했습니다.', error)
  }
}

// 버튼을 누르면 다른 화면을 모두 닫고 실제 카메라 뷰파인더를 연다.
cameraBtn.addEventListener('click', () => {
  returnToMap()
  if (window.showCameraView) {
    window.showCameraView()
  } else {
    cameraInput.click()
  }
})

// 뷰파인더에서 촬영했거나 기본 카메라/앨범에서 고른 사진을 공통 처리한다.
async function processCapturedFile(file) {
  if (!file) return
  returnToMap()

  try {
    // 시작 직후 촬영해도 기존 사진 복원 작업이 새 사진을 덮어쓰지 않게 기다린다.
    await photoRestorePromise
    // 첫 촬영이 기본 좌표에 저장되는 GPS 오류를 막는다.
    const hasPhotoPosition = await refreshPositionForPhoto()
    if (!hasPhotoPosition) {
      window.alert('사진 위치를 확인할 수 없습니다. 위치 권한을 허용한 뒤 다시 촬영해 주세요.')
      return
    }
    let dataUrl
    try {
      dataUrl = await imageFileToDataUrl(file)
    } catch (compressionError) {
      console.warn('사진 압축에 실패해 원본을 저장합니다.', compressionError)
      dataUrl = await originalFileToDataUrl(file)
    }
    const position = stablePhotoPosition()
    const photo = {
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      dataUrl,
      position,
      accuracy: normalizedGpsAccuracy(userPosAccuracy),
      createdAt: new Date().toISOString(),
    }

    pendingCapturedPhoto = photo
    const result = await uploadSighting(file, position)
    renderCaptureResponse(result, dataUrl)

    if (['matched', 'new_cat_candidate'].includes(result?.detectionStatus)) {
      await keepSuccessfulPhoto(photo)
      pendingCapturedPhoto = null
    }
  } catch (error) {
    console.warn('사진 처리에 실패했습니다.', error)
    renderFailureCapture({
      detectionStatus: 'rejected',
      message: error?.message ?? '사진을 제출하지 못했습니다. 잠시 후 다시 시도해주세요.',
    })
  } finally {
    cameraInput.value = '' // 연속 촬영과 같은 사진 재선택을 허용
  }
}

captureCandidateForm?.addEventListener('submit', async (event) => {
  event.preventDefault()
  const selected = captureCandidateForm.querySelector('input[name="cat-candidate"]:checked')
  if (!selected) {
    setCaptureCopy('candidates', {
      description: '후보 중 하나를 골라주세요.',
    })
    return
  }

  captureConfirmButton.disabled = true
  captureConfirmButton.textContent = '확인 중...'

  try {
    const result = await confirmSightingCandidate(selected)
    renderCaptureResponse(result, pendingConfirmation?.imageUrl)
    if (['matched', 'new_cat_candidate'].includes(result?.detectionStatus)) {
      await keepSuccessfulPhoto(pendingConfirmation?.photo)
      pendingConfirmation = null
      pendingCapturedPhoto = null
    }
  } catch (error) {
    console.warn('고양이 후보 확정에 실패했습니다.', error)
    setCaptureCopy('candidates', {
      description: error?.message ?? '고양이를 확정하지 못했습니다. 다시 시도해주세요.',
    })
  } finally {
    captureConfirmButton.disabled = false
    captureConfirmButton.textContent = '선택 완료 🐾'
  }
})

cameraInput.addEventListener('change', () => {
  processCapturedFile(cameraInput.files?.[0])
})

window.addEventListener('catchme:camera-captured', (event) => {
  processCapturedFile(event.detail?.file)
})

function closePhoto() {
  photoView.hidden = true
  photoPreview.removeAttribute('src')
  cameraInput.value = '' // 같은 사진도 다시 선택 가능하게 초기화
}

photoClose.addEventListener('click', closePhoto)
// 4-1 GET /gallery/me: 서버에 저장된 내 사진으로 갤러리를 채운다.
async function loadServerGallery() {
  try {
    const data = await getGallery({ limit: 100 })
    const photos = data.photos ?? []
    const cards = photos.map((photo) => {
      const url = resolveAssetUrl(photo.imageUrl)
      const card = document.createElement('button')
      card.className = 'gallery-card'
      card.type = 'button'
      card.setAttribute(
        'aria-label',
        photo.catName ? `${photo.catName} · ${photoDateLabel(photo.takenAt)}` : photoDateLabel(photo.takenAt)
      )
      const image = document.createElement('img')
      image.src = url
      image.alt = photo.catName || '촬영한 고양이'
      image.loading = 'lazy'
      const time = document.createElement('time')
      time.dateTime = photo.takenAt
      time.textContent = photoDateLabel(photo.takenAt)
      card.append(image, time)
      card.addEventListener('click', () => showPhoto(url))
      return card
    })
    galleryGrid.replaceChildren(...cards)
    galleryEmpty.hidden = photos.length > 0
  } catch (error) {
    // 실패하면 renderGallery()가 이미 그려둔 로컬 사진을 그대로 둔다.
    console.warn('갤러리를 불러오지 못했습니다.', error)
  }
}

catGalleryBtn.addEventListener('click', () => {
  renderGallery() // 로컬 사진을 먼저 즉시 표시(빠름)
  catGallery.hidden = false
  loadServerGallery() // 서버 사진으로 교체(4-1)
})
galleryClose.addEventListener('click', () => {
  catGallery.hidden = true
})
locationPhotosBackdrop.addEventListener('click', () => {
  locationPhotos.hidden = true
})
locationPhotosClose.addEventListener('click', () => {
  locationPhotos.hidden = true
})

const photoRestorePromise = restorePhotos()

const settingsScreen = document.querySelector('#settings-screen')
const settingsNameForm = document.querySelector('#settings-name-form')
const settingsNameInput = document.querySelector('#settings-name-input')
const settingsImageInput = document.querySelector('#settings-image-input')
const settingsMessage = document.querySelector('#settings-message')

function showSettingsMessage(message = '', isError = false) {
  if (!settingsMessage) return
  settingsMessage.textContent = message
  settingsMessage.hidden = !message
  settingsMessage.classList.toggle('is-error', isError)
}

function currentDisplayName() {
  const user = getStoredUser()
  return user?.nickname || user?.username || '캣집사'
}

function updateDisplayedName(name) {
  const safeName = name || '캣집사'
  const profileName = document.querySelector('#profile-dex-name')
  if (profileName) {
    profileName.textContent = safeName
    const paw = document.createElement('span')
    paw.setAttribute('aria-hidden', 'true')
    paw.textContent = ' 🐾'
    profileName.append(paw)
  }

  const greeting = document.querySelector('.cat-menu-greeting p')
  if (greeting) {
    greeting.replaceChildren(
      document.createTextNode(`${safeName}님,`),
      document.createElement('br'),
      Object.assign(document.createElement('strong'), { textContent: '안녕하세요! ' })
    )
    const strong = greeting.querySelector('strong')
    const paw = document.createElement('span')
    paw.setAttribute('aria-hidden', 'true')
    paw.textContent = '🐾'
    strong?.append(paw)
  }
}

function openSettingsScreen() {
  if (!settingsScreen || !settingsNameInput) return
  settingsNameInput.value = currentDisplayName()
  if (settingsImageInput) settingsImageInput.value = getStoredUser()?.profileImageUrl || ''
  showSettingsMessage()
  settingsScreen.hidden = false
  settingsNameInput.focus()
}

function closeSettingsScreen() {
  if (!settingsScreen) return
  settingsScreen.hidden = true
  if (window.location.hash === '#settings') {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }
}

window.showSettingsScreen = openSettingsScreen
document.querySelectorAll('[data-open-settings]').forEach((button) => {
  button.addEventListener('click', openSettingsScreen)
})
document.querySelectorAll('[data-settings-close]').forEach((button) => {
  button.addEventListener('click', closeSettingsScreen)
})

// 도감(profile-dex)에 서버 컬렉션(GET /api/collection) 실데이터를 채운다.
const dexGrid = document.querySelector('.profile-dex-grid')
const dexProgress = document.querySelector('.profile-dex-progress')
const dexFoundStat = document.querySelector('.profile-dex-stats .profile-dex-stat:first-child strong')
const catDetailScreen = document.querySelector('#cat-detail')

// 백엔드 pattern 값을 카드 배경 클래스에 대응시킨다. 없으면 기본 초록 배경.
const DEX_PATTERN_CLASS = {
  tabby: 'dex-card-photo--tabby',
  brown_tabby: 'dex-card-photo--tabby',
  calico: 'dex-card-photo--calico',
  tricolor: 'dex-card-photo--calico',
  black: 'dex-card-photo--black',
}

function resolveAssetUrl(url) {
  if (!url) return null
  return url.startsWith('/') ? `${API_BASE_URL}${url}` : url
}

function catEmoji(pattern) {
  return pattern === 'black' ? '🐈‍⬛' : '🐈'
}

// catId(string) → 컬렉션 항목. 상세 화면에서 즐겨찾기/표시이름을 즉시 참조하려고 보관.
const dexCollectionById = new Map()

function buildDexCard(cat) {
  const button = document.createElement('button')
  button.className = 'dex-card'
  button.type = 'button'
  button.dataset.catId = cat.catId
  button.dataset.openDetail = ''

  const photo = document.createElement('span')
  photo.className = 'dex-card-photo'
  const patternClass = DEX_PATTERN_CLASS[cat.pattern]
  if (patternClass) photo.classList.add(patternClass)

  const imageUrl = resolveAssetUrl(cat.mainImageUrl)
  if (imageUrl) {
    const img = document.createElement('img')
    img.src = imageUrl
    img.alt = ''
    img.loading = 'lazy'
    photo.append(img)
  } else {
    const emoji = document.createElement('span')
    emoji.setAttribute('aria-hidden', 'true')
    emoji.textContent = cat.pattern === 'black' ? '🐈‍⬛' : '🐈'
    photo.append(emoji)
  }

  const name = document.createElement('strong')
  name.textContent = cat.displayName || `고양이 #${cat.catId}`

  button.append(photo, name)
  return button
}

function buildLockedDexCard() {
  const card = document.createElement('div')
  card.className = 'dex-card dex-card--locked'
  card.setAttribute('aria-hidden', 'true')
  const photo = document.createElement('span')
  photo.className = 'dex-card-photo'
  photo.append(Object.assign(document.createElement('span'), { textContent: '🐈' }))
  card.append(photo, Object.assign(document.createElement('strong'), { textContent: '???' }))
  return card
}

// 컬렉션(내 발견분)만으로 그리는 폴백 렌더. GET /cats가 실패했을 때 사용.
function renderDexCollection(cats) {
  if (!dexGrid) return
  const found = cats.length
  if (dexFoundStat) dexFoundStat.textContent = String(found)
  if (dexProgress) dexProgress.textContent = `${found}마리 발견`

  const cards = cats.map(buildDexCard)
  // 도감이 휑해 보이지 않도록 최소 6칸까지 잠긴 카드로 채운다.
  for (let i = cards.length; i < 6; i += 1) cards.push(buildLockedDexCard())
  dexGrid.replaceChildren(...cards)
}

// 1-1 GET /cats: 전체 도감(발견 + 미발견 ???)을 그린다.
// 발견한 고양이는 컬렉션의 개인 별명/즐겨찾기 정보로 보강한다.
function renderDexFromCats(cats) {
  if (!dexGrid) return
  const discovered = cats.filter((cat) => cat.isDiscovered)
  if (dexFoundStat) dexFoundStat.textContent = String(discovered.length)
  if (dexProgress) dexProgress.textContent = `${discovered.length} / ${cats.length}`

  const cards = cats.map((cat) => {
    if (!cat.isDiscovered) return buildLockedDexCard()
    const mine = dexCollectionById.get(String(cat.id))
    return buildDexCard({
      catId: cat.id,
      displayName: mine?.displayName || cat.name,
      mainImageUrl: cat.mainImageUrl,
      pattern: cat.pattern,
    })
  })
  dexGrid.replaceChildren(...cards)
}

let dexLoading = false
async function loadDexCollection() {
  if (!dexGrid || dexLoading) return
  dexLoading = true
  try {
    // 전체 목록(1-1)과 내 컬렉션(3-1)을 함께 불러온다.
    // 컬렉션은 상세 화면의 즐겨찾기/별명 참조(dexCollectionById)에도 쓰인다.
    const [catsData, collectionData] = await Promise.all([
      getCats().catch(() => null),
      getCollection().catch(() => ({ cats: [] })),
    ])
    dexCollectionById.clear()
    ;(collectionData.cats ?? []).forEach((cat) => dexCollectionById.set(String(cat.catId), cat))

    if (catsData?.cats) {
      renderDexFromCats(catsData.cats)
    } else {
      renderDexCollection(collectionData.cats ?? [])
    }
  } catch (error) {
    console.warn('도감을 불러오지 못했습니다.', error)
  } finally {
    dexLoading = false
  }
}

// ── 고양이 상세(cat-detail): GET /cats/:id + /cats/:id/sightings + 즐겨찾기(3-3) ──
const catDetailFav = catDetailScreen?.querySelector('.cat-detail-fav')
const catDetailPhoto = catDetailScreen?.querySelector('[data-detail-photo]')
const catDetailName = catDetailScreen?.querySelector('#cat-detail-name')
const catDetailPlace = catDetailScreen?.querySelector('.cat-detail-name-block p:first-of-type')
const catDetailDate = catDetailScreen?.querySelector('.cat-detail-date')
const catDetailRecord = catDetailScreen?.querySelector('.cat-detail-record p')
const catDetailCount = catDetailScreen?.querySelector('.cat-detail-count')
const nicknameBtn = catDetailScreen?.querySelector('[data-nickname-edit]')
const nicknameForm = catDetailScreen?.querySelector('[data-nickname-form]')
const nicknameInput = nicknameForm?.querySelector('input')
let detailCatId = null

function resetNicknameEditor() {
  if (nicknameForm) nicknameForm.hidden = true
  if (nicknameBtn) nicknameBtn.hidden = false
}

function setDetailName(name) {
  if (!catDetailName) return
  const paw = document.createElement('span')
  paw.setAttribute('aria-hidden', 'true')
  paw.textContent = '🐾'
  catDetailName.replaceChildren(document.createTextNode(`${name} `), paw)
}

function setDetailFavorite(isFavorite) {
  catDetailFav?.setAttribute('aria-pressed', isFavorite ? 'true' : 'false')
}

function fillDetailPhoto(imageUrl, pattern) {
  if (!catDetailPhoto) return
  const emoji = catDetailPhoto.querySelector('.capture-photo-cat')
  const resolved = resolveAssetUrl(imageUrl)
  if (resolved) {
    catDetailPhoto.style.backgroundImage = `url("${resolved}")`
    catDetailPhoto.classList.add('has-photo')
  } else {
    catDetailPhoto.style.backgroundImage = ''
    catDetailPhoto.classList.remove('has-photo')
    if (emoji) emoji.textContent = catEmoji(pattern)
  }
}

async function openCatDetail(catId) {
  if (!catDetailScreen) return
  detailCatId = String(catId)
  const item = dexCollectionById.get(String(catId))
  // 컬렉션 정보로 이름/즐겨찾기를 먼저 채워 깜빡임을 줄인다.
  setDetailName(item?.displayName || '???')
  setDetailFavorite(Boolean(item?.isFavorite))
  fillDetailPhoto(item?.mainImageUrl, item?.pattern)
  resetNicknameEditor()
  // 도감/즐겨찾기 화면 위에서 열려도 항상 최상단에 보이도록 한다.
  catDetailScreen.style.zIndex = '30'
  catDetailScreen.hidden = false

  try {
    const [cat, sightingsData] = await Promise.all([
      getCat(catId),
      getCatSightings(catId).catch(() => ({ sightings: [] })),
    ])
    setDetailName(item?.customName || cat.name || cat.displayName || '???')
    fillDetailPhoto(cat.mainImageUrl, cat.pattern)
    if (catDetailDate) catDetailDate.textContent = cat.discoveredAt ? `${photoDateLabel(cat.discoveredAt)} 발견` : ''
    if (catDetailRecord) catDetailRecord.textContent = cat.description || cat.personality || '아직 기록이 없어요.'
    if (catDetailPlace) catDetailPlace.textContent = cat.personality || ''

    const sightings = sightingsData.sightings ?? []
    if (catDetailCount && catDetailCount.lastChild) {
      catDetailCount.lastChild.textContent = ` ${sightings.length}회 목격`
    }
  } catch (error) {
    console.warn('고양이 상세를 불러오지 못했습니다.', error)
  }
}

// 즐겨찾기 토글(낙관적 업데이트 + 실패 시 롤백)
catDetailFav?.addEventListener('click', async () => {
  if (detailCatId == null) return
  const next = catDetailFav.getAttribute('aria-pressed') !== 'true'
  setDetailFavorite(next)
  try {
    const result = await setFavorite(detailCatId, next)
    const isFav = Boolean(result.isFavorite)
    setDetailFavorite(isFav)
    const item = dexCollectionById.get(detailCatId)
    if (item) item.isFavorite = isFav
  } catch (error) {
    console.warn('즐겨찾기 변경에 실패했습니다.', error)
    setDetailFavorite(!next)
  }
})

// 새로 그린 카드도 클릭하면 해당 catId로 상세 화면이 열리도록 위임 리스너를 건다.
dexGrid?.addEventListener('click', (event) => {
  const card = event.target.closest('.dex-card')
  if (!card || card.classList.contains('dex-card--locked')) return
  const catId = card.dataset.catId
  if (catId) openCatDetail(catId)
})

// ── 프로필 통계(5-1 GET /profile/me): 도감 상단 발견/사진 수 + 프로필 이미지 ──
const dexStats = document.querySelectorAll('.profile-dex-stats .profile-dex-stat strong')
const dexAvatar = document.querySelector('.profile-dex-avatar')

async function loadProfileStats() {
  try {
    const me = await getProfile()
    if (dexStats[0] && me.discoveredCount != null) dexStats[0].textContent = String(me.discoveredCount)
    if (dexStats[1] && me.sightingCount != null) dexStats[1].textContent = String(me.sightingCount)
    const avatarUrl = resolveAssetUrl(me.profileImageUrl)
    if (avatarUrl && dexAvatar) {
      const img = document.createElement('img')
      img.src = avatarUrl
      img.alt = ''
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit'
      dexAvatar.replaceChildren(img)
    }
  } catch (error) {
    console.warn('프로필을 불러오지 못했습니다.', error)
  }
}

// 도감을 열 때마다 최신 컬렉션과 프로필 통계를 다시 불러온다.
const baseShowProfileDex = window.showProfileDex
window.showProfileDex = () => {
  baseShowProfileDex?.()
  loadDexCollection()
  loadProfileStats()
}

// #profile 해시로 바로 진입한 경우에도 채운다.
if (window.location.hash === '#profile') {
  loadDexCollection()
  loadProfileStats()
}

// ── 2-1 신규 고양이 이름짓기(PATCH /cats/:id/name) ──
const newCatNameForm = document.querySelector('#new-cat-name-form')
const newCatNameInput = document.querySelector('#new-cat-name-input')
const newCatNameMessage = document.querySelector('#new-cat-name-message')

function showNewCatNameMessage(message = '', isError = false) {
  if (!newCatNameMessage) return
  newCatNameMessage.textContent = message
  newCatNameMessage.hidden = !message
  newCatNameMessage.classList.toggle('is-error', isError)
}

newCatNameForm?.addEventListener('submit', async (event) => {
  event.preventDefault()
  const name = newCatNameInput.value.trim()
  if (!name) return showNewCatNameMessage('이름을 입력해주세요.', true)
  if (pendingNewCatId == null) return showNewCatNameMessage('등록된 고양이를 찾을 수 없어요.', true)

  const button = newCatNameForm.querySelector('[type="submit"]')
  const original = button.textContent
  button.disabled = true
  button.textContent = '저장 중...'
  showNewCatNameMessage()
  try {
    await setCatName(pendingNewCatId, name)
    showNewCatNameMessage(`'${name}' 이름을 지어줬어요! 🐾`)
    pendingNewCatId = null
    setTimeout(() => {
      const result = document.querySelector('#capture-result')
      if (result) result.hidden = true
    }, 900)
  } catch (error) {
    showNewCatNameMessage(error?.message ?? '이름을 저장하지 못했습니다.', true)
  } finally {
    button.disabled = false
    button.textContent = original
  }
})

// ── 2-2 도감 개인 별명(PATCH /cats/:id/nickname) ──
nicknameBtn?.addEventListener('click', () => {
  if (!nicknameForm) return
  const item = dexCollectionById.get(detailCatId)
  nicknameInput.value = item?.customName || ''
  nicknameForm.hidden = false
  nicknameBtn.hidden = true
  nicknameInput.focus()
})

nicknameForm?.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (detailCatId == null) return
  const value = nicknameInput.value.trim()
  const save = nicknameForm.querySelector('[type="submit"]')
  save.disabled = true
  try {
    const result = await setCatNickname(detailCatId, value || null)
    const item = dexCollectionById.get(detailCatId)
    if (item) {
      item.customName = result.customName ?? null
      item.displayName = item.customName || item.name || '???'
    }
    setDetailName(item?.displayName || result.customName || '???')
    resetNicknameEditor()
    loadDexCollection() // 도감 카드 이름도 갱신
  } catch (error) {
    console.warn('별명을 저장하지 못했습니다.', error)
  } finally {
    save.disabled = false
  }
})

// ── 3-3 즐겨찾기 목록 화면(GET /collection에서 isFavorite 필터) ──
const favoritesScreen = document.querySelector('#favorites-screen')
const favoritesGrid = document.querySelector('#favorites-grid')
const favoritesCount = document.querySelector('#favorites-count')
const favoritesEmpty = document.querySelector('#favorites-empty')

async function openFavorites() {
  if (!favoritesScreen) return
  favoritesScreen.hidden = false
  try {
    const data = await getCollection()
    const favs = (data.cats ?? []).filter((cat) => cat.isFavorite)
    favs.forEach((cat) => dexCollectionById.set(String(cat.catId), cat))
    favoritesGrid?.replaceChildren(...favs.map(buildDexCard))
    if (favoritesCount) favoritesCount.textContent = `${favs.length}마리`
    if (favoritesEmpty) favoritesEmpty.hidden = favs.length > 0
  } catch (error) {
    console.warn('즐겨찾기를 불러오지 못했습니다.', error)
  }
}

favoritesGrid?.addEventListener('click', (event) => {
  const card = event.target.closest('.dex-card')
  if (!card || card.classList.contains('dex-card--locked')) return
  if (card.dataset.catId) openCatDetail(card.dataset.catId)
})

document.querySelectorAll('[data-open-favorites]').forEach((button) => {
  button.addEventListener('click', openFavorites)
})
document.querySelectorAll('[data-favorites-close]').forEach((button) => {
  button.addEventListener('click', () => {
    if (favoritesScreen) favoritesScreen.hidden = true
  })
})

// ── 6-3 내 활동 기록 화면(GET /sightings/me) ──
const activityScreen = document.querySelector('#activity-screen')
const activityList = document.querySelector('#activity-list')
const activityCount = document.querySelector('#activity-count')
const activityEmpty = document.querySelector('#activity-empty')
const DETECTION_LABEL = { matched: '다시 만남', new_cat_candidate: '새 친구' }

function buildActivityItem(sighting) {
  const row = document.createElement('div')
  row.className = 'activity-item'

  const thumb = document.createElement('span')
  thumb.className = 'activity-item-thumb'
  const url = resolveAssetUrl(sighting.imageUrl)
  if (url) {
    const img = document.createElement('img')
    img.src = url
    img.alt = ''
    img.loading = 'lazy'
    thumb.append(img)
  } else {
    thumb.textContent = '🐈'
  }

  const info = document.createElement('div')
  info.className = 'activity-item-info'
  info.append(
    Object.assign(document.createElement('strong'), { textContent: sighting.catName || '이름 없는 고양이' }),
    Object.assign(document.createElement('span'), { textContent: photoDateLabel(sighting.createdAt) })
  )

  const badge = document.createElement('span')
  badge.className = 'activity-item-badge'
  if (sighting.detectionStatus === 'new_cat_candidate') badge.classList.add('activity-item-badge--new')
  badge.textContent = DETECTION_LABEL[sighting.detectionStatus] || '기록'

  row.append(thumb, info, badge)
  return row
}

async function openActivity() {
  if (!activityScreen) return
  activityScreen.hidden = false
  try {
    const data = await getMySightings()
    const list = data.sightings ?? []
    activityList?.replaceChildren(...list.map(buildActivityItem))
    if (activityCount) activityCount.textContent = `${list.length}건`
    if (activityEmpty) activityEmpty.hidden = list.length > 0
  } catch (error) {
    console.warn('활동 기록을 불러오지 못했습니다.', error)
  }
}

document.querySelectorAll('[data-open-activity]').forEach((button) => {
  button.addEventListener('click', openActivity)
})
document.querySelectorAll('[data-activity-close]').forEach((button) => {
  button.addEventListener('click', () => {
    if (activityScreen) activityScreen.hidden = true
  })
})

settingsNameForm?.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!settingsNameForm.reportValidity()) return

  const button = settingsNameForm.querySelector('[type="submit"]')
  const nickname = settingsNameInput.value.trim()
  const imageValue = settingsImageInput?.value.trim()
  button.disabled = true
  button.textContent = '저장 중...'
  showSettingsMessage()

  try {
    // 5-2: 닉네임 + 프로필 사진 URL을 함께 저장(사진칸을 비우면 null로 제거).
    const payload = { nickname }
    if (settingsImageInput) payload.profileImageUrl = imageValue || null
    const data = await updateProfile(payload)

    updateStoredUser({ ...getStoredUser(), ...data })
    updateDisplayedName(data.nickname ?? nickname)
    showSettingsMessage('저장됐어요.')
  } catch (error) {
    showSettingsMessage(error?.message ?? '저장하지 못했습니다.', true)
  } finally {
    button.disabled = false
    button.textContent = '저장하기'
  }
})

updateDisplayedName(currentDisplayName())
if (window.location.hash === '#settings') {
  document.querySelector('#welcome').hidden = true
  document.querySelector('#signup').hidden = true
  openSettingsScreen()
}

// 7-1 세션 재검증: 저장된 토큰이 아직 유효한지 부팅 시 한 번 확인한다.
// 401이면 만료된 것이니 로그아웃 후 새로고침(→ 로그인 화면). 네트워크 오류(서버 다운)는
// status가 없으므로 무시하고 기존 세션을 유지한다.
if (hasSession()) {
  getMe()
    .then((me) => {
      updateStoredUser({ ...getStoredUser(), ...me })
      updateDisplayedName(me.nickname || me.username)
    })
    .catch(async (error) => {
      if (error.status === 401) {
        await logout()
        window.location.reload()
      }
    })
}

// 안내 문구는 5초 후 사라짐
setTimeout(() => {
  document.querySelector('#hint').style.opacity = '0'
}, 5000)

// 백엔드 연동 테스트용 코드
fetch(`${API_BASE_URL}/api/health`)
  .then((res) => res.json())
  .then((data) => {
    console.log('🎉 백엔드 서버 연동 성공:', data)
  })
  .catch((err) => {
    console.error('❌ 백엔드 서버 연동 실패:', err)
  })
