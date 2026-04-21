import httpx
from datetime import datetime, timedelta, timezone
from app.data_providers.weather.base import WeatherProvider, WeatherRecord, WeatherSummary


class OpenMeteoProvider(WeatherProvider):
    BASE = "https://api.open-meteo.com/v1"
    ARCHIVE_BASE = "https://archive-api.open-meteo.com/v1"

    def fetch_historical(self, lat: float, lon: float, days_back: int) -> WeatherSummary:
        end = datetime.now(timezone.utc).date()
        start = end - timedelta(days=days_back)

        params = {
            "latitude": lat,
            "longitude": lon,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "hourly": "precipitation,temperature_2m,relative_humidity_2m,wind_speed_10m",
            "timezone": "UTC",
        }

        with httpx.Client(timeout=30) as client:
            r = client.get(f"{self.ARCHIVE_BASE}/archive", params=params)
            r.raise_for_status()
            data = r.json()

        hourly = data["hourly"]
        records = []
        for i, ts in enumerate(hourly["time"]):
            records.append(WeatherRecord(
                timestamp=datetime.fromisoformat(ts),
                rainfall_mm=hourly["precipitation"][i] or 0.0,
                temperature_c=hourly["temperature_2m"][i] or 0.0,
                humidity_pct=hourly["relative_humidity_2m"][i] or 0.0,
                wind_speed_ms=hourly["wind_speed_10m"][i] or 0.0,
            ))

        total_rain = sum(r.rainfall_mm for r in records)
        # Peak intensity: max over any 1-hour window
        peak = max((r.rainfall_mm for r in records), default=0.0)
        mean_temp = sum(r.temperature_c for r in records) / max(len(records), 1)

        return WeatherSummary(
            records=records,
            total_rainfall_mm=total_rain,
            peak_intensity_mm_hr=peak,
            mean_temp_c=mean_temp,
            provider="open_meteo",
        )

    def fetch_current(self, lat: float, lon: float) -> WeatherRecord:
        params = {
            "latitude": lat,
            "longitude": lon,
            "current": "precipitation,temperature_2m,relative_humidity_2m,wind_speed_10m",
        }
        with httpx.Client(timeout=15) as client:
            r = client.get(f"{self.BASE}/forecast", params=params)
            r.raise_for_status()
            data = r.json()

        c = data["current"]
        return WeatherRecord(
            timestamp=datetime.fromisoformat(c["time"]),
            rainfall_mm=c.get("precipitation", 0.0) or 0.0,
            temperature_c=c.get("temperature_2m", 0.0) or 0.0,
            humidity_pct=c.get("relative_humidity_2m", 0.0) or 0.0,
            wind_speed_ms=c.get("wind_speed_10m", 0.0) or 0.0,
        )
