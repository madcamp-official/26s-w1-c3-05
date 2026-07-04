from fastapi import FastAPI, HTTPException

from .detector import CatDetector
from .schemas import CatDetectionRequest, CatDetectionResponse

app = FastAPI(title="Myocatmongo Vision Service", version="0.1.0")
detector = CatDetector()


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/cat-detection", response_model=CatDetectionResponse)
async def cat_detection(payload: CatDetectionRequest) -> CatDetectionResponse:
    try:
        is_cat, confidence = await detector.detect_from_url(str(payload.imageUrl))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail="Cat detection failed") from error

    return CatDetectionResponse(isCat=is_cat, confidence=confidence)
