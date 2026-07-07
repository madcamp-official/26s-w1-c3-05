# 프론트 연동 대상 API 명세

지도 조회 + 로그인/회원가입 외에 아직 프론트에 연결 안 된 API들의 요청/응답 형식과, 실제로 화면 어디서/언제 호출해야 하는지 정리.
아래는 전부 **실제 구현 코드 기준**으로 작성됨 (Notion 초기 설계 문서와 다른 부분이 있을 수 있음 — 다를 경우 이 문서가 최신).

## 공통 규칙

### Base URL
```
/api
```

### 인증 방식
```
Authorization: Bearer {accessToken}
```

### 공통 에러 응답
```json
{ "message": "에러 메시지", "code": "ERROR_CODE" }
```

### 이미지 URL
`mainImageUrl`/`imageUrl` 필드는 백엔드가 절대 URL(`https://...`)로 내려주므로, 프론트에서 별도 prefix 없이 `<img src>`에 바로 사용하면 됨.

---

# 1. Cat API

## 1-1. 전체 고양이 목록 조회

| 항목 | 내용 |
| --- | --- |
| Method | `GET` |
| URL | `/api/cats` |
| 로그인 필요 | O |
| 설명 | 캠퍼스에 등록된 전체 고양이 목록을 조회한다. |

### Response
```json
{
  "cats": [
    { "id": "1", "name": "망고", "mainImageUrl": "https://...", "pattern": "cheese", "description": "...", "isDiscovered": true },
    { "id": "4", "name": null, "mainImageUrl": null, "pattern": null, "description": null, "isDiscovered": false }
  ]
}
```

### 비고
- `isDiscovered`는 **현재 로그인한 사용자 기준**. 같은 고양이라도 유저마다 응답이 다름.
- 미발견 고양이는 이름/사진/패턴/설명 전부 `null` — UI에서 `???`로 표시.
- **언제 쓰나**: 도감 전체 목록 화면(발견/미발견 섞어서 보여줄 때), 혹은 도감 진행률(`n/전체`) 계산할 때.

---

## 1-2. 고양이 상세 조회

| 항목 | 내용 |
| --- | --- |
| Method | `GET` |
| URL | `/api/cats/{catId}` |
| 로그인 필요 | O |
| 설명 | 특정 고양이의 상세 정보를 조회한다. |

### Path Parameter
| 이름 | 타입 | 설명 |
| --- | --- | --- |
| `catId` | string | 고양이 ID |

### Response (발견함)
```json
{
  "id": "1", "name": "망고", "mainImageUrl": "https://...", "pattern": "cheese",
  "personality": "사람을 잘 따름", "description": "...", "isDiscovered": true,
  "discoveredAt": "2026-07-01T03:20:00.000Z"
}
```

### Response (미발견)
```json
{
  "id": "4", "name": null, "mainImageUrl": null, "pattern": null,
  "personality": null, "description": null, "isDiscovered": false, "displayName": "???"
}
```

### 에러
`404 NOT_FOUND` — 없거나 아직 `active` 상태가 아닌 고양이(candidate 등)

### 비고
- **언제 쓰나**: 지도 마커 클릭, 도감 카드 클릭 시 상세 모달/화면 진입 지점.

---

## 1-3. 특정 고양이의 목격 기록 조회

| 항목 | 내용 |
| --- | --- |
| Method | `GET` |
| URL | `/api/cats/{catId}/sightings` |
| 로그인 필요 | O |
| 설명 | 특정 고양이의 최근 목격 기록을 조회한다 (모든 유저 통틀어서). |

### Response
```json
{
  "sightings": [
    { "id": "10", "imageUrl": "https://...", "latitude": 36.3726, "longitude": 127.3603, "createdAt": "2026-07-01T12:20:00.000Z" }
  ]
}
```

### 비고
- 필드명 주의: **`id`** 이지 `sightingId`가 아님.
- 업로드한 유저 정보는 노출 안 함.
- **언제 쓰나**: 고양이 상세 화면에서 "최근 목격 기록" 타임라인/지도 표시할 때.

---

# 2. Cat 이름/별명 수정 API

## 2-1. 신규 발견 고양이 이름 짓기

| 항목 | 내용 |
| --- | --- |
| Method | `PATCH` |
| URL | `/api/cats/{catId}/name` |
| 로그인 필요 | O |
| 설명 | `new_cat_candidate`로 새로 등록된(=아직 `candidate` 상태인) 고양이의 공식 이름을 짓는다. **발견자 본인만** 가능. |

### Path Parameter
| 이름 | 타입 | 설명 |
| --- | --- | --- |
| `catId` | string | 고양이 ID |

### Request Body
```json
{ "name": "망고" }
```

### Response
```json
{
  "cat": { "id": "4", "name": "망고", "mainImageUrl": "https://...", "status": "candidate", "isNewCollection": true },
  "message": "고양이 이름이 저장되었습니다."
}
```

### 에러
`400 VALIDATION_ERROR`(candidate 상태 아님) / `403 FORBIDDEN`(발견자 본인 아님) / `404 NOT_FOUND`

### 비고
- **언제 쓰나**: `POST /sightings` 또는 `confirm-cat` 응답의 `detectionStatus`가 `new_cat_candidate`일 때, 그 직후 "이 고양이 이름을 지어주세요" 입력 UI에서 호출.
- 관리자가 나중에 최종 승인(별도 admin API)하면 `status`가 `active`로 바뀜 — 이 API는 그 전 단계.

---

## 2-2. 내 도감 개인 별명 수정

| 항목 | 내용 |
| --- | --- |
| Method | `PATCH` |
| URL | `/api/cats/{catId}/nickname` |
| 로그인 필요 | O |
| 설명 | 공식 이름과 별개로, 나한테만 보이는 개인 별명을 설정한다. 도감에 등록된 고양이만 가능. |

### Request Body
```json
{ "customName": "설탕이" }
```
`customName: null`을 보내면 별명 해제 (원래 공식 이름으로 표시).

### Response
```json
{ "catId": "4", "customName": "설탕이", "message": "별명이 저장되었습니다." }
```

### 에러
`404 NOT_FOUND` — 도감에 없는 고양이

### 비고
- 다른 유저의 도감/화면엔 영향 없음 (철저히 나만 보는 값).
- **언제 쓰나**: 도감 상세 화면의 "별명 수정" 버튼.

---

# 3. Collection API (도감)

## 3-1. 내 도감 조회

| 항목 | 내용 |
| --- | --- |
| Method | `GET` |
| URL | `/api/collection` |
| 로그인 필요 | O |
| 설명 | 내가 발견한 고양이 목록(도감)을 조회한다. |

### Response
```json
{
  "cats": [
    {
      "catId": "1", "name": "망고", "customName": "설탕이", "displayName": "설탕이",
      "mainImageUrl": "https://...", "pattern": "cheese",
      "discoveredAt": "2026-07-01T03:20:00.000Z", "isFavorite": false
    }
  ]
}
```

### 비고
- `displayName`은 `customName ?? name` — UI엔 이 필드를 그대로 표시하면 됨.
- **언제 쓰나**: 도감 메인 화면(내가 잡은 고양이 목록).

---

## 3-2. 도감 등록

| 항목 | 내용 |
| --- | --- |
| Method | `POST` |
| URL | `/api/collection` |
| 로그인 필요 | O |
| 설명 | 특정 고양이를 내 도감에 등록한다. |

### Request Body
```json
{ "catId": 1, "sightingId": "10" }
```

### Response
```json
{
  "message": "도감에 등록되었습니다.",
  "cat": { "id": "1", "name": "망고", "mainImageUrl": "https://...", "discoveredAt": "2026-07-07T00:00:00.000Z" }
}
```

### 비고
- ⚠️ **`POST /sightings` 성공 시 서버가 자동으로 도감에 등록**하므로, 정상 플로우에서는 프론트가 이 API를 **직접 호출할 일이 없음**. 별도 수동 등록 특수 케이스가 아니면 안 써도 됨.

---

## 3-3. 즐겨찾기 토글

| 항목 | 내용 |
| --- | --- |
| Method | `PATCH` |
| URL | `/api/collection/{catId}/favorite` |
| 로그인 필요 | O |
| 설명 | 도감에 등록된 고양이의 즐겨찾기 상태를 바꾼다. |

### Request Body
```json
{ "isFavorite": true }
```

### Response
```json
{ "catId": "1", "isFavorite": true }
```

### 에러
`404 NOT_FOUND` — 도감에 없는 고양이

### 비고
- **언제 쓰나**: 도감 카드/상세 화면의 하트(즐겨찾기) 버튼 클릭 시.

---

# 4. Gallery API

## 4-1. 내 갤러리 전체 조회

| 항목 | 내용 |
| --- | --- |
| Method | `GET` |
| URL | `/api/gallery/me` |
| 로그인 필요 | O |
| 설명 | 내가 찍은 사진들을 갤러리 형태로 조회한다(고양이별 필터 가능). |

### Query Parameter
| 이름 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `catId` | number | X | 특정 고양이 사진만 필터 |
| `page` | number | X | 기본값 1 |
| `limit` | number | X | 기본값 20, 최대 100 |

### Response
```json
{
  "photos": [
    { "sightingId": "10", "catId": "1", "catName": "망고", "imageUrl": "https://...", "latitude": 36.3726, "longitude": 127.3603, "takenAt": "2026-07-01T12:20:00.000Z", "isRepresentative": false }
  ],
  "pagination": { "page": 1, "limit": 20, "totalCount": 42, "totalPages": 3 }
}
```

### 비고
- 여긴 `sightingId` 필드명 맞음 (위 1-3, 6-3과 다르니 주의 — 엔드포인트마다 필드명이 통일 안 돼있음).
- **언제 쓰나**: 갤러리 탭(내가 찍은 사진 피드), 무한스크롤/페이지네이션 UI.

---

## 4-2. 특정 고양이별 내 갤러리 조회

| 항목 | 내용 |
| --- | --- |
| Method | `GET` |
| URL | `/api/gallery/me/cats/{catId}` |
| 로그인 필요 | O |
| 설명 | 내가 특정 고양이를 찍은 사진만 조회한다. |

### Response
```json
{
  "cat": { "id": "1", "name": "망고", "mainImageUrl": "https://..." },
  "photos": [
    { "sightingId": "10", "imageUrl": "https://...", "latitude": 36.3726, "longitude": 127.3603, "takenAt": "2026-07-01T12:20:00.000Z", "isRepresentative": false }
  ],
  "pagination": { "page": 1, "limit": 20, "totalCount": 5, "totalPages": 1 }
}
```

### 비고
- **언제 쓰나**: 도감 상세 화면 → "내가 찍은 사진 모아보기" 진입.
- `4-1`을 `?catId=` 쿼리로 대체 가능해서, MVP에선 이 엔드포인트 없이 4-1만 써도 충분.

---

# 5. Profile API

## 5-1. 내 프로필 조회

| 항목 | 내용 |
| --- | --- |
| Method | `GET` |
| URL | `/api/profile/me` |
| 로그인 필요 | O |
| 설명 | 내 프로필과 활동 통계를 조회한다. |

### Response
```json
{
  "id": "18", "username": "catlover123", "nickname": "고양이수집가", "email": "catlover123@kaist.ac.kr",
  "profileImageUrl": null, "discoveredCount": 3, "sightingCount": 12, "createdAt": "2026-07-01T00:00:00.000Z"
}
```

### 비고
- **언제 쓰나**: 마이페이지 화면, 혹은 지도 화면 상단 유저 배지("n마리 발견").

---

## 5-2. 프로필 수정

| 항목 | 내용 |
| --- | --- |
| Method | `PATCH` |
| URL | `/api/profile/me` |
| 로그인 필요 | O |
| 설명 | 닉네임/프로필 사진을 수정한다. |

### Request Body
```json
{ "nickname": "새닉네임", "profileImageUrl": "https://..." }
```
둘 다 선택. `profileImageUrl: null`이면 사진 제거.

### Response
```json
{ "id": "18", "username": "catlover123", "nickname": "새닉네임", "email": "...", "profileImageUrl": "https://..." }
```

### 비고
- **언제 쓰나**: 마이페이지 편집 폼 저장 버튼.

---

# 6. Sighting API (핵심 촬영 플로우)

## 6-1. 고양이 사진 업로드

| 항목 | 내용 |
| --- | --- |
| Method | `POST` |
| URL | `/api/sightings` |
| 로그인 필요 | O |
| 설명 | 사진+위치를 업로드하면 서버가 고양이 탐지/식별을 수행하고 결과를 반환한다. |

### Request (`multipart/form-data`)
| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `image` | File | O(`imageUrl`과 양자택일) | jpeg/png/webp, 5MB 이하 |
| `imageUrl` | string | X | 파일 대신 URL로 전달할 때 |
| `latitude` | number | O | 촬영 위치 위도 |
| `longitude` | number | O | 촬영 위치 경도 |
| `catId` | number | X | 테스트용 강제 매칭 |

### Response — `detectionStatus`별로 5가지

**`rejected`** (고양이 아님)
```json
{ "photoId": "1", "sightingId": null, "detectionStatus": "rejected", "cat": null, "message": "고양이가 인식되지 않았습니다." }
```

**`low_quality`** (고양이는 맞으나 화질 문제로 식별 불가 → 다시 찍기 유도)
```json
{ "photoId": "1", "sightingId": null, "detectionStatus": "low_quality", "cat": null, "message": "...", "quality": { "reason": "blurry", "qualityScore": 0.3 } }
```

**`new_cat_candidate`** (신규 고양이로 자동 등록됨)
```json
{
  "photoId": "1", "sightingId": "1", "detectionStatus": "new_cat_candidate", "requiresUserConfirmation": false,
  "cat": { "id": "4", "name": null, "mainImageUrl": null, "isNewCollection": true, "status": "candidate" },
  "message": "새로운 고양이로 등록되었습니다."
}
```
⚠️ `sightingId`가 `null`이 아니라 **실제 값이 들어감** (신규 고양이도 즉시 sighting이 생성되기 때문).

**`needs_user_confirmation`** (AI가 확신 못함 → 후보 선택 필요)
```json
{
  "detectionStatus": "needs_user_confirmation", "requiresUserConfirmation": true, "photoId": "1", "cat": null,
  "candidates": [
    { "catId": "1", "name": "망고", "mainImageUrl": "https://...", "representativePhotoUrl": "https://...",
      "pattern": "cheese", "imageSimilarityScore": 0.65, "locationScore": 0.6, "recentSeenScore": 0.5,
      "patternScore": 0.5, "distanceMeters": 12.3, "finalScore": 0.62, "lastSeenAt": "2026-07-01T12:20:00.000Z" }
  ],
  "newCatOption": { "enabled": true, "label": "처음 보는 고양이 같아요" },
  "message": "비슷한 고양이를 찾았어요. 어떤 고양이인지 선택해주세요."
}
```

**`matched`** (기존 고양이와 확실히 일치)
```json
{ "photoId": "1", "sightingId": "2", "detectionStatus": "matched", "cat": { "id": "1", "name": "망고", "mainImageUrl": "https://...", "isNewCollection": false } }
```

### 비고
- **언제 쓰나**: "고양이 찍기" 카메라 화면의 촬영/제출 버튼.
- `photoId`는 5개 응답 전부에 항상 들어있음.
- `needs_user_confirmation`이면 아래 6-2를 이어서 호출.
- `new_cat_candidate`면 그 직후 위 2-1(`/cats/{catId}/name`)로 이름 짓기 유도.

---

## 6-2. 고양이 후보 확정

| 항목 | 내용 |
| --- | --- |
| Method | `POST` |
| URL | `/api/sightings/{photoId}/confirm-cat` |
| 로그인 필요 | O |
| 설명 | `needs_user_confirmation` 응답을 받았을 때만 호출. 후보 중 하나를 선택하거나 "신규 고양이"로 확정한다. |

### Request Body — 후보 선택
```json
{ "selectedCatId": 1 }
```

### Request Body — "처음 보는 고양이 같아요" 선택
```json
{ "selectedCatId": null, "isNewCatCandidate": true }
```

### Response — 기존 고양이로 확정
```json
{ "detectionStatus": "matched", "photoId": "1", "sightingId": "2", "cat": { "id": "1", "name": "망고", "isNewCollection": false } }
```

### Response — 신규 고양이로 확정
⚠️ `cat: null`이 **아니라**, 6-1의 `new_cat_candidate`와 똑같이 **꽉 찬 cat 객체**가 옴:
```json
{
  "photoId": "1", "sightingId": "2", "detectionStatus": "new_cat_candidate", "requiresUserConfirmation": false,
  "cat": { "id": "5", "name": null, "mainImageUrl": null, "isNewCollection": true, "status": "candidate" },
  "message": "새로운 고양이로 등록되었습니다."
}
```

### 에러
`400 VALIDATION_ERROR`(확인 대기 상태 아니거나, 후보 목록에 없는 catId) / `404 NOT_FOUND`

### 비고
- **언제 쓰나**: 6-1이 `needs_user_confirmation`을 반환했을 때 뜨는 후보 선택 UI에서, 사용자가 후보 카드를 누르거나 "새 고양이예요" 버튼을 누를 때.

---

## 6-3. 내 목격 히스토리 조회

| 항목 | 내용 |
| --- | --- |
| Method | `GET` |
| URL | `/api/sightings/me` |
| 로그인 필요 | O |
| 설명 | 내가 성공적으로 매칭/등록한 목격 기록 목록. |

### Response
```json
{
  "sightings": [
    { "id": "2", "catId": "1", "catName": "망고", "imageUrl": "https://...", "latitude": 36.3726, "longitude": 127.3603, "detectionStatus": "matched", "createdAt": "2026-07-01T12:20:00.000Z" }
  ]
}
```

### 비고
- 필드명 주의: **`id`** 이지 `sightingId`가 아님.
- `rejected`/`low_quality`로 끝난 시도는 여기 안 나옴 (사진 자체는 남지만 sighting이 안 생김).
- **언제 쓰나**: "내 활동 기록" 화면, 혹은 촬영 완료 후 최근 기록 리스트.

---

# 7. Auth 세션 확인

## 7-1. 내 정보 조회 (세션 재검증용)

| 항목 | 내용 |
| --- | --- |
| Method | `GET` |
| URL | `/api/auth/me` |
| 로그인 필요 | O |
| 설명 | 저장된 토큰이 지금도 유효한지 확인한다. |

### Response
```json
{ "id": "18", "username": "catlover123", "nickname": "고양이수집가", "email": "...", "profileImageUrl": null }
```

### Response (토큰 만료/무효 — 401)
```json
{ "message": "인증이 필요합니다.", "code": "UNAUTHORIZED" }
```

### 비고
- **언제 쓰나**: 앱 부팅 시 `hasSession()`이 true면 딱 한 번 호출. 401 받으면 `logout()` 호출 후 로그인 화면으로.
- 지금 프론트는 localStorage에 저장된 유저 정보를 그냥 믿고 쓰는 중이라, 토큰 만료/서버 재시작 시 이후 API 호출들이 전부 401로 실패하기 시작함 — 이 API로 부팅 시 미리 걸러내는 게 목적.

예시 코드:
```js
export const getMe = () => authRequestWithAuth('/api/auth/me')

if (hasSession()) {
  try {
    await getMe()
  } catch (error) {
    if (error.status === 401) await logout()
  }
}
```
