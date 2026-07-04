from fastapi import FastAPI, HTTPException

from .detector import CatDetector
from .identifier import CatIdentifier
from .schemas import CatDetectionRequest, CatDetectionResponse, CatIdentificationCandidateResponse, CatIdentificationRequest, CatIdentificationResponse

app = FastAPI(title="Myocatmongo Vision Service", version="0.1.0")
detector = CatDetector()
identifier = CatIdentifier(detector)


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


@app.post("/cat-identification", response_model=CatIdentificationResponse)
async def cat_identification(payload: CatIdentificationRequest) -> CatIdentificationResponse:
    try:
        candidates = []
        query_image_url = str(payload.imageUrl)

        for candidate in payload.candidates:
            image_urls = [str(image_url) for image_url in candidate.imageUrls]
            score = await identifier.similarity(query_image_url, image_urls)
            candidates.append(CatIdentificationCandidateResponse(catId=candidate.catId, imageSimilarityScore=score))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail="Cat identification failed") from error

    return CatIdentificationResponse(candidates=sorted(candidates, key=lambda item: item.imageSimilarityScore, reverse=True))
