import httpx
from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from app.core.config import settings


@dataclass
class MapillaryImage:
    id: str
    lat: float
    lon: float
    captured_at: Optional[datetime]
    thumb_url: Optional[str]
    sequence_id: Optional[str]


class MapillaryProvider:
    """
    Fetches image metadata from Mapillary Graph API.
    We NEVER download or store image files — only IDs and coordinates.
    """

    BASE = settings.MAPILLARY_API_BASE
    FIELDS = "id,geometry,captured_at,thumb_1024_url,sequence"

    def __init__(self):
        self.token = settings.MAPILLARY_ACCESS_TOKEN

    def _headers(self) -> dict:
        return {"Authorization": f"OAuth {self.token}"}

    def fetch_images_by_bbox(
        self,
        west: float,
        south: float,
        east: float,
        north: float,
        limit: int = 100,
    ) -> list[MapillaryImage]:
        params = {
            "fields": self.FIELDS,
            "bbox": f"{west},{south},{east},{north}",
            "limit": limit,
        }

        with httpx.Client(timeout=30) as client:
            r = client.get(
                f"{self.BASE}/images",
                params=params,
                headers=self._headers(),
            )
            r.raise_for_status()
            data = r.json()

        results = []
        for feat in data.get("data", []):
            coords = feat["geometry"]["coordinates"]
            captured = feat.get("captured_at")
            results.append(
                MapillaryImage(
                    id=feat["id"],
                    lon=coords[0],
                    lat=coords[1],
                    captured_at=datetime.fromisoformat(captured) if captured else None,
                    thumb_url=feat.get("thumb_1024_url"),
                    sequence_id=feat.get("sequence"),
                )
            )

        return results
