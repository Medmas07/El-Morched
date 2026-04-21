-- PostGIS extension required
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── PROJECTS ────────────────────────────────────────────────────────────────
CREATE TABLE projects (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     TEXT NOT NULL,                   -- Supabase auth user ID
    name        TEXT NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── AREAS OF INTEREST ───────────────────────────────────────────────────────
CREATE TABLE areas_of_interest (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
    geometry    GEOMETRY(POLYGON, 4326) NOT NULL,
    bbox        JSONB NOT NULL,  -- {west, south, east, north}
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX aoi_geom_idx ON areas_of_interest USING GIST (geometry);

-- ── WEATHER DATA ────────────────────────────────────────────────────────────
CREATE TABLE weather_data (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    aoi_id          UUID REFERENCES areas_of_interest(id) ON DELETE CASCADE,
    provider        TEXT NOT NULL,
    timestamp       TIMESTAMPTZ NOT NULL,
    rainfall_mm     FLOAT,
    temperature_c   FLOAT,
    humidity_pct    FLOAT,
    wind_speed_ms   FLOAT,
    raw             JSONB
);
CREATE INDEX weather_aoi_time_idx ON weather_data (aoi_id, timestamp);

-- ── TERRAIN DATA ────────────────────────────────────────────────────────────
CREATE TABLE terrain_data (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    aoi_id        UUID REFERENCES areas_of_interest(id) ON DELETE CASCADE,
    provider      TEXT NOT NULL,
    resolution_m  FLOAT,
    stats         JSONB,  -- {min_elev, max_elev, mean_slope, flat_area_pct, ...}
    raster_path   TEXT    -- optional: path to stored DEM file
);

-- ── MAPILLARY IMAGE METADATA ────────────────────────────────────────────────
CREATE TABLE image_metadata (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    aoi_id        UUID REFERENCES areas_of_interest(id) ON DELETE CASCADE,
    mapillary_id  TEXT UNIQUE NOT NULL,
    lat           FLOAT NOT NULL,
    lon           FLOAT NOT NULL,
    location      GEOMETRY(POINT, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lon, lat), 4326)) STORED,
    captured_at   TIMESTAMPTZ,
    cv_features   JSONB  -- {vegetation_score, impervious_score, shadow_score, surface_type, ...}
);
CREATE INDEX img_location_idx ON image_metadata USING GIST (location);
CREATE INDEX img_aoi_idx ON image_metadata (aoi_id);

-- ── ANALYSIS RUNS ───────────────────────────────────────────────────────────
CREATE TYPE analysis_status AS ENUM ('pending', 'running', 'completed', 'failed');

CREATE TABLE analysis_runs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    aoi_id              UUID REFERENCES areas_of_interest(id) ON DELETE CASCADE,
    status              analysis_status DEFAULT 'pending',
    simulation_engine   TEXT DEFAULT 'null',
    config_snapshot     JSONB,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    completed_at        TIMESTAMPTZ,
    error               TEXT
);

-- ── RISK RESULTS ────────────────────────────────────────────────────────────
CREATE TABLE risk_results (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id      UUID REFERENCES analysis_runs(id) ON DELETE CASCADE,
    risk_type   TEXT NOT NULL CHECK (risk_type IN ('flood', 'heat')),
    geometry    GEOMETRY(POLYGON, 4326),
    score       FLOAT NOT NULL CHECK (score BETWEEN 0 AND 1),
    components  JSONB,  -- factor breakdown
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX risk_geom_idx ON risk_results USING GIST (geometry);
CREATE INDEX risk_run_idx ON risk_results (run_id, risk_type);
