from abc import ABC, abstractmethod
from dataclasses import dataclass
import numpy as np


@dataclass
class DEMData:
    elevation: np.ndarray     # 2D elevation grid (meters)
    resolution_m: float
    bbox: list[float]         # [west, south, east, north]
    provider: str
    crs: str = "EPSG:4326"


class DEMProvider(ABC):
    @abstractmethod
    def fetch(self, west: float, south: float, east: float, north: float) -> DEMData:
        ...
