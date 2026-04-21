from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime


@dataclass
class WeatherRecord:
    timestamp: datetime
    rainfall_mm: float
    temperature_c: float
    humidity_pct: float
    wind_speed_ms: float


@dataclass
class WeatherSummary:
    records: list[WeatherRecord]
    total_rainfall_mm: float
    peak_intensity_mm_hr: float
    mean_temp_c: float
    provider: str


class WeatherProvider(ABC):
    @abstractmethod
    def fetch_historical(
        self, lat: float, lon: float, days_back: int
    ) -> WeatherSummary:
        ...

    @abstractmethod
    def fetch_current(self, lat: float, lon: float) -> WeatherRecord:
        ...
