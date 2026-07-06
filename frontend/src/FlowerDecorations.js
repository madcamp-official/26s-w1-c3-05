import { MercatorCoordinate } from 'maplibre-gl'

// ─────────────────────────────────────────────
// 장식용 꽃/풀 배치 설정 — 개수/밀도/범위/크기는 이 객체만 바꾸면 조절된다.
// widthMetersRange는 "실제 세계 미터" 단위라서, 줌을 당기고 미는 원근 크기 변화는
// 3D 좌표계가 알아서 처리해준다 (기존처럼 줌 구간별 픽셀 폭을 손으로 보간할 필요 없음).
// ─────────────────────────────────────────────
export const FLOWER_DECORATION_CONFIG = {
  layerId: 'flower-decorations',
  count: 30000,
  seed: 20260704,
  bounds: {
    west: 127.3586,
    south: 36.3682,
    east: 127.3674,
    north: 36.3758,
  },
  widthMetersRange: { min: 0.5, max: 1.2},
  icons: [
    { url: '/decorations/flower-pink.png', weight: 3 },
    { url: '/decorations/flower-white.png', weight: 2 },
    { url: '/decorations/flower-yellow-cluster.png', weight: 3 },
    { url: '/decorations/flower-mixed-cluster.png', weight: 2 },
  ],
  // 아바타(사용자) 위치 근처를 더 촘촘하게 — center가 null이면 bounds의 중심(=KAIST_CENTER 부근)을 기준으로 삼는다.
  // falloffRadiusMeters 밖으로 멀어질수록 밀도가 baseline 비율까지 옅어진다.
  densityBias: {
    center: null,
    falloffRadiusMeters: 220,
    baseline: 0.15,
  },
  // 이 레이어들(예: 강/호수) 위에는 꽃을 배치하지 않는다.
  avoidLayers: ['water'],
}

function seededRandom(seed) {
  let value = seed
  return () => {
    value |= 0
    value = (value + 0x6d2b79f5) | 0
    let next = Math.imul(value ^ (value >>> 15), 1 | value)
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

function weightedIcon(random, icons) {
  const totalWeight = icons.reduce((sum, icon) => sum + icon.weight, 0)
  let pick = random() * totalWeight

  for (const icon of icons) {
    pick -= icon.weight
    if (pick <= 0) return icon.url
  }
  return icons[icons.length - 1].url
}

// 위경도 차이를 이 작은 영역(수백 m) 안에서만 쓸 근사 미터 거리로 변환 (정밀한 측지 계산 불필요)
function approxMetersBetween(lng1, lat1, lng2, lat2) {
  const dLng = (lng2 - lng1) * Math.cos((lat1 * Math.PI) / 180) * 111320
  const dLat = (lat2 - lat1) * 110540
  return Math.hypot(dLng, dLat)
}

// center에 가까울수록 1에 가깝고, falloffRadiusMeters 밖으로 멀어질수록 baseline까지 옅어지는 밀도 가중치
function densityWeight(distanceMeters, densityBias) {
  const t = distanceMeters / densityBias.falloffRadiusMeters
  return densityBias.baseline + (1 - densityBias.baseline) * Math.exp(-t * t)
}

function generateFlowers(config, isOnAvoidedLayer) {
  const random = seededRandom(config.seed)
  const { west, south, east, north } = config.bounds
  const { min, max } = config.widthMetersRange
  const lngSpan = east - west
  const latSpan = north - south
  const densityBias = config.densityBias
  const center = densityBias?.center ?? [(west + east) / 2, (south + north) / 2]
  const maxAttemptsPerFlower = 25

  const flowers = []
  for (let i = 0; i < config.count; i++) {
    for (let attempt = 0; attempt < maxAttemptsPerFlower; attempt++) {
      const lng = west + random() * lngSpan
      const lat = south + random() * latSpan

      if (densityBias) {
        const distance = approxMetersBetween(center[0], center[1], lng, lat)
        if (random() > densityWeight(distance, densityBias)) continue // 중심에서 먼 곳일수록 확률적으로 재추첨
      }
      if (isOnAvoidedLayer(lng, lat)) continue // 강/물 위면 재추첨

      flowers.push({
        lngLat: [lng, lat],
        iconUrl: weightedIcon(random, config.icons),
        widthMeters: min + random() * (max - min),
      })
      break
    }
    // maxAttemptsPerFlower를 다 쓰면 그 자리는 포기하고 다음 꽃으로 넘어간다
    // (예: bounds 대부분이 물로 덮인 경우) — count보다 실제 꽃 수가 살짝 적을 수 있다.
  }
  return flowers
}

// 짝/홀 교차 규칙(ray casting)으로 점이 한 고리(ring) 안에 있는지 판정
function pointInRing(x, y, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (crosses) inside = !inside
  }
  return inside
}

// GeoJSON Polygon(고리 1개 이상, 첫 고리 이후는 구멍)의 링들을 순서대로 토글하면
// 구멍(hole)까지 올바르게 처리된다.
function pointInPolygonRings(x, y, rings) {
  let inside = false
  for (const ring of rings) {
    if (pointInRing(x, y, ring)) inside = !inside
  }
  return inside
}

function pointInFeatures(lng, lat, features) {
  for (const feature of features) {
    const geometry = feature.geometry
    if (!geometry) continue
    const polygons =
      geometry.type === 'Polygon'
        ? [geometry.coordinates]
        : geometry.type === 'MultiPolygon'
          ? geometry.coordinates
          : []
    for (const rings of polygons) {
      if (pointInPolygonRings(lng, lat, rings)) return true
    }
  }
  return false
}

// avoidLayers(강/물 등)에 해당하는 도형을 화면에 렌더된 상태에서 "한 번만" 통째로 읽어와
// 이후에는 point-in-polygon만 순수 자바스크립트로 판정한다. 후보 지점마다 매번
// map.queryRenderedFeatures를 부르면(원래 방식) count가 커질수록(예: 수만 개) GPU/네이티브
// 호출 비용이 누적되어 배치 자체가 몇십 초씩 걸릴 수 있어, 쿼리 자체를 1회로 줄였다.
function createAvoidedLayerChecker(map, config) {
  const layers = (config.avoidLayers ?? []).filter((id) => map.getLayer(id))
  if (layers.length === 0) return () => false

  const { west, south, east, north } = config.bounds
  const screenBounds = [map.project([west, north]), map.project([east, south])]
  const features = map.queryRenderedFeatures(screenBounds, { layers })
  if (features.length === 0) return () => false

  return (lng, lat) => pointInFeatures(lng, lat, features)
}

// ─────────────────────────────────────────────
// 셰이더: 카드의 뿌리(a_corner.y = 0)를 지면에 고정하고,
// 가로축(a_ndcRight)만 지도 bearing(카메라의 수평 회전)에 맞춰 돌린 방향으로 펼친다.
// 세로축(a_ndcUp)은 항상 월드의 수직(Z) 방향으로 고정되므로, 카메라를 기울여도(pitch)
// 카드는 눕지 않고 "땅에 서 있는" 채로 자연스러운 원근 축소만 적용된다.
// → Y축(수직축) 기준 빌보드
//
// a_ndcBase/a_ndcRight/a_ndcUp는 (mercator 절대좌표 → 화면 NDC) 변환을 자바스크립트
// (64비트 float)에서 미리 끝내고 넘겨준 값이다. mercator 좌표는 0~1 범위인 반면 꽃의
// 실제 크기(1m 안팎)는 그보다 7~8자리 작아서, 이 뺄셈을 GPU 셰이더(32비트 float)에서
// 하면 크기 정보가 통째로 반올림되어 사라진다. 그래서 "카드 크기만큼의 화면상 차이"를
// 미리 계산해 작은 값으로 넘긴다.
//
// 인스턴스 렌더링: a_corner/a_uv는 정점(4개, divisor=0)마다 값이 바뀌고,
// a_ndcBase/a_ndcRight/a_ndcUp는 인스턴스(꽃 1개, divisor=1)마다 값이 바뀐다.
// 그래서 꽃이 몇 만 개여도 그리기 호출은 아이콘 종류 수(그룹 수)만큼만 발생한다.
// ─────────────────────────────────────────────
const VERTEX_SHADER = `
  attribute vec2 a_corner;
  attribute vec2 a_uv;
  attribute vec3 a_ndcBase;
  attribute vec3 a_ndcRight;
  attribute vec3 a_ndcUp;
  varying vec2 v_uv;
  void main() {
    vec3 ndc = a_ndcBase + a_ndcRight * a_corner.x + a_ndcUp * a_corner.y;
    gl_Position = vec4(ndc, 1.0);
    v_uv = a_uv;
  }
`

const FRAGMENT_SHADER = `
  precision mediump float;
  varying vec2 v_uv;
  uniform sampler2D u_texture;
  void main() {
    vec4 color = texture2D(u_texture, v_uv);
    if (color.a < 0.03) discard;
    gl_FragColor = color;
  }
`

// 뿌리(0,0)-(1,0)가 지면, 끝(0,1)-(1,1)이 꽃 위쪽인 단위 사각형 — 모든 꽃이 공유
const QUAD_CORNERS = new Float32Array([-0.5, 0, 0.5, 0, -0.5, 1, 0.5, 1])
const QUAD_UVS = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1])

function compileShader(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`꽃 장식 셰이더 컴파일 실패: ${info}`)
  }
  return shader
}

function createProgram(gl) {
  const program = gl.createProgram()
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER))
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`꽃 장식 프로그램 링크 실패: ${gl.getProgramInfoLog(program)}`)
  }
  return program
}

// 아이콘 텍스처를 로드하는 동안에는 1x1 투명 픽셀로 대체해 렌더 오류를 막는다.
function loadTexture(gl, url) {
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]))
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

  const state = { texture, aspect: 1, ready: false }
  const image = new Image()
  image.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    state.aspect = image.naturalHeight / image.naturalWidth
    state.ready = true
  }
  image.onerror = () => console.warn('꽃 장식 이미지 로드 실패:', url)
  image.src = url
  return state
}

// mercator 절대좌표(x,y,z)를 정점 셰이더가 쓰는 NDC(-1..1 근방)로 변환해 out[offset..]에 써준다.
// 64비트 자바스크립트 연산이라 mercator 좌표(0~1)에 미터 단위 오프셋을 더해도 정밀도가
// 그대로 유지된다 (32비트 GPU 셰이더에서는 불가능한 연산). 결과 배열을 매번 새로 만들지 않고
// 미리 만든 scratch 배열에 써서, 꽃이 몇 만 개여도 프레임당 GC 부담이 크게 늘지 않게 한다.
function projectToNdcInto(matrix, x, y, z, out) {
  const clipX = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]
  const clipY = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]
  const clipZ = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
  const clipW = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15]
  out[0] = clipX / clipW
  out[1] = clipY / clipW
  out[2] = clipZ / clipW
}

class FlowerDecorationLayer {
  constructor(config) {
    this.id = config.layerId
    this.type = 'custom'
    this.renderingMode = '3d'
    this.config = config
  }

  onAdd(map, gl) {
    this.map = map
    this.gl = gl
    this.program = createProgram(gl)
    this.locations = {
      corner: gl.getAttribLocation(this.program, 'a_corner'),
      uv: gl.getAttribLocation(this.program, 'a_uv'),
      ndcBase: gl.getAttribLocation(this.program, 'a_ndcBase'),
      ndcRight: gl.getAttribLocation(this.program, 'a_ndcRight'),
      ndcUp: gl.getAttribLocation(this.program, 'a_ndcUp'),
      texture: gl.getUniformLocation(this.program, 'u_texture'),
    }

    this.cornerBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_CORNERS, gl.STATIC_DRAW)

    this.uvBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_UVS, gl.STATIC_DRAW)

    // 아이콘별 텍스처는 한 번만 로드하고, 같은 텍스처를 쓰는 꽃끼리 묶어서 그린다
    // (인스턴스 렌더링으로 그룹당 그리기 호출이 1번뿐이라 텍스처 전환도 그룹 수만큼만 발생)
    const textureByUrl = new Map()
    this.groups = this.config.icons.map((icon) => {
      if (!textureByUrl.has(icon.url)) textureByUrl.set(icon.url, loadTexture(gl, icon.url))
      return { texture: textureByUrl.get(icon.url), flowers: [], instanceCount: 0 }
    })
    const groupByUrl = new Map(this.config.icons.map((icon, i) => [icon.url, this.groups[i]]))

    // avoidLayers(강/물) 판정을 위해 map.queryRenderedFeatures를 쓰므로, 해당 영역 타일이
    // 실제로 렌더링된 뒤(=idle)에 배치를 계산해야 물 위 배제가 제대로 동작한다.
    const populate = () => {
      const isOnAvoidedLayer = createAvoidedLayerChecker(map, this.config)
      for (const flower of generateFlowers(this.config, isOnAvoidedLayer)) {
        const mercator = MercatorCoordinate.fromLngLat(flower.lngLat, 0)
        groupByUrl.get(flower.iconUrl).flowers.push({
          base: [mercator.x, mercator.y, mercator.z],
          unitsPerMeter: mercator.meterInMercatorCoordinateUnits(),
          widthMeters: flower.widthMeters,
        })
      }
      // 인스턴스 속성용 GPU 버퍼를 각 그룹의 최종 꽃 개수에 맞춰 한 번만 만들어 둔다
      // (매 프레임 채워지는 값은 render()에서 bufferSubData로 갱신한다)
      for (const group of this.groups) {
        group.instanceCount = group.flowers.length
        group.ndcBaseArray = new Float32Array(group.instanceCount * 3)
        group.ndcRightArray = new Float32Array(group.instanceCount * 3)
        group.ndcUpArray = new Float32Array(group.instanceCount * 3)
        group.ndcBaseBuffer = gl.createBuffer()
        group.ndcRightBuffer = gl.createBuffer()
        group.ndcUpBuffer = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, group.ndcBaseBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, group.ndcBaseArray.byteLength, gl.DYNAMIC_DRAW)
        gl.bindBuffer(gl.ARRAY_BUFFER, group.ndcRightBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, group.ndcRightArray.byteLength, gl.DYNAMIC_DRAW)
        gl.bindBuffer(gl.ARRAY_BUFFER, group.ndcUpBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, group.ndcUpArray.byteLength, gl.DYNAMIC_DRAW)
      }
    }
    if (map.loaded()) populate()
    else map.once('idle', populate)
  }

  onRemove(map, gl) {
    gl.deleteBuffer(this.cornerBuffer)
    gl.deleteBuffer(this.uvBuffer)
    gl.deleteProgram(this.program)
    for (const group of this.groups) {
      gl.deleteTexture(group.texture.texture)
      if (group.ndcBaseBuffer) gl.deleteBuffer(group.ndcBaseBuffer)
      if (group.ndcRightBuffer) gl.deleteBuffer(group.ndcRightBuffer)
      if (group.ndcUpBuffer) gl.deleteBuffer(group.ndcUpBuffer)
    }
  }

  render(gl, options) {
    const { program, locations, groups } = this
    const matrix = options.defaultProjectionData.mainMatrix
    // bearing(카메라의 수평 회전)만 반영 → Y축(수직) 기준 빌보드.
    // pitch는 일부러 반영하지 않는다: 카드가 항상 세워진 채로 원근만 자연스럽게 적용되어야
    // "땅에 심어진" 느낌이 나기 때문 (카메라를 완전히 정면으로 보게 하면 스티커처럼 붕 뜬 느낌이 남).
    const bearingRad = (this.map.getBearing() * Math.PI) / 180
    const rightX = Math.cos(bearingRad)
    const rightY = Math.sin(bearingRad)

    gl.useProgram(program)
    gl.enable(gl.DEPTH_TEST)
    gl.depthMask(true)
    gl.enable(gl.BLEND)
    // 텍스처가 premultiplied alpha가 아니므로(PNG 원본 그대로) 그에 맞는 블렌드 함수 사용
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.disable(gl.CULL_FACE)

    gl.uniform1i(locations.texture, 0)

    // 정점(4개)마다 바뀌는 속성 — 모든 인스턴스가 공유
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuffer)
    gl.enableVertexAttribArray(locations.corner)
    gl.vertexAttribPointer(locations.corner, 2, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(locations.corner, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer)
    gl.enableVertexAttribArray(locations.uv)
    gl.vertexAttribPointer(locations.uv, 2, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(locations.uv, 0)

    // 인스턴스(꽃 1개)마다 바뀌는 속성
    gl.enableVertexAttribArray(locations.ndcBase)
    gl.vertexAttribDivisor(locations.ndcBase, 1)
    gl.enableVertexAttribArray(locations.ndcRight)
    gl.vertexAttribDivisor(locations.ndcRight, 1)
    gl.enableVertexAttribArray(locations.ndcUp)
    gl.vertexAttribDivisor(locations.ndcUp, 1)

    gl.activeTexture(gl.TEXTURE0)

    const scratch = [0, 0, 0]
    const scratchDir = [0, 0, 0]

    for (const group of groups) {
      if (!group.texture.ready || group.instanceCount === 0) continue
      gl.bindTexture(gl.TEXTURE_2D, group.texture.texture)
      const heightMetersScale = group.texture.aspect
      const { flowers, ndcBaseArray, ndcRightArray, ndcUpArray } = group

      for (let i = 0; i < flowers.length; i++) {
        const flower = flowers[i]
        const [bx, by, bz] = flower.base
        const oneMeter = flower.unitsPerMeter
        const widthMeters = flower.widthMeters
        const heightMeters = widthMeters * heightMetersScale

        // (mercator 절대좌표 → NDC) 변환과, 그 근방에서 "가로/세로로 1m 이동하면
        // 화면이 얼마나 움직이는지"를 자바스크립트(64비트)에서 미리 구해 넘긴다.
        projectToNdcInto(matrix, bx, by, bz, scratch)
        const o = i * 3
        ndcBaseArray[o] = scratch[0]
        ndcBaseArray[o + 1] = scratch[1]
        ndcBaseArray[o + 2] = scratch[2]

        projectToNdcInto(matrix, bx + rightX * oneMeter, by + rightY * oneMeter, bz, scratchDir)
        ndcRightArray[o] = (scratchDir[0] - scratch[0]) * widthMeters
        ndcRightArray[o + 1] = (scratchDir[1] - scratch[1]) * widthMeters
        ndcRightArray[o + 2] = (scratchDir[2] - scratch[2]) * widthMeters

        projectToNdcInto(matrix, bx, by, bz + oneMeter, scratchDir)
        ndcUpArray[o] = (scratchDir[0] - scratch[0]) * heightMeters
        ndcUpArray[o + 1] = (scratchDir[1] - scratch[1]) * heightMeters
        ndcUpArray[o + 2] = (scratchDir[2] - scratch[2]) * heightMeters
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, group.ndcBaseBuffer)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, ndcBaseArray)
      gl.vertexAttribPointer(locations.ndcBase, 3, gl.FLOAT, false, 0, 0)

      gl.bindBuffer(gl.ARRAY_BUFFER, group.ndcRightBuffer)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, ndcRightArray)
      gl.vertexAttribPointer(locations.ndcRight, 3, gl.FLOAT, false, 0, 0)

      gl.bindBuffer(gl.ARRAY_BUFFER, group.ndcUpBuffer)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, ndcUpArray)
      gl.vertexAttribPointer(locations.ndcUp, 3, gl.FLOAT, false, 0, 0)

      // 그룹(아이콘 종류) 하나당 그리기 호출 1번으로 그 그룹의 꽃 전부를 그린다
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, group.instanceCount)
    }

    gl.disableVertexAttribArray(locations.corner)
    gl.disableVertexAttribArray(locations.uv)
    gl.disableVertexAttribArray(locations.ndcBase)
    gl.disableVertexAttribArray(locations.ndcRight)
    gl.disableVertexAttribArray(locations.ndcUp)
  }
}

export function addFlowerDecorations(map, config = FLOWER_DECORATION_CONFIG) {
  if (map.getLayer(config.layerId)) return
  map.addLayer(new FlowerDecorationLayer(config))
}
