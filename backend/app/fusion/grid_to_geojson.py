import numpy as np
from app.schemas.analysis import RiskLayer


def grid_to_geojson_polygons(
    score: np.ndarray,
    category: np.ndarray,
    components: dict,
    bbox: list[float],
    resolution_m: float,
    risk_type: str,
    simplify_threshold: float = 0.4,  # only export cells above this score
) -> list[RiskLayer]:
    """
    Converts a numpy risk grid to a list of GeoJSON polygon features.
    Each cell becomes a polygon. Cells below threshold are skipped.
    For production: use rasterio/shapely contour polygons instead.
    """
    west, south, east, north = bbox
    rows, cols = score.shape

    lat_step = (north - south) / rows
    lon_step = (east - west) / cols

    layers = []
    for r in range(rows):
        for c in range(cols):
            s = float(score[r, c])
            if s < simplify_threshold:
                continue

            lat0 = north - r * lat_step
            lat1 = lat0 - lat_step
            lon0 = west + c * lon_step
            lon1 = lon0 + lon_step

            polygon = {
                "type": "Polygon",
                "coordinates": [[
                    [lon0, lat0], [lon1, lat0],
                    [lon1, lat1], [lon0, lat1],
                    [lon0, lat0],
                ]],
            }

            layers.append(RiskLayer(
                risk_type=risk_type,
                score=round(s, 3),
                geometry=polygon,
                components={**components, "category": int(category[r, c])},
            ))

    return layers
