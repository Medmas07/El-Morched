# GeoAI Risk Engine — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (Next.js)                         │
│   ┌──────────────┐   ┌─────────────────┐   ┌───────────────────┐  │
│   │  RiskMap     │   │  ControlPanel   │   │  Mapillary Viewer │  │
│   │  (Leaflet)   │   │  (AOI select,   │   │  (image popup)    │  │
│   │              │   │   layer switch) │   │                   │  │
│   └──────┬───────┘   └────────┬────────┘   └──────────────────-┘  │
│          └────────────────────┘                                     │
│                       Zustand store                                  │
│                       api.ts (fetch wrapper)                        │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTP (REST)
┌────────────────────────────▼────────────────────────────────────────┐
│                        BACKEND (FastAPI)                            │
│                                                                     │
│  Routes: /analysis/run → /analysis/{id} → /mapillary → /weather    │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │                   AnalysisPipeline                         │    │
│  │                                                            │    │
│  │  [DATA PROVIDERS]          [PROCESSING]                   │    │
│  │  MapillaryProvider    →    VisionAnalyzer (CLIP/mock)      │    │
│  │  WeatherProvider      →    WeatherAnalyzer                 │    │
│  │  DEMProvider          →    TerrainAnalyzer (slope/flow)    │    │
│  │                                                            │    │
│  │  [SIMULATION]              [RISK ENGINE]                  │    │
│  │  SimulationEngine ──────→  FloodRiskEngine                │    │
│  │  (HecRasEngine or          (terrain + weather + sim + cv) │    │
│  │   NullEngine)         →    HeatRiskEngine (UHI proxy)     │    │
│  │                                                            │    │
│  │  [FUSION]                                                 │    │
│  │  grid_to_geojson → GeoJSON polygons → API response        │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                     │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ asyncpg
┌──────────────────────▼──────────────────────────────────────────────┐
│               PostgreSQL + PostGIS                                  │
│  projects / areas_of_interest / weather_data / terrain_data /      │
│  image_metadata / analysis_runs / risk_results                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Pipeline

```
User selects bbox
       │
       ├── Mapillary API ──── image IDs + coords ──────┐
       │                      (never raw files)        │
       ├── Weather API ─────── hourly records ──────────┤
       │   (Open-Meteo)        7-90 days history        │
       │                                                │
       └── DEM API ──────────── elevation grid ─────────┤
           (SRTM/OpenTopo)      30m resolution          │
                                                        │
                    ┌───────────────────────────────────┘
                    │
                    ▼ PROCESSING
           VisionAnalyzer      → vegetation_score, impervious_score,
                                 shadow_score, standing_water
           WeatherAnalyzer     → flood_trigger_score, heat_stress_score,
                                 drought_days
           TerrainAnalyzer     → slope_deg, flow_accumulation, elev_stats
                    │
                    ▼ SIMULATION (optional)
           HecRasEngine        → flood_depth_array, flood_extent_array
             OR
           NullEngine          → statistical proxy (terrain + rainfall)
                    │
                    ▼ RISK FUSION
           FloodRiskEngine     → per-cell score (weighted sum)
                                 terrain 30% + weather 35% + sim 25% + vision 10%
                                 (weights shift when NullEngine is used)
           HeatRiskEngine      → UHI proxy: impervious + temp + humidity
                                 corrected by vegetation and shadow
                    │
                    ▼ OUTPUT
           GeoJSON polygon grid → frontend map layers
```

---

## Simulation Abstraction

```python
SimulationEngine (ABC)
├── is_available() → bool
├── run(SimulationInput) → SimulationResult
└── name: str

HecRasEngine   # calls MCP server at HECRAS_MCP_URL
NullEngine     # terrain-based statistical proxy (always available)

factory.get_simulation_engine(override?)
  → tries requested engine
  → falls back to NullEngine if unavailable
```

To add a new engine: create `app/simulation/myengine.py`, implement the ABC,
add to the `engines` dict in `factory.py`. Zero other changes needed.

---

## Extensibility Map

| What to swap       | Where to touch                                     |
|--------------------|---------------------------------------------------|
| Weather provider   | `data_providers/weather/factory.py` + new file    |
| DEM provider       | `data_providers/dem/factory.py` + new file        |
| Simulation engine  | `simulation/factory.py` + new file                |
| CV model           | `processing/vision/analyzer.py` (`_analyze_image`)|
| Risk weights       | `risk_engine/flood.py::WEIGHTS`                   |
| Image provider     | `data_providers/imagery/` + new class             |

---

## API Reference

| Method | Endpoint                        | Description                    |
|--------|---------------------------------|--------------------------------|
| POST   | /api/v1/analysis/run            | Start analysis, returns run_id |
| GET    | /api/v1/analysis/{run_id}       | Poll status / get results      |
| GET    | /api/v1/mapillary/images?bbox=  | Fetch image metadata by bbox   |
| GET    | /api/v1/weather?lat=&lon=       | Fetch weather summary          |
| GET    | /health                         | Engine health check            |

---

## Quick Start

```bash
# 1. Backend
cd backend
cp .env.example .env
# Fill MAPILLARY_ACCESS_TOKEN at minimum
pip install -r requirements.txt
uvicorn app.main:app --reload

# 2. Frontend
cd frontend
npm install
npm run dev

# 3. Database only (Docker)
cd infra
docker compose up db
```

## Environment Switches

| Variable           | Options              | Default     |
|--------------------|----------------------|-------------|
| SIMULATION_ENGINE  | null / hecras        | null        |
| WEATHER_PROVIDER   | open_meteo           | open_meteo  |
| DEM_PROVIDER       | srtm                 | srtm        |
| CV_MODEL           | mock / clip          | mock        |
