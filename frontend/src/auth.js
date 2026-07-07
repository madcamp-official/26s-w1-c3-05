export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000'

const ACCESS_TOKEN_KEY = 'accessToken'
const USER_KEY = 'user'

export class AuthError extends Error {
  constructor(message, status = 0, code = 'AUTH_ERROR') {
    super(message)
    this.name = 'AuthError'
    this.status = status
    this.code = code
  }
}

async function readJson(response) {
  const text = await response.text()
  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch {
    throw new AuthError('서버 응답을 읽지 못했습니다.', response.status, 'INVALID_RESPONSE')
  }
}

async function authRequest(path, options = {}) {
  let response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, options)
  } catch {
    throw new AuthError('서버에 연결하지 못했습니다. 백엔드가 실행 중인지 확인해주세요.', 0, 'NETWORK_ERROR')
  }

  const data = await readJson(response)
  if (!response.ok) {
    throw new AuthError(data.message ?? '로그인 요청에 실패했습니다.', response.status, data.code)
  }
  return data
}

export function saveSession(data) {
  if (!data?.accessToken || !data?.user) {
    throw new AuthError('로그인 응답에 사용자 또는 토큰이 없습니다.', 0, 'INVALID_AUTH_RESPONSE')
  }

  localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken)
  localStorage.setItem(USER_KEY, JSON.stringify(data.user))
  return data.user
}

async function loginAndSave(path, body) {
  const data = await authRequest(path, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  saveSession(data)
  return data
}

export const loginAsGuest = () => loginAndSave('/api/auth/guest')

export const sendSignupCode = (email) =>
  authRequest('/api/auth/signup/send-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })

export const signupWithEmail = ({ email, code, password, nickname }) =>
  loginAndSave('/api/auth/signup', { email, code, username: email, password, nickname })

export const loginWithEmail = ({ email, password }) =>
  loginAndSave('/api/auth/login', { username: email, password })

export const loginWithGoogle = (idToken) =>
  loginAndSave('/api/auth/google', { idToken })

export const loginWithKakao = (accessToken) =>
  loginAndSave('/api/auth/kakao', { accessToken })

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

export function getStoredUser() {
  const value = localStorage.getItem(USER_KEY)
  if (!value) return null

  try {
    return JSON.parse(value)
  } catch {
    localStorage.removeItem(USER_KEY)
    return null
  }
}

export function hasSession() {
  return Boolean(getAccessToken() && getStoredUser())
}

export async function authFetch(path, options = {}) {
  const token = getAccessToken()
  const headers = new Headers(options.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)

  return fetch(`${API_BASE_URL}${path}`, { ...options, headers })
}

export async function logout() {
  try {
    if (getAccessToken()) {
      await authFetch('/api/auth/logout', { method: 'POST' })
    }
  } finally {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }
}
