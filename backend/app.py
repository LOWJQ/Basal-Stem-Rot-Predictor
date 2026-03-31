import logging
import os
import shutil

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from routes.predict import predict_bp
from routes.health import health_bp
from routes.history import history_bp
from services.database import init_db


def create_app():
    app = Flask(__name__)

    frames_dir = os.path.join(os.path.dirname(__file__), "output", "frames")
    if os.path.exists(frames_dir):
        shutil.rmtree(frames_dir)
    os.makedirs(frames_dir, exist_ok=True)

    app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

    CORS(app)

    app.register_blueprint(predict_bp)
    app.register_blueprint(health_bp)
    app.register_blueprint(history_bp)

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

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)

