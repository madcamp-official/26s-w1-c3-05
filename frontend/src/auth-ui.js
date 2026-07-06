import {
  hasSession,
  loginAsGuest,
  loginWithEmail,
  loginWithGoogle,
  loginWithKakao,
  signupWithEmail,
} from './auth.js'

const welcome = document.querySelector('#welcome')
const emailAuth = document.querySelector('#email-auth')
const signup = document.querySelector('#signup')
const emailForm = document.querySelector('#email-step-form')
const signupForm = document.querySelector('#signup-form')
const emailInput = document.querySelector('#email-input')
const signupEmailInput = document.querySelector('#login-id')

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
  welcome.hidden = true
}

function showWelcome() {
  emailAuth.hidden = true
  signup.hidden = true
  welcome.hidden = false
}

function openEmailLogin() {
  welcome.hidden = true
  signup.hidden = true
  emailAuth.hidden = false
  showMessage(document.querySelector('#email-auth-message'))
  emailInput.focus()
}

function openSignup() {
  welcome.hidden = true
  emailAuth.hidden = true
  signup.hidden = false
  showMessage(document.querySelector('#signup-auth-message'))
  if (emailInput.value.trim()) signupEmailInput.value = emailInput.value.trim()
  signupEmailInput.focus()
}

async function runAuth(button, messageElement, busyText, action) {
  showMessage(messageElement)
  setBusy(button, true, busyText)

  try {
    await action()
    enterService()
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
      callback: ({ credential }) => {
        if (credential) resolve(credential)
        else reject(new Error('Google 로그인 정보를 받지 못했습니다.'))
      },
    })
    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed()) {
        reject(new Error('Google 로그인 창을 열지 못했습니다. 브라우저 설정을 확인해주세요.'))
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

    await loginWithKakao(tokenData.access_token)
    window.history.replaceState(null, '', '/')
    enterService()
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

signupForm.addEventListener('submit', (event) => {
  event.preventDefault()
  if (!signupForm.reportValidity()) return

  const button = signupForm.querySelector('[type="submit"]')
  runAuth(button, document.querySelector('#signup-auth-message'), '가입 중…', () =>
    signupWithEmail({
      email: signupEmailInput.value.trim(),
      password: document.querySelector('#signup-password').value,
      nickname: document.querySelector('#display-name').value.trim(),
    })
  )
})

document.querySelector('[data-guest-entry]').addEventListener('click', (event) => {
  runAuth(event.currentTarget, document.querySelector('#welcome-auth-message'), '접속 중…', loginAsGuest)
})

document.querySelector('[data-social-login="google"]').addEventListener('click', (event) => {
  const button = event.currentTarget
  runAuth(button, document.querySelector('#welcome-auth-message'), 'Google 연결 중…', async () => {
    const idToken = await getGoogleIdToken()
    await loginWithGoogle(idToken)
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
  if (hasSession()) enterService()
  if (window.location.hash === '#signup') openSignup()
})
