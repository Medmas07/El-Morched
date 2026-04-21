import numpy as np
from dataclasses import dataclass
from app.data_providers.dem.base import DEMData


@dataclass
class TerrainFeatures:
    elevation: np.ndarray
    slope_deg: np.ndarray
    flow_accumulation: np.ndarray  # proxy for drainage
    stats: dict


class TerrainAnalyzer:
    def process(self, dem: DEMData) -> TerrainFeatures:
        elev = dem.elevation.copy()

        # Fill NaN with mean for processing
        nan_mask = np.isnan(elev)
        elev[nan_mask] = np.nanmean(elev)

        slope = self._compute_slope(elev, dem.resolution_m)
        flow_acc = self._flow_accumulation(elev)

        stats = {
            "min_elevation_m": float(np.nanmin(dem.elevation)),
            "max_elevation_m": float(np.nanmax(dem.elevation)),
            "mean_elevation_m": float(np.nanmean(dem.elevation)),
            "mean_slope_deg": float(np.mean(slope)),
            "flat_area_pct": float((slope < 2.0).mean() * 100),
        }

        return TerrainFeatures(
            elevation=elev,
            slope_deg=slope,
            flow_accumulation=flow_acc,
            stats=stats,
        )

    def _compute_slope(self, elev: np.ndarray, res_m: float) -> np.ndarray:
        # Central difference gradient
        dy, dx = np.gradient(elev, res_m, res_m)
        slope_rad = np.arctan(np.sqrt(dx**2 + dy**2))
        return np.degrees(slope_rad)

    def _flow_accumulation(self, elev: np.ndarray) -> np.ndarray:
        # D8 simplified: count upslope cells (rough proxy)
        rows, cols = elev.shape
        acc = np.ones_like(elev)

        # Sort cells by elevation descending
        idx = np.argsort(elev.ravel())[::-1]
        flat = elev.ravel()

        neighbors = [(-1, -1), (-1, 0), (-1, 1),
                     (0, -1),           (0, 1),
                     (1, -1),  (1, 0),  (1, 1)]

        acc_flat = acc.ravel()
        for i in idx:
            r, c = divmod(i, cols)
            best_drop = 0
            best_j = None
            for dr, dc in neighbors:
                nr, nc = r + dr, c + dc
                if 0 <= nr < rows and 0 <= nc < cols:
                    j = nr * cols + nc
                    drop = flat[i] - flat[j]
                    if drop > best_drop:
                        best_drop = drop
                        best_j = j
            if best_j is not None:
                acc_flat[best_j] += acc_flat[i]

        return acc.reshape(rows, cols)
