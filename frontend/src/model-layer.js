import { MercatorCoordinate } from 'maplibre-gl'

const THREE_VERSION = '0.180.0'
const THREE_CDN = "https://esm.sh/three@" + THREE_VERSION
const GLTF_LOADER_CDN = THREE_CDN + "/examples/jsm/loaders/GLTFLoader.js"
const SKELETON_UTILS_CDN = THREE_CDN + "/examples/jsm/utils/SkeletonUtils.js"

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value))

// 아바타/고양이 탭 상호작용에서 "잠깐 특정 방향을 보게" 만드는 공용 헬퍼. 매 프레임
// makeTransform에서 다시 평가되므로, 만료되면 별도 정리 없이 원래 각도로 자연히 돌아간다.
function startFacingOverride(targetYawRadians, holdSeconds) {
  return { targetYaw: targetYawRadians, expiresAt: Date.now() + holdSeconds * 1000 }
}
function resolveYaw(baseYaw, override) {
  return override && Date.now() < override.expiresAt ? override.targetYaw : baseYaw
}

// main.js의 bearingBetween과 동일한 로직(순환 import를 피하려고 여기 따로 둠 — 바뀌면
// main.js 쪽도 같이 맞출 것). from → to 방향의 나침반 방위각(라디안, 0=북쪽·시계방향).
function bearingBetweenRadians(from, to) {
  const toRad = (deg) => (deg * Math.PI) / 180
  const lat1 = toRad(from[1])
  const lat2 = toRad(to[1])
  const deltaLng = toRad(to[0] - from[0])
  const y = Math.sin(deltaLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng)
  return Math.atan2(y, x)
}

// 나침반 방위각(북=0, 시계방향) → makeTransform의 rotationY 값으로 변환.
//
// makeTransform은 scale(s, -s, s) · rotX(90°) · rotY(θ) 순으로 곱하므로, 모델 로컬
// forward(-Z)는 머케이터 좌표에서 (-sinθ, -cosθ)로 간다(x=동쪽+, y=남쪽+).
//   θ=0   → (0, -1) = 북쪽
//   θ=+90 → (-1, 0) = 서쪽
// 즉 θ가 커지면 북→서(반시계)로 도는데, 나침반 방위각은 북→동(시계)으로 커진다.
// 그래서 부호를 뒤집어야 실제로 그 방위각을 바라본다.
function yawForBearing(bearingRadians) {
  return -bearingRadians
}

// 고양이 id를 해시해 0~2π 사이 결정적(deterministic) 각도로 매핑한다. 같은 고양이는
// 항상 같은 값이 나오므로 폴링/재조회로 actor 목록이 다시 와도 방향이 튀지 않는다.
function seededYawForId(id) {
  const str = String(id)
  let h = 0
  for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h ^= h >>> 16
  return ((h >>> 0) / 4294967296) * Math.PI * 2
}

// 미쿠가 항상 바라보는 지도 기준 방향(북쪽).
// 시점 전환 시 미쿠가 돌아보는 게 아니라, 원래 그쪽을 보고 있던 것처럼 보인다.
const AVATAR_WORLD_HEADING = Math.PI
// 고양이와 같은 줌 기준 크기 곡선을 쓰되, 미쿠만 이 배율만큼 더 크게 그린다.
// 3.0은 너무 커서(고양이 대비 3배) 체감상 거대해 보였음 — 절반 정도로 줄임.
const AVATAR_SIZE_MULTIPLIER = 1.6
// 로드뷰(팔로우)에서는 미쿠가 1.2배 더 크게 보인다. isFollowing 불리언으로 즉시 바꾸면
// 더블탭 순간 크기가 툭 튀어(팝) 버리므로, 줌 값을 따라 오버뷰→로드뷰 구간에서
// 1.0배→1.2배로 연속적으로 보간한다(다른 모든 크기 계산과 같은 줌 곡선 사용).
const AVATAR_FOLLOW_SIZE_BOOST = 1.2
// 오버뷰(항공뷰)에서는 실제 원근 비율대로면 너무 작아 보여서, 오버뷰 줌에서만 2배로
// 키운다. 로드뷰 구간(줌 18 이상)에서는 1.0배로 돌아와 로드뷰 크기엔 영향 없다.
const AVATAR_OVERVIEW_SIZE_BOOST = 3.6

const MODEL_BASE_ZOOM = 14.1
const MODEL_ZOOM_EXPONENT = 0.41
const MODEL_MIN_ZOOM_SCALE = 0.35
const MODEL_MAX_ZOOM_SCALE = 7
const AVATAR_MODEL_URL = '/models/miku_final_web_avatar_muted_unlit.glb'
const CAT_MODEL_URL = '/models/cat.glb'
const BUSH_MODEL_URL = '/models/bush_01.glb'
const MAX_RENDER_PIXEL_RATIO = 3
const TEXTURE_MAP_KEYS = [
  'map',
  'emissiveMap',
  'alphaMap',
  'aoMap',
  'roughnessMap',
  'metalnessMap',
  'normalMap',
]
const AVATAR_SHADOW_COLOR = 0x000000
const AVATAR_SHADOW_OPACITY = 0.22
const AVATAR_SHADOW_SCALE = [0.42, 0.42, 1]
const AVATAR_SHADOW_POSITION = [0, 0, -0.04]
const AVATAR_SHADOW_ROTATION_X = -Math.PI / 2
const AVATAR_RANGE_COLOR = 0xffffff
const AVATAR_RANGE_OPACITY = 0.8
const AVATAR_RANGE_RADIUS = 2.4
const AVATAR_RANGE_SEGMENTS = 64
const AVATAR_RANGE_POSITION = [0, 0, -0.03]
const AVATAR_RANGE_ROTATION_X = -Math.PI / 2
const CAT_PERSPECTIVE_REFERENCE_METERS = 90
const CAT_PERSPECTIVE_OFFSET_METERS = 55
const CAT_PERSPECTIVE_MIN_SCALE = 0.55
const CAT_PERSPECTIVE_MAX_SCALE = 1.45
const CAT_YAW_FOLLOW_FACTOR = 0.58
const CAT_WORLD_GROUND_SINK = 0.016
const BUSH_WORLD_GROUND_SINK = 0.008

const FACE_MATERIAL_NAME = 'face_smiling'
const FACE_TEXTURE_BASE_URL = '/models/textures/miku_face'
const FACE_EXPRESSION_TEXTURE_URLS = {
  angry: `${FACE_TEXTURE_BASE_URL}/face_angry.png`,
  chatgpt_happy: `${FACE_TEXTURE_BASE_URL}/face_chatgpt_happy_1024.png`,
  crying: `${FACE_TEXTURE_BASE_URL}/face_crying.png`,
  matakke: `${FACE_TEXTURE_BASE_URL}/face_matakke2.png`,
  face_smiling_closed: `${FACE_TEXTURE_BASE_URL}/face_smiling_closed.png`,
  surprise: `${FACE_TEXTURE_BASE_URL}/face_surprise.png`,
}
// 애니메이션 클립 이름(소문자) -> 표정 텍스처 키. 매핑에 없으면 neutral(원본 텍스처) 유지.
const ANIMATION_EXPRESSION_MAP = {
  idle: 'chatgpt_happy',
  walk_inplace: 'neutral',
  excited_jump: 'face_smiling_closed',
}

function distanceMeters(from, to) {
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

const CAT_WORLD_HEIGHT_METERS = 20.0
const CAT_WORLD_CLOSE_HEIGHT_METERS = 4.68
const CAT_WORLD_SCALE_ZOOM_START = 14.1
const CAT_WORLD_SCALE_ZOOM_END = 18
const CAT_WORLD_VISIBILITY_DURATION_SECONDS = 0.45

// 미쿠 오버뷰↔로드뷰 전환 시 화면상 크기가 "작아졌다가 갑자기 커지는" 것처럼 보이던 문제 수정.
// 오버뷰 줌(14.1)에서 로드뷰 시작 줌(main.js의 FOLLOW_START_ZOOM=20)까지, 지도 원근은
// 줌마다 2배씩 커지는데(2^zoom) 기존에는 높이(modelHeightMeters)와 오버뷰 배율을 각각
// 줌 14.1~18 구간에서 선형으로 줄이고 있어서, 전환 초반(원근 확대가 아직 작을 때)에는
// 배율이 줄어드는 속도가 원근 확대 속도보다 빨라 순간적으로 작아졌다가, 줌 18을 넘기며
// 원근 확대만 남아 갑자기 커지는 것처럼 보였다.
// 해결: 높이×배율을 "로그 공간에서 선형 보간(기하 보간)"으로 바꾼다. 오버뷰→로드뷰 배율
// 변화율(로그 기준 초당 -0.62/zoom)이 원근 확대율(+1/zoom)보다 항상 완만해서, 화면상 크기가
// 확대 방향이면 항상 커지고 축소 방향이면 항상 작아지는 것이 수학적으로 보장된다.
const AVATAR_TRANSITION_ZOOM_START = CAT_WORLD_SCALE_ZOOM_START // 오버뷰 줌과 동일
const AVATAR_TRANSITION_ZOOM_END = 20 // main.js FOLLOW_START_ZOOM(=FOLLOW_MAX_ZOOM)과 맞출 것
const AVATAR_OVERVIEW_HEIGHT_MULTIPLIER = CAT_WORLD_HEIGHT_METERS * AVATAR_OVERVIEW_SIZE_BOOST
const AVATAR_FOLLOW_HEIGHT_MULTIPLIER = CAT_WORLD_CLOSE_HEIGHT_METERS * AVATAR_FOLLOW_SIZE_BOOST

function createCatWorldLayer({ THREE, cloneModel, template, animations, bushTemplate, bushAnimations, loadModelTemplate }) {
  return {
    id: 'mock-cat-world-layer',
    type: 'custom',
    renderingMode: '3d',
    actors: [],
    instances: new Map(),
    loadingIds: new Set(),
    originCoordinate: null,
    isFollowing: false,
    visibilityProgress: 0,
    visibilityTarget: 0,
    avatarPosition: null,

    setFollowing(isFollowing) {
      this.isFollowing = Boolean(isFollowing)
      this.visibilityTarget = this.isFollowing ? 1 : 0
      if (this.scene) this.scene.visible = true
      this.map?.triggerRepaint?.()
    },

    setAvatarPosition(position) {
      this.avatarPosition = position
    },

    setActors(actors) {
      // 백엔드는 고양이 rotationY를 채우지 않아(건물 rotation_y만 실존) 항상 비어있다 —
      // 방향이 다 똑같아 보이지 않게, 고양이별로 고정된(고양이 id 시드) 랜덤 방향을 준다.
      // 매 폴링마다 같은 값이 나와야 화면에서 방향이 안 튄다.
      this.actors = actors.map((actor) =>
        actor.modelType !== 'bush' && actor.rotationY == null
          ? { ...actor, rotationY: seededYawForId(actor.catId) }
          : actor
      )
      this.originCoordinate = null
      if (this.scene) this.syncActors()
    },

    findSittingClip(animationKey) {
      const preferredName = String(animationKey || 'sit').toLowerCase()
      return animations?.find((clip) => clip.name.toLowerCase() === preferredName) ??
        animations?.find((clip) => /sit|sitting|seated/i.test(clip.name)) ??
        animations?.[0] ??
        null
    },

    // 아바타 히트테스트(getScreenPosition)와 동일한 방식으로, 각 고양이/덤불 인스턴스의
    // 월드 좌표를 화면 픽셀로 투영해 클릭 지점과의 거리로 히트테스트한다.
    getActorScreenPosition(catId) {
      const instance = this.instances.get(String(catId))
      if (!instance?.root || !this.camera || !this.map) return null
      const vector = new THREE.Vector3(0, 0.5, 0)
      vector.applyMatrix4(instance.root.matrixWorld)
      vector.applyMatrix4(this.camera.projectionMatrix)

      const canvas = this.map.getCanvas()
      return {
        x: (vector.x * 0.5 + 0.5) * canvas.clientWidth,
        y: (0.5 - vector.y * 0.5) * canvas.clientHeight,
      }
    },

    hitTestActor(point, radiusPx = 46) {
      let closestId = null
      let closestDistance = Infinity
      for (const id of this.instances.keys()) {
        const screenPoint = this.getActorScreenPosition(id)
        if (!screenPoint) continue
        const distance = Math.hypot(point.x - screenPoint.x, point.y - screenPoint.y)
        if (distance <= radiusPx && distance < closestDistance) {
          closestDistance = distance
          closestId = id
        }
      }
      if (!closestId) return null
      return this.actors.find((actor) => String(actor.catId) === closestId) ?? null
    },

    // 고양이 클릭 랜덤 상호작용: idle 루프를 잠깐 멈추고 클립 하나를 한 번만 재생한 뒤
    // idle로 되돌아온다. 덤불이나 clips/idleAction이 없는 인스턴스는 조용히 무시한다.
    playInteraction(catId, namePattern) {
      const instance = this.instances.get(String(catId))
      if (!instance?.mixer || !instance.clips || !instance.idleAction) return false
      const clip = instance.clips.find((c) => namePattern.test(c.name))
      if (!clip) return false

      if (this.avatarPosition) {
        const actor = this.actors.find((a) => String(a.catId) === String(catId))
        if (actor) {
          const bearing = bearingBetweenRadians([Number(actor.lng), Number(actor.lat)], this.avatarPosition)
          instance.facingOverride = startFacingOverride(yawForBearing(bearing), clip.duration + 0.3)
        }
      }

      const action = instance.mixer.clipAction(clip)
      action.reset()
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
      action.enabled = true
      action.fadeIn(0.15)
      action.play()
      instance.idleAction.fadeOut(0.15)

      const onFinished = (event) => {
        if (event.action !== action) return
        instance.mixer.removeEventListener('finished', onFinished)
        instance.idleAction.reset().fadeIn(0.2).play()
        action.fadeOut(0.2)
      }
      instance.mixer.addEventListener('finished', onFinished)
      return true
    },

    modelHeightMeters() {
      const zoom = this.map?.getZoom?.() ?? CAT_WORLD_SCALE_ZOOM_START
      const t = clamp(
        (zoom - CAT_WORLD_SCALE_ZOOM_START) / (CAT_WORLD_SCALE_ZOOM_END - CAT_WORLD_SCALE_ZOOM_START),
        0,
        1
      )
      return CAT_WORLD_HEIGHT_METERS + (CAT_WORLD_CLOSE_HEIGHT_METERS - CAT_WORLD_HEIGHT_METERS) * t
    },

    onAdd(map, gl) {
      this.map = map
      this.camera = new THREE.Camera()
      this.scene = new THREE.Scene()
      this.scene.visible = this.visibilityProgress > 0 || this.visibilityTarget > 0
      this.clock = new THREE.Clock()
      this.mixers = []

      this.scene.add(new THREE.HemisphereLight(0xffffff, 0x5f746f, 3.4))
      const sunlight = new THREE.DirectionalLight(0xfff1d6, 2.2)
      sunlight.position.set(-2, 3, 5)
      this.scene.add(sunlight)

      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      })
      this.renderer.autoClear = false
      this.renderer.outputColorSpace = THREE.SRGBColorSpace
      this.syncActors()
    },

    updateOrigin() {
      const actor = this.actors[0]
      if (!actor) {
        this.originCoordinate = MercatorCoordinate.fromLngLat([0, 0], 0)
        return
      }
      this.originCoordinate = MercatorCoordinate.fromLngLat(
        [Number(actor.lng), Number(actor.lat)],
        0
      )
    },

    makeTransform(actor) {
      if (!this.originCoordinate) this.updateOrigin()
      // 고양이 마커(DOM, 항상 지면 lng/lat)는 높이를 모른다. 여기서 actor.heightOffsetMeters로
      // 3D 모델을 실제로 띄우면(예: 옥상 고양이 12m) 카메라 원근 때문에 화면상 위치가 마커와
      // 어긋나 보인다 — 마커 쪽 위치가 기준이므로, 3D 모델도 항상 지면 높이(0)에 투영한다.
      const coordinate = MercatorCoordinate.fromLngLat([Number(actor.lng), Number(actor.lat)], 0)
      const visibilityScale = this.visibilityProgress * this.visibilityProgress * (3 - 2 * this.visibilityProgress)
      const scale =
        coordinate.meterInMercatorCoordinateUnits() *
        this.modelHeightMeters() *
        Number(actor.modelScale ?? 1) *
        visibilityScale
      const instance = this.instances.get(String(actor.catId))
      const yaw = resolveYaw(Number(actor.rotationY ?? 0), instance?.facingOverride)
      const matrix = new THREE.Matrix4()
        .makeTranslation(
          coordinate.x - this.originCoordinate.x,
          coordinate.y - this.originCoordinate.y,
          coordinate.z - this.originCoordinate.z
        )
        .scale(new THREE.Vector3(scale, -scale, scale))
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
        .multiply(new THREE.Matrix4().makeRotationY(yaw))
      return matrix
    },

    async syncActors() {
      const activeIds = new Set()

      for (const actor of this.actors) {
        if (!actor.modelUrl) continue
        const id = String(actor.catId)
        activeIds.add(id)
        
        let instance = this.instances.get(id)
        if (this.loadingIds.has(id)) {
          continue
        }
        
        const actorSignature = [
          actor.modelType,
          actor.modelUrl,
          actor.modelKey,
          actor.animationKey,
        ].join('|')

        if (instance && instance.actorSignature !== actorSignature) {
          this.scene.remove(instance.root)
          if (instance.mixer) this.mixers = this.mixers.filter((mixer) => mixer !== instance.mixer)
          this.instances.delete(id)
          instance = null
        }

        if (!instance) {
          const isBush = actor.modelType === 'bush'
          this.loadingIds.add(id)
          try {
            const modelTemplate = isBush && bushTemplate
              ? { template: bushTemplate, animations: bushAnimations }
              : await loadModelTemplate(actor.modelUrl)

            if (!activeIds.has(id)) {
              this.loadingIds.delete(id)
              continue
            }

            const model = cloneModel(modelTemplate.template)
            model.position.y = -(isBush ? BUSH_WORLD_GROUND_SINK : CAT_WORLD_GROUND_SINK)
            const root = new THREE.Group()
            root.matrixAutoUpdate = false
            root.add(model)
            this.scene.add(root)

            let mixer = null
            let idleAction = null
            let clips = null
            if (isBush) {
              if (bushAnimations?.length) {
                mixer = new THREE.AnimationMixer(model)
                const spawnClip = bushAnimations.find((c) => /spawn|appear/i.test(c.name))
                const idleClip = bushAnimations.find((c) => /idle|shake/i.test(c.name)) ?? bushAnimations[0]
                
                if (spawnClip) {
                  const spawnAction = mixer.clipAction(spawnClip)
                  spawnAction.setLoop(THREE.LoopOnce, 1)
                  spawnAction.clampWhenFinished = true
                  spawnAction.play()
                  
                  if (idleClip) {
                    const idleAction = mixer.clipAction(idleClip)
                    const onFinished = (event) => {
                      if (event.action === spawnAction) {
                        mixer.removeEventListener('finished', onFinished)
                        idleAction.play()
                      }
                    }
                    mixer.addEventListener('finished', onFinished)
                  }
                } else if (idleClip) {
                  mixer.clipAction(idleClip).play()
                } else {
                  for (const clip of bushAnimations) {
                    mixer.clipAction(clip).play()
                  }
                }
                this.mixers.push(mixer)
              }
            } else {
              clips = modelTemplate.animations || animations
              const clip = clips?.find((c) => c.name.toLowerCase() === String(actor.animationKey || 'sit').toLowerCase()) ??
                clips?.find((c) => /sit|sitting|seated/i.test(c.name)) ??
                clips?.[0]
              if (clip) {
                mixer = new THREE.AnimationMixer(model)
                idleAction = mixer.clipAction(clip)
                idleAction.play()
                this.mixers.push(mixer)
              }
            }

            instance = { root, mixer, actorSignature, idleAction, clips }
            this.instances.set(id, instance)
          } catch (error) {
            console.warn('cat/bush GLB failed to load in custom layer:', actor.modelUrl, error)
          } finally {
            this.loadingIds.delete(id)
          }
        }

        if (instance) {
          instance.root.matrix.copy(this.makeTransform(actor))
          instance.root.matrixWorldNeedsUpdate = true
        }
      }

      for (const [id, instance] of this.instances) {
        if (activeIds.has(id)) continue
        this.scene.remove(instance.root)
        if (instance.mixer) this.mixers = this.mixers.filter((mixer) => mixer !== instance.mixer)
        this.instances.delete(id)
      }
    },

    render(_gl, args) {
      if (!this.renderer || !this.scene || !this.camera) return
      const delta = Math.min(this.clock.getDelta(), 0.05)
      const visibilityStep = delta / CAT_WORLD_VISIBILITY_DURATION_SECONDS
      this.visibilityProgress =
        this.visibilityTarget > this.visibilityProgress
          ? Math.min(this.visibilityTarget, this.visibilityProgress + visibilityStep)
          : Math.max(this.visibilityTarget, this.visibilityProgress - visibilityStep)
      const shouldRender = this.visibilityProgress > 0 || this.visibilityTarget > 0
      this.scene.visible = shouldRender
      if (!shouldRender) return
      if (!this.originCoordinate) this.updateOrigin()
      this.syncActors()
      const mapMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix)
      const originMatrix = new THREE.Matrix4().makeTranslation(
        this.originCoordinate.x,
        this.originCoordinate.y,
        this.originCoordinate.z
      )
      this.camera.projectionMatrix = mapMatrix.multiply(originMatrix)

      for (const mixer of this.mixers) mixer.update(delta)

      this.renderer.resetState()
      this.renderer.render(this.scene, this.camera)
      this.map.triggerRepaint()
    },
  }
}

// 로드뷰(팔로우)에서만 캣타워를 2배 더 크게 보여준다. 항공뷰 구도엔 영향 없다.
const BUILDING_FOLLOW_SIZE_BOOST = 2

function createBuildingWorldLayer({ THREE, cloneModel, loadModelTemplate }) {
  return {
    id: 'mock-building-world-layer',
    type: 'custom',
    renderingMode: '3d',
    actors: [],
    instances: new Map(),
    loadingIds: new Set(),
    originCoordinate: null,
    isFollowing: false,

    setActors(actors) {
      this.actors = actors
      this.originCoordinate = null
      if (this.scene) this.syncActors()
    },

    setFollowing(isFollowing) {
      this.isFollowing = Boolean(isFollowing)
      this.map?.triggerRepaint?.()
    },

    onAdd(map, gl) {
      this.map = map
      this.camera = new THREE.Camera()
      this.scene = new THREE.Scene()
      this.clock = new THREE.Clock()

      this.scene.add(new THREE.HemisphereLight(0xffffff, 0x5f746f, 3.4))
      const sunlight = new THREE.DirectionalLight(0xfff1d6, 2.2)
      sunlight.position.set(-2, 3, 5)
      this.scene.add(sunlight)

      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      })
      this.renderer.autoClear = false
      this.renderer.outputColorSpace = THREE.SRGBColorSpace
      this.syncActors()
    },

    updateOrigin() {
      const actor = this.actors[0]
      if (!actor) {
        this.originCoordinate = MercatorCoordinate.fromLngLat([0, 0], 0)
        return
      }
      this.originCoordinate = MercatorCoordinate.fromLngLat(
        [Number(actor.lng), Number(actor.lat)],
        0
      )
    },

    modelHeightMeters() {
      const zoom = this.map?.getZoom?.() ?? 16
      const t = clamp((zoom - 16) / (20 - 16), 0, 1)
      return 40.0 + (9.0 - 40.0) * t
    },

    makeTransform(actor) {
      if (!this.originCoordinate) this.updateOrigin()
      const coordinate = MercatorCoordinate.fromLngLat(
        [Number(actor.lng), Number(actor.lat)],
        Number(actor.heightOffsetMeters ?? 0)
      )
      const scale =
        coordinate.meterInMercatorCoordinateUnits() *
        this.modelHeightMeters() *
        Number(actor.modelScale ?? 1) *
        (this.isFollowing ? BUILDING_FOLLOW_SIZE_BOOST : 1)
      const matrix = new THREE.Matrix4()
        .makeTranslation(
          coordinate.x - this.originCoordinate.x,
          coordinate.y - this.originCoordinate.y,
          coordinate.z - this.originCoordinate.z
        )
        .scale(new THREE.Vector3(scale, -scale, scale))
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
        .multiply(new THREE.Matrix4().makeRotationY(Number(actor.rotationY ?? 0)))
      return matrix
    },

    async syncActors() {
      const activeIds = new Set()

      for (const actor of this.actors) {
        if (!actor.modelUrl) continue
        const id = String(actor.id)
        activeIds.add(id)

        let instance = this.instances.get(id)
        if (this.loadingIds.has(id)) {
          continue
        }

        const actorSignature = [
          actor.modelUrl,
          actor.rotationY,
          actor.modelScale,
        ].join('|')

        if (instance && instance.actorSignature !== actorSignature) {
          this.scene.remove(instance.root)
          this.instances.delete(id)
          instance = null
        }

        if (!instance) {
          this.loadingIds.add(id)
          try {
            const modelTemplate = await loadModelTemplate(actor.modelUrl)
            
            if (!activeIds.has(id)) {
              this.loadingIds.delete(id)
              continue
            }

            const model = cloneModel(modelTemplate.template)
            model.position.y = 0
            const root = new THREE.Group()
            root.matrixAutoUpdate = false
            root.add(model)
            this.scene.add(root)

            instance = { root, actorSignature }
            this.instances.set(id, instance)
          } catch (error) {
            console.warn('building GLB failed to load in custom layer:', actor.modelUrl, error)
          } finally {
            this.loadingIds.delete(id)
          }
        }

        if (instance) {
          instance.root.matrix.copy(this.makeTransform(actor))
          instance.root.matrixWorldNeedsUpdate = true
        }
      }

      for (const [id, instance] of this.instances) {
        if (activeIds.has(id)) continue
        this.scene.remove(instance.root)
        this.instances.delete(id)
      }
    },

    render(_gl, args) {
      if (!this.renderer || !this.scene || !this.camera) return
      if (!this.actors.length) return
      const delta = Math.min(this.clock.getDelta(), 0.05)
      if (!this.originCoordinate) this.updateOrigin()
      this.syncActors()
      const mapMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix)
      const originMatrix = new THREE.Matrix4().makeTranslation(
        this.originCoordinate.x,
        this.originCoordinate.y,
        this.originCoordinate.z
      )
      this.camera.projectionMatrix = mapMatrix.multiply(originMatrix)

      this.renderer.resetState()
      this.renderer.render(this.scene, this.camera)
      this.map.triggerRepaint()
    },
  }
}

function createAvatarWorldLayer({ THREE, cloneModel, template, animations }) {
  return {
    id: 'mock-avatar-world-layer',
    type: 'custom',
    renderingMode: '3d',
    position: null,
    heading: Math.PI,
    visibilityProgress: 0,
    // 미쿠는 팔로우/오버뷰 전환과 무관하게 항상 보인다 (크기만 줌에 따라 자연스럽게 변한다).
    // 로드뷰로 들어갈 때 사라졌다 나타나는 대신, flyTo 애니메이션 동안 매 프레임 줌값을 따라
    // 자연스럽게 확대되는 느낌을 준다.
    visibilityTarget: 1,
    isFollowing: false,
    // null이면 기존 동작(makeTransform이 mapBearing으로 yaw를 잡는다). 값이 있으면
    // 지도 방위와 무관하게 그 나침반 방위각(북=0, 시계방향)을 바라본다. 3D 카메라의
    // 1인칭/셀카 모드에서 미쿠가 카메라를 등지거나 마주보게 하려고 쓴다.
    facingBearingDeg: null,

    setFacingBearing(bearingDeg) {
      this.facingBearingDeg = bearingDeg == null ? null : Number(bearingDeg)
      this.map?.triggerRepaint?.()
    },

    // 미쿠의 머티리얼은 전부 DoubleSide(컬링 없음)라, 1인칭 카메라가 머리 안에 들어가면
    // 머리·머리카락의 안쪽 면이 화면을 가득 채운다. 안쪽 면을 컬링하면 머리가 사라지고
    // 아래를 볼 때 몸통과 다리만 보인다 — FPS가 자기 캐릭터를 그리는 방식 그대로다.
    //
    // 컬링 방향이 BackSide인 게 핵심이다: makeTransform의 scale(s, -s, s)는 행렬식이 음수라
    // 삼각형 와인딩이 통째로 뒤집힌다. 그래서 "바깥 면"이 three.js 입장에선 back face다.
    // (셀카/일반 시점처럼 바깥에서 볼 땐 원래의 DoubleSide로 돌려놔야 치마·머리카락이 안 뚫린다.)
    setBackfaceCulling(enabled) {
      if (!this.model) return
      this.model.traverse((object) => {
        if (!object.isMesh) return
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        for (const material of materials) {
          if (!material) continue
          if (material.userData.originalSide === undefined) {
            material.userData.originalSide = material.side
          }
          const nextSide = enabled ? THREE.BackSide : material.userData.originalSide
          if (material.side !== nextSide) {
            material.side = nextSide
            material.needsUpdate = true
          }
        }
      })
      this.map?.triggerRepaint?.()
    },

    // 1인칭 카메라(눈높이)에서 머리·목·어깨는 렌즈 바로 앞이라, 아래를 내려다보면 어깨가
    // 화면 절반을 덮고 정작 다리가 안 보인다. 카메라를 앞으로 빼거나 위로 올려도 어깨보다
    // 다리가 먼저 프레임 밖으로 밀려난다(스크린 좌표로 확인). FPS 엔진이 쓰는 방식대로
    // 눈 아래를 자르는 클리핑 평면을 두면 어깨 위쪽 지오메트리가 통째로 사라진다.
    // heightM은 지면 기준 높이(m), null이면 클리핑 해제.
    setClipHeight(heightM) {
      if (!this.model) return
      this.clipHeightM = heightM == null ? null : Number(heightM)

      if (this.clipHeightM != null && !this.clipPlane) {
        // z <= zMax 인 점만 남긴다: normal·p + constant >= 0  →  -z + zMax >= 0
        this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)
      }
      if (this.renderer) this.renderer.localClippingEnabled = this.clipHeightM != null

      const planes = this.clipHeightM == null ? null : [this.clipPlane]
      this.model.traverse((object) => {
        if (!object.isMesh) return
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        for (const material of materials) {
          if (!material) continue
          material.clippingPlanes = planes
          material.needsUpdate = true
        }
      })
      this.map?.triggerRepaint?.()
    },

    // 씬 좌표(원점 기준 mercator 오프셋)에서 +z가 고도다. 위도에 따라 1m의 mercator 길이가
    // 달라지므로 매 프레임 평면 상수를 다시 잡는다.
    updateClipPlane() {
      if (this.clipHeightM == null || !this.clipPlane || !this.position) return
      const coordinate = MercatorCoordinate.fromLngLat(this.position, 0)
      this.clipPlane.constant = this.clipHeightM * coordinate.meterInMercatorCoordinateUnits()
    },

    setFollowing(isFollowing) {
      this.isFollowing = Boolean(isFollowing)
      if (this.scene) this.scene.visible = true
      this.map?.triggerRepaint?.()
    },

    // 카메라가 flyTo로 이동하는 동안에는 idle(숨쉬기) 애니메이션을 멈춰서,
    // 확대/축소 중 모델이 커지는 동시에 까딱거려 "바운스"처럼 보이는 걸 막는다.
    setTransitioning(isTransitioning) {
      this.frozen = Boolean(isTransitioning)
    },

    setPosition(position) {
      this.position = position
      if (this.scene) {
        this.originCoordinate = MercatorCoordinate.fromLngLat(this.position, 0)
      }
      this.map?.triggerRepaint?.()
    },

    setHeading(heading) {
      this.heading = heading
      this.map?.triggerRepaint?.()
    },

    findFaceMeshes() {
      const faceMeshes = []
      this.model?.traverse((object) => {
        if (!object.isMesh) return
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        if (materials.some((material) => material?.name === FACE_MATERIAL_NAME)) {
          faceMeshes.push(object)
        }
      })
      return faceMeshes
    },

    loadExpressionTexture(key) {
      if (!this.expressionTextureCache) this.expressionTextureCache = new Map()
      if (this.expressionTextureCache.has(key)) return this.expressionTextureCache.get(key)

      const url = FACE_EXPRESSION_TEXTURE_URLS[key]
      if (!url) return null

      const texture = new THREE.TextureLoader().load(url, () => {
        texture.colorSpace = THREE.SRGBColorSpace
        texture.anisotropy = this.maxTextureAnisotropy || 1
        texture.flipY = false
        texture.needsUpdate = true
        this.map?.triggerRepaint?.()
      })
      this.expressionTextureCache.set(key, texture)
      return texture
    },

    applyExpression(expressionKey) {
      if (!this.faceMeshes?.length) return

      const texture =
        expressionKey === 'neutral' || !expressionKey
          ? this.neutralFaceTexture
          : this.loadExpressionTexture(expressionKey)
      if (!texture) return

      for (const mesh of this.faceMeshes) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const material of materials) {
          if (material?.name !== FACE_MATERIAL_NAME) continue
          material.map = texture
          material.needsUpdate = true
        }
      }
      this.map?.triggerRepaint?.()
    },

    playAnimation(name) {
      if (!this.mixer || !animations?.length) return false
      const clip = animations.find((c) => c.name.toLowerCase() === name.toLowerCase()) ??
        animations.find((c) => c.name.toLowerCase().includes(name.toLowerCase()))
      if (!clip) return false

      const action = this.mixer.clipAction(clip)
      const prevAction = this.activeAction

      if (prevAction && prevAction !== action) {
        prevAction.fadeOut(0.2)
      }

      action.reset().fadeIn(0.2).play()
      this.activeAction = action
      this.applyExpression(ANIMATION_EXPRESSION_MAP[clip.name.toLowerCase()])

      const returnToIdle = () => {
        this.mixer.removeEventListener('finished', returnToIdle)
        const idleClip = animations.find((c) => /idle/i.test(c.name)) ?? animations[0]
        if (idleClip) {
          const idleAction = this.mixer.clipAction(idleClip)
          idleAction.reset().fadeIn(0.25).play()
          action.fadeOut(0.25)
          this.activeAction = idleAction
          this.applyExpression(ANIMATION_EXPRESSION_MAP[idleClip.name.toLowerCase()] ?? 'neutral')
        }
      }

      action.loop = THREE.LoopOnce
      action.clampWhenFinished = true
      this.mixer.addEventListener('finished', returnToIdle)
      this.map.triggerRepaint()
      return true
    },

    getScreenPosition() {
      if (!this.root || !this.camera || !this.map) return null
      const vector = new THREE.Vector3(0, 0.5, 0)
      vector.applyMatrix4(this.root.matrixWorld)
      vector.applyMatrix4(this.camera.projectionMatrix)
      
      const canvas = this.map.getCanvas()
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      
      return {
        x: (vector.x * 0.5 + 0.5) * width,
        y: (0.5 - vector.y * 0.5) * height,
      }
    },

    onAdd(map, gl) {
      this.map = map
      this.camera = new THREE.Camera()
      this.scene = new THREE.Scene()
      this.scene.visible = this.visibilityProgress > 0 || this.visibilityTarget > 0
      this.clock = new THREE.Clock()
      this.mixers = []

      this.scene.add(new THREE.HemisphereLight(0xffffff, 0x5f746f, 3.4))
      const sunlight = new THREE.DirectionalLight(0xfff1d6, 2.2)
      sunlight.position.set(-2, 3, 5)
      this.scene.add(sunlight)

      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      })
      this.renderer.autoClear = false
      this.renderer.outputColorSpace = THREE.SRGBColorSpace

      this.model = cloneModel(template)
      this.faceMeshes = this.findFaceMeshes()
      const firstFaceMaterials = Array.isArray(this.faceMeshes[0]?.material)
        ? this.faceMeshes[0].material
        : [this.faceMeshes[0]?.material]
      this.neutralFaceTexture =
        firstFaceMaterials.find((material) => material?.name === FACE_MATERIAL_NAME)?.map ?? null

      this.root = new THREE.Group()
      this.root.matrixAutoUpdate = false
      this.root.add(this.model)
      this.scene.add(this.root)

      if (animations?.length) {
        this.mixer = new THREE.AnimationMixer(this.model)
        const idleClip = animations.find((c) => /idle/i.test(c.name)) ?? animations[0]
        if (idleClip) {
          this.activeAction = this.mixer.clipAction(idleClip)
          this.activeAction.play()
          this.applyExpression(ANIMATION_EXPRESSION_MAP[idleClip.name.toLowerCase()] ?? 'neutral')
        }
        this.mixers.push(this.mixer)
      }

      if (this.position) {
        this.originCoordinate = MercatorCoordinate.fromLngLat(this.position, 0)
      }
    },

    makeTransform() {
      if (!this.position || !this.originCoordinate) return new THREE.Matrix4()
      const coordinate = MercatorCoordinate.fromLngLat(this.position, 0)
      const visibilityScale = this.visibilityProgress * this.visibilityProgress * (3 - 2 * this.visibilityProgress)
      const zoom = this.map?.getZoom?.() ?? AVATAR_TRANSITION_ZOOM_START
      const transitionT = clamp(
        (zoom - AVATAR_TRANSITION_ZOOM_START) / (AVATAR_TRANSITION_ZOOM_END - AVATAR_TRANSITION_ZOOM_START),
        0,
        1
      )
      const heightMultiplier =
        AVATAR_OVERVIEW_HEIGHT_MULTIPLIER *
        (AVATAR_FOLLOW_HEIGHT_MULTIPLIER / AVATAR_OVERVIEW_HEIGHT_MULTIPLIER) ** transitionT
      const scale =
        coordinate.meterInMercatorCoordinateUnits() *
        heightMultiplier *
        AVATAR_SIZE_MULTIPLIER *
        visibilityScale
      const mapBearing = (this.map.getBearing() * Math.PI) / 180

      // scale의 y축 반전(-scale) + rotationX(90°) 탓에 yaw θ와 나침반 방위각 β는
      // θ = −β 로 대응한다(브라우저에서 실측 확인).
      const yaw =
        this.facingBearingDeg == null
          ? Math.PI + mapBearing
          : -(this.facingBearingDeg * Math.PI) / 180

      const matrix = new THREE.Matrix4()
        .makeTranslation(
          coordinate.x - this.originCoordinate.x,
          coordinate.y - this.originCoordinate.y,
          coordinate.z - this.originCoordinate.z
        )
        .scale(new THREE.Vector3(scale, -scale, scale))
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
        .multiply(new THREE.Matrix4().makeRotationY(yaw))
      return matrix
    },

    render(_gl, args) {
      if (!this.renderer || !this.scene || !this.camera || !this.position || !this.originCoordinate) return
      const delta = Math.min(this.clock.getDelta(), 0.05)
      const visibilityStep = delta / 0.45
      this.visibilityProgress =
        this.visibilityTarget > this.visibilityProgress
          ? Math.min(this.visibilityTarget, this.visibilityProgress + visibilityStep)
          : Math.max(this.visibilityTarget, this.visibilityProgress - visibilityStep)
      const shouldRender = this.visibilityProgress > 0 || this.visibilityTarget > 0
      this.scene.visible = shouldRender
      if (!shouldRender) return

      this.updateClipPlane()
      this.root.matrix.copy(this.makeTransform())
      this.root.matrixWorldNeedsUpdate = true

      const mapMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix)
      const originMatrix = new THREE.Matrix4().makeTranslation(
        this.originCoordinate.x,
        this.originCoordinate.y,
        this.originCoordinate.z
      )
      this.camera.projectionMatrix = mapMatrix.multiply(originMatrix)

      if (!this.frozen) {
        for (const mixer of this.mixers) mixer.update(delta)
      }

      this.renderer.resetState()
      this.renderer.render(this.scene, this.camera)
      this.map.triggerRepaint()
    },
  }
}

export function createAnimatedModelLayer(map) {
  const controller = {
    map,
    avatarPosition: null,
    avatarWorldLayer: null,
    catWorldLayer: null,
    buildingWorldLayer: null,
    modelTemplates: new Map(),
    pendingCatActors: [],
    pendingBuildingActors: [],
    ready: false,
    isFollowing: false,

    setAvatarPosition(position) {
      this.avatarPosition = [...position]
      this.ensureAvatarWorldLayer()
      if (this.avatarWorldLayer) this.avatarWorldLayer.setPosition(position)
      if (this.catWorldLayer) this.catWorldLayer.setAvatarPosition(this.avatarPosition)
    },

    setFollowing(isFollowing) {
      this.isFollowing = Boolean(isFollowing)
      if (this.catWorldLayer) this.catWorldLayer.setFollowing(this.isFollowing)
      if (this.avatarWorldLayer) this.avatarWorldLayer.setFollowing(this.isFollowing)
      if (this.buildingWorldLayer) this.buildingWorldLayer.setFollowing(this.isFollowing)
    },

    setAvatarTransitioning(isTransitioning) {
      this.avatarWorldLayer?.setTransitioning(isTransitioning)
    },

    // 나침반 방위각(북=0, 시계방향)을 바라보게 한다. null이면 지도 방위를 따라가는 기본 동작.
    setAvatarFacing(bearingDeg) {
      this.avatarFacingBearingDeg = bearingDeg == null ? null : Number(bearingDeg)
      this.avatarWorldLayer?.setFacingBearing(this.avatarFacingBearingDeg)
    },

    // 1인칭 카메라가 미쿠의 머리 안에 있을 때만 켠다.
    setAvatarBackfaceCulling(enabled) {
      this.avatarBackfaceCulling = Boolean(enabled)
      this.avatarWorldLayer?.setBackfaceCulling(this.avatarBackfaceCulling)
    },

    // 1인칭에서 눈 아래(어깨 위)를 잘라내는 높이(m). null이면 해제.
    setAvatarClipHeight(heightM) {
      this.avatarClipHeightM = heightM == null ? null : Number(heightM)
      this.avatarWorldLayer?.setClipHeight(this.avatarClipHeightM)
    },

    setAvatarVisible(visible) {
      if (this.avatarWorldLayer) {
        this.avatarWorldLayer.visibilityTarget = visible ? 1 : 0
        if (!visible) {
          this.avatarWorldLayer.visibilityProgress = 0
          if (this.avatarWorldLayer.scene) this.avatarWorldLayer.scene.visible = false
        }
      }
    },

    isAvatarHit(point, radiusPx = 78) {
      if (this.avatarWorldLayer) {
        const screenPoint = this.avatarWorldLayer.getScreenPosition()
        if (screenPoint) {
          const distance = Math.hypot(point.x - screenPoint.x, point.y - screenPoint.y)
          return distance <= radiusPx
        }
      }
      return false
    },

    playAvatarAnimation(name = 'excited_jump') {
      if (this.avatarWorldLayer) {
        return this.avatarWorldLayer.playAnimation(name)
      }
      return false
    },

    // 클릭 지점과 가장 가까운 고양이/덤불 액터를 찾는다. 고양이(discovered)와
    // 덤불(undiscovered)을 구분하는 건 호출하는 쪽(actor.modelType)의 몫이다.
    hitTestCatActor(point, radiusPx = 46) {
      return this.catWorldLayer?.hitTestActor(point, radiusPx) ?? null
    },

    // 도감에 이미 등록된 고양이를 눌렀을 때 랜덤 상호작용(일어나기/둘러보기/야옹) 재생.
    playCatInteraction(catId) {
      if (!this.catWorldLayer) return false
      const patterns = [/stand_up/i, /look_around/i, /meow/i]
      const pattern = patterns[Math.floor(Math.random() * patterns.length)]
      return this.catWorldLayer.playInteraction(catId, pattern)
    },

    cloneModel(template) {
      return this.cloneModelFn ? this.cloneModelFn(template) : template.clone()
    },

    async init() {
      try {
        const [THREE, loaderModule, skeletonModule] = await Promise.all([
          import(/* @vite-ignore */ THREE_CDN),
          import(/* @vite-ignore */ GLTF_LOADER_CDN),
          import(/* @vite-ignore */ SKELETON_UTILS_CDN),
        ])

        this.THREE = THREE
        this.cloneModelFn = skeletonModule.clone
        this.loader = new loaderModule.GLTFLoader()

        const [avatarGltf, catGltf, bushGltf] = await Promise.all([
          this.loader.loadAsync(AVATAR_MODEL_URL),
          this.loader.loadAsync(CAT_MODEL_URL),
          this.loader.loadAsync(BUSH_MODEL_URL),
        ])

        this.enhanceModelQuality(avatarGltf.scene)
        this.enhanceModelQuality(catGltf.scene)
        this.enhanceModelQuality(bushGltf.scene)

        this.avatarTemplate = this.normalizeModel(avatarGltf.scene)
        this.avatarAnimations = avatarGltf.animations
        this.catTemplate = this.normalizeModel(catGltf.scene)
        this.catAnimations = catGltf.animations
        this.bushTemplate = this.normalizeModel(bushGltf.scene)
        this.bushAnimations = bushGltf.animations
        this.ready = true
        document.documentElement.classList.add('models-ready')

        this.ensureAvatarWorldLayer()
        this.ensureCatWorldLayer()
        this.ensureBuildingWorldLayer()
      } catch (error) {
        console.warn('3D 캐릭터 모델을 불러오지 못했습니다.', error)
      }
    },

    ensureAvatarWorldLayer() {
      if (this.avatarWorldLayer || !this.ready || !this.avatarTemplate) return
      this.avatarWorldLayer = createAvatarWorldLayer({
        THREE: this.THREE,
        cloneModel: this.cloneModel.bind(this),
        template: this.avatarTemplate,
        animations: this.avatarAnimations,
      })

      const addLayer = () => {
        if (this.map.getLayer(this.avatarWorldLayer.id)) return
        this.map.addLayer(this.avatarWorldLayer)
        this.avatarWorldLayer.setFollowing(this.isFollowing)
        this.avatarWorldLayer.setFacingBearing(this.avatarFacingBearingDeg ?? null)
        this.avatarWorldLayer.setBackfaceCulling(Boolean(this.avatarBackfaceCulling))
        this.avatarWorldLayer.setClipHeight(this.avatarClipHeightM ?? null)
        if (this.avatarPosition) this.avatarWorldLayer.setPosition(this.avatarPosition)
      }

      if (this.map.loaded()) addLayer()
      else this.map.once('idle', addLayer)
    },

    ensureCatWorldLayer() {
      if (this.catWorldLayer || !this.ready || !this.catTemplate) return
      this.catWorldLayer = createCatWorldLayer({
        THREE: this.THREE,
        cloneModel: this.cloneModel.bind(this),
        template: this.catTemplate,
        animations: this.catAnimations,
        bushTemplate: this.bushTemplate,
        bushAnimations: this.bushAnimations,
        loadModelTemplate: this.loadModelTemplate.bind(this),
      })
      if (this.avatarPosition) this.catWorldLayer.setAvatarPosition(this.avatarPosition)

      const addLayer = () => {
        if (this.map.getLayer(this.catWorldLayer.id)) return
        this.map.addLayer(this.catWorldLayer)
        this.catWorldLayer.setFollowing(this.isFollowing)
        this.catWorldLayer.setActors(this.pendingCatActors)
      }

      if (this.map.loaded()) addLayer()
      else this.map.once('idle', addLayer)
    },

    ensureBuildingWorldLayer() {
      if (this.buildingWorldLayer || !this.ready) return
      this.buildingWorldLayer = createBuildingWorldLayer({
        THREE: this.THREE,
        cloneModel: this.cloneModel.bind(this),
        loadModelTemplate: this.loadModelTemplate.bind(this),
      })

      const addLayer = () => {
        if (this.map.getLayer(this.buildingWorldLayer.id)) return
        if (this.map.getLayer('mock-cat-world-layer')) {
          this.map.addLayer(this.buildingWorldLayer, 'mock-cat-world-layer')
        } else {
          this.map.addLayer(this.buildingWorldLayer)
        }
        this.buildingWorldLayer.setFollowing(this.isFollowing)
        this.buildingWorldLayer.setActors(this.pendingBuildingActors)
      }

      if (this.map.loaded()) addLayer()
      else this.map.once('idle', addLayer)
    },

    addCat() {
      // 3D 고양이 모델은 쓰지 않는다. 사진 위치는 DOM 사진 아이콘 마커로만 표시.
    },

    setCatActors(actors) {
      this.pendingCatActors = actors
      if (!this.ready || !this.catTemplate) return
      this.ensureCatWorldLayer()
      this.catWorldLayer?.setActors(actors)
    },

    setBuildingActors(actors) {
      this.pendingBuildingActors = actors
      this.ensureBuildingWorldLayer()
      this.buildingWorldLayer?.setActors(actors)
    },

    enhanceModelQuality(source) {
      const { THREE } = this
      source.traverse((object) => {
        if (!object.isMesh) return

        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material]

        for (const material of materials) {
          if (!material) continue

          for (const key of TEXTURE_MAP_KEYS) {
            const texture = material[key]
            if (!texture) continue

            texture.anisotropy = this.maxTextureAnisotropy || 1
            texture.magFilter = THREE.LinearFilter
            texture.minFilter = THREE.LinearMipmapLinearFilter
            texture.generateMipmaps = true
            texture.needsUpdate = true
          }

          material.needsUpdate = true
        }
      })
    },

    normalizeModel(source) {
      const { THREE } = this
      const box = new THREE.Box3().setFromObject(source)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      const holder = new THREE.Group()

      source.position.set(-center.x, -box.min.y, -center.z)
      holder.scale.setScalar(1 / Math.max(size.y, 0.0001))
      holder.add(source)
      holder.traverse((object) => {
        object.frustumCulled = false
      })
      return holder
    },

    async loadModelTemplate(url) {
      if (this.modelTemplates.has(url)) return this.modelTemplates.get(url)
      if (this.loadingTemplates?.has(url)) return this.loadingTemplates.get(url)

      if (!this.loadingTemplates) {
        this.loadingTemplates = new Map()
      }

      const loadPromise = (async () => {
        const gltf = await this.loader.loadAsync(url)
        this.enhanceModelQuality(gltf.scene)
        const model = {
          template: this.normalizeModel(gltf.scene),
          animations: gltf.animations,
        }
        this.modelTemplates.set(url, model)
        this.loadingTemplates.delete(url)
        return model
      })()

      this.loadingTemplates.set(url, loadPromise)
      return loadPromise
    },
  }

  controller.init()
  return controller
}
