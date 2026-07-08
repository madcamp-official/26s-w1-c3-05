// 백엔드 REST API 호출을 한 곳에 모은 얇은 래퍼.
// 모든 함수는 파싱된 JSON을 반환하고, 실패 시 status/code가 붙은 Error를 던진다.
import { authFetch } from './auth.js'

async function requestJson(path, options) {
  const response = await authFetch(path, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.message ?? '요청을 처리하지 못했습니다.')
    error.status = response.status
    error.code = data.code
    throw error
  }
  return data
}

function jsonBody(method, body) {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

// Auth
export const getMe = () => requestJson('/api/auth/me')

// Cat
export const getCats = () => requestJson('/api/cats')
export const getCat = (catId) => requestJson(`/api/cats/${catId}`)
export const getCatSightings = (catId) => requestJson(`/api/cats/${catId}/sightings`)
export const setCatName = (catId, name) => requestJson(`/api/cats/${catId}/name`, jsonBody('PATCH', { name }))
export const setCatNickname = (catId, customName) =>
  requestJson(`/api/cats/${catId}/nickname`, jsonBody('PATCH', { customName }))
export const getBushClue = (catId) => requestJson(`/api/cats/${catId}/bush-clue`, jsonBody('POST', {}))

// Collection (도감)
export const getCollection = () => requestJson('/api/collection')
export const setFavorite = (catId, isFavorite) =>
  requestJson(`/api/collection/${catId}/favorite`, jsonBody('PATCH', { isFavorite }))

// Gallery
export const getGallery = ({ catId, page, limit } = {}) => {
  const params = new URLSearchParams()
  if (catId != null) params.set('catId', String(catId))
  if (page != null) params.set('page', String(page))
  if (limit != null) params.set('limit', String(limit))
  const qs = params.toString()
  return requestJson(`/api/gallery/me${qs ? `?${qs}` : ''}`)
}

// Profile
export const getProfile = () => requestJson('/api/profile/me')
export const updateProfile = (payload) => requestJson('/api/profile/me', jsonBody('PATCH', payload))

// 기기에서 고른 사진을 프로필 이미지로 업로드한다. Content-Type은 브라우저가
// multipart 경계(boundary)와 함께 자동으로 붙여줘야 하므로 직접 지정하지 않는다.
export const uploadProfileImage = (file) => {
  const body = new FormData()
  body.append('image', file)
  return requestJson('/api/profile/me/image', { method: 'POST', body })
}

// Sighting
export const getMySightings = () => requestJson('/api/sightings/me')
