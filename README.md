# 26s-w1-c3-05

## 공통과제 I : 웹 기반 프로젝트 (2인 1팀)

**목적:** 공통 과제를 함께 수행하며 웹 개발의 전체 흐름을 빠르게 익히고 협업에 적응하기

**결과물:** 기획부터 배포까지 완료된 웹 서비스와 관련 문서 일체

---

## 팀원

| 이름 | GitHub | 역할 |
|---|---|---|
| 임성진 |  | 백엔드, 3D 모델링 |
| 양호성 |  | 프론트엔트, UI |

---

## 기획안

> 프로젝트 주제, 목적, 핵심 기능, 예상 사용자, 팀원별 역할 등 정리

# 캣치미 CATchME
## 카이스트의 고양이들과 만나고, 사진으로 기록하고, 나만의 도감을 완성해보세요!

- **주제: 캣치미(CATchME)는 캠퍼스 곳곳에서 만나는 고양이들을 발견하고, 기록하고, 다른 사람들과 함께 공유하는 3D 지도 기반 웹 서비스입니다. 사용자는 3D 지도를 둘러보며 주변의 고양이들을 찾고, 직접 찍은 사진을 업로드해 고양이 도감을 완성해 나갑니다.**
- **목적: 고양이 사진을 찍고, 위치 정보와 함께 기록하고 다른 사람들과 공유합니다. 사용자는 주변 고양이를 발견하고 도감을 채워갑니다.**
- **핵심 기능: 고양이 사진 촬영 및 업로드, 3D 지도 기반 고양이 위치 탐색, 고양이별 사진 모아보기와 활동 범위 확인, 나의 고양이 도감 기능을 제공합니다.**
- **예상 사용자: 카이스트의 고양이들을 사랑하고 사진으로 기록하고 싶은 사용자, 고양이와 만나며 힐링을 하고 싶은 사용자, 고양이 사진을 공유하고는 싶지만 인스타는 귀찮은 사용자.**

---

## 기능 명세서

> 구현할 기능을 사용자 관점에서 정리하고, 필수 기능과 선택 기능을 구분

<table>
<colgroup>
  <col style="width:14%">
  <col style="width:20%">
  <col style="width:66%">
</colgroup>
<thead>
  <tr><th>화면</th><th>기능</th><th>설명</th></tr>
</thead>
<tbody>
  <tr><td nowrap>로그인 화면</td><td>이메일/구글/카카오톡 로그인</td><td>이메일, 카카오톡, Google OAuth를 연동하여 간편하게 로그인할 수 있습니다.</td></tr>
  <tr><td></td><td>로그인 없이 둘러보기</td><td>로그인 없이 게스트로 서비스를 이용할 수 있습니다.</td></tr>
  <tr><td nowrap>고양이 지도</td><td>항공뷰</td><td>카이스트 전체 지도를 볼 수 있습니다. 사람들이 찍은 고양이 사진들이 위치와 함께 마커로 표시됩니다. 마커를 누르면 사진을 자세히 볼 수 있습니다.</td></tr>
  <tr><td></td><td>로드뷰</td><td>아바타 시점으로 카이스트 캠퍼스를 둘러볼 수 있습니다. 사람들이 촬영한 고양이들이 3D 모델로 나타납니다.</td></tr>
  <tr><td></td><td>촬영</td><td>고양이 사진을 촬영합니다</td></tr>
  <tr><td></td><td>내 고양이</td><td>내가 찍은 고양이 사진들을 둘러봅니다</td></tr>
  <tr><td></td><td>사이드바</td><td>사이드바 메뉴를 엽니다</td></tr>
  <tr><td></td><td>BGM</td><td>BGM ON/OFF 버트입니다</td></tr>

  <tr><td nowrap>사이드바</td><td>고양이 도감</td><td>발견한 고양이 도감을 볼 수 있습니다</td></tr>
  <tr><td></td><td>도움말</td><td>사용 설명서입니다</td></tr>
  <tr><td></td><td>설정</td><td>닉네임과 프로필 사진을 변경할 수 있습니다.</td></tr>
  <tr><td></td><td>로그아웃</td><td>로그아웃 합니다</td></tr>
  <tr><td nowrap>고양이 도감</td><td>발견한 고양이 둘러보기</td><td>어떤 고양이를 언제 어디서 만났는지, 몇 번 만났는지 등 기록을 확인합니다</td></tr>
</tbody>
</table>

---

## IA 및 화면 설계서

> 서비스의 전체 페이지 구조와 페이지 간 이동 흐름; 각 페이지의 주요 UI 구성, 입력 요소, 버튼, 사용자 행동 흐름 등을 간단한 와이어프레임 형태로 정리

- **정보 구조도 (IA) 및 다이어그램:** [information-architecture.md](file:///c:/Users/user/2026-project/kaist_madcamp/week1-remote/docs/information-architecture.md)
- **Figma 디자인:** [Figma 링크](https://www.figma.com/design/TlUTjkjFJAzOmrYmchn3nz/%EB%AC%98%EC%BA%A3%EB%AA%AC%EA%B3%A0?node-id=3-2&p=f&t=UWYx75Opi0zk6MiR-0)

---
!KakaoTalk_Photo_2026-07-08-23-55-38_cropped.png


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

## URL
- **https://catchme-rosy.vercel.app/**

## 회고 문서

> 개발 과정에서의 어려움, 해결 방법, 역할 분담, 다음에 개선할 점 (KPT 방법론 참고)

### Keep 
- **Blender를 활용한 3D 모델링이 좋았다. Shout out to 성진**
- **지도 API의 범용성을 활용해 어렵지 않게 디자인을 할 수 있었다. 바닥 텍스쳐와 스카이박스를 이용해 적은 용량으로도 예쁜 디자인이 가능했다**
### Problem
- **프론트엔드/백엔드 분업을 엄밀하게 하지 못해 비효율적인 부분이 있었다**
- **프로젝트 시작 단계에서 계획을 세밀한 단계까지 세우지 못해 마무리 단계에서 혼동이 발생했다**
### Try
- **웹 상에서 3D 모델을 구동할 때 최적화를 통해 속도 개선**
- **2명 이상의 사용자 아바타를 동시에 시연**
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
