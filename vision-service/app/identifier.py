import torch
import torch.nn.functional as F
from PIL import Image
from torchvision.models import MobileNet_V3_Small_Weights, mobilenet_v3_small

from .detector import CatDetector


class CatIdentifier:
    def __init__(self, detector: CatDetector) -> None:
        self.detector = detector
        self._model: torch.nn.Module | None = None
        self._preprocess = MobileNet_V3_Small_Weights.DEFAULT.transforms()
        self._embedding_cache: dict[str, torch.Tensor] = {}

    @property
    def model(self) -> torch.nn.Module:
        if self._model is None:
            model = mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.DEFAULT)
            model.classifier = torch.nn.Identity()
            model.eval()
            self._model = model
        return self._model

    async def similarity(self, query_image_url: str, reference_image_urls: list[str]) -> float:
        if not reference_image_urls:
            return 0.0

        query_embedding = await self._embedding_for_url(query_image_url)
        reference_embeddings = [await self._embedding_for_url(url) for url in reference_image_urls]
        similarities = [float(F.cosine_similarity(query_embedding, reference_embedding, dim=0).item()) for reference_embedding in reference_embeddings]
        best_similarity = max(similarities, default=0.0)

        return round(max(0.0, min(1.0, best_similarity)), 4)

    async def _embedding_for_url(self, image_url: str) -> torch.Tensor:
        if image_url not in self._embedding_cache:
            image = await self.detector.download_image(image_url)
            cat_crop = self.detector.crop_largest_cat(image)
            self._embedding_cache[image_url] = self._embedding_for_image(cat_crop)

        return self._embedding_cache[image_url]

    def _embedding_for_image(self, image: Image.Image) -> torch.Tensor:
        with torch.inference_mode():
            tensor = self._preprocess(image).unsqueeze(0)
            embedding = self.model(tensor).squeeze(0)
            return F.normalize(embedding, dim=0)
