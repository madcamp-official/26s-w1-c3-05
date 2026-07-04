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
- `POST /api/auth/logout`
- `GET /api/auth/me`

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

Profile:

- `GET /api/profile/me`
- `PATCH /api/profile/me`

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
