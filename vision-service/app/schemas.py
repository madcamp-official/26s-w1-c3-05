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


class BoundingBox(BaseModel):
    x1: int
    y1: int
    x2: int
    y2: int


class CatAnalysisRequest(BaseModel):
    imageUrl: HttpUrl = Field(..., description="Publicly reachable image URL")
    includeCrop: bool = Field(default=True, description="Return the cropped cat as a data URL")


class CatAnalysisResponse(BaseModel):
    isCat: bool
    confidence: float = Field(..., ge=0, le=1)
    bbox: BoundingBox | None = None
    qualityScore: float | None = Field(default=None, ge=0, le=1)
    qualityReason: str | None = None
    dominantColor: str | None = None
    modelName: str
    embedding: list[float] = Field(default_factory=list)
    cropImage: str | None = None


class DebugReferenceRequest(BaseModel):
    label: str = Field(default="reference")
    imageSource: str


class DebugCandidateRequest(BaseModel):
    label: str = Field(default="candidate")
    references: list[DebugReferenceRequest] = Field(default_factory=list)


class DebugVisionRequest(BaseModel):
    imageSource: str
    candidates: list[DebugCandidateRequest] = Field(default_factory=list)
