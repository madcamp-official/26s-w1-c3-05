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
const MODEL_BASE_ZOOM = 13.8 // 이 줌에서 모델이 기준 크기(basePixelHeight)
const MODEL_ZOOM_EXPONENT = 0.4
const MODEL_MIN_ZOOM_SCALE = 0.35
const MODEL_MAX_ZOOM_SCALE = 7

export function createAnimatedModelLayer(map) {
  const controller = {
    map,
    avatarPosition: null,
    avatarInstance: null,
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

    addCat() {
      // 3D 고양이 모델은 쓰지 않는다. 사진 위치는 DOM 사진 아이콘 마커로만 표시.
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
        })
        this.renderer.setClearColor(0x000000, 0)
        this.renderer.outputColorSpace = THREE.SRGBColorSpace
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x55766d, 3.2))
        const sunlight = new THREE.DirectionalLight(0xfff1d6, 2.4)
        sunlight.position.set(-2, 3, 5)
        this.scene.add(sunlight)

        const avatarGltf = await this.loader.loadAsync('/models/avatar.glb')

        this.avatarTemplate = this.normalizeModel(avatarGltf.scene)
        this.avatarAnimations = avatarGltf.animations
        this.ready = true
        document.documentElement.classList.add('models-ready')

        if (this.avatarPosition) this.createAvatarInstance()

        this.resize()
        window.addEventListener('resize', () => this.resize())
        this.animate()
      } catch (error) {
        console.warn('3D 캐릭터 모델을 불러오지 못했습니다.', error)
      }
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

    createInstance(template, animations, animationName, position, basePixelHeight) {
      const { THREE } = this
      const model = this.cloneModel(template)
      const anchor = new THREE.Group()
      // X(카메라 고도 기울임)를 가장 바깥 회전으로 둬야
      // 방향(Y)을 튼 모델이 화면에서 옆으로 기울지 않고 곧게 선다.
      anchor.rotation.order = 'XYZ'
      anchor.add(model)
      this.scene.add(anchor)

      const mixer = new THREE.AnimationMixer(model)
      const clip =
        THREE.AnimationClip.findByName(animations, animationName) ?? animations[0]
      if (clip) mixer.clipAction(clip).play()
      this.mixers.push(mixer)

      return {
        anchor,
        basePixelHeight,
        mixer,
        position: [...position],
      }
    },

    createAvatarInstance() {
      if (this.avatarInstance || !this.avatarPosition) return
      this.avatarInstance = this.createInstance(
        this.avatarTemplate,
        this.avatarAnimations,
        'avatar_idle',
        this.avatarPosition,
        32
      )
    },

    resize() {
      if (!this.renderer || !this.camera) return
      const width = this.map.getContainer().clientWidth
      const height = this.map.getContainer().clientHeight
      if (!width || !height) return

      this.width = width
      this.height = height
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
      const modelScale = instance.basePixelHeight * zoomScale
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
        this.height / 2 - point.y,
        0
      )
      instance.anchor.scale.setScalar(modelScale)
      // 미쿠는 항상 지도 기준 같은 방향을 본다. 카메라가 돌면 옆·앞모습이 보인다.
      instance.anchor.rotation.y = AVATAR_WORLD_HEADING - mapBearing
      // 지도 카메라가 낮아질수록 모델을 옆에서, 높아질수록 위에서 본다.
      instance.anchor.rotation.x = cameraElevation
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
