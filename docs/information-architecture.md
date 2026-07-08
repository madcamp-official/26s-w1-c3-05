# 캣치미 (묘캣몬고) 정보 구조도 (Information Architecture)

이 문서는 캠퍼스 3D 지도 기반 고양이 탐색 및 도감 수집 서비스 **캣치미 (묘캣몬고)**의 전체 화면 구조와 기능, 화면 간 이동 흐름(IA)을 정리한 문서입니다.

---

## 1. 서비스 정보 구조도 (IA Table)

| Depth 1 | Depth 2 | Depth 3 (기능 및 구성 요소) | 주요 액션 / 버튼 | 연동 DB/API | 설명 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. 시작 및 인증** | 1.1. 시작 화면 (`#welcome`) | - 서비스 로고 및 일러스트<br>- 이메일 로그인 버튼<br>- 구글/카카오 소셜 가입 버튼<br>- 게스트 로그인 버튼 | - 이메일로 시작<br>- 소셜 로그인<br>- 로그인 없이 둘러보기 | `/api/auth` | 서비스 진입점. 로그인 수단 선택 및 온보딩 유도 |
| | 1.2. 이메일 로그인 (`#email-auth`) | - 이메일 입력창<br>- 비밀번호 입력창<br>- 로그인 제출 버튼<br>- 가입 유도 버튼 | - 로그인 완료 (지도 이동)<br>- 계정 만들기 (가입 이동)<br>- 이전으로 (뒤로가기) | `POST /api/auth/login` | 이메일 기반 로그인 수행 |
| | 1.3. 이메일 회원가입 (`#signup`) | - 이메일 입력창<br>- 인증코드 발송 버튼<br>- 인증코드 입력창<br>- 비밀번호 입력창<br>- 계정 만들기 제출 버튼 | - 인증코드 받기<br>- 회원가입 완료 (닉네임 설정 이동)<br>- 이전으로 | `POST /api/auth/register`<br>`POST /api/auth/verify` | 이메일 인증 코드를 통한 신규 회원가입 |
| | 1.4. 닉네임 설정 (`#nickname-setup`) | - 최초 닉네임 입력창 (최대 20자)<br>- 시작하기 버튼 | - 시작하기 (지도 이동) | `PATCH /api/profile/me` | 회원가입 직후 프로필 닉네임 최초 설정 |
| **2. 메인 지도** | 2.1. 3D 캠퍼스 지도 (`#map`) | - KAIST 3D 캠퍼스 맵 공간<br>- 고양이/건물 배치 액터<br>- 조작 가이드 (`#hint`) | - 마우스/터치 드래그 (시점 이동)<br>- 더블탭 (시점 전환)<br>- 두 손가락 줌인/아웃 | `GET /api/cats` (지도 배치용)<br>`GET /api/campus-zones` | 캠퍼스를 돌아다니며 고양이와 덤불을 발견하는 메인 화면 |
| | 2.2. 지도 인터페이스 오버레이 | - 사이드 메뉴 열기 버튼 (`#menu-btn`)<br>- BGM On/Off 토글 (`#bgm-btn`)<br>- 고양이 촬영 버튼 (`#camera-btn`)<br>- 내 고양이 갤러리 버튼 (`#cat-gallery-btn`) | - 메뉴 열기<br>- 배경음악 토글<br>- 카메라 실행<br>- 갤러리 열기 | - | 지도 화면 위에 고정되어 각 메뉴로 신속하게 이동하는 글로벌 네비게이션 버튼군 |
| | 2.3. 덤불 힌트 팝업 (`#bush-hint`) | - 숨겨진 고양이 사진 조각 (일부만 노출)<br>- 고양이 출몰 힌트 텍스트 | - 힌트 닫기 (✕) | - | 지도 위 덤불 클릭 시 해당 위치 근처 고양이 힌트 팝업 |
| **3. 촬영 및 판별** | 3.1. 고양이 촬영 화면 (`#camera-view`) | - 실시간 카메라 비디오 피드<br>- 3D 가상 카메라 토글 버튼<br>- 카메라 전/후면 토글 버튼<br>- 줌 인/아웃 컨트롤<br>- 고양이 조준 십자 가이드선<br>- 셔터/촬영 버튼 | - 3D 카메라 토글<br>- 셀카 토글<br>- 확대/축소 (+/-)<br>- 촬영/셔터 버튼 (파일 제출)<br>- 카메라 닫기 (✕) | `POST /api/sightings` (사진 업로드) | 디바이스 카메라를 활성화하여 고양이 사진을 찰영하는 화면. 미지원 기기는 파일 업로드로 자동 폴백 |
| | 3.2. 사진 확인 미리보기 (`#photo-view`) | - 캡처된 사진 썸네일 이미지 | - 미리보기 닫기 (✕) | - | 촬영된 고양이 사진 확인 |
| | 3.3. 판별 로딩 (`capture-result/loading`) | - 판별 로딩 애니메이션 및 로딩 문구 | - | - | 서버에서 AI 비전 판별이 완료될 때까지 대기 |
| | 3.4. 감지 실패 (`capture-result/failure`) | - 고양이 미감지 경고 문구<br>- 팁 카드 (가까이 가기, 빛 조절 등) | - 다시 찍기 (카메라 재시작) | - | 고양이가 감지되지 않았거나 화질이 너무 낮을 때 재촬영 안내 |
| | 3.5. 기존 고양이 매칭 (`capture-result/existing`) | - 촬영된 사진 썸네일<br>- 일치율 백분율(%) 표시<br>- 고양이 매칭 카드 (이름, 특징)<br>- 발견 정보 (장소, 시간) | - 지도로 돌아가기<br>- 도감에서 보기 (상세 페이지 이동)<br>- 닫기 (✕) | `POST /api/collection` (자동 등록) | 기존 도감에 있는 고양이 개체와 일치하여 매칭 성공한 화면 |
| | 3.6. 새 고양이 발견 (`capture-result/new`) | - 촬영 사진 데코 연출 (꽃/잎새)<br>- 이름 입력창<br>- 안내 문구 | - 이름 짓기 (제출)<br>- 나중에 (지도 이동) | `PATCH /api/cats/{id}/name` | AI 판별 결과 기존 고양이가 아닌 새로운 개체로 판단되어 고양이의 이름을 직접 지어주는 화면 |
| | 3.7. 식별 후보 선택 (`capture-result/candidates`) | - 촬영 사진 썸네일<br>- 유사한 고양이 후보군 라디오 버튼 목록<br>- '처음 보는 고양이예요', '잘 모르겠어요' 옵션 | - 선택 완료 (제출)<br>- 다시 찍기 | `POST /api/sightings/{id}/confirm-cat` | AI 식별 확률이 애매할 때 사용자가 직접 후보 목록 중 하나를 확정하거나 새로 등록하는 화면 |
| | 3.8. 도감 등록 연출 (`#discovery-reveal`) | - 지도 암전 연출 및 따뜻한 아우라 이펙트<br>- 고양이 아바타 및 발자국 애니메이션<br>- 3D 고양이 모델 실시간 렌더링<br>- 새 친구 도감 카드 오픈 | - 연출 완료 시 도감 자동 이동 | - | 새 고양이를 도감에 최초 등록했을 때 보여주는 고품질 3D 등록 연출 화면 |
| **4. 도감 및 마이페이지** | 4.1. 내 도감 메인 (`#profile-dex`) | - 마이 프로필 아바타 & 닉네임<br>- 발견한 고양이 수 및 찍은 사진 수 통계<br>- 수집 진행률 표시 바 (n / 50)<br>- 도감 카드 그리드 (발견된 카드 / 잠금 `???` 카드)<br>- 즐겨찾기 메뉴 버튼<br>- 활동 기록 메뉴 버튼 | - 도감 카드 클릭 (상세 이동)<br>- 즐겨찾기 클릭 (즐겨찾기 이동)<br>- 기록 클릭 (활동 기록 이동)<br>- 닫기 (✕) | `GET /api/collection`<br>`GET /api/profile/me` | 자신이 수집한 고양이들의 도감 현황과 개인 프로필 상태를 보여주는 대시보드 |
| | 4.2. 고양이 상세 정보 (`#cat-detail`) | - 고양이 갤러리 이미지 캐러셀<br>- 이미지 개수 표시 (`1/n`)<br>- 공식 이름, 대표 발견지, 발견 날짜<br>- 별명 작성 폼 토글 및 저장 버튼<br>- 3D 뷰어 진입 버튼<br>- 특징/성격 소개 카드<br>- 발견 장소 지도 캔버스 | - 즐겨찾기 하트 토글 (⭐)<br>- 별명 짓기 토글 및 저장<br>- 고양이를 3D로 보기 (뷰어 열기)<br>- 도감으로 돌아가기 (뒤로가기) | `GET /api/cats/{id}`<br>`GET /api/cats/{id}/sightings`<br>`PATCH /api/cats/{id}/nickname`<br>`PATCH /api/collection/{id}/favorite` | 해당 고양이의 상세 정보, 다른 사람이 찍은 목격 사진 모음, 특징, 발견 장소를 확인하는 화면 |
| | 4.3. 3D 고양이 뷰어 (`#cat-3d-viewer`) | - 고양이 3D 모델 (Three.js 렌더링)<br>- 고양이 이름 및 렌더링 상태 메시지 | - 드래그/회전 조작<br>- 3D 보기 닫기 (✕) | `cat-models.js` (GLB 로드) | 고양이의 3D 입체 모델을 회전하고 자세히 관찰할 수 있는 전용 뷰어 |
| | 4.4. 즐겨찾기 목록 (`#favorites-screen`) | - 즐겨찾기(하트) 지정된 고양이 도감 카드 그리드<br>- 즐겨찾기가 없을 때 빈 화면 (`#favorites-empty`) | - 도감 카드 클릭 (상세 이동)<br>- 뒤로가기 | `GET /api/collection` (즐겨찾기 필터) | 즐겨찾기한 고양이들만 따로 모아 보는 간편 그리드 화면 |
| | 4.5. 목격 기록 (`#activity-screen`) | - 자신이 직접 촬영하여 매칭에 성공한 목격 타임라인 목록 (날짜, 시간, 고양이 사진, 판별 상태, 발견 위치) | - 뒤로가기 | `GET /api/sightings/me` | 자신이 캠퍼스에서 활동한 모든 고양이 탐색 목격 이력 리스트 |
| | 4.6. 내 고양이 갤러리 (`#cat-gallery`) | - 내가 촬영한 고양이 사진 그리드 피드<br>- 빈 화면 경고 멘트 (`#gallery-empty`) | - 사진 개별 보기 (클릭)<br>- 갤러리 닫기 (✕) | `GET /api/gallery/me` | 사용자가 촬영에 성공한 고양이 사진만 그리드 형태로 보여주는 미디어 갤러리 |
| | 4.7. 좌표별 고양이 목록 (`#location-photos`) | - 해당 핀 위치에서 발견된 고양이 목록 가로 스트립 슬라이드 | - 목록 닫기 (✕ / 배경 클릭) | `GET /api/cats/{id}/sightings` | 지도 마커 클릭 시 해당 스팟에서 출몰하는 모든 고양이 사진을 모아 보여주는 바텀 시트 팝업 |
| **5. 설정 및 메뉴** | 5.1. 사이드바 메뉴 (`#cat-menu`) | - 유저 웰컴 메세지 및 닉네임<br>- 총 발견 마리수 요약 카드<br>- 메뉴 목록 (도움말, 설정, 로그아웃) | - 발견 마리수 클릭 (도감 이동)<br>- 도움말 클릭<br>- 설정 클릭<br>- 로그아웃 클릭<br>- 메뉴 닫기 (✕ / 배경 클릭) | - | 메인 화면 오른쪽 상단 삼선 버튼 클릭 시 열리는 사이드 메뉴 바 |
| | 5.2. 설정 화면 (`#settings-screen`) | - 현재 설정된 이름/닉네임<br>- 프로필 이미지 업로드/초기화 버튼<br>- 저장 버튼 | - 닉네임 입력<br>- 프로필 사진 업로드<br>- 기본 이미지로 초기화<br>- 설정 저장하기 (제출)<br>- 설정 닫기 | `PATCH /api/profile/me` | 사용자 프로필 정보(닉네임, 프로필 이미지)를 수정하는 폼 화면 |
| | 5.3. 도움말 화면 (`#help-screen`) | - 서비스 소개 타이틀<br>- 기능 아이콘 설명 카드 (카메라, 내 고양이 등)<br>- 지도 뷰어 모드 설명 (항공뷰, 로드뷰) | - 도움말 닫기 | - | 앱 사용 방법 및 3D 지도 조작 가이드를 안내하는 설명 페이지 |

---

## 2. 화면 이동 및 상태 다이어그램 (Mermaid Flowchart)

```mermaid
graph TD
    %% 스타일 정의
    classDef startEnd fill:#f9f9f9,stroke:#333,stroke-width:2px;
    classDef mainScreen fill:#e1f5fe,stroke:#0288d1,stroke-width:2px;
    classDef captureFlow fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px;
    classDef dexFlow fill:#fff8e1,stroke:#f57f17,stroke-width:2px;
    classDef configFlow fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px;

    %% 1. 시작 및 인증
    Welcome["시작 화면 (#welcome)"]:::startEnd
    EmailAuth["이메일 로그인 (#email-auth)"]:::startEnd
    Signup["이메일 회원가입 (#signup)"]:::startEnd
    NicknameSetup["닉네임 설정 (#nickname-setup)"]:::startEnd

    Welcome -->|이메일 로그인 선택| EmailAuth
    Welcome -->|회원가입 선택| Signup
    Welcome -->|게스트 로그인 선택| MapScreen
    
    EmailAuth -->|로그인 성공| MapScreen
    EmailAuth -->|가입 유도 클릭| Signup
    Signup -->|인증 및 가입 완료| NicknameSetup
    NicknameSetup -->|시작하기| MapScreen

    %% 2. 메인 지도
    MapScreen["3D 캠퍼스 지도 (#map)"]:::mainScreen
    BushHint["덤불 힌트 팝업 (#bush-hint)"]:::mainScreen
    LocationPhotos["좌표별 사진 묶음 (#location-photos)"]:::mainScreen

    MapScreen -->|덤불 클릭| BushHint
    MapScreen -->|지도 핀 마커 클릭| LocationPhotos

    %% 3. 촬영 및 판별 흐름
    CameraView["카메라 촬영 화면 (#camera-view)"]:::captureFlow
    PhotoPreview["사진 확인 (#photo-view)"]:::captureFlow
    Loading["판별 중 로딩 (loading)"]:::captureFlow
    Failure["감지 실패 (failure)"]:::captureFlow
    MatchedExisting["기존 고양이 매칭 결과 (existing)"]:::captureFlow
    MatchedNew["새 발견 이름 지정 (new)"]:::captureFlow
    Candidates["식별 후보 선택 (candidates)"]:::captureFlow
    DiscoveryReveal["도감 등록 연출 (#discovery-reveal)"]:::captureFlow

    MapScreen -->|카메라 버튼 클릭| CameraView
    CameraView -->|촬영 셔터 클릭| PhotoPreview
    PhotoPreview -->|판별 요청 API| Loading
    
    Loading -->|고양이 미감지 / blurry| Failure
    Loading -->|식별 애매함 (다중 후보)| Candidates
    Loading -->|기존 고양이 매칭| MatchedExisting
    Loading -->|신규 고양이 판정| MatchedNew

    Failure -->|다시 찍기| CameraView
    
    Candidates -->|기존 고양이 확정| MatchedExisting
    Candidates -->|새 고양이 확정| MatchedNew
    Candidates -->|다시 찍기| CameraView

    MatchedNew -->|이름 지정 완료| DiscoveryReveal
    MatchedExisting -->|도감에서 보기 클릭| CatDetail
    DiscoveryReveal -->|연출 종료 시| ProfileDex

    %% 4. 도감 및 마이페이지 흐름
    ProfileDex["내 도감 메인 (#profile-dex)"]:::dexFlow
    CatDetail["고양이 상세 정보 (#cat-detail)"]:::dexFlow
    Cat3DViewer["3D 고양이 뷰어 (#cat-3d-viewer)"]:::dexFlow
    Favorites["즐겨찾기 목록 (#favorites-screen)"]:::dexFlow
    Activity["목격 기록 (#activity-screen)"]:::dexFlow
    CatGallery["내 고양이 사진첩 (#cat-gallery)"]:::dexFlow

    MapScreen -->|도감 버튼 클릭| CatGallery
    CatGallery -->|사진 선택| CatDetail
    
    ProfileDex -->|도감 카드 클릭| CatDetail
    ProfileDex -->|즐겨찾기 메뉴 클릭| Favorites
    ProfileDex -->|기록 메뉴 클릭| Activity
    
    CatDetail -->|3D로 보기 클릭| Cat3DViewer
    Favorites -->|도감 카드 클릭| CatDetail

    %% 5. 설정 및 메뉴 흐름
    SidebarMenu["사이드바 메뉴 (#cat-menu)"]:::configFlow
    SettingsScreen["설정 화면 (#settings-screen)"]:::configFlow
    HelpScreen["도움말 화면 (#help-screen)"]:::configFlow

    MapScreen -->|삼선 메뉴 클릭| SidebarMenu
    SidebarMenu -->|내 정보 요약 클릭| ProfileDex
    SidebarMenu -->|설정 클릭| SettingsScreen
    SidebarMenu -->|도움말 클릭| HelpScreen
    SidebarMenu -->|로그아웃 클릭| Welcome
```

---

## 3. 화면별 상태 전환 조건

1. **로그인 상태 복원 (세션 체크)**
   - 앱 기동 시 `localStorage`에 토큰 정보가 존재할 경우 `/api/auth/me`를 호출하여 재검증합니다.
   - 검증 성공 시 `MapScreen`으로 직행하고, 검증 실패(401) 또는 세션 무효 시 `Welcome` 시작 화면을 노출합니다.

2. **고양이 판별 (`POST /api/sightings`) 결과 분기**
   - **`rejected` / `low_quality`**: 고양이 감지 실패 팝업(`Failure`)으로 이동하여 재촬영 유도.
   - **`matched`**: 기존 고양이 일치 화면(`MatchedExisting`)으로 이동하며, 유저 도감에 자동 등록 처리됩니다.
   - **`new_cat_candidate`**: 새 고양이 등록 화면(`MatchedNew`)으로 이동하여 신규 이름을 입력받습니다.
   - **`needs_user_confirmation`**: 유사 고양이 목록(`Candidates`)을 보여주어 유저가 라디오 버튼으로 후보를 선택하도록 매칭을 위임합니다.
