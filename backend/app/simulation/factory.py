from app.simulation.base import SimulationEngine
from app.simulation.null_engine import NullEngine
from app.simulation.hecras_engine import HecRasEngine
from app.core.config import settings


def get_simulation_engine(override: str | None = None) -> SimulationEngine:
    """
    Returns the configured simulation engine.
    Falls back to NullEngine if the requested engine is unavailable.
    """
    requested = override or settings.SIMULATION_ENGINE

    engines: dict[str, type[SimulationEngine]] = {
        "hecras": HecRasEngine,
        "null": NullEngine,
    }

    engine_cls = engines.get(requested, NullEngine)
    engine = engine_cls()

    if not engine.is_available():
        fallback = NullEngine()
        return fallback

    return engine
