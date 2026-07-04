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
        image = await self.download_image(image_url)
        best_cat_confidence = self.best_cat_confidence(image)

        return best_cat_confidence >= self.threshold, round(best_cat_confidence, 4)

    def best_cat_confidence(self, image: Image.Image) -> float:
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

        return best_cat_confidence

    def crop_largest_cat(self, image: Image.Image) -> Image.Image:
        results = self.model.predict(image, verbose=False)
        best_box: tuple[int, int, int, int] | None = None
        best_area = 0.0

        for result in results:
            if result.boxes is None:
                continue

            for box in result.boxes:
                if int(box.cls.item()) != COCO_CAT_CLASS_ID:
                    continue

                x1, y1, x2, y2 = [int(value) for value in box.xyxy[0].tolist()]
                area = max(0, x2 - x1) * max(0, y2 - y1)
                if area > best_area:
                    best_area = area
                    best_box = (x1, y1, x2, y2)

        if best_box is None:
            return image

        return image.crop(best_box)

    async def download_image(self, image_url: str) -> Image.Image:
        async with httpx.AsyncClient(timeout=self.timeout_seconds, follow_redirects=True) as client:
            response = await client.get(image_url)
            response.raise_for_status()

        try:
            return Image.open(BytesIO(response.content)).convert("RGB")
        except UnidentifiedImageError as error:
            raise ValueError("Downloaded file is not a valid image") from error
