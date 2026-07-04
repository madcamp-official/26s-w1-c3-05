from pydantic import BaseModel, Field, HttpUrl


class CatDetectionRequest(BaseModel):
    imageUrl: HttpUrl = Field(..., description="Publicly reachable image URL")


class CatDetectionResponse(BaseModel):
    isCat: bool
    confidence: float = Field(..., ge=0, le=1)
