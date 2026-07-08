# DB 테이블 명세서

- DBMS: PostgreSQL
- 스키마 원본: [backend/src/db/schema.sql](../backend/src/db/schema.sql)
- 원본 파일은 `CREATE TABLE` + 이후 `ALTER TABLE ADD COLUMN` 마이그레이션 방식으로 작성되어 있으며, 본 문서의 SQL은 **모든 ALTER가 반영된 최종 형태**로 정리한 것이다.

## 테이블 목록

| # | 테이블명 | 설명 |
|---|---------|------|
| 1 | `users` | 서비스 사용자 계정 (로컬/소셜 로그인, 경험치·레벨 캐시 포함) |
| 2 | `email_verifications` | 회원가입 이메일 인증 코드 |
| 3 | `refresh_tokens` | JWT 리프레시 토큰 저장소 |
| 4 | `campus_zones` | 캠퍼스 구역(건물/장소) 정보 및 3D 모델 배치 정보 |
| 5 | `cats` | 캠퍼스 고양이 개체(마스터) 정보 |
| 6 | `cat_photos` | 사용자가 업로드한 고양이 사진 + 비전 파이프라인 판별 결과 |
| 7 | `cat_sightings` | 고양이 목격 기록 (사진 1장 = 목격 1건) |
| 8 | `cat_placements` | 지도 위 고양이 3D 액터의 현재 배치/애니메이션 상태 (고양이당 1행) |
| 9 | `user_cat_collections` | 사용자별 고양이 도감(컬렉션) |
| 10 | `cat_identification_candidates` | 사진별 고양이 식별 후보 및 점수 상세 |
| 11 | `cat_photo_embeddings` | 사진 크롭 이미지의 임베딩 벡터 (개체 식별 검색용) |
| 12 | `user_exp_events` | 경험치 획득 이벤트 로그 (레벨 시스템의 원천 데이터) |

---

## 1. `users` — 사용자

서비스 사용자 계정 테이블. 이메일/비밀번호(local) 가입과 소셜 로그인(OAuth) 계정을 모두 담는다. `exp`/`level`은 `user_exp_events` 로그로부터 갱신되는 비정규화 캐시이다.

```sql
CREATE TABLE users (
  id                 BIGSERIAL PRIMARY KEY,
  username           VARCHAR(50)  NOT NULL UNIQUE,
  password_hash      VARCHAR(255) NOT NULL,
  email              VARCHAR(255) NULL,
  auth_provider      VARCHAR(20)  NOT NULL DEFAULT 'local',
  provider_user_id   VARCHAR(255) NULL,
  nickname           VARCHAR(50)  NOT NULL,
  nickname_onboarded BOOLEAN      NOT NULL DEFAULT TRUE,
  profile_image_url  TEXT         NULL,
  role               VARCHAR(20)  NOT NULL DEFAULT 'user',
  exp                INT          NOT NULL DEFAULT 0,
  level              INT          NOT NULL DEFAULT 1,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_users_email ON users(email);
CREATE UNIQUE INDEX idx_users_oauth_provider_user_id
  ON users(auth_provider, provider_user_id)
  WHERE provider_user_id IS NOT NULL;
```

| 속성 | 타입 | Null | 기본값 | 설명 |
|------|------|:----:|--------|------|
| `id` | BIGSERIAL | N | 자동 증가 | 사용자 고유 ID (PK) |
| `username` | VARCHAR(50) | N | — | 로그인 아이디 (UNIQUE) |
| `password_hash` | VARCHAR(255) | N | — | bcrypt 해시된 비밀번호 (소셜 계정은 더미 값) |
| `email` | VARCHAR(255) | Y | — | 가입 인증에 사용한 이메일. UNIQUE 인덱스 (NULL은 중복 허용 → 레거시 행 공존 가능) |
| `auth_provider` | VARCHAR(20) | N | `'local'` | 인증 제공자 (`local` = 이메일/비밀번호, 그 외 소셜 로그인 제공자명) |
| `provider_user_id` | VARCHAR(255) | Y | — | 소셜 제공자 측 사용자 ID. `(auth_provider, provider_user_id)` 부분 UNIQUE |
| `nickname` | VARCHAR(50) | N | — | 표시용 닉네임 |
| `nickname_onboarded` | BOOLEAN | N | `TRUE` | 닉네임 설정(온보딩) 완료 여부. 소셜 가입 직후 임시 닉네임이면 FALSE |
| `profile_image_url` | TEXT | Y | — | 프로필 이미지 URL |
| `role` | VARCHAR(20) | N | `'user'` | 권한 (`user` / `admin`) |
| `exp` | INT | N | `0` | 누적 경험치 (비정규화 캐시, 원본은 `user_exp_events`) |
| `level` | INT | N | `1` | 현재 레벨 (비정규화 캐시) |
| `created_at` | TIMESTAMPTZ | N | 현재 시각 | 생성 시각 |
| `updated_at` | TIMESTAMPTZ | N | 현재 시각 | 수정 시각 |

---

## 2. `email_verifications` — 이메일 인증 코드

회원가입 전에 이메일 소유를 증명하기 위해 발송되는 단기 인증 코드 저장 테이블.

```sql
CREATE TABLE email_verifications (
  id          BIGSERIAL PRIMARY KEY,
  email       VARCHAR(255) NOT NULL,
  code_hash   VARCHAR(255) NOT NULL,
  expires_at  TIMESTAMPTZ  NOT NULL,
  consumed_at TIMESTAMPTZ  NULL,
  attempts    INT          NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_email_verifications_email_created_at
  ON email_verifications(email, created_at DESC);
```

| 속성 | 타입 | Null | 기본값 | 설명 |
|------|------|:----:|--------|------|
| `id` | BIGSERIAL | N | 자동 증가 | 고유 ID (PK) |
| `email` | VARCHAR(255) | N | — | 인증 대상 이메일 주소 |
| `code_hash` | VARCHAR(255) | N | — | 발송한 인증 코드의 해시 (평문 미저장) |
| `expires_at` | TIMESTAMPTZ | N | — | 코드 만료 시각 |
| `consumed_at` | TIMESTAMPTZ | Y | — | 인증 성공(코드 사용) 시각. NULL이면 미사용 |
| `attempts` | INT | N | `0` | 코드 입력 시도 횟수 (무차별 대입 방지용) |
| `created_at` | TIMESTAMPTZ | N | 현재 시각 | 발송 시각 |

---

## 3. `refresh_tokens` — 리프레시 토큰

로그인 세션 유지를 위한 리프레시 토큰 저장 테이블. 토큰 원문 대신 해시를 저장한다.

```sql
CREATE TABLE refresh_tokens (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT       NOT NULL REFERENCES users(id),
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ  NOT NULL,
  revoked_at TIMESTAMPTZ  NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

| 속성 | 타입 | Null | 기본값 | 설명 |
|------|------|:----:|--------|------|
| `id` | BIGSERIAL | N | 자동 증가 | 고유 ID (PK) |
| `user_id` | BIGINT | N | — | 토큰 소유 사용자 (FK → `users.id`) |
| `token_hash` | VARCHAR(255) | N | — | 리프레시 토큰 해시 |
| `expires_at` | TIMESTAMPTZ | N | — | 토큰 만료 시각 |
| `revoked_at` | TIMESTAMPTZ | Y | — | 폐기(로그아웃/재발급) 시각. NULL이면 유효 |
| `created_at` | TIMESTAMPTZ | N | 현재 시각 | 발급 시각 |

---

## 4. `campus_zones` — 캠퍼스 구역

캠퍼스 내 건물/장소 구역 정보. 지도 위 3D 건물 모델 배치와 사진의 구역 매핑(반경 판정)에 쓰인다.

```sql
CREATE TABLE campus_zones (
  id            BIGSERIAL PRIMARY KEY,
  name          VARCHAR(100)   NOT NULL,
  type          VARCHAR(30)    NOT NULL,
  latitude      DECIMAL(10, 7) NOT NULL,
  longitude     DECIMAL(10, 7) NOT NULL,
  radius_meters INT            NOT NULL,
  model_type    VARCHAR(50)    NULL,
  description   TEXT           NULL,
  rotation_y    DECIMAL(6, 4)  NOT NULL DEFAULT (random() * 2 * pi()),
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

| 속성 | 타입 | Null | 기본값 | 설명 |
|------|------|:----:|--------|------|
| `id` | BIGSERIAL | N | 자동 증가 | 구역 고유 ID (PK) |
| `name` | VARCHAR(100) | N | — | 구역 이름 (예: 중앙도서관) |
| `type` | VARCHAR(30) | N | — | 구역 유형 (예: `library`, `dorm` 등 건물/장소 분류) |
| `latitude` | DECIMAL(10,7) | N | — | 구역 중심 위도 |
| `longitude` | DECIMAL(10,7) | N | — | 구역 중심 경도 |
| `radius_meters` | INT | N | — | 구역 반경(m). 사진 좌표 → 구역 매핑 판정에 사용 |
| `model_type` | VARCHAR(50) | Y | — | 지도에 렌더링할 3D 모델 유형 (예: `building`) |
| `description` | TEXT | Y | — | 구역 설명 |
| `rotation_y` | DECIMAL(6,4) | N | `random()*2π` | 건물(캣타워) 모델의 Y축 회전각(라디안). 행 생성 시 무작위 부여되어 건물마다 방향이 달라짐 |
| `created_at` | TIMESTAMPTZ | N | 현재 시각 | 생성 시각 |
| `updated_at` | TIMESTAMPTZ | N | 현재 시각 | 수정 시각 |

---

## 5. `cats` — 고양이 개체

캠퍼스에서 식별된 고양이 개체의 마스터 테이블. 공식 이름/성격 등은 관리자 소유이며, 사용자별 애칭은 `user_cat_collections.custom_name`에 저장된다.

```sql
CREATE TABLE cats (
  id                       BIGSERIAL PRIMARY KEY,
  name                     VARCHAR(50)    NULL,
  description              TEXT           NULL,
  representative_photo_id  BIGINT         NULL,
  representative_photo_url TEXT           NULL,
  first_seen_at            TIMESTAMPTZ    NULL,
  last_seen_at             TIMESTAMPTZ    NULL,
  pattern                  VARCHAR(30)    NULL,
  personality              TEXT           NULL,
  default_latitude         DECIMAL(10, 7) NULL,
  default_longitude        DECIMAL(10, 7) NULL,
  default_zone_id          BIGINT         NULL REFERENCES campus_zones(id),
  status                   VARCHAR(20)    NOT NULL DEFAULT 'active',
  model_key                VARCHAR(40)    NULL,
  created_at               TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

| 속성 | 타입 | Null | 기본값 | 설명 |
|------|------|:----:|--------|------|
| `id` | BIGSERIAL | N | 자동 증가 | 고양이 고유 ID (PK) |
| `name` | VARCHAR(50) | Y | — | 공식 이름 (관리자 지정) |
| `description` | TEXT | Y | — | 고양이 소개/설명 |
| `representative_photo_id` | BIGINT | Y | — | 대표 사진 ID (`cat_photos.id` 참조 — FK 제약 없이 논리 참조) |
| `representative_photo_url` | TEXT | Y | — | 대표 사진 URL (조회 편의용 비정규화) |
| `first_seen_at` | TIMESTAMPTZ | Y | — | 최초 목격 시각 |
| `last_seen_at` | TIMESTAMPTZ | Y | — | 최근 목격 시각 |
| `pattern` | VARCHAR(30) | Y | — | 털 무늬 분류 (예: 치즈, 삼색 등). 식별 점수 계산에도 사용 |
| `personality` | TEXT | Y | — | 성격 설명 |
| `default_latitude` | DECIMAL(10,7) | Y | — | 기본(대표) 서식 위치 위도 |
| `default_longitude` | DECIMAL(10,7) | Y | — | 기본(대표) 서식 위치 경도 |
| `default_zone_id` | BIGINT | Y | — | 기본 서식 구역 (FK → `campus_zones.id`) |
| `status` | VARCHAR(20) | N | `'active'` | 개체 상태 (`active` 등, 비활성/사망 처리용) |
| `model_key` | VARCHAR(40) | Y | — | 지도에서 이 고양이를 표현할 재사용 3D 모델 키 (무늬/색 기반 선택, `lib/catModels` 참조) |
| `created_at` | TIMESTAMPTZ | N | 현재 시각 | 생성 시각 |
| `updated_at` | TIMESTAMPTZ | N | 현재 시각 | 수정 시각 |

---

## 6. `cat_photos` — 고양이 사진

사용자가 업로드한 사진과 비전 파이프라인(탐지 → 크롭 → 품질 → 식별)의 결과 메타데이터를 함께 저장한다.

```sql
CREATE TABLE cat_photos (
  id                            BIGSERIAL PRIMARY KEY,
  user_id                       BIGINT         NOT NULL REFERENCES users(id),
  cat_id                        BIGINT         NULL REFERENCES cats(id),
  image_url                     TEXT           NOT NULL,
  latitude                      DECIMAL(10, 7) NOT NULL,
  longitude                     DECIMAL(10, 7) NOT NULL,
  zone_id                       BIGINT         NULL REFERENCES campus_zones(id),
  taken_at                      TIMESTAMPTZ    NOT NULL,
  uploaded_at                   TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_cat                        BOOLEAN        NOT NULL DEFAULT TRUE,
  cat_detection_confidence      DECIMAL(5, 4)  NULL,
  cat_identification_confidence DECIMAL(5, 4)  NULL,
  is_gallery_visible            BOOLEAN        NOT NULL DEFAULT TRUE,
  is_representative             BOOLEAN        NOT NULL DEFAULT FALSE,
  identification_status         VARCHAR(30)    NOT NULL DEFAULT 'pending',
  crop_image_url                TEXT           NULL,
  detection_bbox_json           JSONB          NULL,
  quality_score                 DECIMAL(5, 4)  NULL,
  created_at                    TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cat_photos_user_taken_at ON cat_photos(user_id, taken_at);
CREATE INDEX idx_cat_photos_cat_taken_at  ON cat_photos(cat_id, taken_at);
```

| 속성 | 타입 | Null | 기본값 | 설명 |
|------|------|:----:|--------|------|
| `id` | BIGSERIAL | N | 자동 증가 | 사진 고유 ID (PK) |
| `user_id` | BIGINT | N | — | 업로더 (FK → `users.id`) |
| `cat_id` | BIGINT | Y | — | 식별된 고양이 (FK → `cats.id`). 미식별이면 NULL |
| `image_url` | TEXT | N | — | 원본 이미지 URL |
| `latitude` | DECIMAL(10,7) | N | — | 촬영 위치 위도 |
| `longitude` | DECIMAL(10,7) | N | — | 촬영 위치 경도 |
| `zone_id` | BIGINT | Y | — | 촬영 위치가 속한 구역 (FK → `campus_zones.id`) |
| `taken_at` | TIMESTAMPTZ | N | — | 촬영 시각 |
| `uploaded_at` | TIMESTAMPTZ | N | 현재 시각 | 업로드 시각 |
| `is_cat` | BOOLEAN | N | `TRUE` | 고양이 탐지 여부 (탐지 모델 판정 결과) |
| `cat_detection_confidence` | DECIMAL(5,4) | Y | — | 고양이 탐지 신뢰도 (0~1) |
| `cat_identification_confidence` | DECIMAL(5,4) | Y | — | 개체 식별 신뢰도 (0~1, 매칭 시 최종 점수) |
| `is_gallery_visible` | BOOLEAN | N | `TRUE` | 갤러리 공개 여부 |
| `is_representative` | BOOLEAN | N | `FALSE` | 해당 고양이의 대표 사진 여부 |
| `identification_status` | VARCHAR(30) | N | `'pending'` | 식별 상태: `pending` / `matched` / `needs_user_confirmation` / `new_cat_candidate` / `rejected`(고양이 아님) / `low_quality` / `admin_review` / `failed` |
| `crop_image_url` | TEXT | Y | — | 탐지 결과로 잘라낸 고양이 크롭 이미지 URL |
| `detection_bbox_json` | JSONB | Y | — | 탐지 바운딩 박스 좌표 JSON |
| `quality_score` | DECIMAL(5,4) | Y | — | 크롭 이미지 품질 점수 (0~1, 낮으면 `low_quality` 처리) |
| `created_at` | TIMESTAMPTZ | N | 현재 시각 | 생성 시각 |

---

## 7. `cat_sightings` — 목격 기록

고양이 식별에 성공한 사진 1장당 1건씩 생성되는 목격 이벤트. 고양이 동선/최근 위치 계산의 원천이 된다.

```sql
CREATE TABLE cat_sightings (
  id         BIGSERIAL PRIMARY KEY,
  cat_id     BIGINT         NOT NULL REFERENCES cats(id),
  user_id    BIGINT         NOT NULL REFERENCES users(id),
  photo_id   BIGINT         NOT NULL REFERENCES cat_photos(id),
  latitude   DECIMAL(10, 7) NOT NULL,
  longitude  DECIMAL(10, 7) NOT NULL,
  zone_id    BIGINT         NULL REFERENCES campus_zones(id),
  seen_at    TIMESTAMPTZ    NOT NULL,
  created_at TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cat_sightings_cat_seen_at      ON cat_sightings(cat_id, seen_at);
CREATE INDEX idx_cat_sightings_user_created_at  ON cat_sightings(user_id, created_at);
```

| 속성 | 타입 | Null | 기본값 | 설명 |
|------|------|:----:|--------|------|
| `id` | BIGSERIAL | N | 자동 증가 | 목격 고유 ID (PK) |
| `cat_id` | BIGINT | N | — | 목격된 고양이 (FK → `cats.id`) |
| `user_id` | BIGINT | N | — | 목격자 (FK → `users.id`) |
| `photo_id` | BIGINT | N | — | 근거 사진 (FK → `cat_photos.id`) |
| `latitude` | DECIMAL(10,7) | N | — | 목격 위치 위도 |
| `longitude` | DECIMAL(10,7) | N | — | 목격 위치 경도 |
| `zone_id` | BIGINT | Y | — | 목격 구역 (FK → `campus_zones.id`) |
| `seen_at` | TIMESTAMPTZ | N | — | 목격(촬영) 시각 |
| `created_at` | TIMESTAMPTZ | N | 현재 시각 | 기록 생성 시각 |

---

## 8. `cat_placements` — 지도 배치 상태

지도(3D 맵) 위에 고양이 액터를 어디에, 어떤 자세/애니메이션으로 렌더링할지 담는 런타임 상태 테이블. **고양이당 1행**(`cat_id` UNIQUE)이며 최신 목격을 반영해 갱신된다.

```sql
CREATE TABLE cat_placements (
  id                     BIGSERIAL PRIMARY KEY,
  cat_id                 BIGINT         NOT NULL UNIQUE REFERENCES cats(id),
  source_sighting_id     BIGINT         NULL REFERENCES cat_sightings(id),
  latitude               DECIMAL(10, 7) NOT NULL,
  longitude              DECIMAL(10, 7) NOT NULL,
  zone_id                BIGINT         NULL REFERENCES campus_zones(id),
  surface                VARCHAR(30)    NOT NULL DEFAULT 'ground',
  anchor_key             VARCHAR(50)    NULL,
  height_offset_meters   DECIMAL(7, 2)  NOT NULL DEFAULT 0,
  movement_radius_meters DECIMAL(7, 2)  NOT NULL DEFAULT 4,
  animation_key          VARCHAR(50)    NOT NULL DEFAULT 'idle',
  animation_started_at   TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  animation_expires_at   TIMESTAMPTZ    NULL,
  selected_at            TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cat_placements_updated_at ON cat_placements(updated_at);
```

| 속성 | 타입 | Null | 기본값 | 설명 |
|------|------|:----:|--------|------|
| `id` | BIGSERIAL | N | 자동 증가 | 배치 고유 ID (PK) |
| `cat_id` | BIGINT | N | — | 대상 고양이 (FK → `cats.id`, UNIQUE — 고양이당 1행) |
| `source_sighting_id` | BIGINT | Y | — | 이 배치의 근거가 된 목격 (FK → `cat_sightings.id`) |
| `latitude` | DECIMAL(10,7) | N | — | 배치 위도 |
| `longitude` | DECIMAL(10,7) | N | — | 배치 경도 |
| `zone_id` | BIGINT | Y | — | 배치 구역 (FK → `campus_zones.id`) |
| `surface` | VARCHAR(30) | N | `'ground'` | 앉는 면: `ground` / `roof` / `bench` / `custom` |
| `anchor_key` | VARCHAR(50) | Y | — | 모델 내 앵커 지점 키 (예: `roof_center`, `roof_edge`, `entrance`) |
| `height_offset_meters` | DECIMAL(7,2) | N | `0` | 지면 기준 높이 오프셋(m) — 지붕 위 배치 등 |
| `movement_radius_meters` | DECIMAL(7,2) | N | `4` | 배치 지점 주변 배회 반경(m) |
| `animation_key` | VARCHAR(50) | N | `'idle'` | 재생할 애니메이션 클립 키 (`idle` / `sit` / `walk` / `sleep` 등) |
| `animation_started_at` | TIMESTAMPTZ | N | 현재 시각 | 현재 애니메이션 시작 시각 |
| `animation_expires_at` | TIMESTAMPTZ | Y | — | 애니메이션 종료 예정 시각. NULL이면 무기한 |
| `selected_at` | TIMESTAMPTZ | N | 현재 시각 | 이 배치가 선택된 시각 |
| `updated_at` | TIMESTAMPTZ | N | 현재 시각 | 수정 시각 |

---

## 9. `user_cat_collections` — 사용자 도감

사용자가 발견(수집)한 고양이 목록. 사용자-고양이 쌍당 1행(`UNIQUE(user_id, cat_id)`).

```sql
CREATE TABLE user_cat_collections (
  id                      BIGSERIAL PRIMARY KEY,
  user_id                 BIGINT      NOT NULL REFERENCES users(id),
  cat_id                  BIGINT      NOT NULL REFERENCES cats(id),
  first_discovered_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at            TIMESTAMPTZ NULL,
  discovery_photo_id      BIGINT      NULL REFERENCES cat_photos(id),
  representative_photo_id BIGINT      NULL REFERENCES cat_photos(id),
  is_favorite             BOOLEAN     NOT NULL DEFAULT FALSE,
  custom_name             VARCHAR(50) NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, cat_id)
);
```

| 속성 | 타입 | Null | 기본값 | 설명 |
|------|------|:----:|--------|------|
| `id` | BIGSERIAL | N | 자동 증가 | 도감 항목 고유 ID (PK) |
| `user_id` | BIGINT | N | — | 소유 사용자 (FK → `users.id`) |
| `cat_id` | BIGINT | N | — | 수집한 고양이 (FK → `cats.id`) |
| `first_discovered_at` | TIMESTAMPTZ | N | 현재 시각 | 최초 발견 시각 |
| `last_seen_at` | TIMESTAMPTZ | Y | — | 이 사용자가 마지막으로 본 시각 |
| `discovery_photo_id` | BIGINT | Y | — | 최초 발견 당시 사진 (FK → `cat_photos.id`) |
| `representative_photo_id` | BIGINT | Y | — | 도감에 표시할 대표 사진 (FK → `cat_photos.id`) |
| `is_favorite` | BOOLEAN | N | `FALSE` | 즐겨찾기 여부 |
| `custom_name` | VARCHAR(50) | Y | — | 사용자별 개인 애칭 (공식 이름 `cats.name`과 별개) |
| `created_at` | TIMESTAMPTZ | N | 현재 시각 | 생성 시각 |

---

## 10. `cat_identification_candidates` — 식별 후보

사진 1장에 대해 비전 파이프라인이 산출한 고양이 후보들과 점수 상세. 상위 후보가 자동 매칭되거나 사용자/관리자 확인에 쓰인다.

```sql
CREATE TABLE cat_identification_candidates (
  id                     BIGSERIAL PRIMARY KEY,
  photo_id               BIGINT         NOT NULL REFERENCES cat_photos(id),
  cat_id                 BIGINT         NOT NULL REFERENCES cats(id),
  image_similarity_score DECIMAL(5, 4)  NOT NULL,
  location_score         DECIMAL(5, 4)  NULL,
  final_score            DECIMAL(5, 4)  NOT NULL,
  rank_order             INT            NOT NULL,
  recent_seen_score      DECIMAL(5, 4)  NULL,
  pattern_score          DECIMAL(5, 4)  NULL,
  distance_meters        DECIMAL(10, 2) NULL,
  created_at             TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

| 속성 | 타입 | Null | 기본값 | 설명 |
|------|------|:----:|--------|------|
| `id` | BIGSERIAL | N | 자동 증가 | 후보 고유 ID (PK) |
| `photo_id` | BIGINT | N | — | 대상 사진 (FK → `cat_photos.id`) |
| `cat_id` | BIGINT | N | — | 후보 고양이 (FK → `cats.id`) |
| `image_similarity_score` | DECIMAL(5,4) | N | — | 임베딩 기반 이미지 유사도 (0~1) |
| `location_score` | DECIMAL(5,4) | Y | — | 위치 근접도 점수 (0~1) |
| `final_score` | DECIMAL(5,4) | N | — | 가중 합산 최종 점수 (0~1) |
| `rank_order` | INT | N | — | 후보 순위 (1이 최상위) |
| `recent_seen_score` | DECIMAL(5,4) | Y | — | 최근 목격 이력 점수 (0~1) |
| `pattern_score` | DECIMAL(5,4) | Y | — | 털 무늬 일치 점수 (0~1) |
| `distance_meters` | DECIMAL(10,2) | Y | — | 후보 고양이 최근 위치와 촬영 지점 간 거리(m) |
| `created_at` | TIMESTAMPTZ | N | 현재 시각 | 생성 시각 |

---

## 11. `cat_photo_embeddings` — 사진 임베딩

개체 식별 검색에 쓰이는 사진(크롭) 임베딩 벡터. pgvector 확장 없이 동작하도록 `DOUBLE PRECISION[]` 배열로 저장한다 (스키마 파일 주석에 pgvector 마이그레이션 절차 명시). 사진-모델 쌍당 1행(`UNIQUE(photo_id, model_name)`).

```sql
CREATE TABLE cat_photo_embeddings (
  id             BIGSERIAL PRIMARY KEY,
  photo_id       BIGINT             NOT NULL REFERENCES cat_photos(id) ON DELETE CASCADE,
  cat_id         BIGINT             NULL REFERENCES cats(id),
  model_name     VARCHAR(100)       NOT NULL,
  embedding      DOUBLE PRECISION[] NOT NULL,
  crop_image_url TEXT               NULL,
  quality_score  DECIMAL(5, 4)      NULL,
  created_at     TIMESTAMPTZ        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (photo_id, model_name)
);

CREATE INDEX idx_cat_photo_embeddings_cat ON cat_photo_embeddings(cat_id);
```

| 속성 | 타입 | Null | 기본값 | 설명 |
|------|------|:----:|--------|------|
| `id` | BIGSERIAL | N | 자동 증가 | 임베딩 고유 ID (PK) |
| `photo_id` | BIGINT | N | — | 원본 사진 (FK → `cat_photos.id`, 사진 삭제 시 함께 삭제) |
| `cat_id` | BIGINT | Y | — | 확정된 고양이 (FK → `cats.id`). 확정되면 레퍼런스 임베딩으로 검색 대상이 됨 |
| `model_name` | VARCHAR(100) | N | — | 임베딩 생성 모델 이름 (모델 교체 대비) |
| `embedding` | DOUBLE PRECISION[] | N | — | 임베딩 벡터 (576차원 float 배열) |
| `crop_image_url` | TEXT | Y | — | 임베딩 추출에 사용한 크롭 이미지 URL |
| `quality_score` | DECIMAL(5,4) | Y | — | 크롭 품질 점수 (0~1) |
| `created_at` | TIMESTAMPTZ | N | 현재 시각 | 생성 시각 |

---

## 12. `user_exp_events` — 경험치 이벤트 로그

경험치 획득 내역의 원천(source of truth) 로그. `users.exp`/`users.level` 캐시는 이 테이블에 행이 삽입될 때 갱신되며, 부분 UNIQUE 인덱스로 "고양이당 1회" 성격의 보상(첫 발견 등)의 중복 지급을 막는다.

```sql
CREATE TABLE user_exp_events (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT      NOT NULL REFERENCES users(id),
  event_type VARCHAR(30) NOT NULL,
  exp_amount INT         NOT NULL,
  cat_id     BIGINT      NULL REFERENCES cats(id),
  photo_id   BIGINT      NULL REFERENCES cat_photos(id),
  zone_id    BIGINT      NULL REFERENCES campus_zones(id),
  metadata   JSONB       NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_exp_events_user_created_at ON user_exp_events(user_id, created_at);
CREATE UNIQUE INDEX idx_user_exp_events_unique_cat_event
  ON user_exp_events(user_id, event_type, cat_id)
  WHERE cat_id IS NOT NULL;
```

| 속성 | 타입 | Null | 기본값 | 설명 |
|------|------|:----:|--------|------|
| `id` | BIGSERIAL | N | 자동 증가 | 이벤트 고유 ID (PK) |
| `user_id` | BIGINT | N | — | 경험치를 받은 사용자 (FK → `users.id`) |
| `event_type` | VARCHAR(30) | N | — | 이벤트 유형 (예: 첫 발견, 사진 업로드 등 — 기능 연결 예정) |
| `exp_amount` | INT | N | — | 지급 경험치량 |
| `cat_id` | BIGINT | Y | — | 관련 고양이 (FK → `cats.id`). 고양이당 1회 보상 중복 방지 키에 사용 |
| `photo_id` | BIGINT | Y | — | 관련 사진 (FK → `cat_photos.id`) |
| `zone_id` | BIGINT | Y | — | 관련 구역 (FK → `campus_zones.id`) |
| `metadata` | JSONB | Y | — | 이벤트 부가 정보 JSON |
| `created_at` | TIMESTAMPTZ | N | 현재 시각 | 지급 시각 |

---

## 테이블 관계 요약

```
users ─┬─< cat_photos >─┬─ cats ──< cat_sightings
       │                │           │
       │                │           └── cat_placements (1:1, cat_id UNIQUE)
       ├─< cat_sightings│
       ├─< user_cat_collections >── cats
       ├─< refresh_tokens
       └─< user_exp_events

cat_photos ──< cat_identification_candidates >── cats
cat_photos ──< cat_photo_embeddings (ON DELETE CASCADE)
campus_zones ──< (cat_photos, cat_sightings, cat_placements, cats.default_zone_id, user_exp_events)
```

- `email_verifications`는 FK 없이 이메일 문자열로만 연결되는 독립 테이블이다.
- `cats.representative_photo_id`와 `user_exp_events` 이외의 논리 참조는 모두 실제 FK 제약으로 걸려 있다.
