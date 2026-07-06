import { MercatorCoordinate } from 'maplibre-gl'

const THREE_VERSION = '0.180.0'
const THREE_CDN = `https://esm.sh/three@${THREE_VERSION}`
const GLTF_LOADER_CDN = `${THREE_CDN}/examples/jsm/loaders/GLTFLoader.js`
const SKELETON_UTILS_CDN = `${THREE_CDN}/examples/jsm/utils/SkeletonUtils.js`

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value))

// 미쿠가 항상 바라보는 지도 기준 방향(북쪽).
// 시점 전환 시 미쿠가 돌아보는 게 아니라, 원래 그쪽을 보고 있던 것처럼 보인다.
const AVATAR_WORLD_HEADING = Math.PI

// 줌에 따른 모델 크기: 카메라가 다가갈수록(줌인) 지도와 함께 커진다.
// 지수 1이면 지도와 완전히 같은 비율, 낮출수록 완만해진다.
// (지수를 1에 가깝게 올리면 꽃과 원근은 더 잘 맞지만, 팔로우 모드 줌 범위(16~20)에서
// MODEL_MAX_ZOOM_SCALE 상한에 zoom 17 부근부터 걸려버려 모델이 계속 최대 확대 상태로
// 고정되고, 그만큼 늘어난 텍스처/폴리곤이 뭉개져 보인다. 0.41은 이 상한에 걸리지 않는
// 한도 내에서 고른 값이라 원복함 — 화질과 완전한 원근 일치는 이 구조에서 서로 트레이드오프.)
const MODEL_BASE_ZOOM = 14.1 // 이 줌(전체 시점)에서 모델이 기준 크기(basePixelHeight)
const MODEL_ZOOM_EXPONENT = 0.41
const MODEL_MIN_ZOOM_SCALE = 0.35
const MODEL_MAX_ZOOM_SCALE = 7
const AVATAR_MODEL_URL = '/models/miku_final_web_avatar_muted_unlit.glb'
const CAT_MODEL_URL = '/models/cat.glb'
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
const CAT_PERSPECTIVE_REFERENCE_METERS = 90
const CAT_PERSPECTIVE_OFFSET_METERS = 55
const CAT_PERSPECTIVE_MIN_SCALE = 0.55
const CAT_PERSPECTIVE_MAX_SCALE = 1.45
const CAT_YAW_FOLLOW_FACTOR = 0.58

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

const CAT_WORLD_HEIGHT_METERS = 5.5

function createCatWorldLayer({ THREE, cloneModel, template, animations }) {
  return {
    id: 'mock-cat-world-layer',
    type: 'custom',
    renderingMode: '3d',
    actors: [],
    instances: new Map(),
    originCoordinate: null,

    setActors(actors) {
      this.actors = actors
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

    onAdd(map, gl) {
      this.map = map
      this.camera = new THREE.Camera()
      this.scene = new THREE.Scene()
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
      const coordinate = MercatorCoordinate.fromLngLat(
        [Number(actor.lng), Number(actor.lat)],
        Number(actor.heightOffsetMeters ?? 0)
      )
      const scale = coordinate.meterInMercatorCoordinateUnits() * CAT_WORLD_HEIGHT_METERS * Number(actor.modelScale ?? 1)
      const matrix = new THREE.Matrix4()
        .makeTranslation(
          coordinate.x - this.originCoordinate.x,
          coordinate.y - this.originCoordinate.y,
          coordinate.z - this.originCoordinate.z
        )
        .scale(new THREE.Vector3(scale, -scale, scale))
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
        .multiply(new THREE.Matrix4().makeRotationZ(Number(actor.rotationY ?? 0)))
      return matrix
    },

    syncActors() {
      const activeIds = new Set()

      for (const actor of this.actors) {
        const id = String(actor.catId)
        activeIds.add(id)
        let instance = this.instances.get(id)

        if (!instance) {
          const model = cloneModel(template)
          const root = new THREE.Group()
          root.matrixAutoUpdate = false
          root.add(model)
          this.scene.add(root)

          let mixer = null
          const clip = this.findSittingClip(actor.animationKey)
          if (clip) {
            mixer = new THREE.AnimationMixer(model)
            mixer.clipAction(clip).play()
            this.mixers.push(mixer)
          }

          instance = { root, mixer }
          this.instances.set(id, instance)
        }

        instance.root.matrix.copy(this.makeTransform(actor))
        instance.root.matrixWorldNeedsUpdate = true
      }

      for (const [id, instance] of this.instances) {
        if (activeIds.has(id)) continue
        this.scene.remove(instance.root)
        this.instances.delete(id)
      }
    },

    render(_gl, args) {
      if (!this.renderer || !this.scene || !this.camera) return
      if (!this.originCoordinate) this.updateOrigin()
      const mapMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix)
      const originMatrix = new THREE.Matrix4().makeTranslation(
        this.originCoordinate.x,
        this.originCoordinate.y,
        this.originCoordinate.z
      )
      this.camera.projectionMatrix = mapMatrix.multiply(originMatrix)

      const delta = Math.min(this.clock.getDelta(), 0.05)
      for (const mixer of this.mixers) mixer.update(delta)

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
    avatarInstance: null,
    catActors: new Map(),
    buildingActors: new Map(),
    modelTemplates: new Map(),
    pendingCatActors: [],
    pendingBuildingActors: [],
    mixers: [],
    ready: false,

    setAvatarPosition(position) {
      this.avatarPosition = [...position]
      if (this.avatarInstance) this.avatarInstance.position = [...position]
    },

    setFollowing() {
      // 모델은 항상 지도 좌표·지도 방향에 고정. 시점 전환 연출(줌·pitch·패딩)은
      // main.js의 easeTo가 한 번의 애니메이션으로 담당한다.
    },

    isAvatarHit(point, radiusPx = 78) {
      if (!this.avatarInstance?.anchor?.visible || !this.width || !this.height) return false
      const x = this.avatarInstance.anchor.position.x + this.width / 2
      const y = this.height / 2 - this.avatarInstance.anchor.position.y
      return Math.hypot(point.x - x, point.y - y) <= radiusPx
    },

    findAnimationClip(animations, candidates) {
      const normalized = candidates.map((name) => name.toLowerCase().replace(/[\s_-]+/g, ''))
      return animations?.find((clip) => normalized.includes(clip.name.toLowerCase().replace(/[\s_-]+/g, ''))) ??
        animations?.find((clip) => normalized.some((name) => clip.name.toLowerCase().replace(/[\s_-]+/g, '').includes(name))) ??
        null
    },

    playAvatarAnimation(name = 'excited_jump') {
      if (!this.avatarInstance?.mixer || !this.avatarAnimations?.length) return false
      const clip = this.findAnimationClip(this.avatarAnimations, [
        name,
        'excited_jump',
        'exicted_jump',
        'excited jump',
        'exicted jump',
        'jump',
        'excited',
      ])
      if (!clip) return false

      const { THREE } = this
      const mixer = this.avatarInstance.mixer
      const idleClip = this.findIdleClip(this.avatarAnimations)
      const action = mixer.clipAction(clip)
      const idleAction = idleClip ? mixer.clipAction(idleClip) : null
      const previousAction = this.avatarActiveAction ?? idleAction
      if (this.avatarReturnToIdle) {
        mixer.removeEventListener('finished', this.avatarReturnToIdle)
        this.avatarReturnToIdle = null
      }

      if (previousAction && previousAction !== action) {
        previousAction.enabled = true
        previousAction.setEffectiveWeight(1)
        previousAction.play()
      }

      action.reset()
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
      action.setEffectiveTimeScale(1)
      action.setEffectiveWeight(1)
      action.play()
      if (previousAction && previousAction !== action) action.crossFadeFrom(previousAction, 0.12, false)
      else action.fadeIn(0.08)
      this.avatarActiveAction = action

      const returnToIdle = (event) => {
        if (event.action !== action) return
        mixer.removeEventListener('finished', returnToIdle)
        this.avatarReturnToIdle = null
        if (idleAction) {
          idleAction.reset()
          idleAction.setEffectiveTimeScale(1)
          idleAction.setEffectiveWeight(1)
          idleAction.play()
          idleAction.crossFadeFrom(action, 0.16, false)
          this.avatarActiveAction = idleAction
        } else {
          action.fadeOut(0.12)
          this.avatarActiveAction = null
        }
      }
      this.avatarReturnToIdle = returnToIdle
      mixer.addEventListener('finished', returnToIdle)
      return true
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

    ensureCatWorldLayer() {
      if (this.catWorldLayer || !this.ready || !this.catTemplate) return
      this.catWorldLayer = createCatWorldLayer({
        THREE: this.THREE,
        cloneModel: this.cloneModel,
        template: this.catTemplate,
        animations: this.catAnimations,
      })

      const addLayer = () => {
        if (this.map.getLayer(this.catWorldLayer.id)) return
        this.map.addLayer(this.catWorldLayer)
        this.catWorldLayer.setActors(this.pendingCatActors)
      }

      if (this.map.loaded()) addLayer()
      else this.map.once('idle', addLayer)
    },

    syncCatActors() {
      const activeIds = new Set()

      for (const actor of this.pendingCatActors) {
        if (!actor.modelUrl) continue
        const id = String(actor.catId)
        activeIds.add(id)

        const position = [Number(actor.lng), Number(actor.lat)]
        const existing = this.catActors.get(id)
        if (existing) {
          existing.position = position
          existing.heightOffsetMeters = Number(actor.heightOffsetMeters ?? 0)
          existing.movementRadiusMeters = Number(actor.movementRadiusMeters ?? 0)
          existing.fixedScreenScale = true
          existing.keepUpright = true
          existing.distancePerspective = true
          existing.yawFollowFactor = CAT_YAW_FOLLOW_FACTOR
          existing.fallbackDistanceMeters = Number(actor.distanceMeters ?? 100)
          existing.actor = actor
          continue
        }

        const instance = this.createInstance(
          this.catTemplate,
          this.catAnimations,
          actor.animationKey,
          position,
          72 * Number(actor.modelScale ?? 1)
        )
        instance.heightOffsetMeters = Number(actor.heightOffsetMeters ?? 0)
        instance.movementRadiusMeters = Number(actor.movementRadiusMeters ?? 0)
        instance.fixedScreenScale = true
        instance.keepUpright = true
        instance.distancePerspective = true
        instance.yawFollowFactor = CAT_YAW_FOLLOW_FACTOR
        instance.fallbackDistanceMeters = Number(actor.distanceMeters ?? 100)
        instance.actor = actor
        this.catActors.set(id, instance)
      }

      for (const [id, instance] of this.catActors) {
        if (activeIds.has(id)) continue
        this.scene.remove(instance.anchor)
        this.catActors.delete(id)
      }
    },

    setBuildingActors(actors) {
      this.pendingBuildingActors = actors
      if (!this.ready) return
      this.syncBuildingActors()
    },

    async loadModelTemplate(url) {
      if (this.modelTemplates.has(url)) return this.modelTemplates.get(url)
      const gltf = await this.loader.loadAsync(url)
      this.enhanceModelQuality(gltf.scene)
      const model = {
        template: this.normalizeModel(gltf.scene),
        animations: gltf.animations,
      }
      this.modelTemplates.set(url, model)
      return model
    },

    async syncBuildingActors() {
      const activeIds = new Set()

      for (const actor of this.pendingBuildingActors) {
        if (!actor.modelUrl) continue
        const id = String(actor.id)
        activeIds.add(id)

        const position = [Number(actor.lng), Number(actor.lat)]
        const existing = this.buildingActors.get(id)
        if (existing) {
          existing.position = position
          existing.heightOffsetMeters = Number(actor.heightOffsetMeters ?? 0)
          existing.yawOffset = Number(actor.rotationY ?? 0)
          existing.fixedScreenScale = true
          existing.keepUpright = true
          existing.actor = actor
          continue
        }

        try {
          const model = await this.loadModelTemplate(actor.modelUrl)
          const instance = this.createInstance(
            model.template,
            model.animations,
            null,
            position,
            228 * Number(actor.modelScale ?? 1)
          )
          instance.heightOffsetMeters = Number(actor.heightOffsetMeters ?? 0)
          instance.yawOffset = Number(actor.rotationY ?? 0)
          instance.fixedScreenScale = true
          instance.keepUpright = true
          instance.actor = actor
          this.buildingActors.set(id, instance)
        } catch (error) {
          console.warn('mock building GLB failed to load:', actor.modelUrl, error)
        }
      }

      for (const [id, instance] of this.buildingActors) {
        if (activeIds.has(id)) continue
        this.scene.remove(instance.anchor)
        this.buildingActors.delete(id)
      }
    },

    async init() {
      try {
        const [THREE, loaderModule, skeletonModule] = await Promise.all([
          import(/* @vite-ignore */ THREE_CDN),
          import(/* @vite-ignore */ GLTF_LOADER_CDN),
          import(/* @vite-ignore */ SKELETON_UTILS_CDN),
        ])

        this.THREE = THREE
        this.cloneModel = skeletonModule.clone
        this.scene = new THREE.Scene()
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000)
        this.camera.position.z = 1000
        this.clock = new THREE.Clock()
        this.loader = new loaderModule.GLTFLoader()

        this.canvas = document.createElement('canvas')
        this.canvas.className = 'model-overlay'
        this.canvas.setAttribute('aria-hidden', 'true')
        this.map.getContainer().append(this.canvas)

        this.renderer = new THREE.WebGLRenderer({
          canvas: this.canvas,
          antialias: true,
          alpha: true,
          premultipliedAlpha: true,
          powerPreference: 'high-performance',
          precision: 'highp',
        })
        this.renderer.setClearColor(0x000000, 0)
        this.renderer.outputColorSpace = THREE.SRGBColorSpace
        this.maxTextureAnisotropy = this.renderer.capabilities.getMaxAnisotropy()
        this.updateRendererPixelRatio()

        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x55766d, 3.2))
        const sunlight = new THREE.DirectionalLight(0xfff1d6, 2.4)
        sunlight.position.set(-2, 3, 5)
        this.scene.add(sunlight)

        const [avatarGltf, catGltf] = await Promise.all([
          this.loader.loadAsync(AVATAR_MODEL_URL),
          this.loader.loadAsync(CAT_MODEL_URL),
        ])
        this.enhanceModelQuality(avatarGltf.scene)
        this.enhanceModelQuality(catGltf.scene)

        this.avatarTemplate = this.normalizeModel(avatarGltf.scene)
        this.avatarAnimations = avatarGltf.animations
        this.catTemplate = this.normalizeModel(catGltf.scene)
        this.catAnimations = catGltf.animations
        this.ready = true
        document.documentElement.classList.add('models-ready')

        if (this.avatarPosition) this.createAvatarInstance()
        this.ensureCatWorldLayer()
        this.syncBuildingActors()

        this.resize()
        window.addEventListener('resize', () => this.resize())
        this.animate()
      } catch (error) {
        console.warn('3D 캐릭터 모델을 불러오지 못했습니다.', error)
      }
    },

    updateRendererPixelRatio() {
      if (!this.renderer) return
      this.renderer.setPixelRatio(
        clamp(window.devicePixelRatio || 1, 1, MAX_RENDER_PIXEL_RATIO)
      )
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

    createInstance(template, animations, animationName, position, basePixelHeight, options = {}) {
      const { THREE } = this
      const model = this.cloneModel(template)
      const anchor = new THREE.Group()
      // X(카메라 고도 기울임)를 가장 바깥 회전으로 둬야
      // 방향(Y)을 튼 모델이 화면에서 옆으로 기울지 않고 곧게 선다.
      anchor.rotation.order = 'XYZ'
      if (options.withShadow) {
        anchor.add(this.createAvatarShadow())
      }
      anchor.add(model)
      this.scene.add(anchor)

      let mixer = null
      if (animations?.length) {
        mixer = new THREE.AnimationMixer(model)
        const clip = animationName
          ? THREE.AnimationClip.findByName(animations, animationName) ?? animations[0]
          : animations[0]
        if (clip) mixer.clipAction(clip).play()
        this.mixers.push(mixer)
      }

      return {
        anchor,
        basePixelHeight,
        mixer,
        position: [...position],
      }
    },

    findIdleClip(animations) {
      return animations?.find((clip) => clip.name.toLowerCase() === 'idle') ??
        animations?.find((clip) => clip.name.toLowerCase() === 'avatar_idle') ??
        animations?.find((clip) => /idle/i.test(clip.name)) ??
        animations?.[0] ??
        null
    },

    createAvatarShadow() {
      const { THREE } = this
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(0.5, 48),
        new THREE.MeshBasicMaterial({
          color: AVATAR_SHADOW_COLOR,
          depthTest: false,
          depthWrite: false,
          opacity: AVATAR_SHADOW_OPACITY,
          transparent: true,
        })
      )

      shadow.name = 'avatar_ground_shadow'
      shadow.renderOrder = -1
      shadow.rotation.x = AVATAR_SHADOW_ROTATION_X
      shadow.position.set(...AVATAR_SHADOW_POSITION)
      shadow.scale.set(...AVATAR_SHADOW_SCALE)
      return shadow
    },

    createAvatarInstance() {
      if (this.avatarInstance || !this.avatarPosition) return
      this.avatarInstance = this.createInstance(
        this.avatarTemplate,
        this.avatarAnimations,
        this.findIdleClip(this.avatarAnimations)?.name ?? 'idle',
        this.avatarPosition,
        32,
        { withShadow: true }
      )
    },

    resize() {
      if (!this.renderer || !this.camera) return
      const width = this.map.getContainer().clientWidth
      const height = this.map.getContainer().clientHeight
      if (!width || !height) return

      this.width = width
      this.height = height
      this.updateRendererPixelRatio()
      this.renderer.setSize(width, height, false)
      this.camera.left = -width / 2
      this.camera.right = width / 2
      this.camera.top = height / 2
      this.camera.bottom = -height / 2
      this.camera.updateProjectionMatrix()
    },

    updateScreenPosition(instance) {
      const point = this.map.project(instance.position)
      const zoomScale = clamp(
        2 ** ((this.map.getZoom() - MODEL_BASE_ZOOM) * MODEL_ZOOM_EXPONENT),
        MODEL_MIN_ZOOM_SCALE,
        MODEL_MAX_ZOOM_SCALE
      )
      const distance = this.avatarPosition
        ? distanceMeters(this.avatarPosition, instance.position)
        : Number(instance.fallbackDistanceMeters ?? 100)
      const perspectiveScale = instance.distancePerspective
        ? clamp(
            CAT_PERSPECTIVE_REFERENCE_METERS / (distance + CAT_PERSPECTIVE_OFFSET_METERS),
            CAT_PERSPECTIVE_MIN_SCALE,
            CAT_PERSPECTIVE_MAX_SCALE
          )
        : 1
      const modelScale = instance.basePixelHeight * (instance.fixedScreenScale ? 1 : zoomScale) * perspectiveScale
      const margin = Math.max(120, modelScale)
      const mapBearing = (this.map.getBearing() * Math.PI) / 180
      const cameraElevation = ((90 - this.map.getPitch()) * Math.PI) / 180

      instance.anchor.visible =
        point.x >= -margin &&
        point.x <= this.width + margin &&
        point.y >= -margin &&
        point.y <= this.height + margin
      instance.anchor.position.set(
        point.x - this.width / 2,
        this.height / 2 - point.y + Number(instance.heightOffsetMeters ?? 0) * (instance.fixedScreenScale ? 1 : zoomScale) * 1.4,
        0
      )
      instance.anchor.scale.setScalar(modelScale)
      // 미쿠는 항상 지도 기준 같은 방향을 본다. 카메라가 돌면 옆·앞모습이 보인다.
      instance.anchor.rotation.y = AVATAR_WORLD_HEADING - mapBearing * Number(instance.yawFollowFactor ?? 1) + Number(instance.yawOffset ?? 0)
      // 지도 카메라가 낮아질수록 모델을 옆에서, 높아질수록 위에서 본다.
      instance.anchor.rotation.x = instance.keepUpright ? 0 : cameraElevation
    },

    animate() {
      if (!this.ready) return
      requestAnimationFrame(() => this.animate())

      if (this.avatarPosition && !this.avatarInstance) this.createAvatarInstance()
      if (this.avatarInstance) this.updateScreenPosition(this.avatarInstance)

      const delta = Math.min(this.clock.getDelta(), 0.05)
      for (const mixer of this.mixers) mixer.update(delta)
      this.renderer.render(this.scene, this.camera)
    },
  }

  controller.init()
  return controller
}
