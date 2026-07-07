import os
import base64
from io import BytesIO
from typing import Any

import httpx
import numpy as np
from PIL import Image, UnidentifiedImageError
from ultralytics import YOLO


COCO_CAT_CLASS_ID = 15


class CatDetector:
    def __init__(self) -> None:
        self.model_name = os.getenv("VISION_MODEL", "yolo11n.pt")
        self.threshold = float(os.getenv("CAT_CONFIDENCE_THRESHOLD", "0.25"))
        self.timeout_seconds = float(os.getenv("IMAGE_DOWNLOAD_TIMEOUT_SECONDS", "10"))
        self.quality_area_min = float(os.getenv("QUALITY_AREA_MIN_RATIO", "0.02"))
        self.quality_brightness_min = float(os.getenv("QUALITY_BRIGHTNESS_MIN", "0.16"))
        self.quality_sharpness_min = float(os.getenv("QUALITY_SHARPNESS_MIN", "60"))
        self.quality_sharpness_ref = float(os.getenv("QUALITY_SHARPNESS_REF", "300"))
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

    async def load_image(self, image_source: str) -> Image.Image:
        if image_source.startswith("data:image/"):
            return self._decode_data_url(image_source)

        if image_source.startswith(("http://", "https://")):
            return await self.download_image(image_source)

        raise ValueError("Image source must be an HTTP(S) URL or a data:image URL")

    def best_cat_confidence(self, image: Image.Image) -> float:
        cat_confidences = [box["confidence"] for box in self.detect_boxes(image) if box["isCat"]]
        return max(cat_confidences, default=0.0)

    def detect_boxes(self, image: Image.Image) -> list[dict[str, Any]]:
        results = self.model.predict(image, verbose=False)
        image_width, image_height = image.size
        detections: list[dict[str, Any]] = []

        for result in results:
            if result.boxes is None:
                continue

            for box in result.boxes:
                class_id = int(box.cls.item())
                confidence = float(box.conf.item())
                x1, y1, x2, y2 = [int(value) for value in box.xyxy[0].tolist()]
                label = str(result.names.get(class_id, class_id)) if hasattr(result, "names") else str(class_id)
                detections.append(
                    {
                        "classId": class_id,
                        "label": label,
                        "confidence": round(confidence, 4),
                        "isCat": class_id == COCO_CAT_CLASS_ID,
                        "box": {
                            "x1": max(0, min(image_width, x1)),
                            "y1": max(0, min(image_height, y1)),
                            "x2": max(0, min(image_width, x2)),
                            "y2": max(0, min(image_height, y2)),
                        },
                    }
                )

        return sorted(detections, key=lambda item: float(item["confidence"]), reverse=True)

    def largest_cat_box(self, image: Image.Image) -> tuple[int, int, int, int] | None:
        best_box: tuple[int, int, int, int] | None = None
        best_area = 0

        for detection in self.detect_boxes(image):
            if not detection["isCat"]:
                continue

            box = detection["box"]
            x1, y1, x2, y2 = int(box["x1"]), int(box["y1"]), int(box["x2"]), int(box["y2"])
            area = max(0, x2 - x1) * max(0, y2 - y1)
            if area > best_area:
                best_area = area
                best_box = (x1, y1, x2, y2)

        return best_box

    def crop_largest_cat(self, image: Image.Image) -> Image.Image:
        best_box = self.largest_cat_box(image)
        if best_box is None:
            return image

        return image.crop(best_box)

    def best_cat_detection(self, detections: list[dict[str, Any]]) -> dict[str, Any] | None:
        """Pick the single highest-confidence cat box (MVP: one cat per photo)."""
        best: dict[str, Any] | None = None
        for detection in detections:
            if not detection["isCat"]:
                continue
            if best is None or float(detection["confidence"]) > float(best["confidence"]):
                best = detection
        return best

    def crop_box(self, image: Image.Image, box: dict[str, int], padding_ratio: float = 0.12) -> Image.Image:
        """Crop with padding, clamped to the image bounds."""
        image_width, image_height = image.size
        pad_x = int((int(box["x2"]) - int(box["x1"])) * padding_ratio)
        pad_y = int((int(box["y2"]) - int(box["y1"])) * padding_ratio)
        x1 = max(0, int(box["x1"]) - pad_x)
        y1 = max(0, int(box["y1"]) - pad_y)
        x2 = min(image_width, int(box["x2"]) + pad_x)
        y2 = min(image_height, int(box["y2"]) + pad_y)
        if x2 <= x1 or y2 <= y1:
            return image
        return image.crop((x1, y1, x2, y2))

    def quality_metrics(self, image: Image.Image, box: dict[str, int]) -> dict[str, Any]:
        """Return a 0..1 quality score plus the first failing reason, if any."""
        image_width, image_height = image.size
        image_area = max(1, image_width * image_height)
        box_area = max(0, int(box["x2"]) - int(box["x1"])) * max(0, int(box["y2"]) - int(box["y1"]))
        area_ratio = box_area / image_area

        gray = np.asarray(image.crop((int(box["x1"]), int(box["y1"]), int(box["x2"]), int(box["y2"]))).convert("L"), dtype=np.float64)
        brightness = float(gray.mean() / 255.0) if gray.size else 0.0
        sharpness = self._variance_of_laplacian(gray)

        reason: str | None = None
        if area_ratio < self.quality_area_min:
            reason = "too_small"
        elif brightness < self.quality_brightness_min:
            reason = "too_dark"
        elif sharpness < self.quality_sharpness_min:
            reason = "blurry"

        area_score = min(1.0, area_ratio / (self.quality_area_min * 2.5))
        brightness_score = min(1.0, brightness / (self.quality_brightness_min * 2.0))
        sharpness_score = min(1.0, sharpness / self.quality_sharpness_ref)
        quality_score = round(max(0.0, min(area_score, brightness_score, sharpness_score)), 4)

        return {
            "qualityScore": quality_score,
            "qualityReason": reason,
            "areaRatio": round(area_ratio, 4),
            "brightness": round(brightness, 4),
            "sharpness": round(sharpness, 2),
        }

    def dominant_color(self, image: Image.Image, box: dict[str, int]) -> str:
        """Best-effort coat-type classifier; the backend maps the label to a 3D model.

        Returns one of: calico, tuxedo, bicolor, orange, oatmeal, gray, white,
        black, mixed.

        Reliable part (plain color): black / white / gray / orange / oatmeal, plus
        the multi-color coats (calico, tuxedo, bicolor) via colour-fraction + a
        coarse top/bottom layout check.

        NOT attempted here: tabby-vs-solid. Measured stripe/texture cues are
        dominated by fur, whiskers and photo sharpness (a solid ginger tests as
        *more* textured than a brown tabby), so the striped variants (cheese /
        gray / orange tabby) can't be told from their solid counterparts by a
        heuristic — those are reached only via an explicit pattern label or an
        admin/finder choice, never auto-detected here.

        Robustness measures over a naive box-average (which let bright backgrounds
        dominate): sample only the central region (cat body, not box-edge
        background) and classify per-pixel, so a coherent coat block outvotes
        scattered background pixels.
        """
        crop = image.crop((int(box["x1"]), int(box["y1"]), int(box["x2"]), int(box["y2"])))
        if crop.width < 2 or crop.height < 2:
            return "mixed"

        # Central 60% region — box edges are mostly background.
        width, height = crop.width, crop.height
        cx0, cy0 = int(width * 0.20), int(height * 0.20)
        cx1, cy1 = int(width * 0.80), int(height * 0.80)
        center = crop.crop((cx0, cy0, cx1, cy1)) if (cx1 > cx0 and cy1 > cy0) else crop

        hsv = np.asarray(center.convert("HSV").resize((64, 64)), dtype=np.float64)
        hue = hsv[..., 0] * (360.0 / 255.0)  # PIL hue 0-255 -> degrees
        saturation = hsv[..., 1] / 255.0
        value = hsv[..., 2] / 255.0

        warm_hue = (hue <= 40.0) | (hue >= 330.0)
        # Per-pixel masks (2D, so we can also reason about spatial layout).
        black_mask = value < 0.24
        white_mask = (saturation < 0.16) & (value > 0.72)
        warm_mask = warm_hue & (saturation >= 0.28) & (value >= 0.25) & ~white_mask & ~black_mask
        gray_mask = (saturation < 0.22) & (value >= 0.24) & (value <= 0.72) & ~white_mask & ~warm_mask

        black_fraction = float(black_mask.mean())
        white_fraction = float(white_mask.mean())
        warm_fraction = float(warm_mask.mean())
        gray_fraction = float(gray_mask.mean())
        warm_saturation_mean = float(saturation[warm_mask].mean()) if warm_mask.any() else 0.0
        warm_value_mean = float(value[warm_mask].mean()) if warm_mask.any() else 0.0

        # --- multi-colour coats (conservative: only fire when clearly patched) ---
        # These heuristics have poor precision on tabbies (a brown tabby with a
        # white bib easily fakes a calico), so we bias toward MISSING a multi-colour
        # coat — falling back to a solid model — rather than mislabelling a tabby.
        # A false "solid orange" on a calico is far less jarring than a calico model
        # on a plain ginger. Require vivid (not muted-tabby) orange for calico.
        is_vivid_warm = warm_saturation_mean >= 0.55
        if white_fraction >= 0.18 and warm_fraction >= 0.18 and black_fraction >= 0.12 and is_vivid_warm:
            return "calico"

        # Black & white, no warm patch -> tuxedo (black body + white chest) or bicolor.
        if black_fraction >= 0.20 and white_fraction >= 0.18 and warm_fraction < 0.10:
            white_top = float(white_mask[:32].mean())
            white_bottom = float(white_mask[32:].mean())
            black_top = float(black_mask[:32].mean())
            if black_fraction >= white_fraction and black_top >= 0.25 and white_bottom > white_top:
                return "tuxedo"
            return "bicolor"

        # --- single dominant colour ---
        fractions = {"black": black_fraction, "white": white_fraction, "gray": gray_fraction, "warm": warm_fraction}
        winner = max(fractions, key=fractions.get)
        if fractions[winner] < 0.15:
            return "mixed"

        if winner == "warm":
            # Oatmeal/cream = a light, muted warm; vivid warm is ginger orange.
            if warm_saturation_mean < 0.42 and warm_value_mean >= 0.62:
                return "oatmeal"
            return "orange"
        return {"black": "black", "white": "white", "gray": "gray"}[winner]

    @staticmethod
    def _variance_of_laplacian(gray: np.ndarray) -> float:
        if gray.shape[0] < 3 or gray.shape[1] < 3:
            return 0.0
        laplacian = (
            gray[:-2, 1:-1]
            + gray[2:, 1:-1]
            + gray[1:-1, :-2]
            + gray[1:-1, 2:]
            - 4.0 * gray[1:-1, 1:-1]
        )
        return float(laplacian.var())

    async def download_image(self, image_url: str) -> Image.Image:
        async with httpx.AsyncClient(timeout=self.timeout_seconds, follow_redirects=True) as client:
            response = await client.get(image_url)
            response.raise_for_status()

        return self._decode_image_bytes(response.content)

    def _decode_data_url(self, image_source: str) -> Image.Image:
        try:
            _, encoded = image_source.split(",", 1)
            return self._decode_image_bytes(base64.b64decode(encoded))
        except (ValueError, base64.binascii.Error) as error:
            raise ValueError("Image source is not a valid data:image URL") from error

    def _decode_image_bytes(self, image_bytes: bytes) -> Image.Image:
        try:
            return Image.open(BytesIO(image_bytes)).convert("RGB")
        except UnidentifiedImageError as error:
            raise ValueError("Downloaded file is not a valid image") from error
