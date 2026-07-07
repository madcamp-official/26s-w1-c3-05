# Myocatmongo Backend

Backend API for Myocatmongo. It follows the current MVP spec: auth, personal collection, cat sightings, gallery, map cats, profile, rankings, and admin APIs.

## Setup

```bash
cd backend
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

For local PostgreSQL with Docker:

```bash
docker compose up -d postgres
npm run db:migrate
npm run db:seed
```

The default connection string is:

```text
postgres://myocatmongo:myocatmongo@localhost:5432/myocatmongo
```

Seed accounts:

- `catlover123` / `12345678`
- `admin` / `12345678`

Base URL: `http://localhost:4000/api`

Swagger UI:

- `http://localhost:4000/api-docs`
- OpenAPI JSON: `http://localhost:4000/api/openapi.json`

## Auth

Login first and send the token on protected APIs:

```http
Authorization: Bearer {accessToken}
```

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"catlover123\",\"password\":\"12345678\"}"
```

Common error shape:

```json
{
  "message": "error message",
  "code": "ERROR_CODE"
}
```

## MVP APIs

Auth:

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/guest`
- `POST /api/auth/google`
- `POST /api/auth/kakao`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Auth responses return:

```json
{
  "user": { "id": "1", "authProvider": "google", "nickname": "Google user", "nicknameOnboarded": false },
  "accessToken": "jwt.access.token",
  "isNewUser": true,
  "needsNickname": true
}
```

`isNewUser` is `true` when `/auth/signup`, `/auth/google`, or `/auth/kakao`
creates a new account. `needsNickname` is the frontend routing flag: when true,
the frontend shows a nickname-only onboarding screen, then saves the chosen
nickname with `PATCH /api/profile/me`. After that patch succeeds, later logins
with the same method return `needsNickname: false` and enter the map directly
with the nickname stored in the DB. Guest login does not trigger nickname
onboarding.

Guest login creates an anonymous user row and returns the same JWT response shape:

```bash
curl -X POST http://localhost:4000/api/auth/guest
```

Google login:

1. Create an OAuth 2.0 Web client in Google Cloud Console.
2. Set `GOOGLE_CLIENT_ID` in `.env`.
3. Frontend gets a Google ID token and sends it to the backend:

```bash
curl -X POST http://localhost:4000/api/auth/google \
  -H "Content-Type: application/json" \
  -d "{\"idToken\":\"GOOGLE_ID_TOKEN_FROM_FRONTEND\"}"
```

Kakao login:

Frontend gets a Kakao access token and sends it to the backend:

```bash
curl -X POST http://localhost:4000/api/auth/kakao \
  -H "Content-Type: application/json" \
  -d "{\"accessToken\":\"KAKAO_ACCESS_TOKEN_FROM_FRONTEND\"}"
```

Cat:

- `GET /api/cats`
- `GET /api/cats/:catId`
- `GET /api/cats/:catId/sightings`

Collection:

- `GET /api/collection`
- `POST /api/collection`
- `PATCH /api/collection/:catId/favorite`

Gallery:

- `GET /api/gallery/me?page=1&limit=20`
- `GET /api/gallery/me?catId=1&page=1&limit=20`
- `GET /api/gallery/me/cats/:catId`

Sighting:

- `POST /api/sightings`
- `GET /api/sightings/me`
- `POST /api/sightings/:photoId/confirm-cat`

Map:

- `GET /api/map/cats?lat=36.3727&lng=127.3602&radius=500`
- `GET /api/map/objects?lat=36.3727&lng=127.3602&minDistance=30&maxDistance=250`
- `GET /api/map/cat-actors?lat=36.3727&lng=127.3602&radius=500`

`/api/map/objects` returns campus zones whose original coordinates are inside
the requested distance band from the user avatar. By default it only returns
`modelType=building` objects and resolves each one to a reusable frontend asset
such as `/models/buildings/library.glb`.

`/api/map/cat-actors` returns nearby cats with 3D actor state: `surface`,
`anchorKey`, `heightOffsetMeters`, `movementRadiusMeters`, `modelUrl`, and
`animationKey`. The backend decides where the actor is anchored and what motion
state it is in; the frontend loads the model and plays the matching animation.

Frontend usage:

```ts
const params = new URLSearchParams({
  lat: String(userAvatar.lat),
  lng: String(userAvatar.lng),
  radius: '500',
})

const response = await fetch(`${API_BASE_URL}/map/cat-actors?${params}`, {
  headers: { Authorization: `Bearer ${accessToken}` },
})
const { cats } = await response.json()

for (const cat of cats) {
  // Load cat.modelUrl, place it at cat.lat/cat.lng, raise it by
  // cat.heightOffsetMeters when cat.surface === 'roof', then play
  // the clip named cat.animationKey if the GLB exposes it.
}
```

Profile:

- `GET /api/profile/me`
- `PATCH /api/profile/me`

`PATCH /api/profile/me` accepts gallery photos as profile images. Send
`profileImageUrl` as either an external `http(s)` URL, an app-served
`/uploads/...` path from `GET /api/gallery/me`, or `null` to clear it.

Ranking:

- `GET /api/rankings`

Admin:

- `POST /api/admin/cats`
- `PATCH /api/admin/cats/:catId`
- `GET /api/admin/cat-candidates`

## Upload

`POST /api/sightings` accepts `multipart/form-data`:

- `image`: jpg/png/webp, max 5MB
- `latitude`: number
- `longitude`: number

For local API testing, it also accepts JSON with `imageUrl`, `latitude`, and `longitude`.

## Cat Vision

The default vision provider is `mock`, so the backend can run without a machine-learning server:

```env
VISION_PROVIDER="mock"
```

To test the HTTP integration boundary:

```bash
npm run vision:mock
```

Then set:

```env
VISION_PROVIDER="http"
VISION_SERVICE_URL="http://localhost:8001"
```

The HTTP contract is documented in `vision-service.md`. The real vision service handles both cat/non-cat detection and representative-photo based cat identification.

To run the real YOLO-based service with Docker:

```bash
docker compose up -d vision
```

When the vision service runs in Docker and the backend runs on the host, use:

```env
VISION_PROVIDER="http"
VISION_SERVICE_URL="http://localhost:8001"
PUBLIC_BASE_URL="http://host.docker.internal:4000"
```

## Reference Cat Photos

To import local reference photos into PostgreSQL:

```bash
npm run import:cat-references
```

By default, the importer looks for `../assets/model_data` and the sibling project path `../../week1/assets/model_data`.
You can override it:

```bash
$env:MODEL_DATA_DIR="C:\Users\user\2026-project\kaist_madcamp\week1\assets\model_data"
npm run import:cat-references
```

Expected folder shape:

```text
model_data/
  cat01/
    1.jpg
    2.jpg
  cat02/
    1.jpg
```

The importer copies images into `backend/uploads/reference-cats`, creates missing `cats`, inserts matched `cat_photos`, and sets each cat's representative image.
