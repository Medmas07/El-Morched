from app.data_providers.dem.base import DEMProvider
from app.data_providers.dem.srtm import SRTMProvider
from app.core.config import settings


def get_dem_provider() -> DEMProvider:
    providers = {
        "srtm": SRTMProvider,
        # "copernicus": CopernicusProvider,  # add when needed
    }
    cls = providers.get(settings.DEM_PROVIDER, SRTMProvider)
    return cls()
