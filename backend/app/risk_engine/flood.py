import numpy as np
from dataclasses import dataclass
from app.processing.terrain.analyzer import TerrainFeatures
from app.processing.weather.analyzer import WeatherFeatures
from app.processing.vision.analyzer import VisionSummary
from app.simulation.base import SimulationResult


@dataclass
class FloodRiskGrid:
    score: np.ndarray          # 0-1 per cell
    category: np.ndarray       # 0=none, 1=low, 2=medium, 3=high, 4=extreme
    components: dict           # factor breakdown for explainability


class FloodRiskEngine:
    """
    Fuses terrain + weather + CV + simulation into a flood risk score.
    Each factor is scored 0-1 and weighted. Weights tunable per region.
    """

    WEIGHTS = {
        "terrain": 0.30,
        "weather": 0.35,
        "simulation": 0.25,  # only effective if engine != null
        "vision": 0.10,
    }

    def compute(
        self,
        terrain: TerrainFeatures,
        weather: WeatherFeatures,
        vision: VisionSummary,
        simulation: SimulationResult,
    ) -> FloodRiskGrid:
        shape = terrain.elevation.shape

        # --- Terrain score (per cell) ---
        elev_norm = 1.0 - self._normalize(terrain.elevation)
        slope_flat = 1.0 - np.clip(terrain.slope_deg / 30.0, 0, 1)
        flow_norm = self._normalize(np.log1p(terrain.flow_accumulation))
        terrain_score = 0.4 * elev_norm + 0.3 * slope_flat + 0.3 * flow_norm

        # --- Weather score (scalar → broadcast) ---
        weather_score = np.full(shape, weather.flood_trigger_score)

        # --- Simulation score (per cell or broadcast) ---
        if simulation.engine_used != "null" and simulation.flood_extent_array is not None:
            sim_score = np.clip(
                self._resize_to(simulation.flood_extent_array, shape), 0, 1
            )
        elif simulation.flood_depth_array is not None:
            sim_score = np.clip(
                self._normalize(self._resize_to(simulation.flood_depth_array, shape)), 0, 1
            )
        else:
            # NullEngine: use its extent as a weaker prior
            sim_score = np.clip(
                self._resize_to(simulation.flood_extent_array, shape) * 0.5, 0, 1
            )

        # --- Vision correction (scalar → broadcast) ---
        # High impervious surfaces increase runoff
        vision_score = np.full(shape, vision.mean_impervious * 0.7 + vision.standing_water_pct * 0.3)

        # Adjust weights if null engine
        w = self.WEIGHTS.copy()
        if simulation.engine_used == "null":
            extra = w["simulation"]
            w["terrain"] += extra * 0.5
            w["weather"] += extra * 0.5
            w["simulation"] = 0.0

        combined = (
            w["terrain"] * terrain_score
            + w["weather"] * weather_score
            + w["simulation"] * sim_score
            + w["vision"] * vision_score
        )
        combined = np.clip(combined, 0, 1)

        category = np.digitize(combined, bins=[0.2, 0.4, 0.6, 0.8]).astype(int)

        return FloodRiskGrid(
            score=combined,
            category=category,
            components={
                "terrain_weight": w["terrain"],
                "weather_weight": w["weather"],
                "simulation_weight": w["simulation"],
                "vision_weight": w["vision"],
                "mean_terrain_score": float(terrain_score.mean()),
                "weather_score": float(weather.flood_trigger_score),
                "mean_sim_score": float(sim_score.mean()),
                "vision_impervious": float(vision.mean_impervious),
                "engine": simulation.engine_used,
            },
        )

    def _normalize(self, arr: np.ndarray) -> np.ndarray:
        mn, mx = arr.min(), arr.max()
        if mx == mn:
            return np.zeros_like(arr, dtype=float)
        return (arr - mn) / (mx - mn)

    def _resize_to(self, arr: np.ndarray, shape: tuple) -> np.ndarray:
        if arr.shape == shape:
            return arr
        from scipy.ndimage import zoom
        factors = (shape[0] / arr.shape[0], shape[1] / arr.shape[1])
        return zoom(arr, factors, order=1)
