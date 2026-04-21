"""
Main analysis pipeline — orchestrates all data fetching, processing, and risk scoring.
Returns GeoJSON-ready risk layers.
"""
import numpy as np
from uuid import UUID
from app.schemas.analysis import AnalysisRequest, AnalysisResult, RiskLayer
from app.data_providers.weather.factory import get_weather_provider
from app.data_providers.dem.factory import get_dem_provider
from app.data_providers.imagery.mapillary import MapillaryProvider
from app.processing.terrain.analyzer import TerrainAnalyzer
from app.processing.weather.analyzer import WeatherAnalyzer
from app.processing.vision.analyzer import VisionAnalyzer
from app.simulation.factory import get_simulation_engine
from app.simulation.base import SimulationInput
from app.risk_engine.flood import FloodRiskEngine
from app.risk_engine.heat import HeatRiskEngine
from app.fusion.grid_to_geojson import grid_to_geojson_polygons


class AnalysisPipeline:
    def __init__(self, engine_override: str | None = None):
        self.engine_override = engine_override

    async def run(self, request: AnalysisRequest, run_id: UUID) -> AnalysisResult:
        bbox = request.bbox
        cx = (bbox.west + bbox.east) / 2
        cy = (bbox.south + bbox.north) / 2

        # ── 1. DATA FETCHING ────────────────────────────────────────────────
        weather_prov = get_weather_provider()
        weather_summary = weather_prov.fetch_historical(cy, cx, request.weather_days_back)

        dem_prov = get_dem_provider()
        dem_data = dem_prov.fetch(bbox.west, bbox.south, bbox.east, bbox.north)

        mapillary = MapillaryProvider()
        images = mapillary.fetch_images_by_bbox(
            bbox.west, bbox.south, bbox.east, bbox.north, limit=100
        )

        # ── 2. PROCESSING ───────────────────────────────────────────────────
        terrain_features = TerrainAnalyzer().process(dem_data)
        weather_features = WeatherAnalyzer().process(weather_summary)
        vision_summary = VisionAnalyzer().process(images)

        # ── 3. SIMULATION ───────────────────────────────────────────────────
        engine = get_simulation_engine(self.engine_override)
        sim_input = SimulationInput(
            dem_array=terrain_features.elevation,
            slope_array=terrain_features.slope_deg,
            rainfall_mm=weather_features.total_rainfall_mm,
            rainfall_intensity=weather_features.peak_intensity_mm_hr,
            bbox=bbox.to_list(),
            resolution_m=dem_data.resolution_m,
        )
        sim_result = engine.run(sim_input)

        # ── 4. RISK SCORING ─────────────────────────────────────────────────
        flood_grid = FloodRiskEngine().compute(
            terrain_features, weather_features, vision_summary, sim_result
        )
        heat_grid = HeatRiskEngine().compute(
            terrain_features, weather_features, vision_summary
        )

        # ── 5. EXPORT TO GEOJSON ────────────────────────────────────────────
        flood_layers = grid_to_geojson_polygons(
            flood_grid.score, flood_grid.category, flood_grid.components,
            bbox.to_list(), dem_data.resolution_m, risk_type="flood"
        )
        heat_layers = grid_to_geojson_polygons(
            heat_grid.score, heat_grid.category, heat_grid.components,
            bbox.to_list(), dem_data.resolution_m, risk_type="heat"
        )

        return AnalysisResult(
            run_id=run_id,
            status="completed",
            flood_layers=flood_layers,
            heat_layers=heat_layers,
            image_count=len(images),
            simulation_engine_used=engine.name,
        )
