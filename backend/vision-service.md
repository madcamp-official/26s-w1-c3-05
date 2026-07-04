# Cat Vision Service Contract

The backend can call an external vision service when `VISION_PROVIDER=http`.
For local development, keep `VISION_PROVIDER=mock` or run `npm run vision:mock`.

## POST /cat-detection

Checks whether an uploaded image contains a cat.

Request:

```json
{
  "imageUrl": "http://localhost:4000/uploads/example.jpg"
}
```

Response:

```json
{
  "isCat": true,
  "confidence": 0.93
}
```

Rules:

- `isCat` must be a boolean.
- `confidence` must be a number between `0` and `1`.
- The backend rejects the sighting when `isCat` is `false`.
- After a cat image is accepted, the current backend still uses the mock identity matcher for MVP cat matching.

Recommended next implementation:

1. Python FastAPI service with `POST /cat-detection`.
2. YOLO/Ultralytics or another detector for cat/non-cat filtering.
3. A second endpoint for cat identity embeddings once enough labeled campus cat photos exist.

## POST /cat-identification

Compares an uploaded cat image against known candidate cats.

Request:

```json
{
  "imageUrl": "http://localhost:4000/uploads/new-photo.jpg",
  "candidates": [
    {
      "catId": 1,
      "imageUrls": ["https://example.com/mango-representative.jpg"]
    }
  ]
}
```

Response:

```json
{
  "candidates": [
    {
      "catId": 1,
      "imageSimilarityScore": 0.8732
    }
  ]
}
```

Rules:

- `catId` must match one of the requested candidates.
- `imageSimilarityScore` must be a number between `0` and `1`.
- The backend combines image similarity with location score before deciding `matched`, `needs_user_confirmation`, or `new_cat_candidate`.
- The backend may send multiple `imageUrls` for one cat. The service should return the best score among those reference images.
