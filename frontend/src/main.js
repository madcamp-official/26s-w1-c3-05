import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { addFlowerDecorations, FLOWER_DECORATION_CONFIG } from './FlowerDecorations.js'
import { createAnimatedModelLayer } from './model-layer.js'
import { openCat3DViewer, preloadCat3DAssets, createMiniCatModelPreview } from './cat-3d-viewer.js'
import { resolveCatModelAsset } from './cat-models.js'
import { API_BASE_URL, authFetch, getStoredUser, hasSession, logout, updateStoredUser } from './auth.js'
import {
  getBushClue,
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
  uploadProfileImage,
} from './api.js'
import { initBgm } from './bgm.js'

initBgm()

// 아직 GPS를 못 받았을 때 지도 조회에 쓰는 기본 위치 (KAIST 중앙도서관 부근).
const DEFAULT_QUERY_POSITION = { lat: 36.3727, lng: 127.3602 }

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
  maxPitch: 85,
  minZoom: 13.9, // 캠퍼스 밖이 훤히 보일 만큼 축소되지 않게
  // 캠퍼스를 크게 벗어나지 못하게 제한 (서쪽 기숙사 지역까지 여유 포함)
  maxBounds: [
    [127.344, 36.359], // 남서쪽 모서리
    [127.378, 36.385], // 북동쪽 모서리
  ],
  attributionControl: { compact: true },
  preserveDrawingBuffer: true,
})

const animatedModelLayer = createAnimatedModelLayer(map) // TEMP_DEBUG
window.__map = map // TEMP_DEBUG
window.__layer = animatedModelLayer // TEMP_DEBUG
const mockBuildingMarkers = new Map()
const MOCK_MAP_MODE = false

// 가까이서 볼 때(follow 시점 줌 범위) 사진 마커가 3D 고양이 모델과 겹치지 않게 위쪽으로 띄운다.
const CAT_MARKER_DEFAULT_OFFSET = [0, -32]
const CAT_MARKER_FOLLOW_MIN_OFFSET = [0, -45]
const CAT_MARKER_CLOSE_OFFSET = [0, -80]

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
    // 아바타(GPS) 위치는 이 시점(첫 styledata/load)엔 아직 없을 수 있어 markerLngLat()의
    // 기본 폴백(DEFAULT_QUERY_POSITION)이 기준점이 된다 — 밀도는 로드 시 1회만 계산되고
    // 이후 아바타가 움직여도 다시 계산하지 않는다(의도된 단순화).
    addFlowerDecorations(map, {
      ...FLOWER_DECORATION_CONFIG,
      densityBias: { center: markerLngLat(), falloffRadiusMeters: 110, baseline: 0.05 },
    })
  } catch (error) {
    console.warn('꽃 장식 초기화 실패:', error)
  }
}
map.on('styledata', initScene)
map.on('load', initScene)
initScene()

function addMockBuildingMarker(object) {
  if (mockBuildingMarkers.has(object.id)) return

  const element = document.createElement('button')
  element.className = 'mock-building-marker'
  element.type = 'button'
  element.setAttribute('aria-label', `${object.name} mock building`)

  const tower = document.createElement('span')
  tower.className = 'mock-building-marker-tower'
  const label = document.createElement('span')
  label.className = 'mock-building-marker-label'
  label.textContent = object.name
  element.append(tower, label)

  const markerInstance = new maplibregl.Marker({
    element,
    anchor: 'bottom',
    pitchAlignment: 'viewport',
    rotationAlignment: 'viewport',
    subpixelPositioning: true,
  })
    .setLngLat([object.lng, object.lat])
    .addTo(map)

  mockBuildingMarkers.set(object.id, markerInstance)
  declutterBuildingMarkers()
}

// 항공뷰처럼 화면상 거리가 가까워지는 줌에서는 캣타워 라벨이 서로 겹쳐 가려진다.
// 실제 좌표(setLngLat)는 그대로 두고, 화면 픽셀 오프셋(setOffset)만 밀어내는 방식이라
// 확대해서 원래 좌표 간격이 벌어지면 자연히 오프셋이 0으로 돌아온다.
// (항공뷰 전용 — 로드뷰는 아래 별도 로직을 쓴다. 이유는 declutterBuildingMarkers 참고.)
const BUILDING_MARKER_MIN_SEPARATION_PX = 64
const BUILDING_MARKER_DECLUTTER_ITERATIONS = 6
const GOLDEN_ANGLE_RADIANS = 2.399963

// 로드뷰의 "화면 안에 있으면 후보"라는 온스크린 판정만으로는 부족하다 — 피치가
// 거의 수평(72도)에 가까울 땐 아주 먼 곳(수백m 밖, 3D 모델이 실제로는 안 그려질
// 만큼 먼 곳)도 지평선 쪽으로 수학적으로는 화면 안에 투영돼 버린다. 그 상태로
// 이름표만 뜨면 옆에 타워 모델도 없이 하늘 위에 이름만 둥둥 뜬 것처럼 보인다.
// 그래서 "지금 줌에서 실제로 타워가 보일 만한 거리"를 따로 두고 그 밖은 제외한다.
// 줌아웃할수록(멀리 볼수록) 이 거리도 늘어난다.
const BUILDING_LABEL_MAX_DISTANCE_CLOSE_METERS = 250 // FOLLOW_MAX_ZOOM(바짝 확대)일 때
const BUILDING_LABEL_MAX_DISTANCE_FAR_METERS = 900 // FOLLOW_MIN_ZOOM(멀리 축소)일 때

// 미쿠 기준 방위각 차이가 이 안이면 "한 직선 상"으로 보고, 그중 가장 가까운
// 캣타워 하나만 이름표를 남긴다(뒤에 가려진 건물까지 이름이 겹쳐 뜨지 않게).
const BUILDING_LABEL_CLUSTER_ANGLE_DEG = 15

// map.project()는 카메라 뒤쪽 점도 원근 나누기(x/w, y/w)를 그냥 적용해버려서, w가
// 음수면 부호가 뒤집혀 화면 안의 그럴듯한 좌표(가끔은 하늘 쪽)로 튀어나온다. 화면
// 마진 체크만으로는 이 "카메라 뒤라서 뒤집힌" 값을 못 걸러내므로, 카메라가 실제로
// 그 방향을 보고 있는지(시야각 안인지)를 방위각으로 따로 확인해서 걸러낸다.
const BUILDING_LABEL_FOV_HALF_ANGLE_DEG = 65

// 마커는 anchor: 'bottom'이라 타워 밑동(지면 좌표)에 그대로 두면 3D 타워 몸체를
// 통째로 가려버린다. 타워 위로 띄워서 이름표처럼 보이게 한다. 로드뷰로 다가갈수록
// 화면에서 타워가 커지므로(BUILDING_FOLLOW_SIZE_BOOST 포함) 띄우는 높이도 함께 키운다.
const BUILDING_MARKER_OVERVIEW_LIFT = -20
const BUILDING_MARKER_FOLLOW_MIN_LIFT = -35
const BUILDING_MARKER_FOLLOW_MAX_LIFT = -120

// 로드뷰 줌 → 0~1 (0=최대 축소, 1=최대 확대). 라벨 거리 상한과 lift 둘 다
// 이 값으로 보간하므로 한 군데서 계산해 공유한다.
function followZoomEase() {
  const t = clamp((map.getZoom() - FOLLOW_MIN_ZOOM) / (FOLLOW_MAX_ZOOM - FOLLOW_MIN_ZOOM), 0, 1)
  return t * t * (3 - 2 * t)
}

function buildingLabelMaxDistance() {
  const eased = followZoomEase()
  return (
    BUILDING_LABEL_MAX_DISTANCE_FAR_METERS -
    (BUILDING_LABEL_MAX_DISTANCE_FAR_METERS - BUILDING_LABEL_MAX_DISTANCE_CLOSE_METERS) * eased
  )
}

// distanceMeters: 로드뷰에서만 의미 있음(그 캣타워가 미쿠로부터 실제로 얼마나 먼지).
// 줌만 보고 모든 라벨에 같은 lift를 주면, 멀리 있어서 화면엔 작게(지평선 가까이)
// 보이는 캣타워까지 크게 띄우게 되어 하늘 위로 붕 뜬 것처럼 보인다. 그래서 가까울수록
// (=화면에서 크게 보일수록) lift를 다 주고, 멀어질수록(=위 거리 상한에 가까워질수록) 0에 가깝게 줄인다.
function buildingMarkerLift(distanceMeters = 0) {
  if (!isFollowing) return BUILDING_MARKER_OVERVIEW_LIFT
  const eased = followZoomEase()
  const zoomLift = BUILDING_MARKER_FOLLOW_MIN_LIFT + (BUILDING_MARKER_FOLLOW_MAX_LIFT - BUILDING_MARKER_FOLLOW_MIN_LIFT) * eased
  const distanceT = clamp(1 - distanceMeters / buildingLabelMaxDistance(), 0, 1)
  return zoomLift * distanceT
}

// from → to 방향의 나침반 방위각(도, 0=북쪽·시계방향).
function bearingBetween(from, to) {
  const toRad = (deg) => (deg * Math.PI) / 180
  const lat1 = toRad(from[1])
  const lat2 = toRad(to[1])
  const deltaLng = toRad(to[0] - from[0])
  const y = Math.sin(deltaLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

// 두 방위각 사이의 최소 각도 차이(0~180도).
function angleDifference(a, b) {
  return Math.abs((((a - b + 540) % 360)) - 180)
}

function declutterBuildingMarkers() {
  const allMarkers = [...mockBuildingMarkers.values()]

  if (!isFollowing) {
    // 항공뷰: 다 보여주되, 화면 픽셀 기준으로 서로 겹치면 밀어낸다. 항공뷰는 피치가
    // 얕아(OVERVIEW_VIEW.pitch=25) map.project() 결과가 안정적이라 이 방식이 안전하다.
    allMarkers.forEach((marker) => (marker.getElement().style.display = ''))
    const lift = buildingMarkerLift()
    if (allMarkers.length < 2) {
      allMarkers.forEach((marker) => marker.setOffset([0, lift]))
      return
    }

    const points = allMarkers.map((marker) => {
      const { x, y } = map.project(marker.getLngLat())
      return { x, y, dx: 0, dy: lift }
    })

    for (let iteration = 0; iteration < BUILDING_MARKER_DECLUTTER_ITERATIONS; iteration++) {
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const a = points[i]
          const b = points[j]
          let deltaX = b.x + b.dx - (a.x + a.dx)
          let deltaY = b.y + b.dy - (a.y + a.dy)
          let distance = Math.hypot(deltaX, deltaY)
          if (distance >= BUILDING_MARKER_MIN_SEPARATION_PX) continue

          if (distance < 0.001) {
            // 완전히 같은 지점이면 인덱스 기반 고정 각도로 밀어낸다 (매 프레임 방향이 바뀌지 않게).
            const angle = i * GOLDEN_ANGLE_RADIANS
            deltaX = Math.cos(angle)
            deltaY = Math.sin(angle)
            distance = 1
          }

          const push = (BUILDING_MARKER_MIN_SEPARATION_PX - distance) / 2
          const normalizedX = (deltaX / distance) * push
          const normalizedY = (deltaY / distance) * push
          a.dx -= normalizedX
          a.dy -= normalizedY
          b.dx += normalizedX
          b.dy += normalizedY
        }
      }
    }

    allMarkers.forEach((marker, index) => {
      const { dx, dy } = points[index]
      marker.setOffset([Math.round(dx), Math.round(dy)])
    })
    return
  }

  // 로드뷰: 예전엔 근처 캣타워를 다 띄워두고 화면 픽셀 거리로 서로 밀어내다 보니,
  // 피치가 큰(최대 72도) 궤도 카메라에서 지평선 근처로 지나가는 좌표는
  // map.project()가 화면 밖 수천~수만 px짜리 값을 뱉어서(관점 투영이 지평선 부근에서
  // 발산) 그 값을 밀어내기 계산에 그대로 썼다가 라벨이 하늘로 튕겨 나가곤 했다.
  //
  // 지금 화면에 있는 건 다 후보로 두되(project() 결과가 뷰포트 근처의 "정상적인"
  // 값일 때만 화면 안에 있는 걸로 친다 — 이게 바로 그 발산 값을 걸러내는 부분),
  // 같은 방향(직선상)에 여러 개가 겹치면 그중 제일 가까운 것만 남긴다.
  const origin = markerLngLat()
  const { clientWidth, clientHeight } = map.getContainer()
  const screenMarginX = clientWidth * 0.6
  const screenMarginY = clientHeight * 0.6
  const maxDistance = buildingLabelMaxDistance()
  const cameraBearing = map.getBearing()

  const candidates = []
  for (const marker of allMarkers) {
    const lngLat = marker.getLngLat()
    const distance = distanceInMeters(origin, [lngLat.lng, lngLat.lat])
    // 실제로 타워가 보일 만한 거리 밖이면 제외 — 안 그러면 피치가 거의 수평이라
    // 수백m 밖 건물도 지평선 쪽으로 수학적으로만 화면 안에 들어와, 옆에 타워
    // 모델도 없이 이름표만 하늘에 둥둥 뜬 것처럼 보인다.
    if (distance > maxDistance) continue

    const bearing = bearingBetween(origin, [lngLat.lng, lngLat.lat])
    // 카메라가 보고 있는 방향(시야각) 밖이면 제외 — 안 그러면 카메라 뒤쪽 점이
    // map.project()의 원근 나누기에서 부호가 뒤집혀(w<0) 화면 마진 체크를 통과한
    // 채로 엉뚱한 좌표(가끔 하늘 쪽)에 이름표가 튀어나온다.
    if (angleDifference(cameraBearing, bearing) > BUILDING_LABEL_FOV_HALF_ANGLE_DEG) continue

    // 지평선 부근에서 project()가 발산하면 여기서 걸러진다 — 정상 범위면 뷰포트
    // 크기의 1.6배 이내 값이 나오고, 발산하면 수천~수만 px로 튀어서 바로 빠진다.
    const { x, y } = map.project(lngLat)
    if (x < -screenMarginX || x > clientWidth + screenMarginX) continue
    if (y < -screenMarginY || y > clientHeight + screenMarginY) continue

    candidates.push({ marker, distance, bearing })
  }

  // 같은 방향(각도 차 15도 이내)에 나보다 더 가까운 후보가 있으면 가려진 걸로 보고 뺀다.
  const shown = candidates.filter(
    (candidate) =>
      !candidates.some(
        (other) =>
          other !== candidate &&
          other.distance < candidate.distance &&
          angleDifference(other.bearing, candidate.bearing) <= BUILDING_LABEL_CLUSTER_ANGLE_DEG
      )
  )
  const shownByMarker = new Map(shown.map((candidate) => [candidate.marker, candidate.distance]))

  allMarkers.forEach((marker) => {
    const distance = shownByMarker.get(marker)
    const isVisible = distance !== undefined
    marker.getElement().style.display = isVisible ? '' : 'none'
    if (isVisible) marker.setOffset([0, buildingMarkerLift(distance)])
  })
}

map.on('move', declutterBuildingMarkers)

// 이름/구역 정보 카드 마커는 없앴다 — 사용자가 직접 찍은 사진 마커(photo-marker)만
// 보여주고, 그 마커를 3D 고양이 모델 위로 띄우는 데 이 오프셋을 재사용한다.
// 지도 시점 중심(카메라 초점)에서 일정 거리 이상 멀어진 마커는 화면에 나타나지 않도록 가린다.
function updateCatMarkerPresentation() {
  const offset = catMarkerOffset()
  const center = map.getCenter()
  const centerLngLat = [center.lng, center.lat]
  const zoom = map.getZoom()

  photoMarkerGroups.forEach((group) => {
    if (!group.markerInstance) return
    group.markerInstance.setOffset(offset)

    const distance = distanceInMeters(centerLngLat, group.position)
    // 줌 레벨이 16.5 미만(전체화면 오버뷰)이거나, 거리가 350m 이내일 때만 마커를 노출
    const isVisible = zoom < 16.5 || distance <= 350
    group.element.style.display = isVisible ? '' : 'none'
  })
}

map.on('move', updateCatMarkerPresentation)

// Web Mercator 축척: 특정 위도·줌에서 화면 1px가 실제 몇 미터인지.
function metersPerPixelAtZoom(zoom, latitude) {
  return (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom
}

// 아바타 추적(1인칭) 모드에서 카메라를 최대로 핀치아웃했을 때(FOLLOW_MIN_ZOOM) 실제로
// 보이는 반경(m). 캣타워는 이제 "가까운 것 몇 개를 골라 보여주는" 게 아니라 정해진
// 좌표에 항상 고정 배치되므로, 조회 범위도 "지금 화면에 보일 수 있는 최대 범위"를
// 기준으로 삼는다 — 대각선 절반을 써서 화면 모서리까지 커버한다.
function followModeMaxViewRadiusMeters(latitude) {
  const metersPerPixel = metersPerPixelAtZoom(FOLLOW_MIN_ZOOM, latitude)
  const { clientWidth, clientHeight } = map.getContainer()
  const viewportDiagonalPx = Math.hypot(clientWidth || 0, clientHeight || 0)
  return (viewportDiagonalPx / 2) * metersPerPixel
}


async function fetchMapObjects(origin = markerLngLat()) {
  // 지도가 아직 레이아웃되기 전이면 컨테이너가 0x0이라 반경도 0이 된다. 백엔드는 양수만
  // 받으므로(400) 그대로 보내면 초기화 전체가 실패한다. 최소 1m로 깎아 요청은 성공시키고,
  // 실제 반경은 GPS 확정 후 refetchMapActorsForGps가 다시 계산해 채운다.
  const params = new URLSearchParams({
    lat: String(origin[1]),
    lng: String(origin[0]),
    radius: String(Math.max(1, Math.round(followModeMaxViewRadiusMeters(origin[1])))),
  })
  const response = await authFetch(`/api/map/objects?${params}`)
  if (!response.ok) throw new Error('건물 정보를 불러오지 못했습니다.')
  return response.json()
}

async function fetchCatActors(origin = markerLngLat()) {
  const params = new URLSearchParams({
    lat: String(origin[1]),
    lng: String(origin[0]),
    radius: '2000',
    limit: '100',
    includeUndiscovered: 'true',
  })
  const response = await authFetch(`/api/map/cat-actors?${params}`)
  if (!response.ok) throw new Error('고양이 정보를 불러오지 못했습니다.')
  return response.json()
}

// 가장 최근에 받아온 cat-actor 목록. 사진 마커를 통째로 다시 그린 뒤(syncServerPhotos)
// 도감 고양이 마커를 복구하는 데 쓴다.
let lastCatActors = []

// 지도 마커의 진짜 소스는 "도감에 등록된 고양이"다. 내가 찍은 사진이 없어도 마커가 떠야 하고,
// 사진이 있어도 마커는 사진을 찍은 자리가 아니라 고양이가 서 있는 placement 위에 있어야 한다.
function syncCatActorMarkers(actors) {
  lastCatActors = actors
  const discovered = actors.filter((actor) => actor.displayType === 'discovered_cat')
  const discoveredIds = new Set(discovered.map((actor) => String(actor.catId)))

  for (const actor of discovered) {
    const position = [Number(actor.lng), Number(actor.lat)]
    const group = photoMarkerGroupForCat(actor.catId)

    if (group) {
      group.position = position
      group.markerInstance?.setLngLat(position)
      // 아직 내 사진이 없는 마커는 고양이 대표 사진을 계속 따라간다.
      if (group.photos.length === 0 && actor.mainImageUrl) {
        group.dataUrl = actor.mainImageUrl
        group.image.src = actor.mainImageUrl
      }
      continue
    }

    createMarkerGroup({
      key: `cat-${actor.catId}`,
      position,
      accuracy: DEFAULT_GPS_ACCURACY_METERS,
      catId: actor.catId,
      dataUrl: actor.mainImageUrl ?? null,
      representativeCreatedAt: null,
      photos: [],
      animate: false,
    })
  }

  // 도감에서 빠졌거나 조회 반경 밖으로 나간 "내 사진이 없는" 마커는 정리한다.
  // 내가 찍은 사진이 있는 마커는 반경과 무관하게 남긴다.
  for (const [key, group] of photoMarkerGroups) {
    if (group.photos.length > 0 || group.catId == null) continue
    if (discoveredIds.has(String(group.catId))) continue
    group.markerInstance?.remove()
    photoMarkerGroups.delete(key)
  }

  updateCatMarkerPresentation()
}

async function refreshCatActors(origin = markerLngLat()) {
  if (!hasSession()) return []
  const { cats = [] } = await fetchCatActors(origin)
  animatedModelLayer.setCatActors(cats)
  syncCatActorMarkers(cats)
  return cats
}

// ── 다른 사용자가 올린 고양이·수풀 반영 (폴링) ──────────────────────────
// refreshCatActors는 지금까지 "내가 사진을 찍었을 때"만 불렸다. 다른 사람이 새 고양이를
// 등록하거나 기존 고양이를 다시 찍어 placement가 옮겨져도 내 화면은 새로고침 전까지
// 그대로였다. setCatActors()가 catId로 인스턴스를 재사용하므로 폴링해도 모델을 다시
// 로드하지 않고 위치만 갱신된다.
const CAT_ACTOR_POLL_INTERVAL_MS = 10000
let catActorPollTimer = null
let catActorPollInFlight = false

async function pollCatActors() {
  // 백그라운드 탭에서 배터리·네트워크를 낭비하지 않는다.
  if (document.hidden || !hasSession()) return
  // 3D 가상 카메라로 조준 중에 고양이가 순간이동하면 촬영이 깨진다. 모드를 빠져나올 때
  // 한 번 갱신하므로 여기서는 건너뛴다.
  if (window.is3DCameraActive) return
  // 느린 응답이 쌓여 요청이 겹치지 않게 한다.
  if (catActorPollInFlight) return

  catActorPollInFlight = true
  try {
    await refreshCatActors()
  } catch (error) {
    // 일시적인 네트워크 오류는 다음 틱에 자연히 재시도된다.
    console.warn('지도 고양이 폴링에 실패했습니다.', error)
  } finally {
    catActorPollInFlight = false
  }
}

function startCatActorPolling() {
  if (catActorPollTimer) return
  catActorPollTimer = setInterval(pollCatActors, CAT_ACTOR_POLL_INTERVAL_MS)
}

// 탭으로 돌아오면 다음 틱(최대 10초)을 기다리지 않고 즉시 최신 상태를 받아온다.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) pollCatActors()
})

let mapActorsInitialized = false

async function initMapActors() {
  if (mapActorsInitialized || !hasSession()) return
  mapActorsInitialized = true

  try {
    const origin = markerLngLat()
    const [{ objects }, { cats }] = await Promise.all([
      fetchMapObjects(origin),
      fetchCatActors(origin),
    ])

    objects.forEach(addMockBuildingMarker)
    animatedModelLayer.setBuildingActors(objects)
    animatedModelLayer.setCatActors(cats)
    syncCatActorMarkers(cats)
    animatedModelLayer.setAvatarPosition(origin)
    startCatActorPolling()
  } catch (error) {
    mapActorsInitialized = false // 재시도할 수 있게 되돌린다.
    throw error
  }
}

function clearMockBuildingMarkers() {
  for (const marker of mockBuildingMarkers.values()) marker.remove()
  mockBuildingMarkers.clear()
}

// 처음 initMapActors()가 실행될 때는 아직 GPS를 못 받아 기본 좌표(캠퍼스 중앙)를 썼을
// 수 있다. 실제 GPS 위치가 들어오면 캣타워/고양이를 그 위치 기준으로 다시 불러와서,
// 캠퍼스 밖에서 접속해도 내 주변에 마커가 뜨게 한다(딱 한 번만).
let mapActorsRefetchedForGps = false
async function refetchMapActorsForGps(origin) {
  if (mapActorsRefetchedForGps || !hasSession()) return
  mapActorsRefetchedForGps = true
  try {
    const [{ objects }, { cats }] = await Promise.all([fetchMapObjects(origin), fetchCatActors(origin)])
    clearMockBuildingMarkers()
    objects.forEach(addMockBuildingMarker)
    animatedModelLayer.setBuildingActors(objects)
    animatedModelLayer.setCatActors(cats)
    syncCatActorMarkers(cats)
    animatedModelLayer.setAvatarPosition(origin)
  } catch (error) {
    mapActorsRefetchedForGps = false
    console.warn('GPS 위치 기준 맵 데이터 재조회 실패:', error)
  }
}

// 부팅 직후에 딱 한 번만 실행되는 초기 로딩들(지도 액터, 서버 사진 동기화)은 그때
// 백엔드가 아직 안 떴거나 네트워크가 잠깐 끊기면 그대로 실패한 채 세션이 끝난다.
// 다시 부를 트리거가 없으므로 실패하면 지수 백오프로 몇 번 더 시도한다.
const BOOT_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000]

function withBootRetry(label, run) {
  // 여러 트리거가 같은 작업을 부르다 모두 실패해도 재시도 체인이 갈라지지 않게
  // 한 번에 하나만 예약한다. 이벤트 리스너로 넘겨도 되도록 인자는 받지 않는다.
  let retryPending = false
  const attempt = (index = 0) => {
    run().catch((error) => {
      console.warn(`${label} 실패 (${index + 1}번째 시도):`, error)

      const delay = BOOT_RETRY_DELAYS_MS[index]
      if (delay == null || retryPending) return
      retryPending = true
      setTimeout(() => {
        retryPending = false
        attempt(index + 1)
      }, delay)
    })
  }
  return () => attempt()
}

const tryInitMapActors = withBootRetry('지도 고양이·건물 불러오기', initMapActors)

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
  animatedModelLayer.setAvatarTransitioning(false)
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
      refetchMapActorsForGps(userPos)
      // 1인칭 카메라는 center가 "아바타 앞쪽 지면"이라 easeTo(center=내 위치)를 태우면
      // 시점이 통째로 3인칭으로 돌아가버린다. 눈높이 카메라를 새 위치로 다시 계산한다.
      if (window.is3DCameraActive) {
        applyFirstPersonCamera()
      } else if (isFollowing && !isTransitioning) {
        // 마커 시점일 때는 카메라도 내 위치를 따라감.
        // GPS 좌표가 튀어도 화면이 순간이동하지 않게 부드럽게 이동한다.
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

// 항공뷰는 고정된 구도로만 보여준다. 사용자가 팬/줌/회전을 할 수 있게 두면 얻는
// 것도 없이 매 프레임 3D 레이어(미쿠·고양이·캣타워)를 다시 투영해야 해서 렌더링
// 비용만 든다. 더블탭(map.on('click'))은 이 핸들러들과 무관하게 계속 동작한다.
setDefaultGestures(false)

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
  animatedModelLayer.setAvatarTransitioning(true)

  if (isFollowing) {
    // 마커(내 위치) 시점으로: 궤도 카메라 초기화 + 기본 제스처 끄기.
    // 이동+줌인을 동시에 하면 easeTo(직선 보간)는 끝에서 옆으로 휙 쓸린다 →
    // flyTo의 최적 경로를 쓰되, 곡선 계수를 낮춰(기본 1.42) 뒤로 물러나는
    // 출렁임 없이 완만하게 파고들게 한다.
    // 미쿠는 지도 기준 고정 방향(북쪽)을 항상 바라보므로, 로드뷰 진입 시 방위를 0으로
    // 고정해야 매번 미쿠의 뒷모습을 보게 된다. 오버뷰에서 회전 제스처로 방위가 바뀐
    // 채로 들어오면(map.getBearing() 유지) 얼굴/옆모습이 보일 수 있어 항상 리셋한다.
    orbitBearing = 0
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
    // 전체 캠퍼스 시점으로 복귀: 항공뷰는 고정 구도라 기본 제스처를 계속 꺼둔다.
    // 1인칭에서 돌려놓은 방위도 기본 시점(-20°)으로 함께 되돌린다.
    // 팬+줌아웃+회전은 flyTo의 상승 곡선에 맡기면 자연스럽게 섞인다.
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
  const hitActor = animatedModelLayer.hitTestCatActor(e.point)
  if (hitActor) {
    if (hitActor.modelType === 'bush') {
      handleBushClick(hitActor.catId)
    } else {
      animatedModelLayer.playCatInteraction(hitActor.catId)
    }
    lastTapTime = 0
    lastTapPoint = null
    return
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
let lastCameraMode = 'real_camera'

// ── 도감 신규 등록 연출 (지도 암전 → 오라 → 고양이 사진 → 발자국 → 3D 모델 → 미니 카드) ──
const discoveryReveal = document.querySelector('#discovery-reveal')
const discoveryCatImg = discoveryReveal?.querySelector('[data-discovery-cat-img]')
const discoveryCatName = discoveryReveal?.querySelector('[data-discovery-cat-name]')
const discoveryCatIndex = discoveryReveal?.querySelector('[data-discovery-cat-index]')
const discoveryModelCanvas = discoveryReveal?.querySelector('[data-discovery-model-canvas]')
const discoveryModelPreview = discoveryModelCanvas ? createMiniCatModelPreview(discoveryModelCanvas) : null
const DISCOVERY_REVEAL_MS = 3000

// 발견 응답(data.cat)엔 modelUrl이 없어 id로 getCat을 한 번 더 불러온다. catDetail은
// pattern이 아니라 cats.model_key 기준으로 modelUrl/modelScale을 이미 계산해서 주므로
// (backend/src/lib/serializers.ts catDetail), 그걸 그대로 쓴다 — 막 발견한 candidate
// 고양이는 관리자가 승인하기 전엔 pattern이 항상 null이라, pattern으로 다시 계산하면
// (이전 버전의 버그) 매번 조용히 실패해서 모델이 하나도 안 떴다.
async function loadDiscoveryModel(catId) {
  if (!discoveryModelPreview || !catId) return
  try {
    const cat = await getCat(catId)
    if (!cat?.modelUrl) return
    discoveryModelPreview.resize()
    await discoveryModelPreview.load(cat.modelUrl, cat.modelScale ?? 1)
  } catch (error) {
    console.warn('발견 연출용 3D 모델을 불러오지 못했습니다.', error)
  }
}

function playDiscoveryReveal({ name, imageUrl, dexIndex } = {}) {
  return new Promise((resolve) => {
    if (!discoveryReveal) {
      resolve()
      return
    }
    if (discoveryCatImg) discoveryCatImg.src = imageUrl || ''
    if (discoveryCatName) discoveryCatName.textContent = name || '새로운 고양이'
    if (discoveryCatIndex) discoveryCatIndex.textContent = dexIndex ? `도감 #${dexIndex}` : '도감'

    discoveryReveal.hidden = false
    discoveryReveal.classList.remove('is-active')
    void discoveryReveal.offsetWidth // 강제 리플로우로 애니메이션 재시작 보장
    discoveryReveal.classList.add('is-active')
    loadDiscoveryModel(dexIndex)

    let done = false
    const finish = () => {
      if (done) return
      done = true
      discoveryReveal.classList.remove('is-active')
      discoveryReveal.hidden = true
      discoveryReveal.removeEventListener('click', finish)
      resolve()
    }
    discoveryReveal.addEventListener('click', finish, { once: true })
    setTimeout(finish, DISCOVERY_REVEAL_MS)
  })
}

// ── 덤불 클릭 힌트 (메시지 + 그 고양이 사진 조각) ──
const bushHint = document.querySelector('#bush-hint')
const bushHintPhoto = bushHint?.querySelector('[data-bush-hint-photo]')
const bushHintMessage = bushHint?.querySelector('[data-bush-hint-message]')
const BUSH_HINT_AUTO_HIDE_MS = 5000
let bushHintHideTimer = null
let bushHintRequestId = 0

function hideBushHint() {
  if (!bushHint) return
  bushHint.classList.remove('is-visible')
  clearTimeout(bushHintHideTimer)
}

function showBushHint({ message, imageUrl, crop }) {
  if (!bushHint) return
  if (bushHintMessage) bushHintMessage.textContent = message || '모르는 고양이예요. 이 주변에 있을지도 모르니 찾아보세요!'
  if (bushHintPhoto) {
    if (imageUrl && crop) {
      // 서버가 잘라준 정사각형 조각(crop.x/y/size, 0~1 비율)만 보이게, 배경 이미지를
      // 1/size배로 확대하고 그 조각이 프레임을 채우도록 위치를 맞춘다.
      const zoom = 1 / Math.max(crop.size, 0.01)
      const posX = crop.size >= 1 ? 0 : (crop.x / (1 - crop.size)) * 100
      const posY = crop.size >= 1 ? 0 : (crop.y / (1 - crop.size)) * 100
      bushHintPhoto.style.backgroundImage = `url("${imageUrl}")`
      bushHintPhoto.style.backgroundSize = `${zoom * 100}% ${zoom * 100}%`
      bushHintPhoto.style.backgroundPosition = `${posX}% ${posY}%`
    } else {
      bushHintPhoto.style.backgroundImage = ''
    }
  }

  bushHint.hidden = false
  void bushHint.offsetWidth
  bushHint.classList.add('is-visible')
  clearTimeout(bushHintHideTimer)
  bushHintHideTimer = setTimeout(hideBushHint, BUSH_HINT_AUTO_HIDE_MS)
}

bushHint?.querySelector('[data-bush-hint-close]')?.addEventListener('click', hideBushHint)

async function handleBushClick(catId) {
  const requestId = ++bushHintRequestId
  try {
    const data = await getBushClue(catId)
    if (requestId !== bushHintRequestId) return // 그 사이 다른 덤불을 눌렀으면 무시
    showBushHint(data)
  } catch (error) {
    console.warn('덤불 힌트를 불러오지 못했습니다.', error)
  }
}

function showCaptureLoading() {
  window.showCaptureResult?.('loading')
}

function hideCaptureLoading() {
  if (captureResult?.dataset.state === 'loading') captureResult.hidden = true
}

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

// 사진 저장소는 브라우저 전역이라 계정과 무관하게 남는다. 누구 사진인지 새겨두지 않으면
// 같은 브라우저에서 계정을 바꿨을 때 이전 계정의 사진이 새 계정의 마커로 뜬다.
function currentPhotoOwnerId() {
  const id = getStoredUser()?.id
  return id == null ? null : String(id)
}

function readAllStoredPhotos(database) {
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(PHOTO_STORE_NAME, 'readonly')
      .objectStore(PHOTO_STORE_NAME)
      .getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function deleteStoredPhotos(database, ids) {
  if (ids.length === 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PHOTO_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(PHOTO_STORE_NAME)
    ids.forEach((id) => store.delete(id))
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

// 지금 로그인한 사용자의 사진만 돌려주고, 남의 사진은 저장소에서 지운다.
// ownerId가 없는 예전 사진도 주인을 알 수 없으니 함께 지운다 — 그 사진이 정말 내 것이었다면
// syncServerPhotos()가 /api/sightings/me에서 다시 받아온다.
async function readStoredPhotos() {
  const ownerId = currentPhotoOwnerId()
  if (!ownerId) return [] // 로그인 전에는 아무것도 읽지도, 지우지도 않는다.

  const database = await openPhotoDatabase()
  try {
    const photos = await readAllStoredPhotos(database)
    const mine = photos.filter((photo) => String(photo.ownerId ?? '') === ownerId)
    const foreign = photos.filter((photo) => String(photo.ownerId ?? '') !== ownerId)
    if (foreign.length > 0) {
      await deleteStoredPhotos(database, foreign.map((photo) => photo.id))
    }
    return mine
  } finally {
    database.close()
  }
}

async function storePhoto(photo) {
  const database = await openPhotoDatabase()
  const owned = { ...photo, ownerId: photo.ownerId ?? currentPhotoOwnerId() }
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PHOTO_STORE_NAME, 'readwrite')
    transaction.objectStore(PHOTO_STORE_NAME).put(owned)
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

// 게스트 계정은 로그아웃하면 다음번엔 완전히 다른 계정(서버 기준 새 유저)이 되므로,
// 로그인 상태와 무관하게 브라우저에 전역으로 남는 이 로컬 사진 저장소를 그대로 두면
// 다음 게스트가 이전 게스트의 사진 마커를 자기 것처럼 이어받는다. 게스트 로그아웃
// 시점에 반드시 비워서 다음 게스트가 빈 상태로 시작하게 한다.
async function clearStoredPhotos() {
  const database = await openPhotoDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PHOTO_STORE_NAME, 'readwrite')
    transaction.objectStore(PHOTO_STORE_NAME).clear()
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

// 고양이는 지도에서 딱 한 곳(cat_placements)에만 서 있으므로, 그 고양이의 마커도 하나뿐이다.
// catId를 아는 사진은 거리와 무관하게 그 고양이의 마커에 합친다.
function photoMarkerGroupForCat(catId) {
  if (catId == null || String(catId) === '') return null
  for (const group of photoMarkerGroups.values()) {
    if (String(group.catId ?? '') === String(catId)) return group
  }
  return null
}

function nearestPhotoMarkerGroup(position, accuracy, catId) {
  if (catId != null && String(catId) !== '') return photoMarkerGroupForCat(catId)

  let nearestGroup = null
  let nearestDistance = Infinity

  // catId를 모르는 레거시 사진끼리만 거리로 묶는다.
  for (const group of photoMarkerGroups.values()) {
    if (group.catId != null && String(group.catId) !== '') continue

    const distance = distanceInMeters(position, group.position)
    const groupingRadius = photoGroupRadius(accuracy, group.accuracy)
    if (distance <= groupingRadius && distance < nearestDistance) {
      nearestGroup = group
      nearestDistance = distance
    }
  }
  return nearestGroup
}

// 마커 하나를 만들어 지도에 올린다. 사진에서 만들 수도(addPhotoMarker), 도감에 등록된
// 고양이에서 만들 수도(addCatActorMarker) 있어 공통 부분만 여기에 둔다.
function createMarkerGroup({ key, position, accuracy, catId, dataUrl, representativeCreatedAt, photos, animate }) {
  const element = document.createElement('button')
  element.className = 'photo-marker photo-marker--model'
  element.type = 'button'

  const bubble = document.createElement('span')
  bubble.className = 'photo-marker-bubble'
  if (!animate) bubble.classList.add('is-restored')

  const image = document.createElement('img')
  if (dataUrl) image.src = dataUrl
  image.alt = ''
  const badge = document.createElement('span')
  badge.className = 'photo-marker-count'
  badge.hidden = true
  badge.textContent = '1'
  bubble.append(image, badge)
  element.append(bubble)

  const group = {
    count: photos.length,
    dataUrl,
    representativeCreatedAt,
    photos,
    position,
    accuracy,
    catId: catId ?? null,
    element,
    image,
    badge,
    markerInstance: null,
  }
  photoMarkerGroups.set(key, group)
  updateMarkerGroupPresentation(group)

  element.addEventListener('click', (event) => {
    event.stopPropagation()
    // 내가 찍은 사진이 없는(도감에만 있는) 고양이는 대표 사진 한 장을 크게 보여준다.
    if (group.photos.length === 0) {
      if (group.dataUrl) showPhoto(group.dataUrl)
      return
    }
    showLocationPhotos(group.photos)
  })

  // 마커가 3D 고양이 모델과 겹치지 않게 catMarkerOffset()으로 위로 띄운다
  // (줌/시점 전환 시 updateCatMarkerPresentation이 갱신).
  group.markerInstance = new maplibregl.Marker({
    element,
    anchor: 'bottom',
    pitchAlignment: 'viewport',
    rotationAlignment: 'viewport',
    subpixelPositioning: true,
    offset: catMarkerOffset(),
  })
    .setLngLat(position)
    .addTo(map)

  return group
}

// 배지와 aria-label은 사진 장수에 따라 달라진다.
function updateMarkerGroupPresentation(group) {
  group.badge.textContent = String(group.count)
  group.badge.hidden = group.count <= 1
  group.element.setAttribute(
    'aria-label',
    group.count === 0
      ? '도감에 등록된 고양이 보기'
      : `이 고양이 사진 ${group.count}장 보기`
  )
}

function addPhotoMarker(photo, animate = true) {
  const photoAccuracy = normalizedGpsAccuracy(photo.accuracy)
  const existingGroup = nearestPhotoMarkerGroup(photo.position, photoAccuracy, photo.catId)

  if (existingGroup) {
    existingGroup.photos.push(photo)
    existingGroup.photos.sort(newestPhotoFirst)
    existingGroup.count = existingGroup.photos.length
    existingGroup.accuracy = Math.max(existingGroup.accuracy, photoAccuracy)
    updateMarkerGroupPresentation(existingGroup)

    // 가장 최근에 찍은 사진을 대표 이미지로 사용한다. 사진 없이 도감에서 만들어진
    // 마커(representativeCreatedAt이 없음)는 첫 사진이 들어오는 순간 대표를 넘겨준다.
    if (!existingGroup.representativeCreatedAt
        || new Date(photo.createdAt) > new Date(existingGroup.representativeCreatedAt)) {
      existingGroup.dataUrl = photo.dataUrl
      existingGroup.image.src = photo.dataUrl
      existingGroup.representativeCreatedAt = photo.createdAt
    }
    return
  }

  createMarkerGroup({
    key: photo.id,
    position: photo.position,
    accuracy: photoAccuracy,
    catId: photo.catId ?? null,
    dataUrl: photo.dataUrl,
    representativeCreatedAt: photo.createdAt,
    photos: [photo],
    animate,
  })
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

async function renderMatchedCapture(data, imageUrl) {
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

  const resolvedImageUrl = imageUrl || capturePhotoUrl(data)
  if (data?.cat?.isNewCollection) {
    await playDiscoveryReveal({ name: catName, imageUrl: resolvedImageUrl, dexIndex: data?.cat?.id })
  }
  window.showCaptureResult?.('existing', resolvedImageUrl)
}

async function renderNewCatCapture(data, imageUrl) {
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
  const resolvedImageUrl = imageUrl || capturePhotoUrl(data)
  await playDiscoveryReveal({ name: data?.cat?.name, imageUrl: resolvedImageUrl, dexIndex: data?.cat?.id })
  window.showCaptureResult?.('new', resolvedImageUrl)
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

async function uploadSighting(file, position, catId = null, captureMode = 'real_camera') {
  const formData = new FormData()
  formData.set('image', file)
  formData.set('longitude', String(position[0]))
  formData.set('latitude', String(position[1]))
  if (catId) {
    formData.set('catId', String(catId))
  }
  formData.set('captureMode', captureMode)

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

// 실패하면 던진다 — 호출부(withBootRetry)가 재시도한다. 여기서 조용히 삼키면 마커에
// 내 사진 대신 고양이 대표 사진만 남고, 마커를 눌러도 내 사진첩이 안 열린다.
async function syncServerPhotos() {
  if (!hasSession()) return

  const data = await getMySightings()
  const list = data.sightings ?? []

  // 마커는 3D 고양이 모델 위에 떠야 하므로 placement 좌표를 쓴다. s.longitude/latitude는
  // 촬영 당시 "내가 서 있던 GPS"라, 한 자리에서 여러 마리를 찍으면 좌표가 전부 같아져
  // 마커들이 한 점에 겹치고 맨 위 하나만 보인다(= 마커가 안 뜨는 것처럼 보임).
  const serverPhotos = list.map((s) => ({
    id: `server-${s.id}`,
    dataUrl: s.imageUrl,
    position: s.placement
      ? [Number(s.placement.longitude), Number(s.placement.latitude)]
      : [Number(s.longitude), Number(s.latitude)],
    accuracy: 10,
    createdAt: s.createdAt,
    catId: s.catId ?? null,
  }))

  const storedPhotos = await readStoredPhotos()
  const localPhotos = storedPhotos
    .filter((photo) => Array.isArray(photo.position) && photo.dataUrl)

  // 지울 건 다 읽어온 뒤에 지운다 — 중간에 실패하면 마커만 사라진 채로 남는다.
  clearRenderedPhotoMarkers()

  const combinedPhotos = [...localPhotos]
  serverPhotos.forEach((sp) => {
    // catId는 로컬 사진이 문자열(업로드 응답의 String(cat.id)), 서버 목록도 문자열이다.
    // 예전엔 서버 쪽을 Number로 바꿔 비교해 항상 불일치 → 중복 마커가 쌓였다.
    const exists = localPhotos.some(
      (lp) => lp.id === sp.id
        || (String(lp.catId ?? '') === String(sp.catId ?? '') && distanceInMeters(lp.position, sp.position) < 2)
    )
    if (!exists) {
      combinedPhotos.push(sp)
    }
  })

  catPhotos = combinedPhotos.sort(newestPhotoFirst)
  catPhotos.forEach((photo) => addPhotoMarker(photo, false))
  // clearRenderedPhotoMarkers()가 도감 전용 마커까지 지웠으니 되살리고, 사진 마커도
  // 고양이가 실제로 서 있는 placement 좌표로 다시 맞춘다.
  syncCatActorMarkers(lastCatActors)
  renderGallery()
}

// 게스트 로그인은 항상 새 계정(랜덤 id)을 만들기 때문에, 로그인 시점에 로컬에 남아있는
// 사진은 100% 이전 세션의 것이다. 로그아웃 경로(버튼 클릭, 401로 인한 자동 로그아웃,
// 로그아웃 없이 탭을 닫고 다시 게스트로 들어오는 경우 등)를 전부 잡아내려 하는 대신,
// "새 게스트 계정이 만들어지는 그 순간"에 한 번만 확실히 비우면 어떤 경로로 이전
// 세션이 끝났든 항상 깨끗한 상태로 시작할 수 있다. 페이지 로드 시 restorePhotos()가
// 로그인 전에 이미 지도에 마커를 그려둔 상태일 수 있으므로, 렌더된 마커도 함께 지운다.
function clearRenderedPhotoMarkers() {
  for (const group of photoMarkerGroups.values()) {
    group.markerInstance?.remove()
  }
  photoMarkerGroups.clear()
  catPhotos = []
  renderGallery()
}

window.resetGuestLocalPhotos = () => {
  clearRenderedPhotoMarkers()
  clearStoredPhotos().catch((error) => console.warn('게스트 로컬 사진을 정리하지 못했습니다.', error))
}

// 버튼을 누르면 다른 화면을 모두 닫고 실제 카메라 뷰파인더를 연다.
// showCameraView는 index.html의 인라인 스크립트가 등록한다. getUserMedia를 지원하지
// 않거나 권한이 없으면 그 안에서 폴백 안내를 띄우고, 셔터를 누르면 cameraInput.click()으로
// 넘어간다(고양이 촬영 화면 하단 카메라-view 스크립트 참고).
cameraBtn.addEventListener('click', () => {
  returnToMap()
  if (window.showCameraView) {
    window.showCameraView()
  } else {
    cameraInput.click()
  }
})

// ─────────────────────────────────────────────
// 3D 가상 카메라 기능 구현 (1인칭 모드)
// ─────────────────────────────────────────────
// FreeCameraOptions는 Mapbox GL JS 전용 API라 MapLibre에는 없다(getFreeCameraOptions가
// undefined → 호출 즉시 TypeError). 대신 MapLibre 표준 카메라만으로 1인칭을 만든다:
// MapLibre 카메라는 언제나 지면 위의 center를 바라보므로,
//   ① center를 아바타 앞쪽 지면(eyeHeight * tan(pitch)만큼 전방)으로 밀고
//   ② 카메라-center 거리가 눈높이를 만들도록 zoom을 역산
// 하면 눈이 정확히 아바타 머리 위치에 놓이고 pitch/bearing이 그대로 시선이 된다.
window.is3DCameraActive = false;
let currentTargetCatId = null;
let mapControlsBackup = null;
let mapCameraBackup = null;
let isLookingAround = false;
let lastMouseX = 0;
let lastMouseY = 0;
let currentBearing = 0;
let currentPitch = 78;
let cameraMode3d = 'first-person'; // 'first-person' | 'selfie'

// 근접(follow) 스케일에서 미쿠 스켈레톤의 실측 높이(브라우저에서 본 월드 좌표):
// FootL/R 0.4m · Hips 3.42m · Head 6.30m. 모델 전체 높이(≈9m)를 눈높이로 쓰면
// 카메라가 머리카락 위로 떠버린다 — 반드시 Head 본 기준으로 잡을 것.
const AVATAR_HEAD_HEIGHT_M = 6.3;
const FP_EYE_HEIGHT_M = AVATAR_HEAD_HEIGHT_M + 0.4; // 머리 안쪽, 눈 언저리
// 카메라는 머리 "안"에 둔다. 얼굴 앞으로 조금이라도 빼면 코앞의 얼굴이 화면을 가득 채운다.
const FP_EYE_FORWARD_M = 0;
// 눈보다 조금 아래(어깨 위)를 잘라낸다. 어깨/목/머리는 렌즈 코앞이라 그대로 두면 아래를
// 내려다볼 때 화면 절반을 덮어 정작 다리가 안 보인다. FPS가 자기 캐릭터를 그리는 방식대로
// 잘라내면 가슴 아래·치마·다리·발만 남는다. (Head 본 6.30m, 어깨 ≈ 5.6m, Hips 3.42m)
const FP_BODY_CLIP_HEIGHT_M = 5.35;
const FP_MIN_PITCH = 6; // 0에 가까울수록 발밑(=미쿠 다리)을 내려다본다
const FP_MAX_PITCH = 85; // MapLibre 하드 리밋(map maxPitch도 85)
// 눈높이를 고정하려면 pitch를 눕히고 화각을 좁힐수록 더 큰 zoom이 필요하다.
// (발밑을 보며 최대 확대하면 z≈25까지 올라간다. 기본 maxZoom 22면 카메라가 눈높이 위로 뜬다.)
const FP_MAX_ZOOM = 26;

// 셀카: 카메라가 미쿠의 뻗은 손 끝에 달려 있다고 가정한다.
const SELFIE_ARM_DEFAULT_M = 3.4; // 이 스케일(어깨 ≈ 5.6m)에서 뻗은 팔 길이 ≒ 3.4m
const SELFIE_ARM_MIN_M = 1.9;
const SELFIE_ARM_MAX_M = 6.2;
const SELFIE_EYE_HEIGHT_M = FP_EYE_HEIGHT_M + 0.5; // 눈보다 살짝 위에서 내려찍는 셀카 각도
const SELFIE_ROLL_DEG = -5.5; // 손으로 든 카메라 특유의 미세한 기울기
const SELFIE_MIN_PITCH = 58;
const SELFIE_MAX_PITCH = 85;

const FP_ZOOM_MIN = 1; // 기본 화각보다 넓히면 원근 왜곡이 심해 1배를 하한으로 둔다
const FP_ZOOM_MAX = 3.5;
const SELFIE_ZOOM_MIN = 0.6; // 팔을 쭉 뻗은 상태(멀리)
const SELFIE_ZOOM_MAX = 2; // 카메라를 얼굴 쪽으로 당긴 상태

let fpFovBaseDeg = 36.87; // 진입 시점의 기본 수직 화각
let fpZoom = 1; // 1인칭 확대 배율 (화각을 좁혀서 당긴다)
let selfieZoom = 1; // 셀카 확대 배율 (팔 길이를 줄여서 당긴다)

const EARTH_CIRCUMFERENCE_M = 40075016.686;
const ZERO_PADDING = { top: 0, right: 0, bottom: 0, left: 0 };
const METERS_PER_DEG_LAT = 110574;

function offsetLngLat([lng, lat], bearingDeg, distanceM) {
  const bearingRad = (bearingDeg * Math.PI) / 180;
  const metersPerDegLng = 111320 * Math.cos((lat * Math.PI) / 180);
  return [
    lng + (distanceM * Math.sin(bearingRad)) / metersPerDegLng,
    lat + (distanceM * Math.cos(bearingRad)) / METERS_PER_DEG_LAT,
  ];
}

// MapLibre transform: 눈높이(px) = cameraToCenterDistance * cos(pitch), 그리고
// pixelsPerMeter = worldSize / (지구둘레 * cos(lat)), worldSize = 512 * 2^zoom.
// 눈높이를 eyeHeightM으로 고정하는 zoom을 이 관계에서 역산한다.
function zoomForEyeHeight(pitchDeg, lat, eyeHeightM) {
  const transform = map.transform;
  // cameraToCenterDistance = 0.5 / tan(fov/2) * canvasHeight. getter가 있으면 그대로 쓰고,
  // 내부 API라 사라질 수 있으니 fov(도)와 캔버스 높이로 직접 계산하는 경로를 남겨둔다.
  const fovDeg = transform?.fov ?? map.getVerticalFieldOfView();
  const camToCenterPx =
    transform?.cameraToCenterDistance ??
    (0.5 / Math.tan((fovDeg * Math.PI) / 360)) * map.getCanvas().clientHeight;
  const pixelsPerMeter = (camToCenterPx * Math.cos((pitchDeg * Math.PI) / 180)) / eyeHeightM;
  const worldSize = pixelsPerMeter * EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180);
  return Math.log2(worldSize / 512);
}

// 눈 위치(지면 좌표 + 높이)와 시선(bearing/pitch)을 MapLibre 표준 카메라로 옮긴다.
// MapLibre 카메라는 언제나 지면 위의 center를 바라보므로 center = eye + eyeHeight*tan(pitch) 전방.
function applyVirtualCamera({ eye, eyeHeightM, bearing, pitch, roll = 0 }) {
  const pitchRad = (pitch * Math.PI) / 180;
  const center = offsetLngLat(eye, bearing, eyeHeightM * Math.tan(pitchRad));
  const zoom = clamp(zoomForEyeHeight(pitch, eye[1], eyeHeightM), map.getMinZoom(), map.getMaxZoom());

  map.jumpTo({
    center,
    bearing,
    pitch,
    roll,
    zoom,
    // 팔로우 시점에서 넘어오면 padding.top이 화면 절반이라 조준점과 카메라 중심이 어긋난다.
    padding: ZERO_PADDING,
  });
  map.triggerRepaint();
}

// 현재 모드(1인칭/셀카) + bearing/pitch/zoom 상태를 카메라와 미쿠 방향에 즉시 반영
function apply3DCamera() {
  if (!window.is3DCameraActive) return;
  const avatar = markerLngLat();

  if (cameraMode3d === 'selfie') {
    // 카메라는 미쿠 앞(=시선 반대쪽) 팔 길이만큼 떨어진 손 끝에 있고, 미쿠는 그 카메라를 마주본다.
    // 바깥에서 보는 시점이므로 원래의 DoubleSide 머티리얼로 되돌린다.
    const armM = clamp(SELFIE_ARM_DEFAULT_M / selfieZoom, SELFIE_ARM_MIN_M, SELFIE_ARM_MAX_M);
    const facing = (currentBearing + 180) % 360;
    animatedModelLayer.setAvatarFacing(facing);
    applyVirtualCamera({
      eye: offsetLngLat(avatar, facing, armM),
      eyeHeightM: SELFIE_EYE_HEIGHT_M,
      bearing: currentBearing,
      pitch: currentPitch,
      roll: SELFIE_ROLL_DEG,
    });
    return;
  }

  // 1인칭: 눈은 미쿠의 머리 안, 미쿠는 카메라가 보는 방향을 함께 바라본다.
  animatedModelLayer.setAvatarFacing(currentBearing);
  applyVirtualCamera({
    eye: offsetLngLat(avatar, currentBearing, FP_EYE_FORWARD_M),
    eyeHeightM: FP_EYE_HEIGHT_M,
    bearing: currentBearing,
    pitch: currentPitch,
    roll: 0,
  });
}

// GPS 콜백/resize 리스너가 참조하는 이름은 유지한다.
const applyFirstPersonCamera = apply3DCamera;

const cameraToggle3d = document.querySelector('#camera-toggle-3d');
const cameraToggleSelfie = document.querySelector('#camera-toggle-selfie');
const cameraZoomPanel = document.querySelector('#camera-zoom');
const cameraZoomLevel = document.querySelector('#camera-zoom-level');
const cameraCrosshair = document.querySelector('#camera-crosshair');
const cameraTargetLabel = document.querySelector('#camera-target-label');
const cameraView = document.querySelector('#camera-view');
const shutterBtn = document.querySelector('#camera-shutter');

// ── 확대/축소 ────────────────────────────────────────
// 1인칭은 화각(FOV)을 좁혀 당기고, 셀카는 팔을 접어 카메라를 얼굴 쪽으로 당긴다.
// 눈높이 zoom은 zoomForEyeHeight가 매번 다시 풀어주므로 두 방식 모두 시점을 깨지 않는다.
function currentZoomFactor() {
  return cameraMode3d === 'selfie' ? selfieZoom : fpZoom;
}

function setZoomFactor(factor) {
  if (cameraMode3d === 'selfie') {
    selfieZoom = clamp(factor, SELFIE_ZOOM_MIN, SELFIE_ZOOM_MAX);
  } else {
    fpZoom = clamp(factor, FP_ZOOM_MIN, FP_ZOOM_MAX);
    map.setVerticalFieldOfView(fpFovBaseDeg / fpZoom);
  }
  if (cameraZoomLevel) cameraZoomLevel.textContent = `${currentZoomFactor().toFixed(1)}×`;
  apply3DCamera();
}

function nudgeZoom(multiplier) {
  setZoomFactor(currentZoomFactor() * multiplier);
}

// Map controls backup & disable
function disableMapControls() {
  mapControlsBackup = {
    dragPan: map.dragPan.isEnabled(),
    scrollZoom: map.scrollZoom.isEnabled(),
    boxZoom: map.boxZoom.isEnabled(),
    doubleClickZoom: map.doubleClickZoom.isEnabled(),
    touchZoomRotate: map.touchZoomRotate.isEnabled(),
    keyboard: map.keyboard?.isEnabled() ?? false,
  };
  map.dragPan.disable();
  map.scrollZoom.disable();
  map.boxZoom.disable();
  map.doubleClickZoom.disable();
  map.touchZoomRotate.disable();
  if (map.keyboard) map.keyboard.disable();
}

// Map controls restore
function restoreMapControls() {
  if (!mapControlsBackup) return;
  if (mapControlsBackup.dragPan) map.dragPan.enable();
  if (mapControlsBackup.scrollZoom) map.scrollZoom.enable();
  if (mapControlsBackup.boxZoom) map.boxZoom.enable();
  if (mapControlsBackup.doubleClickZoom) map.doubleClickZoom.enable();
  if (mapControlsBackup.touchZoomRotate) map.touchZoomRotate.enable();
  if (mapControlsBackup.keyboard && map.keyboard) map.keyboard.enable();
  mapControlsBackup = null;
}

// 3D 카메라 모드 활성화
function enable3DCameraMode() {
  window.is3DCameraActive = true;
  currentTargetCatId = null;

  // 1. 카메라 스트림 종료
  window.stopCameraStream?.();

  // 2. 지도 컨트롤 및 카메라 백업
  disableMapControls();
  mapCameraBackup = {
    center: map.getCenter(),
    zoom: map.getZoom(),
    pitch: map.getPitch(),
    bearing: map.getBearing(),
    roll: map.getRoll(),
    padding: map.getPadding(),
    maxZoom: map.getMaxZoom(),
    fov: map.getVerticalFieldOfView(),
    isFollowing: isFollowing,
  };

  // 눈높이 8.3m는 z≈21을 요구하고, pitch를 눕히거나 화각을 좁힐수록 더 큰 zoom이 필요하다.
  // 기본 maxZoom(22)에 걸리면 카메라가 눈높이보다 위로 떠서 다시 3인칭처럼 보인다.
  map.setMaxZoom(FP_MAX_ZOOM);
  fpFovBaseDeg = mapCameraBackup.fov;
  cameraMode3d = 'first-person';
  fpZoom = 1;
  selfieZoom = 1;

  // 3. UI 및 클래스 설정
  document.body.classList.add('in-3d-camera-mode');
  cameraView.classList.add('camera-view--3d');
  cameraToggle3d.classList.add('is-active');
  cameraCrosshair.hidden = false;
  cameraTargetLabel.hidden = false;
  cameraToggleSelfie.hidden = true;
  cameraZoomPanel.hidden = false;
  syncSelfieToggleUi();

  // 4. 지도 1인칭 카메라 이동 및 Three.js 활성화
  const userCoords = markerLngLat();
  // 모델 레이어는 follow 스케일(고양이·건물이 보이는 근접 시점)로 두되, 앱의 isFollowing은
  // 반드시 꺼둔다. 켜두면 GPS easeTo와 한손가락 스와이프 궤도 회전(applyOrbit → jumpTo)이
  // 1인칭 카메라를 매번 3인칭으로 덮어쓴다.
  isFollowing = false;
  isTransitioning = false;
  animatedModelLayer.setFollowing(true);
  // 미쿠는 계속 그린다. 카메라가 머리 안에 있고 뒷면이 컬링되므로 수평을 볼 땐 아무것도
  // 가리지 않고, 아래를 볼수록 몸통과 다리가 화면에 들어온다.
  animatedModelLayer.setAvatarVisible(true);
  animatedModelLayer.setAvatarBackfaceCulling(true);
  animatedModelLayer.setAvatarClipHeight(FP_BODY_CLIP_HEIGHT_M);

  // 주변 고양이 검색 후 바라보기 초기화
  let nearestCat = null;
  let minDistance = Infinity;
  for (const actor of (animatedModelLayer.actors || [])) {
    if (actor.modelType === 'bush') continue;
    const dist = distanceInMeters(userCoords, [Number(actor.lng), Number(actor.lat)]);
    if (dist < minDistance) {
      minDistance = dist;
      nearestCat = actor;
    }
  }

  currentBearing = ((nearestCat
    ? bearingBetween(userCoords, [Number(nearestCat.lng), Number(nearestCat.lat)])
    : mapCameraBackup.bearing) + 360) % 360;
  currentPitch = 78;

  // 1인칭 시점 적용
  setZoomFactor(1); // 화각 초기화 + 배율 라벨 갱신 + apply3DCamera()

  // 조준점 업데이트 시작
  update3DCameraTarget();
  map.on('move', update3DCameraTarget);
  // 캔버스 높이가 바뀌면 cameraToCenterDistance가 달라져 눈높이가 틀어진다.
  map.on('resize', applyFirstPersonCamera);
}

// ── 셀카 모드 ────────────────────────────────────────
function syncSelfieToggleUi() {
  const isSelfie = cameraMode3d === 'selfie';
  cameraToggleSelfie.classList.toggle('is-active', isSelfie);
  cameraToggleSelfie.setAttribute('aria-pressed', String(isSelfie));
}

function setCameraMode3d(mode) {
  if (!window.is3DCameraActive || cameraMode3d === mode) return;
  cameraMode3d = mode;

  if (mode === 'selfie') {
    // 셀카는 팔 길이로 당기므로 화각은 기본값으로 되돌린다(좁은 화각 + 근접 = 얼굴만 꽉 참).
    map.setVerticalFieldOfView(fpFovBaseDeg);
    currentPitch = clamp(currentPitch, SELFIE_MIN_PITCH, SELFIE_MAX_PITCH);
    // 셀카는 미쿠를 통째로 찍으니 잘라낸 상반신과 컬링을 되돌린다.
    animatedModelLayer.setAvatarBackfaceCulling(false);
    animatedModelLayer.setAvatarClipHeight(null);
  } else {
    map.setVerticalFieldOfView(fpFovBaseDeg / fpZoom);
    currentPitch = clamp(currentPitch, FP_MIN_PITCH, FP_MAX_PITCH);
    animatedModelLayer.setAvatarBackfaceCulling(true);
    animatedModelLayer.setAvatarClipHeight(FP_BODY_CLIP_HEIGHT_M);
  }

  syncSelfieToggleUi();
  if (cameraZoomLevel) cameraZoomLevel.textContent = `${currentZoomFactor().toFixed(1)}×`;
  apply3DCamera();
}

// 3D 카메라 모드 비활성화
function disable3DCameraMode(restoreCameraStream = true) {
  if (!window.is3DCameraActive) return;
  window.is3DCameraActive = false;
  shutterBtn.disabled = false;

  // 1. 이벤트 해제
  map.off('move', update3DCameraTarget);
  map.off('resize', applyFirstPersonCamera);
  isLookingAround = false;
  pinchStartDist3d = 0;
  cameraMode3d = 'first-person';

  // 2. 지도 컨트롤 및 카메라 복구
  restoreMapControls();
  if (mapCameraBackup) {
    isFollowing = mapCameraBackup.isFollowing;
    animatedModelLayer.setFollowing(isFollowing);
    animatedModelLayer.setAvatarVisible(true);
    animatedModelLayer.setAvatarFacing(null); // 지도 방위를 따라가는 기본 방향으로 복귀
    animatedModelLayer.setAvatarBackfaceCulling(false);
    animatedModelLayer.setAvatarClipHeight(null);
    // 화각/롤은 easeTo가 건드리지 않으므로 별도로 되돌린다.
    map.setVerticalFieldOfView(mapCameraBackup.fov);
    // 1인칭 zoom(≈21)은 원래 maxZoom을 넘으므로, easeTo보다 먼저 되돌리면 중간에 튄다.
    map.easeTo({
      center: mapCameraBackup.center,
      zoom: mapCameraBackup.zoom,
      pitch: mapCameraBackup.pitch,
      bearing: mapCameraBackup.bearing,
      roll: mapCameraBackup.roll,
      padding: mapCameraBackup.padding,
      duration: 800,
    });
    const restoredMaxZoom = mapCameraBackup.maxZoom;
    map.once('moveend', () => map.setMaxZoom(restoredMaxZoom));
    mapCameraBackup = null;
  }

  // 3. UI 클래스 해제
  document.body.classList.remove('in-3d-camera-mode');
  cameraView.classList.remove('camera-view--3d');
  cameraToggle3d.classList.remove('is-active');
  cameraCrosshair.hidden = true;
  cameraTargetLabel.hidden = true;
  cameraToggleSelfie.hidden = true;
  cameraToggleSelfie.classList.remove('is-active');
  cameraToggleSelfie.setAttribute('aria-pressed', 'false');
  cameraZoomPanel.hidden = true;

  // 4. 일반 웹캠 스트림 복구 (필요시)
  if (restoreCameraStream && window.showCameraView) {
    window.showCameraView();
  }

  // 5. 3D 모드 동안 폴링을 멈춰뒀으니, 빠져나오는 즉시 밀린 갱신을 한 번 받아온다.
  pollCatActors();
}

// 3D 카메라 중앙 조준 대상 고양이 스캔
function update3DCameraTarget() {
  if (!window.is3DCameraActive) return;

  const canvas = map.getCanvas();
  const screenCenterX = canvas.clientWidth / 2;
  const screenCenterY = canvas.clientHeight / 2;
  const userCoords = markerLngLat();

  let targetCat = null;
  let minScreenDistance = Infinity;

  for (const actor of (animatedModelLayer.actors || [])) {
    if (actor.modelType === 'bush') continue;

    // 1. 지리적 거리 검사 (100m 이내)
    const distM = distanceInMeters(userCoords, [Number(actor.lng), Number(actor.lat)]);
    if (distM > 100) continue;

    // 2. 카메라 시야각(FOV) 검사 (전방 45도 이내)
    const catBearing = bearingBetween(userCoords, [Number(actor.lng), Number(actor.lat)]);
    const diff = angleDifference(currentBearing, catBearing);
    if (diff > 45) continue;

    // 3. 3D 투영 좌표 획득
    const screenPos = animatedModelLayer.getActorScreenPosition(actor.catId);
    if (!screenPos) continue;

    // 4. 화면 중앙과의 거리 계산
    const screenDist = Math.hypot(screenPos.x - screenCenterX, screenPos.y - screenCenterY);
    if (screenDist < 150 && screenDist < minScreenDistance) {
      minScreenDistance = screenDist;
      targetCat = actor;
    }
  }

  if (targetCat) {
    currentTargetCatId = targetCat.catId;
    cameraCrosshair.classList.add('is-targeted');
    cameraTargetLabel.classList.add('is-targeted');
    cameraTargetLabel.textContent = `${targetCat.name} 조준 완료! 📸`;
    shutterBtn.disabled = false;
  } else {
    currentTargetCatId = null;
    cameraCrosshair.classList.remove('is-targeted');
    cameraTargetLabel.classList.remove('is-targeted');
    cameraTargetLabel.textContent = '고양이를 화면 중앙에 조준해주세요';
    shutterBtn.disabled = true;
  }
}

// 1인칭 드래그 회전 구현 (Look Around)
function handleLookAroundStart(clientX, clientY) {
  if (!window.is3DCameraActive) return;
  isLookingAround = true;
  lastMouseX = clientX;
  lastMouseY = clientY;
}

function handleLookAroundMove(clientX, clientY) {
  if (!isLookingAround || !window.is3DCameraActive) return;
  const dx = clientX - lastMouseX;
  const dy = clientY - lastMouseY;
  lastMouseX = clientX;
  lastMouseY = clientY;

  // 화각을 좁혀 당긴 만큼(1인칭 확대) 같은 드래그가 더 크게 돌면 멀미가 난다 → 감도를 배율로 나눈다.
  const zoomDamping = cameraMode3d === 'selfie' ? 1 : fpZoom;
  const bearingSensitivity = 0.25 / zoomDamping;
  const pitchSensitivity = 0.2 / zoomDamping;

  // FPS 관례: 오른쪽으로 끌면 오른쪽을 보고(bearing↑), 아래로 끌면 아래를 본다(pitch↓).
  // 셀카에서는 카메라가 미쿠를 중심으로 팔 길이만큼 공전하고, 미쿠도 따라 돌아 계속 렌즈를 본다.
  currentBearing = (currentBearing + dx * bearingSensitivity + 360) % 360;
  currentPitch =
    cameraMode3d === 'selfie'
      ? clamp(currentPitch - dy * pitchSensitivity, SELFIE_MIN_PITCH, SELFIE_MAX_PITCH)
      : clamp(currentPitch - dy * pitchSensitivity, FP_MIN_PITCH, FP_MAX_PITCH);

  apply3DCamera();
}

function handleLookAroundEnd() {
  isLookingAround = false;
}

// 이벤트 리스너 등록
cameraToggle3d.addEventListener('click', () => {
  if (window.is3DCameraActive) {
    disable3DCameraMode(true);
  } else {
    enable3DCameraMode();
  }
});

cameraToggleSelfie.addEventListener('click', () => {
  setCameraMode3d(cameraMode3d === 'selfie' ? 'first-person' : 'selfie');
});

document.querySelector('#camera-zoom-in').addEventListener('click', () => nudgeZoom(1.25));
document.querySelector('#camera-zoom-out').addEventListener('click', () => nudgeZoom(1 / 1.25));

// 노트북: 휠로 확대/축소
cameraView.addEventListener(
  'wheel',
  (e) => {
    if (!window.is3DCameraActive) return;
    e.preventDefault();
    nudgeZoom(e.deltaY < 0 ? 1.08 : 1 / 1.08);
  },
  { passive: false }
);

cameraView.addEventListener('mousedown', (e) => {
  if (e.target.closest('button')) return;
  if (e.button === 0) {
    handleLookAroundStart(e.clientX, e.clientY);
  }
});

cameraView.addEventListener('mousemove', (e) => {
  handleLookAroundMove(e.clientX, e.clientY);
});

window.addEventListener('mouseup', handleLookAroundEnd);

// 모바일: 한 손가락 = 시점 회전, 두 손가락 핀치 = 확대/축소
let pinchStartDist3d = 0;
let pinchStartZoom3d = 1;

function touchSpread(touches) {
  return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
}

cameraView.addEventListener(
  'touchstart',
  (e) => {
    if (!window.is3DCameraActive || e.target.closest('button')) return;
    if (e.touches.length === 1) {
      handleLookAroundStart(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2) {
      isLookingAround = false; // 두 번째 손가락이 닿는 순간 회전은 멈춘다
      pinchStartDist3d = touchSpread(e.touches);
      pinchStartZoom3d = currentZoomFactor();
    }
  },
  { passive: true }
);

cameraView.addEventListener(
  'touchmove',
  (e) => {
    if (!window.is3DCameraActive) return;
    if (e.touches.length === 1) {
      handleLookAroundMove(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2 && pinchStartDist3d > 0) {
      e.preventDefault();
      setZoomFactor((pinchStartZoom3d * touchSpread(e.touches)) / pinchStartDist3d);
    }
  },
  { passive: false }
);

window.addEventListener('touchend', (e) => {
  handleLookAroundEnd();
  // 핀치를 놓고 남은 한 손가락이 곧바로 시점을 홱 돌리지 않게, 기준점을 다시 잡아준다.
  if (pinchStartDist3d > 0 && e.touches.length < 2) pinchStartDist3d = 0;
  if (window.is3DCameraActive && e.touches.length === 1) {
    handleLookAroundStart(e.touches[0].clientX, e.touches[0].clientY);
  }
});

// ✕ 닫기 동작 시 오버랩 처리 및 3D 정리
const originalHideCameraView = window.hideCameraView;
window.hideCameraView = () => {
  if (window.is3DCameraActive) {
    disable3DCameraMode(false);
  }
  if (originalHideCameraView) {
    originalHideCameraView();
  }
};

window.addEventListener('catchme:3d-close', () => {
  disable3DCameraMode(false);
});

// Shutter 클릭 이벤트 수신 (3D 캡처 및 업로드)
window.addEventListener('catchme:3d-capture', async () => {
  if (!window.is3DCameraActive || !currentTargetCatId) return;

  shutterBtn.disabled = true;
  cameraView.classList.add('is-capturing');

  // 1. 스크린샷 캡처를 위해 일시적으로 버튼과 뷰파인더 가리기
  cameraToggle3d.style.display = 'none';
  cameraCrosshair.style.display = 'none';
  cameraTargetLabel.style.display = 'none';
  document.querySelector('#camera-view-close').style.display = 'none';
  document.querySelector('.camera-message').style.display = 'none';
  shutterBtn.style.display = 'none';

  // 프레임 렌더 완료 대기 및 캡처
  map.triggerRepaint();
  
  // requestAnimationFrame을 통해 지도가 다시 그려진 직후 캡처
  requestAnimationFrame(() => {
    setTimeout(async () => {
      try {
        const canvas = map.getCanvas();
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

        // UI 요소 원상복구
        cameraToggle3d.style.display = '';
        cameraCrosshair.style.display = '';
        cameraTargetLabel.style.display = '';
        document.querySelector('#camera-view-close').style.display = '';
        document.querySelector('.camera-message').style.display = '';
        shutterBtn.style.display = '';
        shutterBtn.disabled = false;
        cameraView.classList.remove('is-capturing');

        // File 객체로 변환
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        const file = new File([blob], `catchme-3d-${Date.now()}.jpg`, { type: 'image/jpeg' });

        // 3D 카메라 뷰 닫기
        window.hideCameraView();

        // 업로드 흐름 태우기 (catId 전달 및 virtual_3d 플래그)
        processCapturedFile(file, currentTargetCatId, 'virtual_3d');
      } catch (err) {
        console.error('3D 월드 캡처에 실패했습니다.', err);
        cameraToggle3d.style.display = '';
        cameraCrosshair.style.display = '';
        cameraTargetLabel.style.display = '';
        document.querySelector('#camera-view-close').style.display = '';
        document.querySelector('.camera-message').style.display = '';
        shutterBtn.style.display = '';
        shutterBtn.disabled = false;
        cameraView.classList.remove('is-capturing');
        window.alert('사진 캡처 도중 오류가 발생했습니다.');
      }
    }, 50);
  });
});

// 뷰파인더에서 촬영했거나 기본 카메라/앨범에서 고른 사진을 공통 처리한다.
async function processCapturedFile(file, catId = null, captureMode = 'real_camera') {
  if (!file) return
  lastCameraMode = captureMode
  returnToMap()

  try {
    // 시작 직후 촬영해도 기존 사진 복원 작업이 새 사진을 덮어쓰지 않게 기다린다.
    await photoRestorePromise
    
    if (captureMode !== 'virtual_3d') {
      // 첫 촬영이 기본 좌표에 저장되는 GPS 오류를 막는다.
      const hasPhotoPosition = await refreshPositionForPhoto()
      if (!hasPhotoPosition) {
        window.alert('사진 위치를 확인할 수 없습니다. 위치 권한을 허용한 뒤 다시 촬영해 주세요.')
        return
      }
    }
    
    showCaptureLoading()
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
    const result = await uploadSighting(file, position, catId, captureMode)
    hideCaptureLoading()
    renderCaptureResponse(result, dataUrl)

    if (['matched', 'new_cat_candidate'].includes(result?.detectionStatus)) {
      if (result.placement) photo.position = [result.placement.longitude, result.placement.latitude]
      photo.catId = result?.cat?.id ?? null
      await keepSuccessfulPhoto(photo)
      refreshCatActors(photo.position).catch((error) => console.warn('지도 고양이를 갱신하지 못했습니다.', error))
      pendingCapturedPhoto = null
    }
  } catch (error) {
    hideCaptureLoading()
    console.warn('사진 처리에 실패했습니다.', error)
    renderFailureCapture({
      detectionStatus: 'rejected',
      message: error?.message ?? '사진을 제출하지 못했습니다. 잠시 후 다시 시도해주세요.',
    })
  } finally {
    hideCaptureLoading()
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
      if (pendingConfirmation?.photo) {
        if (result.placement) pendingConfirmation.photo.position = [result.placement.longitude, result.placement.latitude]
        pendingConfirmation.photo.catId = result?.cat?.id ?? null
      }
      const refreshPosition = pendingConfirmation?.photo?.position ?? markerLngLat()
      await keepSuccessfulPhoto(pendingConfirmation?.photo)
      refreshCatActors(refreshPosition).catch((error) => console.warn('지도 고양이를 갱신하지 못했습니다.', error))
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
const settingsImageFileInput = document.querySelector('#settings-image-file')
const settingsPhotoPicker = document.querySelector('#settings-photo-picker')
const settingsPhotoEmpty = document.querySelector('#settings-photo-empty')
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

function renderAvatar(target, imageUrl, fallback = '👩‍🌾') {
  if (!target) return
  const resolved = resolveAssetUrl(imageUrl)
  if (resolved) {
    const img = document.createElement('img')
    img.src = resolved
    img.alt = ''
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit'
    target.replaceChildren(img)
  } else {
    target.textContent = fallback
  }
}

function updateDisplayedAvatar(imageUrl) {
  renderAvatar(document.querySelector('.settings-avatar'), imageUrl)
  renderAvatar(document.querySelector('.cat-menu-avatar'), imageUrl)
  renderAvatar(dexAvatar, imageUrl)
}

function selectSettingsProfilePhoto(imageUrl) {
  if (settingsImageInput) settingsImageInput.value = imageUrl || ''
  settingsPhotoPicker?.querySelectorAll('.settings-photo-option').forEach((button) => {
    button.classList.toggle('is-selected', button.dataset.imageUrl === imageUrl)
    button.setAttribute('aria-pressed', button.dataset.imageUrl === imageUrl ? 'true' : 'false')
  })
  renderAvatar(document.querySelector('.settings-avatar'), imageUrl)
}

function buildSettingsPhotoOption(photo) {
  const imageUrl = photo.imageUrl
  const previewUrl = resolveAssetUrl(imageUrl)
  const button = document.createElement('button')
  button.className = 'settings-photo-option'
  button.type = 'button'
  button.dataset.imageUrl = imageUrl
  button.setAttribute('aria-pressed', 'false')
  button.setAttribute('aria-label', photo.catName ? `${photo.catName} 사진 선택` : '갤러리 사진 선택')

  const img = document.createElement('img')
  img.src = previewUrl
  img.alt = ''
  img.loading = 'lazy'
  button.append(img)
  button.addEventListener('click', () => selectSettingsProfilePhoto(imageUrl))
  return button
}

async function loadSettingsProfilePhotos() {
  if (!settingsPhotoPicker) return
  settingsPhotoPicker.replaceChildren()
  if (settingsPhotoEmpty) {
    settingsPhotoEmpty.hidden = false
    settingsPhotoEmpty.textContent = '갤러리 사진을 불러오는 중이에요.'
  }

  try {
    const data = await getGallery({ limit: 24 })
    const photos = (data.photos ?? []).filter((photo) => photo.imageUrl)
    settingsPhotoPicker.replaceChildren(...photos.map(buildSettingsPhotoOption))
    if (settingsPhotoEmpty) {
      settingsPhotoEmpty.hidden = photos.length > 0
      settingsPhotoEmpty.textContent = '아직 프로필로 쓸 갤러리 사진이 없어요.'
    }
    selectSettingsProfilePhoto(settingsImageInput?.value || '')
  } catch (error) {
    console.warn('프로필 사진 후보를 불러오지 못했습니다.', error)
    if (settingsPhotoEmpty) {
      settingsPhotoEmpty.hidden = false
      settingsPhotoEmpty.textContent = '갤러리 사진을 불러오지 못했어요.'
    }
  }
}

function openSettingsScreen() {
  if (!settingsScreen || !settingsNameInput) return
  settingsNameInput.value = currentDisplayName()
  const profileImageUrl = getStoredUser()?.profileImageUrl || ''
  if (settingsImageInput) settingsImageInput.value = profileImageUrl
  renderAvatar(document.querySelector('.settings-avatar'), profileImageUrl)
  showSettingsMessage()
  settingsScreen.hidden = false
  loadSettingsProfilePhotos()
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
document.querySelector('[data-settings-photo-clear]')?.addEventListener('click', () => {
  selectSettingsProfilePhoto('')
})

// 기기 사진 업로드: 파일을 고르는 즉시 서버에 올리고(=프로필 이미지로 확정), 돌아온
// URL을 폼에 반영한다. "저장하기"를 눌러야 닉네임과 함께 다시 PATCH되지만, 이미
// profileImageUrl이 같은 값이라 멱등이다.
document.querySelector('[data-settings-photo-upload]')?.addEventListener('click', () => {
  settingsImageFileInput?.click()
})

settingsImageFileInput?.addEventListener('change', async (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  showSettingsMessage('사진을 올리는 중이에요…')

  try {
    const data = await uploadProfileImage(file)
    updateStoredUser({ ...getStoredUser(), ...data })
    selectSettingsProfilePhoto(data.profileImageUrl ?? '')
    updateDisplayedAvatar(data.profileImageUrl ?? null)
    showSettingsMessage('프로필 사진을 바꿨어요.')
  } catch (error) {
    showSettingsMessage(error?.message ?? '사진을 올리지 못했습니다.', true)
  } finally {
    event.target.value = '' // 같은 파일을 다시 골라도 change가 뜨도록
  }
})

document.querySelector('.cat-menu-logout')?.addEventListener('click', async (event) => {
  const button = event.currentTarget
  const originalHtml = button.innerHTML
  button.disabled = true
  button.textContent = '로그아웃 중...'
  const isGuest = getStoredUser()?.authProvider === 'guest'

  try {
    try {
      await logout()
    } catch (error) {
      console.warn('로그아웃 요청에 실패했습니다.', error)
      await logout()
    }

    if (isGuest) {
      try {
        await clearStoredPhotos()
      } catch (error) {
        console.warn('게스트 로컬 사진을 정리하지 못했습니다.', error)
      }
    }

    window.location.replace(window.location.pathname)
  } finally {
    button.disabled = false
    button.innerHTML = originalHtml
  }
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

// 미발견 고양이는 실루엣/아이콘 없이 그냥 "???"만 뜬 밋밋한 타일로 표시한다
// (포켓몬 도감의 미확인 번호 타일과 같은 느낌).
function buildLockedDexCard() {
  const card = document.createElement('div')
  card.className = 'dex-card dex-card--locked'
  card.setAttribute('aria-hidden', 'true')
  const tile = document.createElement('span')
  tile.className = 'dex-card-photo'
  tile.append(Object.assign(document.createElement('strong'), { textContent: '???' }))
  card.append(tile)
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
const catDetailMapCanvas = catDetailScreen?.querySelector('[data-cat-detail-map-canvas]')
let catDetailMap = null

// "발견한 장소" 미니맵: 처음 좌표가 생길 때만 생성한다(모달이 열려 컨테이너 크기가
// 잡힌 뒤여야 maplibre가 정상적으로 렌더링되므로 지연 초기화).
function ensureCatDetailMap() {
  if (catDetailMap || !catDetailMapCanvas) return catDetailMap
  catDetailMap = new maplibregl.Map({
    container: catDetailMapCanvas,
    style: '/monument-style.json',
    zoom: 16,
    pitch: 0,
    bearing: 0,
    interactive: false,
    attributionControl: { compact: true },
  })
  return catDetailMap
}

// 백엔드마다 좌표 필드 이름이 다르다(초기 프론트: lat/lng, 배포 백엔드: latitude/longitude).
// 둘 다 받아 { lat, lng } 형태로 통일한다. 유효한 숫자가 없으면 null.
function normalizeLatLng(source) {
  if (!source) return null
  const lat = Number(source.lat ?? source.latitude)
  const lng = Number(source.lng ?? source.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

// location: normalizeLatLng이 만든 { lat, lng } 또는 null.
function showCatDetailLocation(location) {
  if (!catDetailMapCanvas) return
  if (!location) {
    catDetailMapCanvas.hidden = true
    return
  }
  catDetailMapCanvas.hidden = false
  const targetMap = ensureCatDetailMap()
  if (!targetMap) return
  targetMap.resize()
  targetMap.flyTo({ center: [location.lng, location.lat], zoom: 16, duration: 600 })
}

const nicknameBtn = catDetailScreen?.querySelector('[data-nickname-edit]')
const nicknameForm = catDetailScreen?.querySelector('[data-nickname-form]')
const nicknameInput = nicknameForm?.querySelector('input')
const catDetail3DBtn = catDetailScreen?.querySelector('.cat-detail-3d')
let detailCatId = null
let detailCatModelUrl = null
let detailCatModelScale = null

// 발견 못 한 고양이는 보여줄 3D 모델이 없으므로 "고양이를 3D로 보기" 버튼 자체를 숨긴다.
function setDetail3DButtonAvailable(isAvailable) {
  if (!catDetail3DBtn) return
  catDetail3DBtn.hidden = !isAvailable
}

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
  detailCatModelUrl = null
  detailCatModelScale = null
  setDetail3DButtonAvailable(false) // 다음 fetch가 끝나기 전엔 이전 고양이의 상태가 잠깐 보이지 않게 숨겨둔다.
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
    // sightings는 이름/사진/3D 버튼과 무관한 "N회 목격" 텍스트에만 쓰인다. 예전엔
    // Promise.all로 두 요청을 한데 묶어서, sightings가 조금만 늦어도 3D 버튼까지
    // 같이 늦게 떴다. getCat만 먼저 기다리고 sightings는 별도로 나중에 반영한다.
    const sightingsPromise = getCatSightings(catId).catch(() => ({ sightings: [] }))
    const cat = await getCat(catId)
    setDetailName(item?.customName || cat.name || cat.displayName || '???')
    fillDetailPhoto(cat.mainImageUrl, cat.pattern)
    // /api/cats/:catId(catDetail)는 modelUrl/modelScale을 이미 계산해 주므로,
    // 먼저 이를 확인하여 가져온다. (관리자 승인 전 candidate 고양이는 pattern이 null일 수 있음).
    // 만약 modelUrl이 비어있다면, pattern을 기반으로 클라이언트 매핑에서 찾아 폴백으로 처리한다.
    if (cat.isDiscovered) {
      if (cat.modelUrl) {
        detailCatModelUrl = cat.modelUrl
        detailCatModelScale = cat.modelScale ?? 1
      } else if (cat.pattern) {
        const modelAsset = resolveCatModelAsset(cat.pattern)
        detailCatModelUrl = modelAsset.assetUrl
        detailCatModelScale = modelAsset.scale
      }
      if (detailCatModelUrl) {
        // 사용자가 3D 버튼을 누르기 전에 미리 three.js CDN 모듈과 glb 파일을 백그라운드로
        // 받아둔다. 버튼을 누른 시점엔 대부분 캐시에서 바로 뜬다.
        preloadCat3DAssets(detailCatModelUrl)
      }
    }
    setDetail3DButtonAvailable(Boolean(detailCatModelUrl))
    if (catDetailDate) catDetailDate.textContent = cat.discoveredAt ? `${photoDateLabel(cat.discoveredAt)} 발견` : ''
    if (catDetailRecord) catDetailRecord.textContent = cat.description || cat.personality || '아직 기록이 없어요.'
    // 발견한 장소: 백엔드가 주는 discoveryLocation(배포 백엔드는 latitude/longitude/zoneName,
    // 초기 프론트 버전은 lat/lng — normalizeLatLng이 둘 다 처리)을 우선 쓴다.
    let discoveryLatLng = normalizeLatLng(cat.discoveryLocation)
    if (catDetailPlace) catDetailPlace.textContent = cat.discoveryLocation?.zoneName || (discoveryLatLng ? '캠퍼스 어딘가' : '')
    if (discoveryLatLng) showCatDetailLocation(discoveryLatLng)

    const sightingsData = await sightingsPromise
    const sightings = sightingsData.sightings ?? []
    if (catDetailCount && catDetailCount.lastChild) {
      catDetailCount.lastChild.textContent = ` ${sightings.length}회 목격`
    }

    // discoveryLocation이 아직 없으면(백엔드 미배포 등) 목격 기록 좌표로 폴백해 최소한
    // 핀은 뜨게 한다. sightings는 최신순이라 가장 오래된(=발견 시점) 기록을 우선 쓴다.
    if (!discoveryLatLng) {
      discoveryLatLng = normalizeLatLng(sightings[sightings.length - 1]) ?? normalizeLatLng(sightings[0])
      if (catDetailPlace && !cat.discoveryLocation?.zoneName && discoveryLatLng) {
        catDetailPlace.textContent = '캠퍼스 어딘가'
      }
      showCatDetailLocation(discoveryLatLng)
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

// "고양이를 3D로 보기" — openCatDetail이 미리 계산해둔 modelUrl/modelScale을
// 단독 3D 뷰어(cat-3d-viewer.js)에 그대로 넘긴다. 뷰어는 pattern이나 매핑 규칙을
// 전혀 모르는 채로 주어진 modelUrl만 로드한다.
catDetail3DBtn?.addEventListener('click', () => {
  if (!detailCatId || !detailCatModelUrl) return
  const item = dexCollectionById.get(detailCatId)
  const name = item?.customName || item?.displayName || null
  openCat3DViewer({ modelUrl: detailCatModelUrl, modelScale: detailCatModelScale, name })
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
const sidebarDiscoveredCount = document.querySelector('.cat-menu-feature-copy strong')

async function loadProfileStats() {
  try {
    const me = await getProfile()
    if (dexStats[0] && me.discoveredCount != null) dexStats[0].textContent = String(me.discoveredCount)
    if (dexStats[1] && me.sightingCount != null) dexStats[1].textContent = String(me.sightingCount)
    if (sidebarDiscoveredCount && me.discoveredCount != null) {
      sidebarDiscoveredCount.textContent = `${me.discoveredCount}마리`
    }
    updateDisplayedAvatar(me.profileImageUrl)
  } catch (error) {
    console.warn('프로필을 불러오지 못했습니다.', error)
  }
}

// 사이드바(내 고양이 메뉴)를 열 때마다 발견한 고양이 수를 최신화한다.
window.loadProfileStats = loadProfileStats

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
    refreshCatActors().catch((error) => console.warn('지도 고양이를 갱신하지 못했습니다.', error))
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

// ── 도움말(정적 사용법 안내) ──
const helpScreen = document.querySelector('#help-screen')
document.querySelectorAll('[data-open-help]').forEach((button) => {
  button.addEventListener('click', () => {
    if (helpScreen) helpScreen.hidden = false
  })
})
document.querySelectorAll('[data-help-close]').forEach((button) => {
  button.addEventListener('click', () => {
    if (helpScreen) helpScreen.hidden = true
  })
})

// 디자인 QA용: URL 해시로 바로 진입해서 화면을 확인할 수 있게 한다.
// (#profile, #detail, #settings, #menu, #camera, #capture-preview는 기존에 이미 지원됨)
if (['#favorites', '#activity', '#gallery', '#help'].includes(window.location.hash)) {
  document.querySelector('#welcome').hidden = true
  document.querySelector('#signup').hidden = true
}
if (window.location.hash === '#favorites') openFavorites()
if (window.location.hash === '#activity') openActivity()
if (window.location.hash === '#help' && helpScreen) helpScreen.hidden = false
if (window.location.hash === '#gallery') {
  renderGallery()
  catGallery.hidden = false
  loadServerGallery()
}

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
    updateDisplayedAvatar(data.profileImageUrl ?? null)
    showSettingsMessage('저장됐어요.')
  } catch (error) {
    showSettingsMessage(error?.message ?? '저장하지 못했습니다.', true)
  } finally {
    button.disabled = false
    button.textContent = '저장하기'
  }
})

updateDisplayedName(currentDisplayName())

// 이 모듈은 로그인 전에 한 번 평가되므로, 위 updateDisplayedName은 아직 세션이 없는
// 상태(=기본값 "캣집사")로 그려진다. 로그인/닉네임 설정을 마치고 서비스로 들어오는
// 시점에 저장된 사용자로 이름·아바타를 다시 그려야 방금 입력한 닉네임이 반영된다.
const trySyncServerPhotos = withBootRetry('서버 목격담 동기화', syncServerPhotos)

window.addEventListener('catchme:enter-service', () => {
  updateDisplayedName(currentDisplayName())
  updateDisplayedAvatar(getStoredUser()?.profileImageUrl ?? null)
  trySyncServerPhotos()
})

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

// 다시 촬영(Retake) 버튼 클릭 시 통합 처리.
// 감지 실패 화면에서도 직전에 쓰던 뷰파인더로 그대로 돌아가야 한다.
// (예전에는 일반 카메라일 때 cameraInput.click()으로 OS 기본 카메라 앱이 열렸다.)
document.querySelectorAll('[data-capture-retake]').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()

    // 결과 창 닫기
    const result = document.querySelector('#capture-result')
    if (result) result.hidden = true
    if (window.location.hash.startsWith('#capture-')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }

    if (lastCameraMode === 'virtual_3d') {
      // 3D는 오버레이(셔터·조준점)를 먼저 되살린 뒤 1인칭 카메라를 켠다.
      // 오버레이가 hidden인 채로 enable3DCameraMode()만 부르면 촬영 UI가 사라진다.
      cameraView.hidden = false
      shutterBtn.disabled = false
      cameraView.classList.remove('is-capturing')
      if (!window.is3DCameraActive) enable3DCameraMode()
    } else if (window.showCameraView) {
      // 앱 내 뷰파인더 재진입 (cameraBtn 클릭과 동일한 경로)
      window.showCameraView()
    } else {
      cameraInput.click()
    }
  })
})
