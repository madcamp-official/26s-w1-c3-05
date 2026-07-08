// 배경음악(BGM) 재생 모듈.
// 브라우저 자동재생 정책상 사용자 제스처 이전에는 play()가 거부되므로,
// 첫 터치/클릭/키 입력 시점에 재생을 시작하고 음소거 여부는 로컬에 기억한다.

const BGM_SRC = '/audio/Sunlight_on_the_Garden_Porch.mp3'
const STORAGE_KEY = 'catchme.bgm.muted'
const TARGET_VOLUME = 0.32
const FADE_IN_MS = 1200

const ICON_ON = '🔊'
const ICON_OFF = '🔈'

function readMuted() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeMuted(muted) {
  try {
    localStorage.setItem(STORAGE_KEY, muted ? '1' : '0')
  } catch {
    /* 프라이빗 모드 등에서 저장 실패는 무시 */
  }
}

/** 0 → TARGET_VOLUME 으로 부드럽게 올린다. */
function fadeIn(audio) {
  const start = performance.now()
  audio.volume = 0
  const step = (now) => {
    const t = Math.min(1, (now - start) / FADE_IN_MS)
    audio.volume = TARGET_VOLUME * t
    if (t < 1 && !audio.paused) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

export function initBgm() {
  const audio = new Audio(BGM_SRC)
  audio.loop = true
  audio.preload = 'auto'
  audio.volume = TARGET_VOLUME

  const button = document.querySelector('#bgm-btn')
  let muted = readMuted()
  let started = false

  const syncButton = () => {
    if (!button) return
    button.textContent = muted ? ICON_OFF : ICON_ON
    button.setAttribute('aria-pressed', String(!muted))
    button.setAttribute('aria-label', muted ? '배경음악 켜기' : '배경음악 끄기')
    button.classList.toggle('bgm-btn--muted', muted)
  }

  const play = () => {
    if (muted) return
    const promise = audio.play()
    if (promise?.catch) promise.catch(() => {}) // 자동재생 거부는 조용히 무시
  }

  // 첫 사용자 제스처에서 재생 시작 (자동재생이 막혔을 때의 대비)
  const onFirstGesture = () => {
    if (started) return
    started = true
    detachGestureListeners()
    if (muted) return
    fadeIn(audio)
    play()
  }

  const gestureEvents = ['pointerdown', 'touchstart', 'keydown']
  const detachGestureListeners = () => {
    gestureEvents.forEach((type) => window.removeEventListener(type, onFirstGesture))
  }
  gestureEvents.forEach((type) => window.addEventListener(type, onFirstGesture, { passive: true }))

  // 자동재생이 허용된 환경(사용자가 이미 상호작용한 탭 등)에서는 바로 시작
  if (!muted) {
    audio
      .play()
      .then(() => {
        started = true
        detachGestureListeners()
        fadeIn(audio)
      })
      .catch(() => {}) // 막히면 위의 제스처 리스너가 처리한다
  }

  // 탭이 백그라운드로 가면 잠시 멈춘다
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.pause()
    else if (started && !muted) play()
  })

  button?.addEventListener('click', () => {
    muted = !muted
    writeMuted(muted)
    syncButton()
    if (muted) {
      audio.pause()
    } else {
      started = true
      audio.volume = TARGET_VOLUME
      play()
    }
  })

  syncButton()

  return {
    pause: () => audio.pause(),
    resume: () => play(),
  }
}
