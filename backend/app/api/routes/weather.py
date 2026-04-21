from fastapi import APIRouter, Query
from pydantic import BaseModel
from app.data_providers.weather.factory import get_weather_provider

router = APIRouter(prefix="/weather", tags=["weather"])


class WeatherResponse(BaseModel):
    total_rainfall_mm: float
    peak_intensity_mm_hr: float
    mean_temp_c: float
    provider: str
    record_count: int


@router.get("", response_model=WeatherResponse)
async def get_weather(
    lat: float = Query(...),
    lon: float = Query(...),
    days_back: int = Query(7, ge=1, le=90),
):
    provider = get_weather_provider()
    summary = provider.fetch_historical(lat, lon, days_back)
    return WeatherResponse(
        total_rainfall_mm=summary.total_rainfall_mm,
        peak_intensity_mm_hr=summary.peak_intensity_mm_hr,
        mean_temp_c=summary.mean_temp_c,
        provider=summary.provider,
        record_count=len(summary.records),
    )
