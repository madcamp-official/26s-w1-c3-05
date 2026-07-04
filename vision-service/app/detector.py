import os
from io import BytesIO

import httpx
from PIL import Image, UnidentifiedImageError
from ultralytics import YOLO


COCO_CAT_CLASS_ID = 15


class CatDetector:
    def __init__(self) -> None:
        self.model_name = os.getenv("VISION_MODEL", "yolo11n.pt")
        self.threshold = float(os.getenv("CAT_CONFIDENCE_THRESHOLD", "0.25"))
        self.timeout_seconds = float(os.getenv("IMAGE_DOWNLOAD_TIMEOUT_SECONDS", "10"))
        self._model: YOLO | None = None

    @property
    def model(self) -> YOLO:
        if self._model is None:
            self._model = YOLO(self.model_name)
        return self._model

    async def detect_from_url(self, image_url: str) -> tuple[bool, float]:
        image = await self._download_image(image_url)
        results = self.model.predict(image, verbose=False)

        best_cat_confidence = 0.0
        for result in results:
            if result.boxes is None:
                continue

            for box in result.boxes:
                class_id = int(box.cls.item())
                confidence = float(box.conf.item())
                if class_id == COCO_CAT_CLASS_ID:
                    best_cat_confidence = max(best_cat_confidence, confidence)

        return best_cat_confidence >= self.threshold, round(best_cat_confidence, 4)

    async def _download_image(self, image_url: str) -> Image.Image:
        async with httpx.AsyncClient(timeout=self.timeout_seconds, follow_redirects=True) as client:
            response = await client.get(image_url)
            response.raise_for_status()

        try:
            return Image.open(BytesIO(response.content)).convert("RGB")
        except UnidentifiedImageError as error:
            raise ValueError("Downloaded file is not a valid image") from error
