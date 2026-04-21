from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.data_providers.imagery.mapillary import MapillaryProvider, MapillaryImage

router = APIRouter(prefix="/mapillary", tags=["mapillary"])


class ImageResponse(BaseModel):
    id: str
    lat: float
    lon: float
    thumb_url: Optional[str]
    captured_at: Optional[str]


@router.get("/images", response_model=list[ImageResponse])
async def get_images(
    west: float = Query(...),
    south: float = Query(...),
    east: float = Query(...),
    north: float = Query(...),
    limit: int = Query(100, ge=1, le=500),
):
    try:
        provider = MapillaryProvider()
        images = provider.fetch_images_by_bbox(west, south, east, north, limit)
        return [
            ImageResponse(
                id=img.id,
                lat=img.lat,
                lon=img.lon,
                thumb_url=img.thumb_url,
                captured_at=img.captured_at.isoformat() if img.captured_at else None,
            )
            for img in images
        ]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Mapillary error: {e}")
