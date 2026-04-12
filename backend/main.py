import logging
import os
import threading

from dotenv import load_dotenv

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix
from routes.predict import predict_bp
from routes.health import health_bp
from routes.history import history_bp
from routes.lands import lands_bp
from routes.agent import agent_bp
from services.database import init_db
from services.image_processing import get_model

DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://basal-stem-rot-predictor.onrender.com",
]


def create_app():
    app = Flask(__name__)
    app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

    frames_dir = os.path.join(os.path.dirname(__file__), "output", "frames")
    os.makedirs(frames_dir, exist_ok=True)

    app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

    configured_origins = os.environ.get("CORS_ORIGINS", "")
    allowed_origins = [
        origin.strip()
        for origin in configured_origins.split(",")
        if origin.strip()
    ] or DEFAULT_CORS_ORIGINS

    CORS(
        app,
        resources={r"/*": {"origins": allowed_origins}},
        supports_credentials=False,
        methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Device-Id"],
    )

    app.register_blueprint(predict_bp)
    app.register_blueprint(health_bp)
    app.register_blueprint(history_bp)
    app.register_blueprint(lands_bp)
    app.register_blueprint(agent_bp)

    @app.route("/outputs/<path:filename>")
    def serve_outputs(filename):
        return send_from_directory("output", filename)

    @app.errorhandler(413)
    def too_large(e):
        return jsonify({"error": "File too large. Max 10MB allowed."}), 413

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Endpoint not found"}), 404

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"error": "Internal server error"}), 500

    init_db()

    def _warm_model():
        try:
            get_model()
        except Exception:
            pass

    threading.Thread(target=_warm_model, daemon=True).start()

    return app


app = create_app()

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 5000)),
        debug=False,
        threaded=True,
    )
