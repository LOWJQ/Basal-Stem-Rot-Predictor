import requests
import os
from dotenv import load_dotenv

load_dotenv()

OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY")
AGRO_API_KEY = os.getenv("AGRO_API_KEY")


def get_weather(lat, lon):
    try:
        url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={OPENWEATHER_API_KEY}&units=metric"
        res = requests.get(url)
        data = res.json()

        return {
            "temperature": data["main"]["temp"],
            "humidity": data["main"]["humidity"],
        }

    except Exception:
        return {"temperature": 30, "humidity": 70}


def get_soil(lat, lon):
    try:
        url = f"http://api.agromonitoring.com/agro/1.0/soil?lat={lat}&lon={lon}&appid={AGRO_API_KEY}"
        res = requests.get(url)
        data = res.json()

        return {"soil_moisture": data["moisture"]}

    except Exception:
        return {"soil_moisture": 0.2}


def get_environmental_data(lat, lon):
    weather = get_weather(lat, lon)
    soil = get_soil(lat, lon)

    return {
        "temperature": round(weather["temperature"], 3),
        "humidity": round(weather["humidity"], 3),
        "soil_moisture": round(soil["soil_moisture"], 3),
    }


cache = {}


def get_env_cached(lat, lon):
    key = (round(lat, 4), round(lon, 4))

    if key in cache:
        return cache[key]

    data = get_environmental_data(lat, lon)
    cache[key] = data

    return data
