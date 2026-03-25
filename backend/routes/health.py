from flask import Blueprint, jsonify
import os, time
from services.image_processing import get_model

health_bp = Blueprint('health', __name__)
START_TIME = time.time()

@health_bp.route('/health', methods=['GET'])
def health():
    model_ok = False
    try:
        get_model()
        model_ok = True
    except Exception:
        pass

    return jsonify({
        "status": "ok",
        "uptime_seconds": round(time.time() - START_TIME),
        "model_loaded": model_ok,
        "api_keys_present": {
            "openweather": bool(os.getenv("OPENWEATHER_API_KEY")),
            "agro": bool(os.getenv("AGRO_API_KEY")),
        }
    })