from dataclasses import dataclass
from app.data_providers.weather.base import WeatherSummary


@dataclass
class WeatherFeatures:
    total_rainfall_mm: float
    peak_intensity_mm_hr: float
    mean_temp_c: float
    drought_days: int           # consecutive dry days before event
    heat_stress_score: float    # 0-1 composite heat indicator
    flood_trigger_score: float  # 0-1 rainfall-driven flood trigger


class WeatherAnalyzer:
    # Thresholds (can be made configurable)
    HEAVY_RAIN_THRESHOLD = 50.0   # mm/day considered heavy
    EXTREME_RAIN_THRESHOLD = 100.0
    HIGH_TEMP_THRESHOLD = 35.0
    HIGH_HUMIDITY_THRESHOLD = 70.0

    def process(self, summary: WeatherSummary) -> WeatherFeatures:
        # Count consecutive dry days at end of record
        drought = self._drought_days(summary)

        heat_stress = self._heat_stress(summary)
        flood_trigger = self._flood_trigger(summary)

        return WeatherFeatures(
            total_rainfall_mm=summary.total_rainfall_mm,
            peak_intensity_mm_hr=summary.peak_intensity_mm_hr,
            mean_temp_c=summary.mean_temp_c,
            drought_days=drought,
            heat_stress_score=heat_stress,
            flood_trigger_score=flood_trigger,
        )

    def _drought_days(self, summary: WeatherSummary) -> int:
        # Group hourly records into days and count trailing zero-rain days
        from collections import defaultdict
        daily: dict[str, float] = defaultdict(float)
        for r in summary.records:
            key = r.timestamp.date().isoformat()
            daily[key] += r.rainfall_mm

        count = 0
        for rain in reversed(list(daily.values())):
            if rain < 1.0:
                count += 1
            else:
                break
        return count

    def _heat_stress(self, summary: WeatherSummary) -> float:
        if not summary.records:
            return 0.0
        hot_hours = sum(
            1 for r in summary.records if r.temperature_c >= self.HIGH_TEMP_THRESHOLD
        )
        humid_hours = sum(
            1 for r in summary.records if r.humidity_pct >= self.HIGH_HUMIDITY_THRESHOLD
        )
        n = len(summary.records)
        temp_score = min(hot_hours / n, 1.0)
        humid_score = min(humid_hours / n, 1.0)
        return round(0.6 * temp_score + 0.4 * humid_score, 3)

    def _flood_trigger(self, summary: WeatherSummary) -> float:
        rain = summary.total_rainfall_mm
        intensity = summary.peak_intensity_mm_hr
        rain_score = min(rain / self.EXTREME_RAIN_THRESHOLD, 1.0)
        intensity_score = min(intensity / 30.0, 1.0)  # 30 mm/hr = extreme
        return round(0.5 * rain_score + 0.5 * intensity_score, 3)
