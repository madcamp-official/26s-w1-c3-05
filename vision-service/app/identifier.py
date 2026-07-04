import os

import timm
import torch
import torch.nn.functional as F
from PIL import Image
from torchvision import transforms as T

from .detector import CatDetector

# MegaDescriptor (BVRA / wildlife-tools) is a Swin backbone trained for animal
# re-identification, so it separates individual cats far better than a generic
# ImageNet backbone. Weights download from the HuggingFace hub on first use.
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)


class CatIdentifier:
    def __init__(self, detector: CatDetector) -> None:
        self.detector = detector
        self.model_id = os.getenv("IDENTIFIER_MODEL", "hf-hub:BVRA/MegaDescriptor-T-224")
        # Short, stable label persisted alongside each embedding. Must match the
        # backend's embedding search / backfill so vectors from different models
        # are never compared.
        self.model_name = os.getenv("IDENTIFIER_MODEL_NAME", "megadescriptor-t-224")
        self.input_size = int(os.getenv("IDENTIFIER_INPUT_SIZE", "224"))
        self._model: torch.nn.Module | None = None
        self._preprocess = T.Compose(
            [
                T.Resize((self.input_size, self.input_size)),
                T.ToTensor(),
                T.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
            ]
        )
        self._embedding_cache: dict[str, torch.Tensor] = {}

    @property
    def model(self) -> torch.nn.Module:
        if self._model is None:
            # num_classes=0 returns the pooled embedding instead of class logits.
            model = timm.create_model(self.model_id, num_classes=0, pretrained=True)
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

    def similarity_for_images(self, query_image: Image.Image, reference_image: Image.Image) -> float:
        query_embedding = self.embedding_for_image(query_image)
        reference_embedding = self.embedding_for_image(reference_image)
        similarity = float(F.cosine_similarity(query_embedding, reference_embedding, dim=0).item())

        return round(max(0.0, min(1.0, similarity)), 4)

    async def _embedding_for_url(self, image_url: str) -> torch.Tensor:
        if image_url not in self._embedding_cache:
            image = await self.detector.download_image(image_url)
            cat_crop = self.detector.crop_largest_cat(image)
            self._embedding_cache[image_url] = self.embedding_for_image(cat_crop)

        return self._embedding_cache[image_url]

    def embedding_for_image(self, image: Image.Image) -> torch.Tensor:
        with torch.inference_mode():
            tensor = self._preprocess(image).unsqueeze(0)
            embedding = self.model(tensor).squeeze(0)
            return F.normalize(embedding, dim=0)

    def embedding_list(self, image: Image.Image) -> list[float]:
        """L2-normalized embedding as plain floats for storage/transport."""
        return [float(value) for value in self.embedding_for_image(image).tolist()]
