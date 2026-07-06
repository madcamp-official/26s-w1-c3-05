# KAIST 3D 지도

KAIST 대전 캠퍼스를 모뉴먼트 밸리 풍 파스텔 스타일로 보여주는 모바일 웹 지도입니다.
손가락으로 스와이프하면 이동, 두 손가락으로 회전·기울이기(3D 시점)가 됩니다.

- **지도 라이브러리:** [MapLibre GL JS](https://maplibre.org/)
- **개발 서버:** [Vite](https://vite.dev/)
- **지도 데이터:** [OpenFreeMap](https://openfreemap.org/) (OpenStreetMap 기반, 무료·API 키 불필요)

---

## 처음 실행하는 법

### 로그인 환경 설정

`.env.example`을 복사해 `.env` 파일을 만들고 실제 값을 입력하세요.

```bash
cp .env.example .env
```

- `VITE_API_BASE_URL`: 백엔드 주소. 로컬에서는 `http://localhost:4000`
- `VITE_GOOGLE_CLIENT_ID`: Google 웹 클라이언트 ID
- `VITE_KAKAO_REST_API_KEY`: Kakao Developers의 REST API 키
- `VITE_KAKAO_REDIRECT_URI`: Kakao Developers에 등록한 Redirect URI

Kakao Developers에는 로컬 개발용 Redirect URI로
`http://localhost:5173/oauth/kakao/callback`을 등록해야 합니다.

로그인 성공 시 `accessToken`과 `user`가 브라우저 `localStorage`에 저장됩니다.

### 1. Node.js 설치 (한 번만)

컴퓨터에 Node.js가 없으면 먼저 설치하세요.

- **Mac:** 터미널에서 `brew install node` (Homebrew가 없으면 https://nodejs.org 에서 설치)
- **Windows:** https://nodejs.org 에서 LTS 버전 다운로드 후 설치

설치 확인:

```bash
node --version   # v20 이상이면 OK
```

### 2. 의존성 설치 (프로젝트 받은 뒤 한 번만)

이 폴더 안에서:

```bash
npm install
```

> `node_modules` 폴더는 용량이 커서 공유 파일에 포함되지 않습니다.
> 위 명령을 실행하면 자동으로 내려받아 만들어집니다.

### 3. 개발 서버 실행

```bash
npm run dev
```

터미널에 뜨는 `http://localhost:5173` 주소를 브라우저에서 열면 지도가 보입니다.

### 4. 스마트폰에서 보기 (같은 Wi-Fi)

```bash
npm run dev -- --host
```

터미널에 `Network: http://192.168.x.x:5173` 같은 주소가 뜹니다.
같은 Wi-Fi에 연결된 폰 브라우저에서 그 주소로 접속하세요.

---

## 폴더 구조

```
kaist-map/
├── index.html                    # 페이지 뼈대
├── src/
│   ├── main.js                   # 지도 로직 (중심 좌표, 컨트롤 등)
│   ├── model-layer.js            # GLB 로딩·애니메이션·3D 렌더링
│   └── style.css                 # 전체 화면 스타일
├── public/
│   ├── models/
│   │   ├── avatar.glb            # 내 위치에 표시할 아바타
│   │   └── cat.glb               # 사진 위치에 표시할 고양이
│   ├── textures/                 # 잔디·꽃밭·물 텍스처
│   └── monument-style.json       # 지도 색·도로 스타일 (핵심 디자인 파일)
├── scripts/
│   └── make_monument_style.py    # 위 스타일 JSON을 생성하는 스크립트
├── package.json                  # 프로젝트 설정·의존성 목록
└── README.md                     # 이 파일
```

---

## 지도 디자인(색·도로) 수정하는 법

지도의 색상과 도로 표시 규칙은 전부 `scripts/make_monument_style.py` 안의
**팔레트 값**과 **도로 필터**로 정해집니다. 수정 순서:

1. `scripts/make_monument_style.py` 를 열어 원하는 값을 고침
   (예: `GREEN = "#a9df8e"` 색상 코드 변경, `MAJOR_ROAD` 정규식으로 표시할 도로 등급 조정)
2. 아래 명령으로 `public/monument-style.json` 을 다시 생성:
   ```bash
   python3 scripts/make_monument_style.py
   ```
3. 브라우저를 새로고침하면 반영됨

> `public/monument-style.json` 을 직접 수정해도 되지만,
> 스크립트를 다시 돌리면 덮어써지니 **스크립트 쪽을 고치는 것을 권장**합니다.

GUI로 편집하고 싶으면 [Maputnik](https://maplibre.org/maputnik/) 에서
`Open → Upload Style` 로 `public/monument-style.json` 을 열어 마우스로 색을 바꾼 뒤,
`Export → Download Style` 로 받아 같은 위치에 덮어쓰면 됩니다.

---

## 인터넷에 배포하기 (선택)

정적 사이트라 [Vercel](https://vercel.com), [Netlify](https://netlify.com),
GitHub Pages 등에 무료로 올릴 수 있습니다. 빌드 명령은 `npm run build`,
배포할 폴더는 `dist/` 입니다.
