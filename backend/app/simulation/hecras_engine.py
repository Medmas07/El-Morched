import httpx
from app.simulation.base import SimulationEngine, SimulationInput, SimulationResult
from app.core.config import settings
import numpy as np


class HecRasEngine(SimulationEngine):
    """
    Connects to the HEC-RAS MCP server.
    Requires HECRAS_MCP_URL and a running MCP server instance.
    """

    name = "hecras"

    def is_available(self) -> bool:
        if not settings.HECRAS_MCP_URL:
            return False
        try:
            r = httpx.get(f"{settings.HECRAS_MCP_URL}/health", timeout=3)
            return r.status_code == 200
        except Exception:
            return False

    def run(self, input_data: SimulationInput) -> SimulationResult:
        payload = {
            "dem": input_data.dem_array.tolist(),
            "slope": input_data.slope_array.tolist(),
            "rainfall_mm": input_data.rainfall_mm,
            "rainfall_intensity": input_data.rainfall_intensity,
            "bbox": input_data.bbox,
            "resolution_m": input_data.resolution_m,
        }

        with httpx.Client(timeout=120) as client:
            response = client.post(
                f"{settings.HECRAS_MCP_URL}/simulate",
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

        return SimulationResult(
            flood_depth_array=np.array(data["flood_depth"]),
            flood_extent_array=np.array(data["flood_extent"]),
            inundation_pct=data["inundation_pct"],
            engine_used=self.name,
            metadata=data.get("metadata", {}),
        )
