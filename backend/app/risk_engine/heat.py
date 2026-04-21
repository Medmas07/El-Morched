import numpy as np
from dataclasses import dataclass
from app.processing.terrain.analyzer import TerrainFeatures
from app.processing.weather.analyzer import WeatherFeatures
from app.processing.vision.analyzer import VisionSummary


@dataclass
class HeatRiskGrid:
    score: np.ndarray
    category: np.ndarray
    components: dict


class HeatRiskEngine:
    """
    Urban Heat Island + vulnerability scoring.
    Equity indicators: areas with dense impervious surface + low vegetation
    + high temp are flagged as high heat vulnerability zones.
    """

    def compute(
        self,
        terrain: TerrainFeatures,
        weather: WeatherFeatures,
        vision: VisionSummary,
    ) -> HeatRiskGrid:
        shape = terrain.elevation.shape

        # Higher elevation = slightly cooler (lapse rate ~6.5°C/km)
        elev_norm = terrain.elevation / (terrain.elevation.max() + 1e-9)
        elevation_cooling = np.clip(elev_norm * 0.1, 0, 0.1)  # small correction

        # Urban heat island proxy from vision
        uhi_proxy = np.full(shape, vision.mean_impervious)

        # Vegetation cooling: trees reduce surface temp
        veg_cooling = np.full(shape, vision.mean_vegetation * 0.3)

        # Shadow cooling
        shadow_cooling = np.full(shape, vision.mean_shadow * 0.2)

        # Weather baseline
        temp_score = np.full(shape, weather.heat_stress_score)

        # Combine
        heat_score = np.clip(
            temp_score + uhi_proxy * 0.3 - veg_cooling - shadow_cooling - elevation_cooling,
            0, 1
        )

        category = np.digitize(heat_score, bins=[0.2, 0.4, 0.6, 0.8]).astype(int)

        return HeatRiskGrid(
            score=heat_score,
            category=category,
            components={
                "mean_temp_c": weather.mean_temp_c,
                "heat_stress_score": weather.heat_stress_score,
                "uhi_proxy": float(vision.mean_impervious),
                "vegetation_coverage": float(vision.mean_vegetation),
                "shadow_coverage": float(vision.mean_shadow),
                "mean_heat_score": float(heat_score.mean()),
            },
        )
