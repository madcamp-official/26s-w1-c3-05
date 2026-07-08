// 도감 상세 화면의 "고양이를 3D로 보기" 버튼이 여는 단독 3D 뷰어.
// 지도 3D 레이어(model-layer.js)는 MapLibre 커스텀 레이어 + mercator 좌표 투영에 강하게
// 묶여 있어 팝업용으로는 안 맞는다. 그래서 재사용하지 않고, 모달 안의 일반 <canvas>에
// 독립된 THREE.Scene/PerspectiveCamera/OrbitControls/WebGLRenderer를 새로 구성한다.
// GLTFLoader import 방식(esm.sh/three CDN)만 model-layer.js와 동일하게 맞췄다.
// pattern → glb 매핑(cat-models.js)은 호출하는 쪽(main.js)의 책임이다. 이 모듈은 이미
// 계산된 modelUrl/modelScale만 받아서 로드·렌더링하고, 하드코딩된 모델 경로는 갖지 않는다.
// 인터랙션은 회전/줌 정도만 필요해서 OrbitControls 기본 기능만 쓴다. 애니메이션/스켈레톤
// 재생은 지금 스코프가 아니라서 다루지 않는다(AnimationMixer 없음).

const THREE_VERSION = '0.180.0'
const THREE_CDN = 'https://esm.sh/three@' + THREE_VERSION
const GLTF_LOADER_CDN = THREE_CDN + '/examples/jsm/loaders/GLTFLoader.js'
const ORBIT_CONTROLS_CDN = THREE_CDN + '/examples/jsm/controls/OrbitControls.js'

// 정규화된(키 1 단위) 모델에 곱하는 추가 배율. 1.0이면 화면 위아래로 넘쳐서 잘렸음 —
// 0.7배로 줄여도 여전히 커 보인다는 피드백을 받아 그 위에 다시 0.7배(0.7*0.7=0.49)를 더 줄였다.
const VIEWER_MODEL_SCALE = 0.49
const AUTO_ROTATE_SPEED = 2.2 // OrbitControls 기본 단위(초당 30초에 한 바퀴 * 이 값)

let THREE = null
let GLTFLoader = null
let OrbitControls = null
let loaderModulePromise = null

let renderer = null
let scene = null
let camera = null
let controls = null
let modelGroup = null
let clock = null
let animationFrameId = null
let resizeObserver = null
let loadToken = 0

let sectionEl = null
let canvasEl = null
let statusEl = null
let titleEl = null

function ensureBoundOnce() {
  if (sectionEl) return
  sectionEl = document.querySelector('#cat-3d-viewer')
  if (!sectionEl) return
  canvasEl = sectionEl.querySelector('#cat-3d-viewer-canvas')
  statusEl = sectionEl.querySelector('[data-cat-3d-status]')
  titleEl = sectionEl.querySelector('[data-cat-3d-title]')

  sectionEl.querySelector('[data-cat-3d-close]')?.addEventListener('click', closeCat3DViewer)
}

async function ensureThree() {
  if (THREE && GLTFLoader && OrbitControls) return
  if (!loaderModulePromise) {
    loaderModulePromise = Promise.all([
      import(/* @vite-ignore */ THREE_CDN),
      import(/* @vite-ignore */ GLTF_LOADER_CDN),
      import(/* @vite-ignore */ ORBIT_CONTROLS_CDN),
    ])
  }
  const [threeModule, loaderModule, controlsModule] = await loaderModulePromise
  THREE = threeModule
  GLTFLoader = loaderModule.GLTFLoader
  OrbitControls = controlsModule.OrbitControls
}

// 3D 버튼을 누르기 전에 미리 불러 "누른 순간부터 로딩"이 아니라 "이미 다 받아둔 상태"로
// 만든다. three.js 코어/GLTFLoader는 지도 3D 레이어(model-layer.js)가 이미 같은 CDN URL로
// 받아둔 경우가 많아 대개 즉시 캐시 히트고, OrbitControls와 glb 파일만 실제로 새로 받는다.
// 실패해도 조용히 무시한다 — 버튼을 누르면 openCat3DViewer가 같은 경로로 다시 시도한다.
export function preloadCat3DAssets(modelUrl) {
  ensureThree().catch(() => {})
  if (modelUrl) {
    fetch(modelUrl).catch(() => {})
  }
}

function ensureRenderer() {
  if (renderer) return
  renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

  scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5f746f, 3.2))
  const sunlight = new THREE.DirectionalLight(0xfff1d6, 2.0)
  sunlight.position.set(-2, 3, 5)
  scene.add(sunlight)

  // 정규화된 모델은 키가 VIEWER_MODEL_SCALE 단위(발이 y=0)이므로, 그 절반 높이를
  // 바라보게 하면 모델이 항상 화면 중앙에 담긴다.
  const modelCenterY = VIEWER_MODEL_SCALE / 2
  camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50)
  camera.position.set(0, modelCenterY + 0.2 * VIEWER_MODEL_SCALE, 2.1)

  controls = new OrbitControls(camera, canvasEl)
  controls.target.set(0, modelCenterY, 0)
  controls.enableDamping = true
  controls.enablePan = false
  controls.minDistance = 0.9
  controls.maxDistance = 4
  controls.autoRotate = true
  controls.autoRotateSpeed = AUTO_ROTATE_SPEED
  controls.update()

  clock = new THREE.Clock()

  resizeObserver = new ResizeObserver(() => resizeToContainer())
  resizeObserver.observe(sectionEl)
}

function resizeToContainer() {
  if (!renderer || !sectionEl) return
  const width = sectionEl.clientWidth || 1
  const height = sectionEl.clientHeight || 1
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}

function disposeGroup(group) {
  group.traverse((object) => {
    if (object.geometry) object.geometry.dispose()
    if (object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => material.dispose())
    }
  })
}

function disposeModel() {
  if (!modelGroup) return
  disposeGroup(modelGroup)
  scene.remove(modelGroup)
  modelGroup = null
}

// 로드된 glb를 "키 1 단위, 발이 y=0"으로 정규화한 뒤 VIEWER_MODEL_SCALE로 맞춘
// 그룹을 만든다. 단독 뷰어와 미니 프리뷰(createMiniCatModelPreview)가 함께 쓴다.
function buildNormalizedModelGroup(sourceScene, extraScale) {
  const box = new THREE.Box3().setFromObject(sourceScene)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())

  sourceScene.position.set(-center.x, -box.min.y, -center.z)

  const holder = new THREE.Group()
  holder.scale.setScalar((1 / Math.max(size.y, 0.0001)) * extraScale * VIEWER_MODEL_SCALE)
  holder.add(sourceScene)

  const group = new THREE.Group()
  group.add(holder)
  return group
}

function normalizeAndAddModel(sourceScene, extraScale) {
  modelGroup = buildNormalizedModelGroup(sourceScene, extraScale)
  scene.add(modelGroup)
}

function renderLoop() {
  animationFrameId = requestAnimationFrame(renderLoop)
  clock.getDelta()
  controls.update() // enableDamping/autoRotate가 매 프레임 갱신을 요구한다.
  renderer.render(scene, camera)
}

export async function openCat3DViewer({ modelUrl, modelScale, name } = {}) {
  ensureBoundOnce()
  if (!sectionEl || !modelUrl) return

  const token = ++loadToken
  sectionEl.hidden = false
  if (titleEl) titleEl.textContent = name ? `${name} 3D로 보기` : '3D로 보기'
  if (statusEl) {
    statusEl.hidden = false
    statusEl.textContent = '모델을 불러오는 중...'
  }

  try {
    await ensureThree()
    if (token !== loadToken) return
    ensureRenderer()
    resizeToContainer()
    disposeModel()

    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(modelUrl)
    if (token !== loadToken) return

    normalizeAndAddModel(gltf.scene, modelScale ?? 1)

    if (statusEl) statusEl.hidden = true
    if (!animationFrameId) renderLoop()
  } catch (error) {
    console.warn('3D 모델을 불러오지 못했습니다.', error)
    if (token === loadToken && statusEl) {
      statusEl.hidden = false
      statusEl.textContent = '3D 모델을 불러오지 못했어요.'
    }
  }
}

export function closeCat3DViewer() {
  loadToken += 1 // 진행 중인 로딩 결과를 무시한다.
  if (sectionEl) sectionEl.hidden = true
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
}

// 도감 신규 등록 연출(discovery reveal) 안에 함께 띄우는 작은 3D 프리뷰.
// 단독 뷰어(위 open/closeCat3DViewer)는 모듈 전역 싱글턴(renderer/scene/camera...)
// 하나만 유지하는 구조라 재사용할 수 없다 — 임의의 <canvas>에 독립된 렌더러를
// 새로 붙여서 여러 인스턴스가 동시에 있어도 서로 간섭하지 않게 한다. 인터랙션이
// 필요 없어(발견 연출 동안 잠깐 보여주는 용도) OrbitControls 없이 y축으로만 천천히
// 자동 회전시킨다.
export function createMiniCatModelPreview(canvas) {
  let localRenderer = null
  let localScene = null
  let localCamera = null
  let localModelGroup = null
  let localClock = null
  let localAnimationFrameId = null
  let localLoadToken = 0
  let disposed = false

  function ensureLocalRenderer() {
    if (localRenderer) return
    localRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    localRenderer.outputColorSpace = THREE.SRGBColorSpace
    localRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

    localScene = new THREE.Scene()
    localScene.add(new THREE.HemisphereLight(0xffffff, 0x5f746f, 3.2))
    const sunlight = new THREE.DirectionalLight(0xfff1d6, 2.0)
    sunlight.position.set(-2, 3, 5)
    localScene.add(sunlight)

    const modelCenterY = VIEWER_MODEL_SCALE / 2
    localCamera = new THREE.PerspectiveCamera(35, 1, 0.05, 50)
    localCamera.position.set(0, modelCenterY + 0.2 * VIEWER_MODEL_SCALE, 2.1)
    localCamera.lookAt(0, modelCenterY, 0)

    localClock = new THREE.Clock()
  }

  function resize() {
    if (!localRenderer || !canvas.parentElement) return
    const width = canvas.parentElement.clientWidth || 1
    const height = canvas.parentElement.clientHeight || 1
    localRenderer.setSize(width, height, false)
    localCamera.aspect = width / height
    localCamera.updateProjectionMatrix()
  }

  function renderLoop() {
    if (disposed) return
    localAnimationFrameId = requestAnimationFrame(renderLoop)
    const delta = localClock.getDelta()
    if (localModelGroup) localModelGroup.rotation.y += delta * 0.9
    localRenderer.render(localScene, localCamera)
  }

  async function load(modelUrl, modelScale = 1) {
    if (!modelUrl) return
    const token = ++localLoadToken
    await ensureThree()
    if (disposed || token !== localLoadToken) return
    ensureLocalRenderer()
    resize()

    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(modelUrl)
    if (disposed || token !== localLoadToken) return

    if (localModelGroup) {
      localScene.remove(localModelGroup)
      disposeGroup(localModelGroup)
    }
    localModelGroup = buildNormalizedModelGroup(gltf.scene, modelScale)
    localScene.add(localModelGroup)

    if (!localAnimationFrameId) renderLoop()
  }

  function dispose() {
    disposed = true
    localLoadToken += 1
    if (localAnimationFrameId) cancelAnimationFrame(localAnimationFrameId)
    localAnimationFrameId = null
    if (localModelGroup) disposeGroup(localModelGroup)
    localRenderer?.dispose()
  }

  return { load, resize, dispose }
}
