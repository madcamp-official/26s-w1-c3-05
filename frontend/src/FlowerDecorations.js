import { MercatorCoordinate } from 'maplibre-gl'

// ─────────────────────────────────────────────
// 장식용 꽃/풀 배치 설정 — 개수/밀도/범위/크기는 이 객체만 바꾸면 조절된다.
// widthMetersRange는 "실제 세계 미터" 단위라서, 줌을 당기고 미는 원근 크기 변화는
// 3D 좌표계가 알아서 처리해준다 (기존처럼 줌 구간별 픽셀 폭을 손으로 보간할 필요 없음).
// ─────────────────────────────────────────────
export const FLOWER_DECORATION_CONFIG = {
  layerId: 'flower-decorations',
  count: 90,
  seed: 20260704,
  bounds: {
    west: 127.3586,
    south: 36.3682,
    east: 127.3674,
    north: 36.3758,
  },
  widthMetersRange: { min: 1.0, max: 1.7 },
  icons: [
    { url: '/decorations/flower-pink.png', weight: 3 },
    { url: '/decorations/flower-white.png', weight: 2 },
    { url: '/decorations/flower-yellow-cluster.png', weight: 3 },
    { url: '/decorations/flower-mixed-cluster.png', weight: 2 },
  ],
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

function generateFlowers(config) {
  const random = seededRandom(config.seed)
  const { west, south, east, north } = config.bounds
  const { min, max } = config.widthMetersRange
  const lngSpan = east - west
  const latSpan = north - south

  return Array.from({ length: config.count }, () => ({
    lngLat: [west + random() * lngSpan, south + random() * latSpan],
    iconUrl: weightedIcon(random, config.icons),
    widthMeters: min + random() * (max - min),
  }))
}

// ─────────────────────────────────────────────
// 셰이더: 카드의 뿌리(a_corner.y = 0)를 지면에 고정하고,
// 가로축(u_ndcRight)만 지도 bearing(카메라의 수평 회전)에 맞춰 돌린 방향으로 펼친다.
// 세로축(u_ndcUp)은 항상 월드의 수직(Z) 방향으로 고정되므로, 카메라를 기울여도(pitch)
// 카드는 눕지 않고 "땅에 서 있는" 채로 자연스러운 원근 축소만 적용된다.
// → Y축(수직축) 기준 빌보드
//
// u_ndcBase/u_ndcRight/u_ndcUp는 (mercator 절대좌표 → 화면 NDC) 변환을
// 자바스크립트(64비트 float)에서 미리 끝내고 넘겨준 값이다. mercator 좌표는 0~1
// 범위인 반면 꽃의 실제 크기(1~2m)는 그보다 7~8자리 작아서, 이 뺄셈을 GPU
// 셰이더(32비트 float)에서 하면 크기 정보가 통째로 반올림되어 사라진다.
// 그래서 "카드 크기만큼의 화면상 차이"를 미리 계산해 작은 값으로 넘긴다.
// ─────────────────────────────────────────────
const VERTEX_SHADER = `
  attribute vec2 a_corner;
  attribute vec2 a_uv;
  uniform vec3 u_ndcBase;
  uniform vec3 u_ndcRight;
  uniform vec3 u_ndcUp;
  varying vec2 v_uv;
  void main() {
    vec3 ndc = u_ndcBase + u_ndcRight * a_corner.x + u_ndcUp * a_corner.y;
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

// mercator 절대좌표(x,y,z)를 정점 셰이더가 쓰는 NDC(-1..1 근방)로 변환한다.
// 64비트 자바스크립트 연산이라 mercator 좌표(0~1)에 미터 단위 오프셋을 더해도
// 정밀도가 그대로 유지된다 (32비트 GPU 셰이더에서는 불가능한 연산).
function projectToNdc(matrix, x, y, z) {
  const clipX = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]
  const clipY = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]
  const clipZ = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
  const clipW = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15]
  return [clipX / clipW, clipY / clipW, clipZ / clipW]
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
    this.program = createProgram(gl)
    this.locations = {
      corner: gl.getAttribLocation(this.program, 'a_corner'),
      uv: gl.getAttribLocation(this.program, 'a_uv'),
      ndcBase: gl.getUniformLocation(this.program, 'u_ndcBase'),
      ndcRight: gl.getUniformLocation(this.program, 'u_ndcRight'),
      ndcUp: gl.getUniformLocation(this.program, 'u_ndcUp'),
      texture: gl.getUniformLocation(this.program, 'u_texture'),
    }

    this.cornerBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_CORNERS, gl.STATIC_DRAW)

    this.uvBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_UVS, gl.STATIC_DRAW)

    // 아이콘별 텍스처는 한 번만 로드하고, 같은 텍스처를 쓰는 꽃끼리 묶어서 그린다
    // (텍스처 바인딩 전환 횟수를 줄이기 위함 — 꽃 개수가 적어 큰 의미는 없지만 공짜로 되는 최적화)
    const textureByUrl = new Map()
    this.groups = this.config.icons.map((icon) => {
      if (!textureByUrl.has(icon.url)) textureByUrl.set(icon.url, loadTexture(gl, icon.url))
      return { texture: textureByUrl.get(icon.url), flowers: [] }
    })
    const groupByUrl = new Map(this.config.icons.map((icon, i) => [icon.url, this.groups[i]]))

    for (const flower of generateFlowers(this.config)) {
      const mercator = MercatorCoordinate.fromLngLat(flower.lngLat, 0)
      groupByUrl.get(flower.iconUrl).flowers.push({
        base: [mercator.x, mercator.y, mercator.z],
        unitsPerMeter: mercator.meterInMercatorCoordinateUnits(),
        widthMeters: flower.widthMeters,
      })
    }
  }

  onRemove(map, gl) {
    gl.deleteBuffer(this.cornerBuffer)
    gl.deleteBuffer(this.uvBuffer)
    gl.deleteProgram(this.program)
    for (const group of this.groups) gl.deleteTexture(group.texture.texture)
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

    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuffer)
    gl.enableVertexAttribArray(locations.corner)
    gl.vertexAttribPointer(locations.corner, 2, gl.FLOAT, false, 0, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer)
    gl.enableVertexAttribArray(locations.uv)
    gl.vertexAttribPointer(locations.uv, 2, gl.FLOAT, false, 0, 0)

    gl.activeTexture(gl.TEXTURE0)

    for (const group of groups) {
      if (!group.texture.ready) continue
      gl.bindTexture(gl.TEXTURE_2D, group.texture.texture)
      const heightMetersScale = group.texture.aspect
      for (const flower of group.flowers) {
        const [bx, by, bz] = flower.base
        const oneMeter = flower.unitsPerMeter
        const widthMeters = flower.widthMeters
        const heightMeters = widthMeters * heightMetersScale

        // (mercator 절대좌표 → NDC) 변환과, 그 근방에서 "가로/세로로 1m 이동하면
        // 화면이 얼마나 움직이는지"를 자바스크립트(64비트)에서 미리 구해 넘긴다.
        const ndcBase = projectToNdc(matrix, bx, by, bz)
        const ndcAfterRight = projectToNdc(matrix, bx + rightX * oneMeter, by + rightY * oneMeter, bz)
        const ndcAfterUp = projectToNdc(matrix, bx, by, bz + oneMeter)

        gl.uniform3f(locations.ndcBase, ndcBase[0], ndcBase[1], ndcBase[2])
        gl.uniform3f(
          locations.ndcRight,
          (ndcAfterRight[0] - ndcBase[0]) * widthMeters,
          (ndcAfterRight[1] - ndcBase[1]) * widthMeters,
          (ndcAfterRight[2] - ndcBase[2]) * widthMeters
        )
        gl.uniform3f(
          locations.ndcUp,
          (ndcAfterUp[0] - ndcBase[0]) * heightMeters,
          (ndcAfterUp[1] - ndcBase[1]) * heightMeters,
          (ndcAfterUp[2] - ndcBase[2]) * heightMeters
        )
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      }
    }

    gl.disableVertexAttribArray(locations.corner)
    gl.disableVertexAttribArray(locations.uv)
  }
}

export function addFlowerDecorations(map, config = FLOWER_DECORATION_CONFIG) {
  if (map.getLayer(config.layerId)) return
  map.addLayer(new FlowerDecorationLayer(config))
}
