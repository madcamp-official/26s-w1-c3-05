# 26s-w1-c3-05

## 공통과제 I : 웹 기반 프로젝트 (2인 1팀)

**목적:** 공통 과제를 함께 수행하며 웹 개발의 전체 흐름을 빠르게 익히고 협업에 적응하기

**결과물:** 기획부터 배포까지 완료된 웹 서비스와 관련 문서 일체

---

## 팀원

| 이름 | GitHub | 역할 |
|---|---|---|
|  |  |  |
|  |  |  |

---

## 기획안

> 프로젝트 주제, 목적, 핵심 기능, 예상 사용자, 팀원별 역할 등 정리

- **주제: 묘캣몬고는 캠퍼스 곳곳에서 만나는 고양이들을 발견하고, 기록하고, 다른 사람들과 함께 모아가는 3D 지도 기반 고양이 탐색 서비스이다. 사용자는 산책하듯 3D 지도를 스와이프하며 주변 고양이를 찾고, 직접 찍은 사진을 업로드해 캠퍼스 고양이 지도를 함께 완성해 나간다.**
- **목적:고양이 사진을 개인적으로 저장하는 것을 넘어, 위치 정보와 함께 기록하고 주변 고양이들을 공유하는 것을 목적으로 한다. 사용자는 주변 고양이를 발견하고 수집하는 재미를 느낄 수 있다.**
- **핵심 기능: 고양이 사진 촬영 및 업로드, 3D 지도 기반 고양이 위치 탐색, 고양이별 사진 모아보기와 활동 범위 확인, 내 고양이 사진 갤러리, 고양이 외 사진 업로드 경고, 고양이 도감 기능을 제공한다.**
- **예상 사용자: 길고양이를 좋아하고 사진으로 기록하고 싶은 사용자, 주변 고양이의 위치나 활동 범위를 알고 싶은 사용자, 산책이나 등하교 중 만난 고양이를 수집하듯 기록하고 싶은 사용자, 지역 기반으로 고양이 정보를 공유하고 싶은 사용자를 대상으로 한다.**

---

## 기능 명세서

> 구현할 기능을 사용자 관점에서 정리하고, 필수 기능과 선택 기능을 구분

### 필수 기능

- [ ]

### 선택 기능

- [ ]

---

## IA 및 화면 설계서

> 서비스의 전체 페이지 구조와 페이지 간 이동 흐름; 각 페이지의 주요 UI 구성, 입력 요소, 버튼, 사용자 행동 흐름 등을 간단한 와이어프레임 형태로 정리

<!-- Figma 링크 또는 이미지 첨부 -->

---

[Figma 와이어프레임](https://www.figma.com/design/TlUTjkjFJAzOmrYmchn3nz/%EB%AC%98%EC%BA%A3%EB%AA%AC%EA%B3%A0?node-id=3-2&p=f&t=UWYx75Opi0zk6MiR-0)

---

## 🏗️ 시스템 아키텍처

```
[Vercel: Frontend]  →(HTTPS API)→  [Cloudflare Tunnel]  →  [kcloud VM]
                                                              ├─ backend (Express)
                                                              ├─ vision (YOLO11n)
                                                              └─ postgres
```

#### 프론트엔드
- **Vite + Vanilla JS/TS**, MapLibre GL로 지도 기반 UI (`kaist-map`, `frontend/`)
- Google Identity(OAuth), Kakao 로그인(REST API 키 + redirect URI) 연동
- 배포: **Vercel** (`vercel.json`에 SPA rewrite 설정)
- API 통신은 `VITE_API_BASE_URL` 환경변수로 백엔드를 가리킴 (배포 시 HTTPS 필수, mixed-content 방지)

#### 백엔드
- **Node.js + Express 5 + TypeScript** (`backend/`), `tsx`로 개발, `tsc` 빌드
- 인증: JWT + bcrypt + Google OAuth(`google-auth-library`)
- 이메일: nodemailer (SMTP 또는 mock provider)
- 파일 업로드: multer → `/uploads` 볼륨 저장, 절대 URL로 변환해 응답
- API 문서: swagger-ui-express
- 비전 파이프라인 호출을 위해 **Vision Service**(별도 컨테이너)와 HTTP로 통신

#### Vision Service (보조 백엔드)
- **Python + YOLO11n** 기반 고양이 탐지/식별 서비스 (`vision-service/`)
- 별도 Docker 컨테이너로 분리, `VISION_SERVICE_URL`을 통해 backend가 호출
- 임베딩은 pgvector 미사용으로 `float[]` 컬럼에 저장

#### 데이터베이스
- **PostgreSQL 16** (Docker 컨테이너, `myocatmongo` DB)
- 스키마/마이그레이션은 `backend/src/db` 관리 (`db:migrate`, `db:seed` 스크립트)
- 로컬 개발: `localhost:5432`, 프로덕션: compose 네트워크 내부 `postgres:5432`로 접속

#### 인프라
- **kcloud VM** 위에서 `docker-compose`로 4개 컨테이너 운영: `postgres`, `vision`, `backend`, `cloudflared`
- **Cloudflare Tunnel**로 인바운드 포트/방화벽 설정 없이 backend를 외부에 공개 (아웃바운드 전용 연결)
- Docker 네트워크 MTU를 1450으로 수동 설정 (VXLAN 오버레이 환경 대응, 안 하면 큰 페이로드 패킷 드랍)
- 프론트엔드만 Vercel에 별도 배포, 백엔드/DB/비전은 kcloud VM에 자체 호스팅하는 하이브리드 구조

---

## 🗄️ DB 스키마

#### 사용자/인증
- `users` — 계정 정보(로컬/소셜 로그인, 닉네임, exp/level 캐시)
- `email_verifications` — 회원가입 이메일 인증 코드
- `refresh_tokens` — JWT 리프레시 토큰

#### 고양이 도감 핵심
- `cats` — 고양이 개체 정보(이름, 패턴, 기본 위치, 대표 사진, 3D 모델 키)
- `campus_zones` — 캠퍼스 내 건물/구역(좌표, 반경, 3D 모델 타입, 회전값)
- `cat_placements` — 지도 위 고양이 실시간 배치/애니메이션 상태(1 cat = 1 row)

#### 사진/탐지 파이프라인
- `cat_photos` — 업로드된 사진(위치, 탐지 신뢰도, crop/bbox, 식별 상태)
- `cat_photo_embeddings` — 식별용 임베딩 벡터(pgvector 미사용, float 배열로 저장)
- `cat_identification_candidates` — 사진↔고양이 매칭 후보 및 스코어(유사도/위치/패턴 등)
- `cat_sightings` — 특정 고양이의 목격 기록(사진과 연결)

#### 유저 진행/수집 요소
- `user_cat_collections` — 유저별 도감 수집 현황(최초 발견일, 즐겨찾기, 커스텀 닉네임)
- `bush_clues` — 미수집 고양이의 "덤불" 힌트 조각(유저×고양이당 1개 고정)
- `user_exp_events` — 경험치 지급 이벤트 로그(레벨링 시스템, 아직 미연동 기능)

---

## 📡 API 문서

| Method | Endpoint | 인증 | 설명 |
|---|---|:---:|---|
| GET | `/health` | | 헬스체크 |
| POST | `/auth/signup/send-code` | | 이메일 인증코드 발송 |
| POST | `/auth/signup` | | 코드 검증 + 가입 |
| POST | `/auth/login` | | 로그인 |
| POST | `/auth/guest` | | 게스트 계정 생성 |
| POST | `/auth/google` | | 구글 OAuth |
| POST | `/auth/kakao` | | 카카오 OAuth |
| GET | `/auth/me` | 🔒 | 세션 검증 |
| POST | `/auth/logout` | 🔒 | 로그아웃 |
| POST | **`/sightings`** | 🔒 | **사진 업로드 → 감지·식별.** multipart. `captureMode`=`real_camera`\|`virtual_3d` |
| GET | `/sightings/me` | 🔒 | 내 목격 기록 (+`placement`) |
| POST | `/sightings/:photoId/confirm-cat` | 🔒 | 후보 중 고양이 확정 |
| GET | `/map/cats` | 🔒 | 반경 내 고양이 (구버전) |
| GET | `/map/objects` | 🔒 | 반경 내 건물/캣타워 |
| GET | **`/map/cat-actors`** | 🔒 | **3D 액터 + 마커 소스.** `includeUndiscovered` |
| GET | `/cats` | 🔒 | 전체 고양이 |
| GET | `/cats/:catId` | 🔒 | 고양이 상세 |
| GET | `/cats/:catId/sightings` | 🔒 | 고양이별 목격 기록 |
| PATCH | `/cats/:catId/name` | 🔒 | 신규 후보 이름 짓기 (발견자만) |
| PATCH | `/cats/:catId/nickname` | 🔒 | 내 도감 별명 |
| POST | `/cats/:catId/bush-clue` | 🔒 | 수풀 힌트 저장 |
| GET | `/collection` | 🔒 | 내 도감 |
| POST | `/collection` | 🔒 | 도감 등록 |
| PATCH | `/collection/:catId/favorite` | 🔒 | 즐겨찾기 |
| GET | `/gallery/me` | 🔒 | 내 사진첩 |
| GET | `/gallery/me/cats/:catId` | 🔒 | 고양이별 사진첩 |
| GET | `/profile/me` | 🔒 | 프로필 |
| PATCH | `/profile/me` | 🔒 | 닉네임 변경 |
| POST | `/profile/me/image` | 🔒 | 프로필 이미지 |
| GET | `/rankings` | 🔒 | 랭킹 |
| POST | `/admin/cats` | 👑 | 고양이 생성 |
| PATCH | `/admin/cats/:catId` | 👑 | 고양이 수정 |
| GET | `/admin/cat-candidates` | 👑 | 후보 목록 |
| POST | `/admin/cat-candidates/:catId/approve` | 👑 | 후보 승인 |
| POST | `/admin/cat-candidates/:catId/merge` | 👑 | 후보 병합 |

> 🔒 로그인 필요 · 👑 관리자 권한 필요

---

## 배포 결과물

> 접속 가능한 링크, 실행 방법, 주요 구현 내용

- **서비스 URL:**
- **실행 방법:**

```bash
# 실행 방법 작성
```

---

## 회고 문서

> 개발 과정에서의 어려움, 해결 방법, 역할 분담, 다음에 개선할 점 (KPT 방법론 참고)

### Keep

### Problem

### Try

---

## 참고 자료

- [SDD(스펙 주도 개발) 이해하기](https://news.hada.io/topic?id=21338)
- [Software Design Document Best Practices](https://www.atlassian.com/work-management/project-management/design-document)
- [IA 정보구조도 작성 방법](https://brunch.co.kr/@nyonyo/7)
- [기획자 화면설계서 작성법](https://brunch.co.kr/@soup/10)
- [Figma 와이어프레임 가이드](https://www.figma.com/ko-kr/resource-library/what-is-wireframing/)
- [무료 Figma 와이어프레임 키트](https://www.figma.com/ko-kr/templates/wireframe-kits/)
- [ERD/DB 설계 총정리](https://inpa.tistory.com/entry/DB-%F0%9F%93%9A-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EB%AA%A8%EB%8D%B8%EB%A7%81-%EA%B0%9C%EB%85%90-ERD-%EB%8B%A4%EC%9D%B4%EC%96%B4%EA%B7%B8%EB%9E%A8)
- [API 명세서 작성 가이드라인](https://velog.io/@sebinChu/BackEnd-API-%EB%AA%85%EC%84%B8%EC%84%9C-%EC%9E%91%EC%84%B1-%EA%B0%80%EC%9D%B4%EB%93%9C-%EB%9D%BC%EC%9D%B8)
- [좋은 README 작성하는 방법](https://velog.io/@sabo/good-readme)
- [단기 프로젝트 회고 KPT 방법론](https://velog.io/@habwa/%EB%8B%A8%EA%B8%B0-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%ED%9A%8C%EA%B3%A0-KPT-%EB%B0%A9%EB%B2%95%EB%A1%A0)
