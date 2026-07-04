# Myocatmongo Vision Service

Python service for cat/non-cat detection.

It exposes the API expected by the backend:

```http
POST /cat-detection
```

## Run With Docker

From `backend/`:

```bash
docker compose up -d vision
```

If the backend is running on the host machine and uploads are served from port `4000`, set this in `backend/.env`:

```env
VISION_PROVIDER="http"
VISION_SERVICE_URL="http://localhost:8001"
PUBLIC_BASE_URL="http://host.docker.internal:4000"
```

`PUBLIC_BASE_URL` matters because the vision container must be able to download uploaded images from the backend.

## Run Locally

Use Python 3.11 if possible.

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

## Environment

- `VISION_MODEL`: Ultralytics model name or path. Default: `yolo11n.pt`
- `CAT_CONFIDENCE_THRESHOLD`: minimum confidence for accepting a cat detection. Default: `0.25`
- `IMAGE_DOWNLOAD_TIMEOUT_SECONDS`: image download timeout. Default: `10`

The first run downloads the model weights automatically.
