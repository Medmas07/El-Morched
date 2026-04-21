import numpy as np
from app.simulation.base import SimulationEngine, SimulationInput, SimulationResult


class NullEngine(SimulationEngine):
    """
    Fallback engine used when HEC-RAS is unavailable.
    Uses a simplified terrain-based flood estimation:
    cells with low elevation + high slope accumulation get flagged.
    This is NOT physically accurate — it's a statistical proxy.
    """

    name = "null"

    def is_available(self) -> bool:
        return True

    def run(self, input_data: SimulationInput) -> SimulationResult:
        dem = input_data.dem_array
        slope = input_data.slope_array
        rainfall = input_data.rainfall_mm

        # Normalize elevation (low areas collect water)
        elev_norm = 1.0 - (dem - dem.min()) / (dem.max() - dem.min() + 1e-9)

        # Flat areas accumulate more (low slope = pooling)
        slope_norm = 1.0 - np.clip(slope / 45.0, 0, 1)

        # Combined flood susceptibility proxy
        susceptibility = 0.6 * elev_norm + 0.4 * slope_norm

        # Rainfall scales the threshold
        threshold = max(0.3, 0.7 - (rainfall / 200.0))
        flood_extent = (susceptibility > threshold).astype(float)

        # Depth proxy: proportional to susceptibility above threshold
        flood_depth = np.where(
            flood_extent > 0,
            (susceptibility - threshold) * (rainfall / 100.0),
            0.0,
        )

        inundation_pct = float(flood_extent.mean() * 100)

        return SimulationResult(
            flood_depth_array=flood_depth,
            flood_extent_array=flood_extent,
            inundation_pct=inundation_pct,
            engine_used=self.name,
            metadata={"note": "statistical proxy, not physics-based"},
        )
