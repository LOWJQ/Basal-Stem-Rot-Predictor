import requests
import os
from dotenv import load_dotenv
import logging
import time
from concurrent.futures import ThreadPoolExecutor

load_dotenv()
logger = logging.getLogger(__name__)

OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY")
AGRO_API_KEY = os.getenv("AGRO_API_KEY")
REQUEST_TIMEOUT_SECONDS = 5
ENV_REQUEST_EXECUTOR = ThreadPoolExecutor(max_workers=8)


def get_weather(lat, lon):
    try:
        url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={OPENWEATHER_API_KEY}&units=metric"
        res = requests.get(url, timeout=REQUEST_TIMEOUT_SECONDS)
        res.raise_for_status()
        data = res.json()
        return {
            "temperature": data["main"]["temp"],
            "humidity": data["main"]["humidity"],
        }
    except Exception as e:
        logger.warning(f"Weather API failed for ({lat},{lon}): {e} — using defaults")
        return {"temperature": 30, "humidity": 70}


def get_soil(lat, lon):
    try:
        url = f"http://api.agromonitoring.com/agro/1.0/soil?lat={lat}&lon={lon}&appid={AGRO_API_KEY}"
        res = requests.get(url, timeout=REQUEST_TIMEOUT_SECONDS)
        res.raise_for_status()
        data = res.json()
        return {"soil_moisture": data["moisture"]}
    except Exception as e:
        logger.warning(f"Soil API failed for ({lat},{lon}): {e} — using defaults")
        return {"soil_moisture": 0.2}


def get_environmental_data(lat, lon):
    weather_future = ENV_REQUEST_EXECUTOR.submit(get_weather, lat, lon)
    soil_future = ENV_REQUEST_EXECUTOR.submit(get_soil, lat, lon)

    weather = weather_future.result()
    soil = soil_future.result()

    return {
        "temperature": round(weather["temperature"], 3),
        "humidity": round(weather["humidity"], 3),
        "soil_moisture": round(soil["soil_moisture"], 3),
    }


cache = {}
CACHE_TTL = 900


def get_env_cached(lat, lon):
    key = (round(lat, 4), round(lon, 4))
    now = time.time()

    if key in cache and (now - cache[key]["timestamp"]) < CACHE_TTL:
        return cache[key]["data"]

    data = get_environmental_data(lat, lon)
    cache[key] = {"data": data, "timestamp": now}
    return data
