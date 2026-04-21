from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional
import numpy as np


@dataclass
class SimulationInput:
    dem_array: np.ndarray          # elevation grid (m)
    slope_array: np.ndarray        # slope grid (degrees)
    rainfall_mm: float             # total rainfall accumulation
    rainfall_intensity: float      # mm/hr peak
    bbox: list[float]              # [west, south, east, north]
    resolution_m: float = 30.0


@dataclass
class SimulationResult:
    flood_depth_array: Optional[np.ndarray]   # water depth per cell (m)
    flood_extent_array: Optional[np.ndarray]  # binary flood mask
    inundation_pct: float                     # % area flooded
    engine_used: str
    metadata: dict


class SimulationEngine(ABC):
    """Abstract interface for all simulation engines."""

    @abstractmethod
    def is_available(self) -> bool:
        """Check if this engine can run (deps installed, server up, etc.)"""
        ...

    @abstractmethod
    def run(self, input_data: SimulationInput) -> SimulationResult:
        """Execute simulation and return results."""
        ...

    @property
    @abstractmethod
    def name(self) -> str:
        ...
