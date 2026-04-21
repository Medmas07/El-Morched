import httpx
import base64
from dataclasses import dataclass
from typing import Optional
from app.data_providers.imagery.mapillary import MapillaryImage
from app.core.config import settings


@dataclass
class ImageFeatures:
    mapillary_id: str
    lat: float
    lon: float
    vegetation_score: float    # 0-1 (green coverage)
    impervious_score: float    # 0-1 (concrete/asphalt)
    shadow_score: float        # 0-1 (shading intensity)
    standing_water: bool       # detected standing water
    surface_type: str          # road/vegetation/water/building


@dataclass
class VisionSummary:
    image_count: int
    mean_vegetation: float
    mean_impervious: float
    mean_shadow: float
    standing_water_pct: float
    dominant_surface: str
    per_image: list[ImageFeatures]


class VisionAnalyzer:
    """
    Analyzes Mapillary images for urban surface features.
    Uses CLIP-based zero-shot classification or falls back to mock.
    Images are fetched server-side by URL — never uploaded by the user.
    """

    def process(self, images: list[MapillaryImage]) -> VisionSummary:
        if not images:
            return self._empty_summary()

        per_image = []
        for img in images:
            if img.thumb_url:
                features = self._analyze_image(img)
                per_image.append(features)

        if not per_image:
            return self._empty_summary()

        return VisionSummary(
            image_count=len(per_image),
            mean_vegetation=sum(f.vegetation_score for f in per_image) / len(per_image),
            mean_impervious=sum(f.impervious_score for f in per_image) / len(per_image),
            mean_shadow=sum(f.shadow_score for f in per_image) / len(per_image),
            standing_water_pct=sum(1 for f in per_image if f.standing_water) / len(per_image),
            dominant_surface=self._dominant_surface(per_image),
            per_image=per_image,
        )

    def _analyze_image(self, img: MapillaryImage) -> ImageFeatures:
        if settings.CV_MODEL == "mock":
            return self._mock_features(img)
        return self._clip_classify(img)

    def _clip_classify(self, img: MapillaryImage) -> ImageFeatures:
        """Zero-shot classification using CLIP via HuggingFace."""
        try:
            import torch
            from transformers import CLIPProcessor, CLIPModel
            from PIL import Image
            import io

            model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
            processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

            resp = httpx.get(img.thumb_url, timeout=15)
            pil_img = Image.open(io.BytesIO(resp.content)).convert("RGB")

            labels = [
                "dense vegetation and trees",
                "concrete road and asphalt",
                "standing water and flooding",
                "building facade",
                "shaded area",
            ]

            inputs = processor(text=labels, images=pil_img, return_tensors="pt", padding=True)
            with torch.no_grad():
                outputs = model(**inputs)
            probs = outputs.logits_per_image.softmax(dim=1).squeeze().tolist()

            return ImageFeatures(
                mapillary_id=img.id,
                lat=img.lat,
                lon=img.lon,
                vegetation_score=probs[0],
                impervious_score=probs[1],
                shadow_score=probs[4],
                standing_water=probs[2] > 0.3,
                surface_type=labels[probs.index(max(probs))].split()[0],
            )
        except Exception:
            return self._mock_features(img)

    def _mock_features(self, img: MapillaryImage) -> ImageFeatures:
        import random
        rng = random.Random(hash(img.id))
        return ImageFeatures(
            mapillary_id=img.id,
            lat=img.lat,
            lon=img.lon,
            vegetation_score=rng.uniform(0.1, 0.9),
            impervious_score=rng.uniform(0.1, 0.9),
            shadow_score=rng.uniform(0.0, 0.6),
            standing_water=rng.random() < 0.1,
            surface_type=rng.choice(["road", "vegetation", "building"]),
        )

    def _dominant_surface(self, features: list[ImageFeatures]) -> str:
        from collections import Counter
        return Counter(f.surface_type for f in features).most_common(1)[0][0]

    def _empty_summary(self) -> VisionSummary:
        return VisionSummary(
            image_count=0,
            mean_vegetation=0.0,
            mean_impervious=0.5,
            mean_shadow=0.0,
            standing_water_pct=0.0,
            dominant_surface="unknown",
            per_image=[],
        )
