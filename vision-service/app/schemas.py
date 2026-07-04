from pydantic import BaseModel, Field, HttpUrl


class CatDetectionRequest(BaseModel):
    imageUrl: HttpUrl = Field(..., description="Publicly reachable image URL")


class CatDetectionResponse(BaseModel):
    isCat: bool
    confidence: float = Field(..., ge=0, le=1)


class CatIdentificationCandidateRequest(BaseModel):
    catId: int = Field(..., gt=0)
    imageUrls: list[HttpUrl] = Field(default_factory=list)


class CatIdentificationRequest(BaseModel):
    imageUrl: HttpUrl
    candidates: list[CatIdentificationCandidateRequest] = Field(default_factory=list)


class CatIdentificationCandidateResponse(BaseModel):
    catId: int
    imageSimilarityScore: float = Field(..., ge=0, le=1)


class CatIdentificationResponse(BaseModel):
    candidates: list[CatIdentificationCandidateResponse]
