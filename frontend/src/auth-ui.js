import {
  hasSession,
  getStoredUser,
  loginAsGuest,
  loginWithEmail,
  loginWithGoogle,
  loginWithKakao,
  sendSignupCode,
  signupWithEmail,
  updateStoredUser,
} from './auth.js'
import { updateProfile } from './api.js'

const welcome = document.querySelector('#welcome')
const emailAuth = document.querySelector('#email-auth')
const signup = document.querySelector('#signup')
const nicknameSetup = document.querySelector('#nickname-setup')
const emailForm = document.querySelector('#email-step-form')
const signupForm = document.querySelector('#signup-form')
const nicknameSetupForm = document.querySelector('#nickname-setup-form')
const emailInput = document.querySelector('#email-input')
const signupEmailInput = document.querySelector('#login-id')
const nicknameSetupInput = document.querySelector('#nickname-setup-input')

function showMessage(element, message = '') {
  if (!element) return
  element.textContent = message
  element.hidden = !message
}

function setBusy(button, busy, busyText) {
  if (!button) return
  if (button.dataset.defaultHtml === undefined) button.dataset.defaultHtml = button.innerHTML
  button.disabled = busy
  button.setAttribute('aria-busy', String(busy))
  if (busy) button.textContent = busyText
  else button.innerHTML = button.dataset.defaultHtml
}

function enterService() {
  window.dispatchEvent(new CustomEvent('catchme:enter-service'))
  emailAuth.hidden = true
  signup.hidden = true
  if (nicknameSetup) nicknameSetup.hidden = true
  welcome.hidden = true
}

function showWelcome() {
  emailAuth.hidden = true
  signup.hidden = true
  if (nicknameSetup) nicknameSetup.hidden = true
  welcome.hidden = false
}

function openEmailLogin() {
  welcome.hidden = true
  signup.hidden = true
  if (nicknameSetup) nicknameSetup.hidden = true
  emailAuth.hidden = false
  showMessage(document.querySelector('#email-auth-message'))
  emailInput.focus()
}

function openSignup() {
  welcome.hidden = true
  emailAuth.hidden = true
  if (nicknameSetup) nicknameSetup.hidden = true
  signup.hidden = false
  showMessage(document.querySelector('#signup-auth-message'))
  if (emailInput.value.trim()) signupEmailInput.value = emailInput.value.trim()
  signupEmailInput.focus()
}

window.openSignup = openSignup

// 어떤 로그인 수단이든(게스트 포함) 닉네임 온보딩이 안 끝났으면 이름을 물어본다.
// 예전엔 여기서 authProvider 화이트리스트로 한 번 더 걸러서, 게스트는 이름 입력
// 화면이 아예 안 떴다.
//
// 게스트는 "둘러보기"를 누를 때마다 서버에서 새 계정이 만들어지고 "Guest a1b2c3" 같은
// 자동 닉네임이 붙는다 — 그러니 항상 새로 물어보는 게 맞다. 백엔드의 needsNickname에만
// 의존하면 게스트를 온보딩 완료로 표시하는(구버전) 서버에 붙었을 때 화면이 안 뜬다.
function shouldOpenNicknameSetup(data) {
  return Boolean(data?.needsNickname) || data?.user?.authProvider === 'guest'
}

function openNicknameSetup(user) {
  welcome.hidden = true
  emailAuth.hidden = true
  signup.hidden = true
  if (!nicknameSetup || !nicknameSetupInput) return enterService()
  nicknameSetup.hidden = false
  showMessage(document.querySelector('#nickname-setup-message'))
  nicknameSetupInput.value = ''
  // 자동 생성된 닉네임("Guest a1b2c3", 이메일 앞부분 등)은 힌트로 보여줄 값이 아니다 —
  // 사용자가 직접 정한 닉네임이 이미 있을 때만 "○○ 말고 새 닉네임"으로 안내한다.
  // (게스트 닉네임은 항상 서버가 지어준 것이라 구버전 서버가 온보딩 완료로 표시해도 제외한다.)
  const hasChosenNickname = user?.nicknameOnboarded && user?.nickname && user?.authProvider !== 'guest'
  nicknameSetupInput.placeholder = hasChosenNickname ? `${user.nickname} 말고 새 닉네임` : '예: 고양이탐험가'
  nicknameSetupInput.focus()
}

window.openNicknameSetup = openNicknameSetup

async function runAuth(button, messageElement, busyText, action) {
  showMessage(messageElement)
  setBusy(button, true, busyText)

  try {
    const data = await action()
    if (shouldOpenNicknameSetup(data)) openNicknameSetup(data.user)
    else enterService()
  } catch (error) {
    showMessage(messageElement, error?.message ?? '로그인에 실패했습니다.')
  } finally {
    setBusy(button, false, busyText)
  }
}

function loadScript(src, id) {
  const existing = document.querySelector(`#${id}`)
  if (existing) {
    if (existing.dataset.loaded === 'true') return Promise.resolve()
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', resolve, { once: true })
      existing.addEventListener('error', reject, { once: true })
    })
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.id = id
    script.src = src
    script.async = true
    script.onload = () => {
      script.dataset.loaded = 'true'
      resolve()
    }
    script.onerror = () => reject(new Error('Google 로그인 도구를 불러오지 못했습니다.'))
    document.head.append(script)
  })
}

async function getGoogleIdToken() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) throw new Error('VITE_GOOGLE_CLIENT_ID가 설정되지 않았습니다.')

  await loadScript('https://accounts.google.com/gsi/client', 'google-identity-services')

  return new Promise((resolve, reject) => {
    window.google.accounts.id.initialize({
      client_id: clientId,
      use_fedcm_for_prompt: true,
      callback: ({ credential }) => {
        if (credential) resolve(credential)
        else reject(new Error('Google 로그인 정보를 받지 못했습니다.'))
      },
    })
    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed()) {
        reject(new Error('Google 로그인 창을 열지 못했습니다. 브라우저 설정을 확인해주세요.'))
      } else if (notification.isSkippedMoment()) {
        reject(new Error('Google 로그인 창이 표시되지 않았습니다. 서드파티 쿠키 차단을 해제하거나 다시 시도해주세요.'))
      } else if (notification.isDismissedMoment()) {
        reject(new Error('Google 로그인이 취소되었습니다.'))
      }
    })
  })
}

function startKakaoLogin() {
  const clientId = import.meta.env.VITE_KAKAO_REST_API_KEY
  const redirectUri = import.meta.env.VITE_KAKAO_REDIRECT_URI ?? `${window.location.origin}/oauth/kakao/callback`
  if (!clientId) throw new Error('VITE_KAKAO_REST_API_KEY가 설정되지 않았습니다.')

  const state = [...crypto.getRandomValues(new Uint32Array(4))]
    .map((value) => value.toString(16).padStart(8, '0'))
    .join('')
  sessionStorage.setItem('kakaoOAuthState', state)

  const url = new URL('https://kauth.kakao.com/oauth/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', state)
  window.location.assign(url)
}

async function finishKakaoLogin() {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  if (!code || !window.location.pathname.endsWith('/oauth/kakao/callback')) return false

  const message = document.querySelector('#welcome-auth-message')
  const state = params.get('state')
  const expectedState = sessionStorage.getItem('kakaoOAuthState')
  sessionStorage.removeItem('kakaoOAuthState')
  welcome.hidden = false

  try {
    if (!state || state !== expectedState) throw new Error('카카오 로그인 요청을 확인하지 못했습니다. 다시 시도해주세요.')

    const clientId = import.meta.env.VITE_KAKAO_REST_API_KEY
    const redirectUri = import.meta.env.VITE_KAKAO_REDIRECT_URI ?? `${window.location.origin}/oauth/kakao/callback`
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code,
    })
    const response = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body,
    })
    const tokenData = await response.json()
    if (!response.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description ?? '카카오 토큰을 받지 못했습니다.')
    }

    const data = await loginWithKakao(tokenData.access_token)
    window.history.replaceState(null, '', '/')
    if (shouldOpenNicknameSetup(data)) openNicknameSetup(data.user)
    else enterService()
  } catch (error) {
    window.history.replaceState(null, '', '/')
    showMessage(message, error?.message ?? '카카오 로그인에 실패했습니다.')
  }
  return true
}

document.querySelector('[data-email-login]').addEventListener('click', openEmailLogin)
document.querySelector('#email-auth-back').addEventListener('click', showWelcome)
document.querySelector('#open-signup').addEventListener('click', openSignup)
document.querySelector('#signup-back').addEventListener('click', openEmailLogin)

emailForm.addEventListener('submit', (event) => {
  event.preventDefault()
  if (!emailForm.reportValidity()) return

  const button = emailForm.querySelector('[type="submit"]')
  runAuth(button, document.querySelector('#email-auth-message'), '로그인 중…', () =>
    loginWithEmail({
      email: emailInput.value.trim(),
      password: document.querySelector('#login-password').value,
    })
  )
})

document.querySelector('#send-code-btn').addEventListener('click', async (event) => {
  if (!signupEmailInput.reportValidity()) return

  const button = event.currentTarget
  const messageElement = document.querySelector('#send-code-message')
  showMessage(messageElement)
  setBusy(button, true, '전송 중…')

  try {
    await sendSignupCode(signupEmailInput.value.trim())
    showMessage(messageElement, '인증코드를 전송했습니다. 이메일을 확인해주세요.')
  } catch (error) {
    showMessage(messageElement, error?.message ?? '인증코드 전송에 실패했습니다.')
  } finally {
    setBusy(button, false, '전송 중…')
  }
})

signupForm.addEventListener('submit', (event) => {
  event.preventDefault()
  if (!signupForm.reportValidity()) return

  const button = signupForm.querySelector('[type="submit"]')
  runAuth(button, document.querySelector('#signup-auth-message'), '가입 중…', () =>
    signupWithEmail({
      email: signupEmailInput.value.trim(),
      code: document.querySelector('#signup-code').value.trim(),
      password: document.querySelector('#signup-password').value,
    })
  )
})

nicknameSetupForm?.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!nicknameSetupForm.reportValidity()) return

  const button = nicknameSetupForm.querySelector('[type="submit"]')
  const messageElement = document.querySelector('#nickname-setup-message')
  const nickname = nicknameSetupInput.value.trim()
  showMessage(messageElement)
  setBusy(button, true, '저장 중…')

  try {
    const user = await updateProfile({ nickname })
    updateStoredUser({ ...getStoredUser(), ...user })
    enterService()
  } catch (error) {
    showMessage(messageElement, error?.message ?? '닉네임을 저장하지 못했습니다.')
  } finally {
    setBusy(button, false, '저장 중…')
  }
})

document.querySelector('[data-guest-entry]').addEventListener('click', (event) => {
  runAuth(event.currentTarget, document.querySelector('#welcome-auth-message'), '접속 중…', async () => {
    const data = await loginAsGuest()
    // 게스트는 매번 새 계정이라, 이전 세션이 로그아웃 없이 끝났더라도(탭 종료, 토큰
    // 만료 등) 로컬에 남아있는 사진은 전부 이전 손님 것이다. 새 게스트 계정이 만들어진
    // 이 시점에 확실히 지워서 남의 사진 마커를 이어받지 않게 한다.
    window.resetGuestLocalPhotos?.()
    return data
  })
})

document.querySelector('[data-social-login="google"]').addEventListener('click', (event) => {
  const button = event.currentTarget
  runAuth(button, document.querySelector('#welcome-auth-message'), 'Google 연결 중…', async () => {
    const idToken = await getGoogleIdToken()
    return loginWithGoogle(idToken)
  })
})

document.querySelector('[data-social-login="kakao"]').addEventListener('click', (event) => {
  showMessage(document.querySelector('#welcome-auth-message'))
  try {
    setBusy(event.currentTarget, true, 'Kakao 연결 중…')
    startKakaoLogin()
  } catch (error) {
    setBusy(event.currentTarget, false, 'Kakao 연결 중…')
    showMessage(document.querySelector('#welcome-auth-message'), error?.message ?? '카카오 로그인을 시작하지 못했습니다.')
  }
})

window.addEventListener('DOMContentLoaded', async () => {
  if (await finishKakaoLogin()) return
  if (window.location.hash === '#signup') {
    openSignup()
    return
  }
  // 디자인 QA용: URL 해시로 바로 진입해서 화면을 확인할 수 있게 한다.
  if (window.location.hash === '#email-auth') {
    openEmailLogin()
    return
  }
  if (hasSession()) enterService()
})
