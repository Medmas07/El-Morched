from app.data_providers.weather.base import WeatherProvider
from app.data_providers.weather.open_meteo import OpenMeteoProvider
from app.core.config import settings


def get_weather_provider() -> WeatherProvider:
    providers = {
        "open_meteo": OpenMeteoProvider,
        # "openweather": OpenWeatherProvider,  # add when needed
    }
    cls = providers.get(settings.WEATHER_PROVIDER, OpenMeteoProvider)
    return cls()
